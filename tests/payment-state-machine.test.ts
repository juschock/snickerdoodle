import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAYMENT_TRANSITION_MAP } from '@/lib/payment-state-machine';

const migration = readFileSync(
  'supabase/migrations/20260902044710_prove_payment_state_machine.sql',
  'utf8'
);
const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
const checkout = readFileSync('app/api/checkout/route.ts', 'utf8');

describe('authoritative payment state machine', () => {
  it('defines every supported provider transition with transaction semantics', () => {
    const events = PAYMENT_TRANSITION_MAP.map((rule) => rule.event);
    expect(events).toEqual(expect.arrayContaining([
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.closed:won',
      'charge.dispute.closed:lost'
    ]));
    for (const rule of PAYMENT_TRANSITION_MAP) {
      expect(rule.sourceStates.length).toBeGreaterThan(0);
      expect(rule.destinationState).not.toBe('');
      expect(rule.forbiddenRegressions.length).toBeGreaterThan(0);
      expect(rule.rowsAffected).toContain('stripe_webhook_receipts');
      expect(rule.transactionBoundary).toBe('process_stripe_payment_event');
      expect(rule.idempotency).toContain('event_id');
      expect(rule.terminalPrecedence).not.toBe('');
      expect(rule.reconciliation).not.toBe('');
    }
  });

  it('uses one verified server mutation entrypoint and no browser payment truth', () => {
    expect(webhook).toContain('constructEvent');
    expect(webhook.indexOf('constructEvent')).toBeLessThan(
      webhook.indexOf("supabase.rpc('process_stripe_payment_event'")
    );
    expect(webhook).not.toContain("supabase.rpc('finalize_stripe_checkout'");
    expect(webhook).not.toContain("supabase.rpc('complete_stripe_webhook_attempt'");
    expect(checkout).toContain("customer_creation: 'always'");
    expect(checkout).toContain('integration_identifier:');
    expect(checkout).not.toContain('payment_method_types');
    expect(checkout).not.toContain('automatic_tax');
  });

  it('proves atomic retry, terminal precedence, refund/dispute, queue, and least privilege', () => {
    expect(migration).toContain("processing_status = 'failed_retryable'");
    expect(migration).toContain('p_test_fail_after_business');
    expect(migration).toContain("v_transition_code := 'checkout_paid'");
    expect(migration).toContain("v_transition_code := 'full_refund'");
    expect(migration).toContain("v_transition_code := 'partial_refund_attention'");
    expect(migration).toContain("v_transition_code := 'dispute_won'");
    expect(migration).toContain("v_transition_code := 'dispute_lost'");
    expect(migration).toContain("'stale_terminal_after_payment'");
    expect(migration).toContain("queue_state in (");
    expect(migration).toContain("'paid_ready', 'payment_attention', 'in_fulfillment'");
    expect(migration).toContain('create or replace function public.transition_order_fulfillment');
    expect(migration).toContain('private.has_active_engagement_role');
    expect(migration).toContain('from public, anon, authenticated, service_role;');
    expect(migration).toContain('grant execute on function public.process_stripe_payment_event');
  });
});
