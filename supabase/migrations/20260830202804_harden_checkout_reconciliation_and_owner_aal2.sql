-- Close the remaining local payment/operations launch blockers without
-- widening provider authority.  This migration is deliberately service-role
-- only for payment mutation and authenticated+AAL2+owner only for customer
-- content reads.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.checkout_intents,
  public.snickerdoodle_order_capacity,
  public.stripe_webhook_receipts,
  public.orders,
  private.intake_manager_queue
  in share row exclusive mode;

create table private.payment_reconciliation_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  alert_code text not null
    check (alert_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  alert_state text not null default 'open'
    check (alert_state in ('open', 'resolved')),
  checkout_intent_id uuid references public.checkout_intents (id) on delete set null,
  checkout_session_id text,
  payment_intent_id text,
  charge_id text,
  dispute_id text,
  order_id uuid references public.orders (id) on delete set null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_observed_at timestamptz not null default clock_timestamp(),
  last_observed_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique (event_id, alert_code),
  check (char_length(event_id) between 3 and 255),
  check (char_length(event_type) between 3 and 255),
  check (checkout_session_id is null or char_length(checkout_session_id) between 3 and 255),
  check (payment_intent_id is null or char_length(payment_intent_id) between 3 and 255),
  check (charge_id is null or char_length(charge_id) between 3 and 255),
  check (dispute_id is null or char_length(dispute_id) between 3 and 255),
  check (
    (alert_state = 'open' and resolved_at is null)
    or (alert_state = 'resolved' and resolved_at is not null)
  )
);

comment on table private.payment_reconciliation_alerts is
  'Idempotent metadata-only operator alerts for Checkout setup, expiry, asynchronous failure, refund, and dispute reconciliation. Never stores raw Stripe payloads, customer content, email, card data, or secrets.';

create index payment_reconciliation_alerts_open_order_idx
  on private.payment_reconciliation_alerts (order_id, last_observed_at desc)
  where alert_state = 'open';

create index payment_reconciliation_alerts_open_intent_idx
  on private.payment_reconciliation_alerts (checkout_intent_id, last_observed_at desc)
  where alert_state = 'open';

alter table private.payment_reconciliation_alerts enable row level security;
alter table private.payment_reconciliation_alerts force row level security;
revoke all privileges on table private.payment_reconciliation_alerts
  from public, anon, authenticated, service_role;

-- If Stripe Session creation fails, release the unbound reservation.  If a
-- Session was created but binding failed, either release it after the caller
-- proves the provider Session was expired, or atomically bind it and open a
-- reconciliation alert.  There is no state in which a live provider Session
-- is silently detached from the singleton capacity record.
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
  v_capacity public.snickerdoodle_order_capacity%rowtype;
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

  perform pg_advisory_xact_lock(
    hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
  );

  select * into v_intent
  from public.checkout_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Checkout setup compensation intent is missing'
      using errcode = 'P0002';
  end if;

  select * into v_capacity
  from public.snickerdoodle_order_capacity
  where slot_key = 'standard_99'
  for update;

  if not found
    or v_capacity.capacity_state <> 'reserved'
    or v_capacity.intent_id <> p_intent_id
    or v_intent.order_id is not null
    or v_intent.status = 'paid'
    or (
      v_capacity.checkout_session_id is not null
      and v_capacity.checkout_session_id is distinct from p_checkout_session_id
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
    -- Preserve an exact, non-payable tombstone binding. Stripe can emit the
    -- signed expiration event after its expire API returns; retaining the
    -- Session on the already-released intent/capacity lets that event become
    -- an idempotent durable alert instead of a binding failure/retry storm.
    update public.checkout_intents
    set stripe_checkout_session_id = p_checkout_session_id,
        status = 'expired',
        updated_at = clock_timestamp()
    where id = p_intent_id;

    update public.snickerdoodle_order_capacity
    set capacity_state = 'released',
        checkout_session_id = p_checkout_session_id,
        released_reason = 'checkout.session.expired',
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where slot_key = 'standard_99';

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

    update public.snickerdoodle_order_capacity
    set capacity_state = 'released',
        checkout_session_id = null,
        released_reason = p_reason_code,
        released_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where slot_key = 'standard_99';

    v_resolution := 'released';
  elsif p_checkout_session_id is not null then
    update public.checkout_intents
    set stripe_checkout_session_id = p_checkout_session_id,
        status = 'checkout_created',
        updated_at = clock_timestamp()
    where id = p_intent_id;

    update public.snickerdoodle_order_capacity
    set checkout_session_id = p_checkout_session_id,
        updated_at = clock_timestamp()
    where slot_key = 'standard_99';

    v_resolution := 'reconciliation_required';
  else
    -- A transport failure can occur after Stripe accepted an idempotent
    -- create but before its response arrived. Keep the exact reservation and
    -- make the ambiguity explicit; the next exact retry uses the same Stripe
    -- idempotency key and can bind the returned Session.
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
  'Atomically releases a proven-absent/expired Session reservation or binds an ambiguous live Session and opens a metadata-only reconciliation alert.';

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
    join public.snickerdoodle_order_capacity c
      on c.intent_id = i.id
     and c.slot_key = 'standard_99'
    where i.id = p_intent_id
      and i.stripe_checkout_session_id = p_checkout_session_id
      and i.status = 'checkout_created'
      and c.checkout_session_id = p_checkout_session_id
      and c.capacity_state = 'reserved'
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
  'Resolves prior Session-creation ambiguity only after the intent and singleton reservation carry the same exact bound Session.';

-- Put every paid-finalization and unpaid-terminal path behind the same global
-- capacity lock before either one can lock an intent row. The predecessor paid
-- routine is retained privately so its reviewed order-graph logic stays byte
-- stable while application roles cannot bypass the serialized wrapper.
alter function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) set schema private;

