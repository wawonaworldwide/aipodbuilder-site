import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import assert from 'node:assert/strict';
import { siteDisclosure } from '../src/lib/site-editorial.ts';
import { ownerNamePresent, pricePlacementIssue } from './content-rules.mjs';
import { readDeploymentConfig } from './deployment-config.mjs';
const origin = 'https://aipodbuilder.com';
const config = readDeploymentConfig().env.production;
assert.equal(config.vars.STORE_MODE, 'off');
assert(
  readFileSync('dist/index.html', 'utf8').includes('content="index, follow"'),
  'Build production before auditing.',
);
const cache = new Map();
async function get(path) {
  const url = new URL(path, origin);
  url.hash = '';
  assert(['aipodbuilder.com', 'www.aipodbuilder.com'].includes(url.hostname));
  if (!cache.has(url.href))
    cache.set(
      url.href,
      (async () => {
        const res = await globalThis.fetch(url, {
          redirect: 'manual',
          signal: globalThis.AbortSignal.timeout(30000),
        });
        return {
          status: res.status,
          headers: Object.fromEntries(res.headers),
          body: await res.text(),
        };
      })(),
    );
  return cache.get(url.href);
}
const checks = [];
function check(name, passed) {
  checks.push({ name, passed: Boolean(passed) });
}
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(dir + '/' + e.name) : [dir + '/' + e.name],
  );
const privateRoute = (path) =>
  path === '/404.html' ||
  path === '/thanks/' ||
  path === '/newsletter/thanks/' ||
  path.startsWith('/download/');
