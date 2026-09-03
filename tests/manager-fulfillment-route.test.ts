import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fulfillmentMocks = vi.hoisted(() => ({
  log: vi.fn(),
  rpc: vi.fn(),
  verify: vi.fn()
}));

vi.mock('@/lib/supabase-manager', () => ({
  getSupabaseManagerClient: () => ({ rpc: fulfillmentMocks.rpc }),
  verifySupabaseActiveOwnerAal2: fulfillmentMocks.verify
}));

vi.mock('@/lib/security-log', () => ({
  logSecurityEvent: fulfillmentMocks.log,
  requestCorrelationId: () => 'manager-fulfillment-test'
}));

import { POST } from '@/app/api/manager/fulfillment/route';
import {
  selectFulfillmentRetry,
  type FulfillmentAction
} from '@/components/manager-queue';

const bearer = `Bearer ${'x'.repeat(64)}`;
const orderId = '10000000-0000-4000-8000-000000000001';
const idempotencyKey = '20000000-0000-4000-8000-000000000002';
const originalAllowedOrigin = process.env.SNICKERDOODLE_ALLOWED_ORIGIN;

type Transition = {
  event_type: 'fulfillment.started' | 'fulfillment.completed' | 'order.closed';
  expected_status: 'new_intake' | 'drafting' | 'delivered';
};

