import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(rootDir, 'output');
const framesDir = resolve(outputDir, '.gif-frames');
const gifPath = resolve(outputDir, 'lego-techstack-disassemble.gif');
const port = Number(process.env.PORT || 4173);
const browserWSEndpoint = process.env.BROWSER_WS_ENDPOINT || '';
const width = Number(process.env.GIF_WIDTH || 1280);
const height = Number(process.env.GIF_HEIGHT || 820);
const frameCount = Number(process.env.GIF_FRAMES || 16);
const frameDuration = Number(process.env.GIF_FRAME_DURATION || 110);
const transparentCapture = process.env.GIF_TRANSPARENT !== '0';
const keepFrames = process.env.KEEP_GIF_FRAMES === '1';

const runNodeScript = (scriptPath) => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`Failed running ${scriptPath}`);
  }
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/?capture=1`, { cache: 'no-store' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the server is ready.
    }

    await delay(250);
  }

  throw new Error(`Preview server is not running on http://localhost:${port}/. Run "npm run preview" first.`);
};

const getFrameProgress = (index) => {
  return index / Math.max(1, frameCount - 1);
};

const main = async () => {
  const buildPath = resolve(rootDir, 'src/build.mjs');
  const encodePath = resolve(rootDir, 'src/encode-gif.py');

  if (!browserWSEndpoint) {
    throw new Error('BROWSER_WS_ENDPOINT is not set. Start the GIF export through src/render-gif.ps1 or provide a browser debugger endpoint.');
  }

  runNodeScript(buildPath);
  rmSync(framesDir, { recursive: true, force: true });
  rmSync(gifPath, { force: true });
  mkdirSync(framesDir, { recursive: true });

  try {
    await waitForServer();
    const browser = await puppeteer.connect({
      browserWSEndpoint
    });

    try {
      let page;

      try {
        page = await browser.newPage();
      } catch {
        const existingPages = await browser.pages();
        page = existingPages[0];
      }

      if (!page) {
        throw new Error('No browser page is available on the remote debugging session.');
      }

      await page.setViewport({
        width,
        height,
        deviceScaleFactor: 1
      });
      const previewUrl = new URL(`http://localhost:${port}/`);
      previewUrl.searchParams.set('capture', '1');
      previewUrl.searchParams.set('anim', 'disassemble');
      previewUrl.searchParams.set('progress', '0');
      if (transparentCapture) {
        previewUrl.searchParams.set('transparent', '1');
      }
      await page.goto(previewUrl.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await page.waitForFunction(
        () => window.__LEGO_READY === true && typeof window.__setDisassemblyProgress === 'function',
        { timeout: 30000 }
      );

      for (let index = 0; index < frameCount; index += 1) {
        console.log(`Rendering GIF frame ${index + 1}/${frameCount}`);
        const progress = getFrameProgress(index);
        const outputPath = join(framesDir, `frame-${String(index).padStart(3, '0')}.png`);
        await page.evaluate((value) => window.__setDisassemblyProgress(value), progress);
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );
        await page.screenshot({ path: outputPath, omitBackground: transparentCapture });
      }

      await page.close();
    } finally {
      browser.disconnect();
    }

    const encodeResult = spawnSync(
      'python',
      [encodePath, framesDir, gifPath, String(frameDuration)],
      {
        cwd: rootDir,
        stdio: 'inherit'
      }
    );

    if (encodeResult.status !== 0) {
      throw new Error('Failed to encode GIF with Pillow.');
    }
  } finally {
    if (!keepFrames) {
      rmSync(framesDir, { recursive: true, force: true });
    }
  }
};

await main();
