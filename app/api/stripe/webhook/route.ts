import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { readWebhookPaymentConfig } from '@/lib/payment-runtime';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const PAID_CHECKOUT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded'
]);
const CHECKOUT_RELEASE_EVENTS = new Map([
  ['checkout.session.async_payment_failed', 'async_payment_failed_attention_required'],
  ['checkout.session.expired', 'checkout_expired_attention_required']
]);
const MANUAL_RECONCILIATION_EVENTS = new Map([
  ['charge.refunded', 'refund_attention_required'],
  ['charge.dispute.created', 'dispute_opened_attention_required'],
  ['charge.dispute.closed', 'dispute_closed_attention_required']
]);

class WebhookProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WebhookProcessingError';
  }
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function checkoutSessionFrom(event: Stripe.Event) {
  return event.data.object as Stripe.Checkout.Session;
}

function stripeObjectId(value: string | { id: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function safeFailureCode(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) return 'payload_too_large';
  if (error instanceof WebhookProcessingError) return error.code;
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9]*Error$/.test(error.name)) {
    return error.name.replace(/Error$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }
  return 'processing_failure';
}

async function completeWebhookAttempt(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
  status: 'processed' | 'ignored',
  orderId: string | null
) {
  const { error } = await supabase.rpc('complete_stripe_webhook_attempt', {
    p_event_id: eventId,
    p_processing_status: status,
    p_order_id: orderId,
    p_error_code: null
  });
  if (error) throw new WebhookProcessingError('receipt_completion_failed');
}

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

  const session = event.type.startsWith('checkout.session.') ? checkoutSessionFrom(event) : null;
  const supabase = getSupabaseAdmin();
  const { error: beginError } = await supabase.rpc('begin_stripe_webhook_attempt', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_livemode: event.livemode,
    p_checkout_session_id: session?.id ?? null
  });
  if (beginError) {
    logSecurityEvent('error', 'stripe.webhook_receipt_failed', { requestId, eventId: event.id });
    return noStoreJson({ error: 'Webhook receipt failed.' }, 500);
  }

  try {
    if (PAID_CHECKOUT_EVENTS.has(event.type)) {
      if (!session || session.payment_status !== 'paid') {
        await completeWebhookAttempt(supabase, event.id, 'ignored', null);
        return noStoreJson({ received: true });
      }

      const intentId = session.metadata?.checkout_intent_id ?? session.client_reference_id;
      const offerId = session.metadata?.offer_id;
      const customerEmail = session.customer_details?.email ?? session.customer_email;
      const paymentIntentId = stripeObjectId(session.payment_intent);
      if (
        !intentId ||
        !customerEmail ||
        !paymentIntentId ||
        offerId !== config.offer.id ||
        session.amount_total !== config.offer.amountCents ||
        session.currency !== config.offer.currency
      ) {
        throw new WebhookProcessingError('checkout_integrity_mismatch');
      }

      const { data: orderId, error: finalizeError } = await supabase.rpc('finalize_stripe_checkout', {
        p_event_id: event.id,
        p_event_type: event.type,
        p_checkout_session_id: session.id,
        p_payment_intent_id: paymentIntentId,
        p_intent_id: intentId,
        p_amount_total: session.amount_total,
        p_currency: session.currency,
        p_customer_email: customerEmail,
        p_paid_at: new Date(event.created * 1000).toISOString()
      });
      if (finalizeError) throw new WebhookProcessingError('order_finalization_failed');
      if (!orderId) {
        throw new WebhookProcessingError('order_finalization_failed');
      }

      await completeWebhookAttempt(supabase, event.id, 'processed', orderId);
      logSecurityEvent('info', 'stripe.webhook_processed', {
        requestId,
        eventId: event.id,
        orderId,
        reconciliationState: 'checkout_paid'
      });
      return noStoreJson({ received: true });
    }

    const checkoutReleaseCode = CHECKOUT_RELEASE_EVENTS.get(event.type);
    if (checkoutReleaseCode) {
      const intentId = session?.metadata?.checkout_intent_id ?? session?.client_reference_id;
      if (
        !session ||
        !intentId ||
        session.payment_status === 'paid' ||
        session.metadata?.offer_id !== config.offer.id ||
        session.amount_total !== config.offer.amountCents ||
        session.currency !== config.offer.currency
      ) {
        throw new WebhookProcessingError('checkout_release_integrity_mismatch');
      }

      const { data: orderId, error: failureError } = await supabase.rpc(
        'record_stripe_operational_event',
        {
        p_event_id: event.id,
        p_event_type: event.type,
        p_checkout_session_id: session.id,
        p_checkout_intent_id: intentId,
        p_payment_intent_id: stripeObjectId(session.payment_intent),
        p_charge_id: null,
        p_dispute_id: null,
        p_alert_code: checkoutReleaseCode
        }
      );
      if (failureError) {
        throw new WebhookProcessingError('checkout_release_record_failed');
      }
      await completeWebhookAttempt(supabase, event.id, 'processed', orderId ?? null);
      logSecurityEvent('info', 'stripe.webhook_processed', {
        requestId,
        eventId: event.id,
        orderId: orderId ?? null,
        reconciliationState: checkoutReleaseCode
      });
      return noStoreJson({ received: true });
    }

    const manualReconciliationCode = MANUAL_RECONCILIATION_EVENTS.get(event.type);
    if (manualReconciliationCode) {
      const object = event.data.object as Stripe.Charge | Stripe.Dispute;
      if (!object.id) throw new WebhookProcessingError('operational_event_identifier_missing');

      const isDispute = event.type.startsWith('charge.dispute.');
      const paymentIntentId = stripeObjectId(object.payment_intent);
      const chargeId = isDispute
        ? stripeObjectId((object as Stripe.Dispute).charge)
        : (object as Stripe.Charge).id;
      const disputeId = isDispute ? (object as Stripe.Dispute).id : null;
      const { data: orderId, error: operationalError } = await supabase.rpc(
        'record_stripe_operational_event',
        {
          p_event_id: event.id,
          p_event_type: event.type,
          p_checkout_session_id: null,
          p_checkout_intent_id: null,
          p_payment_intent_id: paymentIntentId,
          p_charge_id: chargeId,
          p_dispute_id: disputeId,
          p_alert_code: manualReconciliationCode
        }
      );
      if (operationalError) {
        throw new WebhookProcessingError('operational_event_record_failed');
      }

      await completeWebhookAttempt(supabase, event.id, 'processed', orderId ?? null);
      logSecurityEvent('info', 'stripe.webhook_processed', {
        requestId,
        eventId: event.id,
        orderId: orderId ?? null,
        reconciliationState: manualReconciliationCode
      });
      return noStoreJson({ received: true });
    }

    await completeWebhookAttempt(supabase, event.id, 'ignored', null);
    return noStoreJson({ received: true });
  } catch (error) {
    const failureCode = safeFailureCode(error);
    const { error: receiptError } = await supabase.rpc('complete_stripe_webhook_attempt', {
      p_event_id: event.id,
      p_processing_status: 'failed',
      p_order_id: null,
      p_error_code: failureCode
    });
    logSecurityEvent('error', 'stripe.webhook_failed', {
      requestId,
      eventId: event.id,
      reason: failureCode,
      receiptState: receiptError ? 'completion_failed' : 'failed'
    });
    return noStoreJson({ error: 'Webhook processing failed.' }, 500);
  }
}
