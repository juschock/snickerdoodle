import {
  evaluateCommercialReadiness,
  isLoopbackOrigin,
  resolveAllowedOrigin
} from './commercial-readiness.mjs';
import { SNICKERDOODLE_OFFER } from './offer';

export type PaymentRuntimeConfig = {
  allowedOrigin: string;
  securitySecret: string;
  stripeKey: string;
  webhookSecret: string;
  livemode: boolean;
  offer: typeof SNICKERDOODLE_OFFER;
};

function stripeKey(environment: NodeJS.ProcessEnv) {
  return environment.STRIPE_RESTRICTED_KEY ?? null;
}

function stripeLivemode(environment: NodeJS.ProcessEnv) {
  if (environment.SNICKERDOODLE_STRIPE_LIVEMODE === 'true') return true;
  if (environment.SNICKERDOODLE_STRIPE_LIVEMODE === 'false') return false;
  return null;
}

function keyMatchesMode(key: string, livemode: boolean) {
  const expected = livemode ? /^rk_live_/ : /^rk_test_/;
  return expected.test(key);
}

function sharedPaymentConfig(environment: NodeJS.ProcessEnv): PaymentRuntimeConfig | null {
  const allowedOrigin = resolveAllowedOrigin(environment);
  const securitySecret = environment.CHECKOUT_SECURITY_SECRET;
  const key = stripeKey(environment);
  const webhookSecret = environment.STRIPE_WEBHOOK_SECRET;
  const livemode = stripeLivemode(environment);

  if (
    !allowedOrigin ||
    !securitySecret ||
    securitySecret.length < 32 ||
    !key ||
    !webhookSecret ||
    !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret) ||
    livemode === null ||
    !keyMatchesMode(key, livemode) ||
    (livemode && (new URL(allowedOrigin).protocol !== 'https:' || isLoopbackOrigin(allowedOrigin)))
  ) {
    return null;
  }

  return {
    allowedOrigin,
    securitySecret,
    stripeKey: key,
    webhookSecret,
    livemode,
    offer: SNICKERDOODLE_OFFER
  };
}

/** Public checkout opens only when every commercial gate and payment control is exact. */
export function readCheckoutPaymentConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (
    environment.SNICKERDOODLE_PAYMENTS_ENABLED !== 'true' ||
    !evaluateCommercialReadiness(environment)
  ) {
    return null;
  }
  return sharedPaymentConfig(environment);
}

/** Webhooks remain separately controllable so paid obligations can settle while acquisition is paused. */
export function readWebhookPaymentConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED !== 'true') return null;
  return sharedPaymentConfig(environment);
}
