const isProduction = process.env.NODE_ENV === 'production';

function exactSupabaseConnectOrigin(configuredUrl) {
  if (!configuredUrl) return null;

  try {
    const parsed = new URL(configuredUrl);
    const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    if ((parsed.protocol !== 'https:' && !isLoopback)
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function createContentSecurityPolicy(
  nonce,
  configuredSupabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  if (!nonce || !/^[A-Za-z0-9+/=]+$/.test(nonce)) {
    throw new Error('A base64 CSP nonce is required.');
  }

  const supabaseOrigin = exactSupabaseConnectOrigin(configuredSupabaseUrl);
  const connectSources = ["'self'", supabaseOrigin].filter(Boolean).join(' ');

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? '' : " 'unsafe-eval'"}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests'
  ].join('; ');
}

export const securityHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
];

export function securityHeadersWithCsp(nonce) {
  return [
    { key: 'Content-Security-Policy', value: createContentSecurityPolicy(nonce) },
    ...securityHeaders
  ];
}

export const privateResponseHeaders = [
  { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
  { key: 'CDN-Cache-Control', value: 'no-store' },
  { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }
];
