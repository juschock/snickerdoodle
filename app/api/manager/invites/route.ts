import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  BRIEF_ACCESS_MAX_TOKEN_AGE_MS,
  createBriefAccessToken
} from '@/lib/checkout-security';
import { resolveAllowedOrigin } from '@/lib/commercial-readiness.mjs';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import { verifySupabaseActiveOwnerAal2 } from '@/lib/supabase-manager';

export const runtime = 'nodejs';

const MAX_INVITE_BODY_BYTES = 2 * 1024;
const inviteRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320)
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
      logSecurityEvent('warn', 'manager_invite.aal2_rejected', { requestId });
      return noStoreJson({ error: 'A current AAL2 owner session is required.' }, 403);
    }

    const allowedOrigin = resolveAllowedOrigin(process.env);
    const securitySecret = process.env.CHECKOUT_SECURITY_SECRET;
    if (!allowedOrigin || !securitySecret || securitySecret.length < 32) {
      logSecurityEvent('error', 'manager_invite.unavailable', { requestId, reason: 'configuration' });
      return noStoreJson({ error: 'Private invite generation is unavailable.' }, 503);
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
      bodyBytes = await readRequestBodyBytes(request, MAX_INVITE_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return noStoreJson({ error: 'Invite request is too large.' }, 413);
      }
      throw error;
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
    } catch {
      return noStoreJson({ error: 'Invalid JSON.' }, 400);
    }

    const parsed = inviteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return noStoreJson({ error: 'Enter a valid delivery email.' }, 400);
    }

    const issuedAt = Date.now();
    const token = createBriefAccessToken({
      email: parsed.data.email,
      issuedAt,
      expiresAt: issuedAt + BRIEF_ACCESS_MAX_TOKEN_AGE_MS,
      nonce: randomUUID(),
      secret: securitySecret
    });
    const inviteUrl = new URL(`${allowedOrigin}/snickerdoodle/brief`);
    inviteUrl.hash = new URLSearchParams({ access: token }).toString();

    return noStoreJson({ link: inviteUrl.toString() }, 200);
  } catch {
    logSecurityEvent('error', 'manager_invite.unavailable', { requestId });
    return noStoreJson({ error: 'Private invite generation is unavailable.' }, 503);
  }
}
