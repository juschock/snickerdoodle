import { NextResponse } from 'next/server';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import {
  getSupabaseManagerClient,
  verifySupabaseActiveOwnerAal2
} from '@/lib/supabase-manager';

export const runtime = 'nodejs';

type PaymentOperationsHealth = {
  generated_at: string;
  is_healthy: boolean;
  latest_webhook_received_at: string | null;
  latest_webhook_completed_at: string | null;
  webhook_receipts_24h: number;
  failed_webhook_receipts_24h: number;
  stuck_webhook_receipts: number;
  stale_unpaid_checkout_intents: number;
  paid_checkout_intents_without_order: number;
  paid_stripe_orders_without_intent: number;
  paid_stripe_orders_without_event: number;
  processed_stripe_events_without_paid_order: number;
  open_reconciliation_alerts: number;
};

const countKeys = [
  'webhook_receipts_24h',
  'failed_webhook_receipts_24h',
  'stuck_webhook_receipts',
  'stale_unpaid_checkout_intents',
  'paid_checkout_intents_without_order',
  'paid_stripe_orders_without_intent',
  'paid_stripe_orders_without_event',
  'processed_stripe_events_without_paid_order',
  'open_reconciliation_alerts'
] as const satisfies readonly (keyof PaymentOperationsHealth)[];

const attentionKeys = [
  'failed_webhook_receipts_24h',
  'stuck_webhook_receipts',
  'stale_unpaid_checkout_intents',
  'paid_checkout_intents_without_order',
  'paid_stripe_orders_without_intent',
  'paid_stripe_orders_without_event',
  'processed_stripe_events_without_paid_order',
  'open_reconciliation_alerts'
] as const satisfies readonly (keyof PaymentOperationsHealth)[];

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}

function readBearerToken(header: string | null) {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  if (token.length < 32 || token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
}

function isNullableTimestamp(value: unknown) {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function isPaymentOperationsHealth(value: unknown): value is PaymentOperationsHealth {
  if (!value || typeof value !== 'object') return false;
  const health = value as Record<string, unknown>;
  return typeof health.generated_at === 'string' &&
    Number.isFinite(Date.parse(health.generated_at)) &&
    typeof health.is_healthy === 'boolean' &&
    isNullableTimestamp(health.latest_webhook_received_at) &&
    isNullableTimestamp(health.latest_webhook_completed_at) &&
    countKeys.every((key) => Number.isSafeInteger(health[key]) && Number(health[key]) >= 0);
}

export async function GET(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) return noStoreJson({ error: 'Owner authorization is required.' }, 401);

  try {
    if (!await verifySupabaseActiveOwnerAal2(accessToken)) {
      logSecurityEvent('warn', 'manager_health.aal2_rejected', { requestId });
      return noStoreJson({ error: 'A current AAL2 owner session is required.' }, 403);
    }

    const managerClient = getSupabaseManagerClient(accessToken);
    const { data, error } = await managerClient.rpc('payment_operations_health');
    const health = Array.isArray(data) ? data[0] : data;
    if (error || !isPaymentOperationsHealth(health)) {
      logSecurityEvent('error', 'manager_health.unavailable', { requestId });
      return noStoreJson({ error: 'Payment operations health is unavailable.' }, 503);
    }

    const attentionReasons = attentionKeys.filter((key) => health[key] > 0);
    const status = health.is_healthy && attentionReasons.length === 0
      ? 'healthy'
      : 'attention_required';

    return noStoreJson({
      health: {
        status,
        generated_at: health.generated_at,
        latest_webhook_received_at: health.latest_webhook_received_at,
        latest_webhook_completed_at: health.latest_webhook_completed_at,
        webhook_receipts_24h: health.webhook_receipts_24h,
        failed_webhook_receipts_24h: health.failed_webhook_receipts_24h,
        stuck_webhook_receipts: health.stuck_webhook_receipts,
        stale_unpaid_checkout_intents: health.stale_unpaid_checkout_intents,
        paid_checkout_intents_without_order: health.paid_checkout_intents_without_order,
        paid_stripe_orders_without_intent: health.paid_stripe_orders_without_intent,
        paid_stripe_orders_without_event: health.paid_stripe_orders_without_event,
        processed_stripe_events_without_paid_order: health.processed_stripe_events_without_paid_order,
        open_reconciliation_alerts: health.open_reconciliation_alerts,
        attention_reasons: attentionReasons
      }
    }, 200);
  } catch {
    logSecurityEvent('error', 'manager_health.unavailable', { requestId });
    return noStoreJson({ error: 'Payment operations health is unavailable.' }, 503);
  }
}
