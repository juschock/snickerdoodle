-- Assignment-scoped non-payment access for Snickerdoodle engagements.
--
-- This migration intentionally does not create customer authentication,
-- storage access, payment execution, or a service-role operator path. Every
-- customer-content operation rechecks a live database assignment keyed only
-- by auth.uid() and order_id. JWT role metadata, email, display name, global
-- staff status, and caller-supplied identifiers never grant access.

begin;

set local lock_timeout = '5s';

create table public.engagement_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  assignee_profile_id uuid not null references public.profiles (id) on delete restrict,
  assignment_role text not null
    check (assignment_role in ('service_lead', 'assigned_reviewer')),
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'revoked', 'expired', 'reassigned')),
  starts_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  assigned_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  ended_by_profile_id uuid references public.profiles (id) on delete restrict,
  predecessor_assignment_id uuid references public.engagement_assignments (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > starts_at),
  check (expires_at <= starts_at + interval '30 days'),
  check (
    (lifecycle_status = 'active' and ended_at is null and ended_by_profile_id is null)
    or
    (lifecycle_status <> 'active' and ended_at is not null)
  )
);

comment on table public.engagement_assignments is
  'Identity-neutral, order-scoped service_lead or assigned_reviewer grants. An assignment is necessary but never sufficient without a live active profile and action-time database check.';

create unique index uq_engagement_assignment_active_role
  on public.engagement_assignments (order_id, assignment_role)
  where lifecycle_status = 'active';

create unique index uq_engagement_assignment_active_subject
  on public.engagement_assignments (order_id, assignee_profile_id)
  where lifecycle_status = 'active';

create index idx_engagement_assignment_subject_window
  on public.engagement_assignments (
    assignee_profile_id,
    lifecycle_status,
    starts_at,
    expires_at,
    order_id
  );

create table public.engagement_work_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  item_type text not null
    check (item_type in ('sanitized_brief', 'fact_ledger', 'draft', 'qa_checklist', 'review_comment')),
  content_json jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  updated_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  lock_version integer not null default 1 check (lock_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (pg_column_size(content_json) <= 262144)
);

comment on table public.engagement_work_items is
  'Assignment-scoped sanitized briefs, fact ledgers, drafts, QA checklists, and review comments. Raw intake, contacts, payment data, provider credentials, and uploads do not belong here.';

create index idx_engagement_work_items_order_type
  on public.engagement_work_items (order_id, item_type, updated_at desc);

create table public.pending_intakes (
  id uuid primary key,
  brief_json jsonb not null,
  delivery_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (char_length(delivery_email) between 3 and 320),
  check (pg_column_size(brief_json) <= 65536)
);

comment on table public.pending_intakes is
  'Non-payment private-intake records. Contains no price, currency, checkout session, payment intent, entitlement, or payment status.';

create index idx_pending_intakes_status_created
  on public.pending_intakes (status, created_at desc);

create table private.intake_rate_limit_counters (
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  scope text not null check (scope = 'intake_email'),
  window_started_at timestamptz not null,
  last_attempted_at timestamptz not null,
  attempt_count integer not null check (attempt_count between 1 and 6),
  primary key (subject_hash, scope)
);

comment on table private.intake_rate_limit_counters is
  'Short-lived private-intake rate limits keyed only by an application-side HMAC-SHA256 subject digest.';

create index idx_intake_rate_limit_last_attempted
  on private.intake_rate_limit_counters (last_attempted_at);

