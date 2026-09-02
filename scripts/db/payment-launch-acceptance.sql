\set ON_ERROR_STOP on

-- Disposable-local acceptance for the gated Stripe Checkout successor.
-- Assumes the full migration chain plus the deterministic ORD-03 fixture.
-- Uses only reserved .invalid identities and synthetic Stripe identifiers.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'Payment launch assertion failed: %', p_label;
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
    raise exception 'Payment launch assertion failed: % (actual=%, expected=%)',
      p_label, p_actual, p_expected;
  end if;
end;
$$;

begin;

-- Make the reserved synthetic rate-limit subject deterministic even when this
-- script is rerun against the same disposable database. The surrounding
-- rollback restores any pre-existing row.
delete from private.checkout_rate_limit_counters
where subject_hash = repeat('e', 64)
  and scope = 'checkout_email';

select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.checkout_intents', 'select')
  and has_table_privilege('service_role', 'public.checkout_intents', 'insert')
  and not has_table_privilege('service_role', 'public.checkout_intents', 'update')
  and not has_table_privilege('service_role', 'public.checkout_intents', 'delete')
  and not has_table_privilege('service_role', 'public.orders', 'select')
  and not has_table_privilege('service_role', 'public.stripe_checkout_reservations', 'select')
  and not has_table_privilege('service_role', 'public.stripe_events', 'select')
  and not has_table_privilege('service_role', 'public.stripe_webhook_receipts', 'select'),
  'service role has only the direct pending-Checkout table boundary'
);

select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.consume_checkout_rate_limit(text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.begin_stripe_webhook_attempt(text,text,boolean,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_stripe_webhook_attempt(text,text,uuid,text)',
    'execute'
  )
  and has_function_privilege(
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
    'service_role',
    'public.record_stripe_checkout_failure(text,text,text,uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.compensate_stripe_checkout_setup(uuid,text,boolean,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.resolve_stripe_checkout_setup(uuid,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.record_stripe_operational_event(text,text,text,uuid,text,text,text,text)',
    'execute'
  ),
  'service role can execute only the gated payment routines and cannot bypass operational alerts'
);

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.checkout_intents', 'select')
  and not has_table_privilege('authenticated', 'public.checkout_intents', 'select')
  and not has_function_privilege(
    'authenticated',
    'public.finalize_stripe_checkout(text,text,text,text,uuid,integer,text,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.payment_operations_health()', 'execute'
  ),
  'anon and authenticated roles remain outside the payment boundary'
);

set local role service_role;

insert into public.checkout_intents (
  id,
  brief_json,
  delivery_email,
  amount_cents,
  currency,
  terms_version,
  stripe_checkout_session_id,
  status
) values (
  '25000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'organizationType', 'Nonprofit / Community organization',
    'campaignFamily', 'Cause / Nonprofit campaign',
    'primaryAction', 'Register',
    'organizationName', 'Synthetic Payment Organization',
    'campaignName', 'Synthetic Payment Campaign',
    'campaignType', 'Fundraiser',
    'campaignTypeOther', '',
    'dateTime', '2099-01-01T12:00:00Z',
    'locationOrLink', 'https://payment-launch.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise payment finalization',
    'offerAsk', 'Register',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'payment@launch.example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'payment@launch.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'cs_test_payment_launch_0001',
  'checkout_created'
);

select
  clock_timestamp() + interval '60 minutes' as stripe_expiry,
  clock_timestamp() + interval '65 minutes' as reservation_expiry
\gset paid_capacity_

select reservation_status, stripe_session_expires_at
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000001',
  :'paid_capacity_stripe_expiry'::timestamptz,
  :'paid_capacity_reservation_expiry'::timestamptz
) \gset paid_reservation_

select public.bind_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000001',
  'cs_test_payment_launch_0001',
  :'paid_capacity_stripe_expiry'::timestamptz
);

select reservation_status, stripe_session_expires_at
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000001',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
) \gset paid_retry_

