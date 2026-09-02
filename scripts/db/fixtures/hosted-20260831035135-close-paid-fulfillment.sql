-- Recover every retained paid Checkout into the privacy-safe owner queue and
-- provide one exact-idempotent owner action that closes a fulfilled order.
-- The operation never copies customer content into operational receipts.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.checkout_intents,
  public.orders,
  public.briefs,
  public.stripe_events,
  public.snickerdoodle_order_capacity,
  public.engagement_assignments,
  public.activity_events,
  private.intake_manager_queue,
  private.payment_reconciliation_alerts
  in share row exclusive mode;

-- A paid order retained from before the singleton-capacity migration has no
-- honest provider expiry timestamps to copy. Represent that provenance
-- explicitly rather than inventing sentinel times. Future reservations reset
-- the origin to the ordinary Checkout-reservation path before validation.
alter table public.snickerdoodle_order_capacity
  add column capacity_origin text not null default 'checkout_reservation';

do $$
declare
  v_window_constraint name;
  v_state_constraint name;
begin
  select c.conname into strict v_window_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.snickerdoodle_order_capacity'::regclass
    and c.contype = 'c'
    and position('reservation_expires_at' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('stripe_session_expires_at' in pg_catalog.pg_get_constraintdef(c.oid)) > 0;

  select c.conname into strict v_state_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.snickerdoodle_order_capacity'::regclass
    and c.contype = 'c'
    and position('capacity_state' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('order_id' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('released_at' in pg_catalog.pg_get_constraintdef(c.oid)) > 0;

  execute pg_catalog.format(
    'alter table public.snickerdoodle_order_capacity drop constraint %I',
    v_window_constraint
  );
  execute pg_catalog.format(
    'alter table public.snickerdoodle_order_capacity drop constraint %I',
    v_state_constraint
  );
end;
$$;

alter table public.snickerdoodle_order_capacity
  alter column stripe_session_expires_at drop not null,
  alter column reservation_expires_at drop not null,
  add constraint snickerdoodle_order_capacity_origin_check
    check (capacity_origin in ('checkout_reservation', 'historical_paid_backfill')),
  add constraint snickerdoodle_order_capacity_expiry_v2_check
    check (
      (capacity_origin = 'checkout_reservation'
        and stripe_session_expires_at is not null
        and reservation_expires_at is not null
        and reservation_expires_at >= stripe_session_expires_at + interval '5 minutes')
      or (capacity_origin = 'historical_paid_backfill'
        and stripe_session_expires_at is null
        and reservation_expires_at is null)
    ),
  add constraint snickerdoodle_order_capacity_state_v2_check
    check (
      (capacity_state = 'reserved'
        and capacity_origin = 'checkout_reservation'
        and order_id is null and released_at is null)
      or (capacity_state = 'active'
        and order_id is not null and activated_at is not null and released_at is null)
      or (capacity_state = 'released' and released_at is not null)
    );

create or replace function private.set_capacity_origin_on_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capacity_state = 'reserved' then
    new.capacity_origin := 'checkout_reservation';
  end if;
  return new;
end;
$$;

create trigger set_capacity_origin_on_reservation
before insert or update of capacity_state on public.snickerdoodle_order_capacity
for each row execute function private.set_capacity_origin_on_reservation();

revoke all on function private.set_capacity_origin_on_reservation()
  from public, anon, authenticated, service_role;

-- Add one terminal paid queue state without weakening the existing
-- payment/order consistency rules. Resolve the predecessor's generated
-- constraint names from their exact column coverage rather than assuming a
-- PostgreSQL-generated suffix.
do $$
declare
  v_queue_state_constraint name;
  v_payment_value_constraint name;
  v_payment_state_constraint name;
begin
  select c.conname into strict v_queue_state_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'private.intake_manager_queue'::regclass
    and c.contype = 'c'
    and position('queue_state = ANY' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('payment_state' in pg_catalog.pg_get_constraintdef(c.oid)) = 0;

  select c.conname into strict v_payment_state_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'private.intake_manager_queue'::regclass
    and c.contype = 'c'
    and position('queue_state' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('payment_state' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('order_id' in pg_catalog.pg_get_constraintdef(c.oid)) > 0;

  select c.conname into strict v_payment_value_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'private.intake_manager_queue'::regclass
    and c.contype = 'c'
    and position('payment_state = ANY' in pg_catalog.pg_get_constraintdef(c.oid)) > 0
    and position('queue_state' in pg_catalog.pg_get_constraintdef(c.oid)) = 0;

  execute pg_catalog.format(
    'alter table private.intake_manager_queue drop constraint %I',
    v_queue_state_constraint
  );
  execute pg_catalog.format(
    'alter table private.intake_manager_queue drop constraint %I',
    v_payment_state_constraint
  );
  execute pg_catalog.format(
    'alter table private.intake_manager_queue drop constraint %I',
    v_payment_value_constraint
  );
end;
$$;

alter table private.intake_manager_queue
  add constraint intake_manager_queue_payment_state_v2_values_check
    check (payment_state in (
      'not_applicable',
      'pending',
      'checkout_created',
      'paid',
      'refunded',
      'disputed',
      'expired'
    )),
  add constraint intake_manager_queue_queue_state_v2_check
    check (queue_state in (
      'received',
      'awaiting_payment',
      'paid_ready',
      'payment_attention',
      'fulfilled_closed',
      'closed_unpaid'
    )),
  add constraint intake_manager_queue_payment_state_v2_check
    check (
      (payment_state = 'paid'
        and queue_state in ('paid_ready', 'payment_attention', 'fulfilled_closed')
        and order_id is not null)
      or (payment_state in ('refunded', 'disputed')
        and queue_state = 'payment_attention'
        and order_id is not null)
      or (payment_state in ('pending', 'checkout_created')
        and queue_state = 'awaiting_payment' and order_id is null)
      or (payment_state = 'expired'
        and queue_state = 'closed_unpaid' and order_id is null)
      or (payment_state = 'not_applicable'
        and queue_state = 'received' and order_id is null)
    );

-- Preserve a terminal queue receipt if a delayed/replayed Checkout update
-- touches the already-fulfilled intent. No trigger replay can reopen service.
create or replace function private.queue_checkout_intake_for_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_state text;
begin
  v_queue_state := case new.status
    when 'paid' then 'paid_ready'
    when 'expired' then 'closed_unpaid'
    else 'awaiting_payment'
  end;

  insert into private.intake_manager_queue (
    intake_kind,
    intake_id,
    queue_state,
    payment_state,
    order_id,
    terms_version
  ) values (
    'checkout',
    new.id,
    v_queue_state,
    new.status,
    new.order_id,
    new.terms_version
  )
  on conflict (intake_kind, intake_id) do update
  set queue_state = case
        when private.intake_manager_queue.queue_state in (
          'fulfilled_closed', 'payment_attention'
        )
          then private.intake_manager_queue.queue_state
        else excluded.queue_state
      end,
      payment_state = case
        when private.intake_manager_queue.queue_state in (
          'fulfilled_closed', 'payment_attention'
        )
          then private.intake_manager_queue.payment_state
        else excluded.payment_state
      end,
      order_id = case
        when private.intake_manager_queue.queue_state in (
          'fulfilled_closed', 'payment_attention'
        )
          then private.intake_manager_queue.order_id
        else excluded.order_id
      end,
      terms_version = excluded.terms_version,
      updated_at = clock_timestamp();

  return new;
end;
$$;

revoke all on function private.queue_checkout_intake_for_manager()
  from public, anon, authenticated, service_role;

-- Classify only an exact paid Checkout graph. Open paid work must have the
-- singleton capacity row bound to the same intent/order/Session. Closed paid
-- work must have a released row. Refunds, disputes, and open reconciliation
-- are visible as explicit attention states and can never masquerade as work
-- ready for fulfillment.
create or replace function private.backfill_paid_intake_manager_queue()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
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
  lock table public.checkout_intents,
    public.orders,
    public.briefs,
    public.stripe_events,
    public.snickerdoodle_order_capacity,
    private.intake_manager_queue,
    private.payment_reconciliation_alerts
    in share row exclusive mode;

  -- Validate the immutable Checkout/order/payment graph before synthesizing
  -- any capacity or queue metadata. This intentionally fails the whole
  -- migration rather than hiding an ambiguous retained obligation.
  if exists (
    select 1
    from public.checkout_intents i
    left join public.orders o on o.id = i.order_id
    where i.status = 'paid'
      and (
        i.order_id is null
        or o.id is null
        or i.amount_cents is distinct from 9900
        or lower(i.currency) is distinct from 'usd'
        or i.stripe_checkout_session_id is null
        or o.package_type is distinct from 'standard_99'
        or o.price_cents is distinct from 9900
        or lower(o.currency) is distinct from 'usd'
        or o.stripe_checkout_session_id is distinct from i.stripe_checkout_session_id
        or o.stripe_payment_intent_id is null
        or o.paid_at is null
        or o.payment_status not in ('paid', 'refunded', 'disputed')
        or not (
          o.status = 'closed'
          or o.status = any(v_active_order_statuses)
        )
        or (
          o.payment_status = 'paid'
          and o.status = any(array[
            'new_intake',
            'needs_clarification',
            'ready_for_drafting',
            'drafting',
            'ai_critique',
            'ready_for_human_review',
            'independent_review',
            'revision_needed',
            'approved',
            'packaged'
          ]::text[])
          and o.delivered_at is not null
        )
        or (
          o.payment_status = 'paid'
          and o.status in ('delivered', 'follow_up_sent', 'closed')
          and o.delivered_at is null
        )
        or (select count(*) from public.briefs b where b.order_id = o.id) <> 1
        or not exists (
          select 1
          from public.stripe_events se
          where se.order_id = o.id
            and se.checkout_session_id = i.stripe_checkout_session_id
            and se.event_type in (
              'checkout.session.completed',
              'checkout.session.async_payment_succeeded'
            )
        )
      )
  ) then
    raise exception 'Paid Checkout graph is incoherent; manager queue backfill refused'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.checkout_intents i
    join public.orders o on o.id = i.order_id
    where i.status = 'paid'
      and (
        o.payment_status = 'disputed'
        or (o.payment_status = 'paid' and o.status = any(v_active_order_statuses))
      )
  ) > 1 then
    raise exception 'More than one retained fulfillment obligation exists'
      using errcode = '23514';
  end if;

  -- The predecessor capacity table is empty for a valid paid obligation that
  -- predates it. Create exactly one provenance-labelled active binding only
  -- when no capacity row exists. Never overwrite or reinterpret an existing
  -- reservation/release.
  if not exists (select 1 from public.snickerdoodle_order_capacity) then
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
      updated_at,
      capacity_origin
    )
    select
      'standard_99',
      i.id,
      i.stripe_checkout_session_id,
      null,
      null,
      'active',
      o.id,
      null,
      o.paid_at,
      o.paid_at,
      null,
      clock_timestamp(),
      'historical_paid_backfill'
    from public.checkout_intents i
    join public.orders o on o.id = i.order_id
    where i.status = 'paid'
      and (
        o.payment_status = 'disputed'
        or (o.payment_status = 'paid' and o.status = any(v_active_order_statuses))
      );
  end if;

  -- Current obligations must own the exact active singleton. Terminal history
  -- may have no capacity row or a row now belonging wholly to a newer order;
  -- any partial reference back to a terminal graph is always incoherent.
  if exists (
    select 1
    from public.checkout_intents i
    join public.orders o on o.id = i.order_id
    left join public.snickerdoodle_order_capacity c
      on c.slot_key = 'standard_99'
    where i.status = 'paid'
      and (
        (
          (o.payment_status = 'disputed'
            or (o.payment_status = 'paid' and o.status = any(v_active_order_statuses)))
          and (
            c.capacity_state is distinct from 'active'
            or c.intent_id is distinct from i.id
            or c.order_id is distinct from o.id
            or c.checkout_session_id is distinct from i.stripe_checkout_session_id
          )
        )
        or (
          not (
            o.payment_status = 'disputed'
            or (o.payment_status = 'paid' and o.status = any(v_active_order_statuses))
          )
          and (
            c.intent_id = i.id
            or c.order_id = o.id
            or c.checkout_session_id = i.stripe_checkout_session_id
          )
          and (
            c.intent_id is distinct from i.id
            or c.order_id is distinct from o.id
            or c.checkout_session_id is distinct from i.stripe_checkout_session_id
            or (
              o.payment_status = 'paid'
              and o.status = 'closed'
              and c.capacity_state is distinct from 'released'
            )
            or (
              o.payment_status = 'refunded'
              and c.capacity_state not in ('active', 'released')
            )
          )
        )
      )
  ) then
    raise exception 'Paid Checkout capacity binding is incoherent; backfill refused'
      using errcode = '23514';
  end if;

  -- This is metadata-only: identifiers, lifecycle state, and timestamps. It
  -- deliberately excludes email, brief content, Stripe payloads, and secrets.
  insert into private.intake_manager_queue (
    intake_kind,
    intake_id,
    queue_state,
    payment_state,
    order_id,
    terms_version,
    created_at,
    updated_at
  )
  select
    'checkout',
    i.id,
    case
      when o.payment_status <> 'paid' then 'payment_attention'
      when exists (
        select 1 from private.payment_reconciliation_alerts a
        where a.alert_state = 'open'
          and (a.checkout_intent_id = i.id or a.order_id = o.id)
      ) then 'payment_attention'
      when o.status = 'closed' then 'fulfilled_closed'
      else 'paid_ready'
    end,
    o.payment_status,
    o.id,
    i.terms_version,
    i.created_at,
    greatest(i.updated_at, o.updated_at)
  from public.checkout_intents i
  join public.orders o on o.id = i.order_id
  where i.status = 'paid'
  on conflict (intake_kind, intake_id) do update
  set queue_state = excluded.queue_state,
      payment_state = excluded.payment_state,
      order_id = excluded.order_id,
      terms_version = excluded.terms_version,
      updated_at = greatest(
        private.intake_manager_queue.updated_at,
        excluded.updated_at
      )
  where (
    private.intake_manager_queue.queue_state,
    private.intake_manager_queue.payment_state,
    private.intake_manager_queue.order_id,
    private.intake_manager_queue.terms_version
  ) is distinct from (
    excluded.queue_state,
    excluded.payment_state,
    excluded.order_id,
    excluded.terms_version
  );

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

comment on function private.backfill_paid_intake_manager_queue() is
  'Fail-closed, metadata-only classification/backfill for exact historical paid Checkout graphs. No application role can invoke it.';

revoke all on function private.backfill_paid_intake_manager_queue()
  from public, anon, authenticated, service_role;

select private.backfill_paid_intake_manager_queue();

create table private.owner_fulfillment_close_receipts (
  close_receipt_id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null,
  checkout_intent_id uuid not null,
  order_id uuid not null unique,
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  assignments_revoked integer not null check (assignments_revoked >= 0),
  capacity_released boolean not null,
  closed_at timestamptz not null default clock_timestamp(),
  unique (actor_profile_id, idempotency_key_hash)
);

create table private.owner_fulfillment_close_idempotency (
  actor_profile_id uuid not null,
  idempotency_key_hash text not null
    check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  checkout_intent_id uuid not null,
  order_id uuid not null,
  close_receipt_id uuid not null
    references private.owner_fulfillment_close_receipts (close_receipt_id),
  accepted_result text not null check (accepted_result in ('closed', 'already_closed')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_profile_id, idempotency_key_hash)
);

comment on table private.owner_fulfillment_close_receipts is
  'Append-only privacy-safe receipts for exact AAL2 owner fulfillment closure. Contains no customer content, contact value, Stripe payload, bearer, TOTP value, or raw idempotency key.';

comment on table private.owner_fulfillment_close_idempotency is
  'Append-only one-use hashes binding every accepted owner fulfillment idempotency key to exactly one intent/order/receipt. Contains no raw key or customer content.';

alter table private.owner_fulfillment_close_receipts enable row level security;
alter table private.owner_fulfillment_close_receipts force row level security;
alter table private.owner_fulfillment_close_idempotency enable row level security;
alter table private.owner_fulfillment_close_idempotency force row level security;
revoke all privileges on table private.owner_fulfillment_close_receipts
  from public, anon, authenticated, service_role;
revoke all privileges on table private.owner_fulfillment_close_idempotency
  from public, anon, authenticated, service_role;

create or replace function private.protect_owner_fulfillment_close_receipt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Owner fulfillment close receipts are append-only'
    using errcode = '22023';
end;
$$;

create trigger protect_owner_fulfillment_close_receipt
before update or delete on private.owner_fulfillment_close_receipts
for each row execute function private.protect_owner_fulfillment_close_receipt();

create trigger protect_owner_fulfillment_close_idempotency
before update or delete on private.owner_fulfillment_close_idempotency
for each row execute function private.protect_owner_fulfillment_close_receipt();

revoke all on function private.protect_owner_fulfillment_close_receipt()
  from public, anon, authenticated, service_role;

create or replace function public.close_owner_paid_fulfillment(
  p_intent_id uuid,
  p_idempotency_key text
)
returns table (
  close_result text,
  close_receipt_id uuid,
  order_id uuid,
  order_status text,
  queue_state text,
  assignments_revoked integer,
  capacity_released boolean,
  closed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_idempotency_hash text;
  v_request_hash text;
  v_existing private.owner_fulfillment_close_receipts%rowtype;
  v_idempotency private.owner_fulfillment_close_idempotency%rowtype;
  v_intent public.checkout_intents%rowtype;
  v_order public.orders%rowtype;
  v_capacity public.snickerdoodle_order_capacity%rowtype;
  v_assignment public.engagement_assignments%rowtype;
  v_close_receipt_id uuid := gen_random_uuid();
  v_assignments_revoked integer := 0;
  v_closed_at timestamptz := clock_timestamp();
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
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Fulfillment closure requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_intent_id is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$'
  then
    raise exception 'Invalid fulfillment closure request'
      using errcode = '22023';
  end if;

  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required'
      using errcode = '42501';
  end if;

  -- Serialize against owner demotion/deactivation before relying on the actor.
  if not pg_catalog.pg_try_advisory_xact_lock(839534759014468561::bigint) then
    raise exception 'Owner authorization is changing; retry'
      using errcode = '55P03';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_actor_id
    and p.active = true
    and p.role = 'owner'
  for share of p;

  if not found or not (select private.is_owner_aal2()) then
    raise exception 'AAL2 active owner authorization is required'
      using errcode = '42501';
  end if;

  v_idempotency_hash := encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_idempotency_key, 'UTF8')),
    'hex'
  );
  v_request_hash := encode(
    pg_catalog.sha256(
      pg_catalog.convert_to('close_owner_paid_fulfillment|' || p_intent_id::text, 'UTF8')
    ),
    'hex'
  );

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text || ':' || v_idempotency_hash, 30082026)
  ) then
    raise exception 'Fulfillment closure idempotency key is busy; retry'
      using errcode = '55P03';
  end if;

  select * into v_idempotency
  from private.owner_fulfillment_close_idempotency k
  where k.actor_profile_id = v_actor_id
    and k.idempotency_key_hash = v_idempotency_hash;

  if found then
    if v_idempotency.request_hash <> v_request_hash
      or v_idempotency.checkout_intent_id <> p_intent_id
    then
      raise exception 'Fulfillment closure idempotency conflict'
        using errcode = '22023';
    end if;

    select * into strict v_existing
    from private.owner_fulfillment_close_receipts r
    where r.close_receipt_id = v_idempotency.close_receipt_id
      and r.order_id = v_idempotency.order_id
      and r.checkout_intent_id = v_idempotency.checkout_intent_id;

    return query select
      'idempotent_replay'::text,
      v_existing.close_receipt_id,
      v_existing.order_id,
      'closed'::text,
      'fulfilled_closed'::text,
      v_existing.assignments_revoked,
      v_existing.capacity_released,
      v_existing.closed_at;
    return;
  end if;

  -- Use the same global serialization boundary as paid-finalization and
  -- terminal payment events. A close can never race a webhook into a second
  -- obligation or release a different order's slot.
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('snickerdoodle:standard_99:one-active-order:v1', 0)
  ) then
    raise exception 'Payment capacity is changing; retry'
      using errcode = '55P03';
  end if;

  select * into v_intent
  from public.checkout_intents i
  where i.id = p_intent_id
  for update of i;

  if not found
    or v_intent.status <> 'paid'
    or v_intent.order_id is null
    or v_intent.amount_cents is distinct from 9900
    or lower(v_intent.currency) is distinct from 'usd'
    or v_intent.stripe_checkout_session_id is null
  then
    raise exception 'Paid Checkout intent is required for fulfillment closure'
      using errcode = '22023';
  end if;

  select * into v_order
  from public.orders o
  where o.id = v_intent.order_id
  for update of o;

  if not found
    or v_order.payment_status <> 'paid'
    or v_order.package_type is distinct from 'standard_99'
    or v_order.price_cents is distinct from 9900
    or lower(v_order.currency) is distinct from 'usd'
    or v_order.stripe_checkout_session_id is distinct from v_intent.stripe_checkout_session_id
    or v_order.stripe_payment_intent_id is null
    or v_order.paid_at is null
    or not (
      v_order.status = 'closed'
      or v_order.status = any(v_active_order_statuses)
    )
    or not exists (
      select 1 from public.stripe_events se
      where se.order_id = v_order.id
        and se.checkout_session_id = v_intent.stripe_checkout_session_id
        and se.event_type in (
          'checkout.session.completed',
          'checkout.session.async_payment_succeeded'
        )
    )
  then
    raise exception 'A currently paid order is required for fulfillment closure'
      using errcode = '22023';
  end if;

  select * into v_existing
  from private.owner_fulfillment_close_receipts r
  where r.order_id = v_order.id;

  if found then
    if v_order.status <> 'closed' then
      raise exception 'Fulfillment receipt/order lifecycle mismatch'
        using errcode = '23514';
    end if;

    insert into private.owner_fulfillment_close_idempotency (
      actor_profile_id,
      idempotency_key_hash,
      request_hash,
      checkout_intent_id,
      order_id,
      close_receipt_id,
      accepted_result
    ) values (
      v_actor_id,
      v_idempotency_hash,
      v_request_hash,
      v_intent.id,
      v_order.id,
      v_existing.close_receipt_id,
      'already_closed'
    );

    return query select
      'already_closed'::text,
      v_existing.close_receipt_id,
      v_existing.order_id,
      v_order.status,
      'fulfilled_closed'::text,
      v_existing.assignments_revoked,
      v_existing.capacity_released,
      v_existing.closed_at;
    return;
  end if;

  if v_order.status = 'closed' then
    raise exception 'Order was closed outside the reviewed fulfillment receipt path'
      using errcode = '23514';
  end if;

  if not (v_order.status = any(v_active_order_statuses)) then
    raise exception 'Paid order lifecycle is not fulfillment-closeable'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.payment_reconciliation_alerts a
    where a.alert_state = 'open'
      and (a.checkout_intent_id = v_intent.id or a.order_id = v_order.id)
  ) then
    raise exception 'Open payment reconciliation must be resolved before fulfillment closure'
      using errcode = '55000';
  end if;

  select * into v_capacity
  from public.snickerdoodle_order_capacity c
  where c.slot_key = 'standard_99'
  for update of c;

  if not found
    or v_capacity.capacity_state <> 'active'
    or v_capacity.intent_id <> v_intent.id
    or v_capacity.order_id <> v_order.id
    or v_capacity.checkout_session_id is distinct from v_intent.stripe_checkout_session_id
  then
    raise exception 'Active fulfillment capacity does not match the paid order'
      using errcode = '23514';
  end if;

  for v_assignment in
    select a.*
    from public.engagement_assignments a
    where a.order_id = v_order.id
      and a.lifecycle_status = 'active'
    order by a.id
    for update of a
  loop
    update public.engagement_assignments
    set lifecycle_status = 'revoked',
        ended_at = v_closed_at,
        ended_by_profile_id = v_actor_id
    where id = v_assignment.id;

    perform private.write_engagement_access_audit(
      'assignment_revoked',
      'allowed',
      'fulfillment_closed',
      v_actor_id,
      v_assignment.assignee_profile_id,
      v_order.id,
      v_assignment.id,
      null,
      v_assignment.assignment_role,
      'assignment',
      v_assignment.id,
      'revoke',
      v_request_hash
    );
    v_assignments_revoked := v_assignments_revoked + 1;
  end loop;

  update public.orders as o
  set status = 'closed',
      delivered_at = coalesce(o.delivered_at, v_closed_at),
      updated_at = v_closed_at
  where o.id = v_order.id
    and o.payment_status = 'paid'
    and o.status <> 'closed';

  if not found then
    raise exception 'Paid order lifecycle changed during fulfillment closure'
      using errcode = '40001';
  end if;

  update public.snickerdoodle_order_capacity as c
  set capacity_state = 'released',
      released_reason = 'fulfillment_completed',
      released_at = v_closed_at,
      updated_at = v_closed_at
  where c.slot_key = 'standard_99'
    and c.intent_id = v_intent.id
    and c.order_id = v_order.id
    and c.capacity_state = 'active';

  if not found then
    raise exception 'Fulfillment capacity changed during closure'
      using errcode = '40001';
  end if;

  update private.intake_manager_queue as q
  set queue_state = 'fulfilled_closed',
      payment_state = 'paid',
      order_id = v_order.id,
      updated_at = v_closed_at
  where q.intake_kind = 'checkout'
    and q.intake_id = v_intent.id
    and q.order_id = v_order.id;

  if not found then
    raise exception 'Paid manager queue receipt is missing during closure'
      using errcode = 'P0002';
  end if;

  insert into private.owner_fulfillment_close_receipts (
    close_receipt_id,
    actor_profile_id,
    checkout_intent_id,
    order_id,
    idempotency_key_hash,
    request_hash,
    assignments_revoked,
    capacity_released,
    closed_at
  ) values (
    v_close_receipt_id,
    v_actor_id,
    v_intent.id,
    v_order.id,
    v_idempotency_hash,
    v_request_hash,
    v_assignments_revoked,
    true,
    v_closed_at
  );

  insert into private.owner_fulfillment_close_idempotency (
    actor_profile_id,
    idempotency_key_hash,
    request_hash,
    checkout_intent_id,
    order_id,
    close_receipt_id,
    accepted_result,
    created_at
  ) values (
    v_actor_id,
    v_idempotency_hash,
    v_request_hash,
    v_intent.id,
    v_order.id,
    v_close_receipt_id,
    'closed',
    v_closed_at
  );

  insert into public.activity_events (
    account_id,
    order_id,
    actor_id,
    event_type,
    message,
    metadata_json
  ) values (
    v_order.account_id,
    v_order.id,
    v_actor_id,
    'fulfillment_completed',
    'Owner confirmed fulfillment completion; order closed and capacity released.',
    jsonb_build_object(
      'source', 'owner_manager_aal2',
      'close_receipt_id', v_close_receipt_id,
      'assignments_revoked', v_assignments_revoked,
      'capacity_released', true
    )
  );

  return query select
    'closed'::text,
    v_close_receipt_id,
    v_order.id,
    'closed'::text,
    'fulfilled_closed'::text,
    v_assignments_revoked,
    true,
    v_closed_at;
end;
$$;

comment on function public.close_owner_paid_fulfillment(uuid, text) is
  'AAL2 active-owner-only exact-idempotent transaction that validates a paid order, revokes active assignments, closes fulfillment, releases singleton capacity, and writes privacy-safe append-only receipts.';

revoke all on function public.close_owner_paid_fulfillment(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.close_owner_paid_fulfillment(uuid, text)
  to authenticated;

commit;
