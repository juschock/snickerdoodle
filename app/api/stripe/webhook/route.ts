import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { readWebhookPaymentConfig } from '@/lib/payment-runtime';
import { normalizeStripePaymentEvent } from '@/lib/payment-state-machine';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

type PaymentEventResult = {
  processing_status: 'processed' | 'ignored' | 'failed_retryable';
  transition_code: string;
  order_id: string | null;
  attempt_count: number;
};

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const config = readWebhookPaymentConfig();
  if (!config) return noStoreJson({ error: 'Webhook is unavailable.' }, 503);

  const signature = request.headers.get('stripe-signature');
  if (!signature) return noStoreJson({ error: 'Missing signature.' }, 400);

  let event: Stripe.Event;
  try {
    const body = await readRequestBodyBytes(request, MAX_WEBHOOK_BODY_BYTES);
    event = getStripe().webhooks.constructEvent(
      Buffer.from(body),
      signature,
      config.webhookSecret
    );
  } catch (error) {
    logSecurityEvent('warn', 'stripe.webhook_rejected', {
      requestId,
      reason: error instanceof RequestBodyTooLargeError ? 'too_large' : 'invalid_signature'
    });
    return noStoreJson(
      { error: error instanceof RequestBodyTooLargeError ? 'Payload too large.' : 'Invalid signature.' },
      400
    );
  }

  if (event.livemode !== config.livemode) {
    logSecurityEvent('warn', 'stripe.webhook_rejected', { requestId, reason: 'mode_mismatch' });
    return noStoreJson({ error: 'Invalid event mode.' }, 400);
  }

  const normalized = normalizeStripePaymentEvent(event);
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    const knownCheckoutEvent = normalized.rule !== null;
    if (knownCheckoutEvent && (
      session.metadata?.offer_id !== config.offer.id ||
      normalized.amountTotal !== config.offer.amountCents ||
      normalized.currency !== config.offer.currency
    )) {
      logSecurityEvent('warn', 'stripe.webhook_rejected', {
        requestId,
        eventId: event.id,
        reason: 'checkout_integrity_mismatch'
      });
      return noStoreJson({ error: 'Webhook processing failed.' }, 500);
    }
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('process_stripe_payment_event', {
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
  const result = (Array.isArray(data) ? data[0] : data) as PaymentEventResult | null;
  if (error || !result || result.processing_status === 'failed_retryable') {
    logSecurityEvent('error', 'stripe.webhook_failed', {
      requestId,
      eventId: event.id,
      reason: error ? 'atomic_rpc_failed' : result?.transition_code ?? 'result_missing',
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
