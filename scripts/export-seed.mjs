// One-time migration: reads data/faqs.js (which sets window.FAQ_DATA) and
// writes data/faqs.json for uploading to S3.
//
// Usage: node scripts/export-seed.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const source = readFileSync(join(repoRoot, 'data/faqs.js'), 'utf8');

const ctx = { window: {} };
const fn = new Function('window', source);
fn(ctx.window);

if (!ctx.window.FAQ_DATA) {
    throw new Error('FAQ_DATA not found after evaluating data/faqs.js');
}

const out = JSON.stringify(ctx.window.FAQ_DATA, null, 2);
writeFileSync(join(repoRoot, 'data/faqs.json'), out + '\n');
console.log(`Wrote data/faqs.json (${out.length} bytes, ${ctx.window.FAQ_DATA.categories.length} categories)`);
