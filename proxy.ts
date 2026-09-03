import { NextResponse, type NextRequest } from 'next/server';
import {
  createContentSecurityPolicy,
  privateResponseHeaders,
  securityHeadersWithCsp
} from './security-headers.mjs';

const SENSITIVE_PAGE_ROOTS = ['/brief', '/checkout', '/manager'];
const SENSITIVE_GET_ROUTES = new Set(['/api/manager/queue', '/api/manager/health']);
const SENSITIVE_API_BODY_LIMITS = new Map([
  ['/api/brief-access', 3 * 1024],
  ['/api/brief', 64 * 1024],
  ['/api/checkout', 64 * 1024],
  ['/api/manager/invites', 2 * 1024],
  ['/api/stripe/webhook', 256 * 1024]
]);

function withoutBasePath(pathname: string) {
  return pathname === '/snickerdoodle'
    ? '/'
    : pathname.startsWith('/snickerdoodle/')
      ? pathname.slice('/snickerdoodle'.length)
      : pathname;
}

function isSensitivePage(pathname: string) {
  return SENSITIVE_PAGE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function applyHeaders(response: NextResponse, headers: Array<{ key: string; value: string }>) {
  for (const { key, value } of headers) response.headers.set(key, value);
  return response;
}

function privateJson(
  body: Record<string, string>,
  status: number,
  nonce: string,
  headers?: Record<string, string>
) {
  const response = NextResponse.json(body, { status, headers });
  return applyHeaders(response, [...securityHeadersWithCsp(nonce), ...privateResponseHeaders]);
}

function declaredBodyLength(request: NextRequest) {
  const value = request.headers.get('content-length');
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestHeaders = new Headers(request.headers);
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const next = (headers: Array<{ key: string; value: string }> = []) => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    return applyHeaders(response, [...securityHeadersWithCsp(nonce), ...headers]);
  };

  const rawPathname = new URL(request.url).pathname;
  const pathname = withoutBasePath(rawPathname);
  const apiBodyLimit = SENSITIVE_API_BODY_LIMITS.get(pathname);

  if (SENSITIVE_GET_ROUTES.has(pathname)) {
    if (request.method !== 'GET') {
      return privateJson({ error: 'Method not allowed.' }, 405, nonce, { Allow: 'GET' });
    }
    return next(privateResponseHeaders);
  }

  if (apiBodyLimit !== undefined) {
    if (request.method !== 'POST') {
      return privateJson({ error: 'Method not allowed.' }, 405, nonce, { Allow: 'POST' });
    }

    const bodyLength = declaredBodyLength(request);
    if (Number.isNaN(bodyLength)) {
      return privateJson({ error: 'Invalid Content-Length.' }, 400, nonce);
    }
    if (bodyLength !== null && bodyLength > apiBodyLimit) {
      return privateJson({ error: 'Payload too large.' }, 413, nonce);
    }

    return next(privateResponseHeaders);
  }

  if (isSensitivePage(pathname)) {
    return next(privateResponseHeaders);
  }
  if (rawPathname !== '/') return next();

  const response = NextResponse.redirect(new URL('/snickerdoodle', request.url), 307);
  return applyHeaders(response, securityHeadersWithCsp(nonce));
}
