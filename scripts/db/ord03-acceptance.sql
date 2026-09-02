\set ON_ERROR_STOP on

-- ORD-03 disposable-local acceptance harness. It assumes:
--   1. the complete current filename-ordered migration chain was replayed;
--   2. ord03-synthetic-fixture.sql was loaded;
--   3. exact reviewed owner, assignment, payment, recovery, and queue
--      migrations were applied.
-- Never run this against linked, hosted, production, or customer-bearing data.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'ORD-03 assertion failed: %', p_label;
  end if;
end;
$$;

create or replace function pg_temp.assert_text(
  p_actual text,
  p_expected text,
  p_label text
)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ORD-03 assertion failed: % (actual=%, expected=%)',
      p_label, p_actual, p_expected;
  end if;
end;
$$;

create or replace function pg_temp.set_claims(
  p_user_id uuid,
  p_session_id uuid,
  p_seconds_until_expiry integer default 3600,
  p_extra_claims jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    (
      jsonb_build_object(
        'sub', p_user_id::text,
        'session_id', p_session_id::text,
        'exp', floor(extract(epoch from clock_timestamp()))::bigint
          + p_seconds_until_expiry,
        'role', 'authenticated'
      ) || p_extra_claims
    )::text,
    false
  );
end;
$$;

begin;

select (clock_timestamp() + interval '2 hours')::timestamptz as lead_expiry \gset
select (clock_timestamp() + interval '90 minutes')::timestamptz as reviewer_expiry \gset

-- Owner grants one lead and one reviewer to the same engagement.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'service_lead',
  :'lead_expiry'::timestamptz,
  'ord03-grant-lead-a-0001'
) \gset lead_grant_
reset role;
select pg_temp.assert_text(:'lead_grant_out_decision', 'allowed', 'lead grant allowed');
select pg_temp.assert_text(:'lead_grant_out_reason_code', 'assignment_granted', 'lead grant reason');

-- Exact idempotent replay returns the same assignment; changed payload conflicts.
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'service_lead',
  :'lead_expiry'::timestamptz,
  'ord03-grant-lead-a-0001'
) \gset lead_replay_
reset role;
select pg_temp.assert_text(:'lead_replay_out_reason_code', 'assignment_granted', 'assignment replay preserves result');
select pg_temp.assert_text(:'lead_replay_out_assignment_id', :'lead_grant_out_assignment_id', 'assignment replay id');

set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'service_lead',
  (:'lead_expiry'::timestamptz + interval '1 minute'),
  'ord03-grant-lead-a-0001'
) \gset lead_conflict_
reset role;
select pg_temp.assert_text(:'lead_conflict_out_reason_code', 'idempotency_conflict', 'assignment idempotency conflict');

set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000005',
  'assigned_reviewer',
  :'reviewer_expiry'::timestamptz,
  'ord03-grant-reviewer-a-0001'
) \gset reviewer_grant_
reset role;
select pg_temp.assert_text(:'reviewer_grant_out_decision', 'allowed', 'reviewer grant allowed');

set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  'assigned_reviewer',
  :'reviewer_expiry'::timestamptz,
  'ord03-dual-role-denial-0001'
) \gset dual_role_
reset role;
select pg_temp.assert_text(:'dual_role_out_reason_code', 'dual_role_assignment_denied', 'same subject cannot hold both roles');

-- Same-engagement access succeeds; cross-engagement and raw reviewer access fail.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select * from public.read_service_lead_engagement(
  '23000000-0000-4000-8000-000000000001'
) \gset lead_raw_
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000002'
) \gset lead_cross_
reset role;
select pg_temp.assert_text(:'lead_raw_authorized', 't', 'assigned lead reads own engagement');
select pg_temp.assert_text(:'lead_cross_authorized', 'f', 'assigned lead denied cross engagement');
select pg_temp.assert_text(:'lead_cross_reason_code', 'active_assignment_required', 'cross engagement denial reason');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000005'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset reviewer_workspace_
select * from public.read_service_lead_engagement(
  '23000000-0000-4000-8000-000000000001'
) \gset reviewer_raw_
reset role;
select pg_temp.assert_text(:'reviewer_workspace_authorized', 't', 'reviewer reads scoped workspace');
select pg_temp.assert_text(:'reviewer_raw_authorized', 'f', 'reviewer denied raw engagement');

-- Global reviewer label, historical assigned_reviewer_id, email/name metadata,
-- and a caller-provided future role claim confer no engagement rights.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000006',
  3600,
  '{"email":"owner-one@ord03.example.invalid","display_name":"Synthetic Owner One","future_role":"service_lead"}'::jsonb
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000002'
) \gset unassigned_
reset role;
select pg_temp.assert_text(:'unassigned_authorized', 'f', 'unassigned global reviewer denied');

