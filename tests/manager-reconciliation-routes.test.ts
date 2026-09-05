import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  verify: vi.fn(),
  log: vi.fn()
}));

vi.mock('@/lib/supabase-manager', () => ({
  getSupabaseManagerClient: () => ({ rpc: mocks.rpc }),
  verifySupabaseActiveOwnerAal2: mocks.verify
}));

vi.mock('@/lib/security-log', () => ({
  logSecurityEvent: mocks.log,
  requestCorrelationId: () => 'manager-reconciliation-test'
}));

import { GET as alertsGet } from '@/app/api/manager/alerts/route';
import { POST as reconciliationPost } from '@/app/api/manager/reconciliation/route';

const bearer = `Bearer ${'x'.repeat(64)}`;
const allowedOrigin = 'https://racoben.com';
const originalAllowedOrigin = process.env.SNICKERDOODLE_ALLOWED_ORIGIN;

function alertRequest(headers: Record<string, string> = {}) {
  return new Request(
    'https://racoben.com/snickerdoodle/api/manager/alerts',
    {
      headers: {
        authorization: bearer,
        ...headers
      }
    }
  );
}

function reconciliationRequest(
  body: BodyInit | null,
  headers: Record<string, string> = {}
) {
  return new Request(
    'https://racoben.com/snickerdoodle/api/manager/reconciliation',
    {
      method: 'POST',
      headers: {
        authorization: bearer,
        origin: allowedOrigin,
        'content-type': 'application/json',
        ...headers
      },
      body
    }
  );
}

beforeEach(() => {
  process.env.SNICKERDOODLE_ALLOWED_ORIGIN = allowedOrigin;
  mocks.rpc.mockReset();
  mocks.verify.mockReset();
  mocks.log.mockReset();
  mocks.verify.mockResolvedValue(true);
});

afterEach(() => {
  if (originalAllowedOrigin === undefined) {
    delete process.env.SNICKERDOODLE_ALLOWED_ORIGIN;
  } else {
    process.env.SNICKERDOODLE_ALLOWED_ORIGIN = originalAllowedOrigin;
  }
});

describe('owner reconciliation alert GET', () => {
  it('requires bearer authorization', async () => {
    const response = await alertsGet(new Request(
      'https://racoben.com/snickerdoodle/api/manager/alerts'
    ));

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires a current active-owner AAL2 session', async () => {
    mocks.verify.mockResolvedValue(false);

    const response = await alertsGet(alertRequest());

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(
      'warn',
      'manager_alerts.aal2_rejected',
      { requestId: 'manager-reconciliation-test' }
    );
  });

  it('returns exactly the six metadata-only RPC fields', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        alert_id: '11111111-1111-4111-8111-111111111111',
        event_type: 'checkout.session.expired',
        alert_code: 'checkout_expired_attention_required',
        occurrence_count: 2,
        last_observed_at: '2026-09-04T21:00:00.000Z',
        can_resolve_expiry: true
      }],
      error: null
    });

    const response = await alertsGet(alertRequest());

    expect(response.status).toBe(200);
    const body = await response.json() as {
      alerts: Array<Record<string, unknown>>;
    };
    expect(body.alerts).toEqual([{
      alert_id: '11111111-1111-4111-8111-111111111111',
      event_type: 'checkout.session.expired',
      alert_code: 'checkout_expired_attention_required',
      occurrence_count: 2,
      last_observed_at: '2026-09-04T21:00:00.000Z',
      can_resolve_expiry: true
    }]);
    expect(Object.keys(body.alerts[0]).sort()).toEqual([
      'alert_code',
      'alert_id',
      'can_resolve_expiry',
      'event_type',
      'last_observed_at',
      'occurrence_count'
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /checkout_session|payment_intent|event_id|order_id|delivery_email|payload|secret|token/i
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'read_owner_reconciliation_alerts',
      { p_limit: 50 }
    );
  });

  it('fails closed on malformed or over-projected RPC results', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        alert_id: '11111111-1111-4111-8111-111111111111',
        event_type: 'checkout.session.expired',
        alert_code: 'checkout_expired_attention_required',
        occurrence_count: 1,
        last_observed_at: '2026-09-04T21:00:00.000Z',
        can_resolve_expiry: true,
        checkout_session_id: 'cs_should_not_escape'
      }],
      error: null
    });

    const response = await alertsGet(alertRequest());

    expect(response.status).toBe(503);
  });
});

describe('owner expiry reconciliation POST', () => {
  const validBody = {
    alert_id: '11111111-1111-4111-8111-111111111111',
    expected_occurrence_count: 2,
    idempotency_key: '22222222-2222-4222-8222-222222222222'
  };

  it('requires bearer authorization and AAL2', async () => {
    const missing = await reconciliationPost(new Request(
      'https://racoben.com/snickerdoodle/api/manager/reconciliation',
      {
        method: 'POST',
        headers: {
          origin: allowedOrigin,
          'content-type': 'application/json'
        },
        body: JSON.stringify(validBody)
      }
    ));
    expect(missing.status).toBe(401);

    mocks.verify.mockResolvedValue(false);
    const aal1 = await reconciliationPost(
      reconciliationRequest(JSON.stringify(validBody))
    );
    expect(aal1.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('enforces fulfillment-equivalent origin/content/body protections', async () => {
    const wrongOrigin = await reconciliationPost(
      reconciliationRequest(JSON.stringify(validBody), {
        origin: 'https://attacker.example'
      })
    );
    const wrongType = await reconciliationPost(
      reconciliationRequest(JSON.stringify(validBody), {
        'content-type': 'text/plain'
      })
    );
    const malformed = await reconciliationPost(
      reconciliationRequest('{')
    );
    const oversized = await reconciliationPost(
      reconciliationRequest('{}', {
        'content-length': String(2 * 1024 + 1)
      })
    );

    expect(wrongOrigin.status).toBe(403);
    expect(wrongType.status).toBe(415);
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts only the three strict resolution fields', async () => {
    const invalidCases = [
      { ...validBody, alert_id: 'not-a-uuid' },
      { ...validBody, expected_occurrence_count: 0 },
      { ...validBody, expected_occurrence_count: 1.5 },
      { ...validBody, idempotency_key: 'not-a-uuid' },
      { ...validBody, extra: true }
    ];

    for (const candidate of invalidCases) {
      const response = await reconciliationPost(
        reconciliationRequest(JSON.stringify(candidate))
      );
      expect(response.status).toBe(400);
    }

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns resolved only when the exact RPC returns resolved', async () => {
    mocks.rpc.mockResolvedValue({
      data: 'resolved',
      error: null
    });

    const response = await reconciliationPost(
      reconciliationRequest(JSON.stringify(validBody))
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'resolved' });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'resolve_owner_expired_checkout_alert',
      {
        p_alert_id: validBody.alert_id,
        p_expected_occurrence_count: validBody.expected_occurrence_count,
        p_idempotency_key: validBody.idempotency_key
      }
    );
  });

  it('fails closed when the RPC rejects or returns any non-resolved status', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40001', message: 'synthetic conflict' }
    });

    const conflict = await reconciliationPost(
      reconciliationRequest(JSON.stringify(validBody))
    );
    expect(conflict.status).toBe(409);

    mocks.rpc.mockResolvedValueOnce({
      data: 'anything_else',
      error: null
    });

    const unexpected = await reconciliationPost(
      reconciliationRequest(JSON.stringify(validBody))
    );
    expect(unexpected.status).toBe(409);
  });
});
