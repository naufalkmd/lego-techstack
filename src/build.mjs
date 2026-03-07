import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTechstack } from './resolve-techstack.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(rootDir, 'output');
const outputPath = resolve(outputDir, 'lego-techstack.svg');
const manifestPath = resolve(outputDir, 'techstack.manifest.json');

const geometry = {
  brickWidth: 188,
  capWidth: 220,
  brickHeight: 46,
  capHeight: 58,
  depth: 58,
  rise: 32,
  lift: 60,
  stackGap: 90,
  paddingX: 72,
  paddingY: 72,
  footer: 118
};

const source = loadTechstack(rootDir);
const categories = source.categories;
const maxItems = Math.max(...categories.map((category) => category.items.length));
const svgWidth =
  geometry.paddingX * 2 +
  categories.length * (geometry.capWidth + geometry.depth) +
  (categories.length - 1) * geometry.stackGap;
const svgHeight =
  geometry.paddingY +
  (maxItems + 2) * geometry.lift +
  geometry.capHeight +
  geometry.footer;
const groundY = svgHeight - geometry.footer;

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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toRgb = (color) => {
  const normalized = color.trim();
  const shortMatch = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (shortMatch) {
    return shortMatch[1].split('').map((chunk) => parseInt(chunk + chunk, 16));
  }
  const fullMatch = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (fullMatch) {
    return [
      parseInt(fullMatch[1].slice(0, 2), 16),
      parseInt(fullMatch[1].slice(2, 4), 16),
      parseInt(fullMatch[1].slice(4, 6), 16)
    ];
  }
  return null;
};

const toHex = (rgb) =>
  `#${rgb
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const mixColor = (base, target, weight) => {
  const from = toRgb(base);
  const to = toRgb(target);
  if (!from || !to) {
    return base;
  }
  const mixed = from.map((channel, index) => channel + (to[index] - channel) * weight);
  return toHex(mixed);
};

const lighten = (color, weight) => mixColor(color, '#ffffff', weight);
const darken = (color, weight) => mixColor(color, '#0f172a', weight);

const relativeLuminance = (color) => {
  const rgb = toRgb(color);
  if (!rgb) {
    return 0;
  }
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = rgb.map(channel);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

const pickTextColor = (color) =>
  relativeLuminance(color) > 0.38 ? '#102033' : '#f8fafc';

const wrapLabel = (label, maxChars) => {
  const words = label.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length <= maxChars || line.length === 0) {
      line = nextLine;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  if (lines.length <= 2) {
    return lines;
  }

  return [lines[0], lines.slice(1).join(' ')];
};

const renderText = ({
  lines,
  x,
  centerY,
  fontSize,
  color,
  weight = 700,
  anchor = 'middle',
  letterSpacing = '0.22',
  lineHeight = fontSize + 3
}) => {
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;

  return [
    `<text x="${x}" y="${startY}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">`,
    ...lines.map(
      (line, index) =>
        `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`
    ),
    '</text>'
  ].join('');
};

const renderStud = ({ cx, cy, color }) => {
  const top = lighten(color, 0.28);
  const rim = darken(color, 0.24);
  return [
    `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="7" fill="${top}" stroke="${rim}" stroke-width="1.2" opacity="0.96" />`,
    `<ellipse cx="${cx}" cy="${cy + 4}" rx="9.5" ry="4.6" fill="${darken(color, 0.08)}" opacity="0.78" />`
  ].join('');
};

const renderItemFace = ({ x, y, width, height, item }) => {
  const textColor = pickTextColor(item.color);
  const plateX = x + 12;
  const plateY = y + 7;
  const plateWidth = width - 24;
  const plateHeight = height - 14;
  const iconChipSize = 22;
  const iconSize = 16;
  const iconChipX = plateX + 12;
  const iconChipY = plateY + plateHeight / 2 - iconChipSize / 2;
  const iconX = iconChipX + (iconChipSize - iconSize) / 2;
  const iconY = iconChipY + (iconChipSize - iconSize) / 2;
  const labelLines = wrapLabel(item.label, 16);
  const fontSize = labelLines.length > 1 || item.label.length >= 14 ? 10.5 : 11.5;
  const textX = iconChipX + iconChipSize + 12;
  const plateFill = textColor === '#102033' ? '#ffffff' : '#0f172a';
  const plateOpacity = textColor === '#102033' ? '0.26' : '0.22';
  const plateStroke = textColor === '#102033' ? '#0f172a' : '#ffffff';

  return [
    `<rect x="${plateX}" y="${plateY}" width="${plateWidth}" height="${plateHeight}" rx="10" fill="${plateFill}" fill-opacity="${plateOpacity}" stroke="${plateStroke}" stroke-opacity="0.18" />`,
    `<circle cx="${iconChipX + iconChipSize / 2}" cy="${iconChipY + iconChipSize / 2}" r="${iconChipSize / 2}" fill="#ffffff" fill-opacity="0.96" />`,
    `<image href="${item.iconAsset.dataUri}" xlink:href="${item.iconAsset.dataUri}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" />`,
    renderText({
      lines: labelLines,
      x: textX,
      centerY: y + height / 2 + 1,
      fontSize,
      color: textColor,
      weight: 700,
      anchor: 'start',
      lineHeight: fontSize + 3
    })
  ].join('');
};

const renderBrick = ({ x, y, width, height, color, label, isCap = false, item = null }) => {
  const topColor = lighten(color, 0.18);
  const sideColor = darken(color, 0.18);
  const edgeColor = darken(color, 0.34);
  const textColor = pickTextColor(color);
  const pointsTop = [
    [x, y],
    [x + geometry.depth, y - geometry.rise],
    [x + width + geometry.depth, y - geometry.rise],
    [x + width, y]
  ]
    .map((point) => point.join(','))
    .join(' ');
  const pointsSide = [
    [x + width, y],
    [x + width + geometry.depth, y - geometry.rise],
    [x + width + geometry.depth, y + height - geometry.rise],
    [x + width, y + height]
  ]
    .map((point) => point.join(','))
    .join(' ');
  const studCount = isCap ? 4 : 3;
  const studSpacing = width / (studCount + 1);
  const studMarkup = Array.from({ length: studCount }, (_, index) =>
    renderStud({
      cx: x + studSpacing * (index + 1) + geometry.depth * 0.3,
      cy: y - geometry.rise * 0.54,
      color
    })
  ).join('');
  const bodyMarkup = isCap
    ? renderText({
        lines: wrapLabel(label, 14),
        x: x + width / 2,
        centerY: y + height / 2 + 2,
        fontSize: 18,
        color: textColor,
        weight: 800,
        lineHeight: 22
      })
    : renderItemFace({ x, y, width, height, item });

  return [
    '<g filter="url(#brickShadow)">',
    `<polygon points="${pointsTop}" fill="${topColor}" stroke="${edgeColor}" stroke-width="1.4" />`,
    `<polygon points="${pointsSide}" fill="${sideColor}" stroke="${edgeColor}" stroke-width="1.4" />`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${color}" stroke="${edgeColor}" stroke-width="1.6" />`,
    `<line x1="${x + 10}" y1="${y + 10}" x2="${x + width - 10}" y2="${y + 10}" stroke="${lighten(color, 0.35)}" stroke-width="2" stroke-linecap="round" opacity="0.8" />`,
    studMarkup,
    bodyMarkup,
    `<title>${escapeXml(label)}</title>`,
    '</g>'
  ].join('');
};

