import { NextResponse } from 'next/server';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import {
  getSupabaseManagerClient,
  verifySupabaseOwnerAal2
} from '@/lib/supabase-manager';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function GET(
  request: Request,
  context: { params: Promise<{ intentId: string }> }
) {
  const requestId = requestCorrelationId(request.headers);
  const token = readBearerToken(request.headers.get('authorization'));
  if (!token) return noStoreJson({ error: 'Owner authorization is required.' }, 401);

  const { intentId } = await context.params;
  if (!UUID_PATTERN.test(intentId)) return noStoreJson({ error: 'Invalid intake identifier.' }, 400);

  try {
    if (!await verifySupabaseOwnerAal2(token)) {
      logSecurityEvent('warn', 'manager_intake.aal2_rejected', { requestId });
      return noStoreJson({ error: 'A current AAL2 owner session is required.' }, 403);
    }

    const managerClient = getSupabaseManagerClient(token);
    const { data, error } = await managerClient.rpc('read_owner_paid_brief', {
      p_intent_id: intentId
    });
    const intake = Array.isArray(data) ? data[0] : data;
    if (error || !intake) {
      logSecurityEvent('warn', 'manager_intake.access_rejected', { requestId });
      return noStoreJson({ error: 'Paid intake is unavailable.' }, 403);
    }

    return noStoreJson({ intake }, 200);
  } catch {
    logSecurityEvent('error', 'manager_intake.unavailable', { requestId });
    return noStoreJson({ error: 'Paid intake is unavailable.' }, 503);
  }
}
