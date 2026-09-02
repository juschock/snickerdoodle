-- Preserve assignment history during ordinary operations while allowing the
-- declared foreign-key cascade to complete when its parent order is deleted.
-- The predecessor trigger rejected every DELETE, including the internal
-- referential action, so campaign/account retention and deletion could not
-- honor the reviewed graph constraints.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.engagement_assignments in share row exclusive mode;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.engagement_assignments'::regclass
      and t.tgname = 'protect_engagement_assignment'
      and not t.tgisinternal
  ) then
    raise exception 'Expected assignment-protection trigger is missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.engagement_assignments'::regclass
      and c.confrelid = 'public.orders'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'c'
      and c.convalidated
  ) then
    raise exception 'Expected assignment-to-order cascade is missing'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function private.protect_engagement_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.assignee_profile_id is distinct from old.assignee_profile_id
    or new.assignment_role is distinct from old.assignment_role
    or new.starts_at is distinct from old.starts_at
    or new.expires_at is distinct from old.expires_at
    or new.assigned_by_profile_id is distinct from old.assigned_by_profile_id
    or new.predecessor_assignment_id is distinct from old.predecessor_assignment_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Assignment identity and grant window are immutable'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
    and old.lifecycle_status <> 'active'
  then
    raise exception 'Ended assignments are immutable' using errcode = '22023';
  end if;

  if tg_op = 'DELETE' then
    -- A direct row delete invokes this trigger at depth one. The declared
    -- order_id ON DELETE CASCADE invokes it from PostgreSQL's referential
    -- action trigger at a deeper level. Keep direct history deletion closed
    -- while allowing parent-order lifecycle deletion to complete atomically.
    if pg_trigger_depth() <= 1 then
      raise exception 'Assignment history is append-only' using errcode = '22023';
    end if;
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_engagement_assignment()
  from public, anon, authenticated, service_role;

commit;
