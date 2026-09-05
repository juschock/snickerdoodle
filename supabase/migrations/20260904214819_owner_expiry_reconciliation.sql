begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Preserve the established counters; add every open alert to the health gate.
drop function public.payment_operations_health();
create function public.payment_operations_health()
returns table (
  generated_at timestamptz, is_healthy boolean,
  latest_webhook_received_at timestamptz, latest_webhook_completed_at timestamptz,
  webhook_receipts_24h bigint, failed_webhook_receipts_24h bigint,
  stuck_webhook_receipts bigint, stale_unpaid_checkout_intents bigint,
  paid_checkout_intents_without_order bigint, paid_stripe_orders_without_intent bigint,
  paid_stripe_orders_without_event bigint, processed_stripe_events_without_paid_order bigint,
  open_reconciliation_alerts bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required' using errcode = '42501';
  end if;
  return query
  select h.generated_at, h.is_healthy and a.open_count = 0,
    h.latest_webhook_received_at, h.latest_webhook_completed_at,
    h.webhook_receipts_24h, h.failed_webhook_receipts_24h,
    h.stuck_webhook_receipts, h.stale_unpaid_checkout_intents,
    h.paid_checkout_intents_without_order, h.paid_stripe_orders_without_intent,
    h.paid_stripe_orders_without_event, h.processed_stripe_events_without_paid_order,
    a.open_count
  from private.payment_operations_health_internal() h
  cross join (
    select count(*)::bigint as open_count
    from private.payment_reconciliation_alerts
    where alert_state = 'open'
  ) a;
end;
$$;
revoke all on function public.payment_operations_health() from public, anon, authenticated, service_role;
grant execute on function public.payment_operations_health() to authenticated;
comment on function public.payment_operations_health() is
  'AAL2-owner-only aggregate payment health. Any open reconciliation alert makes overall health non-healthy. Returns metadata counters only.';

create table private.payment_alert_resolution_receipts (
  idempotency_key uuid primary key,
  alert_id uuid not null references private.payment_reconciliation_alerts(alert_id),
  actor_profile_id uuid not null references public.profiles(id),
  expected_occurrence_count integer not null check (expected_occurrence_count > 0),
  resolution_code text not null check (resolution_code = 'expired_checkout_reviewed'),
  resolved_at timestamptz not null default clock_timestamp(),
  unique (alert_id)
);
alter table private.payment_alert_resolution_receipts enable row level security;
alter table private.payment_alert_resolution_receipts force row level security;
revoke all on private.payment_alert_resolution_receipts from public, anon, authenticated, service_role;
comment on table private.payment_alert_resolution_receipts is
  'Immutable metadata-only AAL2 owner acknowledgement receipts for verified unpaid Checkout expiry alerts.';

create function private.reject_payment_alert_receipt_mutation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Payment alert resolution receipts are immutable' using errcode = '42501';
end;
$$;
revoke all on function private.reject_payment_alert_receipt_mutation() from public, anon, authenticated, service_role;
create trigger payment_alert_resolution_receipts_immutable
before update or delete on private.payment_alert_resolution_receipts
for each row execute function private.reject_payment_alert_receipt_mutation();

-- One shared predicate; the write path repeats it after acquiring the exact
-- intent/alert locks used by the payment state machine. No payment is inferred.
create function private.expiry_alert_is_resolvable(p_alert_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from private.payment_reconciliation_alerts a
    join public.checkout_intents i on i.id = a.checkout_intent_id
    join public.stripe_checkout_reservations r on r.intent_id = i.id
    join public.stripe_webhook_receipts w
      on w.event_id = a.event_id
     and w.checkout_intent_id = i.id
     and w.checkout_session_id = a.checkout_session_id
    where a.alert_id = p_alert_id and a.alert_state = 'open'
      and a.event_type = 'checkout.session.expired'
      and a.alert_code = 'checkout_expired_attention_required'
      and a.order_id is null and a.dispute_id is null and a.charge_id is null
      and i.status = 'expired' and i.order_id is null
      and i.stripe_checkout_session_id is not null
      and i.stripe_checkout_session_id = a.checkout_session_id
      and r.checkout_session_id = i.stripe_checkout_session_id
      and r.reservation_state = 'released'
      and r.released_reason = 'checkout.session.expired'
      and r.order_id is null
      and w.event_type = a.event_type
      and w.processing_status = 'processed'
      and w.transition_code = 'checkout_recoverable_failure'
      and w.completed_at is not null
      and w.order_id is null
      and w.payment_intent_id is not distinct from a.payment_intent_id
      and not exists (
        select 1
        from public.orders o
        where o.stripe_checkout_session_id = a.checkout_session_id
           or (
             a.payment_intent_id is not null
             and o.stripe_payment_intent_id = a.payment_intent_id
           )
      )
  );
$$;
revoke all on function private.expiry_alert_is_resolvable(uuid) from public, anon, authenticated, service_role;

create function public.read_owner_reconciliation_alerts(p_limit integer default 50)
returns table (
  alert_id uuid, event_type text, alert_code text, occurrence_count integer,
  last_observed_at timestamptz, can_resolve_expiry boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid alert limit' using errcode = '22023';
  end if;
  return query select a.alert_id, a.event_type, a.alert_code, a.occurrence_count,
    a.last_observed_at, private.expiry_alert_is_resolvable(a.alert_id)
  from private.payment_reconciliation_alerts a where a.alert_state = 'open'
  order by a.last_observed_at desc, a.alert_id desc
  limit p_limit;
end;
$$;
revoke all on function public.read_owner_reconciliation_alerts(integer) from public, anon, authenticated, service_role;
grant execute on function public.read_owner_reconciliation_alerts(integer) to authenticated;
comment on function public.read_owner_reconciliation_alerts(integer) is
  'AAL2-owner-only metadata projection of open reconciliation alerts; returns exactly six non-customer-content fields.';

create function public.resolve_owner_expired_checkout_alert(
  p_alert_id uuid, p_expected_occurrence_count integer, p_idempotency_key uuid
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_alert private.payment_reconciliation_alerts%rowtype;
  v_receipt private.payment_alert_resolution_receipts%rowtype;
  v_intent_id uuid;
  v_actor uuid;
begin
  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required' using errcode = '42501';
  end if;
  if p_alert_id is null or p_idempotency_key is null
    or p_expected_occurrence_count is null or p_expected_occurrence_count < 1 then
    raise exception 'Invalid alert resolution' using errcode = '22023';
  end if;
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'Live owner identity is required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alert-resolution:' || p_idempotency_key::text, 0));

  select * into v_receipt from private.payment_alert_resolution_receipts
    where idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.alert_id <> p_alert_id or v_receipt.actor_profile_id <> v_actor
      or v_receipt.expected_occurrence_count <> p_expected_occurrence_count then
      raise exception 'Idempotency binding conflict' using errcode = '22023';
    end if;
    if not exists (select 1 from private.payment_reconciliation_alerts
      where alert_id = p_alert_id and alert_state = 'resolved') then
      raise exception 'Resolved alert state changed' using errcode = '40001';
    end if;
    return 'resolved';
  end if;

  select checkout_intent_id into v_intent_id
    from private.payment_reconciliation_alerts
    where alert_id = p_alert_id;

  if not found or v_intent_id is null then
    raise exception 'Alert state changed or is not a resolvable expiry' using errcode = '40001';
  end if;

  -- Intent first, then alert: never invert the provider state-machine lock order.
  perform 1 from public.checkout_intents where id = v_intent_id for update;
  if not found then
    raise exception 'Alert state changed or is not a resolvable expiry' using errcode = '40001';
  end if;

  select * into v_alert from private.payment_reconciliation_alerts
    where alert_id = p_alert_id for update;
  if not found or v_alert.checkout_intent_id is distinct from v_intent_id
    or v_alert.occurrence_count <> p_expected_occurrence_count
    or not private.expiry_alert_is_resolvable(p_alert_id) then
    raise exception 'Alert state changed or is not a resolvable expiry' using errcode = '40001';
  end if;

  insert into private.payment_alert_resolution_receipts
    (idempotency_key, alert_id, actor_profile_id, expected_occurrence_count, resolution_code)
  values (p_idempotency_key, p_alert_id, v_actor, p_expected_occurrence_count, 'expired_checkout_reviewed');

  update private.payment_reconciliation_alerts
    set alert_state = 'resolved', resolved_at = clock_timestamp()
    where alert_id = p_alert_id
      and alert_state = 'open'
      and occurrence_count = p_expected_occurrence_count;

  if not found then
    raise exception 'Alert state changed during resolution' using errcode = '40001';
  end if;

  return 'resolved';
end;
$$;
revoke all on function public.resolve_owner_expired_checkout_alert(uuid, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_owner_expired_checkout_alert(uuid, integer, uuid) to authenticated;
comment on function public.resolve_owner_expired_checkout_alert(uuid, integer, uuid) is
  'Live AAL2 owner acknowledgement of one verified, unpaid, released expiry. Records immutable metadata and changes no payment, order, reservation, or fulfillment state.';
commit;
