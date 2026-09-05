\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(
  p_value boolean,
  p_label text
)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'owner expiry reconciliation assertion failed: %', p_label;
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
      'role', 'authenticated',
      'aal', p_aal,
      'exp', floor(extract(epoch from clock_timestamp()))::bigint + 3600
    )::text,
    false
  );
end;
$$;

begin;

insert into auth.users (
  id, aud, role, email,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '74500000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'owner-expiry@example.invalid',
  '{}'::jsonb,
  '{"full_name":"Synthetic Expiry Owner"}'::jsonb,
  now(), now(), false, false
);

select pg_temp.assert_true(
  exists (
    select 1 from public.profiles
    where id = '74500000-0000-4000-8000-000000000001'
  ),
  'Auth user creates profile'
);

update public.profiles
set role = 'owner',
    active = true,
    updated_at = clock_timestamp()
where id = '74500000-0000-4000-8000-000000000001';

insert into auth.sessions (
  id, user_id, created_at, updated_at, refreshed_at, not_after
) values (
  '74400000-0000-4000-8000-000000000001',
  '74500000-0000-4000-8000-000000000001',
  now(), now(), now(), now() + interval '1 day'
);

select pg_temp.set_claims(
  '74500000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000001',
  'aal2'
);

select open_reconciliation_alerts::text as open_count,
       is_healthy::text as healthy
from public.payment_operations_health()
\gset baseline_

insert into public.checkout_intents (
  id, brief_json, delivery_email,
  amount_cents, currency, terms_version, status
) values
(
  '74000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Synthetic Expiry Organization One',
    'campaignName', 'Synthetic Expiry Campaign One',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-09-04T12:00:00Z',
    'locationOrLink', 'https://expiry-one.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise owner expiry reconciliation',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'expiry-one@example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'expiry-one@example.invalid',
  9900, 'usd', '2026-09-04', 'pending'
),
(
  '74000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Synthetic Expiry Organization Two',
    'campaignName', 'Synthetic Expiry Campaign Two',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-09-04T12:00:00Z',
    'locationOrLink', 'https://expiry-two.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise owner expiry reconciliation',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'expiry-two@example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'expiry-two@example.invalid',
  9900, 'usd', '2026-09-04', 'pending'
);

set local role service_role;

select stripe_session_expires_at::text as expiry_at
from public.reserve_stripe_checkout_capacity(
  '74000000-0000-4000-8000-000000000001',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
)
\gset expiry_

select public.bind_stripe_checkout_capacity(
  '74000000-0000-4000-8000-000000000001',
  'cs_test_owner_expiry_accept_001',
  :'expiry_expiry_at'::timestamptz
);

select processing_status, transition_code
from public.process_stripe_payment_event(
  'evt_owner_expiry_accept_001',
  'checkout.session.expired',
  false,
  'cs_test_owner_expiry_accept_001',
  '74000000-0000-4000-8000-000000000001',
  null,
  null,
  null,
  null,
  9900,
  null,
  'usd',
  null,
  'expired',
  clock_timestamp(),
  false
)
\gset event_

reset role;

select pg_temp.assert_true(
  :'event_processing_status' = 'processed',
  'expiry webhook processed'
);
select pg_temp.assert_true(
  :'event_transition_code' = 'checkout_recoverable_failure',
  'expiry classified as recoverable failure'
);

update private.payment_reconciliation_alerts
set alert_id = '74700000-0000-4000-8000-000000000001'
where event_id = 'evt_owner_expiry_accept_001'
  and alert_code = 'checkout_expired_attention_required';

select pg_temp.assert_true(
  exists (
    select 1
    from public.checkout_intents
    where id = '74000000-0000-4000-8000-000000000001'
      and status = 'expired'
      and order_id is null
  ),
  'intent is expired and unpaid'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.stripe_checkout_reservations
    where intent_id = '74000000-0000-4000-8000-000000000001'
      and checkout_session_id = 'cs_test_owner_expiry_accept_001'
      and reservation_state = 'released'
      and released_reason = 'checkout.session.expired'
      and order_id is null
  ),
  'matching reservation released'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.stripe_webhook_receipts
    where event_id = 'evt_owner_expiry_accept_001'
      and checkout_intent_id =
        '74000000-0000-4000-8000-000000000001'
      and checkout_session_id = 'cs_test_owner_expiry_accept_001'
      and processing_status = 'processed'
      and transition_code = 'checkout_recoverable_failure'
      and completed_at is not null
      and order_id is null
  ),
  'processed receipt exact binding'
);

