import { spawnSync } from 'node:child_process';
import { localConfig } from './local-config.mjs';
const { path } = localConfig();
const result = spawnSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--config',
    path,
    '--persist-to',
    '.wrangler/state',
  ],
  { encoding: 'utf8', input: 'y\n', windowsHide: true, env: process.env },
);
if (result.status === 0)
  console.log(
    'Local database migrations applied. No remote database was changed.',
  );
else {
  console.error('Local migration failed. Details withheld.');
  process.exitCode = 1;
}
