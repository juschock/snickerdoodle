import { expect, test } from '@playwright/test';

const analyticsStub = `(() => {
  let beforeSend = null;
  const handle = (args) => {
    const [command, value] = args;
    if (command === 'beforeSend') {
      beforeSend = value;
      return;
    }
    if (command !== 'pageview') return;
    const event = { type: 'pageview', url: window.location.href };
    const filtered = beforeSend ? beforeSend(event) : event;
    if (!filtered) return;
    fetch('/_vercel/insights/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filtered),
      keepalive: true
    });
  };
  for (const args of window.vaq || []) handle(args);
  window.va = (...args) => handle(args);
})();`;

test('enabled analytics records public navigation and suppresses private route families', async ({ page }) => {
  const scriptRequests: string[] = [];
  const eventRequests: string[] = [];

  await page.route('**/_vercel/insights/script.js', async (route) => {
    scriptRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: analyticsStub });
  });
  await page.route('**/_vercel/insights/view', async (route) => {
    eventRequests.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/snickerdoodle');
  await expect.poll(() => scriptRequests.length).toBe(1);
  await expect.poll(() => eventRequests.length).toBe(1);

  for (const path of [
    '/snickerdoodle/checkout/success?session_id=synthetic-private-value',
    '/snickerdoodle/manager/queue',
    '/snickerdoodle/brief'
  ]) {
    await page.evaluate((nextPath) => window.history.pushState(null, '', nextPath), path);
    await expect(page).toHaveURL(new RegExp(path.split('?')[0].replaceAll('/', '\\/')));
    await page.waitForTimeout(100);
    expect(eventRequests).toHaveLength(1);
  }

  for (const path of [
    '/snickerdoodle/brief',
    '/snickerdoodle/checkout/cancel',
    '/snickerdoodle/manager/queue'
  ]) {
    await page.goto(path);
    await page.waitForTimeout(100);
    expect(scriptRequests).toHaveLength(1);
    expect(eventRequests).toHaveLength(1);
  }
});
