import { spawnSync } from 'node:child_process';
import { writeFileSync, renameSync } from 'node:fs';
import { readDeploymentConfig } from './deployment-config.mjs';

const config = readDeploymentConfig();
const preview = config.env.preview;
const hostname = new URL(preview.vars.PUBLIC_SITE_URL).hostname;
const name = 'AI POD Builder preview';
const createArgs = [
  'turnstile',
  'widget',
  'create',
  name,
  '--domain',
  hostname,
  '--mode',
  'managed',
  '--json',
];
const secretArgs = [
  'secret',
  'put',
  'TURNSTILE_SECRET_KEY',
  '--env',
  'preview',
];

// Plan mode never invokes Wrangler or reads private settings.
if (!process.argv.includes('--apply')) {
  console.log('Plan only. No account request or credential access.');
  console.log(`Create managed Turnstile widget: ${name}`);
  console.log(`Allowed hostname: ${hostname}`);
  console.log(
    `npx --no-install wrangler turnstile widget create "${name}" --domain ${hostname} --mode managed --json`,
  );
  console.log(
    'npx --no-install wrangler secret put TURNSTILE_SECRET_KEY --env preview',
  );
  console.log(
    'The helper captures the credential in memory, disables Wrangler disk logs and sends it through stdin. Never run the raw create/get command in a recorded terminal.',
  );
  console.log(
    'If the matching widget already exists, reuse it through widget get; do not create a duplicate.',
  );
  console.log(
    'Secret storage can create/deploy the preview Worker shell. Site deployment is a separate step.',
  );
} else {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--apply')
      throw Error('Use only --apply after explicit approval.');
    if (
      hostname !== 'aipodbuilder-preview.wawonaworldwide.workers.dev' ||
      preview.name !== 'aipodbuilder-preview' ||
      preview.vars.STORE_MODE !== 'off'
    )
      throw Error('Preview configuration changed; review the plan again.');
    const run = (args, input) => {
      const result = spawnSync(
        process.execPath,
        ['node_modules/wrangler/bin/wrangler.js', ...args],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          input,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            CI: 'true',
            WRANGLER_WRITE_LOGS: 'false',
            WRANGLER_SEND_METRICS: 'false',
            WRANGLER_LOG: 'log',
            WRANGLER_LOG_SANITIZE: 'true',
          },
        },
      );
      if (result.status !== 0)
        throw Error(
          'Cloudflare command did not complete successfully. Details withheld to protect credentials. Check resource state before retrying.',
        );
      return result.stdout;
    };
    const widgets = JSON.parse(run(['turnstile', 'widget', 'list', '--json']));
    if (!Array.isArray(widgets))
      throw Error('Unexpected list response. No changes made.');
    const matches = widgets.filter((widget) => widget.name === name);
    if (matches.length > 1)
      throw Error('Multiple matching widgets; review before proceeding.');
    if (
      matches.length &&
      (matches[0].mode !== 'managed' ||
        matches[0].domains?.length !== 1 ||
        matches[0].domains[0] !== hostname)
    )
      throw Error('Existing widget settings differ; no changes made.');
    const widget = JSON.parse(
      run(
        matches.length
          ? ['turnstile', 'widget', 'get', matches[0].sitekey, '--json']
          : createArgs,
      ),
    );
    if (
      typeof widget.sitekey !== 'string' ||
      typeof widget.secret !== 'string' ||
      !widget.secret ||
      widget.mode !== 'managed' ||
      widget.domains?.length !== 1 ||
      widget.domains[0] !== hostname
    )
      throw Error(
        'Widget response was incomplete. Details withheld; check resource state before retrying.',
      );
    preview.vars.PUBLIC_TURNSTILE_SITE_KEY = widget.sitekey;
    writeFileSync('wrangler.jsonc.tmp', JSON.stringify(config, null, 2) + '\n');
    renameSync('wrangler.jsonc.tmp', 'wrangler.jsonc');
    console.log('Public widget key saved in the preview configuration.');
    run(secretArgs, widget.secret + '\n');
    widget.secret = '';
    console.log(
      'Preview Turnstile credential stored. No private values were displayed or saved locally. Website deployment remains a separate action.',
    );
  } catch (error) {
    // Never output raw child-process data, JSON parsing errors, or credentials.
    console.error(
      error instanceof SyntaxError
        ? 'Unexpected Cloudflare JSON response. Details withheld; inspect resource state before retrying.'
        : 'Preview setup stopped. No credential values displayed. Check widget and Worker state before retrying.',
    );
    process.exitCode = 1;
  }
}