-- Work creation is idempotent, updates are optimistic, and reviewer writes
-- are restricted to QA/review artifacts.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', null, 'draft',
  '{"fixture":"draft-v1"}'::jsonb, null, 'ord03-work-draft-create-0001'
) \gset draft_create_
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', null, 'draft',
  '{"fixture":"draft-v1"}'::jsonb, null, 'ord03-work-draft-create-0001'
) \gset draft_replay_
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', null, 'draft',
  '{"fixture":"different"}'::jsonb, null, 'ord03-work-draft-create-0001'
) \gset draft_conflict_
reset role;
select pg_temp.assert_text(:'draft_create_authorized', 't', 'lead creates draft');
select pg_temp.assert_text(:'draft_replay_reason_code', 'idempotent_replay', 'work create replay');
select pg_temp.assert_text(:'draft_replay_work_item_id', :'draft_create_work_item_id', 'work replay id');
select pg_temp.assert_text(:'draft_conflict_reason_code', 'idempotency_conflict', 'work create conflict');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000005'
);
set local role authenticated;
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', null, 'qa_checklist',
  '{"fixture":"qa"}'::jsonb, null, 'ord03-work-qa-create-0001'
) \gset qa_create_
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', null, 'draft',
  '{"fixture":"reviewer-draft"}'::jsonb, null,
  'ord03-reviewer-draft-denied-0001'
) \gset reviewer_draft_
reset role;
select pg_temp.assert_text(:'qa_create_authorized', 't', 'reviewer creates QA');
select pg_temp.assert_text(:'reviewer_draft_reason_code', 'reviewer_write_scope_denied', 'reviewer draft denied');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', :'draft_create_work_item_id'::uuid,
  'draft', '{"fixture":"draft-stale"}'::jsonb, 999, null
) \gset draft_stale_
select * from public.write_engagement_work_item(
  '23000000-0000-4000-8000-000000000001', :'draft_create_work_item_id'::uuid,
  'draft', '{"fixture":"draft-v2"}'::jsonb, 1, null
) \gset draft_update_
reset role;
select pg_temp.assert_text(:'draft_stale_reason_code', 'work_item_version_conflict', 'stale work update denied');
select pg_temp.assert_text(:'draft_update_lock_version', '2', 'work version incremented');

-- Deactivating an assignee does not prevent the owner from revoking the row.
update public.profiles
set active = false
where id = '00000000-0000-4000-8000-000000000005';
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'revoke',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000005',
  'assigned_reviewer', null, 'ord03-revoke-inactive-reviewer-0001'
) \gset reviewer_revoke_
reset role;
select pg_temp.assert_text(:'reviewer_revoke_out_reason_code', 'assignment_revoked', 'inactive reviewer revocable');

-- Reassign lead A to lead B; the predecessor loses access immediately.
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  'service_lead', :'lead_expiry'::timestamptz,
  'ord03-handoff-lead-b-0001'
) \gset lead_handoff_
reset role;
select pg_temp.assert_text(:'lead_handoff_out_reason_code', 'assignment_reassigned', 'lead handoff recorded');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset former_lead_
reset role;
select pg_temp.assert_text(:'former_lead_authorized', 'f', 'former lead denied after handoff');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset new_lead_
reset role;
select pg_temp.assert_text(:'new_lead_authorized', 't', 'new lead allowed after handoff');

-- A signed-out session and an expired token both fail before assignment use.
delete from auth.sessions
where id = '10000000-0000-4000-8000-000000000004';
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset signed_out_
reset role;
select pg_temp.assert_text(:'signed_out_reason_code', 'live_session_required', 'deleted session denied');

insert into auth.sessions (
  id, user_id, created_at, updated_at, refreshed_at, not_after
) values (
  '10000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004',
  now(), now(), now(), now() + interval '1 day'
);
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004',
  -1
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset expired_jwt_
reset role;
select pg_temp.assert_text(:'expired_jwt_reason_code', 'live_session_required', 'expired JWT denied');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000006'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset mismatched_session_
reset role;
select pg_temp.assert_text(:'mismatched_session_reason_code', 'live_session_required', 'session user mismatch denied');

-- Assignment-window expiry denies the assignee immediately. The next owner
-- change persists the expired lifecycle row and links its replacement.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000006',
  'assigned_reviewer',
  clock_timestamp() + interval '1 second',
  'ord03-expiring-reviewer-0001'
) \gset expiring_grant_
reset role;
select pg_temp.assert_text(:'expiring_grant_out_decision', 'allowed', 'short assignment granted');

