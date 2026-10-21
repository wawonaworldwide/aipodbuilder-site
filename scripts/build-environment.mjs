import { spawnSync } from 'node:child_process';
import { publicBuildSettings } from './deployment-config.mjs';
const name = process.argv[2];
const settings = publicBuildSettings(name);
if (!process.env.npm_execpath)
  throw Error('Use npm run build:preview or build:production.');
const result = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'run', 'build'],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...settings, ASTRO_TELEMETRY_DISABLED: '1' },
  },
);
process.exitCode = result.status ?? 1;
