import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createBriefAccessToken } from '../lib/checkout-security';
import { COMMERCIAL_PRODUCT_META_DESCRIPTION } from '../lib/site';

const syntheticOwnerId = '50000000-0000-4000-8000-000000000005';
const syntheticFactorId = '60000000-0000-4000-8000-000000000006';

function syntheticJwt(aal: 'aal1' | 'aal2') {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aal,
    amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: now }],
    aud: 'authenticated',
    email: 'owner@example.invalid',
    exp: now + 3_600,
    iat: now,
    role: 'authenticated',
    sub: syntheticOwnerId
  })}.synthetic-browser-signature`;
}

function syntheticOwner(aal: 'aal1' | 'aal2') {
  const timestamp = '2026-08-30T16:00:00.000Z';
  return {
    id: syntheticOwnerId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.invalid',
    email_confirmed_at: timestamp,
    confirmed_at: timestamp,
    last_sign_in_at: timestamp,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: timestamp,
    updated_at: timestamp,
    factors: [{
      id: syntheticFactorId,
      friendly_name: 'Synthetic browser factor',
      factor_type: 'totp',
      status: 'verified',
      created_at: timestamp,
      updated_at: timestamp
    }],
    aal
  };
}

const playwrightAccessToken = createBriefAccessToken({
  email: 'playwright@example.com',
  expiresAt: Date.now() + 10 * 60 * 1000,
  nonce: '44444444-4444-4444-8444-444444444444',
  secret: 'playwright-only-checkout-security-secret'
});

test('homepage leads with a fit check and keeps the survey unlisted', async ({ page }) => {
  const response = await page.goto('/snickerdoodle');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Snickerdoodle/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    COMMERCIAL_PRODUCT_META_DESCRIPTION
  );
  const commercialMetadata = await page
    .locator('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('content') ?? '').join(' '));
  expect(commercialMetadata).not.toMatch(/\b(?:fictional|readiness|hold|staging|sandbox)\b|access status/i);
  await expect(page.getByRole('heading', { level: 1, name: 'Snickerdoodle' })).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(0);

  const fitCheck = page.getByRole('link', { name: 'Request a Fit Check' }).first();
  await expect(fitCheck).toHaveAttribute('href', /^mailto:snickerdoodle@racoben\.com\?/);
  await expect(page.locator('a[href="/snickerdoodle/brief"], a[href="/brief"]')).toHaveCount(0);

  const privateResponse = await page.goto(`/snickerdoodle/brief#access=${encodeURIComponent(playwrightAccessToken)}`);
  await expect(page.getByRole('heading', { level: 1, name: /campaign survey/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /campaign survey basics/i })).toBeVisible();
  expect(page.url()).toBe('http://127.0.0.1:3102/snickerdoodle/brief');
  expect(privateResponse?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  const requiredControls = page.locator('input[required], select[required], textarea[required]');
  expect(await requiredControls.count()).toBeGreaterThanOrEqual(10);
  expect(await page.locator('[aria-describedby]').count()).toBeGreaterThanOrEqual(5);

  await page.getByRole('button', { name: /continue to secure checkout/i }).click();
  await expect(page.locator('#primaryAction')).toBeFocused();

  await page.context().clearCookies();
  await page.goto('/snickerdoodle/brief');
  await expect(page.getByRole('heading', { level: 2, name: /private invite is required/i })).toBeVisible();
});

test('synthetic private intake reaches the non-authoritative checkout return through the real browser form', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  let idempotencyKey = '';
  await page.route('**/snickerdoodle/api/checkout', async (route) => {
    const request = route.request();
    submitted = request.postDataJSON() as Record<string, unknown>;
    idempotencyKey = request.headers()['idempotency-key'] ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: 'http://127.0.0.1:3102/snickerdoodle/checkout/success?session_id=cs_synthetic_browser'
      })
    });
  });

  await page.goto(`/snickerdoodle/brief#access=${encodeURIComponent(playwrightAccessToken)}`);
  await expect(page.getByRole('heading', { level: 1, name: /campaign survey/i })).toBeVisible();
  await page.locator('#primaryAction').fill('Register');
  await page.locator('#organizationName').fill('Fictional RC Organization');
  await page.locator('#campaignName').fill('Synthetic RC Campaign');
  await page.locator('#dateTime').fill('2099-10-15 18:00');
  await page.locator('#locationOrLink').fill('https://sn07.example.invalid');
  await page.locator('#audience').fill('Synthetic local-test audience');
  await page.locator('#mainGoal').fill('Prove the release browser journey');
  await page.locator('#offerAsk').fill('Register in the synthetic fixture');
  await page.locator('#keyDetails').fill('No customer data and no provider call');
  await page.getByLabel('Email', { exact: true }).check();
  await page.locator('#deliveryEmail').fill('playwright@example.com');
  await page.getByRole('button', { name: /continue to secure checkout/i }).click();

  await expect(page).toHaveURL(/\/snickerdoodle\/checkout\/success\?session_id=cs_synthetic_browser$/);
  await expect(page.getByRole('heading', { level: 1, name: /checkout return was received/i })).toBeVisible();
  expect(submitted).toMatchObject({
    organizationName: 'Fictional RC Organization',
    campaignName: 'Synthetic RC Campaign',
    deliveryEmail: 'playwright@example.com'
  });
  expect((submitted as { channels?: unknown[] } | null)?.channels).toContain('Email');
  expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
});

