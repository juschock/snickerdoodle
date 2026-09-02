-- Make the two retained activity-event references deterministic when an
-- account deletion cascades through orders. PostgreSQL is otherwise free to
-- execute the internal SET NULL actions in either trigger-creation order
-- after pg_dump/pg_restore, which can transiently leave order_id pointing at
-- an order that the same statement has already removed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.accounts, public.orders, public.activity_events
  in share row exclusive mode;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select
      c.conname,
      c.conkey,
      c.confrelid,
      c.confkey,
      c.confdeltype,
      c.confupdtype,
      c.confmatchtype,
      c.convalidated,
      c.condeferrable,
      c.condeferred
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.activity_events'::regclass
      and c.conname in (
        'activity_events_account_id_fkey',
        'activity_events_order_id_fkey'
      )
      and c.contype = 'f'
  loop
    if v_constraint.conname = 'activity_events_account_id_fkey' then
      if v_constraint.conkey <> array[
          (select attnum from pg_catalog.pg_attribute
           where attrelid = 'public.activity_events'::regclass
             and attname = 'account_id' and not attisdropped)
        ]::smallint[]
        or v_constraint.confrelid <> 'public.accounts'::regclass
        or v_constraint.confkey <> array[
          (select attnum from pg_catalog.pg_attribute
           where attrelid = 'public.accounts'::regclass
             and attname = 'id' and not attisdropped)
        ]::smallint[]
      then
        raise exception 'Unexpected activity_events account foreign key shape'
          using errcode = '55000';
      end if;
    elsif v_constraint.conname = 'activity_events_order_id_fkey' then
      if v_constraint.conkey <> array[
          (select attnum from pg_catalog.pg_attribute
           where attrelid = 'public.activity_events'::regclass
             and attname = 'order_id' and not attisdropped)
        ]::smallint[]
        or v_constraint.confrelid <> 'public.orders'::regclass
        or v_constraint.confkey <> array[
          (select attnum from pg_catalog.pg_attribute
           where attrelid = 'public.orders'::regclass
             and attname = 'id' and not attisdropped)
        ]::smallint[]
      then
        raise exception 'Unexpected activity_events order foreign key shape'
          using errcode = '55000';
      end if;
    end if;

    if v_constraint.confdeltype <> 'n'
      or v_constraint.confupdtype <> 'a'
      or v_constraint.confmatchtype <> 's'
      or not v_constraint.convalidated
    then
      raise exception 'Unexpected activity_events retained-reference semantics: %',
        v_constraint.conname using errcode = '55000';
    end if;
  end loop;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.activity_events'::regclass
      and c.conname in (
        'activity_events_account_id_fkey',
        'activity_events_order_id_fkey'
      )
      and c.contype = 'f'
  ) <> 2 then
    raise exception 'Expected both activity_events retained-reference constraints'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.activity_events e
    left join public.accounts a on a.id = e.account_id
    left join public.orders o on o.id = e.order_id
    where (e.account_id is not null and a.id is null)
       or (e.order_id is not null and o.id is null)
  ) then
    raise exception 'activity_events contains orphaned retained references'
      using errcode = '23503';
  end if;
end;
$$;

alter table public.activity_events
  drop constraint activity_events_account_id_fkey,
  drop constraint activity_events_order_id_fkey;

alter table public.activity_events
  add constraint activity_events_account_id_fkey
    foreign key (account_id)
    references public.accounts (id)
    on delete set null
    deferrable initially deferred
    not valid,
  add constraint activity_events_order_id_fkey
    foreign key (order_id)
    references public.orders (id)
    on delete set null
    deferrable initially deferred
    not valid;

alter table public.activity_events
  validate constraint activity_events_account_id_fkey;
alter table public.activity_events
  validate constraint activity_events_order_id_fkey;

do $$
begin
  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.activity_events'::regclass
      and c.conname in (
        'activity_events_account_id_fkey',
        'activity_events_order_id_fkey'
      )
      and c.contype = 'f'
      and c.convalidated
      and c.condeferrable
      and c.condeferred
      and c.confdeltype = 'n'
      and c.confupdtype = 'a'
      and c.confmatchtype = 's'
  ) <> 2 then
    raise exception 'activity_events retained references were not installed as deferred constraints'
      using errcode = '55000';
  end if;
end;
$$;

commit;
