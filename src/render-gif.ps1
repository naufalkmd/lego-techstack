$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$port = if ($env:PORT) { [int]$env:PORT } else { 4173 }
$debugPort = if ($env:BROWSER_DEBUG_PORT) { [int]$env:BROWSER_DEBUG_PORT } else { Get-Random -Minimum 9222 -Maximum 9422 }
$profileDir = Join-Path $rootDir ("output\.gif-browser-profile-" + [Guid]::NewGuid().ToString("N"))

function Test-HttpReady {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-ForHttpReady {
  param(
    [string]$Url,
    [int]$Attempts = 60
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    if (Test-HttpReady $Url) {
      return
    }
    Start-Sleep -Milliseconds 250
  }

  throw "Timed out waiting for $Url"
}

function Wait-ForHttpReadyOrNull {
  param(
    [string]$Url,
    [int]$Attempts = 24
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    if (Test-HttpReady $Url) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }

  return $false
}

function Resolve-BrowserPath {
  $candidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "No supported Chrome/Edge executable found for GIF capture."
}

function Start-BrowserForCapture {
  param(
    [string]$BrowserPath,
    [string]$ProfileDir,
    [int]$DebugPort,
    [switch]$Headless
  )

  $args = @(
    "--remote-debugging-port=$DebugPort",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  )

  if ($Headless) {
    $args = @(
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--mute-audio"
    ) + $args
  }

  return Start-Process -FilePath $BrowserPath -ArgumentList $args -WorkingDirectory $rootDir -PassThru -WindowStyle Hidden
}

$serverProcess = $null
$browserProcess = $null
$startedServer = $false

try {
  if (-not (Test-HttpReady "http://localhost:$port/")) {
    $serverProcess = Start-Process -FilePath "node" -ArgumentList @("src/serve.mjs") -WorkingDirectory $rootDir -PassThru -WindowStyle Hidden
    $startedServer = $true
  }

  Wait-ForHttpReady "http://localhost:$port/"

  $browserPath = Resolve-BrowserPath
  $browserProcess = Start-BrowserForCapture -BrowserPath $browserPath -ProfileDir $profileDir -DebugPort $debugPort -Headless
  $debugReady = Wait-ForHttpReadyOrNull "http://127.0.0.1:$debugPort/json/version"

  if (-not $debugReady) {
    if ($browserProcess -and -not $browserProcess.HasExited) {
      Stop-Process -Id $browserProcess.Id -Force
    }

    Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
    $browserProcess = Start-BrowserForCapture -BrowserPath $browserPath -ProfileDir $profileDir -DebugPort $debugPort
    Wait-ForHttpReady "http://127.0.0.1:$debugPort/json/version"
  }

  $version = Invoke-RestMethod -UseBasicParsing "http://127.0.0.1:$debugPort/json/version"
  $env:BROWSER_WS_ENDPOINT = $version.webSocketDebuggerUrl

  & node "src/render-gif.mjs"
  if ($LASTEXITCODE -ne 0) {
    throw "node src/render-gif.mjs failed."
  }
} finally {
  if ($browserProcess -and -not $browserProcess.HasExited) {
    Stop-Process -Id $browserProcess.Id -Force
  }

  if ($startedServer -and $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }

  if (Test-Path $profileDir) {
    Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
  }
}
