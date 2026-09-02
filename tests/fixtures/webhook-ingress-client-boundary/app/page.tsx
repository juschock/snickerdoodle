'use client';

import { handleStripePaymentWebhook } from '../../../../lib/stripe-webhook-handler';

export default function ForbiddenClientImport() {
  return <p>{typeof handleStripePaymentWebhook}</p>;
}
