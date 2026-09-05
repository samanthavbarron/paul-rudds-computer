import { defineConfig } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.PORT || 5173}`;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  outputDir: 'artifacts/browser-tests',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1060 },
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    },
  },
  webServer: { command: 'npm run start', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
