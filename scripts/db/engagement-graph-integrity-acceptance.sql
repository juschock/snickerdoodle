\set ON_ERROR_STOP on

-- Disposable-local acceptance for the engagement-graph successor migration.
-- Assumes the full synthetic ORD-03 fixture and core acceptance already ran.
-- Never run against linked, hosted, production, or customer-bearing data.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'Engagement graph assertion failed: %', p_label;
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
    raise exception 'Engagement graph assertion failed: % (actual=%, expected=%)',
      p_label, p_actual, p_expected;
  end if;
end;
$$;

create or replace function pg_temp.set_claims(
  p_user_id uuid,
  p_session_id uuid,
  p_seconds_until_expiry integer default 3600
)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'session_id', p_session_id::text,
      'exp', floor(extract(epoch from clock_timestamp()))::bigint
        + p_seconds_until_expiry,
      'role', 'authenticated'
    )::text,
    false
  );
end;
$$;

select count(*)::text as audit_count_before
from private.engagement_access_audit_receipts \gset

select count(*)::text as other_assignment_count_before
from public.engagement_assignments
where order_id = '23000000-0000-4000-8000-000000000002' \gset

begin;

select pg_temp.assert_true(
  exists (
    select 1
    from pg_constraint con
    where con.conname = 'orders_campaign_account_fkey'
      and con.conrelid = 'public.orders'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'campaign_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'account_id' and not attisdropped)
      ]::smallint[]
      and con.confrelid = 'public.campaigns'::regclass
      and con.confkey = array[
        (select attnum from pg_attribute where attrelid = 'public.campaigns'::regclass and attname = 'id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = 'public.campaigns'::regclass and attname = 'account_id' and not attisdropped)
      ]::smallint[]
      and con.convalidated
      and not con.condeferrable
      and not con.condeferred
      and con.confdeltype = 'c'
      and con.confupdtype = 'a'
      and con.confmatchtype = 's'
  ),
  'campaign/account composite foreign key is validated'
);

select pg_temp.assert_true(
  exists (
    select 1
    from pg_constraint con
    where con.conname = 'orders_primary_contact_account_fkey'
      and con.conrelid = 'public.orders'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'primary_contact_id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'account_id' and not attisdropped)
      ]::smallint[]
      and con.confrelid = 'public.contacts'::regclass
      and con.confkey = array[
        (select attnum from pg_attribute where attrelid = 'public.contacts'::regclass and attname = 'id' and not attisdropped),
        (select attnum from pg_attribute where attrelid = 'public.contacts'::regclass and attname = 'account_id' and not attisdropped)
      ]::smallint[]
      and con.convalidated
      and not con.condeferrable
      and not con.condeferred
      and con.confdeltype = 'n'
      and con.confupdtype = 'a'
      and con.confmatchtype = 's'
  ),
  'contact/account composite foreign key is validated'
);

select pg_temp.assert_true(
  pg_get_constraintdef(
    (
      select oid from pg_constraint
      where conname = 'orders_campaign_account_fkey'
        and conrelid = 'public.orders'::regclass
    )
  ) like '%FOREIGN KEY (campaign_id, account_id)%ON DELETE CASCADE%'
  and pg_get_constraintdef(
    (
      select oid from pg_constraint
      where conname = 'orders_primary_contact_account_fkey'
        and conrelid = 'public.orders'::regclass
    )
  ) like '%FOREIGN KEY (primary_contact_id, account_id)%ON DELETE SET NULL (primary_contact_id)%',
  'composite foreign keys preserve campaign cascade and contact-only nulling'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname in ('orders_campaign_id_fkey', 'orders_primary_contact_id_fkey')
  ),
  'redundant predecessor single-column foreign keys were replaced atomically'
);

select pg_temp.assert_true(
  (
    select count(*)
    from pg_constraint con
    where con.conrelid = 'public.activity_events'::regclass
      and con.conname in (
        'activity_events_account_id_fkey',
        'activity_events_order_id_fkey'
      )
      and con.contype = 'f'
      and con.convalidated
      and con.condeferrable
      and con.condeferred
      and con.confdeltype = 'n'
      and con.confupdtype = 'a'
      and con.confmatchtype = 's'
  ) = 2,
  'activity-event account and order retained references are validated and initially deferred'
);

do $$
begin
  begin
    update public.orders
    set campaign_id = '22000000-0000-4000-8000-000000000002'
    where id = '23000000-0000-4000-8000-000000000001';
    raise exception 'cross-account campaign mutation unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.orders
    set primary_contact_id = '21000000-0000-4000-8000-000000000002'
    where id = '23000000-0000-4000-8000-000000000001';
    raise exception 'cross-account contact mutation unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.campaigns
    set account_id = '20000000-0000-4000-8000-000000000002'
    where id = '22000000-0000-4000-8000-000000000001';
    raise exception 'referenced campaign reparent unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.contacts
    set account_id = '20000000-0000-4000-8000-000000000002'
    where id = '21000000-0000-4000-8000-000000000001';
    raise exception 'referenced contact reparent unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

