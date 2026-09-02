-- SN Sprint 03: make one verified provider event one atomic, replay-safe
-- payment transition. This is a forward-only local candidate migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.checkout_intents,
  public.stripe_checkout_reservations,
  public.stripe_webhook_receipts,
  public.orders,
  private.intake_manager_queue,
  private.payment_reconciliation_alerts
  in share row exclusive mode;

alter table public.stripe_webhook_receipts
  drop constraint stripe_webhook_receipts_processing_status_check,
  add constraint stripe_webhook_receipts_processing_status_check
    check (processing_status in (
      'received', 'processing', 'processed', 'ignored', 'failed_retryable'
    )),
  add column checkout_intent_id uuid references public.checkout_intents (id) on delete set null,
  add column payment_intent_id text,
  add column stripe_customer_id text,
  add column charge_id text,
  add column dispute_id text,
  add column transition_code text,
  add constraint stripe_webhook_receipts_provider_ids_check check (
    (payment_intent_id is null or char_length(payment_intent_id) between 3 and 255)
    and (stripe_customer_id is null or char_length(stripe_customer_id) between 3 and 255)
    and (charge_id is null or char_length(charge_id) between 3 and 255)
    and (dispute_id is null or char_length(dispute_id) between 3 and 255)
    and (transition_code is null or transition_code ~ '^[a-z][a-z0-9_]{2,99}$')
  );

update public.stripe_webhook_receipts
set processing_status = 'failed_retryable'
where processing_status = 'failed';

create index stripe_webhook_receipts_intent_attempt_idx
  on public.stripe_webhook_receipts (checkout_intent_id, last_attempted_at desc)
  where checkout_intent_id is not null;

alter table public.orders
  drop constraint orders_payment_status_check,
  add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'paid', 'refunded', 'disputed', 'dispute_lost')),
  add column stripe_customer_id text,
  add column stripe_charge_id text,
  add constraint orders_stripe_customer_id_check
    check (stripe_customer_id is null or char_length(stripe_customer_id) between 3 and 255),
  add constraint orders_stripe_charge_id_check
    check (stripe_charge_id is null or char_length(stripe_charge_id) between 3 and 255),
  add constraint orders_stripe_charge_id_unique unique (stripe_charge_id);

alter table private.intake_manager_queue
  drop constraint intake_manager_queue_queue_state_check,
  drop constraint intake_manager_queue_check,
  drop constraint intake_manager_queue_check1,
  add constraint intake_manager_queue_queue_state_check check (queue_state in (
    'received', 'awaiting_payment', 'paid_ready', 'payment_attention',
    'in_fulfillment', 'fulfilled', 'closed', 'refunded', 'disputed',
    'closed_unpaid'
  )),
  add constraint intake_manager_queue_kind_binding_check check (
    (intake_kind = 'non_payment'
      and payment_state = 'not_applicable'
      and order_id is null)
    or intake_kind = 'checkout'
  ),
  add constraint intake_manager_queue_state_binding_check check (
    (payment_state = 'paid'
      and queue_state in (
        'paid_ready', 'payment_attention', 'in_fulfillment', 'fulfilled',
        'closed', 'refunded', 'disputed'
      )
      and order_id is not null)
    or (payment_state in ('pending', 'checkout_created')
      and queue_state = 'awaiting_payment')
    or (payment_state = 'expired'
      and queue_state = 'closed_unpaid' and order_id is null)
    or (payment_state = 'not_applicable'
      and queue_state = 'received' and order_id is null)
  );

