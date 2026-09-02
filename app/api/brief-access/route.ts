import { NextResponse } from 'next/server';
import {
  BRIEF_ACCESS_COOKIE_NAME,
  BRIEF_ACCESS_COOKIE_PATH,
  validateBriefAccessToken
} from '@/lib/checkout-security';
import { readRequestCommercialReadiness } from '@/lib/commercial-runtime';
import { resolveAllowedOrigin } from '@/lib/commercial-readiness.mjs';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';

export const runtime = 'nodejs';

const MAX_ACCESS_EXCHANGE_BODY_BYTES = 3 * 1024;

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

function rejected(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
  );
}

export async function POST(request: Request) {
  if (!readRequestCommercialReadiness()) {
    return rejected('Private intake is not available.', 503);
  }

  const requestId = requestCorrelationId(request.headers);
  const allowedOrigin = resolveAllowedOrigin(process.env);
  if (!allowedOrigin) {
    logSecurityEvent('error', 'brief.access_exchange_failed', { requestId, reason: 'allowed_origin_configuration' });
    return rejected('The private survey is temporarily unavailable.', 503);
  }

  const securitySecret = process.env.CHECKOUT_SECURITY_SECRET;
  if (!securitySecret || securitySecret.length < 32) {
    logSecurityEvent('error', 'brief.access_exchange_failed', { requestId, reason: 'configuration' });
    return rejected('The private survey is temporarily unavailable.', 503);
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return rejected('Content-Type must be application/json.', 415);

  if (
    request.headers.get('origin') !== allowedOrigin ||
    publicRequestOrigin(request, allowedOrigin) !== allowedOrigin
  ) {
    return rejected('Invalid survey origin.', 403);
  }

  let bodyBytes: Uint8Array;
  try {
    bodyBytes = await readRequestBodyBytes(request, MAX_ACCESS_EXCHANGE_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return rejected('Private invite payload is too large.', 413);
    throw error;
  }

  let token: string | null = null;
  try {
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes)) as unknown;
    if (body && typeof body === 'object' && typeof (body as { token?: unknown }).token === 'string') {
      token = (body as { token: string }).token;
    }
  } catch {
    return rejected('Invalid private invite payload.', 400);
  }

  const access = validateBriefAccessToken(token, securitySecret);
  if (!access || !token) {
    logSecurityEvent('warn', 'brief.access_exchange_rejected', { requestId });
    return rejected('This private survey link is invalid or expired.', 403);
  }

  const response = NextResponse.json(
    { accepted: true },
    { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }
  );
  const publicOrigin = publicRequestOrigin(request, allowedOrigin);
  response.cookies.set({
    name: BRIEF_ACCESS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: publicOrigin?.startsWith('https://') ?? new URL(request.url).protocol === 'https:',
    path: BRIEF_ACCESS_COOKIE_PATH,
    expires: new Date(access.expiresAt),
    priority: 'high'
  });
  return response;
}
