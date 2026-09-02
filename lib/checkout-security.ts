import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckoutBrief } from '@/lib/checkout';

export const BRIEF_FALLBACK_DEDUP_WINDOW_MS = 30 * 60 * 1000;
export const BRIEF_INTAKE_VERSION = 'snickerdoodle-private-fit-check-v1';
export const BRIEF_ACCESS_MAX_TOKEN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const BRIEF_ACCESS_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const BRIEF_ACCESS_COOKIE_NAME = 'snickerdoodle_brief_access';
export const BRIEF_ACCESS_COOKIE_PATH = '/snickerdoodle';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const ACCESS_NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

type BriefAccessPayload = {
  v: 2;
  subjectHash: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(',')}}`;
}

export function checkoutBriefIntegrityDigest(value: unknown, secret: string) {
  return createHmac('sha256', secret)
    .update(`snickerdoodle:checkout-brief-integrity:v1:${canonicalize(value)}`)
    .digest('hex');
}

function uuidFromDigest(digest: string) {
  const bytes = digest.slice(0, 32).split('');
  bytes[12] = '8'; // RFC 9562 UUIDv8: application-defined deterministic UUID.
  bytes[16] = '8';
  const hex = bytes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeIdempotencyKey(value: string | null) {
  if (value === null) return null;
  const normalized = value.trim();
  return IDEMPOTENCY_KEY_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeBriefIntake(brief: CheckoutBrief): CheckoutBrief {
  return { ...brief, deliveryEmail: brief.deliveryEmail.trim().toLowerCase() };
}

export function createPendingIntakeId({
  brief,
  intakeVersion,
  clientKey,
  accessId,
  secret,
  now = Date.now()
}: {
  brief: CheckoutBrief;
  intakeVersion: string;
  clientKey: string | null;
  accessId?: string;
  secret: string;
  now?: number;
}) {
  const retryScope = accessId
    ? `qualified:${accessId}`
    : clientKey ?? `fallback:${Math.floor(now / BRIEF_FALLBACK_DEDUP_WINDOW_MS)}`;
  const message = accessId
    ? canonicalize({ intakeVersion, retryScope, version: 2 })
    : canonicalize({ brief, intakeVersion, retryScope, version: 1 });
  const digest = createHmac('sha256', secret).update(message).digest('hex');
  return uuidFromDigest(digest);
}

export function pseudonymizeRateLimitSubject(subject: string, secret: string) {
  return createHmac('sha256', secret).update(`snickerdoodle:rate-limit:v1:${subject}`).digest('hex');
}

export function pseudonymizeBriefAccessSubject(email: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`snickerdoodle:brief-access-subject:v1:${email.trim().toLowerCase()}`)
    .digest('hex');
}

function signBriefAccessPayload(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`snickerdoodle:brief-access-token:v2:${encodedPayload}`)
    .digest('base64url');
}

export function createBriefAccessToken({
  email,
  issuedAt = Date.now(),
  expiresAt,
  nonce,
  secret
}: {
  email: string;
  issuedAt?: number;
  expiresAt: number;
  nonce: string;
  secret: string;
}) {
  const payload: BriefAccessPayload = {
    v: 2,
    subjectHash: pseudonymizeBriefAccessSubject(email, secret),
    issuedAt,
    expiresAt,
    nonce
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signBriefAccessPayload(encodedPayload, secret)}`;
}

export function validateBriefAccessToken(token: string | null, secret: string, now = Date.now()) {
  if (!token || token.length > 1_024) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expectedSignature = Buffer.from(signBriefAccessPayload(parts[0], secret));
  const suppliedSignature = Buffer.from(parts[1]);
  if (
    expectedSignature.length !== suppliedSignature.length ||
    !timingSafeEqual(expectedSignature, suppliedSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<BriefAccessPayload>;
    if (
      payload.v !== 2 ||
      !payload.subjectHash ||
      !SHA256_HEX_PATTERN.test(payload.subjectHash) ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      !payload.nonce ||
      !ACCESS_NONCE_PATTERN.test(payload.nonce) ||
      payload.issuedAt! > now + BRIEF_ACCESS_CLOCK_SKEW_MS ||
      payload.expiresAt! <= now ||
      payload.expiresAt! <= payload.issuedAt! ||
      payload.expiresAt! - payload.issuedAt! > BRIEF_ACCESS_MAX_TOKEN_AGE_MS
    ) {
      return null;
    }
    return payload as BriefAccessPayload;
  } catch {
    return null;
  }
}

export function readBriefAccessCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name !== BRIEF_ACCESS_COOKIE_NAME) continue;
    const value = segment.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function secureHexEqual(left: string, right: string) {
  if (!SHA256_HEX_PATTERN.test(left) || !SHA256_HEX_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
