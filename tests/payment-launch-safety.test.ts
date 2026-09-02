import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260830140200_payment_launch_safety.sql';
const concurrencySuccessorPath =
  'supabase/migrations/20260901163504_enable_multi_customer_payment_concurrency.sql';

describe('payment launch-safety successor migration', () => {
  it('requires the Stripe email and session to match the candidate-bound intent', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(
      'lower(btrim(v_intent.delivery_email)) is distinct from v_customer_email'
    );
    expect(migration).toContain(
      'v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id'
    );
    expect(migration).toContain('Stripe event replay does not match stored binding');
    expect(migration).toContain("v_intent.status not in ('pending', 'checkout_created')");
  });

  it('records the historical singleton predecessor and proves the effective successor removes it', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const successor = readFileSync(concurrencySuccessorPath, 'utf8');

    expect(migration).toContain('create unique index if not exists uq_orders_one_active_standard_99');
    expect(migration).toContain("payment_status = 'disputed'");
    expect(migration).toContain("payment_status = 'paid' and status <> 'closed'");
    for (const status of [
      'new_intake',
      'needs_clarification',
      'ready_for_drafting',
      'drafting',
      'ai_critique',
      'ready_for_human_review',
      'independent_review',
      'revision_needed',
      'approved',
      'packaged',
      'delivered',
      'follow_up_sent'
    ]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).toContain(
      "hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)"
    );
    expect(migration).toContain('snickerdoodle_order_capacity_state_unknown');
    expect(migration).toContain('snickerdoodle_order_capacity_exhausted');
    expect(migration).toContain(
      'Only the exact signed expiration/failure webhook may release this'
    );
    expect(migration).not.toContain("released_reason = 'reservation_expired'");
    expect(migration.indexOf('if v_intent.order_id is not null then'))
      .toBeLessThan(migration.indexOf('snickerdoodle_order_capacity_exhausted'));
    expect(successor).toContain(
      'drop index if exists public.uq_orders_one_active_standard_99'
    );
    expect(successor).toContain('rename to stripe_checkout_reservations');
    expect(successor).not.toContain(
      "hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)"
    );
  });

  it('restores only the gated service-role checkout and webhook boundary', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const successor = readFileSync(
      'supabase/migrations/20260830202804_harden_checkout_reconciliation_and_owner_aal2.sql',
      'utf8'
    );

    expect(migration).toContain(
      'grant select, insert, update on table public.checkout_intents to service_role;'
    );
    expect(migration).toContain(
      'grant execute on function public.consume_checkout_rate_limit(text, text)'
    );
    expect(migration).toContain(
      'grant execute on function public.begin_stripe_webhook_attempt(text, text, boolean, text)'
    );
    expect(migration).toContain(
      'grant execute on function public.complete_stripe_webhook_attempt(text, text, uuid, text)'
    );
    expect(migration).toContain(
      'grant execute on function public.record_stripe_checkout_failure(text, text, text, uuid)'
    );
    expect(migration).toContain(
      'grant execute on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz)'
    );
    expect(migration).toContain(
      'grant execute on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz)'
    );
    expect(migration).toContain(
      'revoke all privileges on table public.snickerdoodle_order_capacity'
    );
    expect(migration).not.toMatch(/grant (?:select|insert|update|delete|execute)[^;]+to (?:anon|authenticated)/i);
    expect(migration).not.toContain('cron.alter_job');
    expect(migration).not.toContain('payment_operations_health');
    expect(successor).toContain(
      'revoke all on function public.record_stripe_checkout_failure(text, text, text, uuid)'
    );
    expect(successor).toContain(
      'revoke update on table public.checkout_intents from service_role;'
    );
  });

  it('acknowledges refund, dispute, and expiry only after durable reconciliation state', () => {
    const webhook = readFileSync('lib/stripe-webhook-handler.ts', 'utf8');
    const stateMachine = readFileSync('lib/payment-state-machine.ts', 'utf8');
    const atomicSuccessor = readFileSync(
      'supabase/migrations/20260902044710_prove_payment_state_machine.sql',
      'utf8'
    );
    const successor = readFileSync(
      'supabase/migrations/20260830202804_harden_checkout_reconciliation_and_owner_aal2.sql',
      'utf8'
    );

    for (const eventType of [
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.closed:won',
      'charge.dispute.closed:lost'
    ]) {
      expect(stateMachine).toContain(`event: '${eventType}'`);
    }
    expect(webhook).toContain("supabase.rpc('process_stripe_payment_event'");
    expect(webhook).not.toContain("supabase.rpc('complete_stripe_webhook_attempt'");
    expect(atomicSuccessor).toContain("processing_status = 'failed_retryable'");
    expect(atomicSuccessor).toContain("v_transition_code := 'full_refund'");
    expect(atomicSuccessor).toContain("v_transition_code := 'dispute_lost'");
    expect(successor).toContain('private.payment_reconciliation_alerts');
  });

  it('closes a session-bound intent and alerts before acknowledging asynchronous failure', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const webhook = readFileSync('lib/stripe-webhook-handler.ts', 'utf8');
    const stateMachine = readFileSync('lib/payment-state-machine.ts', 'utf8');
    const atomicSuccessor = readFileSync(
      'supabase/migrations/20260902044710_prove_payment_state_machine.sql',
      'utf8'
    );

    expect(migration).toContain("'checkout.session.async_payment_failed'");
    expect(migration).toContain("'checkout.session.expired'");
    expect(migration).toContain('Failed Checkout Session does not match intent binding');
    expect(migration).toContain("set status = 'expired'");
    expect(stateMachine).toContain("event: 'checkout.session.async_payment_failed'");
    expect(stateMachine).toContain("event: 'checkout.session.expired'");
    expect(atomicSuccessor).toContain('async_payment_failed_attention_required');
    expect(webhook).toContain("supabase.rpc('process_stripe_payment_event'");
  });
});