\echo EXPIRY_BASE_GRAPH=PASS

select pg_temp.set_claims(
  '74500000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000001',
  'aal1'
);

set local role authenticated;

do $aal1$
begin
  begin
    perform * from public.read_owner_reconciliation_alerts(50);
    raise exception 'AAL1 alert read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.resolve_owner_expired_checkout_alert(
      '74700000-0000-4000-8000-000000000001'::uuid,
      1,
      '74600000-0000-4000-8000-000000000001'
    );
    raise exception 'AAL1 resolution unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$aal1$;

reset role;

\echo AAL1_READ_DENIED=PASS
\echo AAL1_RESOLUTION_DENIED=PASS

select pg_temp.set_claims(
  '74500000-0000-4000-8000-000000000001',
  '74400000-0000-4000-8000-000000000001',
  'aal2'
);

select can_resolve_expiry::text as can_resolve,
       occurrence_count::text as occurrence_count
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset initial_

select pg_temp.assert_true(
  :'initial_can_resolve' = 'true' or :'initial_can_resolve' = 't',
  'valid expiry is owner-resolvable'
);
select pg_temp.assert_true(
  :'initial_occurrence_count' = '1',
  'initial occurrence count is one'
);

select open_reconciliation_alerts::text as open_count,
       is_healthy::text as healthy
from public.payment_operations_health()
\gset health_before_

select pg_temp.assert_true(
  :'health_before_open_count'::bigint
    = :'baseline_open_count'::bigint + 1,
  'health counts exactly one harness open alert above baseline'
);
select pg_temp.assert_true(
  :'health_before_healthy' = 'false'
    or :'health_before_healthy' = 'f',
  'health is false while alert is open'
);

\echo OWNER_AAL2_METADATA_READ=PASS
\echo OPEN_ALERT_MAKES_HEALTH_FALSE=PASS

savepoint wrong_intent;
update public.stripe_webhook_receipts
set checkout_intent_id =
  '74000000-0000-4000-8000-000000000002'
where event_id = 'evt_owner_expiry_accept_001';

select can_resolve_expiry::text as value
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset wrong_intent_

select pg_temp.assert_true(
  :'wrong_intent_value' = 'false' or :'wrong_intent_value' = 'f',
  'wrong receipt intent denied'
);
rollback to wrong_intent;

\echo EXPIRY_RECEIPT_WRONG_INTENT_DENIED=PASS

savepoint wrong_session;
update public.stripe_webhook_receipts
set checkout_session_id = 'cs_test_owner_expiry_accept_wrong'
where event_id = 'evt_owner_expiry_accept_001';

select can_resolve_expiry::text as value
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset wrong_session_

select pg_temp.assert_true(
  :'wrong_session_value' = 'false' or :'wrong_session_value' = 'f',
  'wrong receipt session denied'
);
rollback to wrong_session;

\echo EXPIRY_RECEIPT_WRONG_SESSION_DENIED=PASS

savepoint wrong_transition;
update public.stripe_webhook_receipts
set transition_code = 'retry_required'
where event_id = 'evt_owner_expiry_accept_001';

select can_resolve_expiry::text as value
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset wrong_transition_

select pg_temp.assert_true(
  :'wrong_transition_value' = 'false'
    or :'wrong_transition_value' = 'f',
  'wrong transition denied'
);
rollback to wrong_transition;

\echo EXPIRY_RECEIPT_WRONG_TRANSITION_DENIED=PASS

savepoint incomplete_receipt;
update public.stripe_webhook_receipts
set completed_at = null
where event_id = 'evt_owner_expiry_accept_001';

select can_resolve_expiry::text as value
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset incomplete_

select pg_temp.assert_true(
  :'incomplete_value' = 'false' or :'incomplete_value' = 'f',
  'incomplete receipt denied'
);
rollback to incomplete_receipt;

\echo EXPIRY_RECEIPT_INCOMPLETE_DENIED=PASS

savepoint payment_mismatch;
update private.payment_reconciliation_alerts
set payment_intent_id = 'pi_test_owner_expiry_mismatch'
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid;

select can_resolve_expiry::text as value
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset payment_mismatch_

select pg_temp.assert_true(
  :'payment_mismatch_value' = 'false'
    or :'payment_mismatch_value' = 'f',
  'payment intent mismatch denied'
);
rollback to payment_mismatch;

\echo PAYMENT_INTENT_MISMATCH_DENIED=PASS

