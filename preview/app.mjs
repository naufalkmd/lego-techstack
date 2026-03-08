import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const searchParams = new URLSearchParams(window.location.search);
const captureMode = searchParams.get('capture') === '1';
const transparentMode = searchParams.get('transparent') === '1';
const animationMode = searchParams.get('anim') || '';
const initialProgressValue = Number.parseFloat(searchParams.get('progress') || '');
const projectedTextureScale = captureMode ? 2.5 : 2;
let controlledProgress = Number.isFinite(initialProgressValue)
  ? Math.max(0, Math.min(1, initialProgressValue))
  : null;

window.__LEGO_READY = false;
window.__setDisassemblyProgress = null;

const canvas = document.querySelector('#viewport');
const statusNode = document.querySelector('#status');
const legendNode = document.querySelector('#legend');
const editorRoot = document.querySelector('#editor');
const editorTitleInput = document.querySelector('#stack-title');
const editorStatusNode = document.querySelector('#editor-status');
const copyConfigButton = document.querySelector('#copy-config');
const downloadConfigButton = document.querySelector('#download-config');
const resetConfigButton = document.querySelector('#reset-config');
const addCategoryButton = document.querySelector('#add-category');
const importConfigInput = document.querySelector('#import-config');

const setStatus = (message, isError = false) => {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, captureMode ? 2 : 1.5), 2));
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

const easeInCubic = (value) => value * value * value;

const easeInOutCubic = (value) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;

const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

const seededUnit = (seed) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
};

const registerDisassemblyTarget = (object, seed, intensity = 1, targets = disassemblyTargets) => {
  const travel = 0.92 + seededUnit(seed + 8) * 0.7;
  const angle = seededUnit(seed + 9) * Math.PI * 2;
  const radius =
    (0.7 + seededUnit(seed + 10) * 1.55) *
    intensity *
    (0.9 + Math.min(object.position.y, 6.5) * 0.09) *
    travel;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius * (0.72 + seededUnit(seed + 11) * 0.4);
  const y = 0.03 + seededUnit(seed + 12) * 0.18;
  const spinX = (seededUnit(seed + 4) * 2 - 1) * 1.28 * intensity * travel;
  const spinY = (seededUnit(seed + 5) * 2 - 1) * 1.62 * intensity * travel;
  const spinZ = (seededUnit(seed + 6) * 2 - 1) * 1.1 * intensity * travel;
  const settleX = (seededUnit(seed + 13) * 2 - 1) * 0.18;
  const settleY = (seededUnit(seed + 14) * 2 - 1) * 1.2;
  const settleZ = (seededUnit(seed + 15) * 2 - 1) * 0.18;
  const lift = 0.18 + seededUnit(seed + 16) * 0.42;
  const delay = seededUnit(seed + 7) * 0.34;

  targets.push({
    object,
    basePosition: object.position.clone(),
    baseRotation: object.rotation.clone(),
    landingPosition: new THREE.Vector3(x, y, z),
    landingRotation: new THREE.Euler(settleX, settleY, settleZ, object.rotation.order),
    spin: new THREE.Vector3(spinX, spinY, spinZ),
    lift,
    delay
  });
};

const getDisassemblyEnvelope = (value) => {
  const clamped = clamp01(value);
  if (clamped <= 0.16) {
    return 0;
  }

  const collapsePhase = (clamped - 0.16) / 0.84;
  return easeOutCubic(collapsePhase);
};

