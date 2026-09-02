\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_value boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_value, false) then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

delete from public.stripe_webhook_receipts where event_id like 'evt_sprint03_%';
delete from public.stripe_events where event_id like 'evt_sprint03_%';
delete from private.payment_reconciliation_alerts where event_id like 'evt_sprint03_%';
delete from public.checkout_intents where id::text like '53000000-0000-4000-8000-%';
delete from public.accounts where source = 'stripe_checkout' and name like 'Sprint03 Synthetic %';

set local role service_role;

do $fixture$
declare
  n integer;
  v_intent_id uuid;
  v_session_id text;
  v_expiry timestamptz;
begin
  for n in 1..15 loop
    v_intent_id := ('53000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    v_session_id := 'cs_test_sprint03_' || lpad(n::text, 3, '0');
    insert into public.checkout_intents (
      id, brief_json, delivery_email, amount_cents, currency, terms_version, status
    ) values (
      v_intent_id,
      jsonb_build_object(
        'organizationType', 'Small business',
        'campaignFamily', 'Offer / Promotion campaign',
        'primaryAction', 'Buy',
        'organizationName', 'Sprint03 Synthetic ' || n,
        'campaignName', 'Sprint03 Campaign ' || n,
        'campaignType', 'Product launch',
        'campaignTypeOther', '',
        'dateTime', '2099-09-02T12:00:00Z',
        'locationOrLink', 'https://sprint03-' || n || '.example.invalid',
        'audience', 'Synthetic audience ' || n,
        'mainGoal', 'Payment state-machine proof',
        'offerAsk', 'Buy',
        'keyDetails', 'Synthetic facts only',
        'tone', 'Professional',
        'toneOther', '',
        'channels', jsonb_build_array('Email'),
        'websiteSocial', '',
        'phrasesInclude', '',
        'phrasesAvoid', '',
        'deliveryEmail', 'sprint03-' || n || '@example.invalid',
        'additionalNotes', 'No customer data'
      ),
      'sprint03-' || n || '@example.invalid', 9900, 'usd', '2026-08-30', 'pending'
    );
    v_expiry := clock_timestamp() + interval '60 minutes';
    perform public.reserve_stripe_checkout_capacity(
      v_intent_id, v_expiry, v_expiry + interval '5 minutes'
    );
    perform public.bind_stripe_checkout_capacity(v_intent_id, v_session_id, v_expiry);
  end loop;
end;
$fixture$;

-- Ten independent customers reach paid through the sole atomic RPC.
do $paid$
declare
  n integer;
  v_result record;
begin
  for n in 1..10 loop
    select * into v_result from public.process_stripe_payment_event(
      'evt_sprint03_paid_' || lpad(n::text, 3, '0'),
      'checkout.session.completed', false,
      'cs_test_sprint03_' || lpad(n::text, 3, '0'),
      ('53000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'pi_test_sprint03_' || lpad(n::text, 3, '0'),
      'cus_test_sprint03_' || lpad(n::text, 3, '0'),
      null, null, 9900, null, 'usd',
      'sprint03-' || n || '@example.invalid', 'paid', clock_timestamp(), false
    );
    if v_result.processing_status <> 'processed'
      or v_result.transition_code <> 'checkout_paid'
      or v_result.order_id is null
    then
      raise exception 'paid transition % failed: %', n, row_to_json(v_result);
    end if;
  end loop;
end;
$paid$;

reset role;

-- Exact duplicate x5 is one effective transition and one graph.
select * from public.process_stripe_payment_event(
  'evt_sprint03_paid_001', 'checkout.session.completed', false,
  'cs_test_sprint03_001', '53000000-0000-4000-8000-000000000001',
  'pi_test_sprint03_001', 'cus_test_sprint03_001', null, null,
  9900, null, 'usd', 'sprint03-1@example.invalid', 'paid', clock_timestamp(), false
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_paid_001', 'checkout.session.completed', false,
  'cs_test_sprint03_001', '53000000-0000-4000-8000-000000000001',
  'pi_test_sprint03_001', 'cus_test_sprint03_001', null, null,
  9900, null, 'usd', 'sprint03-1@example.invalid', 'paid', clock_timestamp(), false
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_paid_001', 'checkout.session.completed', false,
  'cs_test_sprint03_001', '53000000-0000-4000-8000-000000000001',
  'pi_test_sprint03_001', 'cus_test_sprint03_001', null, null,
  9900, null, 'usd', 'sprint03-1@example.invalid', 'paid', clock_timestamp(), false
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_paid_001', 'checkout.session.completed', false,
  'cs_test_sprint03_001', '53000000-0000-4000-8000-000000000001',
  'pi_test_sprint03_001', 'cus_test_sprint03_001', null, null,
  9900, null, 'usd', 'sprint03-1@example.invalid', 'paid', clock_timestamp(), false
);

select pg_temp.assert_true(
  (select attempt_count = 5 and processing_status = 'processed'
   from public.stripe_webhook_receipts where event_id = 'evt_sprint03_paid_001'),
  'same event x5 must preserve one processed transition'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.orders
   where stripe_checkout_session_id = 'cs_test_sprint03_001'),
  'same Session must create one order'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_001'),
  'same PaymentIntent must bind one order'
);

-- Business mutation failure rolls back completely; the same event retries once.
select * from public.process_stripe_payment_event(
  'evt_sprint03_retry_011', 'checkout.session.completed', false,
  'cs_test_sprint03_011', '53000000-0000-4000-8000-000000000011',
  'pi_test_sprint03_011', 'cus_test_sprint03_011', null, null,
  9900, null, 'usd', 'sprint03-11@example.invalid', 'paid', clock_timestamp(), true
);
select pg_temp.assert_true(
  (select processing_status = 'failed_retryable'
   from public.stripe_webhook_receipts where event_id = 'evt_sprint03_retry_011'),
  'synthetic failure must persist retryable receipt'
);
select pg_temp.assert_true(
  not exists (select 1 from public.orders where stripe_checkout_session_id = 'cs_test_sprint03_011'),
  'failed transaction must roll back order graph'
);
select pg_temp.assert_true(
  (select status = 'checkout_created' and order_id is null
   from public.checkout_intents where id = '53000000-0000-4000-8000-000000000011'),
  'failed transaction must roll back intent payment state'
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_retry_011', 'checkout.session.completed', false,
  'cs_test_sprint03_011', '53000000-0000-4000-8000-000000000011',
  'pi_test_sprint03_011', 'cus_test_sprint03_011', null, null,
  9900, null, 'usd', 'sprint03-11@example.invalid', 'paid', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select processing_status = 'processed' and attempt_count = 2 and order_id is not null
   from public.stripe_webhook_receipts where event_id = 'evt_sprint03_retry_011'),
  'retry must complete exactly once'
);

