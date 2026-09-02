import { randomUUID } from 'node:crypto';

type LogLevel = 'info' | 'warn' | 'error';
type LogMetadata = Record<string, unknown>;

const SENSITIVE_KEY = /^ip$|address|authorization|bank|body|card|cookie|email|name|payload|phone|secret|signature|token/i;
const MAX_LOG_STRING_LENGTH = 256;

function sanitizeLogValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.slice(0, MAX_LOG_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(key, item));
  if (value && typeof value === 'object') return redactLogMetadata(value as LogMetadata);
  return String(value).slice(0, MAX_LOG_STRING_LENGTH);
}

export function redactLogMetadata(metadata: LogMetadata): LogMetadata {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, sanitizeLogValue(key, value)])
  );
}

export function requestCorrelationId(headers: Headers) {
  const platformId = headers.get('x-vercel-id');
  if (platformId && /^[A-Za-z0-9.:_-]{1,128}$/.test(platformId)) return platformId;
  return randomUUID();
}

export function logSecurityEvent(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  const entry = JSON.stringify({
    ...redactLogMetadata(metadata),
    timestamp: new Date().toISOString(),
    service: 'snickerdoodle-checkout',
    level,
    event: event.slice(0, 96)
  });

  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}
