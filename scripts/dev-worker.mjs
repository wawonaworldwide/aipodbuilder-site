import { startLocalSignup } from './local-signup.mjs';
try {
  const local = await startLocalSignup({
    test: process.argv.includes('--test'),
    useStripe: process.argv.includes('--stripe'),
    ephemeral: process.argv.includes('--test'),
  });
  console.log(
    'Local test site ready at http://localhost:8787. Email stays on this PC.',
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await local.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch {
  console.error(
    'Local signup server could not start. Check that port 8787 is free and the site is built.',
  );
  process.exitCode = 1;
}
