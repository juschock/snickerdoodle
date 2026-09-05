import { NextResponse } from 'next/server';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import {
  getSupabaseManagerClient,
  verifySupabaseActiveOwnerAal2
} from '@/lib/supabase-manager';

export const runtime = 'nodejs';

type OwnerReconciliationAlert = {
  alert_id: string;
  event_type: string;
  alert_code: string;
  occurrence_count: number;
  last_observed_at: string;
  can_resolve_expiry: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (
    token.length < 32 ||
    token.length > 4096 ||
    /[\s\u0000-\u001f\u007f]/.test(token)
  ) return null;
  return token;
}

function isOwnerReconciliationAlert(value: unknown): value is OwnerReconciliationAlert {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const alert = value as Record<string, unknown>;
  return (
    Object.keys(alert).length === 6 &&
    typeof alert.alert_id === 'string' &&
    UUID_PATTERN.test(alert.alert_id) &&
    typeof alert.event_type === 'string' &&
    alert.event_type.length >= 3 &&
    alert.event_type.length <= 255 &&
    typeof alert.alert_code === 'string' &&
    /^[a-z][a-z0-9_]{2,99}$/.test(alert.alert_code) &&
    Number.isSafeInteger(alert.occurrence_count) &&
    Number(alert.occurrence_count) > 0 &&
    typeof alert.last_observed_at === 'string' &&
    Number.isFinite(Date.parse(alert.last_observed_at)) &&
    typeof alert.can_resolve_expiry === 'boolean'
  );
}

export async function GET(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return noStoreJson({ error: 'Owner authorization is required.' }, 401);
  }

  try {
    if (!await verifySupabaseActiveOwnerAal2(accessToken)) {
      logSecurityEvent('warn', 'manager_alerts.aal2_rejected', { requestId });
      return noStoreJson(
        { error: 'A current AAL2 owner session is required.' },
        403
      );
    }

    const managerClient = getSupabaseManagerClient(accessToken);
    const { data, error } = await managerClient.rpc(
      'read_owner_reconciliation_alerts',
      { p_limit: 50 }
    );

    if (
      error ||
      !Array.isArray(data) ||
      !data.every(isOwnerReconciliationAlert)
    ) {
      logSecurityEvent('error', 'manager_alerts.unavailable', { requestId });
      return noStoreJson(
        { error: 'Reconciliation alerts are unavailable.' },
        503
      );
    }

    return noStoreJson({
      alerts: data.map((alert) => ({
        alert_id: alert.alert_id,
        event_type: alert.event_type,
        alert_code: alert.alert_code,
        occurrence_count: alert.occurrence_count,
        last_observed_at: alert.last_observed_at,
        can_resolve_expiry: alert.can_resolve_expiry
      }))
    }, 200);
  } catch {
    logSecurityEvent('error', 'manager_alerts.unavailable', { requestId });
    return noStoreJson(
      { error: 'Reconciliation alerts are unavailable.' },
      503
    );
  }
}