select pg_temp.assert_true(
  :'paid_reservation_reservation_status' = 'reserved'
  and :'paid_retry_reservation_status' = 'same'
  and :'paid_retry_stripe_session_expires_at'::timestamptz =
      :'paid_capacity_stripe_expiry'::timestamptz,
  'exact retry retains the originally reserved Stripe expiry'
);

select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_paid_0001',
  'checkout.session.completed',
  false,
  'cs_test_payment_launch_0001'
);

select public.finalize_stripe_checkout(
  'evt_test_payment_launch_paid_0001',
  'checkout.session.completed',
  'cs_test_payment_launch_0001',
  'pi_test_payment_launch_0001',
  '25000000-0000-4000-8000-000000000001',
  9900,
  'usd',
  'payment@launch.example.invalid',
  clock_timestamp()
) as order_id \gset paid_

select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_paid_0001',
  'processed',
  :'paid_order_id'::uuid,
  null
);

-- An exact Stripe retry increments the receipt attempt but returns the same
-- order without duplicating any customer graph row.
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_paid_0001',
  'checkout.session.completed',
  false,
  'cs_test_payment_launch_0001'
);

select public.finalize_stripe_checkout(
  'evt_test_payment_launch_paid_0001',
  'checkout.session.completed',
  'cs_test_payment_launch_0001',
  'pi_test_payment_launch_0001',
  '25000000-0000-4000-8000-000000000001',
  9900,
  'usd',
  'payment@launch.example.invalid',
  clock_timestamp()
) as order_id \gset replay_

select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_paid_0001',
  'processed',
  :'replay_order_id'::uuid,
  null
);

-- A second supported paid-event type for the same bound session also reuses
-- the order while preserving its distinct Stripe event receipt.
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_paid_0002',
  'checkout.session.async_payment_succeeded',
  false,
  'cs_test_payment_launch_0001'
);

select public.finalize_stripe_checkout(
  'evt_test_payment_launch_paid_0002',
  'checkout.session.async_payment_succeeded',
  'cs_test_payment_launch_0001',
  'pi_test_payment_launch_0001',
  '25000000-0000-4000-8000-000000000001',
  9900,
  'usd',
  'payment@launch.example.invalid',
  clock_timestamp()
) as order_id \gset async_

select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_paid_0002',
  'processed',
  :'async_order_id'::uuid,
  null
);

-- Verified refund and dispute events are durably acknowledged only after a
-- metadata-only operator alert is bound to the exact paid order. The event
-- projection intentionally does not infer the final settlement outcome.
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_refund_0001',
  'charge.refunded', false, null
);
select public.record_stripe_operational_event(
  'evt_test_payment_launch_refund_0001',
  'charge.refunded',
  null,
  null,
  'pi_test_payment_launch_0001',
  'ch_test_payment_launch_0001',
  null,
  'refund_attention_required'
) as order_id \gset refund_
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_refund_0001', 'processed',
  :'refund_order_id'::uuid, null
);
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_dispute_open_0001',
  'charge.dispute.created', false, null
);
select public.record_stripe_operational_event(
  'evt_test_payment_launch_dispute_open_0001',
  'charge.dispute.created',
  null,
  null,
  'pi_test_payment_launch_0001',
  'ch_test_payment_launch_0001',
  'dp_test_payment_launch_0001',
  'dispute_opened_attention_required'
) as order_id \gset dispute_open_
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_dispute_open_0001', 'processed',
  :'dispute_open_order_id'::uuid, null
);
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_dispute_closed_0001',
  'charge.dispute.closed', false, null
);
select public.record_stripe_operational_event(
  'evt_test_payment_launch_dispute_closed_0001',
  'charge.dispute.closed',
  null,
  null,
  'pi_test_payment_launch_0001',
  'ch_test_payment_launch_0001',
  'dp_test_payment_launch_0001',
  'dispute_closed_attention_required'
) as order_id \gset dispute_closed_
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_dispute_closed_0001', 'processed',
  :'dispute_closed_order_id'::uuid, null
);

