import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_GATE_NAMES,
  evaluateCommercialReadiness,
  resolveAllowedOrigin
} from '@/lib/commercial-readiness.mjs';

describe('commercial readiness gate', () => {
  it('stays closed for missing, partial, or loosely truthy values', () => {
    expect(evaluateCommercialReadiness({})).toBe(false);

    const partial = Object.fromEntries(COMMERCIAL_GATE_NAMES.map((name) => [name, 'true']));
    delete partial.SNICKERDOODLE_REVIEWER_READY;
    expect(evaluateCommercialReadiness(partial)).toBe(false);

    const loose = Object.fromEntries(COMMERCIAL_GATE_NAMES.map((name) => [name, 'true']));
    loose.SNICKERDOODLE_LEGAL_APPROVED = 'TRUE';
    expect(evaluateCommercialReadiness(loose)).toBe(false);
  });

  it('opens only when every retained gate is exactly true', () => {
    const approved = Object.fromEntries(COMMERCIAL_GATE_NAMES.map((name) => [name, 'true']));
    expect(evaluateCommercialReadiness(approved)).toBe(true);
  });

  it('accepts exact HTTPS origins and reserves HTTP for local test origins', () => {
    expect(resolveAllowedOrigin({ SNICKERDOODLE_ALLOWED_ORIGIN: 'https://racoben.com' }))
      .toBe('https://racoben.com');
    expect(resolveAllowedOrigin({ SNICKERDOODLE_ALLOWED_ORIGIN: 'http://127.0.0.1:3100' }))
      .toBe('http://127.0.0.1:3100');

    for (const candidate of [
      undefined,
      '',
      'racoben.com',
      'ftp://racoben.com',
      'http://racoben.com',
      'http://example.com:3100',
      'https://user:secret@racoben.com',
      'https://racoben.com/',
      'https://racoben.com/snickerdoodle',
      'https://racoben.com/foo/..',
      'https://racoben.com/%2e%2e',
      'https://racoben.com/.',
      'https://racoben.com?next=elsewhere',
      'https://racoben.com#fragment'
    ]) {
      expect(resolveAllowedOrigin({ SNICKERDOODLE_ALLOWED_ORIGIN: candidate })).toBeNull();
    }
  });
});
