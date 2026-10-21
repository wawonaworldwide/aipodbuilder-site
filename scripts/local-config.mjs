import { resolve } from 'node:path';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
export function localConfig(test = false) {
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_WRITE_LOGS = 'false';
  process.env.WRANGLER_LOG = 'none';
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  const folder = resolve('.local-tools/phase5');
  mkdirSync(folder, { recursive: true });
  if (existsSync(resolve(folder, '.dev.vars')))
    throw Error('Isolated config must not contain private vars.');
  const config = JSON.parse(
    readFileSync('wrangler.jsonc', 'utf8').replace(/,\s*([}\]])/g, '$1'),
  );
  config.main = resolve('worker/index.ts');
  config.assets.directory = resolve('dist');
  config.d1_databases.forEach(
    (d) => (d.migrations_dir = resolve('migrations')),
  );
  config.vars.EMAIL_PROVIDER = 'log';
  config.vars.MAIL_PROVIDER = 'log';
  config.vars.LOCAL_DEV = 'true';
  config.vars.STORE_MODE = 'test';
  config.vars.TURNSTILE_MODE = test ? 'mock' : 'verify';
  const path = resolve(folder, 'wrangler.json');
  writeFileSync(path + '.tmp', JSON.stringify(config));
  renameSync(path + '.tmp', path);
  return { config, path, folder };
}
