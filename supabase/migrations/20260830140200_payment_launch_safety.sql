-- Restore only the service-role payment boundary required by the exact
-- commercial/payment gates, and harden paid-order finalization against
-- cross-customer or cross-session webhook binding.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.checkout_intents, public.stripe_events, public.orders
  in share row exclusive mode;

create table public.snickerdoodle_order_capacity (
  slot_key text primary key
    check (slot_key = 'standard_99'),
  intent_id uuid not null unique
    references public.checkout_intents (id) on delete cascade,
  checkout_session_id text unique,
  stripe_session_expires_at timestamptz not null,
  reservation_expires_at timestamptz not null,
  capacity_state text not null
    check (capacity_state in ('reserved', 'active', 'released')),
  order_id uuid unique references public.orders (id) on delete set null,
  released_reason text,
  reserved_at timestamptz not null default now(),
  activated_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz not null default now(),
  check (reservation_expires_at >= stripe_session_expires_at + interval '5 minutes'),
  check (
    (capacity_state = 'reserved' and order_id is null and released_at is null)
    or (capacity_state = 'active' and order_id is not null and activated_at is not null and released_at is null)
    or (capacity_state = 'released' and released_at is not null)
  )
);

comment on table public.snickerdoodle_order_capacity is
  'Singleton pre-payment reservation and active-obligation boundary for the one-at-a-time $99 Snickerdoodle service.';

alter table public.snickerdoodle_order_capacity enable row level security;
revoke all privileges on table public.snickerdoodle_order_capacity
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
  v_capacity public.snickerdoodle_order_capacity%rowtype;
begin
  if p_intent_id is null
    or p_stripe_session_expires_at is null
    or p_reservation_expires_at is null
    or p_stripe_session_expires_at <= clock_timestamp() + interval '29 minutes'
    or p_stripe_session_expires_at > clock_timestamp() + interval '24 hours'
    or p_reservation_expires_at < p_stripe_session_expires_at + interval '5 minutes'
    or p_reservation_expires_at > p_stripe_session_expires_at + interval '10 minutes'
  then
    raise exception 'Invalid Checkout capacity reservation window' using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'snickerdoodle_order_capacity_requires_read_committed'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
  );

  select *
  into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found
    or v_intent.amount_cents is distinct from 9900
    or lower(v_intent.currency) is distinct from 'usd'
    or v_intent.status not in ('pending', 'checkout_created')
    or v_intent.order_id is not null
  then
    raise exception 'Checkout intent is not capacity-reservable' using errcode = '22023';
  end if;

  select *
  into v_capacity
  from public.snickerdoodle_order_capacity
  where slot_key = 'standard_99'
  for update;

  if found and v_capacity.capacity_state = 'active' then
    if v_capacity.intent_id = p_intent_id then
      return query select 'same'::text, v_capacity.stripe_session_expires_at;
      return;
    end if;

    if exists (
      select 1
      from public.orders o
      where o.id = v_capacity.order_id
        and (
          o.payment_status = 'refunded'
          or (o.payment_status = 'paid' and o.status = 'closed')
        )
    ) then
      update public.snickerdoodle_order_capacity
      set capacity_state = 'released',
          released_reason = 'order_closed',
          released_at = clock_timestamp(),
          updated_at = clock_timestamp()
      where slot_key = 'standard_99';
      v_capacity.capacity_state := 'released';
    else
      return query select 'unavailable'::text, null::timestamptz;
      return;
    end if;
  end if;

  if found and v_capacity.capacity_state = 'reserved' then
    if v_capacity.intent_id = p_intent_id then
      if v_capacity.reservation_expires_at > clock_timestamp() then
        return query select 'same'::text, v_capacity.stripe_session_expires_at;
        return;
      else
        -- Never infer that an unresolved Stripe payment is dead from the local
        -- clock. A delayed payment may still settle after Checkout closes.
        -- Only the exact signed expiration/failure webhook may release this
        -- reservation; until then the service remains fail-closed.
        return query select 'unavailable'::text, null::timestamptz;
        return;
      end if;
    end if;

    -- A different intent cannot take the slot merely because a local timer
    -- elapsed. The bound Checkout may have a delayed payment in flight, and
    -- an unbound Stripe API result may be ambiguous. Release requires the
    -- exact signed Stripe event handled by record_stripe_checkout_failure.
    return query select 'unavailable'::text, null::timestamptz;
    return;
  end if;

  if exists (
    select 1
    from public.orders o
    where o.package_type = 'standard_99'
      and (
        o.payment_status = 'disputed'
        or (o.payment_status = 'paid' and o.status <> 'closed')
      )
  ) then
    return query select 'unavailable'::text, null::timestamptz;
    return;
  end if;

  insert into public.snickerdoodle_order_capacity (
    slot_key,
    intent_id,
    checkout_session_id,
    stripe_session_expires_at,
    reservation_expires_at,
    capacity_state,
    order_id,
    released_reason,
    reserved_at,
    activated_at,
    released_at,
    updated_at
  ) values (
    'standard_99',
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
    clock_timestamp()
  )
  on conflict (slot_key) do update
  set intent_id = excluded.intent_id,
      checkout_session_id = null,
      stripe_session_expires_at = excluded.stripe_session_expires_at,
      reservation_expires_at = excluded.reservation_expires_at,
      capacity_state = 'reserved',
      order_id = null,
      released_reason = null,
      reserved_at = clock_timestamp(),
      activated_at = null,
      released_at = null,
      updated_at = clock_timestamp()
  where public.snickerdoodle_order_capacity.capacity_state = 'released';

  if not found then
    raise exception 'Checkout capacity reservation changed concurrently'
      using errcode = '40001';
  end if;

  return query select 'reserved'::text, p_stripe_session_expires_at;
