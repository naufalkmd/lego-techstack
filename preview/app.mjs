import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const searchParams = new URLSearchParams(window.location.search);
const captureMode = searchParams.get('capture') === '1';
const transparentMode = searchParams.get('transparent') === '1';
const animationMode = searchParams.get('anim') || '';
const initialProgressValue = Number.parseFloat(searchParams.get('progress') || '');
let controlledProgress = Number.isFinite(initialProgressValue)
  ? Math.max(0, Math.min(1, initialProgressValue))
  : null;

window.__LEGO_READY = false;
window.__setDisassemblyProgress = null;

const canvas = document.querySelector('#viewport');
const statusNode = document.querySelector('#status');
const legendNode = document.querySelector('#legend');

const setStatus = (message, isError = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = transparentMode ? null : new THREE.Color(0x080b12);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(0, 8.8, 18);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = !captureMode;
controls.enabled = !captureMode;
controls.target.set(0, 4.5, 0);
controls.minDistance = 8;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111827, 1.18);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.15);
keyLight.position.set(10, 15, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 40;
keyLight.shadow.camera.left = -18;
keyLight.shadow.camera.right = 18;
keyLight.shadow.camera.top = 18;
keyLight.shadow.camera.bottom = -18;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.95);
fillLight.position.set(0, 8, 16);
scene.add(fillLight);

const cyanRimLight = new THREE.DirectionalLight(0x4eeaff, 0.55);
cyanRimLight.position.set(-11, 9, -8);
scene.add(cyanRimLight);

const magentaRimLight = new THREE.DirectionalLight(0xff5ed8, 0.48);
magentaRimLight.position.set(8, 7, -10);
scene.add(magentaRimLight);

const stackRoot = new THREE.Group();
scene.add(stackRoot);

const loader = new GLTFLoader();
const labelBindings = [];
const disassemblyTargets = [];
const imageCache = new Map();
const badgeTextureCache = new Map();