create or replace function private.sync_checkout_manager_queue(p_intent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_order public.orders%rowtype;
  v_queue_state text;
begin
  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id;

  if not found then
    return;
  end if;

  if v_intent.status <> 'paid' then
    v_queue_state := case v_intent.status
      when 'expired' then 'closed_unpaid'
      else 'awaiting_payment'
    end;
  else
    select * into v_order
    from public.orders
    where id = v_intent.order_id;

    if not found or v_order.payment_status = 'unpaid' then
      raise exception 'Paid queue receipt requires a paid order' using errcode = '23514';
    end if;

    v_queue_state := case
      when v_order.payment_status = 'refunded' then 'refunded'
      when v_order.payment_status = 'disputed' then 'disputed'
      when v_order.payment_status = 'dispute_lost' then 'payment_attention'
      when exists (
        select 1
        from private.payment_reconciliation_alerts a
        where a.alert_state = 'open'
          and (a.checkout_intent_id = v_intent.id or a.order_id = v_order.id)
          and a.alert_code not in (
            'checkout_expired_attention_required',
            'async_payment_failed_attention_required'
          )
      ) then 'payment_attention'
      when v_order.status = 'closed' then 'closed'
      when v_order.status in ('delivered', 'follow_up_sent') then 'fulfilled'
      when v_order.status = 'new_intake' then 'paid_ready'
      else 'in_fulfillment'
    end;
  end if;

  insert into private.intake_manager_queue (
    intake_kind, intake_id, queue_state, payment_state, order_id, terms_version
  ) values (
    'checkout', v_intent.id, v_queue_state, v_intent.status,
    v_intent.order_id, v_intent.terms_version
  )
  on conflict (intake_kind, intake_id) do update
  set queue_state = excluded.queue_state,
      payment_state = excluded.payment_state,
      order_id = excluded.order_id,
      terms_version = excluded.terms_version,
      updated_at = clock_timestamp();
end;
$$;

create or replace function private.queue_checkout_intake_for_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_checkout_manager_queue(new.id);
  return new;
end;
$$;

create or replace function private.queue_order_state_for_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent_id uuid;
begin
  select id into v_intent_id
  from public.checkout_intents
  where order_id = new.id;

  if v_intent_id is not null then
    perform private.sync_checkout_manager_queue(v_intent_id);
  end if;
  return new;
end;
$$;

create trigger queue_order_state_for_manager
after update of status, payment_status on public.orders
for each row
when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
execute function private.queue_order_state_for_manager();

revoke all on function private.sync_checkout_manager_queue(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.queue_checkout_intake_for_manager()
  from public, anon, authenticated, service_role;
revoke all on function private.queue_order_state_for_manager()
  from public, anon, authenticated, service_role;

create table private.order_fulfillment_idempotency (
  idempotency_key uuid primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null check (event_type in (
    'fulfillment.started', 'fulfillment.retry_requested',
    'fulfillment.completed', 'order.closed'
  )),
  from_status text not null,
  to_status text not null,
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table private.order_fulfillment_idempotency enable row level security;
alter table private.order_fulfillment_idempotency force row level security;
revoke all privileges on table private.order_fulfillment_idempotency
  from public, anon, authenticated, service_role;

create or replace function public.transition_order_fulfillment(
  p_order_id uuid,
  p_event_type text,
  p_expected_status text,
  p_idempotency_key uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_actor_id uuid;
  v_existing private.order_fulfillment_idempotency%rowtype;
  v_to_status text;
begin
  v_actor_id := (select auth.uid());
  if v_actor_id is null or p_order_id is null or p_idempotency_key is null then
    raise exception 'Live actor, order, and idempotency key are required' using errcode = '42501';
  end if;
  if not ((select private.is_owner()) or (select private.has_active_engagement_role(
    p_order_id, array['service_lead']::text[]
  ))) then
    raise exception 'Order-scoped fulfillment authorization is required' using errcode = '42501';
  end if;

  select * into v_existing
  from private.order_fulfillment_idempotency
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.event_type <> p_event_type then
      raise exception 'Fulfillment idempotency binding mismatch' using errcode = '22023';
    end if;
    return v_existing.to_status;
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'Fulfillment requires a paid order' using errcode = '23514';
  end if;
  if v_order.status is distinct from p_expected_status then
    raise exception 'Stale fulfillment source state' using errcode = '40001';
  end if;

  v_to_status := case
    when p_event_type = 'fulfillment.started' and v_order.status in (
      'new_intake', 'ready_for_drafting', 'revision_needed'
    ) then 'drafting'
    when p_event_type = 'fulfillment.retry_requested'
      and v_order.status in ('delivered', 'follow_up_sent') then 'revision_needed'
    when p_event_type = 'fulfillment.completed'
      and v_order.status in ('drafting', 'approved', 'packaged') then 'delivered'
    when p_event_type = 'order.closed'
      and v_order.status in ('delivered', 'follow_up_sent') then 'closed'
    when p_event_type = 'order.closed' and v_order.status = 'closed' then 'closed'
    else null
  end;
  if v_to_status is null then
    raise exception 'Illegal fulfillment transition' using errcode = '22023';
  end if;

  update public.orders set status = v_to_status where id = v_order.id;

  insert into private.order_fulfillment_idempotency (
    idempotency_key, order_id, event_type, from_status, to_status, actor_id
  ) values (
    p_idempotency_key, v_order.id, p_event_type, v_order.status, v_to_status, v_actor_id
  );

  insert into public.activity_events (
    account_id, order_id, event_type, message, metadata_json
  ) values (
    v_order.account_id, v_order.id, replace(p_event_type, '.', '_'),
    'Authorized order-scoped fulfillment transition.',
    jsonb_build_object('from_status', v_order.status, 'to_status', v_to_status)
  );

  return v_to_status;
end;
$$;

comment on function public.transition_order_fulfillment(uuid, text, text, uuid) is
  'Per-order authenticated fulfillment transition with live assignment recheck, row lock, audit, and idempotency.';

revoke all on function public.transition_order_fulfillment(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_order_fulfillment(uuid, text, text, uuid)
  to authenticated;

create or replace function public.payment_operations_health()
returns table (
  generated_at timestamptz,
  is_healthy boolean,
  latest_webhook_received_at timestamptz,
  latest_webhook_completed_at timestamptz,
  webhook_receipts_24h bigint,
  failed_webhook_receipts_24h bigint,
  stuck_webhook_receipts bigint,
  stale_unpaid_checkout_intents bigint,
  paid_checkout_intents_without_order bigint,
  paid_stripe_orders_without_intent bigint,
  paid_stripe_orders_without_event bigint,
  processed_stripe_events_without_paid_order bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_active_staff()) then
    raise exception 'Active staff access required' using errcode = '42501';
  end if;

  return query
  with webhook_metrics as (
    select
      max(r.first_received_at) as latest_received,
      max(r.completed_at) as latest_completed,
      count(*) filter (
        where r.last_attempted_at >= now() - interval '24 hours'
      ) as receipts_24h,
      count(*) filter (
        where r.processing_status = 'failed_retryable'
          and r.last_attempted_at >= now() - interval '24 hours'
      ) as failures_24h,
      count(*) filter (
        where r.processing_status in ('received', 'processing')
          and r.last_attempted_at < now() - interval '5 minutes'
      ) as stuck_receipts
    from public.stripe_webhook_receipts r
  ),
  reconciliation_metrics as (
    select
      (select count(*) from public.checkout_intents ci
       where ci.order_id is null
         and ci.status in ('pending', 'checkout_created')
         and ci.created_at < now() - interval '48 hours') as stale_intents,
      (select count(*) from public.checkout_intents ci
       where ci.status = 'paid' and ci.order_id is null) as paid_intents_without_order,
      (select count(*) from public.orders o
       where o.payment_status <> 'unpaid'
         and o.stripe_checkout_session_id is not null
         and not exists (
           select 1 from public.checkout_intents ci
           where ci.order_id = o.id and ci.status = 'paid'
         )) as paid_orders_without_intent,
      (select count(*) from public.orders o
       where o.payment_status <> 'unpaid'
         and o.stripe_checkout_session_id is not null
         and not exists (
           select 1 from public.stripe_events se where se.order_id = o.id
         )) as paid_orders_without_event,
      (select count(*) from public.stripe_events se
       left join public.orders o on o.id = se.order_id
       where se.order_id is null or o.id is null or o.payment_status = 'unpaid')
        as events_without_paid_order
  )
  select now(),
    (w.failures_24h = 0 and w.stuck_receipts = 0
      and m.stale_intents = 0 and m.paid_intents_without_order = 0
      and m.paid_orders_without_intent = 0 and m.paid_orders_without_event = 0
      and m.events_without_paid_order = 0),
    w.latest_received, w.latest_completed, w.receipts_24h, w.failures_24h,
    w.stuck_receipts, m.stale_intents, m.paid_intents_without_order,
    m.paid_orders_without_intent, m.paid_orders_without_event,
    m.events_without_paid_order
  from webhook_metrics w cross join reconciliation_metrics m;
end;
$$;

comment on function public.payment_operations_health() is
  'Active-staff aggregate health for atomic payment receipts and non-regressive order bindings; returns counts only.';

revoke all on function public.payment_operations_health()
  from public, anon, authenticated, service_role;
grant execute on function public.payment_operations_health() to authenticated;

create or replace function private.cleanup_payment_operational_data(
  p_as_of timestamptz default clock_timestamp()
)
returns table (
  checkout_intents_marked_expired bigint,
  abandoned_checkout_intents_deleted bigint,
  old_webhook_receipts_deleted bigint,
  old_rate_limit_counters_deleted bigint,
  old_cron_run_details_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired bigint;
  v_deleted_intents bigint;
  v_deleted_receipts bigint;
  v_deleted_rate_limits bigint;
  v_deleted_cron_runs bigint;
begin
  if p_as_of is null then
    raise exception 'Cleanup reference time is required' using errcode = '22023';
  end if;
  update public.checkout_intents
  set status = 'expired', updated_at = clock_timestamp()
  where order_id is null and status in ('pending', 'checkout_created')
    and created_at < p_as_of - interval '48 hours';
  get diagnostics v_expired = row_count;
  delete from public.checkout_intents ci
  where ci.order_id is null and ci.status = 'expired'
    and ci.created_at < p_as_of - interval '30 days'
    and not exists (select 1 from public.stripe_events se
      where se.checkout_session_id = ci.stripe_checkout_session_id)
    and not exists (select 1 from public.stripe_webhook_receipts swr
      where swr.checkout_session_id = ci.stripe_checkout_session_id);
  get diagnostics v_deleted_intents = row_count;
  delete from public.stripe_webhook_receipts swr
  where swr.processing_status in ('processed', 'ignored', 'failed_retryable')
    and swr.last_attempted_at < p_as_of - interval '400 days';
  get diagnostics v_deleted_receipts = row_count;
  delete from private.checkout_rate_limit_counters c
  where c.last_attempted_at < p_as_of - interval '48 hours';
  get diagnostics v_deleted_rate_limits = row_count;
  delete from cron.job_run_details j
  where j.end_time is not null and j.end_time < p_as_of - interval '30 days';
  get diagnostics v_deleted_cron_runs = row_count;
  return query select v_expired, v_deleted_intents, v_deleted_receipts,
    v_deleted_rate_limits, v_deleted_cron_runs;
end;
$$;

comment on function private.cleanup_payment_operational_data(timestamptz) is
  'Conservative retention for the effective atomic receipt states; never deletes order/customer graphs or provider idempotency events.';

revoke all on function private.cleanup_payment_operational_data(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.process_stripe_payment_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_checkout_session_id text default null,
  p_checkout_intent_id uuid default null,
  p_payment_intent_id text default null,
  p_stripe_customer_id text default null,
  p_charge_id text default null,
  p_dispute_id text default null,
  p_amount_total integer default null,
  p_amount_refunded integer default null,
  p_currency text default null,
  p_customer_email text default null,
  p_provider_status text default null,
  p_occurred_at timestamptz default null,
  p_test_fail_after_business boolean default false
)
returns table (
  processing_status text,
  transition_code text,
  order_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.stripe_webhook_receipts%rowtype;
  v_intent public.checkout_intents%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_transition_code text;
  v_processing_status text;
  v_error_code text;
  v_attempt_count integer;
  v_alert_code text;
begin
  if p_event_id is null or char_length(p_event_id) not between 3 and 255
    or p_event_type is null or char_length(p_event_type) not between 3 and 255
    or p_livemode is null
    or p_occurred_at is null
  then
    raise exception 'Invalid verified Stripe event envelope' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));
  select * into v_receipt
  from public.stripe_webhook_receipts
  where event_id = p_event_id
  for update;

  if found then
    if v_receipt.event_type <> p_event_type
      or v_receipt.livemode is distinct from p_livemode
      or (v_receipt.checkout_session_id is not null
        and v_receipt.checkout_session_id is distinct from p_checkout_session_id)
      or (v_receipt.checkout_intent_id is not null
        and v_receipt.checkout_intent_id is distinct from p_checkout_intent_id)
      or (v_receipt.payment_intent_id is not null
        and v_receipt.payment_intent_id is distinct from p_payment_intent_id)
      or (v_receipt.charge_id is not null and v_receipt.charge_id is distinct from p_charge_id)
      or (v_receipt.dispute_id is not null and v_receipt.dispute_id is distinct from p_dispute_id)
    then
      raise exception 'Stripe event replay binding mismatch' using errcode = '22023';
    end if;

    update public.stripe_webhook_receipts r
    set attempt_count = r.attempt_count + 1,
        last_attempted_at = clock_timestamp()
    where r.event_id = p_event_id
    returning r.attempt_count into v_attempt_count;

    if v_receipt.processing_status in ('processed', 'ignored') then
      return query select v_receipt.processing_status, v_receipt.transition_code,
        v_receipt.order_id, v_attempt_count;
      return;
    end if;
  else
    insert into public.stripe_webhook_receipts (
      event_id, event_type, livemode, checkout_session_id, checkout_intent_id,
      payment_intent_id, stripe_customer_id, charge_id, dispute_id,
      processing_status, attempt_count, first_received_at, last_attempted_at
    ) values (
      p_event_id, p_event_type, p_livemode, p_checkout_session_id,
      p_checkout_intent_id, p_payment_intent_id, p_stripe_customer_id,
      p_charge_id, p_dispute_id, 'received', 1, clock_timestamp(), clock_timestamp()
    );
    v_attempt_count := 1;
  end if;

  update public.stripe_webhook_receipts
  set processing_status = 'processing',
      checkout_session_id = coalesce(checkout_session_id, p_checkout_session_id),
      checkout_intent_id = coalesce(checkout_intent_id, p_checkout_intent_id),
      payment_intent_id = coalesce(payment_intent_id, p_payment_intent_id),
      stripe_customer_id = coalesce(stripe_customer_id, p_stripe_customer_id),
      charge_id = coalesce(charge_id, p_charge_id),
      dispute_id = coalesce(dispute_id, p_dispute_id),
      completed_at = null,
      last_error_code = null
  where event_id = p_event_id;

  begin
    if p_event_type in (
      'checkout.session.completed', 'checkout.session.async_payment_succeeded'
    ) then
      if p_provider_status <> 'paid'
        or p_checkout_session_id is null
        or p_checkout_intent_id is null
        or p_payment_intent_id is null
        or p_stripe_customer_id is null
        or p_amount_total <> 9900
        or lower(p_currency) <> 'usd'
        or p_customer_email is null
      then
        raise exception 'Paid Checkout integrity mismatch' using errcode = '22023';
      end if;

      select * into v_intent from public.checkout_intents
      where id = p_checkout_intent_id for update;
      if not found or v_intent.stripe_checkout_session_id <> p_checkout_session_id then
        raise exception 'Paid Checkout intent binding mismatch' using errcode = '22023';
      end if;

      if v_intent.status = 'expired' and v_intent.order_id is null then
        update public.stripe_checkout_reservations r
        set reservation_state = 'reserved', released_at = null, released_reason = null,
            updated_at = clock_timestamp()
        where r.intent_id = p_checkout_intent_id
          and r.checkout_session_id = p_checkout_session_id
          and r.reservation_state = 'released'
          and r.order_id is null;
        if not found then
          raise exception 'Late paid Checkout reservation binding mismatch' using errcode = '22023';
        end if;
        update public.checkout_intents i
        set status = 'checkout_created', updated_at = clock_timestamp()
        where i.id = p_checkout_intent_id and i.status = 'expired' and i.order_id is null;
      end if;

      v_order_id := public.finalize_stripe_checkout(
        p_event_id, p_event_type, p_checkout_session_id, p_payment_intent_id,
        p_checkout_intent_id, p_amount_total, lower(p_currency),
        lower(btrim(p_customer_email)), p_occurred_at
      );

      update public.orders
      set stripe_customer_id = coalesce(stripe_customer_id, p_stripe_customer_id)
      where id = v_order_id
        and (stripe_customer_id is null or stripe_customer_id = p_stripe_customer_id);
      if not found then
        raise exception 'Stripe customer binding mismatch' using errcode = '22023';
      end if;

      update private.payment_reconciliation_alerts
      set alert_state = 'resolved', resolved_at = clock_timestamp(),
          last_observed_at = clock_timestamp()
      where alert_state = 'open'
        and checkout_intent_id = p_checkout_intent_id
        and alert_code in (
          'checkout_expired_attention_required',
          'async_payment_failed_attention_required'
        );
      v_transition_code := 'checkout_paid';
      v_processing_status := 'processed';

    elsif p_event_type in (
      'checkout.session.async_payment_failed', 'checkout.session.expired'
    ) then
      if p_provider_status = 'paid'
        or p_checkout_session_id is null
        or p_checkout_intent_id is null
        or p_amount_total <> 9900
        or lower(p_currency) <> 'usd'
      then
        raise exception 'Terminal Checkout integrity mismatch' using errcode = '22023';
      end if;
      v_alert_code := case p_event_type
        when 'checkout.session.expired' then 'checkout_expired_attention_required'
        else 'async_payment_failed_attention_required'
      end;
      v_order_id := public.record_stripe_operational_event(
        p_event_id, p_event_type, p_checkout_session_id, p_checkout_intent_id,
        p_payment_intent_id, null, null, v_alert_code
      );
      v_transition_code := case when v_order_id is null
        then 'checkout_recoverable_failure'
        else 'stale_terminal_after_payment'
      end;
      v_processing_status := 'processed';

    elsif p_event_type in (
      'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'
    ) then
      if p_payment_intent_id is null or p_charge_id is null
        or p_amount_total <> 9900 or lower(p_currency) <> 'usd'
      then
        raise exception 'Operational payment binding mismatch' using errcode = '22023';
      end if;

      select * into v_order
      from public.orders
      where stripe_payment_intent_id = p_payment_intent_id
      for update;
      if not found
        or v_order.price_cents <> p_amount_total
        or lower(v_order.currency) <> lower(p_currency)
        or (v_order.stripe_customer_id is not null and p_stripe_customer_id is not null
          and v_order.stripe_customer_id <> p_stripe_customer_id)
        or (v_order.stripe_charge_id is not null and v_order.stripe_charge_id <> p_charge_id)
      then
        raise exception 'Operational event order binding mismatch' using errcode = '22023';
      end if;
      v_order_id := v_order.id;
      update public.orders set stripe_charge_id = coalesce(stripe_charge_id, p_charge_id)
      where id = v_order.id;

      if p_event_type = 'charge.refunded' then
        if p_amount_refunded is null or p_amount_refunded <= 0
          or p_amount_refunded > p_amount_total
        then
          raise exception 'Invalid refund amount' using errcode = '22023';
        elsif p_amount_refunded = p_amount_total then
          if v_order.payment_status not in ('refunded', 'dispute_lost') then
            update public.orders set payment_status = 'refunded' where id = v_order.id;
          end if;
          v_alert_code := 'full_refund_recorded';
          v_transition_code := 'full_refund';
        else
          v_alert_code := 'partial_refund_attention_required';
          v_transition_code := 'partial_refund_attention';
        end if;
      elsif p_event_type = 'charge.dispute.created' then
        if v_order.payment_status = 'paid' then
          update public.orders set payment_status = 'disputed' where id = v_order.id;
          v_transition_code := 'dispute_opened';
        else
          v_transition_code := 'stale_dispute_opened';
        end if;
        v_alert_code := 'dispute_opened_attention_required';
      else
        if p_dispute_id is null then
          raise exception 'Closed dispute identifier is required' using errcode = '22023';
        end if;
        if p_provider_status in ('won', 'warning_closed') then
          if v_order.payment_status = 'disputed' then
            update public.orders set payment_status = 'paid' where id = v_order.id;
            v_transition_code := 'dispute_won';
          else
            v_transition_code := 'stale_dispute_won';
          end if;
          v_alert_code := 'dispute_won_recorded';
        elsif p_provider_status = 'lost' then
          if v_order.payment_status <> 'refunded' then
            update public.orders set payment_status = 'dispute_lost' where id = v_order.id;
          end if;
          v_transition_code := 'dispute_lost';
          v_alert_code := 'dispute_lost_attention_required';
        else
          raise exception 'Unsupported closed dispute outcome' using errcode = '22023';
        end if;
      end if;

      insert into private.payment_reconciliation_alerts (
        event_id, event_type, alert_code, alert_state, resolved_at, payment_intent_id,
        charge_id, dispute_id, order_id
      ) values (
        p_event_id, p_event_type, v_alert_code,
        case when v_transition_code in ('full_refund', 'dispute_won')
          then 'resolved' else 'open' end,
        case when v_transition_code in ('full_refund', 'dispute_won')
          then clock_timestamp() else null end,
        p_payment_intent_id, p_charge_id, p_dispute_id, v_order.id
      )
      on conflict (event_id, alert_code) do update
      set occurrence_count = private.payment_reconciliation_alerts.occurrence_count + 1,
          last_observed_at = clock_timestamp();

      if v_transition_code = 'dispute_won' then
        update private.payment_reconciliation_alerts a
        set alert_state = 'resolved', resolved_at = clock_timestamp(),
            last_observed_at = clock_timestamp()
        where a.order_id = v_order.id and a.dispute_id = p_dispute_id
          and a.alert_state = 'open';
      end if;
      v_processing_status := 'processed';

    else
      v_transition_code := 'event_ignored';
      v_processing_status := 'ignored';
    end if;

    if p_test_fail_after_business then
      raise exception 'Synthetic transaction failure' using errcode = '40001';
    end if;

    if v_order_id is not null then
      perform private.sync_checkout_manager_queue(i.id)
      from public.checkout_intents i
      where i.order_id = v_order_id;

      insert into public.activity_events (
        account_id, order_id, event_type, message, metadata_json
      )
      select o.account_id, o.id, 'payment_state_transition',
        'Verified provider payment state transition.',
        jsonb_build_object(
          'stripe_event_id', p_event_id,
          'stripe_event_type', p_event_type,
          'transition_code', v_transition_code
        )
      from public.orders o
      where o.id = v_order_id;
    end if;

    update public.stripe_webhook_receipts
    set processing_status = v_processing_status,
        order_id = v_order_id,
        transition_code = v_transition_code,
        completed_at = clock_timestamp(),
        last_error_code = null
    where event_id = p_event_id;
  exception when others then
    v_error_code := case sqlstate
      when '22023' then 'integrity_mismatch'
      when '40001' then 'retryable_transaction_failure'
      when 'P0002' then 'binding_not_found'
      when '23514' then 'constraint_violation'
      when '23505' then 'identity_conflict'
      when '42501' then 'authorization_failure'
      else 'database_' || lower(sqlstate)
    end;
    update public.stripe_webhook_receipts
    set processing_status = 'failed_retryable',
        transition_code = 'retry_required',
        order_id = null,
        last_error_code = v_error_code,
        completed_at = clock_timestamp()
    where event_id = p_event_id;
    v_processing_status := 'failed_retryable';
    v_transition_code := 'retry_required';
    v_order_id := null;
  end;

  return query select v_processing_status, v_transition_code, v_order_id, v_attempt_count;
end;
$$;

comment on function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) is
  'Only server payment mutation entrypoint: atomically claims, validates, mutates one order graph, synchronizes queue/audit, and completes or retry-fails one verified Stripe event.';

revoke all on function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) to service_role;

-- The route no longer has permission to assemble a payment transition from
-- separate RPC transactions. These routines remain as internal building
-- blocks for the single SECURITY DEFINER transaction above and migration-era
-- evidence only.
revoke all on function public.begin_stripe_webhook_attempt(text, text, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.record_stripe_checkout_failure(text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) from public, anon, authenticated, service_role;

commit;

-- Forward-fix / rollback note: this migration is intentionally irreversible
-- in production. A defect must be fixed by a later migration while the webhook
-- remains fail-closed; restoring a pre-change database requires restoring the
-- matching pre-change application and full database backup together.
