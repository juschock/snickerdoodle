-- Staff authorization and owner-managed access.

create schema if not exists private;

alter table public.profiles
  add column if not exists active boolean not null default false,
  add column if not exists invited_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Bootstrap an existing operator only when the applying session supplies the
-- private setting. The public migration deliberately contains no personal
-- email address. A clean replay can set this value for the transaction, or an
-- owner can be activated later through an audited service-role operation.
do $$
declare
  bootstrap_owner_email text := nullif(
    current_setting('app.settings.snickerdoodle_bootstrap_owner_email', true),
    ''
  );
begin
  if bootstrap_owner_email is not null then
    update public.profiles
    set role = 'owner', active = true, updated_at = now()
    where lower(email) = lower(bootstrap_owner_email);
  end if;
end;
$$;

create index if not exists idx_profiles_active_role on public.profiles (active, role);

drop trigger if exists on_auth_user_created on auth.users;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'operator',
    false
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.handle_new_user();

create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active = true
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active = true
      and role = 'owner'
  );
$$;

revoke all on function private.is_active_staff() from public, anon;
revoke all on function private.is_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.is_owner() to authenticated;

create or replace function private.protect_profile_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_profile_access on public.profiles;
create trigger protect_profile_access
  before update on public.profiles
  for each row execute function private.protect_profile_access();

-- Remove Phase 1 policies that treated every authenticated account as staff.
drop policy if exists "Staff read profiles" on public.profiles;
drop policy if exists "Staff update own profile" on public.profiles;
drop policy if exists "Staff all accounts" on public.accounts;
drop policy if exists "Staff all contacts" on public.contacts;
drop policy if exists "Staff all campaigns" on public.campaigns;
drop policy if exists "Staff all orders" on public.orders;
drop policy if exists "Staff all briefs" on public.briefs;
drop policy if exists "Staff all notes" on public.internal_notes;
drop policy if exists "Staff all activity" on public.activity_events;

create policy "Profile self or active staff read"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select private.is_active_staff()));

create policy "Owners manage staff profiles"
  on public.profiles for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy "Active staff access accounts"
  on public.accounts for all to authenticated
  using ((select private.is_active_staff()))
  with check ((select private.is_active_staff()));

create policy "Active staff access contacts"
  on public.contacts for all to authenticated
  using ((select private.is_active_staff()))
  with check ((select private.is_active_staff()));

create policy "Active staff access campaigns"
  on public.campaigns for all to authenticated
  using ((select private.is_active_staff()))
  with check ((select private.is_active_staff()));

create policy "Active staff access orders"
  on public.orders for all to authenticated
  using ((select private.is_active_staff()))
  with check ((select private.is_active_staff()));

create policy "Active staff access briefs"
  on public.briefs for all to authenticated
  using ((select private.is_active_staff()))
  with check ((select private.is_active_staff()));

create policy "Active staff read notes"
  on public.internal_notes for select to authenticated
  using ((select private.is_active_staff()));

create policy "Active staff add own notes"
  on public.internal_notes for insert to authenticated
  with check (
    (select private.is_active_staff())
    and author_id = (select auth.uid())
  );

create policy "Active staff delete notes"
  on public.internal_notes for delete to authenticated
  using ((select private.is_active_staff()));

create policy "Active staff read activity"
  on public.activity_events for select to authenticated
  using ((select private.is_active_staff()));

create policy "Active staff add own activity"
  on public.activity_events for insert to authenticated
  with check (
    (select private.is_active_staff())
    and actor_id = (select auth.uid())
  );
