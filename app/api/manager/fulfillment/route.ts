import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAllowedOrigin } from '@/lib/commercial-readiness.mjs';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import {
  getSupabaseManagerClient,
  verifySupabaseActiveOwnerAal2
} from '@/lib/supabase-manager';

export const runtime = 'nodejs';

const MAX_FULFILLMENT_BODY_BYTES = 2 * 1024;
const transitionRequestSchema = z.discriminatedUnion('event_type', [
  z.object({
    order_id: z.string().uuid(),
    event_type: z.literal('fulfillment.started'),
    expected_status: z.literal('new_intake'),
    idempotency_key: z.string().uuid()
  }).strict(),
  z.object({
    order_id: z.string().uuid(),
    event_type: z.literal('fulfillment.completed'),
    expected_status: z.literal('drafting'),
    idempotency_key: z.string().uuid()
  }).strict(),
  z.object({
    order_id: z.string().uuid(),
    event_type: z.literal('order.closed'),
    expected_status: z.literal('delivered'),
    idempotency_key: z.string().uuid()
  }).strict()
]);

const expectedNextStatus = {
  'fulfillment.started': 'drafting',
  'fulfillment.completed': 'delivered',
  'order.closed': 'closed'
} as const;

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}

function readBearerToken(header: string | null) {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  if (token.length < 32 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
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

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return noStoreJson({ error: 'Owner authorization is required.' }, 401);

  try {
    if (!await verifySupabaseActiveOwnerAal2(accessToken)) {
      logSecurityEvent('warn', 'manager_fulfillment.aal2_rejected', { requestId });
      return noStoreJson({ error: 'A current AAL2 owner session is required.' }, 403);
    }

    const allowedOrigin = resolveAllowedOrigin(process.env);
    if (!allowedOrigin) {
      logSecurityEvent('error', 'manager_fulfillment.unavailable', { requestId, reason: 'configuration' });
      return noStoreJson({ error: 'Fulfillment transition is unavailable.' }, 503);
    }
    if (
      request.headers.get('origin') !== allowedOrigin ||
      publicRequestOrigin(request, allowedOrigin) !== allowedOrigin
    ) {
      return noStoreJson({ error: 'Invalid manager origin.' }, 403);
    }

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return noStoreJson({ error: 'Content-Type must be application/json.' }, 415);
    }

    let bodyBytes: Uint8Array;
    try {
      bodyBytes = await readRequestBodyBytes(request, MAX_FULFILLMENT_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return noStoreJson({ error: 'Fulfillment request is too large.' }, 413);
      }
      throw error;
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
    } catch {
      return noStoreJson({ error: 'Invalid JSON.' }, 400);
    }

    const parsed = transitionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson({ error: 'Invalid fulfillment transition.' }, 400);
    }

    const managerClient = getSupabaseManagerClient(accessToken);
    const { data, error } = await managerClient.rpc('transition_order_fulfillment', {
      p_order_id: parsed.data.order_id,
      p_event_type: parsed.data.event_type,
      p_expected_status: parsed.data.expected_status,
      p_idempotency_key: parsed.data.idempotency_key
    });
    if (data === 'authorization_denied') {
      logSecurityEvent('warn', 'manager_fulfillment.authorization_rejected', { requestId });
      return noStoreJson({ error: 'Owner fulfillment authorization was rejected.' }, 403);
    }

    const nextStatus = expectedNextStatus[parsed.data.event_type];
    if (error || data !== nextStatus) {
      logSecurityEvent('warn', 'manager_fulfillment.transition_rejected', { requestId });
      return noStoreJson({ error: 'Fulfillment transition was not applied.' }, 409);
    }

    return noStoreJson({ status: nextStatus }, 200);
  } catch {
    logSecurityEvent('error', 'manager_fulfillment.unavailable', { requestId });
    return noStoreJson({ error: 'Fulfillment transition is unavailable.' }, 503);
  }
}