const updateDisassembly = (progress) => {
  for (const target of disassemblyTargets) {
    const localProgress = clamp01((progress - target.delay) / (1 - target.delay));
    const spread = getDisassemblyEnvelope(localProgress);
    const horizontal = easeOutCubic(spread);
    const vertical = easeInCubic(spread);
    const releaseLift = Math.sin(Math.PI * horizontal) * target.lift * (1 - horizontal * 0.5);
    const tumble = Math.sin(horizontal * Math.PI) * (1 - horizontal * 0.22);

    target.object.position.set(
      THREE.MathUtils.lerp(target.basePosition.x, target.landingPosition.x, horizontal),
      THREE.MathUtils.lerp(target.basePosition.y, target.landingPosition.y, vertical) + releaseLift,
      THREE.MathUtils.lerp(target.basePosition.z, target.landingPosition.z, horizontal)
    );
    target.object.rotation.set(
      THREE.MathUtils.lerp(target.baseRotation.x, target.landingRotation.x, horizontal) + target.spin.x * tumble,
      THREE.MathUtils.lerp(target.baseRotation.y, target.landingRotation.y, horizontal) + target.spin.y * tumble,
      THREE.MathUtils.lerp(target.baseRotation.z, target.landingRotation.z, horizontal) + target.spin.z * tumble
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

const createScaledCanvas = (logicalWidth, logicalHeight) => {
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = Math.round(logicalWidth * projectedTextureScale);
  canvasTexture.height = Math.round(logicalHeight * projectedTextureScale);
  const context = canvasTexture.getContext('2d');
  context.setTransform(projectedTextureScale, 0, 0, projectedTextureScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return { canvasTexture, context, logicalWidth, logicalHeight };
};

const finalizeProjectedTexture = (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
};

const createLabelTexture = (label, backgroundColor, foregroundColor) => {
  const { canvasTexture, context, logicalWidth, logicalHeight } = createScaledCanvas(1400, 360);

  context.clearRect(0, 0, logicalWidth, logicalHeight);
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
  const startY = logicalHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
  context.fillStyle = foregroundColor;

  lines.forEach((line, index) => {
    drawTrackedText(line, logicalWidth / 2, startY + index * lineHeight, foregroundColor);
  });

  return finalizeProjectedTexture(new THREE.CanvasTexture(canvasTexture));
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
  iconCanvas.width = Math.round(size * projectedTextureScale);
  iconCanvas.height = Math.round(size * projectedTextureScale);
  const iconContext = iconCanvas.getContext('2d');
  iconContext.imageSmoothingEnabled = true;
  iconContext.imageSmoothingQuality = 'high';
  iconContext.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
  iconContext.drawImage(icon, 0, 0, iconCanvas.width, iconCanvas.height);
  iconContext.globalCompositeOperation = 'source-in';
  iconContext.fillStyle = tintColor;
  iconContext.fillRect(0, 0, iconCanvas.width, iconCanvas.height);
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
        const { canvasTexture: badgeCanvas, context, logicalWidth, logicalHeight } = createScaledCanvas(1600, 420);
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

        context.clearRect(0, 0, logicalWidth, logicalHeight);

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
        const contentStartX = Math.max(48, (logicalWidth - contentWidth) / 2);
        const iconX = contentStartX;
        const textLeft = iconX + iconSize + iconTextGap;
        const startY = logicalHeight / 2 - ((lines.length - 1) * lineHeight) / 2;

        await drawTintedIcon(context, item.iconAsset.dataUri, iconX, iconY, iconSize, textColor);

        lines.forEach((line, index) => {
          drawTrackedTextLeft(line, textLeft, startY + index * lineHeight, tracking);
        });

        return finalizeProjectedTexture(new THREE.CanvasTexture(badgeCanvas));
      })()
    );
  }

  return badgeTextureCache.get(cacheKey);
};

const applyProjectedSideTexture = (root, texture, options = {}, bindings = labelBindings) => {
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

  bindings.push(binding);
};

const applyProjectedFaceBadge = async (brick, item, bindings = labelBindings) => {
  const texture = await createBrickBadgeTexture(item);
  applyProjectedSideTexture(brick, texture, {
    xInsetFactor: 0.025,
    yMinFactor: 0.12,
    yMaxFactor: 0.86,
    faceDepthFactor: 0.2
  }, bindings);
};

const applyProjectedCapSideLabel = (brick, { text, color }, bindings = labelBindings) => {
  const texture = createLabelTexture(text, color, pickTextColor(color));
  applyProjectedSideTexture(brick, texture, {
    xInsetFactor: 0.12,
    yMinFactor: 0.2,
    yMaxFactor: 0.7,
    faceDepthFactor: 0.2
  }, bindings);
};

