import { describe, expect, it } from 'vitest';
import { COMMERCIAL_GATE_NAMES } from '@/lib/commercial-readiness.mjs';
import { readCheckoutPaymentConfig, readWebhookPaymentConfig } from '@/lib/payment-runtime';

function readyEnvironment() {
  return {
    NODE_ENV: 'test',
    ...Object.fromEntries(COMMERCIAL_GATE_NAMES.map((name) => [name, 'true'])),
    SNICKERDOODLE_PAYMENTS_ENABLED: 'true',
    SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED: 'true',
    SNICKERDOODLE_STRIPE_LIVEMODE: 'false',
    SNICKERDOODLE_ALLOWED_ORIGIN: 'https://racoben.com',
    CHECKOUT_SECURITY_SECRET: 'x'.repeat(32),
    STRIPE_RESTRICTED_KEY: 'rk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_example'
  } as NodeJS.ProcessEnv;
}

describe('payment runtime gates', () => {
  it('opens checkout only for an exact, mode-consistent configuration', () => {
    const environment = readyEnvironment();
    expect(readCheckoutPaymentConfig(environment)).toMatchObject({
      allowedOrigin: 'https://racoben.com',
      livemode: false
    });

    environment.STRIPE_RESTRICTED_KEY = 'rk_live_wrongmode';
    expect(readCheckoutPaymentConfig(environment)).toBeNull();

    environment.STRIPE_RESTRICTED_KEY = 'sk_test_full_secret_is_not_accepted';
    expect(readCheckoutPaymentConfig(environment)).toBeNull();
  });

  it('does not fall back to a full-access Stripe secret key', () => {
    const environment = readyEnvironment();
    delete environment.STRIPE_RESTRICTED_KEY;
    environment.STRIPE_SECRET_KEY = 'sk_test_example';

    expect(readCheckoutPaymentConfig(environment)).toBeNull();
    expect(readWebhookPaymentConfig(environment)).toBeNull();
  });

  it('rejects remote HTTP in every mode and every loopback origin in live mode', () => {
    const environment = readyEnvironment();
    environment.SNICKERDOODLE_ALLOWED_ORIGIN = 'http://example.com';
    expect(readCheckoutPaymentConfig(environment)).toBeNull();
    expect(readWebhookPaymentConfig(environment)).toBeNull();

    environment.SNICKERDOODLE_ALLOWED_ORIGIN = 'http://127.0.0.1:3102';
    expect(readCheckoutPaymentConfig(environment)).not.toBeNull();

    environment.SNICKERDOODLE_STRIPE_LIVEMODE = 'true';
    environment.STRIPE_RESTRICTED_KEY = 'rk_live_example';
    expect(readCheckoutPaymentConfig(environment)).toBeNull();
    expect(readWebhookPaymentConfig(environment)).toBeNull();

    environment.SNICKERDOODLE_ALLOWED_ORIGIN = 'https://localhost:3102';
    expect(readCheckoutPaymentConfig(environment)).toBeNull();
    expect(readWebhookPaymentConfig(environment)).toBeNull();
  });

  it('keeps webhook settlement independently controllable', () => {
    const environment = readyEnvironment();
    environment.SNICKERDOODLE_PAYMENTS_ENABLED = 'false';
    expect(readCheckoutPaymentConfig(environment)).toBeNull();
    expect(readWebhookPaymentConfig(environment)).not.toBeNull();

    environment.SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED = 'false';
    expect(readWebhookPaymentConfig(environment)).toBeNull();
  });
});