insert into public.accounts (
  id, name, status, source
) values (
  '74300000-0000-4000-8000-000000000001',
  'Synthetic expiry linkage account',
  'active',
  'synthetic_fixture'
);

insert into public.campaigns (
  id, account_id, name, status
) values (
  '74200000-0000-4000-8000-000000000001',
  '74300000-0000-4000-8000-000000000001',
  'Synthetic expiry linkage campaign',
  'active'
);

insert into public.orders (
  id, campaign_id, account_id,
  package_type, price_cents, status,
  payment_status, currency
) values (
  '74100000-0000-4000-8000-000000000001',
  '74200000-0000-4000-8000-000000000001',
  '74300000-0000-4000-8000-000000000001',
  'standard_99',
  9900,
  'new_intake',
  'unpaid',
  'usd'
);

savepoint order_link;
update private.payment_reconciliation_alerts
set order_id = '74100000-0000-4000-8000-000000000001'
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid;

select can_resolve_expiry::text as value
from public.read_owner_reconciliation_alerts(50)
where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
\gset order_link_

select pg_temp.assert_true(
  :'order_link_value' = 'false' or :'order_link_value' = 'f',
  'order-linked alert denied'
);
rollback to order_link;

\echo EXPIRY_RECEIPT_ORDER_LINK_DENIED=PASS

set local role authenticated;

do $stale_occurrence$
begin
  begin
    perform public.resolve_owner_expired_checkout_alert(
      '74700000-0000-4000-8000-000000000001'::uuid,
      2,
      '74600000-0000-4000-8000-000000000002'
    );
    raise exception 'stale occurrence unexpectedly resolved';
  exception when serialization_failure then null;
  end;
end;
$stale_occurrence$;

reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from private.payment_reconciliation_alerts
    where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
      and alert_state = 'open'
  ),
  'stale occurrence leaves alert open'
);

\echo EXPECTED_OCCURRENCE_RACE_DENIED=PASS

savepoint rollback_rehearsal;

set local role authenticated;
select public.resolve_owner_expired_checkout_alert(
  '74700000-0000-4000-8000-000000000001'::uuid,
  1,
  '74600000-0000-4000-8000-000000000003'
);
reset role;

rollback to rollback_rehearsal;

select pg_temp.assert_true(
  exists (
    select 1
    from private.payment_reconciliation_alerts
    where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
      and alert_state = 'open'
  )
  and not exists (
    select 1
    from private.payment_alert_resolution_receipts
    where idempotency_key =
      '74600000-0000-4000-8000-000000000003'
  ),
  'transaction rollback restores open alert and removes receipt'
);

\echo ROLLBACK_RECOVERY=PASS

create temporary table pg_temp.payment_truth_before as
select
  i.status as intent_status,
  i.order_id as intent_order_id,
  i.stripe_checkout_session_id as intent_session,
  r.reservation_state,
  r.released_reason,
  r.order_id as reservation_order_id,
  w.processing_status,
  w.transition_code,
  w.order_id as receipt_order_id,
  w.payment_intent_id as receipt_payment_intent_id
from public.checkout_intents i
join public.stripe_checkout_reservations r
  on r.intent_id = i.id
join public.stripe_webhook_receipts w
  on w.checkout_intent_id = i.id
where i.id = '74000000-0000-4000-8000-000000000001'
  and w.event_id = 'evt_owner_expiry_accept_001';

set local role authenticated;

select public.resolve_owner_expired_checkout_alert(
  '74700000-0000-4000-8000-000000000001'::uuid,
  1,
  '74600000-0000-4000-8000-000000000004'
) as resolution
\gset resolved_

select public.resolve_owner_expired_checkout_alert(
  '74700000-0000-4000-8000-000000000001'::uuid,
  1,
  '74600000-0000-4000-8000-000000000004'
) as replay_resolution
\gset replay_

reset role;

select pg_temp.assert_true(
  :'resolved_resolution' = 'resolved',
  'valid expiry resolution succeeds'
);
select pg_temp.assert_true(
  :'replay_replay_resolution' = 'resolved',
  'same idempotency key replay succeeds'
);

