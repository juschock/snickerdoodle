import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  BRIEF_FALLBACK_DEDUP_WINDOW_MS,
  createBriefAccessToken,
  BRIEF_INTAKE_VERSION,
  createPendingIntakeId,
  normalizeIdempotencyKey,
  pseudonymizeBriefAccessSubject,
  pseudonymizeRateLimitSubject,
  secureHexEqual,
  validateBriefAccessToken
} from '@/lib/checkout-security';
import { briefCheckoutSchema } from '@/lib/checkout';
import { emptyBrief } from '@/lib/intake';
import { readRequestBodyBytes, RequestBodyTooLargeError } from '@/lib/request-body';
import { redactLogMetadata } from '@/lib/security-log';
import { COMMERCIAL_GATE_NAMES } from '@/lib/commercial-readiness.mjs';

const brief = briefCheckoutSchema.parse({
  ...emptyBrief,
  primaryAction: 'Register',
  organizationName: 'Community Group',
  campaignName: 'Fall event',
  dateTime: 'October 15 at 6 PM',
  locationOrLink: '123 Main Street',
  audience: 'Local families',
  mainGoal: 'Reach 100 registrations',
  offerAsk: 'Register online',
  keyDetails: 'Doors open at 5:30 PM',
  deliveryEmail: 'customer@example.com'
});

describe('intake idempotency', () => {
  it('accepts high-entropy client keys and rejects malformed keys', () => {
    const validClientKey = ['test', 'client', 'retry', 'value'].join('_');
    expect(normalizeIdempotencyKey(validClientKey)).toBe(validClientKey);
    expect(normalizeIdempotencyKey('short')).toBeNull();
    expect(normalizeIdempotencyKey('contains customer@example.com')).toBeNull();
  });

  it('maps the same request retry to one opaque UUID', () => {
    const validClientKey = ['test', 'client', 'retry', 'value'].join('_');
    const options = {
      brief,
      intakeVersion: BRIEF_INTAKE_VERSION,
      clientKey: validClientKey,
      secret: 'test-only-secret'
    };
    const first = createPendingIntakeId(options);

    expect(createPendingIntakeId(options)).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toContain(brief.deliveryEmail);

    const reorderedBrief = Object.fromEntries(Object.entries(brief).reverse()) as typeof brief;
    expect(createPendingIntakeId({ ...options, brief: reorderedBrief })).toBe(first);
  });

  it('separates distinct attempts and bounds fallback duplicate suppression', () => {
    const base = { brief, intakeVersion: BRIEF_INTAKE_VERSION, secret: 'test-only-secret' };
    const first = createPendingIntakeId({ ...base, clientKey: 'attempt_0000000000000001', now: 0 });
    const second = createPendingIntakeId({ ...base, clientKey: 'attempt_0000000000000002', now: 0 });
    const changedRequest = createPendingIntakeId({
      ...base,
      brief: { ...brief, campaignName: 'Different event' },
      clientKey: 'attempt_0000000000000001',
      now: 0
    });
    const fallback = createPendingIntakeId({ ...base, clientKey: null, now: 0 });
    const laterFallback = createPendingIntakeId({
      ...base,
      clientKey: null,
      now: BRIEF_FALLBACK_DEDUP_WINDOW_MS
    });

    expect(second).not.toBe(first);
    expect(changedRequest).not.toBe(first);
    expect(laterFallback).not.toBe(fallback);
  });
});

