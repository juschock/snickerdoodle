-- Create an atomic, metadata-only operational queue for validated private
-- intake. Raw briefs and delivery addresses remain only in their restricted
-- source records; the manager queue never copies them. Paid state is derived
-- from the same checkout_intent update performed by signed-webhook
-- finalization, not from a browser redirect or customer assertion.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.pending_intakes, public.checkout_intents
  in share row exclusive mode;

create table private.intake_manager_queue (
  queue_receipt_id uuid primary key default gen_random_uuid(),
  intake_kind text not null
    check (intake_kind in ('non_payment', 'checkout')),
  intake_id uuid not null,
  queue_state text not null
    check (queue_state in (
      'received',
      'awaiting_payment',
      'paid_ready',
      'closed_unpaid'
    )),
  payment_state text not null
    check (payment_state in (
      'not_applicable',
      'pending',
      'checkout_created',
      'paid',
      'expired'
    )),
  order_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (intake_kind, intake_id),
  check (
    (intake_kind = 'non_payment'
      and payment_state = 'not_applicable'
      and order_id is null)
    or intake_kind = 'checkout'
  ),
  check (
    (payment_state = 'paid' and queue_state = 'paid_ready' and order_id is not null)
    or (payment_state in ('pending', 'checkout_created')
      and queue_state = 'awaiting_payment')
    or (payment_state = 'expired'
      and queue_state = 'closed_unpaid' and order_id is null)
    or (payment_state = 'not_applicable'
      and queue_state = 'received' and order_id is null)
  )
);

comment on table private.intake_manager_queue is
  'Metadata-only operational receipts for validated private intake. Contains no brief, email, payment instrument, Stripe payload, customer secret, or customer success assertion.';

create index intake_manager_queue_state_created_idx
  on private.intake_manager_queue (queue_state, created_at);

create table private.intake_manager_queue_access_receipts (
  access_receipt_id bigint generated always as identity primary key,
  actor_profile_id uuid not null,
  returned_count integer not null check (returned_count between 0 and 100),
  accessed_at timestamptz not null default clock_timestamp()
);

comment on table private.intake_manager_queue_access_receipts is
  'Privacy-safe owner-access audit for the manager queue; no intake or customer content is recorded.';

alter table private.intake_manager_queue enable row level security;
alter table private.intake_manager_queue force row level security;
alter table private.intake_manager_queue_access_receipts enable row level security;
alter table private.intake_manager_queue_access_receipts force row level security;

revoke all privileges on table private.intake_manager_queue
  from public, anon, authenticated, service_role;
revoke all privileges on table private.intake_manager_queue_access_receipts
  from public, anon, authenticated, service_role;
revoke all privileges on sequence private.intake_manager_queue_access_receipts_access_receipt_id_seq
  from public, anon, authenticated, service_role;

create or replace function private.queue_non_payment_intake_for_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.intake_manager_queue (
    intake_kind,
    intake_id,
    queue_state,
    payment_state,
    order_id
  ) values (
    'non_payment',
    new.id,
    'received',
    'not_applicable',
    null
  )
  on conflict (intake_kind, intake_id) do update
  set updated_at = clock_timestamp();

  return new;
end;
$$;

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
    order_id
  ) values (
    'checkout',
    new.id,
    v_queue_state,
    new.status,
    new.order_id
  )
  on conflict (intake_kind, intake_id) do update
  set queue_state = excluded.queue_state,
      payment_state = excluded.payment_state,
      order_id = excluded.order_id,
      updated_at = clock_timestamp();

  return new;
end;
$$;

revoke all on function private.queue_non_payment_intake_for_manager()
  from public, anon, authenticated, service_role;
revoke all on function private.queue_checkout_intake_for_manager()
  from public, anon, authenticated, service_role;

create trigger queue_non_payment_intake_for_manager
after insert on public.pending_intakes
for each row execute function private.queue_non_payment_intake_for_manager();

create trigger queue_checkout_intake_for_manager_insert
after insert on public.checkout_intents
for each row execute function private.queue_checkout_intake_for_manager();

create trigger queue_checkout_intake_for_manager_update
after update of status, order_id on public.checkout_intents
for each row
when (old.status is distinct from new.status or old.order_id is distinct from new.order_id)
execute function private.queue_checkout_intake_for_manager();

create or replace function public.read_intake_manager_queue(
  p_limit integer default 50
)
returns table (
  queue_receipt_id uuid,
  intake_kind text,
  intake_id uuid,
  queue_state text,
  payment_state text,
  order_id uuid,
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

  if not (select private.is_owner()) then
    raise exception 'Owner authorization with a live session is required'
      using errcode = '42501';
  end if;

  v_actor_id := (select auth.uid());

  return query
    select
      q.queue_receipt_id,
      q.intake_kind,
      q.intake_id,
      q.queue_state,
      q.payment_state,
      q.order_id,
      q.created_at,
      q.updated_at
    from private.intake_manager_queue q
    order by q.created_at, q.queue_receipt_id
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

comment on function public.read_intake_manager_queue(integer) is
  'Returns only privacy-safe intake receipt metadata to an active owner with a live Auth session and writes an access receipt.';

revoke all on function public.read_intake_manager_queue(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_intake_manager_queue(integer)
  to authenticated;

commit;