-- Expiry/failure is recoverable only for the same exact binding; authoritative
-- later success may reactivate that binding without touching another intent.
select * from public.process_stripe_payment_event(
  'evt_sprint03_expired_012', 'checkout.session.expired', false,
  'cs_test_sprint03_012', '53000000-0000-4000-8000-000000000012',
  null, null, null, null, 9900, null, 'usd', null, 'unpaid', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select status = 'expired' from public.checkout_intents
   where id = '53000000-0000-4000-8000-000000000012'),
  'expiration must close only its exact unpaid intent'
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_late_paid_012', 'checkout.session.async_payment_succeeded', false,
  'cs_test_sprint03_012', '53000000-0000-4000-8000-000000000012',
  'pi_test_sprint03_012', 'cus_test_sprint03_012', null, null,
  9900, null, 'usd', 'sprint03-12@example.invalid', 'paid', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select status = 'paid' and order_id is not null from public.checkout_intents
   where id = '53000000-0000-4000-8000-000000000012'),
  'later authoritative success must reactivate exact recoverable binding'
);

select * from public.process_stripe_payment_event(
  'evt_sprint03_failed_013', 'checkout.session.async_payment_failed', false,
  'cs_test_sprint03_013', '53000000-0000-4000-8000-000000000013',
  null, null, null, null, 9900, null, 'usd', null, 'unpaid', clock_timestamp(), false
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_paid_014', 'checkout.session.completed', false,
  'cs_test_sprint03_014', '53000000-0000-4000-8000-000000000014',
  'pi_test_sprint03_014', 'cus_test_sprint03_014', null, null,
  9900, null, 'usd', 'sprint03-14@example.invalid', 'paid', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select status = 'expired' from public.checkout_intents
   where id = '53000000-0000-4000-8000-000000000013')
  and (select status = 'paid' from public.checkout_intents
   where id = '53000000-0000-4000-8000-000000000014'),
  'one customer failure must not block another success'
);