savepoint nullable_contact_case;
update public.orders
set primary_contact_id = null
where id = '23000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  exists (
    select 1 from public.orders
    where id = '23000000-0000-4000-8000-000000000001'
      and account_id = '20000000-0000-4000-8000-000000000001'
      and primary_contact_id is null
  ),
  'nullable primary contact preserves the order account'
);
rollback to savepoint nullable_contact_case;

savepoint contact_delete_case;
delete from public.contacts
where id = '21000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  exists (
    select 1 from public.orders
    where id = '23000000-0000-4000-8000-000000000001'
      and account_id = '20000000-0000-4000-8000-000000000001'
      and primary_contact_id is null
  ),
  'contact deletion nulls only primary_contact_id and preserves the order'
);
rollback to savepoint contact_delete_case;

-- Populate every otherwise-empty order/account edge inside the enclosing
-- rollback-only transaction so delete behavior is executable rather than
-- inferred from catalog metadata. Historical payment-era rows are synthetic,
-- never leave this transaction, and do not invoke checkout or webhook code.
insert into public.internal_notes (
  id, account_id, campaign_id, order_id, author_id, body
) values (
  '24000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  'synthetic rollback-only graph deletion edge'
);

insert into public.activity_events (
  id, account_id, order_id, actor_id, event_type, message, metadata_json
) values (
  '24000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000004',
  'synthetic_graph_delete',
  'synthetic rollback-only graph deletion edge',
  '{"fixture":"engagement_graph_delete"}'::jsonb
);

insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status, order_id
) values (
  '24000000-0000-4000-8000-000000000003',
  '{"fixture":"engagement_graph_delete","payment":"disabled"}'::jsonb,
  'delete-edge@ord03.example.invalid',
  9900, 'usd', '2026-08-30', 'pending',
  '23000000-0000-4000-8000-000000000001'
);

insert into public.stripe_events (
  event_id, event_type, checkout_session_id, order_id
) values (
  'evt_synthetic_graph_delete', 'synthetic.inert',
  'cs_synthetic_graph_delete',
  '23000000-0000-4000-8000-000000000001'
);

insert into public.stripe_webhook_receipts (
  event_id, event_type, livemode, checkout_session_id,
  order_id, processing_status
) values (
  'evt_synthetic_graph_delete', 'synthetic.inert', false,
  'cs_synthetic_graph_delete',
  '23000000-0000-4000-8000-000000000001', 'ignored'
);

insert into private.engagement_access_audit_receipts (
  receipt_id, event_code, decision, reason_code, actor_profile_id,
  order_id, resource_type, resource_id, operation_code
) overriding system value values (
  900000000000000001,
  'synthetic_delete_fixture', 'noop', 'cascade_retention_test',
  '00000000-0000-4000-8000-000000000004',
  '23000000-0000-4000-8000-000000000001',
  'engagement', '23000000-0000-4000-8000-000000000001',
  'synthetic_delete_test'
);

insert into public.engagement_work_items (
  id, order_id, item_type, content_json,
  created_by_profile_id, updated_by_profile_id
) values (
  '24000000-0000-4000-8000-000000000011',
  '23000000-0000-4000-8000-000000000002',
  'draft', '{"fixture":"unaffected_tenant"}'::jsonb,
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000006'
);

insert into public.activity_events (
  id, account_id, order_id, actor_id, event_type, message, metadata_json
) values (
  '24000000-0000-4000-8000-000000000012',
  '20000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000006',
  'synthetic_unaffected_tenant', 'synthetic unaffected tenant edge',
  '{"fixture":"unaffected_tenant"}'::jsonb
);

insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status, order_id
) values (
  '24000000-0000-4000-8000-000000000013',
  '{"fixture":"unaffected_tenant","payment":"disabled"}'::jsonb,
  'unaffected-edge@ord03.example.invalid',
  9900, 'usd', '2026-08-30', 'pending',
  '23000000-0000-4000-8000-000000000002'
);

insert into public.stripe_events (
  event_id, event_type, checkout_session_id, order_id
) values (
  'evt_synthetic_unaffected_tenant', 'synthetic.inert',
  'cs_synthetic_unaffected_tenant',
  '23000000-0000-4000-8000-000000000002'
);

insert into public.stripe_webhook_receipts (
  event_id, event_type, livemode, checkout_session_id,
  order_id, processing_status
) values (
  'evt_synthetic_unaffected_tenant', 'synthetic.inert', false,
  'cs_synthetic_unaffected_tenant',
  '23000000-0000-4000-8000-000000000002', 'ignored'
);

