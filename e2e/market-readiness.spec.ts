import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createBriefAccessToken } from '../lib/checkout-security';
import { COMMERCIAL_PRODUCT_META_DESCRIPTION } from '../lib/site';

const syntheticOwnerId = '50000000-0000-4000-8000-000000000005';
const syntheticFactorId = '60000000-0000-4000-8000-000000000006';
const secondarySyntheticFactorId = '61000000-0000-4000-8000-000000000006';
const incompleteSyntheticFactorId = '62000000-0000-4000-8000-000000000006';
const replacementSyntheticFactorId = '63000000-0000-4000-8000-000000000006';

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
      friendly_name: 'Primary browser factor',
      factor_type: 'totp',
      status: 'verified',
      created_at: timestamp,
      updated_at: timestamp
    }, {
      id: secondarySyntheticFactorId,
      friendly_name: 'Secondary browser factor',
      factor_type: 'totp',
      status: 'verified',
      created_at: timestamp,
      updated_at: timestamp
    }, {
      id: '62000000-0000-4000-8000-000000000006',
      friendly_name: 'Unverified browser factor',
      factor_type: 'totp',
      status: 'unverified',
      created_at: timestamp,
      updated_at: timestamp
    }],
    aal
  };
}

function syntheticSingleFactorOwner(aal: 'aal1' | 'aal2') {
  const owner = syntheticOwner(aal);
  return { ...owner, factors: owner.factors.slice(0, 1) };
}