create table private.engagement_access_audit_receipts (
  receipt_id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  event_code text not null check (event_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  decision text not null check (decision in ('allowed', 'denied', 'noop')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  actor_profile_id uuid,
  subject_profile_id uuid,
  order_id uuid,
  assignment_id uuid,
  related_assignment_id uuid,
  assignment_role text
    check (assignment_role is null or assignment_role in ('service_lead', 'assigned_reviewer')),
  resource_type text not null check (resource_type ~ '^[a-z][a-z0-9_]{2,63}$'),
  resource_id uuid,
  operation_code text not null check (operation_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  session_id_hash text check (session_id_hash is null or session_id_hash ~ '^[0-9a-f]{64}$'),
  request_hash text check (request_hash is null or request_hash ~ '^[0-9a-f]{64}$')
);

comment on table private.engagement_access_audit_receipts is
  'Append-only metadata receipts for assignment grant/use/revoke/expiry/reassignment and denied attempts. Contains no customer content, email, display name, raw claim, bearer, IP, payment payload, or provider secret.';

create index idx_engagement_audit_order_time
  on private.engagement_access_audit_receipts (order_id, occurred_at, receipt_id);

create index idx_engagement_audit_actor_time
  on private.engagement_access_audit_receipts (actor_profile_id, occurred_at, receipt_id);

create table private.assignment_change_idempotency (
  actor_profile_id uuid not null,
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('allowed', 'denied', 'noop')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  assignment_id uuid,
  lifecycle_status text
    check (lifecycle_status is null or lifecycle_status in ('active', 'revoked', 'expired', 'reassigned')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_profile_id, idempotency_key_hash)
);

create table private.work_item_change_idempotency (
  actor_profile_id uuid not null,
  idempotency_key_hash text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('allowed', 'denied', 'noop')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  work_item_id uuid,
  lock_version integer check (lock_version is null or lock_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_profile_id, idempotency_key_hash)
);

alter table public.engagement_assignments enable row level security;
alter table public.engagement_assignments force row level security;
alter table public.engagement_work_items enable row level security;
alter table public.engagement_work_items force row level security;
alter table public.pending_intakes enable row level security;
alter table public.pending_intakes force row level security;
alter table private.intake_rate_limit_counters enable row level security;
alter table private.intake_rate_limit_counters force row level security;
alter table private.engagement_access_audit_receipts enable row level security;
alter table private.engagement_access_audit_receipts force row level security;
alter table private.assignment_change_idempotency enable row level security;
alter table private.assignment_change_idempotency force row level security;
alter table private.work_item_change_idempotency enable row level security;
alter table private.work_item_change_idempotency force row level security;

revoke all on table public.engagement_assignments
  from public, anon, authenticated, service_role;
revoke all on table public.engagement_work_items
  from public, anon, authenticated, service_role;
revoke all on table public.pending_intakes
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.pending_intakes to service_role;
revoke all on table private.intake_rate_limit_counters
  from public, anon, authenticated, service_role;
revoke all on table private.engagement_access_audit_receipts
  from public, anon, authenticated, service_role;
revoke all on table private.assignment_change_idempotency
  from public, anon, authenticated, service_role;
revoke all on table private.work_item_change_idempotency
  from public, anon, authenticated, service_role;
revoke all on sequence private.engagement_access_audit_receipts_receipt_id_seq
  from public, anon, authenticated, service_role;

create or replace function private.current_session_id_hash()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when nullif((select auth.jwt() ->> 'session_id'), '') is null then null
    else encode(
      pg_catalog.sha256(
        pg_catalog.convert_to((select auth.jwt() ->> 'session_id'), 'UTF8')
      ),
      'hex'
    )
  end;
$$;

create or replace function private.has_live_auth_session()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_session_id_text text := nullif((select auth.jwt() ->> 'session_id'), '');
  v_expires_at_text text := nullif((select auth.jwt() ->> 'exp'), '');
  v_session_is_live boolean := false;
begin
  -- The application requires stronger sign-out revocation than JWT expiry
  -- alone. Fail closed when the request is outside READ COMMITTED, lacks a
  -- signed-session claim, has expired, or the installed Auth schema cannot
  -- prove that the session still exists for this exact user.
  if current_setting('transaction_isolation') <> 'read committed'
    or v_actor_id is null
    or v_session_id_text is null
    or v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_expires_at_text is null
    or v_expires_at_text !~ '^[0-9]{1,12}$'
    or v_expires_at_text::numeric <= extract(epoch from statement_timestamp())
    or pg_catalog.to_regclass('auth.sessions') is null
  then
    return false;
  end if;

  execute
    'select true
     from auth.sessions s
     where s.id = $1
       and s.user_id = $2
       and (s.not_after is null or s.not_after > statement_timestamp())
     for share of s nowait'
    into v_session_is_live
    using v_session_id_text::uuid, v_actor_id;

  return coalesce(v_session_is_live, false);
exception
  when invalid_text_representation
    or numeric_value_out_of_range
    or undefined_column
    or undefined_table
    or insufficient_privilege
    or lock_not_available
  then
    return false;
end;
$$;

create or replace function private.write_engagement_access_audit(
  p_event_code text,
  p_decision text,
  p_reason_code text,
  p_actor_profile_id uuid,
  p_subject_profile_id uuid,
  p_order_id uuid,
  p_assignment_id uuid,
  p_related_assignment_id uuid,
  p_assignment_role text,
  p_resource_type text,
  p_resource_id uuid,
  p_operation_code text,
  p_request_hash text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt_id bigint;
begin
  insert into private.engagement_access_audit_receipts (
    event_code,
    decision,
    reason_code,
    actor_profile_id,
    subject_profile_id,
    order_id,
    assignment_id,
    related_assignment_id,
    assignment_role,
    resource_type,
    resource_id,
    operation_code,
    session_id_hash,
    request_hash
  ) values (
    p_event_code,
    p_decision,
    p_reason_code,
    p_actor_profile_id,
    p_subject_profile_id,
    p_order_id,
    p_assignment_id,
    p_related_assignment_id,
    p_assignment_role,
    p_resource_type,
    p_resource_id,
    p_operation_code,
    private.current_session_id_hash(),
    p_request_hash
  )
  returning receipt_id into v_receipt_id;

  return v_receipt_id;
end;
$$;

create or replace function private.has_active_engagement_role(
  p_order_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select (select private.has_live_auth_session())
  and exists (
    select 1
    from public.engagement_assignments a
    join public.profiles p on p.id = a.assignee_profile_id
    where a.order_id = p_order_id
      and a.assignee_profile_id = (select auth.uid())
      and a.assignment_role = any (p_allowed_roles)
      and a.lifecycle_status = 'active'
      and a.starts_at <= statement_timestamp()
      and a.expires_at > statement_timestamp()
      and p.active = true
  );
$$;

revoke all on function private.current_session_id_hash()
  from public, anon, authenticated, service_role;
revoke all on function private.has_live_auth_session()
  from public, anon, authenticated, service_role;
revoke all on function private.write_engagement_access_audit(
  text, text, text, uuid, uuid, uuid, uuid, uuid, text, text, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function private.has_active_engagement_role(uuid, text[])
  from public, anon, service_role;
grant execute on function private.has_active_engagement_role(uuid, text[])
  to authenticated;

-- Replace the legacy owner predicate so every remaining owner policy also
-- fails closed for stale stronger-isolation snapshots and signed-out sessions.
create or replace function private.is_owner()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select (select private.has_live_auth_session())
  and exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active = true
      and role = 'owner'
  );
$$;

revoke all on function private.is_owner()
  from public, anon, authenticated, service_role;
revoke all on function private.is_active_staff()
  from public, anon, authenticated, service_role;

create or replace function public.consume_intake_rate_limit(
  p_subject_hash text,
  p_scope text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := 5;
  v_window_seconds integer := 3600;
  v_window interval := make_interval(secs => v_window_seconds);
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_attempt_count integer;
begin
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid intake rate-limit subject' using errcode = '22023';
  end if;
  if p_scope <> 'intake_email' then
    raise exception 'Unknown intake rate-limit scope' using errcode = '22023';
  end if;

  insert into private.intake_rate_limit_counters (
    subject_hash,
    scope,
    window_started_at,
    last_attempted_at,
    attempt_count
  ) values (
    p_subject_hash,
    p_scope,
    v_now,
    v_now,
    1
  )
  on conflict (subject_hash, scope) do update
  set window_started_at = case
        when private.intake_rate_limit_counters.window_started_at <= v_now - v_window
          then v_now
        else private.intake_rate_limit_counters.window_started_at
      end,
      last_attempted_at = v_now,
      attempt_count = case
        when private.intake_rate_limit_counters.window_started_at <= v_now - v_window
          then 1
        else least(private.intake_rate_limit_counters.attempt_count + 1, v_limit + 1)
      end
  returning window_started_at, attempt_count
  into v_window_started_at, v_attempt_count;

  allowed := v_attempt_count <= v_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (v_window_started_at + v_window - v_now)))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_intake_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_intake_rate_limit(text, text)
  to service_role;

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
    raise exception 'Assignment history is append-only' using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace trigger protect_engagement_assignment
  before update or delete on public.engagement_assignments
  for each row execute function private.protect_engagement_assignment();

revoke all on function private.protect_engagement_assignment()
  from public, anon, authenticated, service_role;

create or replace function private.protect_engagement_work_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.order_id is distinct from old.order_id
    or new.item_type is distinct from old.item_type
    or new.created_by_profile_id is distinct from old.created_by_profile_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Work-item identity fields are immutable' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at = clock_timestamp();
    new.lock_version = old.lock_version + 1;
  end if;

  return new;
end;
$$;

create or replace trigger protect_engagement_work_item
  before update on public.engagement_work_items
  for each row execute function private.protect_engagement_work_item();

revoke all on function private.protect_engagement_work_item()
  from public, anon, authenticated, service_role;

create or replace function public.manage_engagement_assignment(
  p_action text,
  p_order_id uuid,
  p_assignee_profile_id uuid,
  p_assignment_role text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns table (
  out_decision text,
  out_reason_code text,
  out_assignment_id uuid,
  out_lifecycle_status text,
  out_receipt_id bigint
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
  v_existing private.assignment_change_idempotency%rowtype;
  v_current public.engagement_assignments%rowtype;
  v_expired public.engagement_assignments%rowtype;
  v_new public.engagement_assignments%rowtype;
  v_audit_role text := case
    when p_assignment_role in ('service_lead', 'assigned_reviewer') then p_assignment_role
    else null
  end;
  v_audit_operation text := case
    when p_action in ('grant', 'revoke') then p_action
    else 'manage_assignment'
  end;
  v_old_assignment_id uuid;
  v_decision text;
  v_reason text;
  v_status text;
  v_assignment_id uuid;
  v_receipt_id bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', 'denied', 'read_committed_required', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, null
    );
    return query select 'denied', 'read_committed_required', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  if not (select private.has_live_auth_session()) then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', 'denied', 'live_session_required', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, null
    );
    return query select 'denied', 'live_session_required', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  -- Reject non-owners before they can contend the shared profile-change lock.
  -- This is only a lock-admission precheck; the FOR SHARE owner check below is
  -- the authoritative authorization decision after serialization.
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor_id
      and p.active = true
      and p.role = 'owner'
  ) then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', 'denied', 'owner_required', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, null
    );
    return query select 'denied', 'owner_required', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  -- Profile updates/deletes acquire this lock before tuple locks. Participate
  -- in the same total order before locking either the actor or assignee so a
  -- multi-row profile change cannot form a tuple-lock cycle with assignment
  -- administration.
  if not pg_catalog.pg_try_advisory_xact_lock(839534759014468561::bigint) then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_busy', 'denied', 'profile_change_busy', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, null
    );
    return query select 'denied', 'profile_change_busy', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  perform 1
  from public.profiles p
  where p.id = v_actor_id
    and p.active = true
    and p.role = 'owner'
  for share of p;

  if not found then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', 'denied', 'owner_required', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, null
    );
    return query select 'denied', 'owner_required', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200 then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', 'denied', 'invalid_idempotency_key', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, null
    );
    return query select 'denied', 'invalid_idempotency_key', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  v_idempotency_hash := encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_idempotency_key, 'UTF8')),
    'hex'
  );
  v_request_hash := encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        concat_ws(
          '|',
          coalesce(p_action, ''),
          coalesce(p_order_id::text, ''),
          coalesce(p_assignee_profile_id::text, ''),
          coalesce(p_assignment_role, ''),
          coalesce(extract(epoch from p_expires_at)::text, '')
        ),
        'UTF8'
      )
    ),
    'hex'
  );

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text || ':' || v_idempotency_hash, 31032026)
  ) then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_busy', 'denied', 'idempotency_change_busy', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, v_request_hash
    );
    return query select 'denied', 'idempotency_change_busy', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  select * into v_existing
  from private.assignment_change_idempotency
  where actor_profile_id = v_actor_id
    and idempotency_key_hash = v_idempotency_hash;

  if found then
    if v_existing.request_hash = v_request_hash then
      v_receipt_id := private.write_engagement_access_audit(
        'assignment_change_replayed', 'noop', 'idempotent_replay', v_actor_id,
        p_assignee_profile_id, p_order_id, v_existing.assignment_id, null,
        v_audit_role, 'assignment', v_existing.assignment_id, v_audit_operation,
        v_request_hash
      );
      return query select v_existing.decision, v_existing.reason_code,
        v_existing.assignment_id, v_existing.lifecycle_status, v_receipt_id;
    else
      v_receipt_id := private.write_engagement_access_audit(
        'assignment_change_denied', 'denied', 'idempotency_conflict', v_actor_id,
        p_assignee_profile_id, p_order_id, null, null, v_audit_role,
        'assignment', null, v_audit_operation, v_request_hash
      );
      return query select 'denied', 'idempotency_conflict', null::uuid, null::text, v_receipt_id;
    end if;
    return;
  end if;

  if p_action is null or p_action not in ('grant', 'revoke') then
    v_decision := 'denied';
    v_reason := 'invalid_assignment_action';
  elsif p_assignment_role is null
    or p_assignment_role not in ('service_lead', 'assigned_reviewer')
  then
    v_decision := 'denied';
    v_reason := 'invalid_assignment_role';
  elsif p_order_id is null or not exists (
    select 1 from public.orders where id = p_order_id
  ) then
    v_decision := 'denied';
    v_reason := 'order_not_found';
  elsif p_assignee_profile_id is null then
    v_decision := 'denied';
    v_reason := 'assignment_subject_required';
  elsif p_action = 'grant' and (
    p_expires_at is null
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '30 days'
  ) then
    v_decision := 'denied';
    v_reason := 'invalid_assignment_expiry';
  elsif p_action = 'revoke' and p_expires_at is not null then
    v_decision := 'denied';
    v_reason := 'revoke_expiry_must_be_null';
  end if;

  if v_decision = 'denied' then
    insert into private.assignment_change_idempotency (
      actor_profile_id, idempotency_key_hash, request_hash, decision,
      reason_code, assignment_id, lifecycle_status
    ) values (
      v_actor_id, v_idempotency_hash, v_request_hash, v_decision,
      v_reason, null, null
    );
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', v_decision, v_reason, v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, v_request_hash
    );
    return query select v_decision, v_reason, null::uuid, null::text, v_receipt_id;
    return;
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_order_id::text, 31032026)
  ) then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_busy', 'denied', 'assignment_change_busy', v_actor_id,
      p_assignee_profile_id, p_order_id, null, null, v_audit_role,
      'assignment', null, v_audit_operation, v_request_hash
    );
    return query select 'denied', 'assignment_change_busy', null::uuid, null::text, v_receipt_id;
    return;
  end if;

  for v_expired in
    select a.*
    from public.engagement_assignments a
    where a.order_id = p_order_id
      and a.lifecycle_status = 'active'
      and a.expires_at <= clock_timestamp()
    order by a.id
    for update of a
  loop
    update public.engagement_assignments
    set lifecycle_status = 'expired',
        ended_at = clock_timestamp(),
        ended_by_profile_id = v_actor_id
    where id = v_expired.id;
    perform private.write_engagement_access_audit(
      'assignment_expired', 'allowed', 'assignment_window_elapsed', v_actor_id,
      v_expired.assignee_profile_id, p_order_id, v_expired.id, null,
      v_expired.assignment_role, 'assignment', v_expired.id, 'expire',
      v_request_hash
    );
    if v_expired.assignment_role = p_assignment_role then
      v_old_assignment_id := v_expired.id;
    end if;
  end loop;

  if p_action = 'grant' then
    perform 1
    from public.profiles p
    where p.id = p_assignee_profile_id
      and p.active = true
    for share of p;

    if not found then
      v_decision := 'denied';
      v_reason := 'active_profile_required';
      v_assignment_id := null;
      v_status := null;
    end if;
  end if;

  select * into v_current
  from public.engagement_assignments
  where order_id = p_order_id
    and assignment_role = p_assignment_role
    and lifecycle_status = 'active'
  for update;

  if v_decision = 'denied' then
    null;
  elsif p_action = 'grant' then
    if v_current.id is not null
      and v_current.assignee_profile_id = p_assignee_profile_id
      and v_current.expires_at = p_expires_at
    then
      v_decision := 'noop';
      v_reason := 'assignment_already_active';
      v_assignment_id := v_current.id;
      v_status := v_current.lifecycle_status;
    elsif exists (
      select 1
      from public.engagement_assignments a
      where a.order_id = p_order_id
        and a.assignee_profile_id = p_assignee_profile_id
        and a.assignment_role <> p_assignment_role
        and a.lifecycle_status = 'active'
    ) then
      v_decision := 'denied';
      v_reason := 'dual_role_assignment_denied';
      v_assignment_id := null;
      v_status := null;
    else
      if v_current.id is not null then
        update public.engagement_assignments
        set lifecycle_status = 'reassigned',
            ended_at = clock_timestamp(),
            ended_by_profile_id = v_actor_id
        where id = v_current.id;
        v_old_assignment_id := v_current.id;
      end if;

      insert into public.engagement_assignments (
        order_id,
        assignee_profile_id,
        assignment_role,
        expires_at,
        assigned_by_profile_id,
        predecessor_assignment_id
      ) values (
        p_order_id,
        p_assignee_profile_id,
        p_assignment_role,
        p_expires_at,
        v_actor_id,
        v_old_assignment_id
      ) returning * into v_new;

      v_decision := 'allowed';
      v_reason := case
        when v_old_assignment_id is null then 'assignment_granted'
        else 'assignment_reassigned'
      end;
      v_assignment_id := v_new.id;
      v_status := v_new.lifecycle_status;
    end if;
  else
    if v_current.id is null then
      v_decision := 'denied';
      v_reason := 'active_assignment_not_found';
      v_assignment_id := null;
      v_status := null;
    elsif v_current.assignee_profile_id <> p_assignee_profile_id then
      v_decision := 'denied';
      v_reason := 'assignment_subject_conflict';
      v_assignment_id := v_current.id;
      v_status := v_current.lifecycle_status;
    else
      update public.engagement_assignments
      set lifecycle_status = 'revoked',
          ended_at = clock_timestamp(),
          ended_by_profile_id = v_actor_id
      where id = v_current.id
      returning * into v_new;
      v_decision := 'allowed';
      v_reason := 'assignment_revoked';
      v_assignment_id := v_new.id;
      v_status := v_new.lifecycle_status;
    end if;
  end if;

  insert into private.assignment_change_idempotency (
    actor_profile_id, idempotency_key_hash, request_hash, decision,
    reason_code, assignment_id, lifecycle_status
  ) values (
    v_actor_id, v_idempotency_hash, v_request_hash, v_decision,
    v_reason, v_assignment_id, v_status
  );

  v_receipt_id := private.write_engagement_access_audit(
    case
      when v_reason = 'assignment_granted' then 'assignment_granted'
      when v_reason = 'assignment_reassigned' then 'assignment_reassigned'
      when v_reason = 'assignment_revoked' then 'assignment_revoked'
      when v_decision = 'denied' then 'assignment_change_denied'
      else 'assignment_change_noop'
    end,
    v_decision,
    v_reason,
    v_actor_id,
    p_assignee_profile_id,
    p_order_id,
    v_assignment_id,
    v_old_assignment_id,
    v_audit_role,
    'assignment',
    v_assignment_id,
    v_audit_operation,
    v_request_hash
  );

  return query select v_decision, v_reason, v_assignment_id, v_status, v_receipt_id;
