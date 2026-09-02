-- Reconcile the provider-only 20260831035135 fulfillment close migration back
-- to the accepted predecessor contract before the five immutable RC payment,
-- authorization, and privacy migrations run. A clean local chain has none of
-- these provider-only objects, so this migration is an intentional no-op there.
--
-- The hosted historical capacity row is only duplicated operational state. It
-- is retired only when its intent/order/Session binding is already represented
-- by the authoritative paid checkout and order graph. Any legacy close receipt
-- is independently material evidence and therefore blocks retirement instead
-- of being deleted.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_has_legacy_rpc boolean :=
    pg_catalog.to_regprocedure('public.close_owner_paid_fulfillment(uuid,text)') is not null;
  v_partial_legacy boolean;
begin
  v_partial_legacy :=
    pg_catalog.to_regclass('private.owner_fulfillment_close_receipts') is not null
    or pg_catalog.to_regclass('private.owner_fulfillment_close_idempotency') is not null
    or pg_catalog.to_regprocedure('private.backfill_paid_intake_manager_queue()') is not null
    or pg_catalog.to_regprocedure('private.set_capacity_origin_on_reservation()') is not null
    or exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.snickerdoodle_order_capacity'::regclass
        and a.attname = 'capacity_origin'
        and a.attnum > 0
        and not a.attisdropped
    );

  if not v_has_legacy_rpc then
    if v_partial_legacy then
      raise exception 'Partial provider-only fulfillment state requires manual reconciliation'
        using errcode = '55000';
    end if;
    return;
  end if;

  if pg_catalog.to_regclass('private.owner_fulfillment_close_receipts') is null
    or pg_catalog.to_regclass('private.owner_fulfillment_close_idempotency') is null
    or pg_catalog.to_regprocedure('private.backfill_paid_intake_manager_queue()') is null
    or pg_catalog.to_regprocedure('private.set_capacity_origin_on_reservation()') is null
  then
    raise exception 'Provider-only fulfillment inventory is incomplete'
      using errcode = '55000';
  end if;

  if exists (select 1 from private.owner_fulfillment_close_receipts)
    or exists (select 1 from private.owner_fulfillment_close_idempotency)
  then
    raise exception 'Legacy fulfillment receipts are material evidence and must be preserved'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.intake_manager_queue q
    where q.queue_state not in (
      'received', 'awaiting_payment', 'paid_ready', 'closed_unpaid'
    )
      or q.payment_state not in (
        'not_applicable', 'pending', 'checkout_created', 'paid', 'expired'
      )
      or not (
        (q.intake_kind = 'non_payment'
          and q.payment_state = 'not_applicable'
          and q.order_id is null)
        or q.intake_kind = 'checkout'
      )
      or not (
        (q.payment_state = 'paid'
          and q.queue_state = 'paid_ready'
          and q.order_id is not null)
        or (q.payment_state in ('pending', 'checkout_created')
          and q.queue_state = 'awaiting_payment')
        or (q.payment_state = 'expired'
          and q.queue_state = 'closed_unpaid'
          and q.order_id is null)
        or (q.payment_state = 'not_applicable'
          and q.queue_state = 'received'
          and q.order_id is null)
      )
  ) then
    raise exception 'Provider-only queue state cannot be losslessly restored to the accepted predecessor'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.snickerdoodle_order_capacity c
    left join public.checkout_intents i on i.id = c.intent_id
    left join public.orders o on o.id = c.order_id
    where c.capacity_origin = 'historical_paid_backfill'
      and not (
        c.capacity_state = 'active'
        and c.order_id is not null
        and c.checkout_session_id is not null
        and c.stripe_session_expires_at is null
        and c.reservation_expires_at is null
        and i.id is not null
        and i.status = 'paid'
        and i.order_id = c.order_id
        and i.stripe_checkout_session_id = c.checkout_session_id
        and o.id = c.order_id
        and o.payment_status in ('paid', 'refunded', 'disputed')
        and o.stripe_checkout_session_id = c.checkout_session_id
      )
  ) then
    raise exception 'Historical capacity row is not duplicated by a coherent paid graph'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.snickerdoodle_order_capacity c
    where c.capacity_origin <> 'historical_paid_backfill'
      and (c.stripe_session_expires_at is null or c.reservation_expires_at is null)
  ) then
    raise exception 'Checkout reservation expiry evidence is incomplete'
      using errcode = '23514';
  end if;
