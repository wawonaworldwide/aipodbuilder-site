import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_WRITE_LOGS = 'false';
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './worker/index.ts',
      remoteBindings: false,
      miniflare: {
        compatibilityDate: '2026-10-19',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['DOWNLOADS'],
        bindings: {
          LOCAL_DEV: 'true',
          TURNSTILE_MODE: 'mock',
          EMAIL_PROVIDER: 'log',
          PUBLIC_SITE_URL: 'http://localhost:8787',
        },
      },
    }),
  ],
  test: { include: ['tests/worker/**/*.test.ts'], fileParallelism: false },
});
