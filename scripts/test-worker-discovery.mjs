import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { resolve } from 'node:path';
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_WRITE_LOGS = 'false';
process.env.WRANGLER_LOG = 'none';
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
mkdirSync('.local-tools', { recursive: true });
// Use an isolated config directory so the smoke test never loads site/.dev.vars.
if (existsSync('.local-tools/.dev.vars'))
  throw Error(
    'Remove the test-directory vars file before running this isolated test.',
  );
const config = JSON.parse(
  readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'),
);
config.main = resolve('worker/index.ts');
config.assets.directory = resolve('dist');
config.d1_databases.forEach((db) => {
  db.migrations_dir = resolve('migrations');
});
writeFileSync('.local-tools/phase3-worker.json.tmp', JSON.stringify(config));
renameSync(
  '.local-tools/phase3-worker.json.tmp',
  '.local-tools/phase3-worker.json',
);
const { unstable_dev } = await import('wrangler');
let server;
try {
  server = await unstable_dev(resolve('worker/index.ts'), {
    config: resolve('.local-tools/phase3-worker.json'),
    envFiles: [],
    local: true,
    ip: 'localhost',
    port: 8787,
    inspect: false,
    inspectorPort: 0,
    logLevel: 'none',
    persist: false,
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
      fileBasedRegistry: false,
      watch: false,
      showInteractiveDevSession: false,
    },
  });
  for (const path of [
    '/api/loops.json',
    '/api/prompts.json',
    '/api/skills.json',
  ]) {
    const response = await server.fetch(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(
      response.headers.get('Content-Type'),
      'application/json; charset=utf-8',
    );
    assert.match(response.headers.get('Cache-Control'), /max-age=300/);
    const feed = await response.json();
    assert.equal(typeof feed.count, 'number');
  }
  const md = await server.fetch('/about.md');
  assert.equal(md.status, 200);
  assert.equal(md.headers.get('Content-Type'), 'text/markdown; charset=utf-8');
  for (const path of [
    '/rss.xml',
    '/llms.txt',
    '/llms-full.txt',
    '/robots.txt',
    '/sitemap-index.xml',
    '/sitemap.xml',
  ])
    assert.equal((await server.fetch(path)).status, 200);
  const thanks = await server.fetch('/thanks/');
  assert.equal(thanks.headers.get('Cache-Control'), 'no-store');
  assert.equal((await server.fetch('/api/checkout')).status, 405);
  assert.equal((await server.fetch('/api/loops/unknown.json')).status, 404);
  console.log(
    'Local Cloudflare checks passed: public feeds, Markdown MIME, CORS, cache, sitemap and private-route isolation.',
  );
} catch {
  console.error(
    'Local Cloudflare discovery check failed. No runtime details or private values printed.',
  );
  process.exitCode = 1;
} finally {
  await server?.stop();
}
