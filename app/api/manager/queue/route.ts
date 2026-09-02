import { NextResponse } from 'next/server';
import { logSecurityEvent, requestCorrelationId } from '@/lib/security-log';
import {
  getSupabaseManagerClient,
  verifySupabaseOwnerAal2
} from '@/lib/supabase-manager';

export const runtime = 'nodejs';

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

function readCursor(request: Request) {
  const url = new URL(request.url);
  const updatedAt = url.searchParams.get('beforeUpdatedAt');
  const receiptId = url.searchParams.get('beforeReceiptId');
  if (updatedAt === null && receiptId === null) return null;
  const exactTimestamp = updatedAt && updatedAt.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(updatedAt)
    ? updatedAt
    : null;
  if (
    !exactTimestamp || !receiptId ||
    !Number.isFinite(Date.parse(exactTimestamp)) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)
  ) return false;
  // Preserve PostgreSQL's microsecond precision. Normalizing through JS Date
  // truncates to milliseconds and can skip rows in the SQL keyset predicate.
  return { updatedAt: exactTimestamp, receiptId };
}

export async function GET(request: Request) {
  const requestId = requestCorrelationId(request.headers);
  const token = readBearerToken(request.headers.get('authorization'));
  if (!token) return noStoreJson({ error: 'Owner authorization is required.' }, 401);
  const cursor = readCursor(request);
  if (cursor === false) return noStoreJson({ error: 'Invalid queue cursor.' }, 400);

  try {
    if (!await verifySupabaseOwnerAal2(token)) {
      logSecurityEvent('warn', 'manager_queue.aal2_rejected', { requestId });
      return noStoreJson({ error: 'A current AAL2 owner session is required.' }, 403);
    }
    const managerClient = getSupabaseManagerClient(token);
    const { data, error } = await managerClient.rpc('read_intake_manager_queue', {
      p_limit: 50,
      p_before_updated_at: cursor?.updatedAt ?? null,
      p_before_queue_receipt_id: cursor?.receiptId ?? null
    });
    if (error || !Array.isArray(data)) {
      logSecurityEvent('warn', 'manager_queue.access_rejected', { requestId });
      return noStoreJson({ error: 'Owner authorization is required.' }, 403);
    }

    const last = data.at(-1) as { updated_at?: unknown; queue_receipt_id?: unknown } | undefined;
    const nextCursor = data.length === 50 &&
      typeof last?.updated_at === 'string' &&
      typeof last.queue_receipt_id === 'string'
      ? { updated_at: last.updated_at, queue_receipt_id: last.queue_receipt_id }
      : null;

    return noStoreJson({ receipts: data, next_cursor: nextCursor }, 200);
  } catch {
    logSecurityEvent('error', 'manager_queue.unavailable', { requestId });
    return noStoreJson({ error: 'Manager queue is unavailable.' }, 503);
  }
}
