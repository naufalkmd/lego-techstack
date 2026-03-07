import * as simpleIcons from 'simple-icons';
import { titleToSlug, slugToVariableName } from 'simple-icons/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const iconAliases = new Map([
  ['affinity', 'affinitydesigner'],
  ['babylonjs', 'babylondotjs'],
  ['bash', 'gnubash'],
  ['css3', 'css'],
  ['jupyternotebook', 'jupyter'],
  ['nextjs', 'nextdotjs'],
  ['shell', 'gnubash'],
  ['tailwind', 'tailwindcss'],
  ['threejs', 'threedotjs']
]);

const escapeXml = (value) =>
  String(value).replace(/[<>&"']/g, (token) => {
    const map = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;'
    };
    return map[token];
  });

const svgToDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const parseSvgBody = (svgMarkup) => {
  const match = /<svg[^>]*>([\s\S]*?)<\/svg>/i.exec(svgMarkup.trim());
  return match ? match[1].trim() : svgMarkup.trim();
};

const parseSvgViewBox = (svgMarkup) => {
  const match = /viewBox=["']([^"']+)["']/i.exec(svgMarkup);
  return match ? match[1] : '0 0 24 24';
};

const buildSimpleIconSvg = (icon) =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">',
    `<path fill="#${icon.hex}" d="${icon.path}" />`,
    '</svg>'
  ].join('');

const buildMonogramSvg = (monogram) => {
  const token = monogram.toUpperCase();
  const fontSize = token.length >= 3 ? 8 : token.length === 2 ? 10 : 13;
  const letterSpacing = token.length > 1 ? '0.3' : '0';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">',
    `<text x="12" y="15.3" fill="#102033" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle" letter-spacing="${letterSpacing}">${escapeXml(token)}</text>`,
    '</svg>'
  ].join('');
};

const monogramFromLabel = (label) => {
  const trimmed = label.trim();
  if (/^[A-Z0-9+.-]{2,4}$/.test(trimmed)) {
    return trimmed;
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

const readCustomSvg = (rootDir, iconPath) => {
  const assetPath = resolve(rootDir, iconPath);
  if (!existsSync(assetPath)) {
    throw new Error(`Icon asset not found: ${iconPath}`);
  }

  if (extname(assetPath).toLowerCase() !== '.svg') {
    throw new Error(`Only SVG icon assets are supported: ${iconPath}`);
  }

  const rawSvg = readFileSync(assetPath, 'utf8');
  const body = parseSvgBody(rawSvg);
  const viewBox = parseSvgViewBox(rawSvg);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(viewBox)}" aria-hidden="true">`,
    body,
    '</svg>'
  ].join('');

  return {
    kind: 'custom',
    dataUri: svgToDataUri(svg),
    fallback: false,
    source: iconPath
  };
};

const resolveSimpleIcon = (requested) => {
  const candidates = new Set();
  const raw = String(requested || '').trim();
  if (!raw) {
    return null;
  }

  const normalized = titleToSlug(raw);
  candidates.add(raw);
  candidates.add(normalized);
  if (iconAliases.has(normalized)) {
    candidates.add(iconAliases.get(normalized));
  }

  for (const candidate of candidates) {
    const slug = titleToSlug(candidate);
    const variableName = slugToVariableName(slug);
    const match = simpleIcons[variableName];
    if (match) {
      return match;
    }
  }

  return null;
};

const resolveIconAsset = (rootDir, item, warnings) => {
  if (item.iconPath) {
    return readCustomSvg(rootDir, item.iconPath);
  }

  const iconRequest = item.icon === false ? '' : item.icon || item.label;
  const icon = resolveSimpleIcon(iconRequest);
  if (icon) {
    return {
      kind: 'simple-icons',
      dataUri: svgToDataUri(buildSimpleIconSvg(icon)),
      fallback: false,
      source: icon.slug
    };
  }

  const monogram = item.monogram || monogramFromLabel(item.label);
  warnings.push(`No icon match for "${item.label}". Using monogram fallback.`);
  return {
    kind: 'monogram',
    dataUri: svgToDataUri(buildMonogramSvg(monogram)),
    fallback: true,
    source: monogram
  };
};

export const loadTechstack = (rootDir) => {
  const inputPath = resolve(rootDir, 'data', 'techstack.json');
  const rawSource = JSON.parse(readFileSync(inputPath, 'utf8'));
  const warnings = [];

  if (!Array.isArray(rawSource.categories) || rawSource.categories.length === 0) {
    throw new Error('data/techstack.json must contain at least one category.');
  }

  const categories = rawSource.categories.map((category) => {
    if (!Array.isArray(category.items) || category.items.length === 0) {
      throw new Error(`Category "${category.category}" must contain at least one item.`);
    }

    const items = category.items.map((item) => {
      if (!item.label || !item.color) {
        throw new Error(`Every item requires both label and color. Failed on category "${category.category}".`);
      }

      return {
        label: item.label,
        color: item.color,
        iconAsset: resolveIconAsset(rootDir, item, warnings)
      };
    });

    return {
      category: category.category,
      capLabel: category.capLabel || category.category,
      capColor: category.capColor || items[0].color,
      items
    };
  });

  return {
    title: rawSource.title || 'LEGO Tech Stack',
    categories,
    warnings
  };
};