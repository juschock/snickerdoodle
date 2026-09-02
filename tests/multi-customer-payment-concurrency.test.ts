import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath =
  'supabase/migrations/20260901163504_enable_multi_customer_payment_concurrency.sql';
const terminalReconciliationPath =
  'supabase/migrations/20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql';
const operationalDocPaths = [
  'docs/internal-automation-pipeline.md',
  'docs/marketing-plan-zero-budget.md',
  'docs/studio/studio-architecture.md',
  'docs/studio/phase-plan.md'
];

describe('SN Sprint 01 multi-customer payment concurrency', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  it('removes every package-wide capacity mechanism in the effective successor', () => {
    expect(migration).toContain('drop index if exists public.uq_orders_one_active_standard_99');
    expect(migration).toContain('rename to stripe_checkout_reservations');
    expect(migration).toContain('add primary key (intent_id)');
    expect(migration).not.toContain("hashtextextended('snickerdoodle:standard_99:one-active-order:v1'");
    expect(migration).not.toContain('reservation_status = \'unavailable\'');
    expect(migration).not.toContain('snickerdoodle_order_capacity_exhausted');
  });

  it('retains exact per-intent, Session, PaymentIntent, event, amount and currency binding', () => {
    expect(migration).toContain('where intent_id = p_intent_id');
    expect(migration).toContain(
      'v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id'
    );
    expect(migration).toContain(
      'v_order.stripe_payment_intent_id is distinct from p_payment_intent_id'
    );
    expect(migration).toContain('perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0))');
    expect(migration).toContain('p_amount_total is distinct from 9900');
    expect(migration).toContain("lower(btrim(p_currency)) is distinct from 'usd'");
  });

  it('pins and restricts every changed privileged routine', () => {
    const changedFunctions = [
      'reserve_stripe_checkout_capacity',
      'bind_stripe_checkout_capacity',
      'compensate_stripe_checkout_setup',
      'resolve_stripe_checkout_setup',
      'finalize_stripe_checkout',
      'record_stripe_checkout_failure',
      'record_stripe_operational_event'
    ];

    for (const functionName of changedFunctions) {
      const definitionStart = migration.indexOf(`function public.${functionName}(`);
      expect(definitionStart).toBeGreaterThan(-1);
      expect(migration.slice(definitionStart, definitionStart + 800)).toContain(
        "security definer\nset search_path = ''"
      );
    }

    expect(migration).toContain(
      'revoke all privileges on table public.stripe_checkout_reservations'
    );
    expect(migration).not.toMatch(
      /grant (?:select|insert|update|delete|execute)[^;]+to (?:anon|authenticated)/i
    );
  });

  it('adds stable queue feed indexes without changing the AAL2 reader contract', () => {
    expect(migration).toContain('intake_manager_queue_feed_idx');
    expect(migration).toContain('(updated_at desc, queue_receipt_id desc)');
    expect(migration).toContain('payment_reconciliation_alerts_open_feed_idx');
  });

  it('rechecks terminal failure and expiry under the exact intent lock', () => {
    const terminalReconciliation = readFileSync(terminalReconciliationPath, 'utf8');
    const lockPosition = terminalReconciliation.indexOf('for update;');
    const paidRecheckPosition = terminalReconciliation.indexOf('into v_already_paid;');

    expect(lockPosition).toBeGreaterThan(-1);
    expect(lockPosition).toBeLessThan(paidRecheckPosition);
    expect(terminalReconciliation).toContain("security definer\nset search_path = ''");
    expect(terminalReconciliation).toContain(
      'grant execute on function public.record_stripe_operational_event('
    );
    expect(terminalReconciliation).not.toContain(
      "hashtextextended('snickerdoodle:standard_99:one-active-order:v1'"
    );
  });

  it('keeps operational instructions concurrent, capacity-gated, and per-order isolated', () => {
    for (const docPath of operationalDocPaths) {
      const content = readFileSync(docPath, 'utf8');

      expect(content).not.toMatch(
        /never more than one active|no more than one active order|one-active-order|do not activate them concurrently|one package is already in production; the future staged pilot permits no more than one active order/i
      );
      expect(content.toLowerCase()).toContain('concurrent');
      expect(content.toLowerCase()).toContain('isolat');
    }
  });
});
