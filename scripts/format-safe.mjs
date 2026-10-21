import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import * as prettier from 'prettier';
const ignore = new Set([
  'node_modules',
  '.git',
  '.astro',
  '.wrangler',
  '.npm-cache',
  '.local-tools',
  '.dev-outbox',
  'dist',
  'test-results',
  'playwright-report',
  'output',
  'content',
]);
async function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (
      ignore.has(e.name) ||
      e.name.startsWith('.dev.vars') ||
      e.name.startsWith('.env')
    )
      continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(path);
      continue;
    }
    const info = await prettier.getFileInfo(path, {
      ignorePath: '.prettierignore',
    });
    if (info.ignored || (!info.inferredParser && !path.endsWith('.astro')))
      continue;
    const config = await prettier.resolveConfig(path);
    const before = readFileSync(path, 'utf8');
    const after = await prettier.format(before, { ...config, filepath: path });
    if (before !== after) {
      writeFileSync(path + '.tmp', after);
      renameSync(path + '.tmp', path);
    }
  }
}
await walk('.');
console.log('Formatting saved with temporary files and rename.');