end;
$$;

revoke all on function public.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) from public, anon, service_role;
grant execute on function public.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) to authenticated;

create or replace function public.read_engagement_workspace(p_order_id uuid)
returns table (
  authorized boolean,
  reason_code text,
  receipt_id bigint,
  workspace_json jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_assignment public.engagement_assignments%rowtype;
  v_receipt_id bigint;
  v_reason text;
  v_payload jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'read_committed_required',
      v_actor_id, v_actor_id, p_order_id, null, null, null,
      'workspace', null, 'read_workspace', null
    );
    return query select false, 'read_committed_required', v_receipt_id, null::jsonb;
    return;
  end if;

  if not (select private.has_live_auth_session()) then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'live_session_required',
      v_actor_id, v_actor_id, p_order_id, null, null, null,
      'workspace', null, 'read_workspace', null
    );
    return query select false, 'live_session_required', v_receipt_id, null::jsonb;
    return;
  end if;

  select a.* into v_assignment
  from public.engagement_assignments a
  join public.profiles p on p.id = a.assignee_profile_id and p.active = true
  where a.order_id = p_order_id
    and a.assignee_profile_id = v_actor_id
    and a.assignment_role in ('service_lead', 'assigned_reviewer')
    and a.lifecycle_status = 'active'
    and a.starts_at <= statement_timestamp()
    and a.expires_at > statement_timestamp()
  for share of a, p;

  if not found then
    v_reason := case
      when exists (
        select 1 from public.engagement_assignments a
        where a.order_id = p_order_id
          and a.assignee_profile_id = v_actor_id
          and a.lifecycle_status = 'active'
          and a.expires_at <= statement_timestamp()
      ) then 'assignment_expired'
      else 'active_assignment_required'
    end;
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', v_reason, v_actor_id, v_actor_id,
      p_order_id, null, null, null, 'workspace', null, 'read_workspace', null
    );
    return query select false, v_reason, v_receipt_id, null::jsonb;
    return;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', w.id,
        'itemType', w.item_type,
        'content', w.content_json,
        'lockVersion', w.lock_version,
        'updatedAt', w.updated_at
      ) order by w.updated_at, w.id
    ),
    '[]'::jsonb
  ) into v_payload
  from public.engagement_work_items w
  where w.order_id = p_order_id;

  v_receipt_id := private.write_engagement_access_audit(
    'engagement_access_allowed', 'allowed', 'active_assignment', v_actor_id,
    v_actor_id, p_order_id, v_assignment.id, null, v_assignment.assignment_role,
    'workspace', null, 'read_workspace', null
  );
  return query select true, 'active_assignment', v_receipt_id, v_payload;
