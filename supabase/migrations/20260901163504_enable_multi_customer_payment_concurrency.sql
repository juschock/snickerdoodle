-- Replace the accidental package-wide launch slot with one durable reservation
-- per Checkout intent. Historical migrations remain immutable; this forward
-- migration preserves exact intent/session/event safety without serializing
-- unrelated customers.
--
-- Recovery policy: this migration has no destructive down migration. Before a
-- hosted application, take and verify a provider-supported backup. If cutover
-- fails before commit, PostgreSQL rolls back this transaction. If a defect is
-- discovered after commit, preserve all per-intent rows and ship a new reviewed
-- forward fix; do not recreate the singleton row or global unique index.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.checkout_intents,
  public.snickerdoodle_order_capacity,
  public.stripe_events,
  public.stripe_webhook_receipts,
  public.orders,
  private.payment_reconciliation_alerts,
  private.intake_manager_queue
  in share row exclusive mode;

drop index if exists public.uq_orders_one_active_standard_99;

alter table public.snickerdoodle_order_capacity
  rename to stripe_checkout_reservations;

alter table public.stripe_checkout_reservations
  drop column slot_key;

alter table public.stripe_checkout_reservations
  rename column capacity_state to reservation_state;

alter table public.stripe_checkout_reservations
  drop constraint if exists snickerdoodle_order_capacity_intent_id_key,
  add column offer_id text not null default 'standard_99'
    check (offer_id = 'standard_99'),
  add primary key (intent_id);

comment on table public.stripe_checkout_reservations is
  'One fail-closed Stripe Checkout reservation per deterministic local intent; rows never limit or serialize unrelated customers.';

create index stripe_checkout_reservations_state_updated_idx
  on public.stripe_checkout_reservations (reservation_state, updated_at, intent_id);

create index intake_manager_queue_feed_idx
  on private.intake_manager_queue (updated_at desc, queue_receipt_id desc);

create index payment_reconciliation_alerts_open_feed_idx
  on private.payment_reconciliation_alerts (last_observed_at desc, alert_id desc)
  where alert_state = 'open';

revoke all privileges on table public.stripe_checkout_reservations
  from public, anon, authenticated, service_role;

create or replace function public.reserve_stripe_checkout_capacity(
  p_intent_id uuid,
  p_stripe_session_expires_at timestamptz,
  p_reservation_expires_at timestamptz
)
returns table (
  reservation_status text,
  stripe_session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_reservation public.stripe_checkout_reservations%rowtype;
begin
  if p_intent_id is null
    or p_stripe_session_expires_at is null
    or p_reservation_expires_at is null
    or p_stripe_session_expires_at <= clock_timestamp() + interval '29 minutes'
    or p_stripe_session_expires_at > clock_timestamp() + interval '24 hours'
    or p_reservation_expires_at < p_stripe_session_expires_at + interval '5 minutes'
    or p_reservation_expires_at > p_stripe_session_expires_at + interval '10 minutes'
  then
    raise exception 'Invalid Checkout reservation window' using errcode = '22023';
  end if;

  -- Every payment lifecycle routine locks its intent before its reservation.
  -- Different customers therefore touch different rows and never share a key.
  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found
    or v_intent.amount_cents is distinct from 9900
    or lower(v_intent.currency) is distinct from 'usd'
    or v_intent.status not in ('pending', 'checkout_created')
    or v_intent.order_id is not null
  then
    raise exception 'Checkout intent is not reservable' using errcode = '22023';
  end if;

  select * into v_reservation
  from public.stripe_checkout_reservations
  where intent_id = p_intent_id
  for update;

  if found and v_reservation.reservation_state in ('reserved', 'active') then
    return query select 'same'::text, v_reservation.stripe_session_expires_at;
    return;
  end if;

  insert into public.stripe_checkout_reservations (
    intent_id,
    checkout_session_id,
    stripe_session_expires_at,
    reservation_expires_at,
    reservation_state,
    order_id,
    released_reason,
    reserved_at,
    activated_at,
    released_at,
    updated_at,
    offer_id
  ) values (
    p_intent_id,
    null,
    p_stripe_session_expires_at,
    p_reservation_expires_at,
    'reserved',
    null,
    null,
    clock_timestamp(),
    null,
    null,
    clock_timestamp(),
    'standard_99'
  )
  on conflict (intent_id) do update
  set checkout_session_id = null,
      stripe_session_expires_at = excluded.stripe_session_expires_at,
      reservation_expires_at = excluded.reservation_expires_at,
      reservation_state = 'reserved',
      order_id = null,
      released_reason = null,
      reserved_at = clock_timestamp(),
      activated_at = null,
      released_at = null,
      updated_at = clock_timestamp(),
      offer_id = excluded.offer_id
  where public.stripe_checkout_reservations.reservation_state = 'released';

  if not found then
    raise exception 'Checkout reservation changed concurrently'
      using errcode = '40001';
  end if;

  return query select 'reserved'::text, p_stripe_session_expires_at;
end;
$$;

comment on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz) is
  'Creates or reuses one exact per-intent Checkout reservation without inspecting or blocking any other customer.';