function syntheticIncompleteFactorOwner(hasIncompleteFactor: boolean) {
  const owner = syntheticOwner('aal1');
  return {
    ...owner,
    factors: hasIncompleteFactor ? [{
      id: incompleteSyntheticFactorId,
      friendly_name: 'Snickerdoodle owner authenticator',
      factor_type: 'totp',
      status: 'unverified',
      created_at: '2026-08-30T16:00:00.000Z',
      updated_at: '2026-08-30T16:00:00.000Z'
    }] : []
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

  const header = page.locator('header');
  const headerFallback = header.locator('p:visible').filter({ hasText: 'Email doesn’t open? Write to' });
  await expect(headerFallback).toBeVisible();
  const [headerBox, fallbackBox, fallbackFontSize] = await Promise.all([
    header.boundingBox(),
    headerFallback.boundingBox(),
    headerFallback.evaluate((element) => Number.parseFloat(window.getComputedStyle(element).fontSize))
  ]);
  expect(headerBox).not.toBeNull();
  expect(fallbackBox).not.toBeNull();
  expect(fallbackFontSize).toBeGreaterThanOrEqual(12);
  expect((fallbackBox?.y ?? 0) + (fallbackBox?.height ?? 0)).toBeLessThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0)
  );

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
  await expect(page.getByRole('heading', { level: 1, name: /checkout return received/i })).toBeVisible();
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
  await expect(page.getByRole('heading', { level: 1, name: /checkout return received/i })).toBeVisible();
  await expect(page.getByText(/this page does not confirm payment or create a paid order/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('button', { name: /review campaign templates/i }))
    .toHaveAttribute('href', '/snickerdoodle/samples');
  await expect(page.getByRole('button', { name: /back to snickerdoodle/i }))
    .toHaveAttribute('href', '/snickerdoodle');

  await page.goto('/snickerdoodle/checkout/cancel');
  await expect(page.getByRole('heading', { level: 1, name: /checkout status not confirmed/i })).toBeVisible();
  await expect(page.getByText(/this page does not confirm whether payment completed or whether an order exists/i)).toBeVisible();
  await expect(page.getByText(/if you know you canceled before paying, use your private intake link/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('button', { name: /view fictional samples/i }).last())
    .toHaveAttribute('href', '/snickerdoodle/samples');
  await expect(page.getByRole('button', { name: /back to snickerdoodle/i }))
    .toHaveAttribute('href', '/snickerdoodle');

  await page.goto('/snickerdoodle/samples');
  await expect(page.getByRole('heading', { level: 1, name: /fictional .* campaign package templates/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /view template/i })).toHaveCount(3);
  await expect(page.getByText(/these fictional templates illustrate/i)).toBeVisible();

  await page.goto('/snickerdoodle/samples/year-end-appeal');
  await expect(page.getByText('Fictional campaign template:', { exact: true })).toBeVisible();
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

test('header stays contained and uses one navigation mode at tablet and desktop widths', async ({ page }) => {
  const expectDocumentAndHeaderContained = async () => {
    const containment = await page.evaluate(() => {
      const header = document.querySelector('header');
      const headerBox = header?.getBoundingClientRect();

      return {
        documentContained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        headerContained: Boolean(
          header
          && headerBox
          && header.scrollWidth <= header.clientWidth
          && headerBox.left >= 0
          && headerBox.right <= window.innerWidth
        )
      };
    });

    expect(containment).toEqual({ documentContained: true, headerContained: true });
  };

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/snickerdoodle');

  const tabletPrimaryNav = page.getByRole('navigation', { name: 'Primary' });
  const tabletMobileNav = page.getByRole('navigation', { name: 'Mobile' });
  const openMenu = page.getByRole('button', { name: 'Open menu' });
  await expect(tabletPrimaryNav).toBeHidden();
  await expect(tabletMobileNav).toBeHidden();
  await expect(openMenu).toBeVisible();
  await expect(openMenu).toHaveAttribute('aria-expanded', 'false');
  await expectDocumentAndHeaderContained();

  await openMenu.click();
  await expect(tabletMobileNav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await expect(tabletMobileNav.getByRole('button', { name: 'Request a Fit Check' })).toBeVisible();
  await expect(tabletMobileNav.getByText('Email doesn’t open? Write to', { exact: false })).toBeVisible();
  await expectDocumentAndHeaderContained();

  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(tabletMobileNav).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/snickerdoodle');

  const desktopHeader = page.locator('header');
  const desktopPrimaryNav = page.getByRole('navigation', { name: 'Primary' });
  const desktopCta = desktopHeader.getByRole('button', { name: 'Request a Fit Check' });
  const desktopFallback = desktopHeader.locator('p:visible').filter({ hasText: 'Email doesn’t open? Write to' });
  await expect(desktopPrimaryNav).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  await expect(desktopCta).toBeVisible();
  await expect(desktopFallback).toBeVisible();
  await expectDocumentAndHeaderContained();

  const navWhiteSpace = await desktopPrimaryNav.locator('a').evaluateAll((links) =>
    links.map((link) => window.getComputedStyle(link).whiteSpace)
  );
  expect(navWhiteSpace).toEqual(navWhiteSpace.map(() => 'nowrap'));

  const [headerBox, ctaBox, fallbackBox] = await Promise.all([
    desktopHeader.boundingBox(),
    desktopCta.boundingBox(),
    desktopFallback.boundingBox()
  ]);
  expect(headerBox).not.toBeNull();
  for (const box of [ctaBox, fallbackBox]) {
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(headerBox?.x ?? 0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (headerBox?.x ?? 0) + (headerBox?.width ?? 0)
    );
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(headerBox?.y ?? 0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      (headerBox?.y ?? 0) + (headerBox?.height ?? 0)
    );
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

test('an incomplete owner factor requires explicit cleanup before one replacement enrollment', async ({ page }) => {
  const aal1Token = syntheticJwt('aal1');
  let hasIncompleteFactor = true;
  let cleanupRequests = 0;
  let enrollmentRequests = 0;
  const lifecycle: string[] = [];

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const common = { contentType: 'application/json', headers: { 'Cache-Control': 'no-store' } };

    if (url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          access_token: aal1Token,
          token_type: 'bearer',
          expires_in: 3_600,
          refresh_token: 'synthetic-incomplete-factor-refresh-aal1',
          user: syntheticIncompleteFactorOwner(true)
        })
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/user')) {
      lifecycle.push(hasIncompleteFactor ? 'list-incomplete' : 'list-empty');
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify(syntheticIncompleteFactorOwner(hasIncompleteFactor))
      });
      return;
    }

    if (
      request.method() === 'DELETE' &&
      url.pathname.endsWith(`/auth/v1/factors/${incompleteSyntheticFactorId}`)
    ) {
      cleanupRequests += 1;
      lifecycle.push('cleanup');
      hasIncompleteFactor = false;
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({ id: incompleteSyntheticFactorId })
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname.endsWith('/auth/v1/factors')) {
      enrollmentRequests += 1;
      lifecycle.push('enroll');
      expect(request.postDataJSON()).toEqual({
        factor_type: 'totp',
        friendly_name: 'Snickerdoodle owner authenticator'
      });
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          id: replacementSyntheticFactorId,
          type: 'totp',
          friendly_name: 'Snickerdoodle owner authenticator',
          totp: {
            qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://example.invalid'
          }
        })
      });
      return;
    }

    await route.abort('failed');
  });

  await page.goto('/snickerdoodle/manager/queue');
  await page.getByLabel('Owner email').fill('owner@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Continue securely' }).click();

  await expect(page.getByRole('heading', { name: 'Finish authenticator setup' })).toBeVisible();
  await expect(page.getByText(/previous Snickerdoodle owner-authenticator setup did not finish/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove incomplete setup and retry' })).toBeVisible();
  expect(cleanupRequests).toBe(0);
  expect(enrollmentRequests).toBe(0);
  expect(lifecycle.length).toBeGreaterThanOrEqual(1);
  expect(lifecycle.every((event) => event === 'list-incomplete')).toBe(true);
  const actionLifecycleStart = lifecycle.length;

  await page.getByRole('button', { name: 'Remove incomplete setup and retry' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your owner authenticator' })).toBeVisible();
  await expect(page.getByLabel('Manual authenticator setup key')).toBeVisible();
  expect(cleanupRequests).toBe(1);
  expect(enrollmentRequests).toBe(1);
  expect(lifecycle.slice(actionLifecycleStart)).toEqual([
    'list-incomplete',
    'cleanup',
    'list-empty',
    'enroll'
  ]);
  await expect(page.locator('body')).not.toContainText(incompleteSyntheticFactorId);
  await expect(page.locator('body')).not.toContainText(replacementSyntheticFactorId);
});

test('one verified owner factor remains automatically selected', async ({ page }) => {
  const aal1Token = syntheticJwt('aal1');
  const aal2Token = syntheticJwt('aal2');
  let challenged = false;
  let unexpectedFactorMutations = 0;

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const common = { contentType: 'application/json', headers: { 'Cache-Control': 'no-store' } };

    if (url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password') {
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          access_token: aal1Token,
          token_type: 'bearer',
          expires_in: 3_600,
          refresh_token: 'synthetic-single-factor-refresh-aal1',
          user: syntheticSingleFactorOwner('aal1')
        })
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/user')) {
      const aal = request.headers().authorization === `Bearer ${aal2Token}` ? 'aal2' : 'aal1';
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify(syntheticSingleFactorOwner(aal))
      });
      return;
    }

    if (url.pathname.endsWith(`/auth/v1/factors/${syntheticFactorId}/challenge`)) {
      challenged = true;
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          id: '71000000-0000-4000-8000-000000000007',
          type: 'totp',
          expires_at: 1_788_108_400
        })
      });
      return;
    }

    if (url.pathname.endsWith(`/auth/v1/factors/${syntheticFactorId}/verify`)) {
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify({
          access_token: aal2Token,
          token_type: 'bearer',
          expires_in: 3_600,
          refresh_token: 'synthetic-single-factor-refresh-aal2',
          user: syntheticSingleFactorOwner('aal2')
        })
      });
      return;
    }

    if (
      (request.method() === 'POST' && url.pathname.endsWith('/auth/v1/factors')) ||
      (request.method() === 'DELETE' && url.pathname.includes('/auth/v1/factors/'))
    ) {
      unexpectedFactorMutations += 1;
    }

    await route.abort('failed');
  });

  await page.goto('/snickerdoodle/manager/queue');
  await expect(page.getByLabel('Owner email')).toBeVisible();
  await page.getByLabel('Owner email').fill('owner@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.getByRole('group', { name: 'Authenticator' })).toHaveCount(0);
  await page.getByLabel('Authenticator code').fill('123456');
  await expect(page.getByRole('button', { name: 'Verify second factor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Verify second factor' }).click();
  expect(challenged).toBe(true);
  expect(unexpectedFactorMutations).toBe(0);
  await expect(page.getByRole('button', { name: 'Load secure queue' })).toBeVisible();
});

