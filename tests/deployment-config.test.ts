import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deployment routing configuration', () => {
  it('leaves the bare-root redirect to the Next proxy so security headers cannot be bypassed', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      redirects?: unknown;
    };

    expect(config.redirects).toBeUndefined();
  });

  it('marks every checkout page no-store and strips referrer leakage', () => {
    const configSource = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');
    const headerSource = readFileSync(join(process.cwd(), 'security-headers.mjs'), 'utf8');

    expect(configSource).toContain("source: '/checkout/:path*'");
    expect(configSource).toContain("source: '/brief/:path*'");
    expect(configSource).toContain("source: '/api/checkout'");
    expect(configSource).toContain("source: '/api/manager/:path*'");
    expect(configSource).toContain("source: '/api/stripe/webhook'");
    expect(headerSource).toContain("{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }");
    expect(headerSource).toContain("{ key: 'CDN-Cache-Control', value: 'no-store' }");
    expect(headerSource).toContain("{ key: 'Vercel-CDN-Cache-Control', value: 'no-store' }");
    expect(headerSource).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }");
  });

  it('forbids inline event handlers even while Next bootstrap scripts require inline script elements', () => {
    const headerSource = readFileSync(join(process.cwd(), 'security-headers.mjs'), 'utf8');

    expect(headerSource).toContain("script-src-attr 'none'");
    expect(headerSource).toContain("'nonce-${nonce}' 'strict-dynamic'");
    expect(headerSource).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headerSource).toContain("frame-src 'none'");
    expect(headerSource).toContain("object-src 'none'");
  });
});