end;
$$;

comment on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz) is
  'Transactionally reserves the singleton service slot before Stripe Checkout creation; exact intent retries reuse the original Stripe expiry.';

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
  v_capacity public.snickerdoodle_order_capacity%rowtype;
  v_intent public.checkout_intents%rowtype;
begin
  if p_intent_id is null
    or p_checkout_session_id is null
    or char_length(p_checkout_session_id) not between 3 and 255
    or p_stripe_session_expires_at is null
  then
    raise exception 'Invalid Checkout capacity binding' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
  );

  select *
  into v_capacity
  from public.snickerdoodle_order_capacity
  where slot_key = 'standard_99'
  for update;

  if not found
    or v_capacity.capacity_state <> 'reserved'
    or v_capacity.intent_id <> p_intent_id
    or v_capacity.stripe_session_expires_at is distinct from p_stripe_session_expires_at
    or v_capacity.reservation_expires_at <= clock_timestamp()
    or (
      v_capacity.checkout_session_id is not null
      and v_capacity.checkout_session_id <> p_checkout_session_id
    )
  then
    raise exception 'Checkout Session does not match capacity reservation'
      using errcode = '22023';
  end if;

  select *
  into v_intent
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
    raise exception 'Checkout intent does not match capacity reservation'
      using errcode = '22023';
  end if;

  update public.checkout_intents
  set stripe_checkout_session_id = p_checkout_session_id,
      status = 'checkout_created',
      updated_at = clock_timestamp()
  where id = p_intent_id;

  update public.snickerdoodle_order_capacity
  set checkout_session_id = p_checkout_session_id,
      updated_at = clock_timestamp()
  where slot_key = 'standard_99';
end;
$$;

comment on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz) is
  'Atomically binds the exact Stripe Checkout Session and expiry to the pre-payment capacity reservation.';

