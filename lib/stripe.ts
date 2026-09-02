import { createHmac } from 'node:crypto';
import Stripe from 'stripe';

export const STRIPE_API_VERSION = '2026-07-29.dahlia' as const;

let stripe: Stripe | null = null;
let activeKey: string | null = null;

export function getStripe() {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key) throw new Error('Stripe is not configured.');

  if (!stripe || activeKey !== key) {
    stripe = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
      appInfo: { name: 'snickerdoodle', version: '1.0.3' }
    });
    activeKey = key;
  }
  return stripe;
}

export function stripeIntegrationIdentifier(candidateId: string, secret: string) {
  const bytes = createHmac('sha256', secret)
    .update(`snickerdoodle:stripe-integration:v1:${candidateId}`)
    .digest()
    .subarray(0, 8);
  const suffix = Array.from(bytes, (byte) => String.fromCharCode(97 + (byte % 26))).join('');
  return `snickerdoodle_${suffix}`;
}
