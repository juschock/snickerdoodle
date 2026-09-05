import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAllowedOrigin } from '@/lib/commercial-readiness.mjs';
import {
  readRequestBodyBytes,
  RequestBodyTooLargeError
} from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import {
  getSupabaseManagerClient,
  verifySupabaseActiveOwnerAal2
} from '@/lib/supabase-manager';

export const runtime = 'nodejs';

const MAX_RECONCILIATION_BODY_BYTES = 2 * 1024;

const reconciliationRequestSchema = z.object({
  alert_id: z.string().uuid(),
  expected_occurrence_count: z.number().int().positive(),
  idempotency_key: z.string().uuid()
}).strict();

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
  if (
    token.length < 32 ||
    token.length > 4096 ||
    /[\s\u0000-\u001f\u007f]/.test(token)
  ) return null;
  return token;
}

function publicRequestOrigin(request: Request, allowedOrigin: string) {
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',', 1)[0]
    ?.trim();
  if (!forwardedHost) return new URL(request.url).origin;

  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',', 1)[0]
    ?.trim()
    .toLowerCase();
  const fallbackProto = new URL(allowedOrigin).protocol.slice(0, -1);
  const proto =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : fallbackProto;

  try {
    return new URL(`${proto}://${forwardedHost}`).origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return noStoreJson({ error: 'Owner authorization is required.' }, 401);
  }

  try {
    if (!await verifySupabaseActiveOwnerAal2(accessToken)) {
      logSecurityEvent('warn', 'manager_reconciliation.aal2_rejected', {
        requestId
      });
      return noStoreJson(
        { error: 'A current AAL2 owner session is required.' },
        403
      );
    }

    const allowedOrigin = resolveAllowedOrigin(process.env);
    if (!allowedOrigin) {
      logSecurityEvent('error', 'manager_reconciliation.unavailable', {
        requestId,
        reason: 'configuration'
      });
      return noStoreJson(
        { error: 'Reconciliation resolution is unavailable.' },
        503
      );
    }

    if (
      request.headers.get('origin') !== allowedOrigin ||
      publicRequestOrigin(request, allowedOrigin) !== allowedOrigin
    ) {
      return noStoreJson({ error: 'Invalid manager origin.' }, 403);
    }

    const contentType = request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      return noStoreJson(
        { error: 'Content-Type must be application/json.' },
        415
      );
    }

    let bodyBytes: Uint8Array;
    try {
      bodyBytes = await readRequestBodyBytes(
        request,
        MAX_RECONCILIATION_BODY_BYTES
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return noStoreJson(
          { error: 'Reconciliation request is too large.' },
          413
        );
      }
      throw error;
    }

    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes)
      );
    } catch {
      return noStoreJson({ error: 'Invalid JSON.' }, 400);
    }

    const parsed = reconciliationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson(
        { error: 'Invalid reconciliation resolution.' },
        400
      );
    }

    const managerClient = getSupabaseManagerClient(accessToken);
    const { data, error } = await managerClient.rpc(
      'resolve_owner_expired_checkout_alert',
      {
        p_alert_id: parsed.data.alert_id,
        p_expected_occurrence_count:
          parsed.data.expected_occurrence_count,
        p_idempotency_key: parsed.data.idempotency_key
      }
    );

    if (error || data !== 'resolved') {
      logSecurityEvent('warn', 'manager_reconciliation.resolution_rejected', {
        requestId
      });
      return noStoreJson(
        { error: 'Reconciliation resolution was not applied.' },
        409
      );
    }

    return noStoreJson({ status: 'resolved' }, 200);
  } catch {
    logSecurityEvent('error', 'manager_reconciliation.unavailable', {
      requestId
    });
    return noStoreJson(
      { error: 'Reconciliation resolution is unavailable.' },
      503
    );
  }
}
