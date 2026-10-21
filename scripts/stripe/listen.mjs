import { cliProcess } from './cli.mjs';
const child = cliProcess([
  'listen',
  '--forward-to',
  'localhost:8787/api/stripe/webhook',
  '--events',
  'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,charge.refunded,charge.dispute.created',
]);
let ready = false;
const inspect = (chunk) => {
  if (!ready && String(chunk).includes('Ready!')) {
    ready = true;
    console.log(
      'Stripe test listener ready. Private notification details are hidden.',
    );
  }
};
child.stdout.on('data', inspect);
child.stderr.on('data', inspect);
child.on('error', () => {
  console.error('Test listener could not start.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  if (code)
    console.error('Test listener stopped. Check your Stripe test login.');
});
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
