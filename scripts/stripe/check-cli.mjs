import { cli } from './cli.mjs';
let installed = false,
  loggedIn = false;
try {
  cli(['--version']);
  installed = true;
} catch {
  /* Only yes/no output. */
}
if (installed && process.argv.includes('--account'))
  try {
    const data = JSON.parse(cli(['products', 'list', '--limit', '1']));
    loggedIn =
      Array.isArray(data.data) && data.data.every((x) => x.livemode === false);
  } catch {
    /* No account output. */
  }
console.log(
  `Stripe CLI: installed ${installed ? 'yes' : 'no'}, logged in to test mode ${loggedIn ? 'yes' : 'no'}${process.argv.includes('--account') ? '' : ' (account check not requested)'}`,
);
