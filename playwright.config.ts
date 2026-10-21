import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const temp = resolve('.local-tools/browser-temp');
mkdirSync(temp, { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4321',
    channel: 'msedge',
    colorScheme: 'dark',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Edge'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:worker -- --test',
      url: 'http://localhost:8787',
      reuseExistingServer: false,
      timeout: 90000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:4321',
      reuseExistingServer: false,
      timeout: 120000,
      env: { ASTRO_TELEMETRY_DISABLED: '1', SHOW_DRAFTS: 'true' },
    },
  ],
});
