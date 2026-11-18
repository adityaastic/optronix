import { defineConfig, devices } from '@playwright/test';

const E2E_DB_URI =
  process.env.MONGODB_E2E_URI ??
  'mongodb://127.0.0.1:27017/optronix_e2e_playwright';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    permissions: ['geolocation'],
    geolocation: { latitude: 28.495, longitude: 77.089 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --dir ../backend seed && pnpm --dir ../backend exec tsx src/server.ts',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: '4000',
        MONGODB_URI: E2E_DB_URI,
        CORS_ORIGIN: 'http://localhost:3000',
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_URL: 'http://localhost:4000/api/v1',
      },
    },
  ],
});
