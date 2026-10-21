import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { startLocalSignup } from './local-signup.mjs';
const directory = resolve('output/performance');
const temp = resolve('.local-tools/performance-browser');
mkdirSync(directory, { recursive: true });
mkdirSync(temp, { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
const pages = [
  ['home', '/'],
  ['episode', '/episodes/e11-image-api-ranker/'],
  ['post', '/blog/meet-tee-bot/'],
  ['loop', '/loops/listing-seo-loop/'],
  ['product', '/apps/ornament-bulk-creator/'],
];
const save = (path, text) => {
  writeFileSync(path + '.tmp', text);
  renameSync(path + '.tmp', path);
};
function build(indexable) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'run', 'build'],
    {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 12 * 1024 * 1024,
      env: {
        ...process.env,
        SHOW_DRAFTS: String(indexable),
        PUBLIC_INDEXABLE: String(indexable),
        ASTRO_TELEMETRY_DISABLED: '1',
      },
    },
  );
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw Error('Performance build failed.');
  }
  console.log(
    indexable
      ? 'Local indexable audit build prepared; no publication.'
      : 'Standard preview build restored: drafts hidden, noindex retained.',
  );
}
const result = {
  testedAt: new Date().toISOString(),
  mode: 'mobile Lighthouse default simulated throttling; isolated local indexable build',
  interactionMode:
    'laboratory interactions at 4x CPU throttling; not field INP',
  limits: {
    lcpMs: 2000,
    inpMs: 200,
    cls: 0.05,
    jsGzip: 30 * 1024,
    cssGzip: 40 * 1024,
    fontCount: 3,
    fontBytes: 120 * 1024,
    homeTransferBytes: 500 * 1024,
    minimumScore: 95,
  },
  pages: [],
};
for (const port of [4321, 8787]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(
        Error(
          'Stop the existing local service on port ' +
            port +
            ' before the performance audit.',
        ),
      ),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
let server, browser, ownedBrowser;
const failures = [];
try {
  if (!process.env.npm_execpath) throw Error('Run npm run test:perf.');
  build(true);
  server = await startLocalSignup({ test: true, ephemeral: true });
  // Use only the two permitted local ports. Astro is stopped during this audit.
  ownedBrowser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--remote-debugging-port=4321'],
  });
  browser = await puppeteer.connect({ browserURL: 'http://localhost:4321' });
  const vitals = readFileSync(
    'node_modules/web-vitals/dist/web-vitals.iife.js',
    'utf8',
  );
  for (const [name, path] of pages) {
    const page = await browser.newPage();
    const { lhr } = await lighthouse(
      'http://localhost:8787' + path,
      {
        logLevel: 'error',
        onlyCategories: [
          'performance',
          'accessibility',
          'best-practices',
          'seo',
        ],
      },
      undefined,
      page,
    );
    if (lhr.runtimeError)
      throw Error('Lighthouse did not complete for ' + name);
    save(resolve(directory, name + '.json'), JSON.stringify(lhr, null, 2));
    const requests = lhr.audits['network-requests'].details.items;
    const seen = new Set();
    const bytes = {
      jsGzip: 0,
      cssGzip: 0,
      fontCount: 0,
      fontBytes: 0,
      totalTransferBytes: 0,
    };
    for (const request of requests) {
      if (seen.has(request.url) || !request.url.startsWith('http')) continue;
      seen.add(request.url);
      bytes.totalTransferBytes += request.transferSize || 0;
      const url = new URL(request.url);
      if (url.origin !== 'http://localhost:8787') {
        failures.push(name + ': unexpected initial external resource');
        continue;
      }
      if (/\.(?:m?js|css|woff2?)(?:$)/.test(url.pathname)) {
        const source = readFileSync(
          resolve('dist', '.' + decodeURIComponent(url.pathname)),
        );
        if (/\.m?js$/.test(url.pathname))
          bytes.jsGzip += gzipSync(source).length;
        if (/\.css$/.test(url.pathname))
          bytes.cssGzip += gzipSync(source).length;
        if (/\.woff2?$/.test(url.pathname)) {
          bytes.fontCount++;
          bytes.fontBytes += source.length;
        }
      }
    }
    const html = readFileSync(
      resolve('dist', '.' + path, 'index.html'),
      'utf8',
    );
    const inlineScript = [
      ...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
    ]
      .map((x) => x[1])
      .join('\n');
    const inlineStyle = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
      .map((x) => x[1])
      .join('\n');
    if (inlineScript) bytes.jsGzip += gzipSync(inlineScript).length;
    if (inlineStyle) bytes.cssGzip += gzipSync(inlineStyle).length;
    await page.close();
    const interaction = await browser.newPage();
    await interaction.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const cdp = await interaction.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await interaction.evaluateOnNewDocument(
      vitals +
        ';globalThis.phase6INP=null;webVitals.onINP(m=>{globalThis.phase6INP=m.value},{reportAllChanges:true});',
    );
    await interaction.goto('http://localhost:8787' + path, {
      waitUntil: 'networkidle0',
    });
    for (let count = 0; count < 6; count++) {
      await interaction.click('[data-theme-toggle]');
      await delay(100);
    }
    const wrap = await interaction.$('[data-wrap]');
    if (wrap) {
      await wrap.click();
      await delay(100);
    }
    await delay(700);
    const inp = await interaction.evaluate(() => globalThis.phase6INP);
    await interaction.close();
    const scores = Object.fromEntries(
      Object.entries(lhr.categories).map(([key, value]) => [
        key,
        Math.round(value.score * 100),
      ]),
    );
    const metrics = {
      lcpMs: lhr.audits['largest-contentful-paint'].numericValue,
      cls: lhr.audits['cumulative-layout-shift'].numericValue,
      labInpMs: inp,
      ...bytes,
    };
    for (const [metric, limit] of [
      ['lcpMs', 2000],
      ['cls', 0.05],
      ['labInpMs', 200],
      ['jsGzip', 30 * 1024],
      ['cssGzip', 40 * 1024],
      ['fontCount', 3],
      ['fontBytes', 120 * 1024],
    ])
      if (typeof metrics[metric] !== 'number' || metrics[metric] > limit)
        failures.push(name + ': ' + metric + ' budget');
    for (const [category, score] of Object.entries(scores))
      if (score < 95) failures.push(name + ': ' + category + ' score');
    if (name === 'home' && metrics.totalTransferBytes > 500 * 1024)
      failures.push('home: transfer size budget');
    result.pages.push({ name, path, scores, metrics });
    console.log(
      name +
        ': ' +
        JSON.stringify({
          scores,
          lcpMs: Math.round(metrics.lcpMs),
          labInpMs: inp,
          cls: metrics.cls,
          jsGzip: bytes.jsGzip,
          cssGzip: bytes.cssGzip,
          fontCount: bytes.fontCount,
          fontBytes: bytes.fontBytes,
        }),
    );
  }
  result.failures = failures;
  save(resolve(directory, 'summary.json'), JSON.stringify(result, null, 2));
  if (failures.length) {
    console.error('Performance budgets failed: ' + failures.join('; '));
    process.exitCode = 1;
  } else
    console.log(
      'All five pages meet the mobile performance, laboratory interaction, resource and Lighthouse score budgets.',
    );
} finally {
  await browser?.disconnect();
  await ownedBrowser?.close();
  await server?.stop();
  build(false);
}