create or replace function public.bind_stripe_checkout_capacity(
  p_intent_id uuid,
  p_checkout_session_id text,
  p_stripe_session_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_reservation public.stripe_checkout_reservations%rowtype;
begin
  if p_intent_id is null
    or p_checkout_session_id is null
    or char_length(p_checkout_session_id) not between 3 and 255
    or p_stripe_session_expires_at is null
  then
    raise exception 'Invalid Checkout reservation binding' using errcode = '22023';
  end if;

  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found
    or v_intent.status not in ('pending', 'checkout_created')
    or v_intent.order_id is not null
    or (
      v_intent.stripe_checkout_session_id is not null
      and v_intent.stripe_checkout_session_id <> p_checkout_session_id
    )
  then
    raise exception 'Checkout intent does not match reservation'
      using errcode = '22023';
  end if;

  select * into v_reservation
  from public.stripe_checkout_reservations
  where intent_id = p_intent_id
  for update;

  if not found
    or v_reservation.reservation_state <> 'reserved'
    or v_reservation.stripe_session_expires_at is distinct from p_stripe_session_expires_at
    or v_reservation.reservation_expires_at <= clock_timestamp()
    or (
      v_reservation.checkout_session_id is not null
      and v_reservation.checkout_session_id <> p_checkout_session_id
    )
  then
    raise exception 'Checkout Session does not match reservation'
      using errcode = '22023';
  end if;

  update public.checkout_intents
  set stripe_checkout_session_id = p_checkout_session_id,
      status = 'checkout_created',
      updated_at = clock_timestamp()
  where id = p_intent_id;

  update public.stripe_checkout_reservations
  set checkout_session_id = p_checkout_session_id,
      updated_at = clock_timestamp()
  where intent_id = p_intent_id;
end;
$$;

comment on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz) is
  'Atomically binds one exact Stripe Checkout Session to its own local intent reservation.';

