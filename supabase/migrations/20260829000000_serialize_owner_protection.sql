-- Serialize owner demotions/deactivations/deletions so concurrent changes
-- cannot leave the application without an active owner. The bounded table
-- lock drains statements using the prior trigger before installing the new
-- statement-before-row lock order.

begin;

set local lock_timeout = '5s';

lock table public.profiles in share row exclusive mode;

do $$
begin
  if not exists (
    select 1
    from public.profiles
    where active = true and role = 'owner'
  ) then
    raise exception 'Owner protection cannot be installed without an active owner';
  end if;
end;
$$;

create or replace function private.serialize_profile_owner_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Owner-count queries rely on a fresh READ COMMITTED snapshot. Refuse a
  -- caller snapshot that can remain stale after another transaction commits.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Profile changes require READ COMMITTED isolation'
      using errcode = '25001';
  end if;

  -- BEFORE STATEMENT runs before PostgreSQL locks target tuples. Serialize
  -- every profile update/delete, not only owner fields, so a multi-statement
  -- transaction cannot take a row lock before the advisory lock. Fail fast
  -- instead of waiting indefinitely or forming a lock cycle.
  if not pg_catalog.pg_try_advisory_xact_lock(839534759014468561::bigint) then
    raise exception 'Another staff-access change is in progress; retry the transaction'
      using errcode = '55P03';
  end if;
  return null;
end;
$$;

revoke all on function private.serialize_profile_owner_changes()
  from public, anon, authenticated, service_role;

create or replace trigger serialize_profile_owner_changes
  before update or delete on public.profiles
  for each statement execute function private.serialize_profile_owner_changes();

create or replace function private.protect_profile_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.active = true
      and old.role = 'owner'
      and not exists (
        select 1
        from public.profiles
        where id <> old.id
          and active = true
          and role = 'owner'
      )
    then
      raise exception 'At least one active owner is required';
    end if;

    return old;
  end if;

  if (select auth.uid()) is not null and (
    new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.created_at is distinct from old.created_at
    or new.invited_by is distinct from old.invited_by
  ) then
    raise exception 'Protected staff identity fields cannot be changed';
  end if;

  if old.active = true
    and old.role = 'owner'
    and (new.active = false or new.role <> 'owner')
  then
    if not exists (
      select 1
      from public.profiles
      where id <> old.id
        and active = true
        and role = 'owner'
    ) then
      raise exception 'At least one active owner is required';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.protect_profile_access()
  from public, anon, authenticated, service_role;

create or replace trigger protect_profile_access
  before update or delete on public.profiles
  for each row execute function private.protect_profile_access();

commit;