const renderCategory = (category, index) => {
  const stackX =
    geometry.paddingX + index * (geometry.capWidth + geometry.depth + geometry.stackGap);
  const itemX = stackX + (geometry.capWidth - geometry.brickWidth) / 2;
  const shadowCx = stackX + geometry.capWidth / 2 + geometry.depth / 2;
  const shadowCy = groundY + geometry.rise + 18;
  const shadowRy = 20 + category.items.length * 1.15;
  const itemMarkup = category.items
    .map((item, itemIndex) =>
      renderBrick({
        x: itemX,
        y: groundY - geometry.brickHeight - itemIndex * geometry.lift,
        width: geometry.brickWidth,
        height: geometry.brickHeight,
        label: item.label,
        color: item.color,
        item
      })
    )
    .join('');
  const capMarkup = renderBrick({
    x: stackX,
    y: groundY - geometry.capHeight - category.items.length * geometry.lift - 12,
    width: geometry.capWidth,
    height: geometry.capHeight,
    label: category.capLabel,
    color: category.capColor,
    isCap: true
  });
  const footerLabel = renderText({
    lines: wrapLabel(category.category, 22),
    x: stackX + geometry.capWidth / 2 + geometry.depth / 2,
    centerY: groundY + 76,
    fontSize: 14,
    color: '#55657a',
    weight: 600,
    lineHeight: 18
  });

  return [
    '<g>',
    `<ellipse cx="${shadowCx}" cy="${shadowCy}" rx="${geometry.capWidth * 0.48}" ry="${shadowRy}" fill="#102033" opacity="0.12" />`,
    itemMarkup,
    capMarkup,
    footerLabel,
    '</g>'
  ].join('');
};

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-labelledby="title desc">`,
  `<title id="title">${escapeXml(source.title)}</title>`,
  '<desc id="desc">Stacked LEGO-style bricks for each tech stack category, including per-tool names and logos.</desc>',
  '<defs>',
  '<filter id="brickShadow" x="-12%" y="-12%" width="130%" height="140%">',
  '<feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#102033" flood-opacity="0.16" />',
  '</filter>',
  '</defs>',
  ...categories.map(renderCategory),
  '</svg>'
].join('');

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, svg, 'utf8');
writeFileSync(manifestPath, JSON.stringify(source, null, 2), 'utf8');

if (source.warnings.length > 0) {
  console.warn(`Generated with ${source.warnings.length} fallback icon(s).`);
  for (const warning of source.warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log(`Generated ${outputPath}`);
console.log(`Generated ${manifestPath}`);