const wrapText = (context, text, maxWidth, maxLines = 2) => {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width <= maxWidth || line.length === 0) {
      line = testLine;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  trimmed[maxLines - 1] = `${trimmed[maxLines - 1].slice(0, Math.max(3, trimmed[maxLines - 1].length - 1))}...`;
  return trimmed;
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

const seededUnit = (seed) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

const registerDisassemblyTarget = (object, seed, intensity = 1) => {
  const travel = 1 + seededUnit(seed + 8) * 0.7;
  const x = (seededUnit(seed + 1) * 2 - 1) * 4 * intensity * travel;
  const y = (1 + seededUnit(seed + 2) * 3.8) * intensity * (0.92 + travel * 0.18);
  const z = (seededUnit(seed + 3) * 2 - 1) * 3 * intensity * travel;
  const spinX = (seededUnit(seed + 4) * 2 - 1) * 1.65 * intensity * travel;
  const spinY = (seededUnit(seed + 5) * 2 - 1) * 1.95 * intensity * travel;
  const spinZ = (seededUnit(seed + 6) * 2 - 1) * 1.3 * intensity * travel;
  const delay = seededUnit(seed + 7) * 0.34;

  disassemblyTargets.push({
    object,
    basePosition: object.position.clone(),
    baseRotation: object.rotation.clone(),
    offset: new THREE.Vector3(x, y, z),
    spin: new THREE.Vector3(spinX, spinY, spinZ),
    delay
  });
};

const getDisassemblyEnvelope = (value) => {
  const clamped = clamp01(value);
  if (clamped <= 0.58) {
    return Math.pow(clamped / 0.58, 3.4) * 0.42;
  }

  const burstPhase = (clamped - 0.58) / 0.42;
  return 0.42 + easeOutCubic(burstPhase) * 0.58;
};

const updateDisassembly = (progress) => {
  for (const target of disassemblyTargets) {
    const localProgress = clamp01((progress - target.delay) / (1 - target.delay));
    const eased = getDisassemblyEnvelope(localProgress);
    target.object.position.copy(target.basePosition).addScaledVector(target.offset, eased);
    target.object.rotation.set(
      target.baseRotation.x + target.spin.x * eased,
      target.baseRotation.y + target.spin.y * eased,
      target.baseRotation.z + target.spin.z * eased
    );
  }
};

const getDisassemblyProgress = (elapsed) => {
  if (animationMode !== 'disassemble') {
    return 0;
  }

  if (controlledProgress !== null) {
    return clamp01(controlledProgress);
  }

  const phase = (elapsed * 0.11) % 1;
  const pingPong = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return easeInOutCubic(pingPong);
};

const loadImage = (source) => {
  if (!imageCache.has(source)) {
    imageCache.set(
      source,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${source.slice(0, 60)}`));
        image.src = source;
      })
    );
  }

  return imageCache.get(source);
};

const createLabelTexture = (label, backgroundColor, foregroundColor) => {
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = 1400;
  canvasTexture.height = 360;
  const context = canvasTexture.getContext('2d');

  context.clearRect(0, 0, canvasTexture.width, canvasTexture.height);
  const labelText = label.toUpperCase();
  const lines = [];
  let fontSize = 144;

  while (fontSize >= 96) {
    context.font = `800 ${fontSize}px "Segoe UI", Arial, sans-serif`;
    lines.splice(0, lines.length, ...wrapText(context, labelText, 1180, 2));
    if (lines.length <= 2) {
      break;
    }
    fontSize -= 6;
  }

  const tracking = fontSize >= 132 ? 6 : 4;
  const outlineColor = foregroundColor === '#ffffff' ? 'rgba(2, 6, 23, 0.62)' : 'rgba(255, 255, 255, 0.52)';
  const measureTrackedText = (text) => {
    const glyphs = Array.from(text);
    if (glyphs.length === 0) {
      return 0;
    }
    return glyphs.reduce((width, glyph) => width + context.measureText(glyph).width, 0) + tracking * (glyphs.length - 1);
  };

  const drawTrackedText = (text, centerX, baselineY, color) => {
    const glyphs = Array.from(text);
    let cursorX = centerX - measureTrackedText(text) / 2;
    context.fillStyle = color;
    context.strokeStyle = outlineColor;
    context.lineWidth = fontSize >= 132 ? 12 : 10;
    context.lineJoin = 'round';
    context.paintOrder = 'stroke fill';
    for (const glyph of glyphs) {
      context.strokeText(glyph, cursorX, baselineY);
      context.fillText(glyph, cursorX, baselineY);
      cursorX += context.measureText(glyph).width + tracking;
    }
  };

  context.textBaseline = 'middle';
  context.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
  const lineHeight = fontSize + 8;
  const startY = canvasTexture.height / 2 - ((lines.length - 1) * lineHeight) / 2;
  context.fillStyle = foregroundColor;

  lines.forEach((line, index) => {
    drawTrackedText(line, canvasTexture.width / 2, startY + index * lineHeight, foregroundColor);
  });

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
};

const pickTextColor = (hexColor) => {
  const color = new THREE.Color(hexColor);
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return luminance > 0.46 ? '#020617' : '#ffffff';
};

const boostColor = (hexColor, saturationBoost = 0.12, lightnessBoost = 0.04) => {
  const color = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const saturation = Math.min(1, hsl.s + saturationBoost);
  const lightness = hsl.l < 0.08 ? 0.18 : Math.min(0.56, hsl.l + lightnessBoost);
  color.setHSL(hsl.h, saturation, lightness);
  return color;
};

const measureTrackedText = (context, text, tracking) => {
  const glyphs = Array.from(text);
  if (glyphs.length === 0) {
    return 0;
  }
  return glyphs.reduce((width, glyph) => width + context.measureText(glyph).width, 0) + tracking * (glyphs.length - 1);
};

const drawTrackedText = (context, text, centerX, baselineY, tracking) => {
  const glyphs = Array.from(text);
  let cursorX = centerX - measureTrackedText(context, text, tracking) / 2;

  for (const glyph of glyphs) {
    context.fillText(glyph, cursorX, baselineY);
    cursorX += context.measureText(glyph).width + tracking;
  }
};

const drawTintedIcon = async (context, source, x, y, size, tintColor) => {
  const icon = await loadImage(source);
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = size;
  iconCanvas.height = size;
  const iconContext = iconCanvas.getContext('2d');
  iconContext.clearRect(0, 0, size, size);
  iconContext.drawImage(icon, 0, 0, size, size);
  iconContext.globalCompositeOperation = 'source-in';
  iconContext.fillStyle = tintColor;
  iconContext.fillRect(0, 0, size, size);
  context.drawImage(iconCanvas, x, y, size, size);
};

const cloneBrick = (template, color, options = {}) => {
  const {
    preserveColor = false,
    saturationBoost = 0.42,
    lightnessBoost = 0.04,
    roughness = 0.14,
    metalness = 0.03,
    clearcoat = 1,
    clearcoatRoughness = 0.06,
    reflectivity = 0.86,
    envMapIntensity = 0.18,
    emissiveMix = 0.04,
    emissiveIntensity = 0.03,
    emissiveColor = null
  } = options;

  const baseColor = preserveColor ? new THREE.Color(color) : boostColor(color, saturationBoost, lightnessBoost);
  const resolvedEmissive = emissiveColor
    ? new THREE.Color(emissiveColor)
    : baseColor.clone().lerp(new THREE.Color(0xffffff), emissiveMix);
  const brick = template.clone(true);
  brick.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      const material = new THREE.MeshPhysicalMaterial({
        color: baseColor.clone(),
        roughness,
        metalness,
        clearcoat,
        clearcoatRoughness,
        reflectivity,
        envMapIntensity,
        emissive: resolvedEmissive,
        emissiveIntensity,
        side: node.material.side
      });
      material.color = baseColor.clone();
      node.material = material;
    }
  });
  return brick;
};

const getRootLocalBounds = (root) => {
  root.updateMatrixWorld(true);

  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bounds = new THREE.Box3();
  const tempBox = new THREE.Box3();
  const tempMatrix = new THREE.Matrix4();
  let hasGeometry = false;

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (!node.geometry.boundingBox) {
      node.geometry.computeBoundingBox();
    }

    tempMatrix.multiplyMatrices(rootInverse, node.matrixWorld);
    tempBox.copy(node.geometry.boundingBox).applyMatrix4(tempMatrix);

    if (!hasGeometry) {
      bounds.copy(tempBox);
      hasGeometry = true;
      return;
    }

    bounds.union(tempBox);
  });

  if (!hasGeometry) {
    return new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
  }

  return bounds;
};

const createBrickBadgeTexture = async (item) => {
  const cacheKey = `${item.label}:${item.color}:${item.iconAsset.dataUri}`;
  if (!badgeTextureCache.has(cacheKey)) {
    badgeTextureCache.set(
      cacheKey,
      (async () => {
        const badgeCanvas = document.createElement('canvas');
        badgeCanvas.width = 1600;
        badgeCanvas.height = 420;
        const context = badgeCanvas.getContext('2d');
        const boostedColor = boostColor(item.color, 0.1, 0.03);
        const badgeColor = `#${boostedColor.getHexString()}`;
        const textColor = pickTextColor(badgeColor);
        const outlineColor = textColor === '#ffffff' ? 'rgba(2, 6, 23, 0.62)' : 'rgba(255, 255, 255, 0.52)';
        const labelText = item.label.toUpperCase();
        const iconSize = 224;
        const iconY = 98;
        const iconTextGap = 36;
        const maxTextWidth = 1100;

        const drawTrackedTextLeft = (text, startX, baselineY, trackAmount) => {
          const glyphs = Array.from(text);
          let cursorX = startX;
          context.strokeStyle = outlineColor;
          context.lineJoin = 'round';
          context.paintOrder = 'stroke fill';
          for (const glyph of glyphs) {
            context.lineWidth = fontSize >= 118 ? 10 : 8;
            context.strokeText(glyph, cursorX, baselineY);
            context.fillText(glyph, cursorX, baselineY);
            cursorX += context.measureText(glyph).width + trackAmount;
          }
        };

        context.clearRect(0, 0, badgeCanvas.width, badgeCanvas.height);

        context.fillStyle = textColor;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        let fontSize = labelText.length > 12 ? 116 : 132;
        let tracking = fontSize >= 118 ? 8 : 6;
        let lines = [];

        while (fontSize >= 76) {
          context.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
          lines = wrapText(context, labelText, maxTextWidth, 2);
          const widestLine = Math.max(...lines.map((line) => measureTrackedText(context, line, tracking)));
          if (widestLine <= maxTextWidth && lines.length <= 2) {
            break;
          }
          fontSize -= 4;
          tracking = Math.max(5, tracking - 1);
        }

        context.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
        const lineHeight = fontSize + 2;
        const widestLine = Math.max(...lines.map((line) => measureTrackedText(context, line, tracking)));
        const contentWidth = iconSize + iconTextGap + widestLine;
        const contentStartX = Math.max(48, (badgeCanvas.width - contentWidth) / 2);
        const iconX = contentStartX;
        const textLeft = iconX + iconSize + iconTextGap;
        const startY = badgeCanvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;

        await drawTintedIcon(context, item.iconAsset.dataUri, iconX, iconY, iconSize, textColor);

        lines.forEach((line, index) => {
          drawTrackedTextLeft(line, textLeft, startY + index * lineHeight, tracking);
        });

        const texture = new THREE.CanvasTexture(badgeCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        return texture;
      })()
    );
  }

  return badgeTextureCache.get(cacheKey);
};