end;
$$;

revoke all on function public.read_engagement_workspace(uuid)
  from public, anon, service_role;
grant execute on function public.read_engagement_workspace(uuid)
  to authenticated;

create or replace function public.read_service_lead_engagement(p_order_id uuid)
returns table (
  authorized boolean,
  reason_code text,
  receipt_id bigint,
  engagement_json jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_assignment public.engagement_assignments%rowtype;
  v_receipt_id bigint;
  v_payload jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'read_committed_required',
      v_actor_id, v_actor_id, p_order_id, null, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'read_committed_required', v_receipt_id, null::jsonb;
    return;
  end if;

  if not (select private.has_live_auth_session()) then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'live_session_required',
      v_actor_id, v_actor_id, p_order_id, null, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'live_session_required', v_receipt_id, null::jsonb;
    return;
  end if;

  select a.* into v_assignment
  from public.engagement_assignments a
  join public.profiles p on p.id = a.assignee_profile_id and p.active = true
  where a.order_id = p_order_id
    and a.assignee_profile_id = v_actor_id
    and a.assignment_role = 'service_lead'
    and a.lifecycle_status = 'active'
    and a.starts_at <= statement_timestamp()
    and a.expires_at > statement_timestamp()
  for share of a, p;

  if not found then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'service_lead_assignment_required',
      v_actor_id, v_actor_id, p_order_id, null, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'service_lead_assignment_required', v_receipt_id, null::jsonb;
    return;
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'dueAt', o.due_at,
      'deliveredAt', o.delivered_at,
      'createdAt', o.created_at,
      'updatedAt', o.updated_at
    ),
    'account', jsonb_build_object(
      'id', ac.id,
      'name', ac.name,
      'accountType', ac.account_type,
      'website', ac.website,
      'location', ac.location,
      'status', ac.status
    ),
    'campaign', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'campaignFamily', c.campaign_family,
      'primaryAction', c.primary_action,
      'status', c.status,
      'notes', c.notes
    ),
    'primaryContact', case
      when ct.id is null then null
      else jsonb_build_object(
        'id', ct.id,
        'name', ct.name,
        'email', ct.email,
        'role', ct.role,
        'phone', ct.phone
      )
    end,
    'brief', case
      when b.id is null then null
      else jsonb_build_object(
        'id', b.id,
        'rawSubmission', b.raw_submission_json,
        'organizationName', b.organization_name,
        'campaignName', b.campaign_name,
        'campaignType', b.campaign_type,
        'dateTime', b.date_time,
        'locationOrLink', b.location_or_link,
        'targetAudience', b.target_audience,
        'mainGoal', b.main_goal,
        'offerOrAsk', b.offer_or_ask,
        'keyDetails', b.key_details,
        'tone', b.tone,
        'channelsNeeded', b.channels_needed,
        'websiteSocialLinks', b.website_social_links,
        'phrasesToInclude', b.phrases_to_include,
        'phrasesToAvoid', b.phrases_to_avoid,
        'additionalNotes', b.additional_notes,
        'deliveryEmail', b.delivery_email
      )
    end
  ) into v_payload
  from public.orders o
  join public.accounts ac on ac.id = o.account_id
  join public.campaigns c on c.id = o.campaign_id
  left join public.contacts ct on ct.id = o.primary_contact_id
  left join public.briefs b on b.order_id = o.id
  where o.id = p_order_id;

  if v_payload is null then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'order_not_found', v_actor_id,
      v_actor_id, p_order_id, v_assignment.id, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'order_not_found', v_receipt_id, null::jsonb;
    return;
  end if;

  v_receipt_id := private.write_engagement_access_audit(
    'engagement_access_allowed', 'allowed', 'active_service_lead_assignment',
    v_actor_id, v_actor_id, p_order_id, v_assignment.id, null, 'service_lead',
    'service_lead_engagement', p_order_id, 'read_service_lead_engagement', null
  );
  return query select true, 'active_service_lead_assignment', v_receipt_id, v_payload;
