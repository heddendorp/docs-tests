import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['DOCS_BASE_URL'] ?? 'http://localhost:3000';
const webServerCommand = process.env['DOCS_WEB_SERVER_COMMAND'];
const listOnly = process.argv.includes('--list');

export default defineConfig({
  forbidOnly: Boolean(process.env['CI']),
  fullyParallel: false,
  reporter: listOnly
    ? [['dot']]
    : [
        ['html', { open: 'never' }],
        ['dot'],
        ['./src/reporter.ts'],
      ],
  retries: process.env['CI'] ? 1 : 0,
  testDir: './tests',
  use: {
    baseURL,
    colorScheme: 'light',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'unit',
      testMatch: /unit\/.*\.spec\.ts$/,
    },
    {
      name: 'auth-setup',
      testMatch: /setup\/auth\.setup\.ts$/,
      use: devices['Desktop Chrome'],
    },
    {
      dependencies: ['auth-setup'],
      name: 'docs',
      testMatch: /docs\/.*\.doc\.ts$/,
      timeout: 60_000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/docs-user.json',
      },
    },
  ],
  ...(webServerCommand
    ? {
        webServer: {
          command: webServerCommand,
          reuseExistingServer: true,
          timeout: 120_000,
          url: baseURL,
        },
      }
    : {}),
});
