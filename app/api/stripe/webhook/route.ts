import { readWebhookPaymentConfig } from '@/lib/payment-runtime';
import { handleStripePaymentWebhook } from '@/lib/stripe-webhook-handler';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleStripePaymentWebhook(request, readWebhookPaymentConfig(), {
    constructEvent(body, signature, secret) {
      return getStripe().webhooks.constructEvent(Buffer.from(body), signature, secret);
    }
  });
}
