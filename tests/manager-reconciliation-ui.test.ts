import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manager = readFileSync('components/manager-queue.tsx', 'utf8');

describe('owner reconciliation workspace', () => {
  it('shows health, metadata review, and explicit resolution controls', () => {
    expect(manager).toContain('open_reconciliation_alerts');
    expect(manager).toContain('/snickerdoodle/api/manager/alerts');
    expect(manager).toContain(
      '/snickerdoodle/api/manager/reconciliation'
    );
    expect(manager).toContain('Review open alerts');
    expect(manager).toContain('Resolve verified unpaid expiry');
    expect(manager).toContain('window.confirm');
  });

  it('binds the write to the freshly reviewed occurrence and one idempotency key', () => {
    expect(manager).toContain(
      'expected_occurrence_count: alert.occurrence_count'
    );
    expect(manager).toContain('idempotency_key: idempotencyKey');
    expect(manager).toContain('crypto.randomUUID()');
    expect(manager).toContain(
      '`${alert.alert_id}:${alert.occurrence_count}`'
    );
  });

  it('keeps a truthful resolution result when either dashboard refresh fails', () => {
    expect(manager).toContain('loadReconciliationAlerts(true)');
    expect(manager).toContain('loadOperationsHealth(true)');
    expect(manager).toContain('workspace refresh was incomplete');
  });

  it('clears reconciliation state at owner sign-out', () => {
    expect(manager).toContain('setReconciliationAlerts([])');
    expect(manager).toContain(
      'reconciliationIdempotencyKeys.current.clear()'
    );
  });
});