end;
$$;

revoke all on function public.read_service_lead_engagement(uuid)
  from public, anon, service_role;
grant execute on function public.read_service_lead_engagement(uuid)
  to authenticated;

create or replace function public.write_engagement_work_item(
  p_order_id uuid,
  p_work_item_id uuid,
  p_item_type text,
  p_content_json jsonb,
  p_expected_lock_version integer,
  p_idempotency_key text
)
returns table (
  authorized boolean,
  reason_code text,
  receipt_id bigint,
  work_item_id uuid,
  lock_version integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_assignment public.engagement_assignments%rowtype;
  v_item public.engagement_work_items%rowtype;
  v_existing private.work_item_change_idempotency%rowtype;
  v_idempotency_hash text;
  v_request_hash text;
  v_receipt_id bigint;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'read_committed_required',
      v_actor_id, v_actor_id, p_order_id, null, null, null,
      'work_item', p_work_item_id, 'write_work_item', null
    );
    return query select false, 'read_committed_required', v_receipt_id,
      null::uuid, null::integer;
    return;
  end if;

  if not (select private.has_live_auth_session()) then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'live_session_required',
      v_actor_id, v_actor_id, p_order_id, null, null, null,
      'work_item', p_work_item_id, 'write_work_item', null
    );
    return query select false, 'live_session_required', v_receipt_id,
      null::uuid, null::integer;
    return;
  end if;

  select a.* into v_assignment
  from public.engagement_assignments a
  join public.profiles p on p.id = a.assignee_profile_id and p.active = true
  where a.order_id = p_order_id
    and a.assignee_profile_id = v_actor_id
    and a.assignment_role in ('service_lead', 'assigned_reviewer')
    and a.lifecycle_status = 'active'
    and a.starts_at <= statement_timestamp()
    and a.expires_at > statement_timestamp()
  for share of a, p;

  if not found then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'active_assignment_required',
      v_actor_id, v_actor_id, p_order_id, null, null, null,
      'work_item', p_work_item_id, 'write_work_item', null
    );
    return query select false, 'active_assignment_required', v_receipt_id,
      null::uuid, null::integer;
    return;
  end if;

  if p_item_type is null
    or p_item_type not in ('sanitized_brief', 'fact_ledger', 'draft', 'qa_checklist', 'review_comment')
    or p_content_json is null
    or pg_column_size(p_content_json) > 262144
  then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'invalid_work_item', v_actor_id,
      v_actor_id, p_order_id, v_assignment.id, null, v_assignment.assignment_role,
      'work_item', p_work_item_id, 'write_work_item', null
    );
    return query select false, 'invalid_work_item', v_receipt_id, null::uuid, null::integer;
    return;
  end if;

  if v_assignment.assignment_role = 'assigned_reviewer'
    and p_item_type not in ('qa_checklist', 'review_comment')
  then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'reviewer_write_scope_denied',
      v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
      v_assignment.assignment_role, 'work_item', p_work_item_id,
      'write_work_item', null
    );
    return query select false, 'reviewer_write_scope_denied', v_receipt_id,
      null::uuid, null::integer;
    return;
  end if;

  if p_work_item_id is null then
    if p_expected_lock_version is not null then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'new_item_version_must_be_null',
        v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', null, 'write_work_item', null
      );
      return query select false, 'new_item_version_must_be_null', v_receipt_id,
        null::uuid, null::integer;
      return;
    end if;

    if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200 then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'invalid_idempotency_key',
        v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', null,
        'write_work_item', null
      );
      return query select false, 'invalid_idempotency_key', v_receipt_id,
        null::uuid, null::integer;
      return;
    end if;

    v_idempotency_hash := encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_idempotency_key, 'UTF8')),
      'hex'
    );
    v_request_hash := encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          concat_ws('|', p_order_id::text, p_item_type, p_content_json::text),
          'UTF8'
        )
      ),
      'hex'
    );

    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(v_actor_id::text || ':' || v_idempotency_hash, 17042026)
    ) then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'work_item_change_busy',
        v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', null,
        'write_work_item', v_request_hash
      );
      return query select false, 'work_item_change_busy', v_receipt_id,
        null::uuid, null::integer;
      return;
    end if;

    select * into v_existing
    from private.work_item_change_idempotency
    where actor_profile_id = v_actor_id
      and idempotency_key_hash = v_idempotency_hash;

    if found then
      if v_existing.request_hash = v_request_hash then
        v_receipt_id := private.write_engagement_access_audit(
          'engagement_access_allowed', 'noop', 'idempotent_replay',
          v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
          v_assignment.assignment_role, 'work_item', v_existing.work_item_id,
          'write_work_item', v_request_hash
        );
        return query select true, 'idempotent_replay', v_receipt_id,
          v_existing.work_item_id, v_existing.lock_version;
      else
        v_receipt_id := private.write_engagement_access_audit(
          'engagement_access_denied', 'denied', 'idempotency_conflict',
          v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
          v_assignment.assignment_role, 'work_item', null,
          'write_work_item', v_request_hash
        );
        return query select false, 'idempotency_conflict', v_receipt_id,
          null::uuid, null::integer;
      end if;
      return;
    end if;

    insert into public.engagement_work_items (
      order_id,
      item_type,
      content_json,
      created_by_profile_id,
      updated_by_profile_id
    ) values (
      p_order_id,
      p_item_type,
      p_content_json,
      v_actor_id,
      v_actor_id
    ) returning * into v_item;

    insert into private.work_item_change_idempotency (
      actor_profile_id,
      idempotency_key_hash,
      request_hash,
      decision,
      reason_code,
      work_item_id,
      lock_version
    ) values (
      v_actor_id,
      v_idempotency_hash,
      v_request_hash,
      'allowed',
      'work_item_written',
      v_item.id,
      v_item.lock_version
    );
  else
    if p_idempotency_key is not null then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'update_idempotency_key_must_be_null',
        v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', p_work_item_id,
        'write_work_item', null
      );
      return query select false, 'update_idempotency_key_must_be_null', v_receipt_id,
        null::uuid, null::integer;
      return;
    end if;

    select * into v_item
    from public.engagement_work_items
    where id = p_work_item_id and order_id = p_order_id
    for update;

    if not found then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'work_item_not_found', v_actor_id,
        v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', p_work_item_id,
        'write_work_item', null
      );
      return query select false, 'work_item_not_found', v_receipt_id,
        null::uuid, null::integer;
      return;
    end if;

    if v_item.item_type <> p_item_type then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'work_item_type_immutable',
        v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', p_work_item_id,
        'write_work_item', null
      );
      return query select false, 'work_item_type_immutable', v_receipt_id,
        null::uuid, null::integer;
      return;
    end if;

    if p_expected_lock_version is null or v_item.lock_version <> p_expected_lock_version then
      v_receipt_id := private.write_engagement_access_audit(
        'engagement_access_denied', 'denied', 'work_item_version_conflict',
        v_actor_id, v_actor_id, p_order_id, v_assignment.id, null,
        v_assignment.assignment_role, 'work_item', p_work_item_id,
        'write_work_item', null
      );
      return query select false, 'work_item_version_conflict', v_receipt_id,
        v_item.id, v_item.lock_version;
      return;
    end if;

    update public.engagement_work_items
    set content_json = p_content_json,
        updated_by_profile_id = v_actor_id
    where id = v_item.id
    returning * into v_item;
  end if;

  v_receipt_id := private.write_engagement_access_audit(
    'engagement_access_allowed', 'allowed', 'work_item_written', v_actor_id,
    v_actor_id, p_order_id, v_assignment.id, null, v_assignment.assignment_role,
    'work_item', v_item.id, 'write_work_item', v_request_hash
  );
  return query select true, 'work_item_written', v_receipt_id,
    v_item.id, v_item.lock_version;