function request(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request('https://racoben.com/snickerdoodle/api/manager/fulfillment', {
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

function transitionBody(transition: Transition, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    order_id: orderId,
    ...transition,
    idempotency_key: idempotencyKey,
    ...overrides
  });
}

beforeEach(() => {
  process.env.SNICKERDOODLE_ALLOWED_ORIGIN = 'https://racoben.com';
  fulfillmentMocks.log.mockReset();
  fulfillmentMocks.rpc.mockReset();
  fulfillmentMocks.verify.mockReset();
  fulfillmentMocks.verify.mockResolvedValue(true);
});

afterEach(() => {
  if (originalAllowedOrigin === undefined) delete process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
  else process.env.SNICKERDOODLE_ALLOWED_ORIGIN = originalAllowedOrigin;
});

describe('owner fulfillment authorization and request boundary', () => {
  it('rejects missing bearer authorization with private response headers', async () => {
    const response = await POST(new Request(
      'https://racoben.com/snickerdoodle/api/manager/fulfillment',
      { method: 'POST' }
    ));

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(fulfillmentMocks.verify).not.toHaveBeenCalled();
    expect(fulfillmentMocks.rpc).not.toHaveBeenCalled();
  });

  it('denies a session that does not satisfy active-owner AAL2', async () => {
    fulfillmentMocks.verify.mockResolvedValue(false);
    const response = await POST(request(transitionBody({
      event_type: 'fulfillment.started',
      expected_status: 'new_intake'
    })));

    expect(response.status).toBe(403);
    expect(fulfillmentMocks.rpc).not.toHaveBeenCalled();
    expect(fulfillmentMocks.log).toHaveBeenCalledWith(
      'warn',
      'manager_fulfillment.aal2_rejected',
      { requestId: 'manager-fulfillment-test' }
    );
  });

  it('rejects invalid origin, forwarded origin, content type, body, schema, and transition pairs', async () => {
    const valid = {
      event_type: 'fulfillment.started',
      expected_status: 'new_intake'
    } as const;
    const responses = await Promise.all([
      POST(request(transitionBody(valid), { origin: 'https://attacker.example' })),
      POST(request(transitionBody(valid), { 'x-forwarded-host': 'attacker.example' })),
      POST(request(transitionBody(valid), { 'content-type': 'text/plain' })),
      POST(request('{')),
      POST(request('x'.repeat(2 * 1024 + 1))),
      POST(request(transitionBody(valid, { order_id: 'not-a-uuid' }))),
      POST(request(transitionBody(valid, { idempotency_key: 'not-a-uuid' }))),
      POST(request(transitionBody(valid, { unexpected: true }))),
      POST(request(JSON.stringify({
        order_id: orderId,
        event_type: 'fulfillment.completed',
        expected_status: 'new_intake',
        idempotency_key: idempotencyKey
      })))
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 415, 400, 413, 400, 400, 400, 400
    ]);
    expect(fulfillmentMocks.rpc).not.toHaveBeenCalled();
  });
});

describe('owner fulfillment transition adapter', () => {
  it.each([
    [{ event_type: 'fulfillment.started', expected_status: 'new_intake' }, 'drafting'],
    [{ event_type: 'fulfillment.completed', expected_status: 'drafting' }, 'delivered'],
    [{ event_type: 'order.closed', expected_status: 'delivered' }, 'closed']
  ] as const)('passes exact RPC arguments for %s and returns only the validated next status', async (
    transition,
    nextStatus
  ) => {
    fulfillmentMocks.rpc.mockResolvedValue({ data: nextStatus, error: null });
    const response = await POST(request(transitionBody(transition)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: nextStatus });
    expect(fulfillmentMocks.rpc).toHaveBeenCalledWith('transition_order_fulfillment', {
      p_order_id: orderId,
      p_event_type: transition.event_type,
      p_expected_status: transition.expected_status,
      p_idempotency_key: idempotencyKey
    });
  });

  it('fails safely for an RPC error, authorization race, or unexpected result', async () => {
    fulfillmentMocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'sensitive provider detail' } })
      .mockResolvedValueOnce({ data: 'authorization_denied', error: null })
      .mockResolvedValueOnce({ data: 'unexpected_status', error: null });
    const body = transitionBody({
      event_type: 'fulfillment.started',
      expected_status: 'new_intake'
    });
    const responses = [
      await POST(request(body)),
      await POST(request(body)),
      await POST(request(body))
    ];

    expect(responses.map((response) => response.status)).toEqual([409, 403, 409]);
    for (const response of responses) {
      expect(JSON.stringify(await response.json())).not.toContain('sensitive provider detail');
    }
  });

  it('reuses one key for the same action and creates a new key for a different action or order', () => {
    const startAction: FulfillmentAction = {
      eventType: 'fulfillment.started',
      expectedStatus: 'new_intake',
      nextStatus: 'drafting',
      label: 'Start fulfillment'
    };
    const completeAction: FulfillmentAction = {
      eventType: 'fulfillment.completed',
      expectedStatus: 'drafting',
      nextStatus: 'delivered',
      label: 'Mark delivered'
    };
    const first = selectFulfillmentRetry(null, orderId, startAction, () => idempotencyKey);
    const same = selectFulfillmentRetry(first, orderId, startAction, () => {
      throw new Error('A retry must not allocate another key.');
    });
    const differentActionKey = '30000000-0000-4000-8000-000000000003';
    const differentOrderKey = '40000000-0000-4000-8000-000000000004';
    const differentAction = selectFulfillmentRetry(
      first,
      orderId,
      completeAction,
      () => differentActionKey
    );
    const differentOrder = selectFulfillmentRetry(
      first,
      '50000000-0000-4000-8000-000000000005',
      startAction,
      () => differentOrderKey
    );

    expect(same).toBe(first);
    expect(same.idempotencyKey).toBe(idempotencyKey);
    expect(differentAction.idempotencyKey).toBe(differentActionKey);
    expect(differentOrder.idempotencyKey).toBe(differentOrderKey);
  });

  it('uses no service role and keeps fulfillment state in memory in the selected paid UI', () => {
    const route = readFileSync('app/api/manager/fulfillment/route.ts', 'utf8');
    const client = readFileSync('components/manager-queue.tsx', 'utf8');

    expect(route).toContain('verifySupabaseActiveOwnerAal2');
    expect(route).toContain("rpc('transition_order_fulfillment'");
    expect(route).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdmin|console\./);
    expect(client).toContain('crypto.randomUUID()');
    expect(client).toContain('selectFulfillmentRetry(');
    expect(client).toContain("selectedIntake.payment_status === 'paid'");
    expect(client).toContain('disabled={loading || fulfillmentPending}');
    expect(client).toContain('await loadQueue(false, selectedIntentId)');
    expect(client).toContain('await loadPaidIntake(selectedIntentId)');
    expect(client).toContain('await loadOperationsHealth()');
    expect(client).not.toMatch(/localStorage|sessionStorage|document\.cookie|SUPABASE_SERVICE_ROLE_KEY/);
  });
});