describe('intake abuse controls', () => {
  it('generates an interoperable seven-day private invite without exposing the email', () => {
    const secret = 'test-only-secret-that-is-at-least-32-characters';
    const output = execFileSync(
      process.execPath,
      ['scripts/create-brief-access-link.mjs', brief.deliveryEmail],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CHECKOUT_SECURITY_SECRET: secret,
          SNICKERDOODLE_ALLOWED_ORIGIN: 'https://racoben.com',
          ...Object.fromEntries(COMMERCIAL_GATE_NAMES.map((name) => [name, 'true']))
        }
      }
    ).toString().trim();
    const url = new URL(output);
    const token = new URLSearchParams(url.hash.slice(1)).get('access');

    expect(url.origin + url.pathname).toBe('https://racoben.com/snickerdoodle/brief');
    expect(url.search).toBe('');
    expect(output).not.toContain(brief.deliveryEmail);
    expect(validateBriefAccessToken(token, secret)).not.toBeNull();
  });

  it('requires a signed, expiring invite bound to one delivery email', () => {
    const secret = 'test-only-secret-that-is-at-least-32-characters';
    const now = 1_800_000_000_000;
    const token = createBriefAccessToken({
      email: brief.deliveryEmail,
      issuedAt: now,
      expiresAt: now + 60_000,
      nonce: '33333333-3333-4333-8333-333333333333',
      secret
    });
    const access = validateBriefAccessToken(token, secret, now);

    expect(access?.nonce).toBe('33333333-3333-4333-8333-333333333333');
    expect(secureHexEqual(
      access?.subjectHash ?? '',
      pseudonymizeBriefAccessSubject(brief.deliveryEmail, secret)
    )).toBe(true);
    expect(secureHexEqual(
      access?.subjectHash ?? '',
      pseudonymizeBriefAccessSubject('other@example.com', secret)
    )).toBe(false);
    expect(validateBriefAccessToken(`${token}tampered`, secret, now)).toBeNull();
    expect(validateBriefAccessToken(token, secret, now + 60_001)).toBeNull();
  });

  it('rejects a correctly signed token whose issuance window exceeds seven days', () => {
    const secret = 'test-only-secret-that-is-at-least-32-characters';
    const now = 1_800_000_000_000;
    const token = createBriefAccessToken({
      email: brief.deliveryEmail,
      issuedAt: now,
      expiresAt: now + 8 * 24 * 60 * 60 * 1000,
      nonce: '33333333-3333-4333-8333-333333333333',
      secret
    });

    expect(validateBriefAccessToken(token, secret, now)).toBeNull();
  });

  it('maps one qualified invite to one intent even when request data is rotated', () => {
    const base = {
      intakeVersion: BRIEF_INTAKE_VERSION,
      accessId: '33333333-3333-4333-8333-333333333333',
      secret: 'test-only-secret'
    };
    const first = createPendingIntakeId({ ...base, brief, clientKey: 'attempt_0000000000000001' });
    const rotated = createPendingIntakeId({
      ...base,
      brief: { ...brief, campaignName: 'Rotated campaign' },
      clientKey: 'attempt_0000000000000002'
    });
    expect(rotated).toBe(first);
  });

  it('pseudonymizes delivery-email rate-limit subjects', () => {
    const digest = pseudonymizeRateLimitSubject('email:customer@example.com', 'test-only-secret');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('customer');
  });

  it('preserves exact UTF-8 request bytes', async () => {
    const value = '{"message":"Crème brûlée"}';
    const request = new Request('https://example.com/intake', { method: 'POST', body: value });
    const body = await readRequestBodyBytes(request, 1_024);

    expect(new TextDecoder().decode(body)).toBe(value);
  });

  it('rejects declared and streamed oversized bodies', async () => {
    const declared = new Request('https://example.com/intake', {
      method: 'POST',
      headers: { 'content-length': '1025' },
      body: 'small'
    });
    await expect(readRequestBodyBytes(declared, 1_024)).rejects.toBeInstanceOf(RequestBodyTooLargeError);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700));
        controller.enqueue(new Uint8Array(700));
        controller.close();
      }
    });
    const streamed = new Request('https://example.com/intake', {
      method: 'POST',
      body: stream,
      duplex: 'half'
    } as RequestInit & { duplex: 'half' });
    await expect(readRequestBodyBytes(streamed, 1_024)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('redacts sensitive fields and bounds attacker-controlled strings', () => {
    const redacted = redactLogMetadata({
      requestId: 'safe-id',
      deliveryEmail: 'customer@example.com',
      nested: { authorization: 'Bearer secret-value' },
      reason: 'x'.repeat(300)
    });

    expect(redacted.deliveryEmail).toBe('[REDACTED]');
    expect(redacted.nested).toEqual({ authorization: '[REDACTED]' });
    expect(String(redacted.reason)).toHaveLength(256);
  });
});
