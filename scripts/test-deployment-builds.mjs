import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { readDeploymentConfig } from './deployment-config.mjs';
const run = (script) => {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'run', script],
    {
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 12 * 1024 * 1024,
      env: {
        ...process.env,
        ASTRO_TELEMETRY_DISABLED: '1',
        SHOW_DRAFTS: 'false',
        PUBLIC_INDEXABLE: 'false',
        PUBLIC_DEPLOY_ENV: 'local',
        PUBLIC_CF_ANALYTICS_TOKEN: '',
      },
    },
  );
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    throw Error('Deployment profile build failed.');
  }
};
if (!process.env.npm_execpath) throw Error('Use npm run test:deployment.');
try {
  run('build:preview');
  const preview = readFileSync('dist/index.html', 'utf8');
  const emailConnected =
    readDeploymentConfig().env.preview.vars.EMAIL_PROVIDER === 'kit';
  assert(preview.includes('PREVIEW · App downloads coming soon.'));
  const product = readFileSync(
    'dist/apps/ornament-bulk-creator/index.html',
    'utf8',
  );
  assert(!product.includes('action="/api/checkout"'));
  assert(product.includes('id="launch-email"'));
  for (const path of [
    'index.html',
    'newsletter/index.html',
    'newsletter/thanks/index.html',
    'download/expired/index.html',
    'thanks/index.html',
  ]) {
    const html = readFileSync('dist/' + path, 'utf8');
    assert(
      !html.includes('this PC'),
      path + ' must not describe remote storage as local',
    );
    if (!emailConnected)
      assert(
        !html.includes('Check your inbox to confirm.'),
        path + ' must not promise an email without delivery',
      );
  }
  assert(
    !readFileSync('dist/download/expired/index.html', 'utf8').includes(
      'action="/api/resend-download"',
    ),
  );
  assert(
    preview.includes(
      'Confirm your subscription using the email we send you.',
    ) === emailConnected,
  );
  assert(
    readFileSync('dist/newsletter/index.html', 'utf8').includes(
      'Newsletter delivery is not connected yet.',
    ) === !emailConnected,
  );
  assert(
    readFileSync('dist/newsletter/thanks/index.html', 'utf8').includes(
      'Check your inbox to confirm.',
    ) === emailConnected,
  );
  assert(preview.includes('content="noindex, follow"'));
  assert(!preview.includes('Emails stay on this PC.'));
  assert(!preview.includes('data-cf-beacon'));
  assert(existsSync('dist/apps/ornament-bulk-creator/index.html'));
  console.log(
    'Preview build: drafts shown, noindex retained, hosted test label, analytics off.',
  );
  run('build:production');
  const production = readFileSync('dist/index.html', 'utf8');
  assert(!production.includes('TEST MODE · No real charges.'));
  assert(!production.includes('action="/api/checkout"'));
  assert(production.includes('content="index, follow"'));
  assert(existsSync('dist/free/s01/index.html'));
  assert(!existsSync('dist/episodes/s01-day-with-my-pod-pipeline/index.html'));
  const starter = readFileSync('dist/free/s01/index.html', 'utf8');
  assert(starter.includes('Three free POD starter prompts'));
  const source = JSON.parse(
    readFileSync('tests/fixtures/editorial/s01-source.json', 'utf8'),
  );
  const decode = (s) =>
    s
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
  const payloads = [
    ...source.prompts.matchAll(
      /## (s01-\S+) — "([^"]+)"\n~~~\n([\s\S]*?)\n~~~/g,
    ),
  ];
  assert.equal(payloads.length, 3);
  for (const m of payloads)
    assert(decode(starter).includes(m[3]), 'Exact starter prompt must appear');
  assert(
    !readFileSync('dist/_headers', 'utf8').includes('X-Robots-Tag: noindex'),
  );
  assert(!starter.includes('/episodes/s01-day-with-my-pod-pipeline/'));
  for (const policy of ['privacy', 'terms', 'refunds', 'license']) {
    const html = readFileSync('dist/' + policy + '/index.html', 'utf8');
    assert(!html.includes('This policy is still being reviewed.'));
    assert(html.includes('tee-bot@aipodbuilder.com'));
  }
  assert(!existsSync('dist/apps/ornament-bulk-creator/index.html'));
  console.log(
    'Production build: draft episodes hidden, starter prompts available, checkout off, public indexing enabled.',
  );
} finally {
  run('build');
  console.log(
    'Standard local build restored; no deployment or account request.',
  );
}