revoke all on function private.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;

create function public.finalize_stripe_checkout(
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
begin
  perform pg_advisory_xact_lock(
    hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
  );

  return private.finalize_stripe_checkout(
    p_event_id,
    p_event_type,
    p_checkout_session_id,
    p_payment_intent_id,
    p_intent_id,
    p_amount_total,
    p_currency,
    p_customer_email,
    p_paid_at
  );
end;
$$;

comment on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) is
  'Serializes the exact paid Checkout graph finalizer behind the same global capacity lock used by terminal unpaid events.';

-- Persist every verified non-success payment lifecycle event before the HTTP
-- handler acknowledges it.  Checkout failures release only their exact bound
-- reservation; refunds and disputes remain operator-reviewed and do not infer
-- settlement outcome from an incomplete event projection.
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
    perform pg_advisory_xact_lock(
      hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
    );

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
  'Idempotently records verified Checkout failure, refund, and dispute state plus a metadata-only operator alert before a successful webhook acknowledgement.';

-- A successfully handled operational event may have no order yet (for
-- example, an expired Checkout).  It is process-complete only when its alert
-- exists in the same database.
create or replace function public.complete_stripe_webhook_attempt(
  p_event_id text,
  p_processing_status text,
  p_order_id uuid default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error_code text;
begin
  if p_processing_status not in ('processed', 'ignored', 'failed') then
    raise exception 'Invalid webhook completion status' using errcode = '22023';
  end if;

  if p_processing_status = 'processed'
    and p_order_id is null
    and not exists (
      select 1
      from private.payment_reconciliation_alerts a
      where a.event_id = p_event_id
    )
  then
    raise exception 'Processed webhook must reference an order or durable reconciliation alert'
      using errcode = '22023';
  end if;

  if p_processing_status = 'failed' then
    v_error_code := nullif(
      left(
        regexp_replace(
          regexp_replace(lower(coalesce(p_error_code, '')), '[^a-z0-9_.-]+', '_', 'g'),
          '^[^a-z0-9]+',
          ''
        ),
        100
      ),
      ''
    );
    v_error_code := coalesce(v_error_code, 'unspecified_failure');
  end if;

  update public.stripe_webhook_receipts
  set processing_status = p_processing_status,
      order_id = coalesce(p_order_id, order_id),
      last_error_code = v_error_code,
      completed_at = clock_timestamp()
  where event_id = p_event_id;

  if not found then
    raise exception 'Stripe webhook receipt was not started' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function private.is_owner_aal2()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select (select private.is_owner())
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

comment on function private.is_owner_aal2() is
  'True only for an active owner with a live Supabase Auth session whose current JWT assurance level is AAL2.';

create table private.owner_paid_brief_access_receipts (
  access_receipt_id bigint generated always as identity primary key,
  actor_profile_id uuid not null,
  checkout_intent_id uuid not null,
  order_id uuid not null,
  accessed_at timestamptz not null default clock_timestamp()
);

comment on table private.owner_paid_brief_access_receipts is
  'Metadata-only AAL2 owner access receipt for full paid-intake retrieval; contains no customer content or contact values.';

alter table private.owner_paid_brief_access_receipts enable row level security;
alter table private.owner_paid_brief_access_receipts force row level security;
revoke all privileges on table private.owner_paid_brief_access_receipts
  from public, anon, authenticated, service_role;
revoke all privileges on sequence private.owner_paid_brief_access_receipts_access_receipt_id_seq
  from public, anon, authenticated, service_role;

drop function public.read_intake_manager_queue(integer);

create function public.read_intake_manager_queue(
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_queue_receipt_id uuid default null
)
returns table (
  queue_receipt_id uuid,
  intake_kind text,
  intake_id uuid,
  queue_state text,
  payment_state text,
  order_id uuid,
  terms_version text,
  reconciliation_status text,
  latest_alert_code text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_returned_count integer;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Manager queue limit must be between 1 and 100'
      using errcode = '22023';
  end if;

  if (p_before_updated_at is null) <> (p_before_queue_receipt_id is null) then
    raise exception 'Manager queue cursor must be complete'
      using errcode = '22023';
  end if;

  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required'
      using errcode = '42501';
  end if;

  v_actor_id := (select auth.uid());

  return query
    with queue_feed as (
      select
        q.queue_receipt_id,
        q.intake_kind,
        q.intake_id,
        q.queue_state,
        q.payment_state,
        q.order_id,
        q.terms_version,
        case when a.alert_code is null then 'clear' else 'attention_required' end
          as reconciliation_status,
        a.alert_code as latest_alert_code,
        q.created_at,
        greatest(q.updated_at, coalesce(a.last_observed_at, q.updated_at)) as feed_updated_at
      from private.intake_manager_queue q
      left join lateral (
        select pra.alert_code, pra.last_observed_at
        from private.payment_reconciliation_alerts pra
        where pra.alert_state = 'open'
          and q.intake_kind = 'checkout'
          and (
            pra.checkout_intent_id = q.intake_id
            or (q.order_id is not null and pra.order_id = q.order_id)
          )
        order by pra.last_observed_at desc, pra.alert_id desc
        limit 1
      ) a on true
    ),
    orphan_alert_feed as (
      select
        a.alert_id as queue_receipt_id,
        'reconciliation_alert'::text as intake_kind,
        a.alert_id as intake_id,
        'attention_required'::text as queue_state,
        a.event_type as payment_state,
        a.order_id,
        null::text as terms_version,
        'attention_required'::text as reconciliation_status,
        a.alert_code as latest_alert_code,
        a.first_observed_at as created_at,
        a.last_observed_at as feed_updated_at
      from private.payment_reconciliation_alerts a
      where a.alert_state = 'open'
        and not exists (
          select 1
          from private.intake_manager_queue q
          where q.intake_kind = 'checkout'
            and (
              (a.checkout_intent_id is not null and q.intake_id = a.checkout_intent_id)
              or (a.order_id is not null and q.order_id = a.order_id)
            )
        )
    ),
    feed as (
      select * from queue_feed
      union all
      select * from orphan_alert_feed
    )
    select
      f.queue_receipt_id,
      f.intake_kind,
      f.intake_id,
      f.queue_state,
      f.payment_state,
      f.order_id,
      f.terms_version,
      f.reconciliation_status,
      f.latest_alert_code,
      f.created_at,
      f.feed_updated_at as updated_at
    from feed f
    where p_before_updated_at is null
      or (f.feed_updated_at, f.queue_receipt_id)
        < (p_before_updated_at, p_before_queue_receipt_id)
    order by f.feed_updated_at desc, f.queue_receipt_id desc
    limit p_limit;

  get diagnostics v_returned_count = row_count;

  insert into private.intake_manager_queue_access_receipts (
    actor_profile_id,
    returned_count
  ) values (
    v_actor_id,
    v_returned_count
  );
end;
$$;

comment on function public.read_intake_manager_queue(integer, timestamptz, uuid) is
  'Returns a keyset-paginated newest-first privacy-safe intake/payment feed plus globally visible orphan reconciliation alerts only to a live AAL2 owner and writes an access receipt.';

create or replace function public.read_owner_paid_brief(
  p_intent_id uuid
)
returns table (
  checkout_intent_id uuid,
  order_id uuid,
  order_status text,
  payment_status text,
  terms_version text,
  delivery_email text,
  brief_json jsonb,
  assignments jsonb,
  reconciliation_status text,
  reconciliation_alerts jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_intent public.checkout_intents%rowtype;
  v_order public.orders%rowtype;
  v_assignments jsonb;
  v_alerts jsonb;
begin
  if p_intent_id is null then
    raise exception 'Checkout intent is required' using errcode = '22023';
  end if;

  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required'
      using errcode = '42501';
  end if;

  v_actor_id := (select auth.uid());

  select i.* into v_intent
  from public.checkout_intents i
  where i.id = p_intent_id
    and i.status = 'paid'
    and i.order_id is not null;

  if not found then
    raise exception 'Paid Checkout intent not found' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.orders
  where id = v_intent.order_id;

  if not found or v_order.payment_status not in ('paid', 'refunded', 'disputed') then
    raise exception 'Paid order not found' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assignment_id', a.id,
        'assignment_role', a.assignment_role,
        'lifecycle_status', a.lifecycle_status,
        'starts_at', a.starts_at,
        'expires_at', a.expires_at
      ) order by a.assignment_role, a.id
    ),
    '[]'::jsonb
  ) into v_assignments
  from public.engagement_assignments a
  where a.order_id = v_order.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'alert_code', a.alert_code,
        'alert_state', a.alert_state,
        'last_observed_at', a.last_observed_at
      ) order by a.last_observed_at desc, a.alert_id
    ),
    '[]'::jsonb
  ) into v_alerts
  from private.payment_reconciliation_alerts a
  where a.checkout_intent_id = v_intent.id
     or a.order_id = v_order.id;

  insert into private.owner_paid_brief_access_receipts (
    actor_profile_id,
    checkout_intent_id,
    order_id
  ) values (
    v_actor_id,
    v_intent.id,
    v_order.id
  );

  return query select
    v_intent.id,
    v_order.id,
    v_order.status,
    v_order.payment_status,
    v_intent.terms_version,
    v_intent.delivery_email,
    v_intent.brief_json,
    v_assignments,
    case when exists (
      select 1
      from private.payment_reconciliation_alerts a
      where a.alert_state = 'open'
        and (a.checkout_intent_id = v_intent.id or a.order_id = v_order.id)
    ) then 'attention_required' else 'clear' end,
    v_alerts;
