\set ON_ERROR_STOP on

-- Disposable-local acceptance for the privacy-safe intake manager queue.
-- Assumes the complete migration chain and the synthetic ORD-03 fixture.
-- Never run against linked, hosted, production, or customer-bearing data.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'Manager queue assertion failed: %', p_label;
  end if;
end;
$$;

create or replace function pg_temp.set_claims(
  p_user_id uuid,
  p_session_id uuid,
  p_aal text
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
      'exp', floor(extract(epoch from clock_timestamp()))::bigint + 3600,
      'role', 'authenticated',
      'aal', p_aal
    )::text,
    false
  );
end;
$$;

select count(*)::text as fixture_queue_count_before
from private.intake_manager_queue
where (intake_kind, intake_id) in (
  ('non_payment', '26000000-0000-4000-8000-000000000001'::uuid),
  ('non_payment', '26000000-0000-4000-8000-000000000002'::uuid),
  ('checkout', '26000000-0000-4000-8000-000000000002'::uuid)
) \gset

begin;

select pg_temp.assert_true(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'intake_manager_queue'
  ) = array[
    'queue_receipt_id',
    'intake_kind',
    'intake_id',
    'queue_state',
    'payment_state',
    'order_id',
    'created_at',
    'updated_at',
    'terms_version'
  ]::text[],
  'queue contains metadata only and no raw brief, email, Stripe payload, or customer secret'
);

select pg_temp.assert_true(
  (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_class c
    where c.oid = 'private.intake_manager_queue'::regclass
  )
  and not has_table_privilege('anon', 'private.intake_manager_queue', 'select')
  and not has_table_privilege('authenticated', 'private.intake_manager_queue', 'select')
  and not has_table_privilege('service_role', 'private.intake_manager_queue', 'select')
  and has_function_privilege(
    'authenticated',
    'public.read_intake_manager_queue(integer,timestamp with time zone,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.read_owner_paid_brief(uuid)', 'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.read_intake_manager_queue(integer,timestamp with time zone,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.read_intake_manager_queue(integer,timestamp with time zone,uuid)',
    'execute'
  ),
  'queue has forced RLS, no direct application-role access, and owner-RPC-only reads'
);

select pg_temp.assert_true(
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid in (
      'public.pending_intakes'::regclass,
      'public.checkout_intents'::regclass
    )
      and t.tgname in (
        'queue_non_payment_intake_for_manager',
        'queue_checkout_intake_for_manager_insert',
        'queue_checkout_intake_for_manager_update'
      )
      and not t.tgisinternal
  ) = 3,
  'all intake queue triggers are installed'
);

