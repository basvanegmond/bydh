// Fails CI when the initial JS (what loads before the 3D chunk) grows past the budget.
// Budget supports the "first load under 3 s on broadband" target.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 250;
const html = readFileSync('dist/index.html', 'utf8');
const entries = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
if (entries.length === 0) throw new Error('No entry script found in dist/index.html');

let totalKb = 0;
for (const src of entries) {
  const file = join('dist', src.replace(/^.*\/assets\//, 'assets/'));
  const kb = gzipSync(readFileSync(file)).length / 1024;
  totalKb += kb;
  console.log(`${file}: ${kb.toFixed(1)} KB gzip`);
}
console.log(`Initial JS: ${totalKb.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`);
if (totalKb > BUDGET_KB) {
  console.error(
    'Initial bundle is over budget: lazy-load the new dependency or raise the budget deliberately.',
  );
  process.exit(1);
}
