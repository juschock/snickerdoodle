import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNICKERDOODLE_OFFER } from '@/lib/offer';
import {
  handleStripePaymentWebhook,
  MAX_STRIPE_WEBHOOK_BODY_BYTES,
  SUPPORTED_STRIPE_WEBHOOK_EVENTS,
  type WebhookDependencies
} from '@/lib/stripe-webhook-handler';
import {
  readWebhookIngressConfig,
  WEBHOOK_INGRESS_CANDIDATE,
  WEBHOOK_INGRESS_SUPABASE_PROJECT
} from '@/lib/webhook-ingress-runtime';

const webhookSecret = 'whsec_localonlysignaturefixture';
const config = {
  livemode: false,
  offer: SNICKERDOODLE_OFFER,
  webhookSecret
};

function checkoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_local_ingress_paid',
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_ingress',
        object: 'checkout.session',
        payment_status: 'paid',
        client_reference_id: '22222222-2222-4222-8222-222222222222',
        metadata: {
          checkout_intent_id: '22222222-2222-4222-8222-222222222222',
          offer_id: 'standard_99'
        },
        customer_details: { email: 'synthetic@example.invalid' },
        customer_email: 'synthetic@example.invalid',
        customer: 'cus_test_ingress',
        payment_intent: 'pi_test_ingress',
        amount_total: 9900,
        currency: 'usd'
      }
    },
    ...overrides
  };
}

function signedRequest(payload: string, signaturePayload = payload, headers: Record<string, string> = {}) {
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: signaturePayload,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000)
  });
  return new Request('https://ingress.example.invalid/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'stripe-signature': signature,
      ...headers
    },
    body: payload
  });
}

function processedResult(attemptCount = 1) {
  return {
    processing_status: 'processed' as const,
    transition_code: 'checkout_paid',
    order_id: '33333333-3333-4333-8333-333333333333',
    attempt_count: attemptCount
  };
}