-- Build more than one API page. Newest paid/reconciliation work must stay
-- reachable and older history must remain available by deterministic keyset
-- cursor rather than disappearing behind a fixed 50-row ceiling.
insert into public.pending_intakes (
  id,
  brief_json,
  delivery_email,
  status,
  created_at,
  updated_at
)
select
  ('26000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  jsonb_build_object('campaignName', 'Synthetic pagination ' || g),
  'pagination-' || g || '@ord03.example.invalid',
  'pending',
  clock_timestamp() - make_interval(secs => g),
  clock_timestamp() - make_interval(secs => g)
from generate_series(100, 154) as g;

set local role service_role;
select public.begin_stripe_webhook_attempt(
  'evt_test_manager_queue_orphan_refund_0001',
  'charge.refunded',
  false,
  null
);
select public.record_stripe_operational_event(
  'evt_test_manager_queue_orphan_refund_0001',
  'charge.refunded',
  null,
  null,
  'pi_test_manager_queue_orphan_0001',
  'ch_test_manager_queue_orphan_0001',
  null,
  'refund_attention_required'
);
select public.complete_stripe_webhook_attempt(
  'evt_test_manager_queue_orphan_refund_0001',
  'processed',
  null,
  null
);
reset role;

insert into public.pending_intakes (
  id,
  brief_json,
  delivery_email,
  status
) values (
  '26000000-0000-4000-8000-000000000001',
  '{"campaignName":"Synthetic non-payment intake","keyDetails":"Synthetic only"}'::jsonb,
  'synthetic-manager-queue@ord03.example.invalid',
  'pending'
);

insert into public.checkout_intents (
  id,
  brief_json,
  delivery_email,
  amount_cents,
  currency,
  terms_version,
  status
) values (
  '26000000-0000-4000-8000-000000000002',
  '{"campaignName":"Synthetic checkout intake","keyDetails":"Synthetic only"}'::jsonb,
  'synthetic-checkout-queue@ord03.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'pending'
);

-- A UUID collision between the two intake namespaces must not project a
-- Checkout reconciliation alert onto an unrelated non-payment queue row.
insert into public.pending_intakes (
  id,
  brief_json,
  delivery_email,
  status
) values (
  '26000000-0000-4000-8000-000000000002',
  '{"campaignName":"Synthetic colliding non-payment intake","keyDetails":"Synthetic only"}'::jsonb,
  'synthetic-collision-queue@ord03.example.invalid',
  'pending'
);

select pg_temp.assert_true(
  exists (
    select 1
    from private.intake_manager_queue q
    where q.intake_kind = 'non_payment'
      and q.intake_id = '26000000-0000-4000-8000-000000000001'
      and q.queue_state = 'received'
      and q.payment_state = 'not_applicable'
      and q.order_id is null
  )
  and exists (
    select 1
    from private.intake_manager_queue q
    where q.intake_kind = 'checkout'
      and q.intake_id = '26000000-0000-4000-8000-000000000002'
      and q.queue_state = 'awaiting_payment'
      and q.payment_state = 'pending'
      and q.terms_version = '2026-08-30'
      and q.order_id is null
  ),
  'validated server inserts atomically create metadata-only manager receipts'
);

update public.checkout_intents
set status = 'paid',
    order_id = '23000000-0000-4000-8000-000000000001',
    updated_at = clock_timestamp()
where id = '26000000-0000-4000-8000-000000000002';

update public.orders
set payment_status = 'paid',
    stripe_checkout_session_id = 'cs_test_manager_queue_paid_0001',
    stripe_payment_intent_id = 'pi_test_manager_queue_paid_0001',
    paid_at = clock_timestamp()
where id = '23000000-0000-4000-8000-000000000001';

select pg_temp.assert_true(
  exists (
    select 1
    from private.intake_manager_queue q
    where q.intake_kind = 'checkout'
      and q.intake_id = '26000000-0000-4000-8000-000000000002'
      and q.queue_state = 'paid_ready'
      and q.payment_state = 'paid'
      and q.order_id = '23000000-0000-4000-8000-000000000001'
  ),
  'durable paid-intent transition updates the operational queue in the same transaction'
);

select count(*)::text as access_receipts_before
from private.intake_manager_queue_access_receipts \gset

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal1'
);
set local role authenticated;
do $$
begin
  perform * from public.read_intake_manager_queue(10);
  raise exception 'AAL1 owner manager queue read unexpectedly succeeded';
exception
  when insufficient_privilege then null;
end;
$$;

do $$
begin
  perform * from public.read_owner_paid_brief(
    '26000000-0000-4000-8000-000000000002'
  );
  raise exception 'AAL1 owner paid brief read unexpectedly succeeded';
exception
  when insufficient_privilege then null;
end;
$$;
reset role;

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
select count(*)::text as owner_queue_count
from public.read_intake_manager_queue(100)
where (intake_kind, intake_id) in (
  ('non_payment', '26000000-0000-4000-8000-000000000001'::uuid),
  ('checkout', '26000000-0000-4000-8000-000000000002'::uuid)
) \gset
reset role;

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
with first_page as materialized (
  select * from public.read_intake_manager_queue(50)
), page_cursor as (
  select updated_at, queue_receipt_id
  from first_page
  order by updated_at, queue_receipt_id
  limit 1
), second_page as materialized (
  select q.*
  from page_cursor c
  cross join lateral public.read_intake_manager_queue(
    50, c.updated_at, c.queue_receipt_id
  ) q
)
select
  (select count(*) from first_page)::text as first_count,
  (select count(*) from second_page)::text as second_count,
  (select count(*) from first_page f join second_page s using (queue_receipt_id))::text
    as overlap_count,
  (select count(*) from first_page
    where intake_kind = 'reconciliation_alert'
      and latest_alert_code = 'refund_attention_required')::text as orphan_visible