const applyProjectedSideTexture = (root, texture, options = {}) => {
  root.updateMatrixWorld(true);

  const bounds = getRootLocalBounds(root);
  const size = bounds.getSize(new THREE.Vector3());
  const decalBounds = new THREE.Vector4(
    bounds.min.x + size.x * (options.xInsetFactor ?? 0.08),
    bounds.max.x - size.x * (options.xInsetFactor ?? 0.08),
    bounds.min.y + size.y * (options.yMinFactor ?? 0.18),
    bounds.min.y + size.y * (options.yMaxFactor ?? 0.78)
  );
  const faceData = new THREE.Vector3(
    bounds.max.z,
    bounds.min.z,
    size.z * (options.faceDepthFactor ?? 0.16)
  );
  const binding = { root, uniforms: [] };

  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const material = node.material.clone();
    material.onBeforeCompile = (shader) => {
      const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
      shader.uniforms.uFaceBadgeMap = { value: texture };
      shader.uniforms.uRootInverse = { value: inverseRoot };
      shader.uniforms.uFaceBadgeBounds = { value: decalBounds };
      shader.uniforms.uFaceBadgeData = { value: faceData };

      shader.vertexShader =
        `
          uniform mat4 uRootInverse;
          varying vec3 vRootPos;
          varying vec3 vRootNormal;
        ` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          mat4 rootModelMatrix = uRootInverse * modelMatrix;
          vRootPos = (rootModelMatrix * vec4(transformed, 1.0)).xyz;
          vRootNormal = normalize(mat3(transpose(inverse(mat3(rootModelMatrix)))) * objectNormal);`
        );

        shader.fragmentShader =
        `
          uniform sampler2D uFaceBadgeMap;
          uniform vec4 uFaceBadgeBounds;
          uniform vec3 uFaceBadgeData;
          varying vec3 vRootPos;
          varying vec3 vRootNormal;
        ` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 badgeUv = vec2(
            (vRootPos.x - uFaceBadgeBounds.x) / max(0.0001, uFaceBadgeBounds.y - uFaceBadgeBounds.x),
            (vRootPos.y - uFaceBadgeBounds.z) / max(0.0001, uFaceBadgeBounds.w - uFaceBadgeBounds.z)
          );
          float badgeInside = step(0.0, badgeUv.x) * step(badgeUv.x, 1.0) * step(0.0, badgeUv.y) * step(badgeUv.y, 1.0);
          float frontFacing = smoothstep(0.72, 0.92, vRootNormal.z);
          float backFacing = smoothstep(0.72, 0.92, -vRootNormal.z);
          float frontSurface = smoothstep(uFaceBadgeData.x - uFaceBadgeData.z, uFaceBadgeData.x, vRootPos.z);
          float backSurface = 1.0 - smoothstep(uFaceBadgeData.y, uFaceBadgeData.y + uFaceBadgeData.z, vRootPos.z);
          vec4 frontBadge = texture2D(uFaceBadgeMap, badgeUv);
          vec4 backBadge = texture2D(uFaceBadgeMap, vec2(1.0 - badgeUv.x, badgeUv.y));
          float frontAlpha = frontBadge.a * badgeInside * frontFacing * frontSurface;
          float backAlpha = backBadge.a * badgeInside * backFacing * backSurface;
          diffuseColor.rgb = mix(diffuseColor.rgb, frontBadge.rgb, frontAlpha);
          diffuseColor.rgb = mix(diffuseColor.rgb, backBadge.rgb, backAlpha);`
        );

      binding.uniforms.push(shader.uniforms.uRootInverse);
    };
    material.needsUpdate = true;
    node.material = material;
  });

  labelBindings.push(binding);
};