insert into public.checkout_intents (
  id,
  brief_json,
  delivery_email,
  amount_cents,
  currency,
  terms_version,
  stripe_checkout_session_id,
  status
) values (
  '25000000-0000-4000-8000-000000000002',
  jsonb_build_object('fixture', 'asynchronous_payment_failure'),
  'failed@launch.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'cs_test_payment_launch_failed_0001',
  'checkout_created'
);

-- Close the synthetic fulfillment obligation as lifecycle evidence. Independent
-- customers never depend on this transition before reserving their own intent.
reset role;
update public.orders set status = 'closed' where id = :'paid_order_id'::uuid;
set local role service_role;

select
  clock_timestamp() + interval '60 minutes' as stripe_expiry,
  clock_timestamp() + interval '65 minutes' as reservation_expiry
\gset failed_capacity_

select reservation_status
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000002',
  :'failed_capacity_stripe_expiry'::timestamptz,
  :'failed_capacity_reservation_expiry'::timestamptz
) \gset failed_reservation_

select public.bind_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000002',
  'cs_test_payment_launch_failed_0001',
  :'failed_capacity_stripe_expiry'::timestamptz
);

select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_async_failed_0001',
  'checkout.session.async_payment_failed',
  false,
  'cs_test_payment_launch_failed_0001'
);

select public.record_stripe_operational_event(
  'evt_test_payment_launch_async_failed_0001',
  'checkout.session.async_payment_failed',
  'cs_test_payment_launch_failed_0001',
  '25000000-0000-4000-8000-000000000002',
  null,
  null,
  null,
  'async_payment_failed_attention_required'
);

select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_async_failed_0001',
  'processed',
  null,
  null
);

insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version,
  stripe_checkout_session_id, status
) values (
  '25000000-0000-4000-8000-000000000003',
  jsonb_build_object('fixture', 'checkout_expiration'),
  'expired@launch.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'cs_test_payment_launch_expired_0001',
  'checkout_created'
);

select
  clock_timestamp() + interval '60 minutes' as stripe_expiry,
  clock_timestamp() + interval '65 minutes' as reservation_expiry
\gset expired_capacity_

select reservation_status
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000003',
  :'expired_capacity_stripe_expiry'::timestamptz,
  :'expired_capacity_reservation_expiry'::timestamptz
) \gset expired_reservation_

select public.bind_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000003',
  'cs_test_payment_launch_expired_0001',
  :'expired_capacity_stripe_expiry'::timestamptz
);

select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_expired_0001',
  'checkout.session.expired', false, 'cs_test_payment_launch_expired_0001'
);
select public.record_stripe_operational_event(
  'evt_test_payment_launch_expired_0001',
  'checkout.session.expired',
  'cs_test_payment_launch_expired_0001',
  '25000000-0000-4000-8000-000000000003',
  null,
  null,
  null,
  'checkout_expired_attention_required'
);
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_expired_0001', 'processed', null, null
);

reset role;
select reservation_state, released_reason
from public.stripe_checkout_reservations
where intent_id = '25000000-0000-4000-8000-000000000003'
\gset expired_result_
set local role service_role;

-- A transport-ambiguous create keeps the exact idempotent reservation and
-- opens an alert; a later returned Session is atomically bound and resolved.
insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status
) values (
  '25000000-0000-4000-8000-000000000004',
  jsonb_build_object('fixture', 'checkout_setup_compensation'),
  'setup@launch.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'pending'
);

select
  clock_timestamp() + interval '60 minutes' as stripe_expiry,
  clock_timestamp() + interval '65 minutes' as reservation_expiry
\gset setup_capacity_

select reservation_status
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000004',
  :'setup_capacity_stripe_expiry'::timestamptz,
  :'setup_capacity_reservation_expiry'::timestamptz
) \gset setup_reservation_

select public.compensate_stripe_checkout_setup(
  '25000000-0000-4000-8000-000000000004',
  null,
  false,
  'stripe_session_create_transport_ambiguous'
) as resolution \gset setup_ambiguous_

select reservation_status
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000004',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
) \gset setup_retry_

