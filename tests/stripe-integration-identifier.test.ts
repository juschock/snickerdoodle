import { describe, expect, it } from 'vitest';
import { stripeIntegrationIdentifier } from '@/lib/stripe';

describe('Stripe integration identifier', () => {
  it('is deterministic, candidate-bound, and keeps the required eight-letter suffix', () => {
    const secret = 'test-only-checkout-security-secret';
    const candidate = '11111111-1111-4111-8111-111111111111';
    const identifier = stripeIntegrationIdentifier(candidate, secret);

    expect(identifier).toMatch(/^snickerdoodle_[a-z]{8}$/);
    expect(stripeIntegrationIdentifier(candidate, secret)).toBe(identifier);
    expect(stripeIntegrationIdentifier('22222222-2222-4222-8222-222222222222', secret))
      .not.toBe(identifier);
    expect(stripeIntegrationIdentifier(candidate, `${secret}-rotated`)).not.toBe(identifier);
  });
});
