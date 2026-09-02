import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { briefCheckoutSchema } from '@/lib/checkout';
import {
  checkoutBriefIntegrityDigest,
  createPendingIntakeId,
  normalizeBriefIntake,
  normalizeIdempotencyKey,
  pseudonymizeBriefAccessSubject,
  pseudonymizeRateLimitSubject,
  readBriefAccessCookie,
  secureHexEqual,
  validateBriefAccessToken
} from '@/lib/checkout-security';
import { readCheckoutPaymentConfig } from '@/lib/payment-runtime';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import { PUBLIC_PREFIX, TERMS_VERSION } from '@/lib/site';
import { getStripe, stripeIntegrationIdentifier } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const MAX_CHECKOUT_BODY_BYTES = 64 * 1024;
const CHECKOUT_VERSION = 'snickerdoodle-checkout-v2';

type CheckoutIntent = {
  id: string;
  brief_json: unknown;
  delivery_email: string;
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  terms_version: string;
  status: string;
};

type RateLimitDecision = { allowed: boolean; retry_after_seconds: number };
type CheckoutReservation = {
  reservation_status: 'reserved' | 'same';
  stripe_session_expires_at: string | null;
};

const STRIPE_CHECKOUT_TTL_SECONDS = 60 * 60;
const STRIPE_CREATION_MINIMUM_MARGIN_SECONDS = 35 * 60;
const CAPACITY_EXPIRY_GRACE_SECONDS = 5 * 60;

class CheckoutOperationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CheckoutOperationError';
  }
}

function noStoreJson(body: Record<string, unknown>, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers }
  });
}

function publicRequestOrigin(request: Request, allowedOrigin: string) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',', 1)[0]?.trim();
  if (!forwardedHost) return new URL(request.url).origin;

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim().toLowerCase();
  const fallbackProto = new URL(allowedOrigin).protocol.slice(0, -1);
  const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : fallbackProto;
  try {
    return new URL(`${proto}://${forwardedHost}`).origin;
  } catch {
    return null;
  }
}

async function compensateCheckoutSetup(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  intentId: string,
  session: Stripe.Checkout.Session | null,
  reasonCode: string
) {
  let providerSessionExpired = false;
  if (session) {
    try {
      const expired = await getStripe().checkout.sessions.expire(session.id);
      providerSessionExpired = expired.status === 'expired';
    } catch {
      // The database compensation RPC below binds an ambiguous live Session
      // and opens a durable reconciliation alert instead of orphaning it.
      providerSessionExpired = false;
    }
  }

  const { data, error } = await supabase.rpc('compensate_stripe_checkout_setup', {
    p_intent_id: intentId,
    p_checkout_session_id: session?.id ?? null,
    p_provider_session_expired: providerSessionExpired,
    p_reason_code: reasonCode
  });
  if (error || !['released', 'reconciliation_required'].includes(String(data))) {
    throw new CheckoutOperationError('capacity_compensation_failed');
  }
  return String(data) as 'released' | 'reconciliation_required';
}

