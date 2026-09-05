import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260904214819_owner_expiry_reconciliation.sql',
  'utf8'
);
const acceptance = readFileSync(
  'scripts/db/owner-expiry-reconciliation-acceptance.sql',
  'utf8'
);

describe('owner expiry reconciliation migration', () => {
  it('makes every open reconciliation alert unhealthy', () => {
    expect(migration).toContain('open_reconciliation_alerts bigint');
    expect(migration).toContain('h.is_healthy and a.open_count = 0');
    expect(migration).toMatch(
      /from private\.payment_reconciliation_alerts[\s\S]*where alert_state = 'open'/
    );
  });

  it('binds the eligible expiry receipt to the same local intent and session', () => {
    expect(migration).toContain('w.checkout_intent_id = i.id');
    expect(migration).toContain(
      'w.checkout_session_id = a.checkout_session_id'
    );
    expect(migration).toContain(
      "w.transition_code = 'checkout_recoverable_failure'"
    );
    expect(migration).toContain('w.completed_at is not null');
    expect(migration).toContain('w.order_id is null');
    expect(migration).toContain(
      'w.payment_intent_id is not distinct from a.payment_intent_id'
    );
  });

  it('requires an expired unpaid released graph', () => {
    expect(migration).toContain("i.status = 'expired'");
    expect(migration).toContain('i.order_id is null');
    expect(migration).toContain("r.reservation_state = 'released'");
    expect(migration).toContain(
      "r.released_reason = 'checkout.session.expired'"
    );
    expect(migration).toContain('r.order_id is null');
  });

  it('orders owner review newest first with deterministic UUID tie break', () => {
    expect(migration).toContain(
      'order by a.last_observed_at desc, a.alert_id desc'
    );
  });

  it('retains intent-before-alert locking and immutable idempotency receipt', () => {
    const intentLock = migration.indexOf(
      'from public.checkout_intents where id = v_intent_id for update'
    );
    const alertLock = migration.indexOf(
      'from private.payment_reconciliation_alerts',
      intentLock
    );

    expect(intentLock).toBeGreaterThan(-1);
    expect(alertLock).toBeGreaterThan(intentLock);
    expect(migration).toContain(
      'payment_alert_resolution_receipts_immutable'
    );
    expect(migration).toContain(
      'v_alert.occurrence_count <> p_expected_occurrence_count'
    );
  });

  it('does not mutate payment order reservation or fulfillment truth', () => {
    const resolverStart = migration.indexOf(
      'create function public.resolve_owner_expired_checkout_alert'
    );
    const resolverEnd = migration.indexOf(
      'revoke all on function public.resolve_owner_expired_checkout_alert',
      resolverStart
    );
    const resolver = migration.slice(resolverStart, resolverEnd);

    expect(resolver).toContain(
      'update private.payment_reconciliation_alerts'
    );
    expect(resolver).not.toMatch(
      /update\s+public\.(checkout_intents|orders|stripe_checkout_reservations|stripe_webhook_receipts|stripe_events)/i
    );
    expect(resolver).not.toMatch(
      /insert\s+into\s+public\.(orders|stripe_events|activity_events)/i
    );
  });

  it('proves alert-health deltas without assuming an empty suite database', () => {
    expect(acceptance).toContain('\\gset baseline_');
    expect(acceptance).toContain(
      ":'baseline_open_count'::bigint + 1"
    );
    expect(acceptance).toContain(
      ":'final_open_count'::bigint = :'baseline_open_count'::bigint"
    );
    expect(acceptance).toContain(
      "is not distinct from :'baseline_healthy'::boolean"
    );
  });
});