const applyProjectedTopLabel = (root, { text, color }, bindings = labelBindings) => {
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

  bindings.push(binding);
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

const STORAGE_KEY = 'lego-techstack.editor-state.v1';
const defaultBrickColors = ['#2563eb', '#ef4444', '#f59e0b', '#22c55e', '#a855f7', '#0ea5e9'];
const defaultCapColors = ['#0f172a', '#1e293b', '#111827', '#0b1220'];

const cloneData = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (token) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[token];
  });

const normalizeHexColor = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(String(value || '').trim()) ? String(value).trim() : fallback;

const svgToDataUri = (svgMarkup) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

const dataUriToSvg = (dataUri) => {
  const marker = 'data:image/svg+xml';
  if (!String(dataUri || '').startsWith(marker)) {
    return '';
  }
  const separatorIndex = dataUri.indexOf(',');
  return separatorIndex >= 0 ? decodeURIComponent(dataUri.slice(separatorIndex + 1)) : '';
};

const normalizeInlineSvg = (svgMarkup) => {
  const trimmed = String(svgMarkup || '').trim();
  if (!trimmed) {
    return '';
  }
  if (!/<svg[\s>]/i.test(trimmed)) {
    throw new Error('Uploaded logo must be an SVG file.');
  }
  return trimmed;
};

const monogramFromLabel = (label) => {
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    return 'LG';
  }

  if (/^[A-Z0-9+.-]{2,4}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const words = trimmed.match(/[A-Za-z0-9]+/g) || [];
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  return trimmed.slice(0, Math.min(2, trimmed.length)).toUpperCase();
};

const buildMonogramSvg = (monogram) => {
  const token = monogram.toUpperCase();
  const fontSize = token.length >= 3 ? 8 : token.length === 2 ? 10 : 13;
  const letterSpacing = token.length > 1 ? '0.3' : '0';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">',
    `<text x="12" y="15.3" fill="#102033" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle" letter-spacing="${letterSpacing}">${escapeHtml(token)}</text>`,
    '</svg>'
  ].join('');
};

const createDefaultItem = (index = 0) => ({
  label: `Tool ${index + 1}`,
  color: defaultBrickColors[index % defaultBrickColors.length],
  iconSvg: ''
});

const createDefaultCategory = (index = 0) => ({
  category: `Category ${index + 1}`,
  capLabel: `Stack ${index + 1}`,
  capColor: defaultCapColors[index % defaultCapColors.length],
  items: [createDefaultItem(index)]
});

const normalizeEditorState = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const sourceCategories = Array.isArray(source.categories) && source.categories.length > 0
    ? source.categories
    : [createDefaultCategory(0)];

  return {
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : 'LEGO Tech Stack',
    categories: sourceCategories.map((category, categoryIndex) => {
      const categoryName =
        typeof category.category === 'string' && category.category.trim()
          ? category.category.trim()
          : `Category ${categoryIndex + 1}`;
      const itemsSource = Array.isArray(category.items) && category.items.length > 0
        ? category.items
        : [createDefaultItem(categoryIndex)];

      return {
        category: categoryName,
        capLabel:
          typeof category.capLabel === 'string' && category.capLabel.trim()
            ? category.capLabel.trim()
            : categoryName,
        capColor: normalizeHexColor(category.capColor, '#090b12'),
        items: itemsSource.map((item, itemIndex) => ({
          label:
            typeof item.label === 'string' && item.label.trim()
              ? item.label.trim()
              : `Tool ${itemIndex + 1}`,
          color: normalizeHexColor(item.color, defaultBrickColors[itemIndex % defaultBrickColors.length]),
          iconSvg:
            typeof item.iconSvg === 'string' && item.iconSvg.trim()
              ? normalizeInlineSvg(item.iconSvg)
              : item.iconAsset?.dataUri
                ? dataUriToSvg(item.iconAsset.dataUri)
                : ''
        }))
      };
    })
  };
};

const manifestToEditorState = (manifest) =>
  normalizeEditorState({
    title: manifest.title,
    categories: (manifest.categories || []).map((category) => ({
      category: category.category,
      capLabel: category.capLabel,
      capColor: category.capColor,
      items: (category.items || []).map((item) => ({
        label: item.label,
        color: item.color,
        iconSvg: item.iconAsset?.dataUri ? dataUriToSvg(item.iconAsset.dataUri) : ''
      }))
    }))
  });

