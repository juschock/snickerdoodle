\set ON_ERROR_STOP on

-- SN Sprint 04 disposable-local authorization/adversarial corpus.
-- Requires the full migration chain plus ord03-synthetic-fixture.sql.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_value is distinct from true then
    raise exception 'SN04 assertion failed: %', p_label;
  end if;
end;
$$;

create or replace function pg_temp.set_claims(
  p_user_id uuid,
  p_session_id uuid,
  p_aal text default 'aal2',
  p_extra jsonb default '{}'::jsonb
)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object(
      'sub', p_user_id::text,
      'session_id', p_session_id::text,
      'exp', floor(extract(epoch from clock_timestamp()))::bigint + 3600,
      'role', 'authenticated',
      'aal', p_aal
    ) || p_extra)::text,
    false
  );
end;
$$;

begin;

-- Catalog disposition: every elevated routine is pinned, no anonymous role
-- can execute one, and browser-callable elevated routines are an exact list.
select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not ('search_path=""' = any (p.proconfig))
  ),
  'every SECURITY DEFINER routine pins an empty search_path'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
  ),
  'anon cannot execute any SECURITY DEFINER routine'
);

select pg_temp.assert_true(
  (
    select array_agg(p.proname order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) = array[
    'execute_privacy_request',
    'manage_engagement_assignment',
    'payment_operations_health',
    'read_engagement_workspace',
    'read_intake_manager_queue',
    'read_owner_paid_brief',
    'read_privacy_export',
    'read_service_lead_engagement',
    'transition_order_fulfillment',
    'verify_privacy_request',
    'write_engagement_work_item'
  ]::name[],
  'authenticated SECURITY DEFINER surface is exact'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated', 'private.has_active_engagement_role(uuid,text[])', 'execute'
  ),
  'assignment predicate is not a caller-visible oracle'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind in ('r', 'p', 'v', 'm')
      and (
        has_table_privilege('anon', c.oid, 'select,insert,update,delete')
        or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
      )
  ),
  'browser roles have no direct application table DML'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  'all application tables retain RLS'
);

-- Audit schemas are metadata-only by construction.
select pg_temp.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name in (
        'engagement_access_audit_receipts',
        'intake_manager_queue_access_receipts',
        'owner_paid_brief_access_receipts',
        'order_fulfillment_idempotency',
        'privacy_requests',
        'privacy_request_actions',
        'privacy_audit_receipts'
      )
      and column_name ~ '(email|brief|content|payload|secret|token|provider)'
  ),
  'audit and idempotency receipts contain metadata columns only'
);

-- Direct payment/customer tables deny ordinary authenticated callers before
-- RLS can become an accidental authorization source.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000006',
  'aal2'
);
set local role authenticated;
do $direct_denial$
begin
  begin
    perform 1 from public.stripe_events limit 1;
    raise exception 'direct stripe_events read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.briefs limit 1;
    raise exception 'direct briefs read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.payment_reconciliation_alerts limit 1;
    raise exception 'direct reconciliation read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$direct_denial$;
reset role;

-- Manager/admin matrix: anon lacks EXECUTE; ordinary auth and AAL1 owner fail;
-- only a live AAL2 owner reaches the queue and aggregate health models.
select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.read_intake_manager_queue(integer,timestamptz,uuid)',
    'execute'
  ),
  'anon manager queue execute denied'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000006',
  'aal2'
);
set local role authenticated;
do $ordinary_manager_denial$
begin
  begin
    perform * from public.read_intake_manager_queue(10, null, null);
    raise exception 'ordinary authenticated manager read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$ordinary_manager_denial$;
reset role;

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal1'
);
set local role authenticated;
do $aal1_manager_denial$
begin
  begin
    perform * from public.read_intake_manager_queue(10, null, null);
    raise exception 'AAL1 owner manager read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.payment_operations_health();
    raise exception 'AAL1 owner payment health unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$aal1_manager_denial$;
reset role;

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
select count(*) >= 0 as manager_allowed
from public.read_intake_manager_queue(10, null, null) \gset
select count(*) = 1 as health_allowed
from public.payment_operations_health() \gset
reset role;
select pg_temp.assert_true(:'manager_allowed', 'AAL2 owner manager read allowed');
select pg_temp.assert_true(:'health_allowed', 'AAL2 owner payment health allowed');