select public.compensate_stripe_checkout_setup(
  '25000000-0000-4000-8000-000000000004',
  'cs_test_payment_launch_setup_0001',
  false,
  'stripe_session_bind_failed'
) as resolution \gset setup_bound_

select public.resolve_stripe_checkout_setup(
  '25000000-0000-4000-8000-000000000004',
  'cs_test_payment_launch_setup_0001'
);

select public.compensate_stripe_checkout_setup(
  '25000000-0000-4000-8000-000000000004',
  'cs_test_payment_launch_setup_0001',
  true,
  'synthetic_provider_session_expired'
) as resolution \gset setup_released_

-- A later customer may reserve independently before Stripe delivers the old
-- signed expiry. The old event must be recognized from durable per-intent
-- compensation evidence and must never release or rewrite the new reservation.
insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status
) values (
  '25000000-0000-4000-8000-000000000005',
  jsonb_build_object('fixture', 'post_compensation_new_reservation'),
  'new-reservation@launch.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'pending'
);

select reservation_status
from public.reserve_stripe_checkout_capacity(
  '25000000-0000-4000-8000-000000000005',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
) \gset setup_successor_

-- Stripe can deliver the signed expiration webhook after the expire API
-- returns. The compensated tombstone must accept it idempotently, persist the
-- operational alert, and complete without a retry storm.
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_compensated_expired_0001',
  'checkout.session.expired',
  false,
  'cs_test_payment_launch_setup_0001'
);
select public.record_stripe_operational_event(
  'evt_test_payment_launch_compensated_expired_0001',
  'checkout.session.expired',
  'cs_test_payment_launch_setup_0001',
  '25000000-0000-4000-8000-000000000004',
  null,
  null,
  null,
  'checkout_expired_attention_required'
);
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_compensated_expired_0001', 'processed', null, null
);

-- An unmatched signed refund is still process-complete only after a durable,
-- globally owner-visible metadata alert exists. Raw provider payload and
-- customer data remain absent from the alert.
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_launch_orphan_refund_0001',
  'charge.refunded',
  false,
  null
);
select public.record_stripe_operational_event(
  'evt_test_payment_launch_orphan_refund_0001',
  'charge.refunded',
  null,
  null,
  'pi_test_payment_launch_unmatched_0001',
  'ch_test_payment_launch_unmatched_0001',
  null,
  'refund_attention_required'
);
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_launch_orphan_refund_0001', 'processed', null, null
);

create temp table payment_rate_results (
  attempt_number integer primary key,
  allowed boolean not null,
  retry_after_seconds integer not null
);

do $$
declare
  v_attempt_number integer;
  v_allowed boolean;
  v_retry_after_seconds integer;
begin
  for v_attempt_number in 1..6 loop
    select decision.allowed, decision.retry_after_seconds
    into v_allowed, v_retry_after_seconds
    from public.consume_checkout_rate_limit(
      repeat('e', 64), 'checkout_email'
    ) as decision;

    insert into payment_rate_results (
      attempt_number, allowed, retry_after_seconds
    ) values (
      v_attempt_number, v_allowed, v_retry_after_seconds
    );
  end loop;
end;
$$;

reset role;

select pg_temp.assert_text(:'paid_order_id', :'replay_order_id', 'exact retry order identity');
select pg_temp.assert_text(:'paid_order_id', :'async_order_id', 'async event order identity');

select pg_temp.assert_true(
  (select count(*) from public.orders where id = :'paid_order_id'::uuid) = 1
  and (select count(*) from public.accounts where source = 'stripe_checkout'
       and name = 'Synthetic Payment Organization') = 1
  and (select count(*) from public.contacts where email = 'payment@launch.example.invalid') = 1
  and (select count(*) from public.campaigns where name = 'Synthetic Payment Campaign') = 1
  and (select count(*) from public.briefs where order_id = :'paid_order_id'::uuid) = 1
  and (select count(*) from public.checkout_intents
       where id = '25000000-0000-4000-8000-000000000001'
         and status = 'paid' and order_id = :'paid_order_id'::uuid) = 1,
  'paid Checkout creates exactly one complete order graph'
);