create or replace function public.compensate_stripe_checkout_setup(
  p_intent_id uuid,
  p_checkout_session_id text,
  p_provider_session_expired boolean,
  p_reason_code text
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
  v_resolution text;
begin
  if p_intent_id is null
    or p_provider_session_expired is null
    or p_reason_code is null
    or p_reason_code !~ '^[a-z][a-z0-9_]{2,99}$'
    or (p_checkout_session_id is not null
      and char_length(p_checkout_session_id) not between 3 and 255)
    or (p_provider_session_expired and p_checkout_session_id is null)
  then
    raise exception 'Invalid Checkout setup compensation' using errcode = '22023';
  end if;

  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Checkout setup compensation intent is missing'
      using errcode = 'P0002';
  end if;

  select * into v_reservation
  from public.stripe_checkout_reservations
  where intent_id = p_intent_id
  for update;

  if not found
    or v_reservation.reservation_state <> 'reserved'
    or v_intent.order_id is not null
    or v_intent.status = 'paid'
    or (
      v_reservation.checkout_session_id is not null
      and v_reservation.checkout_session_id is distinct from p_checkout_session_id
    )
    or (
      v_intent.stripe_checkout_session_id is not null
      and v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
    )
  then
    raise exception 'Checkout setup compensation does not match reservation'
      using errcode = '22023';
  end if;

  v_event_id := left(
    'setup:' || p_intent_id::text || ':' || coalesce(p_checkout_session_id, 'no_session'),
    255
  );

  if p_provider_session_expired then
    update public.checkout_intents
    set stripe_checkout_session_id = p_checkout_session_id,
        status = 'expired',
        updated_at = clock_timestamp()
    where id = p_intent_id;

    update public.stripe_checkout_reservations
    set reservation_state = 'released',
        checkout_session_id = p_checkout_session_id,
        released_reason = 'checkout.session.expired',
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where intent_id = p_intent_id;

    v_resolution := 'released';
  elsif (
    p_checkout_session_id is null
    and p_reason_code = 'capacity_expiry_margin_too_short'
    and not exists (
      select 1
      from private.payment_reconciliation_alerts a
      where a.checkout_intent_id = p_intent_id
        and a.event_type = 'checkout.session.setup'
        and a.alert_state = 'open'
    )
  ) then
    update public.checkout_intents
    set stripe_checkout_session_id = null,
        status = 'pending',
        updated_at = clock_timestamp()
    where id = p_intent_id;

    update public.stripe_checkout_reservations
    set reservation_state = 'released',
        checkout_session_id = null,
        released_reason = p_reason_code,
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where intent_id = p_intent_id;

    v_resolution := 'released';
  elsif p_checkout_session_id is not null then
    update public.checkout_intents
    set stripe_checkout_session_id = p_checkout_session_id,
        status = 'checkout_created',
        updated_at = clock_timestamp()
    where id = p_intent_id;

    update public.stripe_checkout_reservations
    set checkout_session_id = p_checkout_session_id,
        updated_at = clock_timestamp()
    where intent_id = p_intent_id;

    v_resolution := 'reconciliation_required';
  else
    v_resolution := 'reconciliation_required';
  end if;

  insert into private.payment_reconciliation_alerts (
    event_id,
    event_type,
    alert_code,
    alert_state,
    checkout_intent_id,
    checkout_session_id,
    resolved_at
  ) values (
    v_event_id,
    'checkout.session.setup',
    p_reason_code,
    case when v_resolution = 'released' then 'resolved' else 'open' end,
    p_intent_id,
    p_checkout_session_id,
    case when v_resolution = 'released' then clock_timestamp() else null end
  )
  on conflict (event_id, alert_code) do update
  set alert_state = excluded.alert_state,
      checkout_session_id = excluded.checkout_session_id,
      occurrence_count = private.payment_reconciliation_alerts.occurrence_count + 1,
      last_observed_at = clock_timestamp(),
      resolved_at = excluded.resolved_at;

  return v_resolution;
end;
$$;

comment on function public.compensate_stripe_checkout_setup(uuid, text, boolean, text) is
  'Reconciles only the named intent reservation after a proven-expired or ambiguous Stripe Session setup result.';

create or replace function public.resolve_stripe_checkout_setup(
  p_intent_id uuid,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_intent_id is null
    or p_checkout_session_id is null
    or char_length(p_checkout_session_id) not between 3 and 255
  then
    raise exception 'Invalid Checkout setup resolution' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.checkout_intents i
    join public.stripe_checkout_reservations r on r.intent_id = i.id
    where i.id = p_intent_id
      and i.stripe_checkout_session_id = p_checkout_session_id
      and i.status = 'checkout_created'
      and r.checkout_session_id = p_checkout_session_id
      and r.reservation_state = 'reserved'
  ) then
    raise exception 'Checkout setup resolution is not fully bound'
      using errcode = '22023';
  end if;

  update private.payment_reconciliation_alerts
  set alert_state = 'resolved',
      resolved_at = clock_timestamp(),
      last_observed_at = clock_timestamp()
  where checkout_intent_id = p_intent_id
    and event_type = 'checkout.session.setup'
    and alert_state = 'open';
end;
$$;

comment on function public.resolve_stripe_checkout_setup(uuid, text) is
  'Resolves setup ambiguity only after one intent and its reservation carry the same exact Session.';

create or replace function public.finalize_stripe_checkout(
  p_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_intent_id uuid,
  p_amount_total integer,
  p_currency text,
  p_customer_email text,
  p_paid_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_reservation public.stripe_checkout_reservations%rowtype;
  v_brief jsonb;
  v_account_id uuid;
  v_contact_id uuid;
  v_campaign_id uuid;
  v_order_id uuid;
  v_contact_name text;
  v_campaign_type text;
  v_tone text;
  v_customer_email text;
  v_existing_event_type text;
  v_existing_session_id text;
  v_order public.orders%rowtype;
begin
  if p_event_type not in (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded'
  ) then
    raise exception 'Unsupported paid Checkout event type' using errcode = '22023';
  end if;

  if p_event_id is null or char_length(p_event_id) not between 3 and 255
    or p_checkout_session_id is null
    or char_length(p_checkout_session_id) not between 3 and 255
    or p_payment_intent_id is null
    or char_length(p_payment_intent_id) not between 3 and 255
    or p_intent_id is null
    or p_paid_at is null
  then
    raise exception 'Invalid paid Checkout identifiers' using errcode = '22023';
  end if;

  v_customer_email := lower(btrim(coalesce(p_customer_email, '')));
  if char_length(v_customer_email) not between 3 and 320 then
    raise exception 'Invalid Checkout customer email' using errcode = '22023';
  end if;

  if p_amount_total is distinct from 9900
    or lower(btrim(p_currency)) is distinct from 'usd'
  then
    raise exception 'Unexpected checkout amount or currency' using errcode = '22023';
  end if;

  -- Event locks deduplicate one provider event. The intent row then serializes
  -- only terminal transitions for this customer. No package-wide lock exists.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));

  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Checkout intent not found' using errcode = 'P0002';
  end if;

  if v_intent.amount_cents is distinct from p_amount_total
    or lower(v_intent.currency) is distinct from lower(btrim(p_currency))
    or lower(btrim(v_intent.delivery_email)) is distinct from v_customer_email
    or v_intent.stripe_checkout_session_id is null
    or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
  then
    raise exception 'Checkout does not match intent binding' using errcode = '22023';
  end if;

  select * into v_reservation
  from public.stripe_checkout_reservations
  where intent_id = p_intent_id
  for update;

  if not found
    or v_reservation.checkout_session_id is null
    or v_reservation.checkout_session_id is distinct from p_checkout_session_id
    or v_reservation.reservation_state not in ('reserved', 'active')
  then
    raise exception 'Paid Checkout does not match reservation'
      using errcode = '22023';
  end if;

  select se.order_id, se.event_type, se.checkout_session_id
  into v_order_id, v_existing_event_type, v_existing_session_id
  from public.stripe_events se
  where se.event_id = p_event_id;

  if found then
    if v_order_id is null
      or v_existing_event_type is distinct from p_event_type
      or v_existing_session_id is distinct from p_checkout_session_id
      or v_intent.order_id is distinct from v_order_id
      or v_reservation.order_id is distinct from v_order_id
    then
      raise exception 'Stripe event replay does not match stored binding'
        using errcode = '22023';
    end if;

    select * into v_order
    from public.orders
    where id = v_order_id
    for update;

    if not found
      or v_order.stripe_checkout_session_id is distinct from p_checkout_session_id
      or v_order.stripe_payment_intent_id is distinct from p_payment_intent_id
      or v_order.price_cents is distinct from p_amount_total
      or lower(v_order.currency) is distinct from lower(btrim(p_currency))
      or v_order.payment_status = 'unpaid'
    then
      raise exception 'Stored Stripe event order binding is invalid'
        using errcode = '22023';
    end if;

    return v_order_id;
  end if;

  if v_intent.order_id is not null then
    v_order_id := v_intent.order_id;
    select * into v_order
    from public.orders
    where id = v_order_id
    for update;

    if not found
      or v_reservation.reservation_state <> 'active'
      or v_reservation.order_id is distinct from v_order_id
      or v_order.stripe_checkout_session_id is distinct from p_checkout_session_id
      or v_order.stripe_payment_intent_id is distinct from p_payment_intent_id
      or v_order.price_cents is distinct from p_amount_total
      or lower(v_order.currency) is distinct from lower(btrim(p_currency))
      or v_order.payment_status = 'unpaid'
    then
      raise exception 'Existing order does not match Checkout binding'
        using errcode = '22023';
    end if;
  else
    if v_reservation.reservation_state <> 'reserved'
      or v_reservation.order_id is not null
      or v_intent.status not in ('pending', 'checkout_created')
    then
      raise exception 'Checkout intent is not payable' using errcode = '22023';
    end if;

    v_brief := v_intent.brief_json;
    v_contact_name := coalesce(
      nullif(v_brief ->> 'contactName', ''),
      split_part(v_customer_email, '@', 1)
    );
    v_campaign_type := case
      when v_brief ->> 'campaignType' = 'Other' then v_brief ->> 'campaignTypeOther'
      else v_brief ->> 'campaignType'
    end;
    v_tone := case
      when v_brief ->> 'tone' = 'Other' then v_brief ->> 'toneOther'
      else v_brief ->> 'tone'
    end;

    insert into public.accounts (name, account_type, website, status, source)
    values (
      v_brief ->> 'organizationName',
      v_brief ->> 'organizationType',
      nullif(v_brief ->> 'websiteSocial', ''),
      'active',
      'stripe_checkout'
    )
    returning id into v_account_id;

    insert into public.contacts (account_id, name, email, is_primary)
    values (v_account_id, v_contact_name, v_customer_email, true)
    returning id into v_contact_id;

    insert into public.campaigns (
      account_id, name, campaign_family, primary_action, status
    ) values (
      v_account_id,
      v_brief ->> 'campaignName',
      v_brief ->> 'campaignFamily',
      v_brief ->> 'primaryAction',
      'active'
    )
    returning id into v_campaign_id;

    insert into public.orders (
      campaign_id,
      account_id,
      primary_contact_id,
      package_type,
      price_cents,
      status,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      payment_status,
      paid_at,
      currency
    ) values (
      v_campaign_id,
      v_account_id,
      v_contact_id,
      'standard_99',
      p_amount_total,
      'new_intake',
      p_checkout_session_id,
      p_payment_intent_id,
      'paid',
      p_paid_at,
      lower(btrim(p_currency))
    )
    returning id into v_order_id;

    insert into public.briefs (
      order_id,
      raw_submission_json,
      organization_name,
      campaign_name,
      campaign_type,
      date_time,
      location_or_link,
      target_audience,
      main_goal,
      offer_or_ask,
      key_details,
      tone,
      channels_needed,
      website_social_links,
      phrases_to_include,
      phrases_to_avoid,
      additional_notes,
      delivery_email
    ) values (
      v_order_id,
      v_brief,
      v_brief ->> 'organizationName',
      v_brief ->> 'campaignName',
      v_campaign_type,
      v_brief ->> 'dateTime',
      v_brief ->> 'locationOrLink',
      v_brief ->> 'audience',
      v_brief ->> 'mainGoal',
      v_brief ->> 'offerAsk',
      v_brief ->> 'keyDetails',
      v_tone,
      array_to_string(array(
        select jsonb_array_elements_text(v_brief -> 'channels')
      ), ', '),
      v_brief ->> 'websiteSocial',
      v_brief ->> 'phrasesInclude',
      v_brief ->> 'phrasesAvoid',
      v_brief ->> 'additionalNotes',
      v_customer_email
    );

    insert into public.activity_events (
      account_id, order_id, event_type, message, metadata_json
    ) values (
      v_account_id,
      v_order_id,
      'payment_received',
      'Stripe payment received; order created from customer survey.',
      jsonb_build_object(
        'source', 'stripe_checkout',
        'amount_cents', p_amount_total,
        'currency', lower(btrim(p_currency))
      )
    );
  end if;

  update public.checkout_intents
  set status = 'paid',
      order_id = v_order_id,
      updated_at = clock_timestamp()
  where id = v_intent.id
    and stripe_checkout_session_id = p_checkout_session_id;

  if not found then
    raise exception 'Checkout intent binding changed during finalization'
      using errcode = '40001';
  end if;

  update public.stripe_checkout_reservations
  set reservation_state = 'active',
      order_id = v_order_id,
      activated_at = coalesce(activated_at, clock_timestamp()),
      released_reason = null,
      released_at = null,
      updated_at = clock_timestamp()
  where intent_id = v_intent.id
    and checkout_session_id = p_checkout_session_id
    and reservation_state in ('reserved', 'active')
    and (order_id is null or order_id = v_order_id);

  if not found then
    raise exception 'Checkout reservation changed during finalization'
      using errcode = '40001';
  end if;

  insert into public.stripe_events (
    event_id, event_type, checkout_session_id, order_id
  ) values (
    p_event_id, p_event_type, p_checkout_session_id, v_order_id
  );

  return v_order_id;
