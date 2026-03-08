import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTechstack } from './resolve-techstack.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(rootDir, 'output');
const manifestPath = resolve(outputDir, 'techstack.manifest.json');

const source = loadTechstack(rootDir);

mkdirSync(outputDir, { recursive: true });
writeFileSync(manifestPath, JSON.stringify(source, null, 2), 'utf8');

if (source.warnings.length > 0) {
  console.warn(`Generated with ${source.warnings.length} fallback icon(s).`);
  for (const warning of source.warnings) {
    console.warn(`- ${warning}`);
  }
}

console.log(`Generated ${manifestPath}`);