end;
$$;

revoke all on function public.write_engagement_work_item(
  uuid, uuid, text, jsonb, integer, text
) from public, anon, service_role;
grant execute on function public.write_engagement_work_item(
  uuid, uuid, text, jsonb, integer, text
) to authenticated;

-- Remove every global active-staff content policy. The replacement policies
-- are defense in depth: authenticated receives no direct customer-table
-- grants below, and audited routines are the only supported data path.
drop policy if exists "Profile self or active staff read" on public.profiles;
drop policy if exists "Owners manage staff profiles" on public.profiles;
drop policy if exists "Active staff access accounts" on public.accounts;
drop policy if exists "Active staff access contacts" on public.contacts;
drop policy if exists "Active staff access campaigns" on public.campaigns;
drop policy if exists "Active staff access orders" on public.orders;
drop policy if exists "Active staff access briefs" on public.briefs;
drop policy if exists "Active staff read notes" on public.internal_notes;
drop policy if exists "Active staff add own notes" on public.internal_notes;
drop policy if exists "Active staff delete notes" on public.internal_notes;
drop policy if exists "Active staff read activity" on public.activity_events;
drop policy if exists "Active staff add own activity" on public.activity_events;

create policy "Assigned service leads read accounts"
  on public.accounts for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.account_id = accounts.id
      and (select private.has_active_engagement_role(o.id, array['service_lead']))
  ));