end;
$$;

comment on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) is
  'Idempotently finalizes one exact paid intent and independent customer graph without package-wide serialization.';

create or replace function public.record_stripe_checkout_failure(
  p_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_intent_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.checkout_intents%rowtype;
  v_reservation public.stripe_checkout_reservations%rowtype;
begin
  if p_event_type not in (
    'checkout.session.async_payment_failed',
    'checkout.session.expired'
  ) then
    raise exception 'Unsupported failed Checkout event type' using errcode = '22023';
  end if;

  if p_event_id is null or char_length(p_event_id) not between 3 and 255
    or p_checkout_session_id is null
    or char_length(p_checkout_session_id) not between 3 and 255
    or p_intent_id is null
  then
    raise exception 'Invalid failed Checkout identifiers' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));

  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Checkout intent not found' using errcode = 'P0002';
  end if;

  if v_intent.stripe_checkout_session_id is null
    or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
  then
    raise exception 'Failed Checkout Session does not match intent binding'
      using errcode = '22023';
  end if;

  if v_intent.status = 'paid' or v_intent.order_id is not null then
    raise exception 'A paid Checkout intent cannot be failed' using errcode = '22023';
  end if;

  select * into v_reservation
  from public.stripe_checkout_reservations
  where intent_id = p_intent_id
  for update;

  if found
    and v_reservation.reservation_state = 'released'
    and v_reservation.checkout_session_id = p_checkout_session_id
    and v_reservation.released_reason = p_event_type
    and v_intent.status = 'expired'
  then
    return;
  end if;

  if not found
    or v_reservation.reservation_state <> 'reserved'
    or v_reservation.checkout_session_id is null
    or v_reservation.checkout_session_id <> p_checkout_session_id
  then
    raise exception 'Failed Checkout Session does not match reservation'
      using errcode = '22023';
  end if;

  update public.checkout_intents
  set status = 'expired',
      updated_at = clock_timestamp()
  where id = v_intent.id
    and stripe_checkout_session_id = p_checkout_session_id
    and status in ('pending', 'checkout_created', 'expired');

  if not found then
    raise exception 'Checkout intent is not fail-able' using errcode = '22023';
  end if;

  update public.stripe_checkout_reservations
  set reservation_state = 'released',
      released_reason = p_event_type,
      released_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where intent_id = p_intent_id
    and checkout_session_id = p_checkout_session_id
    and reservation_state = 'reserved';

  if not found then
    raise exception 'Checkout reservation release changed concurrently'
      using errcode = '40001';
  end if;
end;
$$;

comment on function public.record_stripe_checkout_failure(text, text, text, uuid) is
  'Idempotently expires only the exact unpaid intent/reservation named by a verified terminal Checkout event.';

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
  'Idempotently records one verified Checkout/refund/dispute event and mutates only its exact intent or order.';

drop function private.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
);

-- SECURITY DEFINER audit: every changed function pins an empty search_path;
-- all relation/function names are schema-qualified; public/browser roles have
-- no execution path. Only the server-side service role receives the exact RPCs
-- used by the checkout and verified-webhook routes.
revoke all on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz)
  to service_role;

revoke all on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz)
  to service_role;

revoke all on function public.compensate_stripe_checkout_setup(uuid, text, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.compensate_stripe_checkout_setup(uuid, text, boolean, text)
  to service_role;

revoke all on function public.resolve_stripe_checkout_setup(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_stripe_checkout_setup(uuid, text)
  to service_role;

revoke all on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) to service_role;

revoke all on function public.record_stripe_checkout_failure(text, text, text, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) to service_role;

commit;
