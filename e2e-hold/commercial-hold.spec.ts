import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('default build exposes only truthful product-status and fictional-sample paths', async ({ page }) => {
  const response = await page.goto('/snickerdoodle');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Fictional campaign samples for product evaluation/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    "Explore clearly labeled fictional Snickerdoodle campaign samples and check the product's current access status."
  );
  await expect(page.getByRole('heading', { level: 1, name: /not accepting orders/i })).toBeVisible();
  await expect(page.getByText(/no service offer, private intake, payment/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /view fictional samples/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /ask a product question/i }).first()).toHaveAttribute(
    'href',
    /^mailto:snickerdoodle@racoben\.com\?subject=Snickerdoodle%20product%20question$/
  );
  await expect(page.getByText('$99', { exact: false })).toHaveCount(0);
  await expect(page.getByText(/48.hour/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /fit check/i })).toHaveCount(0);
  await expect(page.locator('a[href="/snickerdoodle/brief"], a[href="/brief"]')).toHaveCount(0);

  for (const path of ['/snickerdoodle/faq', '/snickerdoodle/privacy', '/snickerdoodle/terms']) {
    await page.goto(path);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\$99|request a fit check|normally delivered within 48|complete, human-reviewed/i);
  }
});

test('direct intake, APIs, and invite capability fail closed before data handling', async ({ page, request }) => {
  await page.goto('/snickerdoodle/brief#access=must-not-be-processed');
  await expect(page.getByRole('heading', { level: 1, name: /not accepting orders/i })).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:3102/snickerdoodle/brief');
  await expect(page.locator('form input, form textarea, form select')).toHaveCount(0);

  for (const path of ['/snickerdoodle/api/brief-access', '/snickerdoodle/api/brief']) {
    const response = await request.post(path, {
      headers: { 'content-type': 'text/plain' },
      data: 'not-json'
    });
    expect(response.status()).toBe(503);
    expect(response.headers()['cache-control']).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'Private intake is not available.' });
  }
});

test('closed home, brief, and samples have no detectable A/AA accessibility violations', async ({ page }) => {
  for (const path of ['/snickerdoodle', '/snickerdoodle/brief', '/snickerdoodle/samples']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, `${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  }
});