const applyProjectedFaceBadge = async (brick, item) => {
  const texture = await createBrickBadgeTexture(item);
  applyProjectedSideTexture(brick, texture, {
    xInsetFactor: 0.025,
    yMinFactor: 0.12,
    yMaxFactor: 0.86,
    faceDepthFactor: 0.2
  });
};

const applyProjectedCapSideLabel = (brick, { text, color }) => {
  const texture = createLabelTexture(text, color, pickTextColor(color));
  applyProjectedSideTexture(brick, texture, {
    xInsetFactor: 0.12,
    yMinFactor: 0.2,
    yMaxFactor: 0.7,
    faceDepthFactor: 0.2
  });
};

const applyProjectedTopLabel = (root, { text, color }) => {
  const texture = createLabelTexture(text, color, pickTextColor(color));
  root.updateMatrixWorld(true);

  const bounds = getRootLocalBounds(root);
  const size = bounds.getSize(new THREE.Vector3());
  const insetX = size.x * 0.11;
  const insetZ = size.z * 0.11;
  const labelBounds = new THREE.Vector4(
    bounds.min.x + insetX,
    bounds.max.x - insetX,
    bounds.min.z + insetZ,
    bounds.max.z - insetZ
  );

  const binding = { root, uniforms: [] };

  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const material = node.material.clone();
    material.onBeforeCompile = (shader) => {
      const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
      shader.uniforms.uLabelMap = { value: texture };
      shader.uniforms.uRootInverse = { value: inverseRoot };
      shader.uniforms.uLabelBounds = { value: labelBounds };

      shader.vertexShader =
        `
          uniform mat4 uRootInverse;
          varying vec3 vRootPos;
          varying vec3 vWorldNormal;
        ` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRootPos = (uRootInverse * modelMatrix * vec4(transformed, 1.0)).xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader =
        `
          uniform sampler2D uLabelMap;
          uniform vec4 uLabelBounds;
          varying vec3 vRootPos;
          varying vec3 vWorldNormal;
        ` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 labelUv = vec2(
            (vRootPos.x - uLabelBounds.x) / max(0.0001, uLabelBounds.y - uLabelBounds.x),
            1.0 - (vRootPos.z - uLabelBounds.z) / max(0.0001, uLabelBounds.w - uLabelBounds.z)
          );
          float insideLabel = step(0.0, labelUv.x) * step(labelUv.x, 1.0) * step(0.0, labelUv.y) * step(labelUv.y, 1.0);
          float topFacing = smoothstep(0.78, 0.94, dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0)));
          vec4 projectedLabel = texture2D(uLabelMap, labelUv);
          diffuseColor.rgb = mix(diffuseColor.rgb, projectedLabel.rgb, projectedLabel.a * insideLabel * topFacing);`
        );

      binding.uniforms.push(shader.uniforms.uRootInverse);
    };
    material.needsUpdate = true;
    node.material = material;
  });

  labelBindings.push(binding);
};

const fitModel = (root) => {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const targetWidth = 1.95;
  const targetHeight = 0.62;
  const scale = Math.min(targetWidth / size.x, targetHeight / size.y, targetWidth / size.z);
  root.scale.setScalar(scale);

  const adjustedBox = new THREE.Box3().setFromObject(root);
  const adjustedSize = adjustedBox.getSize(new THREE.Vector3());
  const adjustedCenter = adjustedBox.getCenter(new THREE.Vector3());
  root.position.x -= adjustedCenter.x;
  root.position.z -= adjustedCenter.z;
  root.position.y -= adjustedBox.min.y;

  return adjustedSize;
};

const renderLegend = (data) => {
  if (!legendNode) {
    return;
  }

  legendNode.textContent = '';

  for (const category of data.categories || []) {
    const categoryCard = document.createElement('section');
    categoryCard.className = 'legend-category';

    const title = document.createElement('h3');
    title.className = 'legend-category-title';
    title.textContent = category.category;
    categoryCard.append(title);

    const items = document.createElement('div');
    items.className = 'legend-items';

    for (const item of category.items || []) {
      const chip = document.createElement('div');
      chip.className = 'legend-item';

      const icon = document.createElement('img');
      icon.className = 'legend-icon';
      icon.src = item.iconAsset.dataUri;
      icon.alt = `${item.label} logo`;
      chip.append(icon);

      const label = document.createElement('span');
      label.textContent = item.label;
      chip.append(label);

      items.append(chip);
    }

    categoryCard.append(items);
    legendNode.append(categoryCard);
  }
};

const loadManifest = async () => {
  const response = await fetch('../output/techstack.manifest.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load techstack.manifest.json (${response.status})`);
  }
  return response.json();
};