for (const file of files('dist').filter((f) =>
  /\.(html|md|json|xml|txt|svg)$/.test(f),
)) {
  const path = '/' + file.slice(5).replace(/index\.html$/, '');
  let r = await get(path);
  if (path === '/404.html' && r.status === 307 && r.headers.location === '/404')
    r = await get('/404');
  check(
    path + ' status',
    r.status === 200 || (path === '/404.html' && r.status === 404),
  );
  check(
    path + ' public copy',
    !ownerNamePresent(r.body) && !pricePlacementIssue(path, r.body),
  );
  if (file.endsWith('.html')) {
    check(
      path + ' security',
      r.headers['x-content-type-options'] === 'nosniff' &&
        r.headers['content-security-policy'],
    );
    if (privateRoute(path)) {
      if (path !== '/404.html')
        check(
          path + ' private headers',
          /noindex/.test(r.headers['x-robots-tag'] || '') &&
            /no-store/.test(r.headers['cache-control'] || ''),
        );
    } else
      check(
        path + ' indexing',
        r.body.includes('content="index, follow"') &&
          !/noindex/.test(r.headers['x-robots-tag'] || ''),
      );
    check(
      path + ' checkout disabled',
      !r.body.includes('action="/api/checkout"'),
    );
    for (const m of r.body.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
      const target = new URL(m[1].replaceAll('&amp;', '&'), origin + path);
      if (target.origin !== origin) continue;
      let link = await get(target.pathname + target.search);
      if ([301, 302, 307, 308].includes(link.status) && link.headers.location) {
        const next = new URL(link.headers.location, target);
        if (next.origin === origin)
          link = await get(next.pathname + next.search);
      }
      check(
        path + ' link ' + target.pathname + target.hash,
        link.status === 200 &&
          (!target.hash ||
            link.body.includes(
              'id="' + decodeURIComponent(target.hash.slice(1)) + '"',
            )),
      );
    }
  }
}
for (const path of [
  '/not-a-real-page',
  '/api/checkout',
  '/api/stripe/webhook',
  '/api/order-status',
  '/api/resend-download',
  '/api/order-updates',
  '/episodes/s01-day-with-my-pod-pipeline/',
  '/episodes/s01-day-with-my-pod-pipeline.md',
  '/apps/ornament-bulk-creator/',
]) {
  check(path + ' unavailable', (await get(path)).status === 404);
}
for (const kind of ['prompts', 'loops', 'skills']) {
  const r = await get('/api/' + kind + '.json');
  check(
    kind === 'prompts'
      ? 'Only three public starter prompts exposed'
      : kind + ' drafts absent',
    r.status === 200 &&
      JSON.parse(r.body).count === (kind === 'prompts' ? 3 : 0),
  );
}
const newsletter = (await get('/newsletter/')).body;
check(
  'Turnstile production site key',
  newsletter.includes(config.vars.PUBLIC_TURNSTILE_SITE_KEY) &&
    newsletter.includes('data-turnstile'),
);
check(
  'Kit confirmation copy',
  newsletter.includes('Confirm your subscription using the email we send you.'),
);
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
const source = JSON.parse(
  readFileSync('tests/fixtures/editorial/s01-source.json', 'utf8'),
);
const starter = decode((await get('/free/s01/')).body);
const prompts = [
  ...source.prompts.matchAll(/## (s01-\S+) — "([^"]+)"\n~~~\n([\s\S]*?)\n~~~/g),
];
check(
  'Three exact starter texts',
  prompts.length === 3 && prompts.every((m) => starter.includes(m[3])),
);
check(
  'No draft episode link',
  !starter.includes('/episodes/s01-day-with-my-pod-pipeline/'),
);
const sitemap = await get('/sitemap.xml');
check(
  'Sitemap matches production',
  sitemap.body === readFileSync('dist/sitemap.xml', 'utf8') &&
    sitemap.body.includes('/free/s01/') &&
    !sitemap.body.includes('s01-day-with'),
);
const httpsRedirect = await get(
  'http://aipodbuilder.com/free/s01/?source=audit',
);
check(
  'HTTP redirects to HTTPS preserving path and query',
  httpsRedirect.status === 308 &&
    httpsRedirect.headers.location === origin + '/free/s01/?source=audit',
);
const redirect = await get(
  'https://www.aipodbuilder.com/free/s01/?source=audit',
);
check(
  'www permanent redirect preserves path and query',
  redirect.status === 308 &&
    redirect.headers.location === origin + '/free/s01/?source=audit',
);
for (const path of ['/privacy/', '/terms/', '/refunds/', '/license/']) {
  const body = (await get(path)).body;
  check(
    path + ' legal published',
    body.includes('tee-bot@aipodbuilder.com') &&
      !body.includes('This policy is still being reviewed.'),
  );
}

const llms = (await get('/llms.txt')).body;
const full = (await get('/llms-full.txt')).body;
const feed = JSON.parse((await get('/api/prompts.json')).body);
check(
  'Three standalone starter records with MIT license',
  feed.count === 3 && feed.prompts.length === 3 && feed.license === 'MIT',
);
check(
  'No empty discovery sections or preview warning',
  JSON.stringify(llms.match(/^## .+$/gm)) ===
    JSON.stringify(['## Free prompts', '## About']) &&
    !llms.includes('Draft entries in a preview'),
);
check(
  'Starter landing page listed for agents',
  llms.includes('](https://aipodbuilder.com/free/s01/)'),
);
check(
  'Loop resource license is MIT',
  JSON.parse((await get('/api/loops.json')).body).license === 'MIT',
);
for (const [index, m] of prompts.entries()) {
  const p = feed.prompts.find((p) => p.id === m[1]);
  check(
    'Exact starter in JSON and full text ' + (index + 1),
    p?.prompt === m[3] && full.includes(m[3]),
  );
  check(
    'Starter discovery anchor ' + (index + 1),
    p?.url === origin + '/free/s01/#starter-' + (index + 1) &&
      llms.includes(p.url),
  );
  check(
    'Starter Markdown text ' + (index + 1),
    (await get('/free/s01.md')).body.includes(m[3]),
  );
}
check(
  'Locked About disclosure in HTML',
  decode((await get('/about/')).body).includes(siteDisclosure),
);
check(
  'Locked About disclosure in Markdown',
  (await get('/about.md')).body.includes(siteDisclosure),
);
const apps = (await get('/apps/')).body;
check(
  'Apps points to available starter prompts',
  apps.includes('href="/free/s01/"') &&
    !apps.includes('The prompts are free on the episode page.'),
);
const report = {
  origin,
  method: 'GET only; no signup submitted',
  passed: checks.filter((x) => x.passed).length,
  failed: checks.filter((x) => !x.passed),
  requests: cache.size,
  checks,
};
mkdirSync('output/production', { recursive: true });
writeFileSync(
  'output/production/http-audit.json.tmp',
  JSON.stringify(report, null, 2) + '\n',
);
renameSync(
  'output/production/http-audit.json.tmp',
  'output/production/http-audit.json',
);
console.log(
  JSON.stringify(
    {
      origin,
      passed: report.passed,
      failed: report.failed,
      requests: report.requests,
      method: report.method,
    },
    null,
    2,
  ),
);
if (report.failed.length) process.exitCode = 1;