\gset pagination_
reset role;

select pg_temp.assert_true(
  :'pagination_first_count'::integer = 50
  and :'pagination_second_count'::integer > 0
  and :'pagination_overlap_count'::integer = 0
  and :'pagination_orphan_visible'::integer = 1,
  'newest global alert is visible and every older item remains reachable by non-overlapping keyset page'
);

select pg_temp.assert_true(
  :'owner_queue_count'::integer = 2
  and (
    select count(*)
    from private.intake_manager_queue_access_receipts
  ) = :'access_receipts_before'::integer + 3,
  'active owner reads receipt metadata and produces an access audit'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
select checkout_intent_id, order_id, delivery_email, payment_status,
  reconciliation_status, brief_json ->> 'campaignName' as campaign_name
from public.read_owner_paid_brief(
  '26000000-0000-4000-8000-000000000002'
) \gset paid_brief_
reset role;

select pg_temp.assert_true(
  :'paid_brief_checkout_intent_id'::uuid = '26000000-0000-4000-8000-000000000002'::uuid
  and :'paid_brief_order_id'::uuid = '23000000-0000-4000-8000-000000000001'::uuid
  and :'paid_brief_delivery_email' = 'synthetic-checkout-queue@ord03.example.invalid'
  and :'paid_brief_payment_status' = 'paid'
  and :'paid_brief_reconciliation_status' = 'clear'
  and :'paid_brief_campaign_name' = 'Synthetic checkout intake'
  and exists (
    select 1 from private.owner_paid_brief_access_receipts
    where checkout_intent_id = '26000000-0000-4000-8000-000000000002'
  ),
  'AAL2 owner retrieves full paid brief, assignment state, and reconciliation status with an access receipt'
);

insert into private.payment_reconciliation_alerts (
  event_id,
  event_type,
  alert_code,
  checkout_intent_id
) values (
  'evt_test_manager_queue_collision_0001',
  'checkout.session.expired',
  'checkout_expired_attention_required',
  '26000000-0000-4000-8000-000000000002'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'aal2'
);
set local role authenticated;
select
  count(*) filter (
    where intake_kind = 'non_payment'
      and reconciliation_status = 'clear'
      and latest_alert_code is null
  )::text as non_payment_clear,
  count(*) filter (
    where intake_kind = 'checkout'
      and reconciliation_status = 'attention_required'
      and latest_alert_code = 'checkout_expired_attention_required'
  )::text as checkout_attention
from public.read_intake_manager_queue(100)
where intake_id = '26000000-0000-4000-8000-000000000002' \gset collision_
reset role;

select pg_temp.assert_true(
  :'collision_non_payment_clear'::integer = 1
  and :'collision_checkout_attention'::integer = 1,
  'same UUID across intake namespaces keeps Checkout reconciliation metadata scoped to Checkout'
);

select pg_temp.set_claims(
  '00000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',
  'aal2'
);
set local role authenticated;
do $$
begin
  perform * from public.read_intake_manager_queue(10);
  raise exception 'non-owner manager queue read unexpectedly succeeded';
exception
  when insufficient_privilege then null;
end;
$$;

do $$
begin
  perform * from public.read_owner_paid_brief(
    '26000000-0000-4000-8000-000000000002'
  );
  raise exception 'AAL2 non-owner paid brief read unexpectedly succeeded';
exception
  when insufficient_privilege then null;
end;
$$;
reset role;

rollback;

select pg_temp.assert_true(
  not exists (
    select 1 from public.pending_intakes
    where id = '26000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.checkout_intents
    where id = '26000000-0000-4000-8000-000000000002'
  )
  and (
    select count(*)
    from private.intake_manager_queue
    where (intake_kind, intake_id) in (
      ('non_payment', '26000000-0000-4000-8000-000000000001'::uuid),
      ('non_payment', '26000000-0000-4000-8000-000000000002'::uuid),
      ('checkout', '26000000-0000-4000-8000-000000000002'::uuid)
    )
  ) = :'fixture_queue_count_before'::integer,
  'rollback restores the exact pre-run intake and queue state'
);

select 'INTAKE_MANAGER_QUEUE_ACCEPTANCE_PASS' as result;