select pg_temp.assert_true(
  (select count(*) from public.briefs
   where order_id = '23000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.engagement_assignments
       where order_id = '23000000-0000-4000-8000-000000000001') = 3
  and (select count(*) from public.engagement_work_items
       where order_id = '23000000-0000-4000-8000-000000000001') = 2
  and exists (
    select 1 from private.engagement_access_audit_receipts
    where receipt_id = 900000000000000001
      and order_id = '23000000-0000-4000-8000-000000000001'
  ),
  'target deletion graph has positive brief, assignment, work-item and audit edges'
);

do $$
declare
  v_assignment_id uuid;
begin
  select id into strict v_assignment_id
  from public.engagement_assignments
  where order_id = '23000000-0000-4000-8000-000000000001'
  order by created_at, id
  limit 1;

  begin
    delete from public.engagement_assignments where id = v_assignment_id;
    raise exception 'direct assignment-history delete unexpectedly succeeded';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'Assignment history is append-only' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.engagement_assignments where id = v_assignment_id
  ) then
    raise exception 'direct assignment-history denial did not preserve the row';
  end if;
end;
$$;

savepoint campaign_delete_case;
delete from public.campaigns
where id = '22000000-0000-4000-8000-000000000001';
set constraints activity_events_account_id_fkey, activity_events_order_id_fkey immediate;
select pg_temp.assert_true(
  not exists (
    select 1 from public.orders
    where id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.briefs
    where order_id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.engagement_assignments
    where order_id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.engagement_work_items
    where order_id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.internal_notes
    where id = '24000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1 from public.activity_events
    where id = '24000000-0000-4000-8000-000000000002'
      and account_id = '20000000-0000-4000-8000-000000000001'
      and order_id is null
  )
  and exists (
    select 1 from public.checkout_intents
    where id = '24000000-0000-4000-8000-000000000003'
      and order_id is null
  )
  and exists (
    select 1 from public.stripe_events
    where event_id = 'evt_synthetic_graph_delete'
      and order_id is null
  )
  and exists (
    select 1 from public.stripe_webhook_receipts
    where event_id = 'evt_synthetic_graph_delete'
      and order_id is null
  )
  and exists (
    select 1 from public.accounts
    where id = '20000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1 from public.contacts
    where id = '21000000-0000-4000-8000-000000000001'
  ),
  'campaign deletion cascades dependents, nulls retained references, and preserves account/contact'
);
rollback to savepoint campaign_delete_case;

savepoint account_delete_case;
delete from public.accounts
where id = '20000000-0000-4000-8000-000000000001';
set constraints activity_events_account_id_fkey, activity_events_order_id_fkey immediate;
select pg_temp.assert_true(
  not exists (
    select 1 from public.accounts
    where id = '20000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.campaigns
    where id = '22000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.contacts
    where id = '21000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.orders
    where id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.briefs
    where order_id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.engagement_assignments
    where order_id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.engagement_work_items
    where order_id = '23000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.internal_notes
    where id = '24000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1 from public.activity_events
    where id = '24000000-0000-4000-8000-000000000002'
      and account_id is null and order_id is null
  )
  and exists (
    select 1 from public.checkout_intents
    where id = '24000000-0000-4000-8000-000000000003'
      and order_id is null
  )
  and exists (
    select 1 from public.stripe_events
    where event_id = 'evt_synthetic_graph_delete'
      and order_id is null
  )
  and exists (
    select 1 from public.stripe_webhook_receipts
    where event_id = 'evt_synthetic_graph_delete'
      and order_id is null
  )
  and exists (
    select 1 from private.engagement_access_audit_receipts
    where receipt_id = 900000000000000001
      and event_code = 'synthetic_delete_fixture'
      and order_id = '23000000-0000-4000-8000-000000000001'
      and resource_id = '23000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1 from public.contacts
    where id = '21000000-0000-4000-8000-000000000002'
      and account_id = '20000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.campaigns
    where id = '22000000-0000-4000-8000-000000000002'
      and account_id = '20000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.orders
    where id = '23000000-0000-4000-8000-000000000002'
      and account_id = '20000000-0000-4000-8000-000000000002'
      and campaign_id = '22000000-0000-4000-8000-000000000002'
      and primary_contact_id = '21000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.briefs
    where order_id = '23000000-0000-4000-8000-000000000002'
  )
  and (select count(*) from public.engagement_assignments
       where order_id = '23000000-0000-4000-8000-000000000002') =
      :'other_assignment_count_before'::integer
  and exists (
    select 1 from public.engagement_work_items
    where id = '24000000-0000-4000-8000-000000000011'
      and order_id = '23000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.activity_events
    where id = '24000000-0000-4000-8000-000000000012'
      and account_id = '20000000-0000-4000-8000-000000000002'
      and order_id = '23000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.checkout_intents
    where id = '24000000-0000-4000-8000-000000000013'
      and order_id = '23000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.stripe_events
    where event_id = 'evt_synthetic_unaffected_tenant'
      and order_id = '23000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1 from public.stripe_webhook_receipts
    where event_id = 'evt_synthetic_unaffected_tenant'
      and order_id = '23000000-0000-4000-8000-000000000002'
  ),
  'account deletion cascades its graph, nulls retained references, preserves audit and other tenant'
);
rollback to savepoint account_delete_case;

