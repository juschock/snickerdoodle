import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { createContentSecurityPolicy } from '../security-headers.mjs';

describe('edge request boundary', () => {
  it.each([
    '/snickerdoodle/brief',
    '/snickerdoodle/brief/received',
    '/snickerdoodle/checkout/success',
    '/snickerdoodle/manager/queue',
    '/snickerdoodle/api/manager/queue',
    '/snickerdoodle/api/brief',
    '/snickerdoodle/api/checkout',
    '/snickerdoodle/api/stripe/webhook'
  ])('marks %s private and non-cacheable', (pathname) => {
    const response = proxy(new NextRequest(`https://racoben.com${pathname}`, {
      method: pathname === '/snickerdoodle/api/manager/queue'
        ? 'GET'
        : pathname.includes('/api/') ? 'POST' : 'GET'
    }));

    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
  });

  it('rejects non-POST methods before sensitive APIs run', async () => {
    const response = proxy(new NextRequest('https://racoben.com/snickerdoodle/api/checkout'));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    await expect(response.json()).resolves.toEqual({ error: 'Method not allowed.' });
  });

  it('rejects non-GET methods before the owner queue API runs', async () => {
    const response = proxy(new NextRequest('https://racoben.com/snickerdoodle/api/manager/queue', {
      method: 'POST'
    }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({ error: 'Method not allowed.' });
  });

  it('rejects declared oversized and malformed bodies before sensitive APIs run', async () => {
    const oversized = proxy(new NextRequest('https://racoben.com/snickerdoodle/api/brief-access', {
      method: 'POST',
      headers: { 'content-length': String(3 * 1024 + 1) }
    }));
    const malformed = proxy(new NextRequest('https://racoben.com/snickerdoodle/api/brief', {
      method: 'POST',
      headers: { 'content-length': 'unknown' }
    }));

    expect(oversized.status).toBe(413);
    expect(malformed.status).toBe(400);
    await expect(oversized.json()).resolves.toEqual({ error: 'Payload too large.' });
    await expect(malformed.json()).resolves.toEqual({ error: 'Invalid Content-Length.' });
  });

  it('does not apply private caching policy to public content', () => {
    const response = proxy(new NextRequest('https://racoben.com/snickerdoodle/samples'));

    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('replaces inbound nonce material with a fresh strict CSP', () => {
    const first = proxy(new NextRequest('https://racoben.com/snickerdoodle', {
      headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src 'unsafe-inline'" }
    }));
    const second = proxy(new NextRequest('https://racoben.com/snickerdoodle'));
    const firstPolicy = first.headers.get('content-security-policy');
    const secondPolicy = second.headers.get('content-security-policy');

    expect(firstPolicy).toContain("script-src 'self' 'nonce-");
    expect(firstPolicy).toContain("'strict-dynamic'");
    expect(firstPolicy?.split(';').find((directive) => directive.trim().startsWith('script-src ')))
      .not.toContain("'unsafe-inline'");
    expect(firstPolicy).not.toContain('attacker');
    expect(secondPolicy).not.toBe(firstPolicy);
  });

  it('allowlists only the exact configured Supabase origin for owner authentication', () => {
    const policy = createContentSecurityPolicy(
      Buffer.from('fixed-test-nonce').toString('base64'),
      'https://project-ref.supabase.co/auth/v1'
    );
    const invalidPolicy = createContentSecurityPolicy(
      Buffer.from('fixed-test-nonce').toString('base64'),
      'https://user:secret@project-ref.supabase.co/auth/v1?leak=true'
    );

    expect(policy).toContain("connect-src 'self' https://project-ref.supabase.co");
    expect(policy).not.toContain('/auth/v1');
    expect(invalidPolicy).toContain("connect-src 'self';");
    expect(invalidPolicy).not.toContain('project-ref.supabase.co');
  });
});
