-- Bind every durable checkout receipt to the exact customer terms version and
-- expose only that non-sensitive identifier in the owner-only manager queue.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.checkout_intents, private.intake_manager_queue
  in share row exclusive mode;

alter table public.checkout_intents
  add column terms_version text;

update public.checkout_intents
set terms_version = 'historical-unversioned'
where terms_version is null;

alter table public.checkout_intents
  alter column terms_version set not null,
  add constraint checkout_intents_terms_version_check
    check (
      terms_version = 'historical-unversioned'
      or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    );

comment on column public.checkout_intents.terms_version is
  'Exact customer terms version presented for consent at checkout creation; historical rows are explicitly unversioned rather than misattributed.';

alter table private.intake_manager_queue
  add column terms_version text;

update private.intake_manager_queue q
set terms_version = ci.terms_version
from public.checkout_intents ci
where q.intake_kind = 'checkout'
  and q.intake_id = ci.id;

alter table private.intake_manager_queue
  add constraint intake_manager_queue_terms_version_check
    check (
      (intake_kind = 'non_payment' and terms_version is null)
      or (intake_kind = 'checkout' and terms_version is not null)
    );

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

drop function public.read_intake_manager_queue(integer);

create function public.read_intake_manager_queue(
  p_limit integer default 50
)
returns table (
  queue_receipt_id uuid,
  intake_kind text,
  intake_id uuid,
  queue_state text,
  payment_state text,
  order_id uuid,
  terms_version text,
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
      q.terms_version,
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
  'Returns privacy-safe intake receipt and terms-version metadata only to an active owner with a live Auth session and writes an access receipt.';

revoke all on function public.read_intake_manager_queue(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.read_intake_manager_queue(integer)
  to authenticated;

commit;
