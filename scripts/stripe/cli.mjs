import { spawnSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
export const cliPath = resolve('node_modules/@stripe/cli/bin/shim.js');
const safeEnv = () => ({
  ...process.env,
  STRIPE_NO_AUTO_UPDATE: '1',
  STRIPE_API_KEY: undefined,
  STRIPE_LOG: undefined,
});
export function cli(args, { timeout = 30000 } = {}) {
  if (args.some((x) => x === '--live' || x === '--api-key'))
    throw Error('Live mode and key arguments are unavailable in Phase 5.');
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    env: safeEnv(),
  });
  if (result.status !== 0)
    throw Error(
      'Stripe CLI request failed. Check test-mode login and permissions.',
    );
  return result.stdout;
}
export const cliProcess = (args) =>
  spawn(process.execPath, [cliPath, ...args], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: safeEnv(),
  });
