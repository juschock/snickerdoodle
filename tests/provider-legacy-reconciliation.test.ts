import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const migrationName = '20260901160000_reconcile_provider_only_legacy_fulfillment.sql';
const migration = read(`supabase/migrations/${migrationName}`);
const fixture = read('scripts/db/fixtures/hosted-20260831035135-close-paid-fulfillment.sql');
const harness = read('scripts/db/hosted-legacy-reconciliation.sh');

describe('SN08A provider-only legacy retirement', () => {
  it('orders the one reconciliation migration before the five immutable RC migrations', () => {
    const migrations = readdirSync(join(root, 'supabase/migrations'))
      .filter((name) => name.endsWith('.sql')).sort();
    expect(migrations).toHaveLength(22);
    expect(migrations.indexOf(migrationName)).toBe(15);
    expect(migrations.slice(16)).toEqual([
      '20260901163504_enable_multi_customer_payment_concurrency.sql',
      '20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql',
      '20260902044710_prove_payment_state_machine.sql',
      '20260902052346_harden_privileged_rpc_access.sql',
      '20260902064553_implement_privacy_lifecycle_and_retention.sql',
      '20260903030728_release_rejected_checkout_session_setup.sql'
    ]);
  });

  it('binds the exact secret-free hosted provider evidence fixture', () => {
    expect(createHash('sha256').update(fixture).digest('hex')).toBe(
      'cc26f913ff32c7df5a327c037fa65fc5705fd21a841d7d522cf0bdb8f15df6b0'
    );
    expect(fixture).toContain('create or replace function public.close_owner_paid_fulfillment');
    expect(fixture).toContain("snickerdoodle:standard_99:one-active-order:v1");
  });

  it('revokes the obsolete caller before dependency-safe retirement', () => {
    const revoke = migration.indexOf(
      'revoke all on function public.close_owner_paid_fulfillment(uuid, text)'
    );
    const dropCaller = migration.indexOf(
      'drop function public.close_owner_paid_fulfillment(uuid, text)'
    );
    const dropReceipt = migration.indexOf(
      'drop table private.owner_fulfillment_close_receipts'
    );
    expect(revoke).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(dropCaller);
    expect(dropCaller).toBeLessThan(dropReceipt);
  });

  it('fails closed for evidence, partial state, and lossy data mappings', () => {
    expect(migration).toContain('Partial provider-only fulfillment state requires manual reconciliation');
    expect(migration).toContain('Legacy fulfillment receipts are material evidence and must be preserved');
    expect(migration).toContain('Provider-only queue state cannot be losslessly restored');
    expect(migration).toContain('Historical capacity row is not duplicated by a coherent paid graph');
    expect(migration).toContain("using errcode = '23514'");
  });

  it('proves clean and faithful hosted predecessor paths converge', () => {
    expect(harness).toContain('replay_clean');
    expect(harness).toContain('replay_hosted_path');
    expect(harness).toContain('cmp -s');
    expect(harness).toContain('SNICK_SN08A_HOSTED_RECONCILIATION_PASS');
    expect(harness).toContain('SN08A_HISTORICAL_GRAPH=preserved');
    expect(harness).toContain('public.transition_order_fulfillment');
    expect(harness).toContain("%snickerdoodle:standard_99:one-active-order:v1%");
  });
});
