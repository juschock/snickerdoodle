import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const migration = read(
  'supabase/migrations/20260902064553_implement_privacy_lifecycle_and_retention.sql'
);
const detector = read('scripts/db/privacy-detector-supersession-acceptance.sql');
const hostedReplay = read('scripts/db/hosted-legacy-reconciliation.sh');
const ledger = read('docs/customer-readiness/sn-sprint-08b2-migration-shas.txt');

describe('SN08B.2 privacy detector supersession', () => {
  it('preserves 20 predecessors and supersedes only the unapplied privacy bytes', () => {
    const entries = ledger.trim().split('\n');
    expect(entries).toHaveLength(21);
    expect(entries.slice(0, 20).join('\n')).toBe(
      read('docs/customer-readiness/sn-sprint-08a-migration-shas.txt')
        .trim().split('\n').slice(0, 20).join('\n')
    );
    expect(entries[20]).toContain(
      '87f7fd24f87e134ea79d8d4053bdd1c6e50ea324fb1d6effc662c1fcde344cb9'
    );
    expect(createHash('sha256').update(migration).digest('hex')).not.toBe(
      '0adaa00fdd6566dd7576f3757e8d75fafcc8c94618758e2882880d20623dd616'
    );
  });

  it('keeps the exception typed, field-local, Luhn-aware, and fail closed elsewhere', () => {
    expect(migration).toContain("e.key_name <> 'deliveryEmail'");
    expect(migration).toContain("p_payload ? 'deliveryEmail'");
    expect(migration).toContain('private.intake_delivery_email_is_allowed');
    expect(migration).toContain('private.luhn_is_valid(v_digits)');
    expect(migration).toContain("regexp_replace(v_match[1], '[^0-9]', '', 'g')");
    expect(detector).toContain('SNICK_PRIVACY_DETECTOR_SUPERSESSION_ACCEPTANCE_PASS');
    expect(detector.match(/v_base \|\|/g)?.length).toBeGreaterThanOrEqual(13);
  });

  it('proves clean and faithful hosted-20 predecessor paths converge', () => {
    expect(hostedReplay).toContain('seed_typed_email_false_positive');
    expect(hostedReplay).toContain('SNICK_SN08B2_PRIVACY_SUPERSESSION_PASS');
    expect(hostedReplay).toContain('privacy-detector-supersession-acceptance.sql');
    expect(hostedReplay).toContain('cmp -s');
  });
});
