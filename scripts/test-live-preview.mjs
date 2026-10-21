import {
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
const origin = 'https://aipodbuilder-preview.wawonaworldwide.workers.dev';
import { ownerNamePresent, pricePlacementIssue } from './content-rules.mjs';
import { readDeploymentConfig } from './deployment-config.mjs';
const paths = [];
const textPaths = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (
      !entry.isDirectory() &&
      /\.(html|md|json|xml|txt|svg)$/.test(entry.name)
    )
      textPaths.push(
        '/' +
          path
            .replaceAll('\\', '/')
            .replace(/^dist\//, '')
            .replace(/index\.html$/, ''),
      );
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.html'))
      paths.push(
        '/' +
          path
            .replaceAll('\\', '/')
            .replace(/^dist\//, '')
            .replace(/index\.html$/, ''),
      );
  }
}
walk('dist');
const cache = new Map();
const get = (path) => {
  const url = new URL(path, origin);
  url.hash = '';
  if (!cache.has(url.href))
    cache.set(
      url.href,
      (async () => {
        const res = await globalThis.fetch(url, {
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
};
const report = {
  origin,
  pages: [],
  links: [],
  api: [],
  contentChecks: [],
  missingReleaseInputs: [
    'real app ZIP',
    'live payments',
    'real newsletter double-opt-in delivery acceptance',
    'reviewed launch content',
  ],
};
for (const path of paths) {
  try {
    const res = await get(path);
    const expected = path === '/404.html' ? [200, 404] : [200];
    const graphs = [
      ...res.body.matchAll(
        /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ];
    let jsonValid = graphs.length > 0;
    try {
      graphs.forEach((m) => JSON.parse(m[1]));
    } catch {
      jsonValid = false;
    }
    report.pages.push({
      path,
      status: res.status,
      passed:
        expected.includes(res.status) &&
        res.headers['x-robots-tag'] === 'noindex, nofollow' &&
        jsonValid,
      staleLocalCopy: res.body.includes('this PC'),
    });
    for (const match of res.body.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
      const target = new URL(match[1].replaceAll('&amp;', '&'), origin + path);
      if (target.origin !== origin) continue;
      const targetPath = target.pathname + target.search;
      const targetRes = await get(targetPath);
      const fragment = target.hash && decodeURIComponent(target.hash.slice(1));
      const fragmentExists =
        !fragment || targetRes.body.includes(`id="${fragment}"`);
      report.links.push({
        from: path,
        to: targetPath + target.hash,
        passed: targetRes.status === 200 && Boolean(fragmentExists),
      });
    }
  } catch {
    report.pages.push({
      path,
      passed: false,
      error: 'Request or parsing failed; transport details withheld.',
    });
  }
}
for (const path of [
  '/api/loops.json',
  '/api/prompts.json',
  '/api/skills.json',
]) {
  try {
    const r = await get(path);
    JSON.parse(r.body);
    report.api.push({
      path,
      passed:
        r.status === 200 &&
        r.headers['access-control-allow-origin'] === '*' &&
        r.headers['x-robots-tag'] === 'noindex, nofollow',
    });
  } catch {
    report.api.push({ path, passed: false });
  }
}
for (const path of [
  '/llms.txt',
  '/llms-full.txt',
  '/rss.xml',
  '/robots.txt',
  '/sitemap-index.xml',
  '/sitemap.xml',
  '/loops/design-qa-loop.md',
]) {
  try {
    const r = await get(path);
    report.api.push({
      path,
      passed:
        r.status === 200 && r.headers['x-robots-tag'] === 'noindex, nofollow',
    });
  } catch {
    report.api.push({ path, passed: false });
  }
}
try {
  const checkout = await get('/api/checkout');
  report.api.push({
    path: '/api/checkout',
    passed:
      checkout.status === 404 &&
      JSON.parse(checkout.body).message ===
        'This app is not available to buy yet.',
  });
  const denied = await globalThis.fetch(origin + '/api/subscribe', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'preview-qa-no-token@example.test',
      source: '/newsletter/',
      mode: 'weekly',
      'cf-turnstile-response': '',
    }),
    signal: globalThis.AbortSignal.timeout(30000),
  });
  const result = await denied.json();
  report.api.push({
    path: '/api/subscribe (missing bot token)',
    passed:
      denied.status === 400 &&
      result.ok === false &&
      result.field === 'turnstile',
  });
} catch {
  report.api.push({ path: 'form protection checks', passed: false });
}
const expectsKit =
  readDeploymentConfig().env.preview.vars.EMAIL_PROVIDER === 'kit';
const newsletter = (await get('/newsletter/')).body;
report.api.push({
  path: 'Newsletter delivery copy matches deployed provider',
  passed:
    newsletter.includes(
      'Confirm your subscription using the email we send you.',
    ) === expectsKit &&
    newsletter.includes('Newsletter delivery is not connected yet.') ===
      !expectsKit &&
    newsletter.includes('action="/api/subscribe"') &&
    newsletter.includes('data-turnstile'),
});
for (const path of textPaths) {
  const res = await get(path);
  report.contentChecks.push({
    path,
    passed:
      (res.status === 200 || (path === '/404.html' && res.status === 404)) &&
      !ownerNamePresent(res.body) &&
      !pricePlacementIssue(path, res.body),
  });
}
const source = JSON.parse(
  readFileSync('tests/fixtures/editorial/s01-source.json', 'utf8'),
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
const s01 = '/episodes/s01-day-with-my-pod-pipeline';
const transcriptHtml = decode((await get(s01 + '/')).body);
const md = (await get(s01 + '.md')).body;
report.api.push({
  path: 'S01 exact transcript (HTML and Markdown)',
  passed:
    transcriptHtml.includes(source.transcript) &&
    md.includes(source.transcript),
});
const llms = (await get('/llms.txt')).body;
report.api.push({
  path: 'S01 exact llms entries',
  passed: source.llms
    .split('\n')
    .filter((line) => line.startsWith('- ['))
    .every((line) => llms.includes(line)),
});
for (const m of source.prompts.matchAll(
  /## (s01-\S+) — "([^"]+)"\n~~~\n([\s\S]*?)\n~~~/g,
)) {
  report.api.push({
    path: '/prompts/' + m[1] + ' (exact text)',
    passed:
      decode((await get('/prompts/' + m[1] + '/')).body).includes(m[3]) &&
      (await get('/prompts/' + m[1] + '.md')).body.includes(m[3]),
  });
}
const locked = readFileSync(
  'tests/fixtures/editorial/meet-tee-bot.txt',
  'utf8',
).split('\n\n')[0];
report.api.push({
  path: 'Locked Meet TEE-BOT disclosure',
  passed:
    decode((await get('/blog/meet-tee-bot/')).body).includes(locked) &&
    (await get('/blog/meet-tee-bot.md')).body.includes(locked),
});
const short = await globalThis.fetch(origin + '/free/s01', {
  redirect: 'manual',
});
report.api.push({
  path: '/free/s01',
  passed:
    short.status === 302 &&
    new URL(short.headers.get('location'), origin).href ===
      origin + s01 + '/#prompts' &&
    (await get('/free/s01')).status === 200,
});
const sitemap = (await get('/sitemap.xml')).body;
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => new URL(m[1]).pathname,
);
report.api.push({
  path: 'Sitemap public routes and S01',
  passed:
    sitemap === readFileSync('dist/sitemap.xml', 'utf8') &&
    locations.includes(s01 + '/') &&
    locations.every(
      (path) =>
        !/^\/(api|free|thanks|download)(\/|$)/.test(path) &&
        path !== '/newsletter/thanks/',
    ),
});
mkdirSync('output/playwright/live', { recursive: true });
const file = 'output/playwright/live/http-audit.json';
writeFileSync(file + '.tmp', JSON.stringify(report, null, 2) + '\n');
renameSync(file + '.tmp', file);
const failed = [
  ...report.pages,
  ...report.links,
  ...report.api,
  ...report.contentChecks,
].filter((x) => !x.passed);
console.log(
  JSON.stringify(
    {
      pages: report.pages.length,
      internalLinkAndAssetChecks: report.links.length,
      uniqueRequests: cache.size,
      apiChecks: report.api.length,
      ownerNameAndPriceChecks: report.contentChecks.length,
      failed,
      staleCopyPages: report.pages
        .filter((x) => x.staleLocalCopy)
        .map((x) => x.path),
    },
    null,
    2,
  ),
);
if (failed.length) process.exitCode = 1;