-- Assignment administration requires owner AAL2 and ignores spoofable claims.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal1'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant', '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003', 'service_lead',
  clock_timestamp() + interval '2 hours', 'sn04-aal1-denial-0001'
) \gset aal1_assignment_
reset role;
select pg_temp.assert_true(
  :'aal1_assignment_out_reason_code' = 'aal2_owner_required',
  'AAL1 owner assignment denied and audited'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  'aal2',
  '{"role":"owner","future_role":"owner","email":"owner@spoof.invalid"}'::jsonb
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant', '23000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003', 'service_lead',
  clock_timestamp() + interval '2 hours', 'sn04-spoof-denial-0001'
) \gset spoof_assignment_
reset role;
select pg_temp.assert_true(
  :'spoof_assignment_out_reason_code' = 'aal2_owner_required',
  'JWT role/email spoof grants no assignment authority'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant', '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003', 'service_lead',
  clock_timestamp() + interval '2 hours', 'sn04-grant-a-lead3-0001'
) \gset grant_a_
select * from public.manage_engagement_assignment(
  'grant', '23000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004', 'service_lead',
  clock_timestamp() + interval '2 hours', 'sn04-grant-b-lead4-0001'
) \gset grant_b_
reset role;
select pg_temp.assert_true(
  :'grant_a_out_decision' = 'allowed' and :'grant_b_out_decision' = 'allowed',
  'AAL2 owner grants isolated assignments'
);

-- Cross-order workspace and fulfillment substitutions fail without content or
-- state mutation; same-order fulfillment remains valid and atomic.
update public.orders
set payment_status = 'paid', status = 'new_intake'
where id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000002'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  'aal1'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000002'
) \gset cross_workspace_
select public.transition_order_fulfillment(
  '23000000-0000-4000-8000-000000000002',
  'fulfillment.started', 'new_intake',
  '34000000-0000-4000-8000-000000000001'
) as cross_fulfillment \gset
select public.transition_order_fulfillment(
  '23000000-0000-4000-8000-000000000001',
  'fulfillment.started', 'new_intake',
  '34000000-0000-4000-8000-000000000002'
) as own_fulfillment \gset
reset role;
select pg_temp.assert_true(
  :'cross_workspace_authorized' = 'f'
    and :'cross_workspace_reason_code' = 'active_assignment_required',
  'cross-order workspace denied without content'
);
select pg_temp.assert_true(
  :'cross_fulfillment' = 'authorization_denied'
    and :'own_fulfillment' = 'drafting',
  'cross-order fulfillment denied while same-order succeeds'
);
select pg_temp.assert_true(
  (select status = 'new_intake' from public.orders
   where id = '23000000-0000-4000-8000-000000000002'),
  'cross-order denial did not mutate target order'
);

-- Reassignment revokes stale authority at the next action-time check.
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'grant', '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004', 'service_lead',
  clock_timestamp() + interval '2 hours', 'sn04-reassign-a-lead4-0001'
) \gset reassign_
reset role;
select pg_temp.assert_true(
  :'reassign_out_reason_code' = 'assignment_reassigned',
  'assignment handoff recorded'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  'aal1'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset stale_actor_
reset role;
select pg_temp.assert_true(
  :'stale_actor_authorized' = 'f',
  'reassigned actor loses access immediately'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004',
  'aal1'
);
set local role authenticated;
select * from public.read_engagement_workspace(
  '23000000-0000-4000-8000-000000000001'
) \gset new_actor_
reset role;
select pg_temp.assert_true(
  :'new_actor_authorized' = 't',
  'replacement actor receives exact order scope'
);

-- Caller search_path shadow objects cannot intercept any elevated resolution.
create schema sn04_shadow;
create table sn04_shadow.profiles (id uuid, active boolean, role text);
create table sn04_shadow.orders (id uuid, status text);
insert into sn04_shadow.profiles values (
  '00000000-0000-4000-8000-000000000006', true, 'owner'
);
select set_config('search_path', 'sn04_shadow,public,pg_catalog', false);
select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000006',
  'aal2'
);
set local role authenticated;
select * from public.manage_engagement_assignment(
  'revoke', '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004', 'service_lead', null,
  'sn04-shadow-denial-0001'
) \gset shadow_result_
reset role;
select pg_temp.assert_true(
  :'shadow_result_out_reason_code' = 'aal2_owner_required',
  'search_path shadow cannot forge owner authorization'
);

select pg_temp.assert_true(
  exists (
    select 1 from private.engagement_access_audit_receipts
    where reason_code in (
      'aal2_owner_required',
      'order_scoped_fulfillment_authorization_required'
    )
      and request_hash is null
      and session_id_hash ~ '^[0-9a-f]{64}$'
  ),
  'denied privileged actions leave metadata-only receipts'
);

rollback;

select 'SN04_PRIVILEGED_RPC_ACCESS_ACCEPTANCE_PASS' as result;