const loadBrickTemplate = () =>
  new Promise((resolve, reject) => {
    loader.load(
      '../lego/scene.gltf',
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error)
    );
  });

const buildStacks = async () => {
  const [data, templateScene] = await Promise.all([loadManifest(), loadBrickTemplate()]);
  renderLegend(data);
  const template = templateScene.clone(true);
  const brickSize = fitModel(template);
  const categories = data.categories || [];
  const gap = 3.4;
  const baseX = -((categories.length - 1) * gap) / 2;
  const lift = brickSize.y * 0.82;

  for (const [categoryIndex, category] of categories.entries()) {
    const categoryGroup = new THREE.Group();
    categoryGroup.position.x = baseX + categoryIndex * gap;

    for (const [itemIndex, item] of category.items.entries()) {
      const brick = cloneBrick(template, item.color);
      brick.position.y = itemIndex * lift;
      await applyProjectedFaceBadge(brick, item);
      categoryGroup.add(brick);
      registerDisassemblyTarget(brick, (categoryIndex + 1) * 101 + (itemIndex + 1) * 17, 1);
    }

    const cap = cloneBrick(template, '#090b12', {
      preserveColor: true,
      roughness: 0.09,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      reflectivity: 0.78,
      envMapIntensity: 0.82,
      emissiveColor: '#161b24',
      emissiveIntensity: 0.05
    });
    cap.scale.multiplyScalar(1.08);
    cap.position.y = category.items.length * lift + 0.08;
    applyProjectedCapSideLabel(cap, {
      text: category.capLabel || category.category,
      color: '#090b12'
    });
    categoryGroup.add(cap);
    registerDisassemblyTarget(cap, (categoryIndex + 1) * 211 + 97, 1.1);

    stackRoot.add(categoryGroup);
  }

  const targetHeight = Math.max(...categories.map((category) => category.items.length)) * lift;
  controls.target.set(0, targetHeight * 0.46 + 1.4, 0);
  camera.position.set(0, targetHeight * 0.62 + 5.3, 18);
  controls.update();

  return {
    warningCount: Array.isArray(data.warnings) ? data.warnings.length : 0
  };
};