const editorStateToConfig = (state) => ({
  title: state.title,
  categories: state.categories.map((category) => ({
    category: category.category,
    capLabel: category.capLabel,
    capColor: normalizeHexColor(category.capColor, '#090b12'),
    items: category.items.map((item) => {
      const exported = {
        label: item.label,
        color: normalizeHexColor(item.color, '#2563eb')
      };

      if (item.iconSvg && item.iconSvg.trim()) {
        exported.iconSvg = normalizeInlineSvg(item.iconSvg);
      }

      return exported;
    })
  }))
});

const resolveEditorIconAsset = (item) => {
  if (item.iconSvg && item.iconSvg.trim()) {
    return {
      kind: 'inline-svg',
      dataUri: svgToDataUri(normalizeInlineSvg(item.iconSvg)),
      fallback: false,
      source: 'inline-svg'
    };
  }

  const monogram = monogramFromLabel(item.label);
  return {
    kind: 'monogram',
    dataUri: svgToDataUri(buildMonogramSvg(monogram)),
    fallback: true,
    source: monogram
  };
};

const editorStateToPreviewData = (state) => ({
  title: state.title,
  categories: state.categories.map((category) => ({
    category: category.category,
    capLabel: category.capLabel || category.category,
    capColor: normalizeHexColor(category.capColor, '#090b12'),
    items: category.items.map((item) => ({
      label: item.label,
      color: normalizeHexColor(item.color, '#2563eb'),
      iconAsset: resolveEditorIconAsset(item)
    }))
  })),
  warnings: []
});

const serializeEditorConfig = (state) => JSON.stringify(editorStateToConfig(state), null, 2);

const setEditorStatus = (message) => {
  if (editorStatusNode) {
    editorStatusNode.textContent = message;
  }
};

const saveEditorState = (state) => {
  if (captureMode) {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(editorStateToConfig(state)));
};

const loadSavedEditorState = () => {
  if (captureMode) {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeEditorState(JSON.parse(raw));
  } catch {
    return null;
  }
};

const moveArrayEntry = (items, fromIndex, toIndex) => {
  if (toIndex < 0 || toIndex >= items.length) {
    return;
  }
  const [entry] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, entry);
};

const readTextFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsText(file);
  });

let baseEditorState = null;
let editorState = null;
let pendingRebuildTimer = null;
let activeBuildId = 0;
const clock = new THREE.Clock();
let renderScene = () => {};

const templateScenePromise = loadBrickTemplate();
const manifestPromise = loadManifest();

const clearPreviewScene = () => {
  stackRoot.clear();
  labelBindings.length = 0;
  disassemblyTargets.length = 0;
  badgeTextureCache.clear();
};