-- Full versus partial refund and dispute outcomes preserve the order graph.
select * from public.process_stripe_payment_event(
  'evt_sprint03_refund_001', 'charge.refunded', false,
  null, null, 'pi_test_sprint03_001', 'cus_test_sprint03_001',
  'ch_test_sprint03_001', null, 9900, 9900, 'usd', null,
  'full_refund', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select payment_status = 'refunded' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_001'),
  'full refund must preserve graph and mark refunded'
);

select * from public.process_stripe_payment_event(
  'evt_sprint03_partial_002', 'charge.refunded', false,
  null, null, 'pi_test_sprint03_002', 'cus_test_sprint03_002',
  'ch_test_sprint03_002', null, 9900, 1000, 'usd', null,
  'partial_refund', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select payment_status = 'paid' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_002'),
  'unsupported partial refund must not silently rewrite payment truth'
);

select * from public.process_stripe_payment_event(
  'evt_sprint03_dispute_open_003', 'charge.dispute.created', false,
  null, null, 'pi_test_sprint03_003', null, 'ch_test_sprint03_003',
  'dp_test_sprint03_003', 9900, null, 'usd', null,
  'needs_response', clock_timestamp(), false
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_dispute_won_003', 'charge.dispute.closed', false,
  null, null, 'pi_test_sprint03_003', null, 'ch_test_sprint03_003',
  'dp_test_sprint03_003', 9900, null, 'usd', null,
  'won', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select payment_status = 'paid' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_003'),
  'won dispute must restore only disputed order to paid'
);

select * from public.process_stripe_payment_event(
  'evt_sprint03_dispute_open_004', 'charge.dispute.created', false,
  null, null, 'pi_test_sprint03_004', null, 'ch_test_sprint03_004',
  'dp_test_sprint03_004', 9900, null, 'usd', null,
  'needs_response', clock_timestamp(), false
);
select * from public.process_stripe_payment_event(
  'evt_sprint03_dispute_lost_004', 'charge.dispute.closed', false,
  null, null, 'pi_test_sprint03_004', null, 'ch_test_sprint03_004',
  'dp_test_sprint03_004', 9900, null, 'usd', null,
  'lost', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select payment_status = 'dispute_lost' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_004'),
  'lost dispute must become terminal without deleting evidence'
);

-- Late unpaid terminal event after paid is classified stale, never regressive.
select * from public.process_stripe_payment_event(
  'evt_sprint03_stale_expiry_005', 'checkout.session.expired', false,
  'cs_test_sprint03_005', '53000000-0000-4000-8000-000000000005',
  'pi_test_sprint03_005', 'cus_test_sprint03_005', null, null,
  9900, null, 'usd', null, 'unpaid', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select status = 'paid' from public.checkout_intents
   where id = '53000000-0000-4000-8000-000000000005'),
  'late terminal event must not regress paid intent'
);