function processor() {
  const implementation: WebhookDependencies['processPaymentEvent'] = async () => processedResult();
  return vi.fn(implementation);
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('public Stripe sandbox webhook ingress', () => {
  it('rejects unsigned, bad-signature, and body-mutated requests before business logic', async () => {
    const processPaymentEvent = processor();
    const payload = JSON.stringify(checkoutEvent());
    const unsigned = new Request('https://ingress.example.invalid/api/stripe/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload
    });
    const badSignature = new Request('https://ingress.example.invalid/api/stripe/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' },
      body: payload
    });
    const mutated = signedRequest(payload.replace('9900', '9901'), payload);

    expect((await handleStripePaymentWebhook(unsigned, config, { processPaymentEvent })).status).toBe(400);
    expect((await handleStripePaymentWebhook(badSignature, config, { processPaymentEvent })).status).toBe(400);
    expect((await handleStripePaymentWebhook(mutated, config, { processPaymentEvent })).status).toBe(400);
    expect(processPaymentEvent).not.toHaveBeenCalled();
  });

  it('accepts a valid sandbox signature and emits only the fixed normalized payment input', async () => {
    const processPaymentEvent = processor();
    const payload = JSON.stringify(checkoutEvent());
    const response = await handleStripePaymentWebhook(
      signedRequest(payload),
      config,
      { processPaymentEvent }
    );

    expect(response.status).toBe(200);
    expect(processPaymentEvent).toHaveBeenCalledTimes(1);
    expect(processPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      p_event_id: 'evt_local_ingress_paid',
      p_event_type: 'checkout.session.completed',
      p_livemode: false,
      p_checkout_session_id: 'cs_test_ingress',
      p_checkout_intent_id: '22222222-2222-4222-8222-222222222222',
      p_payment_intent_id: 'pi_test_ingress',
      p_stripe_customer_id: 'cus_test_ingress',
      p_amount_total: 9900,
      p_currency: 'usd',
      p_provider_status: 'paid',
      p_test_fail_after_business: false
    }));
    expect(JSON.stringify(await response.json())).not.toContain(webhookSecret);
  });

  it('gives the protected app adapter and separate ingress identical normalized RPC input', async () => {
    const protectedAdapterProcessor = processor();
    const separateIngressProcessor = processor();
    const payload = JSON.stringify(checkoutEvent());

    const protectedResponse = await handleStripePaymentWebhook(
      signedRequest(payload),
      config,
      { processPaymentEvent: protectedAdapterProcessor }
    );
    const ingressResponse = await handleStripePaymentWebhook(
      signedRequest(payload),
      config,
      { processPaymentEvent: separateIngressProcessor }
    );

    expect(protectedResponse.status).toBe(200);
    expect(ingressResponse.status).toBe(200);
    expect(protectedAdapterProcessor.mock.calls).toEqual(separateIngressProcessor.mock.calls);
  });

  it('fails closed for live events, missing identity, and wrong Supabase project identity', async () => {
    const processPaymentEvent = processor();
    const livePayload = JSON.stringify(checkoutEvent({ livemode: true }));
    expect((await handleStripePaymentWebhook(
      signedRequest(livePayload),
      config,
      { processPaymentEvent }
    )).status).toBe(400);

    const validEnvironment = {
      NODE_ENV: 'test',
      SNICKERDOODLE_INGRESS_IDENTITY: 'snickerdoodle',
      SNICKERDOODLE_INGRESS_MODE: 'sandbox',
      SNICKERDOODLE_INGRESS_CANDIDATE: WEBHOOK_INGRESS_CANDIDATE,
      SNICKERDOODLE_SUPABASE_PROJECT_REF: WEBHOOK_INGRESS_SUPABASE_PROJECT,
      SUPABASE_URL: `https://${WEBHOOK_INGRESS_SUPABASE_PROJECT}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-fixture',
      STRIPE_WEBHOOK_SECRET: webhookSecret
    } as NodeJS.ProcessEnv;

    expect(readWebhookIngressConfig(validEnvironment)).toEqual(config);
    expect(readWebhookIngressConfig({ ...validEnvironment, SNICKERDOODLE_INGRESS_IDENTITY: 'other' })).toBeNull();
    expect(readWebhookIngressConfig({ ...validEnvironment, SNICKERDOODLE_INGRESS_MODE: 'live' })).toBeNull();
    expect(readWebhookIngressConfig({ ...validEnvironment, SNICKERDOODLE_INGRESS_CANDIDATE: 'other' })).toBeNull();
    expect(readWebhookIngressConfig({ ...validEnvironment, SNICKERDOODLE_SUPABASE_PROJECT_REF: 'other' })).toBeNull();
    expect(readWebhookIngressConfig({ ...validEnvironment, SUPABASE_URL: 'https://other.supabase.co' })).toBeNull();
    expect(processPaymentEvent).not.toHaveBeenCalled();
  });

  it('delivers duplicate event x5 to one idempotent authoritative identity', async () => {
    const seen = new Set<string>();
    let businessEffects = 0;
    const implementation: WebhookDependencies['processPaymentEvent'] = async (args) => {
      if (!seen.has(args.p_event_id)) {
        seen.add(args.p_event_id);
        businessEffects += 1;
      }
      return processedResult(seen.has(args.p_event_id) ? 1 : 0);
    };
    const processPaymentEvent = vi.fn(implementation);
    const payload = JSON.stringify(checkoutEvent());

    const responses = await Promise.all(Array.from({ length: 5 }, () =>
      handleStripePaymentWebhook(signedRequest(payload), config, { processPaymentEvent })
    ));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(processPaymentEvent).toHaveBeenCalledTimes(5);
    expect(new Set(processPaymentEvent.mock.calls.map(([args]) => args.p_event_id))).toEqual(
      new Set(['evt_local_ingress_paid'])
    );
    expect(businessEffects).toBe(1);
  });

  it('rejects unsupported content, oversized bodies, and malformed signed events safely', async () => {
    const processPaymentEvent = processor();
    const payload = JSON.stringify(checkoutEvent());
    const wrongType = signedRequest(payload, payload, { 'content-type': 'text/plain' });
    const oversized = signedRequest(payload, payload, {
      'content-length': String(MAX_STRIPE_WEBHOOK_BODY_BYTES + 1)
    });
    const malformed = signedRequest('{not-json');

    expect((await handleStripePaymentWebhook(wrongType, config, { processPaymentEvent })).status).toBe(415);
    expect((await handleStripePaymentWebhook(oversized, config, { processPaymentEvent })).status).toBe(413);
    expect((await handleStripePaymentWebhook(malformed, config, { processPaymentEvent })).status).toBe(400);
    expect(processPaymentEvent).not.toHaveBeenCalled();
  });

  it('safely acknowledges an unsupported signed event without invoking payment state', async () => {
    const processPaymentEvent = processor();
    const payload = JSON.stringify(checkoutEvent({
      id: 'evt_local_unsupported',
      type: 'customer.created',
      data: { object: { id: 'cus_unsupported', object: 'customer' } }
    }));
    const response = await handleStripePaymentWebhook(
      signedRequest(payload),
      config,
      { processPaymentEvent }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, ignored: true });
    expect(processPaymentEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed signed event envelopes before payment state', async () => {
    const processPaymentEvent = processor();
    const payload = JSON.stringify({
      id: 'not-an-event',
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {}
    });
    const response = await handleStripePaymentWebhook(
      signedRequest(payload),
      config,
      { processPaymentEvent }
    );

    expect(response.status).toBe(400);
    expect(processPaymentEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed supported-event objects and masks processor failures', async () => {
    const processPaymentEvent = processor();
    const malformedPayload = JSON.stringify(checkoutEvent({
      data: { object: { id: 'cs_test_missing_bindings' } }
    }));
    const malformedResponse = await handleStripePaymentWebhook(
      signedRequest(malformedPayload),
      config,
      { processPaymentEvent }
    );
    expect(malformedResponse.status).toBe(400);
    expect(processPaymentEvent).not.toHaveBeenCalled();

    const failingProcessor: WebhookDependencies['processPaymentEvent'] = async () => {
      throw new Error(`synthetic processor detail ${webhookSecret}`);
    };
    const failedResponse = await handleStripePaymentWebhook(
      signedRequest(JSON.stringify(checkoutEvent())),
      config,
      { processPaymentEvent: failingProcessor }
    );
    expect(failedResponse.status).toBe(500);
    expect(JSON.stringify(await failedResponse.json())).not.toContain(webhookSecret);
  });

  it('has one server-only core, a compile-time RPC target, seven events, and no bypass or UI', () => {
    const root = process.cwd();
    const core = readFileSync(join(root, 'lib/stripe-webhook-handler.ts'), 'utf8');
    const appRoute = readFileSync(join(root, 'app/api/stripe/webhook/route.ts'), 'utf8');
    const ingressRoot = join(root, 'services/snickerdoodle-webhook-ingress');
    const ingressRoute = readFileSync(join(ingressRoot, 'app/api/stripe/webhook/route.ts'), 'utf8');
    const ingressFiles = readdirSync(join(ingressRoot, 'app'), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
    const reviewedSources = [
      core,
      appRoute,
      ingressRoute,
      readFileSync(join(ingressRoot, '.env.example'), 'utf8')
    ].join('\n');

    expect(core.startsWith("import 'server-only';")).toBe(true);
    expect(core.match(/\.rpc\('process_stripe_payment_event'/g)).toHaveLength(1);
    expect(core).not.toMatch(/\.rpc\([^'\s]/);
    expect(SUPPORTED_STRIPE_WEBHOOK_EVENTS).toHaveLength(7);
    expect(appRoute).toContain("from '@/lib/stripe-webhook-handler'");
    expect(ingressRoute).toContain("lib/stripe-webhook-handler'");
    expect(ingressFiles).toEqual(['api/stripe/webhook/route.ts']);
    expect(reviewedSources).not.toMatch(/_vercel_(?:jwt|share)|x-vercel-protection-bypass|VERCEL_AUTOMATION_BYPASS_SECRET/i);
    expect(reviewedSources).not.toMatch(/STRIPE_(?:SECRET|RESTRICTED)_KEY/);
  });

  it('does not write secrets, signatures, raw payloads, card data, or PII to logs', async () => {
    const payload = JSON.stringify(checkoutEvent());
    const response = await handleStripePaymentWebhook(
      signedRequest(payload),
      config,
      { processPaymentEvent: processor() }
    );
    expect(response.status).toBe(200);
    const output = [console.info, console.warn, console.error]
      .flatMap((spy) => vi.mocked(spy).mock.calls.flat())
      .join('\n');

    expect(output).not.toContain(webhookSecret);
    expect(output).not.toContain('synthetic@example.invalid');
    expect(output).not.toContain('9900');
    expect(output).not.toContain(payload);
    expect(output).not.toContain('stripe-signature');
  });
});
