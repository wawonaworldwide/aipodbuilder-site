import { cli } from './cli.mjs';
import { updatePrivateVar } from '../private-vars.mjs';
try {
  const output = cli(['listen', '--print-secret']);
  const value = output.match(/\bwhsec_[A-Za-z0-9]+\b/)?.[0];
  if (!value) throw Error();
  updatePrivateVar('STRIPE_WEBHOOK_SECRET', value);
  console.log('Local webhook setting saved. Value withheld.');
} catch {
  console.error(
    'Webhook setup could not finish. Check your Stripe test-mode login.',
  );
  process.exitCode = 1;
}