select pg_temp.assert_true(
  (
    select count(*)
    from private.payment_alert_resolution_receipts
    where alert_id = '74700000-0000-4000-8000-000000000001'::uuid
  ) = 1,
  'exactly one immutable receipt'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_temp.payment_truth_before b
    cross join lateral (
      select
        i.status as intent_status,
        i.order_id as intent_order_id,
        i.stripe_checkout_session_id as intent_session,
        r.reservation_state,
        r.released_reason,
        r.order_id as reservation_order_id,
        w.processing_status,
        w.transition_code,
        w.order_id as receipt_order_id,
        w.payment_intent_id as receipt_payment_intent_id
      from public.checkout_intents i
      join public.stripe_checkout_reservations r
        on r.intent_id = i.id
      join public.stripe_webhook_receipts w
        on w.checkout_intent_id = i.id
      where i.id =
        '74000000-0000-4000-8000-000000000001'
        and w.event_id = 'evt_owner_expiry_accept_001'
    ) a
    where row(
      b.intent_status,
      b.intent_order_id,
      b.intent_session,
      b.reservation_state,
      b.released_reason,
      b.reservation_order_id,
      b.processing_status,
      b.transition_code,
      b.receipt_order_id,
      b.receipt_payment_intent_id
    ) is distinct from row(
      a.intent_status,
      a.intent_order_id,
      a.intent_session,
      a.reservation_state,
      a.released_reason,
      a.reservation_order_id,
      a.processing_status,
      a.transition_code,
      a.receipt_order_id,
      a.receipt_payment_intent_id
    )
  ),
  'resolution leaves payment truth unchanged'
);

\echo VALID_EXPIRED_UNPAID_RESOLUTION=PASS
\echo SAME_IDEMPOTENCY_REPLAY_RESOLVED=PASS
\echo ONE_IMMUTABLE_RECEIPT=PASS
\echo ALERT_ONLY_MUTATION=PASS

do $immutable$
begin
  begin
    update private.payment_alert_resolution_receipts
    set resolution_code = resolution_code
    where idempotency_key =
      '74600000-0000-4000-8000-000000000004';
    raise exception 'resolution receipt mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$immutable$;

\echo RESOLUTION_RECEIPT_IMMUTABLE=PASS

insert into private.payment_reconciliation_alerts (
  alert_id,
  event_id,
  event_type,
  alert_code,
  alert_state,
  occurrence_count,
  last_observed_at
) values (
  '74700000-0000-4000-8000-000000000002',
  'evt_owner_expiry_accept_other',
  'charge.refunded',
  'refund_attention_required',
  'open',
  1,
  clock_timestamp() + interval '1 minute'
);

select alert_id::text as newest_alert_id
from public.read_owner_reconciliation_alerts(1)
\gset newest_

select pg_temp.assert_true(
  :'newest_newest_alert_id' = '74700000-0000-4000-8000-000000000002',
  'alerts sort newest first'
);

\echo ALERT_ORDER_DESCENDING=PASS

set local role authenticated;
do $other_type$
begin
  begin
    perform public.resolve_owner_expired_checkout_alert(
      '74700000-0000-4000-8000-000000000002'::uuid,
      1,
      '74600000-0000-4000-8000-000000000005'
    );
    raise exception 'unsupported alert unexpectedly resolved';
  exception when serialization_failure then null;
  end;
end;
$other_type$;
reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from private.payment_reconciliation_alerts
    where alert_id = '74700000-0000-4000-8000-000000000002'::uuid
      and alert_state = 'open'
  ),
  'non-expiry alert remains open'
);

\echo OTHER_ALERT_TYPES_REMAIN_OPEN=PASS

select open_reconciliation_alerts::text as open_count,
       is_healthy::text as healthy
from public.payment_operations_health()
\gset remaining_

select pg_temp.assert_true(
  :'remaining_open_count'::bigint
    = :'baseline_open_count'::bigint + 1
  and (
    :'remaining_healthy' = 'false'
    or :'remaining_healthy' = 'f'
  ),
  'remaining open alert keeps health false'
);

update private.payment_reconciliation_alerts
set alert_state = 'resolved',
    resolved_at = clock_timestamp()
where alert_id = '74700000-0000-4000-8000-000000000002'::uuid;

select open_reconciliation_alerts::text as open_count,
       is_healthy::text as healthy
from public.payment_operations_health()
\gset final_

select pg_temp.assert_true(
  :'final_open_count'::bigint = :'baseline_open_count'::bigint,
  'harness restores baseline open alert count'
);
select pg_temp.assert_true(
  :'final_healthy'::boolean
    is not distinct from :'baseline_healthy'::boolean,
  'harness restores baseline health semantics'
);

\echo HEALTH_RECOVERS_ONLY_AFTER_LAST_OPEN_ALERT=PASS

rollback;

\echo OWNER_EXPIRY_RECONCILIATION_PG17_PASS
