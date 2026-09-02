import { defineConfig, devices } from '@playwright/test';

const siteOrigin = 'http://127.0.0.1:3102';
const closedCommercialGates = {
  SNICKERDOODLE_COMMERCIAL_READY: 'false',
  SNICKERDOODLE_OFFER_APPROVED: 'false',
  SNICKERDOODLE_FULFILLMENT_READY: 'false',
  SNICKERDOODLE_REVIEWER_READY: 'false',
  SNICKERDOODLE_LEGAL_APPROVED: 'false',
  SNICKERDOODLE_PAYMENTS_READY: 'false',
  SNICKERDOODLE_G5_ASSIGNED: 'false',
  SNICKERDOODLE_MONETARY_APPROVED: 'false'
};

export default defineConfig({
  testDir: './e2e-hold',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: siteOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: `${siteOrigin}/snickerdoodle/api/health`,
    env: {
      CHECKOUT_SECURITY_SECRET: 'playwright-only-checkout-security-secret',
      SNICKERDOODLE_ALLOWED_ORIGIN: siteOrigin,
      ...closedCommercialGates
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
