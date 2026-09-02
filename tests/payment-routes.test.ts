import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  updateEq: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  checkoutExpire: vi.fn(),
  constructEvent: vi.fn(),
  stripeIntegrationIdentifier: vi.fn()
}));

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('@/lib/stripe', () => ({
  stripeIntegrationIdentifier: mocks.stripeIntegrationIdentifier,
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mocks.checkoutCreate,
        retrieve: mocks.checkoutRetrieve,
        expire: mocks.checkoutExpire
      }
    },
    webhooks: { constructEvent: mocks.constructEvent }
  })
}));

import { POST as checkoutPost } from '@/app/api/checkout/route';
import { POST as webhookPost } from '@/app/api/stripe/webhook/route';
import {
  BRIEF_ACCESS_COOKIE_NAME,
  checkoutBriefIntegrityDigest,
  createBriefAccessToken,
  createPendingIntakeId
} from '@/lib/checkout-security';
import { COMMERCIAL_GATE_NAMES } from '@/lib/commercial-readiness.mjs';
import { emptyBrief } from '@/lib/intake';

const originalEnvironment = new Map<string, string | undefined>();
const controlledEnvironment = [
  ...COMMERCIAL_GATE_NAMES,
  'SNICKERDOODLE_PAYMENTS_ENABLED',
  'SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED',
  'SNICKERDOODLE_STRIPE_LIVEMODE',
  'SNICKERDOODLE_ALLOWED_ORIGIN',
  'CHECKOUT_SECURITY_SECRET',
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_WEBHOOK_SECRET'
];

const validBrief = {
  ...emptyBrief,
  primaryAction: 'Register',
  organizationName: 'Community Group',
  campaignName: 'Fall event',
  dateTime: 'October 15 at 6 PM',
  locationOrLink: '123 Main Street',
  audience: 'Local families',
  mainGoal: 'Reach 100 registrations',
  offerAsk: 'Register online',
  keyDetails: 'Doors open at 5:30 PM',
  deliveryEmail: 'customer@example.com'
};

function readyEnvironment() {
  for (const name of COMMERCIAL_GATE_NAMES) process.env[name] = 'true';
  process.env.SNICKERDOODLE_PAYMENTS_ENABLED = 'true';
  process.env.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED = 'true';
  process.env.SNICKERDOODLE_STRIPE_LIVEMODE = 'false';
  process.env.SNICKERDOODLE_ALLOWED_ORIGIN = 'https://racoben.com';
  process.env.CHECKOUT_SECURITY_SECRET = 'test-only-checkout-security-secret';
  process.env.STRIPE_RESTRICTED_KEY = 'rk_test_example';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
}

beforeEach(() => {
  for (const name of controlledEnvironment) originalEnvironment.set(name, process.env[name]);
  readyEnvironment();

  mocks.rpc.mockReset();
  mocks.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.updateEq.mockReset().mockResolvedValue({ error: null });
  mocks.checkoutCreate.mockReset().mockImplementation(async (params: { expires_at: number }) => ({
    id: 'cs_test_checkout',
    url: 'https://checkout.stripe.com/c/pay/test',
    status: 'open',
    expires_at: params.expires_at
  }));
  mocks.checkoutRetrieve.mockReset();
  mocks.checkoutExpire.mockReset().mockImplementation(async (sessionId: string) => ({
    id: sessionId,
    status: 'expired'
  }));
  mocks.constructEvent.mockReset();
  mocks.stripeIntegrationIdentifier.mockReset().mockReturnValue('snickerdoodle_abcdefgh');

  const supabase = {
    rpc: mocks.rpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle }))
      })),
      insert: mocks.insert,
      update: vi.fn(() => ({ eq: mocks.updateEq }))
    }))
  };
  mocks.getSupabaseAdmin.mockReset().mockReturnValue(supabase);
  mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'consume_checkout_rate_limit') {
      return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
    }
    if (name === 'reserve_stripe_checkout_capacity') {
      return {
        data: [{
          reservation_status: 'reserved',
          stripe_session_expires_at: args?.p_stripe_session_expires_at
        }],
        error: null
      };
    }
    if (name === 'process_stripe_payment_event') {
      return {
        data: [{
          processing_status: 'processed',
          transition_code: args?.p_event_type === 'checkout.session.completed'
            ? 'checkout_paid'
            : 'payment_event_recorded',
          order_id: args?.p_event_type === 'checkout.session.completed'
            ? '11111111-1111-4111-8111-111111111111'
            : null,
          attempt_count: 1
        }],
        error: null
      };
    }
    if (name === 'compensate_stripe_checkout_setup') {
      return { data: 'released', error: null };
    }
    return { data: null, error: null };
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnvironment.clear();
  vi.restoreAllMocks();
});

