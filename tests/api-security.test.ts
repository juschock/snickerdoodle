import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  rpc: vi.fn()
}));

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: serviceMocks.getSupabaseAdmin }));

import { POST as briefAccessPost } from '@/app/api/brief-access/route';
import { POST as briefPost } from '@/app/api/brief/route';
import { POST as checkoutPost } from '@/app/api/checkout/route';
import { POST as webhookPost } from '@/app/api/stripe/webhook/route';
import { BRIEF_ACCESS_COOKIE_NAME, createBriefAccessToken } from '@/lib/checkout-security';
import { COMMERCIAL_GATE_NAMES } from '@/lib/commercial-readiness.mjs';

const originalCheckoutSecret = process.env.CHECKOUT_SECURITY_SECRET;
const originalPaymentsEnabled = process.env.SNICKERDOODLE_PAYMENTS_ENABLED;
const originalPaymentWebhooksEnabled = process.env.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED;
const originalStripeLivemode = process.env.SNICKERDOODLE_STRIPE_LIVEMODE;
const originalStripeRestrictedKey = process.env.STRIPE_RESTRICTED_KEY;
const originalStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const originalAllowedOrigin = process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
const originalCommercialGates = new Map(
  COMMERCIAL_GATE_NAMES.map((name) => [name, process.env[name]])
);

