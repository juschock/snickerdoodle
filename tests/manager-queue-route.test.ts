import { beforeEach, describe, expect, it, vi } from 'vitest';

const managerMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  verify: vi.fn()
}));

vi.mock('@/lib/supabase-manager', () => ({
  getSupabaseManagerClient: () => ({ rpc: managerMocks.rpc }),
  verifySupabaseOwnerAal2: managerMocks.verify
}));

vi.mock('@/lib/security-log', () => ({
  logSecurityEvent: vi.fn(),
  requestCorrelationId: () => 'manager-route-test'
}));

import { GET } from '@/app/api/manager/queue/route';

const bearer = `Bearer ${'x'.repeat(64)}`;

function receipt(index: number, updatedAt: string) {
  return {
    queue_receipt_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    updated_at: updatedAt
  };
}

beforeEach(() => {
  managerMocks.rpc.mockReset();
  managerMocks.verify.mockReset();
  managerMocks.verify.mockResolvedValue(true);
});

describe('manager queue API cursor', () => {
  it('round-trips the exact PostgreSQL microsecond cursor without omissions or overlap', async () => {
    const boundary = '2026-08-30T20:30:00.123456+00:00';
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      receipt(index + 1, index === 49 ? boundary : `2026-08-30T20:30:01.${String(index).padStart(6, '0')}+00:00`)
    );
    const secondPage = [
      receipt(51, '2026-08-30T20:30:00.123455+00:00'),
      receipt(52, '2026-08-30T20:30:00.123454+00:00')
    ];
    managerMocks.rpc
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: secondPage, error: null });

    const first = await GET(new Request('https://racoben.com/snickerdoodle/api/manager/queue', {
      headers: { authorization: bearer }
    }));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as {
      receipts: Array<{ queue_receipt_id: string }>;
      next_cursor: { updated_at: string; queue_receipt_id: string };
    };
    expect(firstBody.next_cursor.updated_at).toBe(boundary);

    const secondUrl = new URL('https://racoben.com/snickerdoodle/api/manager/queue');
    secondUrl.searchParams.set('beforeUpdatedAt', firstBody.next_cursor.updated_at);
    secondUrl.searchParams.set('beforeReceiptId', firstBody.next_cursor.queue_receipt_id);
    const second = await GET(new Request(secondUrl, { headers: { authorization: bearer } }));
    expect(second.status).toBe(200);
    const secondBody = await second.json() as { receipts: Array<{ queue_receipt_id: string }> };

    expect(managerMocks.rpc).toHaveBeenNthCalledWith(2, 'read_intake_manager_queue', {
      p_limit: 50,
      p_before_updated_at: boundary,
      p_before_queue_receipt_id: firstBody.next_cursor.queue_receipt_id
    });
    const firstIds = new Set(firstBody.receipts.map((item) => item.queue_receipt_id));
    expect(secondBody.receipts).toHaveLength(2);
    expect(secondBody.receipts.every((item) => !firstIds.has(item.queue_receipt_id))).toBe(true);
  });

  it('rejects malformed or partial cursors before database access', async () => {
    for (const search of [
      '?beforeUpdatedAt=2026-08-30T20%3A30%3A00.123456Z',
      '?beforeReceiptId=10000000-0000-4000-8000-000000000050',
      '?beforeUpdatedAt=2026-08-30T20%3A30%3A00.123456Z&beforeReceiptId=not-a-uuid'
    ]) {
      const response = await GET(new Request(
        `https://racoben.com/snickerdoodle/api/manager/queue${search}`,
        { headers: { authorization: bearer } }
      ));
      expect(response.status).toBe(400);
    }
    expect(managerMocks.rpc).not.toHaveBeenCalled();
  });
});
