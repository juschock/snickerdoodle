import { describe, expect, it } from 'vitest';
import { briefCheckoutSchema } from '@/lib/checkout';
import { emptyBrief } from '@/lib/intake';
import { SNICKERDOODLE_OFFER } from '@/lib/offer';

const validBrief = {
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
};

describe('Snickerdoodle offer and intake contract', () => {
  it('accepts a complete campaign intake', () => {
    expect(briefCheckoutSchema.safeParse(validBrief).success).toBe(true);
  });

  it('rejects missing fulfillment details and invalid email', () => {
    const result = briefCheckoutSchema.safeParse({ ...validBrief, keyDetails: '', deliveryEmail: 'bad' });
    expect(result.success).toBe(false);
  });

  it('keeps the future fixed-price offer at $99 USD', () => {
    expect(SNICKERDOODLE_OFFER).toMatchObject({ id: 'standard_99', amountCents: 9900, currency: 'usd' });
  });
});