select pg_sleep(1.1);
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000006'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000002'
) \gset expired_assignment_
reset role;
select pg_temp.assert_text(:'expired_assignment_authorized', 'f', 'elapsed assignment denied');
select pg_temp.assert_text(:'expired_assignment_reason_code', 'assignment_expired', 'elapsed assignment reason');

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant',
  '23000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000006',
  'assigned_reviewer',
  clock_timestamp() + interval '1 hour',
  'ord03-expired-replacement-0001'
) \gset expiry_replacement_
reset role;
select pg_temp.assert_text(:'expiry_replacement_out_reason_code', 'assignment_reassigned', 'expired assignment replaced');
select pg_temp.assert_true(
  exists (
    select 1
    from public.engagement_assignments
    where id = :'expiring_grant_out_assignment_id'::uuid
      and lifecycle_status = 'expired'
      and ended_at is not null
  ),
  'elapsed assignment lifecycle persisted'
);

commit;

-- Stronger-isolation callers fail closed before content access.
begin isolation level repeatable read;
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset stale_snapshot_
reset role;
select pg_temp.assert_text(:'stale_snapshot_reason_code', 'read_committed_required', 'stronger isolation denied');
commit;

-- ACL, payment, Cron, storage, and audit boundaries.
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.orders', 'select'),
  'authenticated lacks direct order read'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.engagement_assignments', 'select'),
  'authenticated lacks direct assignment read'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.engagement_work_items', 'select'),
  'service role lacks work-item read'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'service_role',
    'public.manage_engagement_assignment(text,uuid,uuid,text,timestamptz,text)',
    'execute'
  ),
  'service role cannot manage assignments'
);
select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.pending_intakes', 'insert'),
  'service role retains only private-intake insertion'
);
select pg_temp.assert_true(
  has_function_privilege(
    'service_role', 'public.consume_intake_rate_limit(text,text)', 'execute'
  ),
  'service role can enforce intake rate limit'
);

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.checkout_intents', 'select')
    and has_table_privilege('service_role', 'public.checkout_intents', 'select')
    and has_table_privilege('service_role', 'public.checkout_intents', 'insert')
    and not has_table_privilege('service_role', 'public.checkout_intents', 'update')
    and not has_table_privilege('service_role', 'public.checkout_intents', 'delete')
    and not has_table_privilege('authenticated', 'public.stripe_events', 'select')
    and not has_table_privilege('service_role', 'public.stripe_events', 'select')
    and not has_table_privilege('service_role', 'public.orders', 'select')
    and not has_table_privilege('service_role', 'public.stripe_checkout_reservations', 'select'),
  'service role has only the reviewed checkout-intent table boundary'
);
select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.finalize_stripe_checkout(text,text,text,text,uuid,integer,text,text,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.reserve_stripe_checkout_capacity(uuid,timestamptz,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.bind_stripe_checkout_capacity(uuid,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.payment_operations_health()', 'execute'
  ),
  'only reviewed payment routines are available to service role and none to authenticated'
);
select pg_temp.assert_true(
  not exists (
    select 1 from cron.job
    where jobname = 'racoben-payment-operational-cleanup' and active = true
  ),
  'historical payment Cron inactive'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and (qual ilike '%engagement%' or with_check ilike '%engagement%')
  ),
  'no engagement storage policy introduced'
);

select pg_temp.assert_true(
  exists (
    select 1
    from private.engagement_access_audit_receipts
    where event_code = 'assignment_granted'
      and decision = 'allowed'
      and order_id = '23000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1
    from private.engagement_access_audit_receipts
    where event_code = 'engagement_access_allowed'
      and decision = 'allowed'
      and order_id = '23000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1
    from private.engagement_access_audit_receipts
    where event_code = 'assignment_revoked'
      and decision = 'allowed'
      and order_id = '23000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1
    from private.engagement_access_audit_receipts
    where decision = 'denied'
      and order_id in (
        '23000000-0000-4000-8000-000000000001',
        '23000000-0000-4000-8000-000000000002'
      )
  ),
  'audit reconstructs grant, use, revoke, and denial'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'engagement_access_audit_receipts'
      and column_name in (
        'content', 'content_json', 'email', 'full_name', 'display_name',
        'raw_claim', 'bearer', 'ip_address', 'payment_payload', 'provider_secret'
      )
  ),
  'audit schema excludes customer content and secret fields'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from private.engagement_access_audit_receipts
    where session_id_hash is not null
      and session_id_hash !~ '^[0-9a-f]{64}$'
  ),
  'audit stores only hashed session identifiers'
);

select 'ORD03_CORE_ACCEPTANCE_PASS' as result;
