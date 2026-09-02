import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn()
}));

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: serviceMocks.getSupabaseAdmin }));

import { POST as briefPost } from '@/app/api/brief/route';
import { BRIEF_ACCESS_COOKIE_NAME, createBriefAccessToken } from '@/lib/checkout-security';
import { COMMERCIAL_GATE_NAMES } from '@/lib/commercial-readiness.mjs';

const originalCheckoutSecret = process.env.CHECKOUT_SECURITY_SECRET;
const originalAllowedOrigin = process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
const originalCommercialGates = new Map(
  COMMERCIAL_GATE_NAMES.map((name) => [name, process.env[name]])
);

const validBrief = {
  organizationType: 'Local business',
  campaignFamily: 'Local customer acquisition',
  primaryAction: 'Reserve a seat',
  organizationName: 'Example Workshop',
  campaignName: 'Fall open house',
  campaignType: 'Open House',
  campaignTypeOther: '',
  dateTime: 'October 3 at 6 PM',
  locationOrLink: '123 Example Street',
  audience: 'Adults in the local community',
  mainGoal: 'Fill 20 seats',
  offerAsk: 'Reserve a free seat',
  keyDetails: 'Doors open at 5:30 PM. Space is limited.',
  tone: 'Warm & Friendly',
  toneOther: '',
  channels: ['Email', 'Facebook'],
  websiteSocial: '',
  phrasesInclude: '',
  phrasesAvoid: '',
  deliveryEmail: 'OWNER@EXAMPLE.COM',
  additionalNotes: ''
};

function accessCookie(token: string) {
  return `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

beforeEach(() => {
  process.env.CHECKOUT_SECURITY_SECRET = 'test-only-checkout-security-secret';
  process.env.SNICKERDOODLE_ALLOWED_ORIGIN = 'https://racoben.com';
  for (const name of COMMERCIAL_GATE_NAMES) process.env[name] = 'true';
  serviceMocks.getSupabaseAdmin.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (originalCheckoutSecret === undefined) delete process.env.CHECKOUT_SECURITY_SECRET;
  else process.env.CHECKOUT_SECURITY_SECRET = originalCheckoutSecret;
  if (originalAllowedOrigin === undefined) delete process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
  else process.env.SNICKERDOODLE_ALLOWED_ORIGIN = originalAllowedOrigin;
  for (const [name, value] of originalCommercialGates) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.restoreAllMocks();
});

describe('brief API accepted path', () => {
  it('accepts the parent-proxy request shape and stores exactly one pending intake', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const single = vi.fn().mockResolvedValue({
      data: {
        id: '11111111-1111-8111-8111-111111111111',
        delivery_email: 'owner@example.com',
        status: 'pending'
      },
      error: null
    });
    const select = vi.fn()
      .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ maybeSingle }) })
      .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ single }) });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ select, upsert });
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null
    });
    serviceMocks.getSupabaseAdmin.mockReturnValue({ from, rpc });

    const accessToken = createBriefAccessToken({
      email: 'owner@example.com',
      expiresAt: Date.now() + 60_000,
      nonce: '22222222-2222-4222-8222-222222222222',
      secret: 'test-only-checkout-security-secret'
    });
    const response = await briefPost(new Request('https://snickerdoodle-child.example/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': ['brief', 'positive', 'test', '0001'].join('-'),
        'origin': 'https://racoben.com',
        'x-forwarded-host': 'racoben.com',
        'x-forwarded-proto': 'https',
        'cookie': accessCookie(accessToken)
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(from).toHaveBeenCalledTimes(3);
    expect(from.mock.calls.every(([table]) => table === 'pending_intakes')).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      delivery_email: 'owner@example.com',
      status: 'pending'
    }), { onConflict: 'id', ignoreDuplicates: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('consume_intake_rate_limit', expect.objectContaining({
      p_scope: 'intake_email'
    }));
  });

  it('consumes the durable allowance before returning an existing intent', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: '11111111-1111-8111-8111-111111111111',
        delivery_email: 'owner@example.com',
        status: 'pending'
      },
      error: null
    });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const from = vi.fn().mockReturnValue({ select });
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null
    });
    serviceMocks.getSupabaseAdmin.mockReturnValue({ from, rpc });

    const accessToken = createBriefAccessToken({
      email: 'owner@example.com',
      expiresAt: Date.now() + 60_000,
      nonce: '22222222-2222-4222-8222-222222222222',
      secret: 'test-only-checkout-security-secret'
    });
    const response = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'https://racoben.com',
        'cookie': accessCookie(accessToken)
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('consumes the durable allowance before rejecting an invalid survey body', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null
    });
    serviceMocks.getSupabaseAdmin.mockReturnValue({ rpc });
    const accessToken = createBriefAccessToken({
      email: 'owner@example.com',
      expiresAt: Date.now() + 60_000,
      nonce: '22222222-2222-4222-8222-222222222222',
      secret: 'test-only-checkout-security-secret'
    });
    const response = await briefPost(new Request('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'https://racoben.com',
        'cookie': accessCookie(accessToken)
      },
      body: '{}'
    }));

    expect(response.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