end;
$$;

comment on function public.read_owner_paid_brief(uuid) is
  'Returns one paid customer brief, assignment status, and reconciliation status only to a live AAL2 owner and records metadata-only access.';

-- The low-level failure routine mutates the intent/capacity lifecycle but does
-- not create the successor's durable reconciliation alert. Keep it callable
-- only inside the owner-executed SECURITY DEFINER wrapper so the service role
-- cannot bypass receipt/alert creation. The application inserts and reads
-- candidate-bound intents directly; all lifecycle mutations occur through RPCs.
revoke all on function public.record_stripe_checkout_failure(text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke update on table public.checkout_intents from service_role;

revoke all on function public.compensate_stripe_checkout_setup(uuid, text, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.compensate_stripe_checkout_setup(uuid, text, boolean, text)
  to service_role;

revoke all on function public.resolve_stripe_checkout_setup(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_stripe_checkout_setup(uuid, text)
  to service_role;

revoke all on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_stripe_operational_event(
  text, text, text, uuid, text, text, text, text
) to service_role;

revoke all on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  to service_role;

revoke all on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) to service_role;

revoke all on function private.is_owner_aal2()
  from public, anon, authenticated, service_role;

revoke all on function public.read_intake_manager_queue(integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_intake_manager_queue(integer, timestamptz, uuid)
  to authenticated;

revoke all on function public.read_owner_paid_brief(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_owner_paid_brief(uuid)
  to authenticated;

commit;
