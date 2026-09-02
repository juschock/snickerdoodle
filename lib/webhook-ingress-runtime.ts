import 'server-only';

import type { PaymentRuntimeConfig } from './payment-runtime';
import { SNICKERDOODLE_OFFER } from './offer';

export const WEBHOOK_INGRESS_IDENTITY = 'snickerdoodle' as const;
export const WEBHOOK_INGRESS_MODE = 'sandbox' as const;
export const WEBHOOK_INGRESS_CANDIDATE =
  '380cee4bb475b3b9e45b4b580931a4025e2aa816' as const;
export const WEBHOOK_INGRESS_SUPABASE_PROJECT = 'iybwbnabyphpzlmzypga' as const;

export const WEBHOOK_INGRESS_ENV_NAMES = [
  'SNICKERDOODLE_INGRESS_IDENTITY',
  'SNICKERDOODLE_INGRESS_MODE',
  'SNICKERDOODLE_INGRESS_CANDIDATE',
  'SNICKERDOODLE_SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_WEBHOOK_SECRET'
] as const;

type IngressRuntimeConfig = Pick<
  PaymentRuntimeConfig,
  'livemode' | 'offer' | 'webhookSecret'
>;

function isExpectedSupabaseOrigin(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === `https://${WEBHOOK_INGRESS_SUPABASE_PROJECT}.supabase.co` &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

export function readWebhookIngressConfig(
  environment: NodeJS.ProcessEnv = process.env
): IngressRuntimeConfig | null {
  if (
    environment.SNICKERDOODLE_INGRESS_IDENTITY !== WEBHOOK_INGRESS_IDENTITY ||
    environment.SNICKERDOODLE_INGRESS_MODE !== WEBHOOK_INGRESS_MODE ||
    environment.SNICKERDOODLE_INGRESS_CANDIDATE !== WEBHOOK_INGRESS_CANDIDATE ||
    environment.SNICKERDOODLE_SUPABASE_PROJECT_REF !== WEBHOOK_INGRESS_SUPABASE_PROJECT ||
    !isExpectedSupabaseOrigin(environment.SUPABASE_URL) ||
    !environment.SUPABASE_SERVICE_ROLE_KEY ||
    environment.SUPABASE_SERVICE_ROLE_KEY.length < 20 ||
    !environment.STRIPE_WEBHOOK_SECRET ||
    !/^whsec_[A-Za-z0-9]+$/.test(environment.STRIPE_WEBHOOK_SECRET)
  ) {
    return null;
  }

  return {
    livemode: false,
    offer: SNICKERDOODLE_OFFER,
    webhookSecret: environment.STRIPE_WEBHOOK_SECRET
  };
}