-- Cross-customer provider substitution fails retryably with no mutation.
select * from public.process_stripe_payment_event(
  'evt_sprint03_cross_customer', 'charge.refunded', false,
  null, null, 'pi_test_sprint03_006', 'cus_test_sprint03_007',
  'ch_test_cross_customer', null, 9900, 9900, 'usd', null,
  'full_refund', clock_timestamp(), false
);
select pg_temp.assert_true(
  (select processing_status = 'failed_retryable' from public.stripe_webhook_receipts
   where event_id = 'evt_sprint03_cross_customer')
  and (select payment_status = 'paid' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_006'),
  'cross-customer provider binding substitution must have no business effect'
);

-- Fulfillment authorization is live, order-scoped, atomic, and idempotent.
select id::text as fulfillment_order_a
from public.orders
where stripe_payment_intent_id = 'pi_test_sprint03_006'
\gset

insert into auth.sessions (id, user_id, not_after)
values (
  '53000000-0000-4000-8000-200000000001',
  '00000000-0000-4000-8000-000000000001',
  clock_timestamp() + interval '1 hour'
)
on conflict (id) do update set not_after = excluded.not_after;

reset role;
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2","session_id":"53000000-0000-4000-8000-200000000001","exp":1999999999}';
set local role authenticated;

select public.transition_order_fulfillment(
  :'fulfillment_order_a'::uuid,
  'fulfillment.started', 'new_intake', '53000000-0000-4000-8000-100000000001'
);
select public.transition_order_fulfillment(
  :'fulfillment_order_a'::uuid,
  'fulfillment.completed', 'drafting', '53000000-0000-4000-8000-100000000002'
);
select public.transition_order_fulfillment(
  :'fulfillment_order_a'::uuid,
  'order.closed', 'delivered', '53000000-0000-4000-8000-100000000003'
);
select public.transition_order_fulfillment(
  :'fulfillment_order_a'::uuid,
  'order.closed', 'delivered', '53000000-0000-4000-8000-100000000003'
);

reset role;
select pg_temp.assert_true(
  (select status = 'closed' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_006')
  and (select status = 'new_intake' from public.orders
   where stripe_payment_intent_id = 'pi_test_sprint03_007')
  and (select count(*) = 1 from private.order_fulfillment_idempotency
   where idempotency_key = '53000000-0000-4000-8000-100000000003'),
  'closing order A must be idempotent and never affect order B'
);

-- Row-level transaction invariants and manager queue state coverage.
select pg_temp.assert_true(
  not exists (
    select 1 from public.stripe_webhook_receipts r
    join public.orders o on o.id = r.order_id
    where r.processing_status = 'processed'
      and r.transition_code = 'checkout_paid'
      and o.payment_status = 'unpaid'
  ),
  'processed paid receipt must never reference unpaid order'
);
select pg_temp.assert_true(
  not exists (
    select 1 from private.intake_manager_queue q
    left join public.orders o on o.id = q.order_id
    where q.queue_state = 'paid_ready'
      and (o.id is null or o.payment_status <> 'paid')
  ),
  'paid-ready queue must always reference a paid order'
);
select pg_temp.assert_true(
  (select count(distinct order_id) = 13 from public.checkout_intents
   where id::text like '53000000-0000-4000-8000-%' and order_id is not null),
  'mixed corpus must preserve thirteen independent paid graphs'
);
select pg_temp.assert_true(
  (select count(distinct o.account_id) = 13
   from public.checkout_intents i
   join public.orders o on o.id = i.order_id
   where i.id::text like '53000000-0000-4000-8000-%'),
  'customer graphs must remain isolated by account'
);
select pg_temp.assert_true(
  (select count(*) >= 6 from (
    select distinct queue_state from private.intake_manager_queue
    where intake_kind = 'checkout'
      and intake_id::text like '53000000-0000-4000-8000-%'
  ) states),
  'manager queue must represent mixed payment and fulfillment outcomes'
);

-- SECURITY DEFINER and grant boundary: only the unified server RPC may mutate
-- payment state; browser roles retain no sensitive table access.
select pg_temp.assert_true(
  has_function_privilege('service_role',
    'public.process_stripe_payment_event(text,text,boolean,text,uuid,text,text,text,text,integer,integer,text,text,text,timestamptz,boolean)',
    'execute'),
  'service role must execute only unified payment RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('service_role',
    'public.finalize_stripe_checkout(text,text,text,text,uuid,integer,text,text,timestamptz)',
    'execute'),
  'service role must not bypass atomic event transaction'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.stripe_webhook_receipts', 'select')
  and not has_table_privilege('authenticated', 'public.stripe_webhook_receipts', 'insert')
  and not has_table_privilege('service_role', 'private.payment_reconciliation_alerts', 'select'),
  'sensitive payment tables must remain least privilege'
);
select pg_temp.assert_true(
  (select proconfig = array['search_path=""']
   from pg_proc where oid =
     'public.process_stripe_payment_event(text,text,boolean,text,uuid,text,text,text,text,integer,integer,text,text,text,timestamptz,boolean)'::regprocedure),
  'unified SECURITY DEFINER must pin empty search_path'
);

rollback;

\echo 'SN Sprint 03 payment state-machine acceptance PASS'
