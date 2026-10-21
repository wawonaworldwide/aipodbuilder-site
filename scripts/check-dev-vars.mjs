import { randomBytes } from 'node:crypto';
import {
  readPrivateVars,
  updatePrivateVar,
  assertTestKey,
} from './private-vars.mjs';
try {
  let values = readPrivateVars();
  assertTestKey(values);
  if (
    process.argv.includes('--initialize-download-secret') &&
    !values.DOWNLOAD_TOKEN_SECRET
  ) {
    updatePrivateVar(
      'DOWNLOAD_TOKEN_SECRET',
      randomBytes(32).toString('base64url'),
    );
    values = readPrivateVars();
  }
  for (const name of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DOWNLOAD_TOKEN_SECRET',
  ])
    console.log(name + ': set ' + (values[name] ? 'yes' : 'no'));
  console.log(
    'Stripe key uses test prefix: ' +
      (/^(sk|rk)_test_/.test(values.STRIPE_SECRET_KEY || '') ? 'yes' : 'no'),
  );
} catch {
  console.error(
    'Local settings need attention. A non-test Stripe key is not allowed. Values withheld.',
  );
  process.exitCode = 1;
}