select pg_temp.assert_true(
  exists (
    select 1
    from public.orders o
    join public.campaigns c
      on c.id = o.campaign_id
     and c.account_id = o.account_id
    join public.contacts ct
      on ct.id = o.primary_contact_id
     and ct.account_id = o.account_id
    where o.id = '23000000-0000-4000-8000-000000000001'
      and o.account_id = '20000000-0000-4000-8000-000000000001'
  ),
  'rejected mutations leave the original engagement graph coherent'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.engagement_assignments
    where order_id = '23000000-0000-4000-8000-000000000001'
      and assignee_profile_id = '00000000-0000-4000-8000-000000000004'
      and assignment_role = 'service_lead'
      and lifecycle_status = 'active'
  ),
  'rejected graph mutations do not revoke the current assignment'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004'
);
set role authenticated;
select * from public.read_service_lead_engagement(
  '23000000-0000-4000-8000-000000000001'
) \gset graph_read_
reset role;

select pg_temp.assert_text(:'graph_read_authorized', 't', 'valid assigned lead still reads engagement');
select pg_temp.assert_text(
  (:'graph_read_engagement_json'::jsonb #>> '{account,id}'),
  '20000000-0000-4000-8000-000000000001',
  'projection account is coherent'
);
select pg_temp.assert_text(
  (:'graph_read_engagement_json'::jsonb #>> '{campaign,id}'),
  '22000000-0000-4000-8000-000000000001',
  'projection campaign is coherent'
);
select pg_temp.assert_text(
  (:'graph_read_engagement_json'::jsonb #>> '{primaryContact,id}'),
  '21000000-0000-4000-8000-000000000001',
  'projection contact is coherent'
);

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.orders', 'select')
    and not has_table_privilege('authenticated', 'public.campaigns', 'select')
    and not has_table_privilege('authenticated', 'public.contacts', 'select')
    and not has_table_privilege('service_role', 'public.orders', 'select'),
  'direct application-role graph access remains denied'
);

select pg_temp.assert_true(
  has_function_privilege(
    'authenticated', 'public.read_service_lead_engagement(uuid)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.read_service_lead_engagement(uuid)', 'execute'
  )
  and not has_function_privilege(
    'service_role', 'public.read_service_lead_engagement(uuid)', 'execute'
  )
  and not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.read_service_lead_engagement(uuid)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'function execute is authenticated-only with no PUBLIC/anon/service-role grant'
);

select pg_temp.assert_true(
  pg_get_functiondef('public.read_service_lead_engagement(uuid)'::regprocedure)
    like '%c.account_id = o.account_id%'
  and pg_get_functiondef('public.read_service_lead_engagement(uuid)'::regprocedure)
    like '%ct.account_id = o.account_id%',
  'service-lead projection retains defense-in-depth account predicates'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004'
);
set role authenticated;
select * from public.read_service_lead_engagement(
  '23000000-0000-4000-8000-000000000002'
) \gset graph_denied_
reset role;
select pg_temp.assert_text(:'graph_denied_authorized', 'f', 'cross-engagement projection remains denied');

select pg_temp.assert_true(
  exists (
    select 1
    from private.engagement_access_audit_receipts
    where receipt_id = :'graph_read_receipt_id'::bigint
      and event_code = 'engagement_access_allowed'
      and decision = 'allowed'
      and actor_profile_id = '00000000-0000-4000-8000-000000000004'
      and order_id = '23000000-0000-4000-8000-000000000001'
      and session_id_hash ~ '^[0-9a-f]{64}$'
  )
  and exists (
    select 1
    from private.engagement_access_audit_receipts
    where receipt_id = :'graph_denied_receipt_id'::bigint
      and event_code = 'engagement_access_denied'
      and decision = 'denied'
      and reason_code = 'service_lead_assignment_required'
      and order_id = '23000000-0000-4000-8000-000000000002'
      and session_id_hash ~ '^[0-9a-f]{64}$'
  ),
  'allowed and denied projection receipts remain metadata-only and session-pseudonymized'
);

rollback;

select pg_temp.assert_text(
  (select count(*)::text from private.engagement_access_audit_receipts),
  :'audit_count_before',
  'acceptance rollback leaves no persistent audit receipt'
);

select 'ENGAGEMENT_GRAPH_INTEGRITY_ACCEPTANCE_PASS' as result;