const buildStacksFromData = async (data) => {
  const templateScene = await templateScenePromise;
  const template = templateScene.clone(true);
  const brickSize = fitModel(template);
  const categories = data.categories || [];
  const gap = 3.4;
  const baseX = -((categories.length - 1) * gap) / 2;
  const lift = brickSize.y * 0.82;
  const builtGroup = new THREE.Group();
  const nextBindings = [];
  const nextTargets = [];

  for (const [categoryIndex, category] of categories.entries()) {
    const categoryGroup = new THREE.Group();
    categoryGroup.position.x = baseX + categoryIndex * gap;

    for (const [itemIndex, item] of category.items.entries()) {
      const brick = cloneBrick(template, item.color);
      brick.position.y = itemIndex * lift;
      await applyProjectedFaceBadge(brick, item, nextBindings);
      categoryGroup.add(brick);
      registerDisassemblyTarget(brick, (categoryIndex + 1) * 101 + (itemIndex + 1) * 17, 1, nextTargets);
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
    applyProjectedCapSideLabel(
      cap,
      {
        text: category.capLabel || category.category,
        color: '#090b12'
      },
      nextBindings
    );
    categoryGroup.add(cap);
    registerDisassemblyTarget(cap, (categoryIndex + 1) * 211 + 97, 1.1, nextTargets);

    builtGroup.add(categoryGroup);
  }

  const targetHeight = Math.max(...categories.map((category) => category.items.length)) * lift;
  return {
    group: builtGroup,
    bindings: nextBindings,
    targets: nextTargets,
    targetHeight,
    warningCount: Array.isArray(data.warnings) ? data.warnings.length : 0
  };
};

const applySceneBuild = (result) => {
  clearPreviewScene();
  stackRoot.add(result.group);
  labelBindings.push(...result.bindings);
  disassemblyTargets.push(...result.targets);
  controls.target.set(0, result.targetHeight * 0.46 + 1.4, 0);
  camera.position.set(0, result.targetHeight * 0.62 + 5.3, 18);
  controls.update();
};

const rebuildPreview = async (stateSnapshot) => {
  const buildId = ++activeBuildId;
  const data = editorStateToPreviewData(stateSnapshot);
  renderLegend(data);

  try {
    const result = await buildStacksFromData(data);
    if (buildId !== activeBuildId) {
      return;
    }

    applySceneBuild(result);
    const message =
      result.warningCount > 0
        ? `WebGL preview ready. ${result.warningCount} tool badge(s) are using monogram fallbacks. Upload SVG logos or export the JSON when you are done.`
        : 'WebGL preview ready. Local editor changes are applied to the brick labels and logos.';
    setStatus(message);
    window.__LEGO_READY = true;
    renderScene(0);
  } catch (error) {
    if (buildId !== activeBuildId) {
      return;
    }

    console.error(error);
    setStatus(
      'Failed to rebuild the WebGL preview. Check your uploaded SVG markup or run npm run preview so output/techstack.manifest.json exists.',
      true
    );
    window.__LEGO_READY = false;
  }
};

const schedulePreviewRefresh = () => {
  if (!editorState) {
    return;
  }

  if (pendingRebuildTimer) {
    clearTimeout(pendingRebuildTimer);
  }

  const snapshot = cloneData(editorState);
  pendingRebuildTimer = window.setTimeout(() => {
    pendingRebuildTimer = null;
    void rebuildPreview(snapshot);
  }, 140);
};

const updateDocumentTitle = () => {
  document.title = `${editorState?.title || 'LEGO Tech Stack'} Preview`;
};

const renderEditor = () => {
  if (!editorRoot || !editorState) {
    return;
  }

  if (editorTitleInput && editorTitleInput.value !== editorState.title) {
    editorTitleInput.value = editorState.title;
  }

  editorRoot.innerHTML = editorState.categories
    .map((category, categoryIndex) => {
      const canRemoveCategory = editorState.categories.length > 1;
      return `
        <section class="stack-card">
          <div class="stack-card-head">
            <div>
              <h3>${escapeHtml(category.category || `Category ${categoryIndex + 1}`)}</h3>
              <p>${category.items.length} brick${category.items.length === 1 ? '' : 's'} in this stack</p>
            </div>
            <div class="stack-card-actions">
              <button class="editor-button subtle" type="button" data-action="move-category-left" data-category-index="${categoryIndex}">Move Left</button>
              <button class="editor-button subtle" type="button" data-action="move-category-right" data-category-index="${categoryIndex}">Move Right</button>
              <button class="editor-button" type="button" data-action="add-item" data-category-index="${categoryIndex}">Add Brick</button>
              <button class="editor-button subtle" type="button" data-action="remove-category" data-category-index="${categoryIndex}" ${canRemoveCategory ? '' : 'disabled'}>Remove Stack</button>
            </div>
          </div>
          <div class="stack-fields">
            <label class="field">
              <span>Category name</span>
              <input type="text" value="${escapeHtml(category.category)}" data-scope="category" data-field="category" data-category-index="${categoryIndex}" />
            </label>
            <label class="field">
              <span>Cap label</span>
              <input type="text" value="${escapeHtml(category.capLabel)}" data-scope="category" data-field="capLabel" data-category-index="${categoryIndex}" />
            </label>
            <label class="field">
              <span>Cap color</span>
              <input type="color" value="${escapeHtml(normalizeHexColor(category.capColor, '#090b12'))}" data-scope="category" data-field="capColor" data-category-index="${categoryIndex}" />
            </label>
          </div>
          <div class="stack-items">
            ${category.items
              .map((item, itemIndex) => {
                const previewIcon = resolveEditorIconAsset(item);
                const canRemoveItem = category.items.length > 1;
                return `
                  <article class="stack-item">
                    <div class="stack-item-grid">
                      <label class="field">
                        <span>Brick name</span>
                        <input type="text" value="${escapeHtml(item.label)}" data-scope="item" data-field="label" data-category-index="${categoryIndex}" data-item-index="${itemIndex}" />
                      </label>
                      <label class="field">
                        <span>Brick color</span>
                        <input type="color" value="${escapeHtml(normalizeHexColor(item.color, '#2563eb'))}" data-scope="item" data-field="color" data-category-index="${categoryIndex}" data-item-index="${itemIndex}" />
                      </label>
                      <div class="field">
                        <span>Brick logo</span>
                        <div class="logo-field-row">
                          <img class="logo-preview" src="${previewIcon.dataUri}" alt="${escapeHtml(item.label)} logo preview" />
                          <label class="editor-button subtle">
                            Upload SVG
                            <input class="editor-file-input" type="file" accept=".svg,image/svg+xml" data-action="upload-logo" data-category-index="${categoryIndex}" data-item-index="${itemIndex}" />
                          </label>
                          <button class="editor-button subtle" type="button" data-action="clear-logo" data-category-index="${categoryIndex}" data-item-index="${itemIndex}">Use Monogram</button>
                        </div>
                      </div>
                    </div>
                    <div class="item-actions">
                      <button class="editor-button subtle" type="button" data-action="move-item-up" data-category-index="${categoryIndex}" data-item-index="${itemIndex}">Move Up</button>
                      <button class="editor-button subtle" type="button" data-action="move-item-down" data-category-index="${categoryIndex}" data-item-index="${itemIndex}">Move Down</button>
                      <button class="editor-button subtle" type="button" data-action="remove-item" data-category-index="${categoryIndex}" data-item-index="${itemIndex}" ${canRemoveItem ? '' : 'disabled'}>Remove Brick</button>
                    </div>
                  </article>
                `;
              })
              .join('')}
          </div>
        </section>
      `;
    })
    .join('');
};

const commitEditorChange = (message, rerenderEditor = false) => {
  editorState = normalizeEditorState(editorState);
  updateDocumentTitle();
  if (rerenderEditor) {
    renderEditor();
  }
  saveEditorState(editorState);
  schedulePreviewRefresh();
  setEditorStatus(message);
};

const resetEditorToBase = () => {
  if (!baseEditorState) {
    return;
  }
  editorState = cloneData(baseEditorState);
  renderEditor();
  commitEditorChange('Editor reset to the generated manifest.', false);
};

const handleEditorFieldInput = (target) => {
  const categoryIndex = Number(target.dataset.categoryIndex);
  const itemIndex = Number(target.dataset.itemIndex);
  const field = target.dataset.field;

  if (target.dataset.scope === 'category') {
    editorState.categories[categoryIndex][field] = target.value;
    commitEditorChange('Category updated.');
    return;
  }

  if (target.dataset.scope === 'item') {
    editorState.categories[categoryIndex].items[itemIndex][field] = target.value;
    commitEditorChange('Brick updated.');
  }
};

const handleEditorAction = async (action, categoryIndex, itemIndex, fileInput = null) => {
  switch (action) {
    case 'move-category-left':
      moveArrayEntry(editorState.categories, categoryIndex, categoryIndex - 1);
      renderEditor();
      commitEditorChange('Stack order updated.', false);
      break;
    case 'move-category-right':
      moveArrayEntry(editorState.categories, categoryIndex, categoryIndex + 1);
      renderEditor();
      commitEditorChange('Stack order updated.', false);
      break;
    case 'remove-category':
      if (editorState.categories.length > 1) {
        editorState.categories.splice(categoryIndex, 1);
        renderEditor();
        commitEditorChange('Stack removed.', false);
      }
      break;
    case 'add-item':
      editorState.categories[categoryIndex].items.push(
        createDefaultItem(editorState.categories[categoryIndex].items.length)
      );
      renderEditor();
      commitEditorChange('Brick added.', false);
      break;
    case 'move-item-up':
      moveArrayEntry(editorState.categories[categoryIndex].items, itemIndex, itemIndex + 1);
      renderEditor();
      commitEditorChange('Brick order updated.', false);
      break;
    case 'move-item-down':
      moveArrayEntry(editorState.categories[categoryIndex].items, itemIndex, itemIndex - 1);
      renderEditor();
      commitEditorChange('Brick order updated.', false);
      break;
    case 'remove-item':
      if (editorState.categories[categoryIndex].items.length > 1) {
        editorState.categories[categoryIndex].items.splice(itemIndex, 1);
        renderEditor();
        commitEditorChange('Brick removed.', false);
      }
      break;
    case 'clear-logo':
      editorState.categories[categoryIndex].items[itemIndex].iconSvg = '';
      renderEditor();
      commitEditorChange('Custom SVG removed. Monogram fallback is active.', false);
      break;
    case 'upload-logo': {
      const file = fileInput?.files?.[0];
      if (!file) {
        return;
      }
      const rawSvg = await readTextFile(file);
      editorState.categories[categoryIndex].items[itemIndex].iconSvg = normalizeInlineSvg(rawSvg);
      renderEditor();
      commitEditorChange(`Loaded ${file.name} as the brick logo.`, false);
      break;
    }
    default:
      break;
  }
};

const initializeEditor = () => {
  if (captureMode || !editorRoot) {
    return;
  }

  editorTitleInput?.addEventListener('input', (event) => {
    editorState.title = event.target.value;
    commitEditorChange('Stack title updated.');
  });

  editorRoot.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.dataset.scope) {
      return;
    }
    handleEditorFieldInput(target);
  });

  editorRoot.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset.action === 'upload-logo') {
      await handleEditorAction(
        'upload-logo',
        Number(target.dataset.categoryIndex),
        Number(target.dataset.itemIndex),
        target
      );
    }
  });

  editorRoot.addEventListener('click', async (event) => {
    const trigger = event.target.closest('button[data-action]');
    if (!trigger) {
      return;
    }
    await handleEditorAction(
      trigger.dataset.action,
      Number(trigger.dataset.categoryIndex),
      Number(trigger.dataset.itemIndex)
    );
  });

  addCategoryButton?.addEventListener('click', () => {
    editorState.categories.push(createDefaultCategory(editorState.categories.length));
    renderEditor();
    commitEditorChange('New stack added.', false);
  });

  resetConfigButton?.addEventListener('click', () => {
    resetEditorToBase();
  });

  copyConfigButton?.addEventListener('click', async () => {
    const payload = serializeEditorConfig(editorState);
    await navigator.clipboard.writeText(payload);
    setEditorStatus('Config copied to the clipboard.');
  });

  downloadConfigButton?.addEventListener('click', () => {
    const payload = serializeEditorConfig(editorState);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'techstack.custom.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setEditorStatus('Downloaded techstack.custom.json.');
  });

  importConfigInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await readTextFile(file);
      editorState = normalizeEditorState(JSON.parse(payload));
      renderEditor();
      commitEditorChange(`Imported ${file.name}.`, false);
    } catch (error) {
      console.error(error);
      setEditorStatus('Failed to import JSON. Check the file format and try again.');
    } finally {
      event.target.value = '';
    }
  });
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

renderScene = (elapsed) => {
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

try {
  const manifest = await manifestPromise;
  baseEditorState = manifestToEditorState(manifest);
  editorState = loadSavedEditorState() || cloneData(baseEditorState);
  updateDocumentTitle();
  initializeEditor();
  renderEditor();

  const initialState = captureMode ? cloneData(baseEditorState) : cloneData(editorState);
  await rebuildPreview(initialState);
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

const animate = () => {
  renderScene(clock.getElapsedTime());
  requestAnimationFrame(animate);
};

animate();