function accessCookie(token: string) {
  return `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

beforeEach(() => {
  process.env.CHECKOUT_SECURITY_SECRET = 'test-only-checkout-security-secret';
  process.env.SNICKERDOODLE_ALLOWED_ORIGIN = 'https://racoben.com';
  for (const name of COMMERCIAL_GATE_NAMES) process.env[name] = 'true';
  serviceMocks.getSupabaseAdmin.mockReset();
  serviceMocks.rpc.mockReset();
  serviceMocks.rpc.mockResolvedValue({
    data: { allowed: true, retry_after_seconds: 0 },
    error: null
  });
  serviceMocks.getSupabaseAdmin.mockReturnValue({ rpc: serviceMocks.rpc });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  if (originalCheckoutSecret === undefined) delete process.env.CHECKOUT_SECURITY_SECRET;
  else process.env.CHECKOUT_SECURITY_SECRET = originalCheckoutSecret;
  if (originalPaymentsEnabled === undefined) delete process.env.SNICKERDOODLE_PAYMENTS_ENABLED;
  else process.env.SNICKERDOODLE_PAYMENTS_ENABLED = originalPaymentsEnabled;
  if (originalPaymentWebhooksEnabled === undefined) delete process.env.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED;
  else process.env.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED = originalPaymentWebhooksEnabled;
  if (originalStripeLivemode === undefined) delete process.env.SNICKERDOODLE_STRIPE_LIVEMODE;
  else process.env.SNICKERDOODLE_STRIPE_LIVEMODE = originalStripeLivemode;
  if (originalStripeRestrictedKey === undefined) delete process.env.STRIPE_RESTRICTED_KEY;
  else process.env.STRIPE_RESTRICTED_KEY = originalStripeRestrictedKey;
  if (originalStripeWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalStripeWebhookSecret;
  if (originalAllowedOrigin === undefined) delete process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
  else process.env.SNICKERDOODLE_ALLOWED_ORIGIN = originalAllowedOrigin;
  for (const [name, value] of originalCommercialGates) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.restoreAllMocks();
});

describe('brief API boundary', () => {
  const accessToken = createBriefAccessToken({
    email: 'customer@example.com',
    expiresAt: Date.now() + 60_000,
    nonce: '11111111-1111-4111-8111-111111111111',
    secret: 'test-only-checkout-security-secret'
  });

  it('fails closed before reading private intake configuration or data', async () => {
    delete process.env.SNICKERDOODLE_LEGAL_APPROVED;
    delete process.env.CHECKOUT_SECURITY_SECRET;

    const exchange = await briefAccessPost(new Request('https://racoben.com/snickerdoodle/api/brief-access', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not-json'
    }));
    const intake = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not-json'
    }));

    expect(exchange.status).toBe(503);
    expect(intake.status).toBe(503);
    await expect(exchange.json()).resolves.toEqual({ error: 'Private intake is not available.' });
    await expect(intake.json()).resolves.toEqual({ error: 'Private intake is not available.' });
    expect(serviceMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['path-bearing', 'https://racoben.com/snickerdoodle'],
    ['credential-bearing', 'https://operator:secret@racoben.com']
  ])('fails closed when the server-only allowed origin is %s', async (_label, origin) => {
    if (origin === undefined) delete process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
    else process.env.SNICKERDOODLE_ALLOWED_ORIGIN = origin;

    const exchange = await briefAccessPost(new Request('https://racoben.com/snickerdoodle/api/brief-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://racoben.com' },
      body: JSON.stringify({ token: accessToken })
    }));
    const intake = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://racoben.com',
        cookie: accessCookie(accessToken)
      },
      body: '{}'
    }));

    for (const response of [exchange, intake]) {
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    }
    expect(serviceMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('requires JSON and a valid optional idempotency key', async () => {
    const wrongType = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'origin': 'https://racoben.com',
        'cookie': accessCookie(accessToken)
      },
      body: '{}'
    }));
    expect(wrongType.status).toBe(415);

    const badKey = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'short',
        'origin': 'https://racoben.com',
        'cookie': accessCookie(accessToken)
      },
      body: '{}'
    }));
    expect(badKey.status).toBe(400);
    expect(serviceMocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('consumes the durable invite allowance before rejecting an oversized survey', async () => {
    const response = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(65 * 1024),
        'origin': 'https://racoben.com',
        'cookie': accessCookie(accessToken)
      },
      body: '{}'
    }));
    expect(response.status).toBe(413);
    expect(serviceMocks.getSupabaseAdmin).toHaveBeenCalledTimes(1);
    expect(serviceMocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('requires a signed, unexpired qualified-prospect token', async () => {
    const response = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'https://racoben.com' },
      body: '{}'
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects child-origin and forged forwarded-host requests', async () => {
    for (const forwardedHost of [undefined, 'attacker.example']) {
      const headers = new Headers({
        'content-type': 'application/json',
        'origin': 'https://racoben.com',
        'x-forwarded-proto': 'https',
        'cookie': accessCookie(accessToken)
      });
      if (forwardedHost) headers.set('x-forwarded-host', forwardedHost);

      const response = await briefPost(new Request('https://snickerdoodle-child.example/snickerdoodle/api/brief', {
        method: 'POST',
        headers,
        body: '{}'
      }));
      expect(response.status).toBe(403);
    }
    expect(serviceMocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('exchanges a fragment bearer for a scoped HttpOnly cookie without caching it', async () => {
    const response = await briefAccessPost(new Request('https://racoben.com/snickerdoodle/api/brief-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'https://racoben.com' },
      body: JSON.stringify({ token: accessToken })
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('set-cookie')).toContain(`${BRIEF_ACCESS_COOKIE_NAME}=`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')?.toLowerCase()).toContain('samesite=strict');
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});

describe('payment API boundaries', () => {
  it('keeps checkout unavailable while the acquisition switch is off', async () => {
    process.env.SNICKERDOODLE_PAYMENTS_ENABLED = 'false';

    const checkout = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST'
    }));

    expect(checkout.status).toBe(503);
    expect(checkout.headers.get('cache-control')).toBe('no-store');
    expect(serviceMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('keeps checkout unavailable when live payment configuration is incomplete', async () => {
    process.env.SNICKERDOODLE_PAYMENTS_ENABLED = 'true';
    delete process.env.STRIPE_RESTRICTED_KEY;

    const checkout = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST'
    }));

    expect(checkout.status).toBe(503);
    expect(serviceMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('keeps webhook intake unavailable while its independent switch is off', async () => {
    process.env.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED = 'false';

    const webhook = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST'
    }));

    expect(webhook.status).toBe(503);
    expect(webhook.headers.get('cache-control')).toBe('no-store');
    expect(serviceMocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