create policy "Assigned service leads read contacts"
  on public.contacts for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.primary_contact_id = contacts.id
      and (select private.has_active_engagement_role(o.id, array['service_lead']))
  ));

create policy "Assigned service leads read campaigns"
  on public.campaigns for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.campaign_id = campaigns.id
      and (select private.has_active_engagement_role(o.id, array['service_lead']))
  ));

create policy "Assigned service leads read orders"
  on public.orders for select to authenticated
  using ((select private.has_active_engagement_role(id, array['service_lead'])));

create policy "Assigned service leads read briefs"
  on public.briefs for select to authenticated
  using ((select private.has_active_engagement_role(order_id, array['service_lead'])));

create policy "Assigned service leads read notes"
  on public.internal_notes for select to authenticated
  using (
    order_id is not null
    and (select private.has_active_engagement_role(order_id, array['service_lead']))
  );

create policy "Assigned service leads read activity"
  on public.activity_events for select to authenticated
  using (
    order_id is not null
    and (select private.has_active_engagement_role(order_id, array['service_lead']))
  );

create policy "Assignees read own active assignment"
  on public.engagement_assignments for select to authenticated
  using (
    assignee_profile_id = (select auth.uid())
    and lifecycle_status = 'active'
    and starts_at <= statement_timestamp()
    and expires_at > statement_timestamp()
    and (select private.has_active_engagement_role(
      order_id,
      array[assignment_role]
    ))
  );