-- The $99 human-delivered offer has one fulfillment slot. This partial unique
-- index is the last-resort race guard across every database write path: a paid
-- order releases capacity only at the explicit `closed` lifecycle state, while
-- a dispute keeps the slot occupied even if another status was written.
create unique index if not exists uq_orders_one_active_standard_99
  on public.orders (package_type)
  where package_type = 'standard_99'
    and (
      payment_status = 'disputed'
      or (payment_status = 'paid' and status <> 'closed')
    );

comment on index public.uq_orders_one_active_standard_99 is
  'Fail-closed one-active-order capacity boundary for the single $99 Snickerdoodle service offer.';

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
  v_capacity public.snickerdoodle_order_capacity%rowtype;
  v_active_order_statuses constant text[] := array[
    'new_intake',
    'needs_clarification',
    'ready_for_drafting',
    'drafting',
    'ai_critique',
    'ready_for_human_review',
    'independent_review',
    'revision_needed',
    'approved',
    'packaged',
    'delivered',
    'follow_up_sent'
  ]::text[];
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

  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 0));

  select *
  into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Checkout intent not found' using errcode = 'P0002';
  end if;

  if v_intent.amount_cents is distinct from p_amount_total
    or lower(v_intent.currency) is distinct from lower(btrim(p_currency))
  then
    raise exception 'Checkout does not match intent' using errcode = '22023';
  end if;

  if lower(btrim(v_intent.delivery_email)) is distinct from v_customer_email then
    raise exception 'Checkout customer email does not match intent' using errcode = '22023';
  end if;

  if v_intent.stripe_checkout_session_id is null
    or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
  then
    raise exception 'Checkout Session does not match intent binding' using errcode = '22023';
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
    then
      raise exception 'Stripe event replay does not match stored binding' using errcode = '22023';
    end if;

    select * into v_order
    from public.orders
    where id = v_order_id
    for update;

    if not found then
      raise exception 'Stored Stripe event order is missing' using errcode = 'P0002';
    end if;

    if v_order.stripe_checkout_session_id is distinct from p_checkout_session_id
      or v_order.stripe_payment_intent_id is distinct from p_payment_intent_id
      or v_order.price_cents is distinct from p_amount_total
      or lower(v_order.currency) is distinct from lower(btrim(p_currency))
      or v_order.payment_status = 'unpaid'
    then
      raise exception 'Stored Stripe event order binding is invalid' using errcode = '22023';
    end if;

    return v_order_id;
  end if;

  if v_intent.order_id is not null then
    v_order_id := v_intent.order_id;
    select * into v_order
    from public.orders
    where id = v_order_id
    for update;

    if not found then
      raise exception 'Existing Checkout order is missing' using errcode = 'P0002';
    end if;

    if v_order.stripe_checkout_session_id is distinct from p_checkout_session_id
      or v_order.stripe_payment_intent_id is distinct from p_payment_intent_id
      or v_order.price_cents is distinct from p_amount_total
      or lower(v_order.currency) is distinct from lower(btrim(p_currency))
      or v_order.payment_status = 'unpaid'
    then
      raise exception 'Existing order does not match Checkout binding' using errcode = '22023';
    end if;
  else
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'snickerdoodle_order_capacity_requires_read_committed'
        using errcode = 'P0001';
    end if;

    -- Serialize different Checkout intents before inspecting capacity. Exact
    -- retries and distinct paid events for the same intent return above and do
    -- not consume or contend for another slot.
    perform pg_advisory_xact_lock(
      hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
    );

    select *
    into v_capacity
    from public.snickerdoodle_order_capacity
    where slot_key = 'standard_99'
    for update;

    if not found
      or v_capacity.capacity_state <> 'reserved'
      or v_capacity.intent_id <> p_intent_id
      or v_capacity.checkout_session_id is null
      or v_capacity.checkout_session_id <> p_checkout_session_id
    then
      raise exception 'Paid Checkout does not match a capacity reservation'
        using errcode = '22023';
    end if;

    -- Unknown paid lifecycle values must never silently release capacity.
    if exists (
      select 1
      from public.orders o
      where o.package_type = 'standard_99'
        and o.payment_status = 'paid'
        and o.status <> 'closed'
        and not (o.status = any(v_active_order_statuses))
    ) then
      raise exception 'snickerdoodle_order_capacity_state_unknown'
        using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.orders o
      where o.package_type = 'standard_99'
        and (
          o.payment_status = 'disputed'
          or (
            o.payment_status = 'paid'
            and o.status = any(v_active_order_statuses)
          )
        )
    ) then
      raise exception 'snickerdoodle_order_capacity_exhausted'
        using errcode = 'P0001';
    end if;

    if v_intent.status not in ('pending', 'checkout_created') then
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
    raise exception 'Checkout intent binding changed during finalization' using errcode = '40001';
  end if;

  update public.snickerdoodle_order_capacity
  set capacity_state = 'active',
      order_id = v_order_id,
      activated_at = coalesce(activated_at, clock_timestamp()),
      released_reason = null,
      released_at = null,
      updated_at = clock_timestamp()
  where slot_key = 'standard_99'
    and intent_id = v_intent.id
    and checkout_session_id = p_checkout_session_id
    and capacity_state in ('reserved', 'active')
    and (order_id is null or order_id = v_order_id);

  if not found then
    raise exception 'Checkout capacity binding changed during finalization'
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
  'Idempotently creates or binds a paid order only when amount, currency, customer email, and the database-bound Checkout Session all match the candidate intent.';

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
  v_capacity public.snickerdoodle_order_capacity%rowtype;
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
  perform pg_advisory_xact_lock(
    hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
  );

  select *
  into v_intent
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

  select *
  into v_capacity
  from public.snickerdoodle_order_capacity
  where slot_key = 'standard_99'
  for update;

  if found
    and v_capacity.capacity_state = 'released'
    and v_capacity.intent_id = p_intent_id
    and v_capacity.checkout_session_id = p_checkout_session_id
    and v_capacity.released_reason = p_event_type
    and v_intent.status = 'expired'
  then
    return;
  end if;

  if not found
    or v_capacity.capacity_state <> 'reserved'
    or v_capacity.intent_id <> p_intent_id
    or v_capacity.checkout_session_id is null
    or v_capacity.checkout_session_id <> p_checkout_session_id
  then
    raise exception 'Failed Checkout Session does not match capacity reservation'
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

  update public.snickerdoodle_order_capacity
  set capacity_state = 'released',
      released_reason = p_event_type,
      released_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where slot_key = 'standard_99'
    and intent_id = p_intent_id
    and checkout_session_id = p_checkout_session_id
    and capacity_state = 'reserved';

  if not found then
    raise exception 'Checkout capacity release changed concurrently'
      using errcode = '40001';
  end if;
end;
$$;

comment on function public.record_stripe_checkout_failure(text, text, text, uuid) is
  'Idempotently closes an unpaid intent and releases its reserved slot only when a signed asynchronous-failure or expiration event matches the database-bound Checkout Session.';

-- The assignment migration deliberately removed all historical payment access.
-- Restore only what the gated server routes require; keep customer and staff
-- roles, direct event/receipt access, payment-health access, and Cron closed.
revoke all privileges on table public.checkout_intents
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.checkout_intents to service_role;

revoke all on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_stripe_checkout_capacity(uuid, timestamptz, timestamptz)
  to service_role;

revoke all on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_stripe_checkout_capacity(uuid, text, timestamptz)
  to service_role;

revoke all on function public.consume_checkout_rate_limit(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_checkout_rate_limit(text, text)
  to service_role;

revoke all on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) to service_role;

revoke all on function public.record_stripe_checkout_failure(text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_stripe_checkout_failure(text, text, text, uuid)
  to service_role;

revoke all on function public.begin_stripe_webhook_attempt(text, text, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_stripe_webhook_attempt(text, text, boolean, text)
  to service_role;

revoke all on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  to service_role;

commit;
