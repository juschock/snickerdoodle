import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const managerMocks = vi.hoisted(() => ({
  log: vi.fn(),
  rpc: vi.fn(),
  verify: vi.fn()
}));

vi.mock('@/lib/supabase-manager', () => ({
  getSupabaseManagerClient: () => ({ rpc: managerMocks.rpc }),
  verifySupabaseActiveOwnerAal2: managerMocks.verify
}));

vi.mock('@/lib/security-log', () => ({
  logSecurityEvent: managerMocks.log,
  requestCorrelationId: () => 'manager-operations-test'
}));

import { GET as healthGet } from '@/app/api/manager/health/route';
import { POST as invitePost } from '@/app/api/manager/invites/route';
import {
  pseudonymizeBriefAccessSubject,
  validateBriefAccessToken
} from '@/lib/checkout-security';

const bearer = `Bearer ${'x'.repeat(64)}`;
const secret = 'test-only-checkout-security-secret';
const originalAllowedOrigin = process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
const originalCheckoutSecret = process.env.CHECKOUT_SECURITY_SECRET;

function inviteRequest(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request('https://racoben.com/snickerdoodle/api/manager/invites', {
    method: 'POST',
    headers: {
      authorization: bearer,
      'content-type': 'application/json',
      origin: 'https://racoben.com',
      ...headers
    },
    body
  });
}

function healthRow(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: '2026-09-02T22:00:00.000Z',
    is_healthy: true,
    latest_webhook_received_at: '2026-09-02T21:59:00.000Z',
    latest_webhook_completed_at: '2026-09-02T21:59:01.000Z',
    webhook_receipts_24h: 4,
    failed_webhook_receipts_24h: 0,
    stuck_webhook_receipts: 0,
    stale_unpaid_checkout_intents: 0,
    paid_checkout_intents_without_order: 0,
    paid_stripe_orders_without_intent: 0,
    paid_stripe_orders_without_event: 0,
    processed_stripe_events_without_paid_order: 0,
    ...overrides
  };
}

beforeEach(() => {
  process.env.SNICKERDOODLE_ALLOWED_ORIGIN = 'https://racoben.com';
  process.env.CHECKOUT_SECURITY_SECRET = secret;
  managerMocks.log.mockReset();
  managerMocks.rpc.mockReset();
  managerMocks.verify.mockReset();
  managerMocks.verify.mockResolvedValue(true);
  managerMocks.rpc.mockResolvedValue({ data: [healthRow()], error: null });
});

afterEach(() => {
  if (originalAllowedOrigin === undefined) delete process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
  else process.env.SNICKERDOODLE_ALLOWED_ORIGIN = originalAllowedOrigin;
  if (originalCheckoutSecret === undefined) delete process.env.CHECKOUT_SECURITY_SECRET;
  else process.env.CHECKOUT_SECURITY_SECRET = originalCheckoutSecret;
});

describe('owner operations authorization', () => {
  it('rejects missing bearer authorization without reaching Supabase', async () => {
    const invite = await invitePost(new Request(
      'https://racoben.com/snickerdoodle/api/manager/invites',
      { method: 'POST' }
    ));
    const health = await healthGet(new Request(
      'https://racoben.com/snickerdoodle/api/manager/health'
    ));

    for (const response of [invite, health]) {
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    }
    expect(managerMocks.verify).not.toHaveBeenCalled();
    expect(managerMocks.rpc).not.toHaveBeenCalled();
  });

  it('denies sessions that do not satisfy active-owner AAL2 authorization', async () => {
    managerMocks.verify.mockResolvedValue(false);
    const invite = await invitePost(inviteRequest(JSON.stringify({ email: 'qualified@example.com' })));
    const health = await healthGet(new Request(
      'https://racoben.com/snickerdoodle/api/manager/health',
      { headers: { authorization: bearer } }
    ));

    expect(invite.status).toBe(403);
    expect(health.status).toBe(403);
    expect(managerMocks.rpc).not.toHaveBeenCalled();
    expect(managerMocks.log).toHaveBeenCalledWith(
      'warn',
      'manager_invite.aal2_rejected',
      { requestId: 'manager-operations-test' }
    );
  });
});

describe('owner private invite endpoint', () => {
  it('rejects origin, content type, malformed JSON, invalid email, and oversized bodies', async () => {
    const wrongOrigin = await invitePost(inviteRequest(
      JSON.stringify({ email: 'qualified@example.com' }),
      { origin: 'https://attacker.example' }
    ));
    const wrongType = await invitePost(inviteRequest(
      JSON.stringify({ email: 'qualified@example.com' }),
      { 'content-type': 'text/plain' }
    ));
    const malformed = await invitePost(inviteRequest('{'));
    const invalidEmail = await invitePost(inviteRequest(JSON.stringify({ email: 'not-an-email' })));
    const oversized = await invitePost(inviteRequest(
      '{}',
      { 'content-length': String(2 * 1024 + 1) }
    ));

    expect(wrongOrigin.status).toBe(403);
    expect(wrongType.status).toBe(415);
    expect(malformed.status).toBe(400);
    expect(invalidEmail.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(managerMocks.rpc).not.toHaveBeenCalled();
  });

  it('returns only a valid email-bound v2 fragment link and does not log the link or email', async () => {
    const response = await invitePost(inviteRequest(JSON.stringify({
      email: '  Qualified.Owner@Example.COM  '
    })));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    const body = await response.json() as { link: string };
    expect(Object.keys(body)).toEqual(['link']);

    const link = new URL(body.link);
    expect(link.origin).toBe('https://racoben.com');
    expect(link.pathname).toBe('/snickerdoodle/brief');
    expect(link.search).toBe('');
    expect(link.hash).toMatch(/^#access=/);
    const token = new URLSearchParams(link.hash.slice(1)).get('access');
    const access = validateBriefAccessToken(token, secret);
    expect(access?.v).toBe(2);
    expect(access?.subjectHash).toBe(
      pseudonymizeBriefAccessSubject('qualified.owner@example.com', secret)
    );
    expect(managerMocks.log).not.toHaveBeenCalled();
    expect(managerMocks.rpc).not.toHaveBeenCalled();
  });

  it('has no persistence, query-secret, or browser-storage implementation path', () => {
    const route = readFileSync('app/api/manager/invites/route.ts', 'utf8');
    const client = readFileSync('components/manager-queue.tsx', 'utf8');

    expect(route).toContain('inviteUrl.hash =');
    expect(route).not.toMatch(/\.searchParams\.set|getSupabaseAdmin|\.insert\(|\.upsert\(|console\./);
    expect(client).not.toMatch(/localStorage|sessionStorage|document\.cookie|CHECKOUT_SECURITY_SECRET|console\./);
  });
});

describe('owner payment operations health endpoint', () => {
  it('returns only aggregate health and classifies stale unpaid work as attention required', async () => {
    managerMocks.rpc.mockResolvedValue({
      data: [healthRow({
        is_healthy: false,
        stale_unpaid_checkout_intents: 2
      })],
      error: null
    });
    const response = await healthGet(new Request(
      'https://racoben.com/snickerdoodle/api/manager/health',
      { headers: { authorization: bearer } }
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json() as { health: Record<string, unknown> };
    expect(body.health.status).toBe('attention_required');
    expect(body.health.attention_reasons).toEqual(['stale_unpaid_checkout_intents']);
    expect(body.health.stale_unpaid_checkout_intents).toBe(2);
    expect(JSON.stringify(body)).not.toMatch(/delivery_email|brief_json|payload|secret|token/i);
    expect(managerMocks.rpc).toHaveBeenCalledWith('payment_operations_health');
  });
});