create policy "Assigned roles read engagement work items"
  on public.engagement_work_items for select to authenticated
  using ((select private.has_active_engagement_role(
    order_id,
    array['service_lead', 'assigned_reviewer']
  )));

create policy "Assigned roles insert scoped work items"
  on public.engagement_work_items for insert to authenticated
  with check (
    created_by_profile_id = (select auth.uid())
    and updated_by_profile_id = (select auth.uid())
    and (
      (select private.has_active_engagement_role(order_id, array['service_lead']))
      or (
        item_type in ('qa_checklist', 'review_comment')
        and (select private.has_active_engagement_role(order_id, array['assigned_reviewer']))
      )
    )
  );

create policy "Assigned roles update scoped work items"
  on public.engagement_work_items for update to authenticated
  using ((select private.has_active_engagement_role(
    order_id,
    array['service_lead', 'assigned_reviewer']
  )))
  with check (
    updated_by_profile_id = (select auth.uid())
    and (
      (select private.has_active_engagement_role(order_id, array['service_lead']))
      or (
        item_type in ('qa_checklist', 'review_comment')
        and (select private.has_active_engagement_role(order_id, array['assigned_reviewer']))
      )
    )
  );

-- Direct content-table and assignment-table access is denied even when an
-- RLS predicate exists; audited routines above are the supported boundary.
revoke all privileges on table public.accounts, public.contacts,
  public.campaigns, public.orders, public.briefs, public.internal_notes,
  public.activity_events, public.engagement_assignments,
  public.engagement_work_items
  from anon, authenticated, service_role;

revoke all privileges on table public.pending_intakes
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.pending_intakes to service_role;

revoke all privileges on table public.profiles from anon, service_role;
revoke all privileges on table public.profiles from authenticated;

-- Profile onboarding, activation, demotion, and deactivation remain an
-- external administrator ceremony under the owner-protection trigger. No
-- application role receives standing profile read or mutation access here.

-- Historical payment surfaces are retained for reversible data compatibility
-- but fail closed: no authenticated/service-role table or routine access, no
-- active payment Cron, and no new payment implementation.
drop policy if exists "Active staff read checkout intents" on public.checkout_intents;
drop policy if exists "Active staff read stripe events" on public.stripe_events;
drop policy if exists "Active staff read Stripe webhook receipts" on public.stripe_webhook_receipts;

revoke all privileges on table public.checkout_intents, public.stripe_events,
  public.stripe_webhook_receipts, private.checkout_rate_limit_counters
  from public, anon, authenticated, service_role;

revoke all on function public.finalize_stripe_checkout(
  text, text, text, text, uuid, integer, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.consume_checkout_rate_limit(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_stripe_webhook_attempt(text, text, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.payment_operations_health()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_payment_operational_data(timestamptz)
  from public, anon, authenticated, service_role;

select cron.alter_job(job_id := j.jobid, active := false)
from cron.job j
where j.jobname = 'racoben-payment-operational-cleanup'
  and j.active = true;

commit;
