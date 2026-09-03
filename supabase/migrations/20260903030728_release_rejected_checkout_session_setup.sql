-- A synchronous Stripe invalid-request response proves that Checkout Session
-- creation was rejected: there is no live provider Session to orphan. Release
-- only that exact unbound reservation and close its setup alert so the same
-- private intake can be retried after the provider configuration is repaired.

create or replace function public.release_rejected_stripe_checkout_setup(
  p_intent_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_reservation public.stripe_checkout_reservations%rowtype;
  v_event_id text;
begin
  if p_intent_id is null then
    raise exception 'Invalid rejected Checkout setup release' using errcode = '22023';
  end if;

  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found
    or v_intent.status <> 'pending'
    or v_intent.order_id is not null
    or v_intent.stripe_checkout_session_id is not null
  then
    raise exception 'Rejected Checkout setup intent is not safely releasable'
      using errcode = '22023';
  end if;

  select * into v_reservation
  from public.stripe_checkout_reservations
  where intent_id = p_intent_id
  for update;

  if not found
    or v_reservation.reservation_state <> 'reserved'
    or v_reservation.order_id is not null
    or v_reservation.checkout_session_id is not null
  then
    raise exception 'Rejected Checkout setup reservation is not safely releasable'
      using errcode = '22023';
  end if;

  update public.stripe_checkout_reservations
  set reservation_state = 'released',
      released_reason = 'stripe_session_create_rejected',
      released_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where intent_id = p_intent_id;

  update private.payment_reconciliation_alerts
  set alert_state = 'resolved',
      resolved_at = clock_timestamp(),
      last_observed_at = clock_timestamp()
  where checkout_intent_id = p_intent_id
    and event_type = 'checkout.session.setup'
    and alert_state = 'open';

  v_event_id := left('setup:' || p_intent_id::text || ':no_session', 255);

  insert into private.payment_reconciliation_alerts (
    event_id,
    event_type,
    alert_code,
    alert_state,
    checkout_intent_id,
    resolved_at
  ) values (
    v_event_id,
    'checkout.session.setup',
    'stripe_session_create_rejected',
    'resolved',
    p_intent_id,
    clock_timestamp()
  )
  on conflict (event_id, alert_code) do update
  set alert_state = 'resolved',
      occurrence_count = private.payment_reconciliation_alerts.occurrence_count + 1,
      last_observed_at = clock_timestamp(),
      resolved_at = clock_timestamp();

  return 'released';
end;
$$;

comment on function public.release_rejected_stripe_checkout_setup(uuid) is
  'Releases only an exact unbound pending intent reservation after Stripe synchronously rejects Session creation.';

revoke all on function public.release_rejected_stripe_checkout_setup(uuid)
  from public, anon, authenticated;
grant execute on function public.release_rejected_stripe_checkout_setup(uuid)
  to service_role;
