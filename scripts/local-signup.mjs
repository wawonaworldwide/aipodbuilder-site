import { randomUUID, randomBytes } from 'node:crypto';
import { localConfig } from './local-config.mjs';
import { exportDelivery } from './export-delivery.mjs';
import { setInterval, clearInterval, setTimeout } from 'node:timers';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
export async function exportOutbox(db, directory = '.dev-outbox') {
  const { results } = await db
    .prepare(
      'SELECT id,payload FROM email_outbox ORDER BY created_at,id LIMIT 100',
    )
    .all();
  if (!results.length) return 0;
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'subscribers.jsonl');
  const prior = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const known = new Set(
    prior
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).id),
  );
  const additions = results
    .filter((row) => !known.has(row.id))
    .map((row) => row.payload + '\n')
    .join('');
  if (additions) {
    writeFileSync(path + '.tmp', prior + additions);
    renameSync(path + '.tmp', path);
  }
  await db.batch(
    results.map((row) =>
      db.prepare('DELETE FROM email_outbox WHERE id=?').bind(row.id),
    ),
  );
  return results.length;
}
export async function startLocalSignup({
  test = false,
  ephemeral = false,
  useStripe = false,
} = {}) {
  const { config, path: configPath, folder } = localConfig(test);
  const runtime = {
    DOWNLOAD_TOKEN_SECRET: randomBytes(32).toString('base64url'),
  };
  if (useStripe && !test) {
    const { readPrivateVars, assertTestKey } =
      await import('./private-vars.mjs');
    const values = readPrivateVars();
    assertTestKey(values);
    if (values.STRIPE_SECRET_KEY) {
      if (
        !values.DOWNLOAD_TOKEN_SECRET ||
        values.DOWNLOAD_TOKEN_SECRET.length < 32
      )
        throw Error('Initialize the local download setting first.');
      for (const name of [
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'DOWNLOAD_TOKEN_SECRET',
      ])
        if (values[name]) runtime[name] = values[name];
    }
  }
  const { getPlatformProxy, unstable_dev } = await import('wrangler');
  const state = ephemeral
    ? resolve(folder, 'state-' + randomUUID())
    : resolve('.wrangler/state');
  const platform = await getPlatformProxy({
    configPath,
    envFiles: [],
    remoteBindings: false,
    persist: { path: state + '/v3' },
  });
  let server;
  let timer;
  let exporting = false;
  let maintenanceRunning = false;
  let lastMaintenance = Date.now();
  const flush = async () => {
    if (exporting) return;
    exporting = true;
    try {
      await exportOutbox(
        platform.env.DB,
        test ? '.local-tools/phase4/outbox' : '.dev-outbox',
      );
      await exportDelivery(
        platform.env.DB,
        test ? '.local-tools/phase4/outbox' : '.dev-outbox',
      );
    } finally {
      exporting = false;
    }
  };
  try {
    for (const file of readdirSync('migrations')
      .filter((x) => x.endsWith('.sql'))
      .sort())
      await platform.env.DB.exec(
        readFileSync('migrations/' + file, 'utf8').replace(/^--.*$/gm, ''),
      );
    server = await unstable_dev(config.main, {
      config: configPath,
      vars: runtime,
      envFiles: [],
      local: true,
      ip: 'localhost',
      port: 8787,
      inspect: false,
      inspectorPort: 0,
      logLevel: 'none',
      persist: true,
      persistTo: state,
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
        fileBasedRegistry: false,
        watch: true,
        showInteractiveDevSession: false,
      },
    });
    timer = setInterval(() => {
      if (
        !test &&
        !maintenanceRunning &&
        Date.now() - lastMaintenance > 30000
      ) {
        maintenanceRunning = true;
        lastMaintenance = Date.now();
        void server
          .fetch('/api/_local/maintenance', {
            method: 'POST',
            headers: { 'x-local-maintenance': runtime.DOWNLOAD_TOKEN_SECRET },
          })
          .catch(() => {})
          .finally(() => {
            maintenanceRunning = false;
          });
      }
      void flush().catch(() =>
        console.error('Local outbox could not be saved. It will retry.'),
      );
    }, 1000);
    return {
      server,
      db: platform.env.DB,
      flush,
      async stop() {
        clearInterval(timer);
        await server.stop();
        while (exporting) await new Promise((r) => setTimeout(r, 20));
        await flush();
        await platform.dispose();
      },
    };
  } catch (error) {
    clearInterval(timer);
    await server?.stop();
    await platform.dispose();
    throw error;
  }
}
