import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5194',
    viewport: { width: 1024, height: 900 },
    deviceScaleFactor: 1,
    channel: process.env.PW_CHANNEL || 'chrome',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5194 --strictPort',
    url: 'http://127.0.0.1:5194',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