describe('live-capable checkout route', () => {
  it('creates an idempotent Stripe-hosted Checkout Session after exact access checks', async () => {
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce: '11111111-1111-4111-8111-111111111111',
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-123456',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: 'https://checkout.stripe.com/c/pay/test' });
    expect(mocks.checkoutCreate).toHaveBeenCalledTimes(1);
    const [params, options] = mocks.checkoutCreate.mock.calls[0];
    expect(params.client_reference_id).toBe(createPendingIntakeId({
      brief: validBrief,
      intakeVersion: 'snickerdoodle-checkout-v2',
      clientKey: '11111111-1111-4111-8111-111111111111.checkout-test-key-123456',
      accessId: '11111111-1111-4111-8111-111111111111',
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    }));
    expect(params).toMatchObject({
      mode: 'payment',
      integration_identifier: 'snickerdoodle_abcdefgh',
      billing_address_collection: 'required',
      consent_collection: { terms_of_service: 'required' }
    });
    expect(params).not.toHaveProperty('payment_method_types');
    expect(params).not.toHaveProperty('automatic_tax');
    expect(params.expires_at).toEqual(expect.any(Number));
    expect(params.expires_at).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000) + 35 * 60);
    expect(options.idempotencyKey).toMatch(/^snickerdoodle:/);
    expect(mocks.stripeIntegrationIdentifier).toHaveBeenCalledWith(
      params.client_reference_id,
      process.env.CHECKOUT_SECURITY_SECRET
    );
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.updateEq).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_stripe_checkout_capacity', expect.objectContaining({
      p_intent_id: params.client_reference_id
    }));
    expect(mocks.rpc).toHaveBeenCalledWith('bind_stripe_checkout_capacity', expect.objectContaining({
      p_intent_id: params.client_reference_id,
      p_checkout_session_id: 'cs_test_checkout'
    }));
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_stripe_checkout_setup', expect.objectContaining({
      p_intent_id: params.client_reference_id,
      p_checkout_session_id: 'cs_test_checkout'
    }));
  });

  it('refuses Session creation when database latency consumes the provider safety margin', async () => {
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce: '11111111-1111-4111-8111-111111111111',
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'consume_checkout_rate_limit') {
        return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
      }
      if (name === 'reserve_stripe_checkout_capacity') {
        return {
          data: [{
            reservation_status: 'reserved',
            stripe_session_expires_at: new Date(Date.now() + 34 * 60 * 1000).toISOString()
          }],
          error: null
        };
      }
      if (name === 'compensate_stripe_checkout_setup') {
        return { data: 'released', error: null };
      }
      return { data: null, error: null };
    });

    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-123456',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(500);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('compensate_stripe_checkout_setup', expect.objectContaining({
      p_checkout_session_id: null,
      p_provider_session_expired: false,
      p_reason_code: 'capacity_expiry_margin_too_short'
    }));
  });

  it('expires and releases a created Session when the atomic database bind fails', async () => {
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce: '11111111-1111-4111-8111-111111111111',
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'consume_checkout_rate_limit') {
        return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
      }
      if (name === 'reserve_stripe_checkout_capacity') {
        return { data: [{ reservation_status: 'reserved', stripe_session_expires_at: args?.p_stripe_session_expires_at }], error: null };
      }
      if (name === 'bind_stripe_checkout_capacity') {
        return { data: null, error: { code: '40001', message: 'concurrent change' } };
      }
      if (name === 'compensate_stripe_checkout_setup') {
        return { data: 'released', error: null };
      }
      return { data: null, error: null };
    });

    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-123456',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(500);
    expect(mocks.checkoutExpire).toHaveBeenCalledWith('cs_test_checkout');
    expect(mocks.rpc).toHaveBeenCalledWith('compensate_stripe_checkout_setup', expect.objectContaining({
      p_checkout_session_id: 'cs_test_checkout',
      p_provider_session_expired: true,
      p_reason_code: 'capacity_session_bind_failed'
    }));
  });

  it('returns a reset-safe conflict for the exact retry after compensated expiration', async () => {
    const nonce = '11111111-1111-4111-8111-111111111111';
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    const intentId = createPendingIntakeId({
      brief: validBrief,
      intakeVersion: 'snickerdoodle-checkout-v2',
      clientKey: `${nonce}.checkout-test-key-123456`,
      accessId: nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: intentId,
        brief_json: validBrief,
        delivery_email: validBrief.deliveryEmail,
        amount_cents: 9900,
        currency: 'usd',
        stripe_checkout_session_id: 'cs_test_checkout',
        terms_version: '2026-08-30',
        status: 'expired'
      },
      error: null
    });

    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-123456',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'This checkout session has expired. Request a new private link.'
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'reserve_stripe_checkout_capacity',
      expect.any(Object)
    );
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('creates Checkout after its independent per-intent reservation succeeds', async () => {
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce: '11111111-1111-4111-8111-111111111111',
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'consume_checkout_rate_limit') {
        return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
      }
      if (name === 'reserve_stripe_checkout_capacity') {
        return {
          data: [{
            reservation_status: 'reserved',
            stripe_session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          }],
          error: null
        };
      }
      return { data: null, error: null };
    });

    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-123456',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_stripe_checkout_capacity', expect.any(Object));
    expect(mocks.checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('reuses the reservation expiry and bound Stripe Session on an exact retry', async () => {
    const nonce = '11111111-1111-4111-8111-111111111111';
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    const intentId = createPendingIntakeId({
      brief: validBrief,
      intakeVersion: 'snickerdoodle-checkout-v2',
      clientKey: `${nonce}.checkout-test-key-123456`,
      accessId: nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    const fixedExpiry = Math.floor(Date.now() / 1000) + 20 * 60;
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: intentId,
        brief_json: validBrief,
        delivery_email: validBrief.deliveryEmail,
        amount_cents: 9900,
        currency: 'usd',
        stripe_checkout_session_id: 'cs_test_existing',
        terms_version: '2026-08-30',
        status: 'checkout_created'
      },
      error: null
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'consume_checkout_rate_limit') {
        return { data: { allowed: true, retry_after_seconds: 0 }, error: null };
      }
      if (name === 'reserve_stripe_checkout_capacity') {
        return {
          data: [{
            reservation_status: 'same',
            stripe_session_expires_at: new Date(fixedExpiry * 1000).toISOString()
          }],
          error: null
        };
      }
      return { data: null, error: null };
    });
    mocks.checkoutRetrieve.mockResolvedValue({
      id: 'cs_test_existing',
      status: 'open',
      url: 'https://checkout.stripe.com/c/pay/existing',
      expires_at: fixedExpiry
    });

    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-654321',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://checkout.stripe.com/c/pay/existing'
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.checkoutRetrieve).toHaveBeenCalledWith('cs_test_existing');
    expect(mocks.rpc).toHaveBeenCalledWith('bind_stripe_checkout_capacity', {
      p_intent_id: intentId,
      p_checkout_session_id: 'cs_test_existing',
      p_stripe_session_expires_at: new Date(fixedExpiry * 1000).toISOString()
    });
  });

  it('binds one private invite to one exact survey across rotated client keys', async () => {
    const nonce = '11111111-1111-4111-8111-111111111111';
    const token = createBriefAccessToken({
      email: validBrief.deliveryEmail,
      expiresAt: Date.now() + 60_000,
      nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    const intentId = createPendingIntakeId({
      brief: validBrief,
      intakeVersion: 'snickerdoodle-checkout-v2',
      clientKey: `${nonce}.checkout-test-key-123456`,
      accessId: nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    const rotatedIntentId = createPendingIntakeId({
      brief: { ...validBrief, campaignName: 'Rotated campaign' },
      intakeVersion: 'snickerdoodle-checkout-v2',
      clientKey: `${nonce}.checkout-test-key-654321`,
      accessId: nonce,
      secret: process.env.CHECKOUT_SECURITY_SECRET!
    });
    expect(rotatedIntentId).toBe(intentId);
    expect(checkoutBriefIntegrityDigest(validBrief, process.env.CHECKOUT_SECURITY_SECRET!))
      .not.toBe(checkoutBriefIntegrityDigest(
        { ...validBrief, campaignName: 'Rotated campaign' },
        process.env.CHECKOUT_SECURITY_SECRET!
      ));

    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: intentId,
        brief_json: { ...validBrief, campaignName: 'Original campaign' },
        delivery_email: validBrief.deliveryEmail,
        amount_cents: 9900,
        currency: 'usd',
        stripe_checkout_session_id: null,
        terms_version: '2026-08-30',
        status: 'pending'
      },
      error: null
    });

    const response = await checkoutPost(new Request('https://racoben.com/snickerdoodle/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'checkout-test-key-654321',
        origin: 'https://racoben.com',
        cookie: `${BRIEF_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}`
      },
      body: JSON.stringify(validBrief)
    }));

    expect(response.status).toBe(409);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('signed webhook route', () => {
  it('verifies and finalizes a paid Checkout Session idempotently', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_test_paid',
      type: 'checkout.session.completed',
      livemode: false,
      created: 1_788_000_000,
      data: {
        object: {
          id: 'cs_test_checkout',
          payment_status: 'paid',
          client_reference_id: '22222222-2222-4222-8222-222222222222',
          metadata: {
            checkout_intent_id: '22222222-2222-4222-8222-222222222222',
            offer_id: 'standard_99'
          },
          customer_details: { email: 'customer@example.com' },
          customer_email: 'customer@example.com',
          customer: 'cus_test_paid',
          payment_intent: 'pi_test_paid',
          amount_total: 9900,
          currency: 'usd'
        }
      }
    });

    const response = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=test' },
      body: '{}'
    }));

    expect(response.status).toBe(200);
    expect(mocks.constructEvent).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('process_stripe_payment_event', expect.objectContaining({
      p_event_id: 'evt_test_paid',
      p_amount_total: 9900,
      p_currency: 'usd',
      p_stripe_customer_id: 'cus_test_paid'
    }));
  });

  it('uses one generic durable finalization failure for obsolete capacity errors', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_test_capacity_exhausted',
      type: 'checkout.session.completed',
      livemode: false,
      created: 1_788_000_000,
      data: {
        object: {
          id: 'cs_test_capacity_exhausted',
          payment_status: 'paid',
          client_reference_id: '33333333-3333-4333-8333-333333333333',
          metadata: {
            checkout_intent_id: '33333333-3333-4333-8333-333333333333',
            offer_id: 'standard_99'
          },
          customer_details: { email: 'capacity@example.com' },
          customer_email: 'capacity@example.com',
          customer: 'cus_test_capacity_exhausted',
          payment_intent: 'pi_test_capacity_exhausted',
          amount_total: 9900,
          currency: 'usd'
        }
      }
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'process_stripe_payment_event') {
        return {
          data: [{
            processing_status: 'failed_retryable',
            transition_code: 'retry_required',
            order_id: null,
            attempt_count: 1
          }],
          error: null
        };
      }
      return { data: null, error: null };
    });

    const response = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=test' },
      body: '{}'
    }));

    expect(response.status).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledWith('process_stripe_payment_event', expect.objectContaining({
      p_event_id: 'evt_test_capacity_exhausted',
      p_stripe_customer_id: 'cus_test_capacity_exhausted'
    }));
  });

  it('rejects an invalid signature before touching Supabase', async () => {
    mocks.constructEvent.mockImplementation(() => { throw new Error('signature'); });

    const response = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'bad' },
      body: '{}'
    }));

    expect(response.status).toBe(400);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['charge.refunded', { id: 'ch_test_refunded', payment_intent: 'pi_test_paid', customer: 'cus_test_paid', amount: 9900, amount_refunded: 9900, currency: 'usd' }],
    ['charge.dispute.created', { id: 'dp_test_open', payment_intent: 'pi_test_paid', charge: 'ch_test_paid', amount: 9900, currency: 'usd', status: 'needs_response' }],
    ['charge.dispute.closed', { id: 'dp_test_closed', payment_intent: 'pi_test_paid', charge: 'ch_test_paid', amount: 9900, currency: 'usd', status: 'won' }]
  ])('atomically records %s and acknowledges it', async (
    eventType,
    object
  ) => {
    mocks.constructEvent.mockReturnValue({
      id: `evt_${eventType.replaceAll('.', '_')}`,
      type: eventType,
      livemode: false,
      created: 1_788_000_000,
      data: { object }
    });

    const response = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=test' },
      body: '{}'
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('process_stripe_payment_event', expect.objectContaining({
      p_event_type: eventType,
      p_amount_total: 9900,
      p_currency: 'usd'
    }));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('releases the exact reservation on a signed Checkout expiration and acknowledges the durable alert', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_test_checkout_expired',
      type: 'checkout.session.expired',
      livemode: false,
      created: 1_788_000_000,
      data: {
        object: {
          id: 'cs_test_expired',
          payment_status: 'unpaid',
          client_reference_id: '22222222-2222-4222-8222-222222222222',
          metadata: {
            checkout_intent_id: '22222222-2222-4222-8222-222222222222',
            offer_id: 'standard_99'
          },
          amount_total: 9900,
          currency: 'usd'
        }
      }
    });

    const response = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=test' },
      body: '{}'
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('process_stripe_payment_event', expect.objectContaining({
      p_event_id: 'evt_test_checkout_expired',
      p_event_type: 'checkout.session.expired',
      p_checkout_session_id: 'cs_test_expired',
      p_checkout_intent_id: '22222222-2222-4222-8222-222222222222',
      p_provider_status: 'unpaid'
    }));
  });

  it('closes the bound unpaid intent and durably receipts an asynchronous payment failure', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_test_async_payment_failed',
      type: 'checkout.session.async_payment_failed',
      livemode: false,
      created: 1_788_000_000,
      data: {
        object: {
          id: 'cs_test_checkout',
          payment_status: 'unpaid',
          client_reference_id: '22222222-2222-4222-8222-222222222222',
          metadata: {
            checkout_intent_id: '22222222-2222-4222-8222-222222222222',
            offer_id: 'standard_99'
          },
          amount_total: 9900,
          currency: 'usd'
        }
      }
    });

    const response = await webhookPost(new Request('https://racoben.com/snickerdoodle/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=test' },
      body: '{}'
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('process_stripe_payment_event', expect.objectContaining({
      p_event_id: 'evt_test_async_payment_failed',
      p_event_type: 'checkout.session.async_payment_failed',
      p_checkout_session_id: 'cs_test_checkout',
      p_checkout_intent_id: '22222222-2222-4222-8222-222222222222',
      p_provider_status: 'unpaid'
    }));
  });
});
