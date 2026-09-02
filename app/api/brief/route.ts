import { NextResponse } from 'next/server';
import { briefCheckoutSchema } from '@/lib/checkout';
import {
  BRIEF_INTAKE_VERSION,
  createPendingIntakeId,
  BRIEF_ACCESS_COOKIE_NAME,
  normalizeBriefIntake,
  normalizeIdempotencyKey,
  pseudonymizeBriefAccessSubject,
  pseudonymizeRateLimitSubject,
  readBriefAccessCookie,
  secureHexEqual,
  validateBriefAccessToken
} from '@/lib/checkout-security';
import { readRequestCommercialReadiness } from '@/lib/commercial-runtime';
import { resolveAllowedOrigin } from '@/lib/commercial-readiness.mjs';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const MAX_BRIEF_BODY_BYTES = 64 * 1024;

type PendingIntake = {
  id: string;
  delivery_email: string;
  status: string;
};

type RateLimitDecision = { allowed: boolean; retry_after_seconds: number };

class BriefOperationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BriefOperationError';
  }
}

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Too many survey attempts. Please wait and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' } }
  );
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

async function consumeDurableRateLimit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectHash: string
) {
  const { data, error } = await supabase.rpc('consume_intake_rate_limit', {
    p_subject_hash: subjectHash,
    p_scope: 'intake_email'
  });
  const decision = (Array.isArray(data) ? data[0] : data) as RateLimitDecision | null;

  if (
    error ||
    !decision ||
    typeof decision.allowed !== 'boolean' ||
    !Number.isInteger(decision.retry_after_seconds)
  ) {
    throw new BriefOperationError('rate_limit_unavailable');
  }
  return decision;
}

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request.headers);

  if (!readRequestCommercialReadiness()) {
    return NextResponse.json(
      { error: 'Private intake is not available.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
    );
  }

  const allowedOrigin = resolveAllowedOrigin(process.env);
  if (!allowedOrigin) {
    logSecurityEvent('error', 'brief.receive_failed', {
      requestId,
      reason: 'allowed_origin_configuration_missing'
    });
    return NextResponse.json(
      { error: 'The private survey is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
    );
  }

  try {
    const securitySecret = process.env.CHECKOUT_SECURITY_SECRET;
    if (!securitySecret || securitySecret.length < 32) {
      throw new BriefOperationError('security_configuration_missing');
    }

    const access = validateBriefAccessToken(
      readBriefAccessCookie(request.headers.get('cookie')),
      securitySecret
    );
    if (!access) {
      logSecurityEvent('warn', 'brief.access_rejected', { requestId });
      return NextResponse.json(
        { error: 'This private survey link is invalid or expired. Request a new fit-check link.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Consume the invite's email-bound allowance before parsing attacker-controlled
    // input or looking up an existing intent. This bounds valid bearer-link replays,
    // including malformed submissions and retries after an intent already exists.
    const supabase = getSupabaseAdmin();
    const emailSubject = pseudonymizeRateLimitSubject(
      `access-email:${access.subjectHash}`,
      securitySecret
    );
    const decision = await consumeDurableRateLimit(supabase, emailSubject);
    if (!decision.allowed) {
      logSecurityEvent('warn', 'brief.rate_limited', { requestId, dimension: 'invite_email' });
      return rateLimitResponse(decision.retry_after_seconds);
    }

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return NextResponse.json(
        { error: 'Content-Type must be application/json.' },
        { status: 415, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const origin = request.headers.get('origin');
    if (origin !== allowedOrigin || publicRequestOrigin(request, allowedOrigin) !== allowedOrigin) {
      return NextResponse.json(
        { error: 'Invalid survey origin.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const suppliedIdempotencyKey = request.headers.get('idempotency-key');
    const clientKey = normalizeIdempotencyKey(suppliedIdempotencyKey);
    if (suppliedIdempotencyKey !== null && clientKey === null) {
      return NextResponse.json(
        { error: 'Invalid survey idempotency key.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    let bodyBytes: Uint8Array;
    try {
      bodyBytes = await readRequestBodyBytes(request, MAX_BRIEF_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        logSecurityEvent('warn', 'brief.body_rejected', { requestId, reason: 'too_large' });
        return NextResponse.json(
          { error: 'Survey payload is too large.' },
          { status: 413, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const parsed = briefCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid survey.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const brief = normalizeBriefIntake(parsed.data);
    const accessSubject = pseudonymizeBriefAccessSubject(brief.deliveryEmail, securitySecret);
    if (!secureHexEqual(access.subjectHash, accessSubject)) {
      logSecurityEvent('warn', 'brief.access_rejected', { requestId, reason: 'email_binding' });
      return NextResponse.json(
        { error: 'Use the delivery email associated with this private survey link.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const intentId = createPendingIntakeId({
      brief,
      intakeVersion: BRIEF_INTAKE_VERSION,
      clientKey,
      accessId: access.nonce,
      secret: securitySecret
    });
    const { data: existingIntent, error: lookupError } = await supabase
      .from('pending_intakes')
      .select('id, delivery_email, status')
      .eq('id', intentId)
      .maybeSingle<PendingIntake>();

    if (lookupError) throw new BriefOperationError('intent_lookup_failed');

    let intent = existingIntent;
    if (!intent) {
      const { error: intentError } = await supabase
        .from('pending_intakes')
        .upsert({
          id: intentId,
          brief_json: brief,
          delivery_email: brief.deliveryEmail,
          status: 'pending'
        }, { onConflict: 'id', ignoreDuplicates: true });

      if (intentError) throw new BriefOperationError('intent_insert_failed');

      const { data: savedIntent, error: savedIntentError } = await supabase
        .from('pending_intakes')
        .select('id, delivery_email, status')
        .eq('id', intentId)
        .single<PendingIntake>();

      if (savedIntentError || !savedIntent) throw new BriefOperationError('intent_reload_failed');
      intent = savedIntent;
    }

    if (
      intent.delivery_email.toLowerCase() !== brief.deliveryEmail
    ) {
      throw new BriefOperationError('intent_integrity_mismatch');
    }

    logSecurityEvent('info', 'brief.received', { requestId, intentId: intent.id });
    const response = NextResponse.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set({ name: BRIEF_ACCESS_COOKIE_NAME, value: '', path: '/snickerdoodle', maxAge: 0 });
    return response;
  } catch (error) {
    logSecurityEvent('error', 'brief.receive_failed', {
      requestId,
      reason: error instanceof BriefOperationError
        ? error.code
        : error instanceof Error
          ? error.name
          : typeof error
    });
    return NextResponse.json(
      { error: 'The survey could not be submitted. Please try again.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
