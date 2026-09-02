import { handleStripePaymentWebhook } from '../../../../../../lib/stripe-webhook-handler';
import { readWebhookIngressConfig } from '../../../../../../lib/webhook-ingress-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleStripePaymentWebhook(request, readWebhookIngressConfig());
}