async function consumeCheckoutRateLimit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectHash: string,
  scope: 'checkout_ip' | 'checkout_email'
) {
  const { data, error } = await supabase.rpc('consume_checkout_rate_limit', {
    p_subject_hash: subjectHash,
    p_scope: scope
  });
  const decision = (Array.isArray(data) ? data[0] : data) as RateLimitDecision | null;
  if (
    error ||
    !decision ||
    typeof decision.allowed !== 'boolean' ||
    !Number.isInteger(decision.retry_after_seconds)
  ) {
    throw new CheckoutOperationError('rate_limit_unavailable');
  }
  return decision;
}

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const config = readCheckoutPaymentConfig();
  if (!config) return noStoreJson({ error: 'Checkout is unavailable.' }, 503);

  let compensationClient: ReturnType<typeof getSupabaseAdmin> | null = null;
  let compensationIntentId: string | null = null;
  let compensationSession: Stripe.Checkout.Session | null = null;
  let compensationRequired = false;

  try {
    const origin = request.headers.get('origin');
    if (origin !== config.allowedOrigin || publicRequestOrigin(request, config.allowedOrigin) !== config.allowedOrigin) {
      return noStoreJson({ error: 'Invalid checkout origin.' }, 403);
    }

    const access = validateBriefAccessToken(
      readBriefAccessCookie(request.headers.get('cookie')),
      config.securitySecret
    );
    if (!access) {
      logSecurityEvent('warn', 'checkout.access_rejected', { requestId });
      return noStoreJson({ error: 'This private checkout link is invalid or expired.' }, 403);
    }

    const suppliedIdempotencyKey = request.headers.get('idempotency-key');
    const clientKey = normalizeIdempotencyKey(suppliedIdempotencyKey);
    if (!clientKey) return noStoreJson({ error: 'A valid idempotency key is required.' }, 400);

    const supabase = getSupabaseAdmin();
    const forwardedIp = request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim() || 'unknown';
    const [ipDecision, emailDecision] = await Promise.all([
      consumeCheckoutRateLimit(
        supabase,
        pseudonymizeRateLimitSubject(`checkout-ip:${forwardedIp}`, config.securitySecret),
        'checkout_ip'
      ),
      consumeCheckoutRateLimit(
        supabase,
        pseudonymizeRateLimitSubject(`checkout-email:${access.subjectHash}`, config.securitySecret),
        'checkout_email'
      )
    ]);
    const retryAfter = Math.max(ipDecision.retry_after_seconds, emailDecision.retry_after_seconds);
    if (!ipDecision.allowed || !emailDecision.allowed) {
      logSecurityEvent('warn', 'checkout.rate_limited', { requestId });
      return noStoreJson(
        { error: 'Too many checkout attempts. Please wait and try again.' },
        429,
        { 'Retry-After': String(retryAfter) }
      );
    }

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return noStoreJson({ error: 'Content-Type must be application/json.' }, 415);
    }

    let bodyBytes: Uint8Array;
    try {
      bodyBytes = await readRequestBodyBytes(request, MAX_CHECKOUT_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return noStoreJson({ error: 'Survey payload is too large.' }, 413);
      }
      throw error;
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
    } catch {
      return noStoreJson({ error: 'Invalid JSON.' }, 400);
    }

    const parsed = briefCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson({ error: parsed.error.issues[0]?.message ?? 'Invalid survey.' }, 400);
    }
    const brief = normalizeBriefIntake(parsed.data);
    if (!secureHexEqual(
      access.subjectHash,
      pseudonymizeBriefAccessSubject(brief.deliveryEmail, config.securitySecret)
    )) {
      return noStoreJson({ error: 'Use the delivery email associated with this checkout link.' }, 403);
    }

    const intentId = createPendingIntakeId({
      brief,
      intakeVersion: CHECKOUT_VERSION,
      clientKey: `${access.nonce}.${clientKey}`,
      accessId: access.nonce,
      secret: config.securitySecret
    });
    const { data: existingIntent, error: lookupError } = await supabase
      .from('checkout_intents')
      .select('id, brief_json, delivery_email, amount_cents, currency, stripe_checkout_session_id, terms_version, status')
      .eq('id', intentId)
      .maybeSingle<CheckoutIntent>();
    if (lookupError) throw new CheckoutOperationError('intent_lookup_failed');

    if (existingIntent) {
      if (!secureHexEqual(
        checkoutBriefIntegrityDigest(existingIntent.brief_json, config.securitySecret),
        checkoutBriefIntegrityDigest(brief, config.securitySecret)
      )) {
        logSecurityEvent('warn', 'checkout.invite_reuse_rejected', { requestId, intentId });
        return noStoreJson(
          { error: 'This private checkout link is already bound to another survey.' },
          409
        );
      }
      if (
        existingIntent.delivery_email.toLowerCase() !== brief.deliveryEmail ||
        existingIntent.amount_cents !== config.offer.amountCents ||
        existingIntent.currency !== config.offer.currency ||
        existingIntent.terms_version !== TERMS_VERSION
      ) {
        throw new CheckoutOperationError('intent_integrity_mismatch');
      }
      if (existingIntent.status === 'paid') {
        return noStoreJson({ error: 'This checkout is already paid.' }, 409);
      }
      if (existingIntent.status === 'expired') {
        return noStoreJson(
          { error: 'This checkout session has expired. Request a new private link.' },
          409
        );
      }
    } else {
      const { error: insertError } = await supabase.from('checkout_intents').insert({
        id: intentId,
        brief_json: brief,
        delivery_email: brief.deliveryEmail,
        amount_cents: config.offer.amountCents,
        currency: config.offer.currency,
        terms_version: TERMS_VERSION,
        status: 'pending'
      });
      if (insertError) throw new CheckoutOperationError('intent_insert_failed');
    }

    const requestedStripeExpiry = Math.floor(Date.now() / 1000) + STRIPE_CHECKOUT_TTL_SECONDS;
    const { data: reservationData, error: reservationError } = await supabase.rpc(
      'reserve_stripe_checkout_capacity',
      {
        p_intent_id: intentId,
        p_stripe_session_expires_at: new Date(requestedStripeExpiry * 1000).toISOString(),
        p_reservation_expires_at: new Date(
          (requestedStripeExpiry + CAPACITY_EXPIRY_GRACE_SECONDS) * 1000
        ).toISOString()
      }
    );
    const reservation = (
      Array.isArray(reservationData) ? reservationData[0] : reservationData
    ) as CheckoutReservation | null;
    if (reservationError || !reservation) {
      throw new CheckoutOperationError('capacity_reservation_failed');
    }
    if (
      !['reserved', 'same'].includes(reservation.reservation_status) ||
      !reservation.stripe_session_expires_at
    ) {
      throw new CheckoutOperationError('capacity_reservation_invalid');
    }
    const stripeSessionExpiresAt = Math.floor(
      new Date(reservation.stripe_session_expires_at).getTime() / 1000
    );
    if (
      !Number.isSafeInteger(stripeSessionExpiresAt) ||
      stripeSessionExpiresAt <= Math.floor(Date.now() / 1000) ||
      stripeSessionExpiresAt > Math.floor(Date.now() / 1000) + 24 * 60 * 60
    ) {
      throw new CheckoutOperationError('capacity_expiry_invalid');
    }

    if (existingIntent?.stripe_checkout_session_id) {
      const existingSession = await getStripe().checkout.sessions.retrieve(
        existingIntent.stripe_checkout_session_id
      );
      if (
        existingSession.status === 'open' &&
        existingSession.url &&
        existingSession.expires_at === stripeSessionExpiresAt
      ) {
        const { error: bindError } = await supabase.rpc('bind_stripe_checkout_capacity', {
          p_intent_id: intentId,
          p_checkout_session_id: existingSession.id,
          p_stripe_session_expires_at: new Date(stripeSessionExpiresAt * 1000).toISOString()
        });
        if (bindError) throw new CheckoutOperationError('capacity_session_bind_failed');
        const { error: resolveError } = await supabase.rpc('resolve_stripe_checkout_setup', {
          p_intent_id: intentId,
          p_checkout_session_id: existingSession.id
        });
        if (resolveError) throw new CheckoutOperationError('capacity_reconciliation_resolve_failed');
        return noStoreJson({ url: existingSession.url });
      }
      return noStoreJson({ error: 'This checkout session is no longer available. Request a new link.' }, 409);
    }

    compensationClient = supabase;
    compensationIntentId = intentId;
    compensationRequired = true;

    const creationBoundary = Math.floor(Date.now() / 1000);
    if (stripeSessionExpiresAt < creationBoundary + STRIPE_CREATION_MINIMUM_MARGIN_SECONDS) {
      throw new CheckoutOperationError('capacity_expiry_margin_too_short');
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      customer_email: brief.deliveryEmail,
      client_reference_id: intentId,
      integration_identifier: stripeIntegrationIdentifier(intentId, config.securitySecret),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: config.offer.currency,
          unit_amount: config.offer.amountCents,
          product_data: {
            name: config.offer.name,
            description: config.offer.description,
            metadata: { offer_id: config.offer.id }
          }
        }
      }],
      metadata: { checkout_intent_id: intentId, offer_id: config.offer.id },
      payment_intent_data: {
        metadata: { checkout_intent_id: intentId, offer_id: config.offer.id }
      },
      success_url: `${config.allowedOrigin}${PUBLIC_PREFIX}/checkout/success`,
      cancel_url: `${config.allowedOrigin}${PUBLIC_PREFIX}/checkout/cancel`,
      billing_address_collection: 'required',
      consent_collection: { terms_of_service: 'required' },
      allow_promotion_codes: false,
      expires_at: stripeSessionExpiresAt
    }, {
      idempotencyKey: `snickerdoodle:${intentId}:${config.offer.id}`
    });
    compensationSession = session;
    if (!session.url || session.expires_at !== stripeSessionExpiresAt) {
      throw new CheckoutOperationError('checkout_url_or_expiry_missing');
    }

    const { error: bindError } = await supabase.rpc('bind_stripe_checkout_capacity', {
      p_intent_id: intentId,
      p_checkout_session_id: session.id,
      p_stripe_session_expires_at: new Date(stripeSessionExpiresAt * 1000).toISOString()
    });
    if (bindError) throw new CheckoutOperationError('capacity_session_bind_failed');

    compensationRequired = false;
    const { error: resolveError } = await supabase.rpc('resolve_stripe_checkout_setup', {
      p_intent_id: intentId,
      p_checkout_session_id: session.id
    });
    if (resolveError) throw new CheckoutOperationError('capacity_reconciliation_resolve_failed');

    logSecurityEvent('info', 'checkout.created', { requestId, intentId });
    return noStoreJson({ url: session.url });
  } catch (error) {
    let compensationState: 'not_required' | 'released' | 'reconciliation_required' | 'failed' =
      'not_required';
    if (compensationRequired && compensationClient && compensationIntentId) {
      try {
        compensationState = await compensateCheckoutSetup(
          compensationClient,
          compensationIntentId,
          compensationSession,
          error instanceof CheckoutOperationError ? error.code : 'stripe_session_create_failed'
        );
      } catch {
        compensationState = 'failed';
      }
    }
    logSecurityEvent('error', 'checkout.create_failed', {
      requestId,
      compensationState,
      reason: error instanceof CheckoutOperationError
        ? error.code
        : error instanceof Error
          ? error.name
          : typeof error
    });
    return noStoreJson({ error: 'Checkout is temporarily unavailable. Please try again.' }, 500);
  }
}