test('public content, health, and not-found routes respond correctly', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const analyticsRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (requestEvent) => {
    if (/\/_vercel\/(insights|speed-insights)/.test(requestEvent.url())) analyticsRequests.push(requestEvent.url());
  });

  const rootRedirect = await request.get('/', { maxRedirects: 0 });
  expect(rootRedirect.status()).toBe(307);
  expect(rootRedirect.headers().location).toMatch(/\/snickerdoodle$/);
  expect(rootRedirect.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(
    rootRedirect.headers()['content-security-policy'].split(';').find((directive) => directive.trim().startsWith('script-src '))
  ).not.toContain("'unsafe-inline'");
  expect(rootRedirect.headers()['x-frame-options']).toBe('DENY');
  expect(rootRedirect.headers()['x-content-type-options']).toBe('nosniff');
  expect(rootRedirect.headers()['strict-transport-security']).toContain('max-age=63072000');

  for (const path of ['/snickerdoodle', '/snickerdoodle/samples']) {
    const secured = await request.get(path);
    expect(secured.status()).toBe(200);
    expect(secured.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(
      secured.headers()['content-security-policy'].split(';').find((directive) => directive.trim().startsWith('script-src '))
    ).toContain("'strict-dynamic'");
    expect(secured.headers()['x-frame-options']).toBe('DENY');
    expect(secured.headers()['x-content-type-options']).toBe('nosniff');
    expect(secured.headers()['strict-transport-security']).toContain('max-age=63072000');
  }

  const icon = await request.get('/snickerdoodle/icon.svg');
  expect(icon.status()).toBe(200);
  const iconSource = await icon.text();
  expect(iconSource).toContain('<title id="title">Snickerdoodle</title>');
  expect(iconSource.toLowerCase()).not.toContain('v0');

  const checkout = await request.post('/snickerdoodle/api/checkout', { data: {} });
  const webhook = await request.post('/snickerdoodle/api/stripe/webhook', { data: {} });
  const managerQueue = await request.get('/snickerdoodle/api/manager/queue');
  expect(checkout.status()).toBe(503);
  expect(checkout.headers()['cache-control']).toContain('no-store');
  expect(webhook.status()).toBe(503);
  expect(webhook.headers()['cache-control']).toContain('no-store');
  expect(managerQueue.status()).toBe(401);
  expect(managerQueue.headers()['cache-control']).toContain('no-store');
  expect(managerQueue.headers()['x-robots-tag']).toContain('noindex');

  const health = await request.get('/snickerdoodle/api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toBe('no-store');
  await expect(health.json()).resolves.toEqual({ status: 'ok', service: 'snickerdoodle' });

  const healthHead = await request.head('/snickerdoodle/api/health');
  expect(healthHead.status()).toBe(200);
  expect(healthHead.headers()['cache-control']).toBe('no-store');

  const robots = await request.get('/snickerdoodle/robots.txt');
  expect(await robots.text()).toContain('Disallow: /snickerdoodle/brief');

  const sitemap = await request.get('/snickerdoodle/sitemap.xml');
  expect(await sitemap.text()).not.toContain('/snickerdoodle/brief');

  for (const path of [
    '/snickerdoodle/checkout/cancel',
    '/snickerdoodle/checkout/success?session_id=cs_must_not_be_looked_up'
  ]) {
    const checkoutReturn = await request.get(path);
    expect(checkoutReturn.status(), `${path} must exist under the deployed base path`).toBe(200);
  }

  for (const path of [
    '/snickerdoodle',
    '/snickerdoodle/faq',
    '/snickerdoodle/samples',
    '/snickerdoodle/samples/adoption-event',
    '/snickerdoodle/privacy',
    '/snickerdoodle/terms',
    '/snickerdoodle/checkout/cancel',
    '/snickerdoodle/checkout/success?session_id=cs_must_not_be_looked_up'
  ]) {
    await page.goto(path);
    await expect(page.locator('a[href="/snickerdoodle/brief"], a[href="/brief"]'), `${path} exposed the private intake`).toHaveCount(0);
  }

  const canonicalCases = [
    ['/snickerdoodle', 'https://racoben.com/snickerdoodle'],
    ['/snickerdoodle/faq', 'https://racoben.com/snickerdoodle/faq'],
    ['/snickerdoodle/samples', 'https://racoben.com/snickerdoodle/samples'],
    ['/snickerdoodle/samples/adoption-event', 'https://racoben.com/snickerdoodle/samples/adoption-event'],
    ['/snickerdoodle/privacy', 'https://racoben.com/snickerdoodle/privacy'],
    ['/snickerdoodle/terms', 'https://racoben.com/snickerdoodle/terms']
  ] as const;

  for (const [path, canonical] of canonicalCases) {
    await page.goto(path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  }

  await page.goto('/snickerdoodle/checkout/success?session_id=cs_must_not_be_looked_up');
  await expect(page.getByRole('heading', { level: 1, name: /checkout return was received/i })).toBeVisible();
  await expect(page.getByText(/after the signed payment event is reconciled/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('button', { name: /review sample packages/i }))
    .toHaveAttribute('href', '/snickerdoodle/samples');
  await expect(page.getByRole('button', { name: /back to snickerdoodle/i }))
    .toHaveAttribute('href', '/snickerdoodle');

  await page.goto('/snickerdoodle/checkout/cancel');
  await expect(page.getByRole('heading', { level: 1, name: /checkout canceled/i })).toBeVisible();
  await expect(page.getByText(/no paid order or delivery obligation was created/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('button', { name: /view fictional samples/i }).last())
    .toHaveAttribute('href', '/snickerdoodle/samples');
  await expect(page.getByRole('button', { name: /back to snickerdoodle/i }))
    .toHaveAttribute('href', '/snickerdoodle');

  await page.goto('/snickerdoodle/samples');
  await expect(page.getByRole('heading', { level: 1, name: /campaign package looks like/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /view sample/i })).toHaveCount(3);
  await expect(page.getByText(/fictional examples/i)).toBeVisible();

  await page.goto('/snickerdoodle/samples/year-end-appeal');
  await expect(page.getByText(/fictional demonstration/i)).toBeVisible();
  await expect(page.getByText(/Hope Harbor/i)).toHaveCount(0);
  await expect(page.getByText(/TikTok/i)).toHaveCount(0);

  expect(analyticsRequests, 'provider analytics must remain absent unless the server-owned flag is explicitly enabled').toEqual([]);
  expect(pageErrors, `unexpected browser page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `unexpected browser console errors on valid customer routes: ${consoleErrors.join(' | ')}`).toEqual([]);

  // Chromium reports the expected 404 navigation as a console resource error;
  // validate the custom not-found page only after the valid-route zero-console gate.
  const missing = await page.goto('/snickerdoodle/not-a-real-page');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: /not in this package/i })).toBeVisible();
});

test('primary pages have no automatically detectable accessibility violations', async ({ page }) => {
  for (const path of [
    '/snickerdoodle',
    '/snickerdoodle/brief',
    '/snickerdoodle/brief/received',
    '/snickerdoodle/samples',
    '/snickerdoodle/privacy',
    '/snickerdoodle/terms'
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, `${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  }
});

test('mobile navigation and survey layout work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/snickerdoodle');

  const menu = page.getByRole('button', { name: 'Open menu' });
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');

  const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(homeOverflow).toBe(false);

  await page.goto(`/snickerdoodle/brief#access=${encodeURIComponent(playwrightAccessToken)}`);
  await expect(page.getByRole('heading', { level: 2, name: /campaign survey basics/i })).toBeVisible();
  expect(page.url()).toBe('http://127.0.0.1:3102/snickerdoodle/brief');
  const surveyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(surveyOverflow).toBe(false);
});

test('owner manager queue is noindex and requires password plus verified TOTP before paid-brief access', async ({ page }) => {
  const aal1Token = syntheticJwt('aal1');
  const aal2Token = syntheticJwt('aal2');
  const analyticsRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (requestEvent) => {
    if (/\/_vercel\/(insights|speed-insights)/.test(requestEvent.url())) analyticsRequests.push(requestEvent.url());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers().authorization ?? '';
    const common = {
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' }
    };

    if (url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
      const body = request.postDataJSON() as { email?: string; password?: string };
      expect(body).toMatchObject({ email: 'owner@example.invalid', password: 'synthetic-password' });
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          access_token: aal1Token,
          token_type: 'bearer',
          expires_in: 3_600,
          refresh_token: 'synthetic-refresh-token-aal1',
          user: syntheticOwner('aal1')
        })
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/user')) {
      const aal = authorization === `Bearer ${aal2Token}` ? 'aal2' : 'aal1';
      await route.fulfill({ ...common, status: 200, body: JSON.stringify(syntheticOwner(aal)) });
      return;
    }

    if (url.pathname.endsWith(`/auth/v1/factors/${syntheticFactorId}/challenge`)) {
      expect(authorization).toBe(`Bearer ${aal1Token}`);
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          id: '70000000-0000-4000-8000-000000000007',
          type: 'totp',
          expires_at: 1_788_108_400
        })
      });
      return;
    }

    if (url.pathname.endsWith(`/auth/v1/factors/${syntheticFactorId}/verify`)) {
      const body = request.postDataJSON() as { challenge_id?: string; code?: string };
      expect(authorization).toBe(`Bearer ${aal1Token}`);
      expect(body).toMatchObject({
        challenge_id: '70000000-0000-4000-8000-000000000007',
        code: '123456'
      });
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          access_token: aal2Token,
          token_type: 'bearer',
          expires_in: 3_600,
          refresh_token: 'synthetic-refresh-token-aal2',
          user: syntheticOwner('aal2')
        })
      });
      return;
    }

    await route.abort('failed');
  });

  await page.route('**/snickerdoodle/api/manager/queue', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${aal2Token}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        receipts: [{
          queue_receipt_id: '10000000-0000-4000-8000-000000000001',
          intake_kind: 'paid_checkout',
          intake_id: '20000000-0000-4000-8000-000000000002',
          queue_state: 'paid',
          payment_state: 'paid',
          order_id: '30000000-0000-4000-8000-000000000003',
          terms_version: '2026-08-30',
          reconciliation_status: 'clear',
          latest_alert_code: null,
          created_at: '2026-08-30T16:00:00.000Z',
          updated_at: '2026-08-30T16:01:00.000Z'
        }]
      })
    });
  });

  await page.route('**/snickerdoodle/api/manager/intakes/20000000-0000-4000-8000-000000000002', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${aal2Token}`);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        intake: {
          checkout_intent_id: '20000000-0000-4000-8000-000000000002',
          order_id: '30000000-0000-4000-8000-000000000003',
          order_status: 'paid',
          payment_status: 'paid',
          terms_version: '2026-08-30',
          delivery_email: 'customer@example.invalid',
          brief_json: { organization: 'Synthetic Fixture Organization', objective: 'Synthetic launch' },
          assignments: [{ role: 'service_lead', active: true }],
          reconciliation_status: 'clear',
          reconciliation_alerts: []
        }
      })
    });
  });

  const response = await page.goto('/snickerdoodle/manager/queue');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByLabel(/session token/i)).toHaveCount(0);

  const unconfigured = page.getByRole('alert').filter({ hasText: /authentication is not configured/i });
  if (await unconfigured.isVisible().catch(() => false)) {
    await expect(unconfigured).toBeVisible();
    await expect(page.getByLabel('Owner email')).toHaveCount(0);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
      .toEqual({ local: 0, session: 0 });
    expect(analyticsRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
    return;
  }

  await page.getByLabel('Owner email').fill('owner@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify second factor' }).click();
  await expect(page.getByRole('button', { name: 'Load secure queue' })).toBeVisible();

  await page.getByRole('button', { name: 'Load secure queue' }).click();
  await expect(page.getByRole('cell', { name: 'paid_checkout' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2026-08-30' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'clear' })).toBeVisible();
  await page.getByRole('button', { name: 'Open paid brief' }).click();
  await expect(page.getByRole('heading', { name: 'Paid brief and fulfillment state' })).toBeVisible();
  await expect(page.getByText('customer@example.invalid')).toBeVisible();
  await expect(page.getByText(/Synthetic Fixture Organization/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('synthetic-password');
  await expect(page.locator('body')).not.toContainText('synthetic-refresh-token');
  await expect(page.locator('body')).not.toContainText(aal1Token);
  await expect(page.locator('body')).not.toContainText(aal2Token);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });
  expect(analyticsRequests, 'provider analytics must remain absent on the restricted manager surface').toEqual([]);
  expect(pageErrors, `unexpected manager page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
