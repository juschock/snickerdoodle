import 'server-only';

import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentRuntimeConfig } from './payment-runtime';
import { normalizeStripePaymentEvent } from './payment-state-machine';
import { readRequestBodyBytes, RequestBodyTooLargeError } from './request-body';
import { logSecurityEvent, requestCorrelationId } from './security-log';
import { getSupabaseAdmin } from './supabase-admin';

export const MAX_STRIPE_WEBHOOK_BODY_BYTES = 256 * 1024;

export const SUPPORTED_STRIPE_WEBHOOK_EVENTS = new Set<string>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed'
]);

type WebhookRuntimeConfig = Pick<
  PaymentRuntimeConfig,
  'livemode' | 'offer' | 'webhookSecret'
>;

type PaymentEventResult = {
  processing_status: 'processed' | 'ignored' | 'failed_retryable';
  transition_code: string;
  order_id: string | null;
  attempt_count: number;
};

type PaymentEventArguments = {
  p_event_id: string;
  p_event_type: string;
  p_livemode: boolean;
  p_checkout_session_id: string | null;
  p_checkout_intent_id: string | null;
  p_payment_intent_id: string | null;
  p_stripe_customer_id: string | null;
  p_charge_id: string | null;
  p_dispute_id: string | null;
  p_amount_total: number | null;
  p_amount_refunded: number | null;
  p_currency: string | null;
  p_customer_email: string | null;
  p_provider_status: string | null;
  p_occurred_at: string;
  p_test_fail_after_business: false;
};

export type WebhookDependencies = {
  constructEvent: (
    body: Uint8Array,
    signature: string,
    secret: string
  ) => Stripe.Event;
  processPaymentEvent: (args: PaymentEventArguments) => Promise<PaymentEventResult | null>;
};

const defaultDependencies: WebhookDependencies = {
  constructEvent(body, signature, secret) {
    return Stripe.webhooks.constructEvent(Buffer.from(body), signature, secret);
  },
  async processPaymentEvent(args) {
    const supabase = getSupabaseAdmin() as SupabaseClient;
    const { data, error } = await supabase.rpc('process_stripe_payment_event', args);
    if (error) return null;
    return (Array.isArray(data) ? data[0] : data) as PaymentEventResult | null;
  }
};

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function isJsonContentType(value: string | null) {
  return Boolean(value && /^application\/json(?:\s*;|$)/i.test(value));
}

function isStripeEventEnvelope(event: Stripe.Event) {
  return Boolean(
    event &&
    typeof event.id === 'string' &&
    /^evt_[A-Za-z0-9_]{1,250}$/.test(event.id) &&
    typeof event.type === 'string' &&
    event.type.length >= 3 &&
    event.type.length <= 255 &&
    typeof event.livemode === 'boolean' &&
    Number.isSafeInteger(event.created) &&
    event.created > 0 &&
    event.data &&
    typeof event.data === 'object' &&
    event.data.object &&
    typeof event.data.object === 'object'
  );
}

function isBoundedProviderId(value: string | null, prefix: string) {
  return Boolean(value && value.startsWith(prefix) && value.length <= 255);
}

function isUuid(value: string | null) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isSupportedEventShape(
  event: Stripe.Event,
  normalized: ReturnType<typeof normalizeStripePaymentEvent>
) {
  if (!normalized.rule || !Number.isSafeInteger(normalized.amountTotal) || normalized.amountTotal! < 0) {
    return false;
  }
  if (!normalized.currency || !/^[a-z]{3}$/.test(normalized.currency)) return false;

  if (event.type.startsWith('checkout.session.')) {
    const paid = event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded';
    return isBoundedProviderId(normalized.checkoutSessionId, 'cs_') &&
      isUuid(normalized.checkoutIntentId) &&
      (!paid || (
        isBoundedProviderId(normalized.paymentIntentId, 'pi_') &&
        isBoundedProviderId(normalized.stripeCustomerId, 'cus_')
      ));
  }

  if (event.type === 'charge.refunded') {
    return isBoundedProviderId(normalized.chargeId, 'ch_') &&
      isBoundedProviderId(normalized.paymentIntentId, 'pi_') &&
      Number.isSafeInteger(normalized.amountRefunded) &&
      normalized.amountRefunded! >= 0;
  }

  return isBoundedProviderId(normalized.disputeId, 'dp_') &&
    isBoundedProviderId(normalized.chargeId, 'ch_') &&
    isBoundedProviderId(normalized.paymentIntentId, 'pi_');
}

