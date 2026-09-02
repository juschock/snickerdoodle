import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20260902064553_implement_privacy_lifecycle_and_retention.sql'),
  'utf8'
);
const acceptance = readFileSync(
  join(root, 'scripts/db/privacy-lifecycle-acceptance.sql'),
  'utf8'
);
const replay = readFileSync(join(root, 'scripts/db/privacy-lifecycle-replay.sh'), 'utf8');
const subjectGraph = readFileSync(join(root, 'docs/privacy/data-subject-graph.md'), 'utf8');
const retentionMatrix = readFileSync(join(root, 'docs/privacy/retention-field-matrix.md'), 'utf8');
const requestStateMachine = readFileSync(
  join(root, 'docs/privacy/privacy-request-state-machine.md'),
  'utf8'
);

describe('SN05 privacy lifecycle', () => {
  it('pins the exact forward migration and disposable corpus bytes', () => {
    expect(createHash('sha256').update(migration).digest('hex')).toBe(
      '0adaa00fdd6566dd7576f3757e8d75fafcc8c94618758e2882880d20623dd616'
    );
    expect(createHash('sha256').update(acceptance).digest('hex')).toBe(
      '0c33ce412271492bfc4833818fd3a32e2d3cfd530eb42249ee1b2243918d8362'
    );
    expect(createHash('sha256').update(replay).digest('hex')).toBe(
      '38e2614d16dcf7adcd19b4fbd8443748bae652d22589373270b17aadc5dcf135'
    );
  });

  it('resolves exact normalized subjects without persisting the submitted address', () => {
    expect(migration).toContain('create or replace function private.normalize_privacy_email');
    expect(migration).toContain('create or replace function public.create_privacy_request');
    expect(migration).toContain("lower(btrim(p_email))");
    expect(migration).toContain("when v_contact_count > 1 then 'needs_review'");
    expect(migration).toContain("when v_contact_count = 0 and v_raw_count = 0 then 'rejected'");
    expect(migration).not.toMatch(/privacy_requests\s*\([\s\S]{0,500}subject_email/i);
    expect(subjectGraph).toContain('The contact-to-order edge, not account membership alone');
  });

  it('keeps private artifacts fail-closed behind owner AAL2 RPCs', () => {
    for (const table of [
      'privacy_requests',
      'privacy_request_scopes',
      'privacy_request_actions',
      'privacy_export_artifacts',
      'privacy_audit_receipts',
      'retention_policies'
    ]) {
      expect(migration).toContain(`alter table private.${table} force row level security`);
    }
    expect(migration).toContain('create or replace function private.is_privacy_owner_aal2()');
    expect(migration).toContain('select (select private.is_owner_aal2())');
    expect(migration).toContain('and (select private.has_live_auth_session())');
    expect(migration).toContain('grant execute on function public.create_privacy_request(text, text) to service_role');
    expect(migration).toContain('grant execute on function public.execute_privacy_request');
    expect(requestStateMachine).toContain('Private tables have forced RLS');
  });

  it('enforces bounded allowlisted intake and removes raw customer content', () => {
    expect(migration).toContain('pg_column_size(p_payload) <= 65536');
    expect(migration).toContain("jsonb_object_keys(p_payload)");
    expect(migration).toContain("whsec_[a-z0-9]+");
    expect(migration).toContain("private|secret) key");
    expect(migration).toContain("p_payload::text !~ '([0-9][ -]?){12,18}[0-9]'");
    expect(migration).toContain('Existing intake payload violates the accepted privacy schema');
    expect(migration).toContain("set raw_submission_json = '{}'::jsonb");
    expect(migration).toContain("set content_json = '{\"privacyState\":\"anonymized\"}'::jsonb");
    expect(retentionMatrix).toContain('anonymized row may contain only `{}`');
  });

  it('exports customer-visible data without provider or staff internals', () => {
    expect(migration).toContain('create or replace function private.build_privacy_export');
    expect(migration).toContain("'customerVisibleActivity'");
    const exportBlock = migration.slice(
      migration.indexOf('create or replace function private.build_privacy_export'),
      migration.indexOf('create or replace function public.execute_privacy_request')
    );
    expect(exportBlock).not.toContain('stripe_payment_intent_id');
    expect(exportBlock).not.toContain('stripe_customer_id');
    expect(exportBlock).not.toContain('internal_notes');
    expect(exportBlock).not.toContain('engagement_assignments');
    expect(acceptance).toContain(
      'deterministic multi-order export includes A and excludes B, staff, and provider internals'
    );
  });

  it('makes retention deterministic but leaves legal durations unapproved', () => {
    expect(migration).toContain('create or replace function private.find_retention_candidates');
    expect(migration).toContain('create or replace function private.apply_retention_action');
    expect(migration).toContain("approval_state text not null default 'unapproved'");
    expect(migration).toContain('active boolean not null default false');
    expect(migration).not.toMatch(/interval '\d+ (day|month|year)s?'/i);
    expect(retentionMatrix).toContain('No legal duration is approved or encoded');
    expect(requestStateMachine).toContain('Caller-supplied customer IDs do not expand scope');
  });

  it('ships executable replay, isolation, rollback, and regression evidence', () => {
    expect(acceptance).toContain('deterministic multi-order export includes A');
    expect(acceptance).toContain('without conflating same-account second contact');
    expect(acceptance).toContain('interrupted anonymization rolls back request');
    expect(acceptance).toContain('duplicate deletion is safe with a new retry key');
    expect(acceptance).toContain('payment, dispute, fulfillment, assignment, and manager evidence survives coherently');
    expect(acceptance).toContain('SNICK_PRIVACY_LIFECYCLE_ACCEPTANCE_PASS');
    expect(replay).toContain('scripts/db/payment-state-machine-acceptance.sql');
    expect(replay).toContain('scripts/db/privileged-rpc-access-acceptance.sql');
    expect(replay).toContain('SNICK_PRIVACY_REPLAY_PASS postgres=17 migrations=$migration_count');
  });
});
