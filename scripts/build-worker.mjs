import { build } from 'esbuild';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
const result = await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['workerd', 'worker', 'browser'],
  external: ['node:*', 'cloudflare:*'],
  write: false,
  minify: true,
  logLevel: 'silent',
});
mkdirSync('output/security/worker', { recursive: true });
writeFileSync(
  'output/security/worker/index.js.tmp',
  result.outputFiles[0].contents,
);
renameSync(
  'output/security/worker/index.js.tmp',
  'output/security/worker/index.js',
);
console.log(
  'Worker bundle built locally for inspection. No deployment or private settings loaded.',
);