select pg_temp.assert_true(
  (select count(*) from public.stripe_events
   where order_id = :'paid_order_id'::uuid) = 2
  and (select attempt_count from public.stripe_webhook_receipts
       where event_id = 'evt_test_payment_launch_paid_0001') = 2
  and (select processing_status from public.stripe_webhook_receipts
       where event_id = 'evt_test_payment_launch_paid_0001') = 'processed',
  'paid webhook retries are durable and duplicate-safe'
);

select pg_temp.assert_true(
  (select payment_status from public.orders where id = :'paid_order_id'::uuid) = 'paid'
  and :'refund_order_id'::uuid = :'paid_order_id'::uuid
  and :'dispute_open_order_id'::uuid = :'paid_order_id'::uuid
  and :'dispute_closed_order_id'::uuid = :'paid_order_id'::uuid
  and not exists (
    select 1
    from public.stripe_webhook_receipts
    where event_id in (
      'evt_test_payment_launch_refund_0001',
      'evt_test_payment_launch_dispute_open_0001',
      'evt_test_payment_launch_dispute_closed_0001'
    )
      and (
        processing_status <> 'processed'
        or last_error_code is not null
      )
  )
  and (
    select count(*)
    from private.payment_reconciliation_alerts
    where event_id in (
      'evt_test_payment_launch_refund_0001',
      'evt_test_payment_launch_dispute_open_0001',
      'evt_test_payment_launch_dispute_closed_0001'
    )
      and alert_state = 'open'
      and order_id = :'paid_order_id'::uuid
  ) = 3,
  'refund and dispute events are durably acknowledged and operator-visible without inferred settlement mutation'
);

select pg_temp.assert_true(
  (select status from public.checkout_intents
   where id = '25000000-0000-4000-8000-000000000002') = 'expired'
  and (select processing_status from public.stripe_webhook_receipts
       where event_id = 'evt_test_payment_launch_async_failed_0001') = 'processed'
  and (select last_error_code from public.stripe_webhook_receipts
       where event_id = 'evt_test_payment_launch_async_failed_0001') is null
  and exists (
    select 1
    from private.payment_reconciliation_alerts
    where event_id = 'evt_test_payment_launch_async_failed_0001'
      and alert_code = 'async_payment_failed_attention_required'
      and alert_state = 'open'
  ),
  'asynchronous failure closes only the bound unpaid intent and is durably acknowledged for operator reconciliation'
);

select pg_temp.assert_true(
  :'failed_reservation_reservation_status' = 'reserved'
  and :'expired_reservation_reservation_status' = 'reserved'
  and (select status from public.checkout_intents
       where id = '25000000-0000-4000-8000-000000000003') = 'expired'
  and :'expired_result_reservation_state' = 'released'
  and :'expired_result_released_reason' = 'checkout.session.expired'
  and (select processing_status from public.stripe_webhook_receipts
       where event_id = 'evt_test_payment_launch_expired_0001') = 'processed'
  and exists (
    select 1
    from private.payment_reconciliation_alerts
    where event_id = 'evt_test_payment_launch_expired_0001'
      and alert_code = 'checkout_expired_attention_required'
      and alert_state = 'open'
  ),
  'signed asynchronous failure and expiration durably alert and release only their exact unpaid reservations'
);

