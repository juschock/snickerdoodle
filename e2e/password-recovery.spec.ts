import { expect, test } from '@playwright/test';

function syntheticRecoveryJwt() {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    email: 'owner@example.invalid',
    exp: now + 3_600,
    iat: now,
    role: 'authenticated',
    sub: '50000000-0000-4000-8000-000000000005'
  })}.synthetic-recovery-signature`;
}

const genericNotice =
  'If that address can receive a reset email, check its inbox and use the newest link.';

test('owner reset request is same-origin, generic, and single-submit until the email changes', async ({ page }) => {
  const redirectTargets: string[] = [];
  let rateLimited = false;

  await page.route('**/auth/v1/recover**', async (route) => {
    redirectTargets.push(
      new URL(route.request().url()).searchParams.get('redirect_to') ?? ''
    );

    await route.fulfill({
      status: rateLimited ? 429 : 200,
      contentType: 'application/json',
      body: rateLimited
        ? JSON.stringify({ error: 'synthetic rate limit' })
        : '{}'
    });
  });

  await page.goto('/snickerdoodle/manager/queue');
  const email = page.getByLabel('Owner email');
  const reset = page.getByRole('button', { name: 'Send password reset' });

  await email.fill('owner@example.invalid');
  await reset.click();

  await expect(page.getByText(genericNotice)).toBeVisible();
  await expect(reset).toBeDisabled();
  expect(redirectTargets).toEqual([
    'http://127.0.0.1:3102/snickerdoodle/auth/recovery'
  ]);

  rateLimited = true;
  await email.fill('other@example.invalid');
  await expect(reset).toBeEnabled();
  await reset.click();

  await expect(page.getByText(genericNotice)).toBeVisible();
  await expect(reset).toBeDisabled();
  expect(redirectTargets).toHaveLength(2);
  expect(redirectTargets[1]).toBe(
    'http://127.0.0.1:3102/snickerdoodle/auth/recovery'
  );
});

test('valid recovery session updates password, scrubs callback material, signs out, and requires fresh sign-in', async ({ page }) => {
  const accessToken = syntheticRecoveryJwt();
  let updatedPassword = '';

  const syntheticOwner = {
    id: '50000000-0000-4000-8000-000000000005',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.invalid',
    email_confirmed_at: '2026-08-30T16:00:00.000Z',
    confirmed_at: '2026-08-30T16:00:00.000Z',
    last_sign_in_at: '2026-08-30T16:00:00.000Z',
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: '2026-08-30T16:00:00.000Z',
    updated_at: '2026-08-30T16:00:00.000Z',
    factors: []
  };

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const common = {
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' }
    };

    if (url.pathname.endsWith('/auth/v1/user') && request.method() === 'GET') {
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify(syntheticOwner)
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/user') && request.method() === 'PUT') {
      const body = request.postDataJSON() as { password?: string };
      updatedPassword = body.password ?? '';
      await route.fulfill({
        ...common,
        status: 200,
        body: JSON.stringify(syntheticOwner)
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.abort('failed');
  });

  await page.goto(
    `/snickerdoodle/auth/recovery#access_token=${encodeURIComponent(accessToken)}` +
    '&refresh_token=synthetic-recovery-refresh' +
    '&expires_in=3600&token_type=bearer&type=recovery'
  );

  await expect(
    page.getByRole('heading', { level: 1, name: 'Choose a new owner password' })
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/access_token|refresh_token|type=recovery/);
  await expect(page.locator('body')).not.toContainText(accessToken);

  await page.getByLabel('New password', { exact: true }).fill('Synthetic-Recovery-Password-2026!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Synthetic-Recovery-Password-2026!');
  await page.getByRole('button', { name: 'Change password' }).click();

  expect(updatedPassword).toBe('Synthetic-Recovery-Password-2026!');
  await expect(page).toHaveURL(
    'http://127.0.0.1:3102/snickerdoodle/manager/queue'
  );
  await expect(page.getByLabel('Owner email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue securely' })).toBeVisible();
});

test('direct or malformed recovery access fails closed without rendering password controls', async ({ page }) => {
  await page.goto('/snickerdoodle/auth/recovery');

  await expect(
    page.getByText(
      'This password reset link is invalid or expired. Request a new one from the owner sign-in page.'
    )
  ).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveCount(0);
});
