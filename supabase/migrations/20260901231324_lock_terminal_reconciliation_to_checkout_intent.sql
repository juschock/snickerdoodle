begin;

-- Terminal Checkout events can race payment completion. Serialize their state
-- decision on the exact checkout intent so an expiry/failure event never acts
-- on a pre-payment snapshot and never locks an unrelated customer's intent.
create or replace function public.record_stripe_operational_event(
  p_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_checkout_intent_id uuid,
  p_payment_intent_id text,
  p_charge_id text,
  p_dispute_id text,
  p_alert_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_compensated_expiry boolean := false;
  v_already_paid boolean := false;
begin
  if p_event_id is null or char_length(p_event_id) not between 3 and 255
    or p_event_type not in (
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.closed'
    )
    or p_alert_code is null
    or p_alert_code !~ '^[a-z][a-z0-9_]{2,99}$'
  then
    raise exception 'Invalid Stripe operational event' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));

  if p_event_type in (
    'checkout.session.async_payment_failed',
    'checkout.session.expired'
  ) then
    if p_checkout_intent_id is null or p_checkout_session_id is null then
      raise exception 'Terminal Checkout event requires intent and session identifiers'
        using errcode = '22023';
    end if;

    -- This is the sole state-decision lock for terminal Checkout events. It is
    -- scoped to one intent and is taken after the per-event replay lock. The
    -- payment finalizer uses the same intent row, so the following reads are
    -- current at action time rather than a stale pre-lock snapshot.
    perform 1
    from public.checkout_intents i
    where i.id = p_checkout_intent_id
      and i.stripe_checkout_session_id = p_checkout_session_id
    for update;

    if not found then
      raise exception 'Checkout intent not found for terminal event'
        using errcode = 'P0002';
    end if;

    select exists (
      select 1
      from public.checkout_intents i
      where i.id = p_checkout_intent_id
        and i.stripe_checkout_session_id = p_checkout_session_id
        and i.status = 'paid'
        and i.order_id is not null
    ) into v_already_paid;

    if p_event_type = 'checkout.session.expired' then
      select exists (
        select 1
        from public.checkout_intents i
        join private.payment_reconciliation_alerts a
          on a.checkout_intent_id = i.id
         and a.checkout_session_id = p_checkout_session_id
         and a.event_type = 'checkout.session.setup'
         and a.alert_state = 'resolved'
        where i.id = p_checkout_intent_id
          and i.stripe_checkout_session_id = p_checkout_session_id
          and i.status = 'expired'
          and i.order_id is null
      ) into v_compensated_expiry;
    end if;

    if not v_compensated_expiry and not v_already_paid then
      perform public.record_stripe_checkout_failure(
        p_event_id,
        p_event_type,
        p_checkout_session_id,
        p_checkout_intent_id
      );
    end if;
  end if;

  select o.id into v_order_id
  from public.orders o
  where (p_checkout_session_id is not null
      and o.stripe_checkout_session_id = p_checkout_session_id)
     or (p_payment_intent_id is not null
      and o.stripe_payment_intent_id = p_payment_intent_id)
  order by case
    when p_payment_intent_id is not null
      and o.stripe_payment_intent_id = p_payment_intent_id then 0
    else 1
  end
  limit 1;

  insert into private.payment_reconciliation_alerts (
    event_id,
    event_type,
    alert_code,
    alert_state,
    checkout_intent_id,
    checkout_session_id,
    payment_intent_id,
    charge_id,
    dispute_id,
    order_id
  ) values (
    p_event_id,
    p_event_type,
    p_alert_code,
    'open',
    p_checkout_intent_id,
    p_checkout_session_id,
    p_payment_intent_id,
    p_charge_id,
    p_dispute_id,
    v_order_id
  )
  on conflict (event_id, alert_code) do update
  set checkout_intent_id = coalesce(
        excluded.checkout_intent_id,
        private.payment_reconciliation_alerts.checkout_intent_id
      ),
      checkout_session_id = coalesce(
        excluded.checkout_session_id,
        private.payment_reconciliation_alerts.checkout_session_id
      ),
      payment_intent_id = coalesce(
        excluded.payment_intent_id,
        private.payment_reconciliation_alerts.payment_intent_id
      ),
      charge_id = coalesce(excluded.charge_id, private.payment_reconciliation_alerts.charge_id),
      dispute_id = coalesce(excluded.dispute_id, private.payment_reconciliation_alerts.dispute_id),
      order_id = coalesce(excluded.order_id, private.payment_reconciliation_alerts.order_id),
      occurrence_count = private.payment_reconciliation_alerts.occurrence_count + 1,
      last_observed_at = clock_timestamp();

  return v_order_id;
end;
$$;

comment on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) is
  'Records one verified operational event after rechecking terminal state under an exact-intent lock.';

revoke all on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) to service_role;

commit;