select pg_temp.assert_true(
  :'setup_reservation_reservation_status' = 'reserved'
  and :'setup_ambiguous_resolution' = 'reconciliation_required'
  and :'setup_retry_reservation_status' = 'same'
  and :'setup_bound_resolution' = 'reconciliation_required'
  and :'setup_released_resolution' = 'released'
  and (select status from public.checkout_intents
       where id = '25000000-0000-4000-8000-000000000004') = 'expired'
  and (select stripe_checkout_session_id from public.checkout_intents
       where id = '25000000-0000-4000-8000-000000000004') =
      'cs_test_payment_launch_setup_0001'
  and :'setup_successor_reservation_status' = 'reserved'
  and (select reservation_state from public.stripe_checkout_reservations
       where intent_id = '25000000-0000-4000-8000-000000000005') = 'reserved'
  and (select checkout_session_id from public.stripe_checkout_reservations
       where intent_id = '25000000-0000-4000-8000-000000000005') is null
  and not exists (
    select 1
    from private.payment_reconciliation_alerts
    where checkout_intent_id = '25000000-0000-4000-8000-000000000004'
      and event_type = 'checkout.session.setup'
      and alert_state = 'open'
  )
  and (
    select count(*)
    from private.payment_reconciliation_alerts
    where checkout_intent_id = '25000000-0000-4000-8000-000000000004'
      and alert_state = 'resolved'
  ) = 3
  and (select processing_status from public.stripe_webhook_receipts
       where event_id = 'evt_test_payment_launch_compensated_expired_0001') = 'processed'
  and exists (
    select 1
    from private.payment_reconciliation_alerts
    where event_id = 'evt_test_payment_launch_compensated_expired_0001'
      and alert_code = 'checkout_expired_attention_required'
      and alert_state = 'open'
  ),
  'Checkout setup compensation preserves ambiguity and accepts delayed old expiry without altering a newer reservation'
);

select pg_temp.assert_true(
  (select processing_status from public.stripe_webhook_receipts
   where event_id = 'evt_test_payment_launch_orphan_refund_0001') = 'processed'
  and exists (
    select 1 from private.payment_reconciliation_alerts
    where event_id = 'evt_test_payment_launch_orphan_refund_0001'
      and alert_code = 'refund_attention_required'
      and alert_state = 'open'
      and checkout_intent_id is null
      and order_id is null
  ),
  'unmatched signed refund is durably quarantined for the global owner reconciliation inbox before acknowledgement'
);

select pg_temp.assert_true(
  (select count(*) from payment_rate_results where attempt_number <= 5 and allowed) = 5
  and (select allowed is false and retry_after_seconds > 0
       from payment_rate_results where attempt_number = 6),
  'email checkout throttling permits five attempts and blocks the sixth'
);

do $$
begin
  begin
    perform public.finalize_stripe_checkout(
      'evt_test_payment_launch_bad_email',
      'checkout.session.completed',
      'cs_test_payment_launch_0001',
      'pi_test_payment_launch_0001',
      '25000000-0000-4000-8000-000000000001',
      9900,
      'usd',
      'other@launch.example.invalid',
      clock_timestamp()
    );
    raise exception 'mismatched customer email unexpectedly finalized';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'Checkout does not match intent binding' then raise; end if;
  end;

  begin
    perform public.finalize_stripe_checkout(
      'evt_test_payment_launch_bad_session',
      'checkout.session.completed',
      'cs_test_payment_launch_other',
      'pi_test_payment_launch_0001',
      '25000000-0000-4000-8000-000000000001',
      9900,
      'usd',
      'payment@launch.example.invalid',
      clock_timestamp()
    );
    raise exception 'mismatched Checkout Session unexpectedly finalized';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'Checkout does not match intent binding' then raise; end if;
  end;

  begin
    perform public.finalize_stripe_checkout(
      'evt_test_payment_launch_bad_amount',
      'checkout.session.completed',
      'cs_test_payment_launch_0001',
      'pi_test_payment_launch_0001',
      '25000000-0000-4000-8000-000000000001',
      9800,
      'usd',
      'payment@launch.example.invalid',
      clock_timestamp()
    );
    raise exception 'wrong amount unexpectedly finalized';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'Unexpected checkout amount or currency' then raise; end if;
  end;
end;
$$;

select pg_temp.assert_true(
  not exists (
    select 1 from public.stripe_events
    where event_id in (
      'evt_test_payment_launch_bad_email',
      'evt_test_payment_launch_bad_session',
      'evt_test_payment_launch_bad_amount'
    )
  ),
  'integrity failures leave no Stripe idempotency event'
);

rollback;

select 'PAYMENT_LAUNCH_ACCEPTANCE_PASS' as result;
