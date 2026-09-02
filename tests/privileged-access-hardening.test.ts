import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260902052346_harden_privileged_rpc_access.sql',
  'utf8',
);
const matrix = readFileSync('docs/security/privileged-access-matrix.md', 'utf8');
const acceptance = readFileSync(
  'scripts/db/privileged-rpc-access-acceptance.sql',
  'utf8',
);

describe('SN Sprint 04 privileged access hardening', () => {
  it('makes browser data access RPC-only and prevents default PUBLIC execute', () => {
    expect(migration).toContain(
      'revoke all privileges on all tables in schema public from anon, authenticated',
    );
    expect(migration).toContain(
      'alter default privileges in schema public revoke execute on functions from public',
    );
    expect(migration).toContain(
      'revoke all on function private.has_active_engagement_role(uuid, text[])',
    );
  });

  it('requires AAL2 at owner admin and payment-health boundaries', () => {
    expect(migration.match(/private\.is_owner_aal2\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("'aal2_owner_required'");
    expect(migration).toContain("return 'authorization_denied'");
  });

  it('preserves reviewed mutation bodies as private non-callable internals', () => {
    expect(migration).toContain('manage_engagement_assignment_internal');
    expect(migration).toContain('transition_order_fulfillment_internal');
    expect(migration).toContain('payment_operations_health_internal');
    expect(migration).toContain('process_stripe_payment_event_internal');
    expect(migration).toContain('from public, anon, authenticated, service_role');
  });

  it('freezes catalog, AAL2, cross-order, reassignment, direct-table, and shadow tests', () => {
    for (const evidence of [
      'every SECURITY DEFINER routine pins an empty search_path',
      'authenticated SECURITY DEFINER surface is exact',
      'AAL1 owner assignment denied and audited',
      'cross-order fulfillment denied while same-order succeeds',
      'reassigned actor loses access immediately',
      'search_path shadow cannot forge owner authorization',
      'direct stripe_events read unexpectedly succeeded',
    ]) {
      expect(acceptance).toContain(evidence);
    }
  });

  it('documents all customer, engagement, payment, queue, and audit boundaries', () => {
    for (const object of [
      '`profiles`',
      '`accounts`, `contacts`, `campaigns`, `orders`',
      '`briefs`',
      '`engagement_assignments`',
      '`engagement_work_items`',
      '`stripe_events`, `stripe_webhook_receipts`',
      'manager queue and access receipts',
    ]) {
      expect(matrix).toContain(object);
    }
    expect(matrix).toContain('There are 35 `SECURITY DEFINER` routines');
  });
});