export async function handleStripePaymentWebhook(
  request: Request,
  config: WebhookRuntimeConfig | null,
  dependencyOverrides: Partial<WebhookDependencies> = {}
) {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const requestId = requestCorrelationId(request.headers);
  if (!config) return noStoreJson({ error: 'Webhook is unavailable.' }, 503);

  if (!isJsonContentType(request.headers.get('content-type'))) {
    return noStoreJson({ error: 'Unsupported content type.' }, 415);
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return noStoreJson({ error: 'Missing signature.' }, 400);

  let event: Stripe.Event;
  try {
    const body = await readRequestBodyBytes(request, MAX_STRIPE_WEBHOOK_BODY_BYTES);
    event = dependencies.constructEvent(body, signature, config.webhookSecret);
  } catch (error) {
    const reason = error instanceof RequestBodyTooLargeError
      ? 'too_large'
      : error instanceof SyntaxError
        ? 'malformed_payload'
        : 'invalid_signature';
    logSecurityEvent('warn', 'stripe.webhook_rejected', { requestId, reason });
    return noStoreJson(
      { error: error instanceof RequestBodyTooLargeError ? 'Payload too large.' : 'Invalid webhook.' },
      error instanceof RequestBodyTooLargeError ? 413 : 400
    );
  }

  if (!isStripeEventEnvelope(event)) {
    logSecurityEvent('warn', 'stripe.webhook_rejected', { requestId, reason: 'invalid_envelope' });
    return noStoreJson({ error: 'Invalid webhook.' }, 400);
  }

  if (event.livemode !== config.livemode) {
    logSecurityEvent('warn', 'stripe.webhook_rejected', { requestId, reason: 'mode_mismatch' });
    return noStoreJson({ error: 'Invalid event mode.' }, 400);
  }

  if (!SUPPORTED_STRIPE_WEBHOOK_EVENTS.has(event.type)) {
    logSecurityEvent('info', 'stripe.webhook_ignored', {
      requestId,
      eventId: event.id,
      reason: 'unsupported_event'
    });
    return noStoreJson({ received: true, ignored: true });
  }

  const normalized = normalizeStripePaymentEvent(event);
  if (!isSupportedEventShape(event, normalized)) {
    logSecurityEvent('warn', 'stripe.webhook_rejected', {
      requestId,
      eventId: event.id,
      reason: 'invalid_event_shape'
    });
    return noStoreJson({ error: 'Invalid webhook.' }, 400);
  }
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (
      normalized.rule === null ||
      session.metadata?.offer_id !== config.offer.id ||
      normalized.amountTotal !== config.offer.amountCents ||
      normalized.currency !== config.offer.currency
    ) {
      logSecurityEvent('warn', 'stripe.webhook_rejected', {
        requestId,
        eventId: event.id,
        reason: 'checkout_integrity_mismatch'
      });
      return noStoreJson({ error: 'Webhook processing failed.' }, 500);
    }
  }

  let result: PaymentEventResult | null;
  try {
    result = await dependencies.processPaymentEvent({
      p_event_id: event.id,
      p_event_type: event.type,
      p_livemode: event.livemode,
      p_checkout_session_id: normalized.checkoutSessionId,
      p_checkout_intent_id: normalized.checkoutIntentId,
      p_payment_intent_id: normalized.paymentIntentId,
      p_stripe_customer_id: normalized.stripeCustomerId,
      p_charge_id: normalized.chargeId,
      p_dispute_id: normalized.disputeId,
      p_amount_total: normalized.amountTotal,
      p_amount_refunded: normalized.amountRefunded,
      p_currency: normalized.currency,
      p_customer_email: normalized.customerEmail,
      p_provider_status: normalized.providerStatus,
      p_occurred_at: new Date(event.created * 1000).toISOString(),
      p_test_fail_after_business: false
    });
  } catch {
    result = null;
  }
  if (!result || result.processing_status === 'failed_retryable') {
    logSecurityEvent('error', 'stripe.webhook_failed', {
      requestId,
      eventId: event.id,
      reason: result?.transition_code ?? 'atomic_rpc_failed',
      receiptState: result?.processing_status ?? 'unavailable'
    });
    return noStoreJson({ error: 'Webhook processing failed.' }, 500);
  }

  logSecurityEvent('info', 'stripe.webhook_processed', {
    requestId,
    eventId: event.id,
    orderId: result.order_id,
    reconciliationState: result.transition_code,
    attemptCount: result.attempt_count
  });
  return noStoreJson({ received: true });
}