end;
$$;

-- Close the callable surface before removing any dependency.
do $$
begin
  if pg_catalog.to_regprocedure(
    'public.close_owner_paid_fulfillment(uuid,text)'
  ) is not null then
    execute 'revoke all on function public.close_owner_paid_fulfillment(uuid, text) '
      || 'from public, anon, authenticated, service_role';
    execute 'drop function public.close_owner_paid_fulfillment(uuid, text)';
  end if;
end;
$$;

-- Everything below is conditional so the accepted clean chain remains byte-
-- reproducible while the provider predecessor is normalized transactionally.
do $$
begin
  if pg_catalog.to_regclass('private.owner_fulfillment_close_idempotency') is null then
    return;
  end if;

  lock table public.checkout_intents,
    public.orders,
    public.snickerdoodle_order_capacity,
    private.intake_manager_queue,
    private.owner_fulfillment_close_receipts,
    private.owner_fulfillment_close_idempotency
    in share row exclusive mode;

  drop table private.owner_fulfillment_close_idempotency;
  drop table private.owner_fulfillment_close_receipts;
  drop function private.protect_owner_fulfillment_close_receipt();
  drop function private.backfill_paid_intake_manager_queue();

  drop trigger set_capacity_origin_on_reservation
    on public.snickerdoodle_order_capacity;
  drop function private.set_capacity_origin_on_reservation();

  delete from public.snickerdoodle_order_capacity
  where capacity_origin = 'historical_paid_backfill';

  alter table public.snickerdoodle_order_capacity
    drop constraint snickerdoodle_order_capacity_origin_check,
    drop constraint snickerdoodle_order_capacity_expiry_v2_check,
    drop constraint snickerdoodle_order_capacity_state_v2_check,
    drop column capacity_origin,
    alter column stripe_session_expires_at set not null,
    alter column reservation_expires_at set not null,
    add constraint snickerdoodle_order_capacity_check
      check (reservation_expires_at >= stripe_session_expires_at + interval '5 minutes'),
    add constraint snickerdoodle_order_capacity_check1
      check (
        (capacity_state = 'reserved' and order_id is null and released_at is null)
        or (capacity_state = 'active' and order_id is not null
          and activated_at is not null and released_at is null)
        or (capacity_state = 'released' and released_at is not null)
      );

  alter table private.intake_manager_queue
    drop constraint intake_manager_queue_payment_state_v2_values_check,
    drop constraint intake_manager_queue_queue_state_v2_check,
    drop constraint intake_manager_queue_payment_state_v2_check,
    add constraint intake_manager_queue_payment_state_check check (
      payment_state in (
        'not_applicable', 'pending', 'checkout_created', 'paid', 'expired'
      )
    ),
    add constraint intake_manager_queue_queue_state_check check (
      queue_state in ('received', 'awaiting_payment', 'paid_ready', 'closed_unpaid')
    ),
    add constraint intake_manager_queue_check1 check (
      (payment_state = 'paid' and queue_state = 'paid_ready' and order_id is not null)
      or (payment_state in ('pending', 'checkout_created')
        and queue_state = 'awaiting_payment')
      or (payment_state = 'expired'
        and queue_state = 'closed_unpaid' and order_id is null)
      or (payment_state = 'not_applicable'
        and queue_state = 'received' and order_id is null)
    );
end;
$$;

-- Restore the accepted predecessor trigger body. SN03 later replaces this
-- with the authoritative state-machine queue synchronizer on both paths.
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
  set queue_state = excluded.queue_state,
      payment_state = excluded.payment_state,
      order_id = excluded.order_id,
      terms_version = excluded.terms_version,
      updated_at = clock_timestamp();

  return new;
end;
$$;

revoke all on function private.queue_checkout_intake_for_manager()
  from public, anon, authenticated, service_role;

comment on function private.queue_checkout_intake_for_manager() is
  'Accepted predecessor queue trigger restored after retiring the provider-only fulfillment path.';

commit;