test('owner manager queue is noindex and requires password plus verified TOTP before paid-brief access', async ({ page }) => {
  const aal1Token = syntheticJwt('aal1');
  const aal2Token = syntheticJwt('aal2');
  let challengedFactorId = '';
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

    if (/\/auth\/v1\/factors\/[^/]+\/challenge$/.test(url.pathname)) {
      challengedFactorId = url.pathname.split('/').at(-2) ?? '';
      expect(challengedFactorId).toBe(secondarySyntheticFactorId);
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

    if (/\/auth\/v1\/factors\/[^/]+\/verify$/.test(url.pathname)) {
      expect(url.pathname.split('/').at(-2)).toBe(secondarySyntheticFactorId);
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
  await expect(page.getByRole('group', { name: 'Authenticator' })).toBeVisible();
  await expect(page.getByLabel('Primary browser factor (1)')).toBeVisible();
  await expect(page.getByLabel('Secondary browser factor (2)')).toBeVisible();
  await expect(page.getByLabel(/Unverified browser factor/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verify second factor' })).toBeDisabled();
  await page.getByLabel('Secondary browser factor (2)').check();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify second factor' }).click();
  expect(challengedFactorId).toBe(secondarySyntheticFactorId);
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
  await expect(page.locator('body')).not.toContainText(syntheticFactorId);
  await expect(page.locator('body')).not.toContainText(secondarySyntheticFactorId);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });
  expect(analyticsRequests, 'provider analytics must remain absent on the restricted manager surface').toEqual([]);
  expect(pageErrors, `unexpected manager page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
