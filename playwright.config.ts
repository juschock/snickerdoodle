import { defineConfig, devices } from '@playwright/test';

const siteOrigin = 'http://127.0.0.1:3102';
const analyticsPositiveMode = process.env.SNICKERDOODLE_E2E_ANALYTICS === 'true';
const commercialTestGates = {
  SNICKERDOODLE_COMMERCIAL_READY: 'true',
  SNICKERDOODLE_OFFER_APPROVED: 'true',
  SNICKERDOODLE_FULFILLMENT_READY: 'true',
  SNICKERDOODLE_REVIEWER_READY: 'true',
  SNICKERDOODLE_LEGAL_APPROVED: 'true',
  SNICKERDOODLE_PAYMENTS_READY: 'true',
  SNICKERDOODLE_G5_ASSIGNED: 'true',
  SNICKERDOODLE_MONETARY_APPROVED: 'true'
};

export default defineConfig({
  testDir: './e2e',
  testIgnore: analyticsPositiveMode ? [] : ['**/analytics-privacy.spec.ts'],
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run start',
    url: `${siteOrigin}/snickerdoodle/api/health`,
    env: {
      CHECKOUT_SECURITY_SECRET: 'playwright-only-checkout-security-secret',
      SNICKERDOODLE_ALLOWED_ORIGIN: siteOrigin,
      SUPABASE_URL: 'https://playwright-supabase.example.invalid',
      SUPABASE_ANON_KEY: 'sb_publishable_playwright_only_public_test_key',
      SNICKERDOODLE_ANALYTICS_ENABLED: analyticsPositiveMode ? 'true' : 'false',
      ...commercialTestGates
    },
    reuseExistingServer: !process.env.CI && !analyticsPositiveMode,
    timeout: 120_000
  }
});