const resize = () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

window.addEventListener('resize', resize);
resize();

try {
  const result = await buildStacks();
  const message =
    result.warningCount > 0
      ? `WebGL preview ready. ${result.warningCount} tool badge(s) are using monogram fallbacks. Add icon or iconPath in data/techstack.json to replace them.`
      : 'WebGL preview ready. Category labels and tool badges are projected onto the bricks.';
  setStatus(message);
  window.__setDisassemblyProgress = (value) => {
    controlledProgress = clamp01(value);
    renderScene(0);
    return true;
  };
  window.__LEGO_READY = true;
} catch (error) {
  console.error(error);
  setStatus(
    'Failed to load the WebGL preview. Run npm run preview so the build step generates output/techstack.manifest.json, then refresh the page.',
    true
  );
  window.__LEGO_READY = false;
}

const clock = new THREE.Clock();

const renderScene = (elapsed) => {
  const disassemblyProgress = getDisassemblyProgress(elapsed);
  updateDisassembly(disassemblyProgress);
  stackRoot.rotation.y = controlledProgress !== null ? 0.06 : Math.sin(elapsed * 0.12) * 0.08;
  labelBindings.forEach((binding) => {
    binding.root.updateMatrixWorld(true);
    binding.uniforms.forEach((uniform) => {
      uniform.value.copy(binding.root.matrixWorld).invert();
    });
  });
  controls.update();
  renderer.render(scene, camera);
};

const animate = () => {
  renderScene(clock.getElapsedTime());
  requestAnimationFrame(animate);
};

animate();
