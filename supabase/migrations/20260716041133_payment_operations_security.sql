-- Payment webhook observability and conservative operational-data retention.
--
-- pg_cron 1.6.4 availability was verified on the production Postgres 17.6
-- project before authoring the bounded daily cleanup job below.

create extension if not exists pg_cron with schema pg_catalog;

revoke all on schema cron from public, anon, authenticated, service_role;
revoke all privileges on all tables in schema cron
  from public, anon, authenticated, service_role;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Race-free checkout throttling. Subjects are keyed by an application-side
-- HMAC-SHA256 digest; raw IP addresses and customer emails never enter this
-- table. Keeping it in private plus RLS/no grants protects it from Data API
-- exposure even if schema settings change later.
create table private.checkout_rate_limit_counters (
  subject_hash text not null,
  scope text not null check (scope in ('checkout_ip', 'checkout_email')),
  window_started_at timestamptz not null,
  last_attempted_at timestamptz not null,
  attempt_count integer not null check (attempt_count between 1 and 11),
  primary key (subject_hash, scope),
  check (subject_hash ~ '^[0-9a-f]{64}$')
);

comment on table private.checkout_rate_limit_counters is
  'Short-lived checkout rate-limit windows keyed only by HMAC-SHA256 subject digests; never stores raw IP or email values.';

create index idx_checkout_rate_limit_counters_last_attempted
  on private.checkout_rate_limit_counters (last_attempted_at);

alter table private.checkout_rate_limit_counters enable row level security;
revoke all on table private.checkout_rate_limit_counters
  from public, anon, authenticated, service_role;

create or replace function public.consume_checkout_rate_limit(
  p_subject_hash text,
  p_scope text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_window_seconds integer;
  v_window interval;
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_attempt_count integer;
begin
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid checkout rate-limit subject' using errcode = '22023';
  end if;

  case p_scope
    when 'checkout_ip' then
      v_limit := 10;
      v_window_seconds := 600;
    when 'checkout_email' then
      v_limit := 5;
      v_window_seconds := 3600;
    else
      raise exception 'Unknown checkout rate-limit scope' using errcode = '22023';
  end case;

  v_window := make_interval(secs => v_window_seconds);

  insert into private.checkout_rate_limit_counters (
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
        when private.checkout_rate_limit_counters.window_started_at <= v_now - v_window
          then v_now
        else private.checkout_rate_limit_counters.window_started_at
      end,
      last_attempted_at = v_now,
      attempt_count = case
        when private.checkout_rate_limit_counters.window_started_at <= v_now - v_window
          then 1
        else least(private.checkout_rate_limit_counters.attempt_count + 1, v_limit + 1)
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

comment on function public.consume_checkout_rate_limit(text, text) is
  'Atomically consumes a checkout IP (10/10m) or email (5/1h) rate-limit token using an HMAC-SHA256 subject digest.';

revoke all on function public.consume_checkout_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limit(text, text)
  to service_role;

create table public.stripe_webhook_receipts (
  event_id text primary key,
  event_type text not null,
  livemode boolean,
  checkout_session_id text,
  order_id uuid references public.orders (id) on delete set null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error_code text,
  first_received_at timestamptz not null default now(),
  last_attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  check (char_length(event_id) between 3 and 255),
  check (char_length(event_type) between 3 and 255),
  check (checkout_session_id is null or char_length(checkout_session_id) between 3 and 255),
  check (
    last_error_code is null
    or (
      char_length(last_error_code) between 1 and 100
      and last_error_code ~ '^[a-z0-9][a-z0-9_.-]*$'
    )
  )
);

comment on table public.stripe_webhook_receipts is
  'Metadata-only receipt log for verified Stripe webhooks. Never store payloads, customer data, or raw errors here.';

comment on column public.stripe_webhook_receipts.livemode is
  'Stripe event livemode. NULL is reserved for historical events backfilled before receipt logging existed.';

create index idx_stripe_webhook_receipts_status_attempted
  on public.stripe_webhook_receipts (processing_status, last_attempted_at desc);

create index idx_stripe_webhook_receipts_order
  on public.stripe_webhook_receipts (order_id)
  where order_id is not null;

alter table public.stripe_webhook_receipts enable row level security;

create policy "Active staff read Stripe webhook receipts"
  on public.stripe_webhook_receipts for select to authenticated
  using ((select private.is_active_staff()));

revoke all privileges on table public.stripe_webhook_receipts from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.stripe_webhook_receipts from authenticated;
grant select on table public.stripe_webhook_receipts to authenticated;

-- Seed receipt history from successfully processed idempotency records. The
-- old table does not record livemode, so that value is deliberately unknown.
insert into public.stripe_webhook_receipts (
  event_id,
  event_type,
  livemode,
  checkout_session_id,
  order_id,
  processing_status,
  attempt_count,
  first_received_at,
  last_attempted_at,
  completed_at
)
select
  event_id,
  event_type,
  null,
  checkout_session_id,
  order_id,
  'processed',
  1,
  processed_at,
  processed_at,
  processed_at
from public.stripe_events
on conflict (event_id) do nothing;

create or replace function public.begin_stripe_webhook_attempt(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_id is null or char_length(p_event_id) not between 3 and 255 then
    raise exception 'Invalid Stripe event identifier' using errcode = '22023';
  end if;

  if p_event_type is null or char_length(p_event_type) not between 3 and 255 then
    raise exception 'Invalid Stripe event type' using errcode = '22023';
  end if;

  if p_livemode is null then
    raise exception 'Stripe livemode must be explicit' using errcode = '22023';
  end if;

  if p_checkout_session_id is not null
    and char_length(p_checkout_session_id) not between 3 and 255
  then
    raise exception 'Invalid Stripe Checkout Session identifier' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_receipts (
    event_id,
    event_type,
    livemode,
    checkout_session_id,
    processing_status,
    attempt_count,
    first_received_at,
    last_attempted_at,
    completed_at,
    last_error_code
  ) values (
    p_event_id,
    p_event_type,
    p_livemode,
    p_checkout_session_id,
    'received',
    1,
    clock_timestamp(),
    clock_timestamp(),
    null,
    null
  )
  on conflict (event_id) do update
  set event_type = excluded.event_type,
      livemode = excluded.livemode,
      checkout_session_id = coalesce(
        excluded.checkout_session_id,
        public.stripe_webhook_receipts.checkout_session_id
      ),
      processing_status = 'received',
      attempt_count = public.stripe_webhook_receipts.attempt_count + 1,
      last_attempted_at = clock_timestamp(),
      completed_at = null,
      last_error_code = null;
end;
$$;

revoke all on function public.begin_stripe_webhook_attempt(text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.begin_stripe_webhook_attempt(text, text, boolean, text)
  to service_role;

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

  if p_processing_status = 'processed' and p_order_id is null then
    raise exception 'Processed payment webhook must reference an order' using errcode = '22023';
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

revoke all on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_stripe_webhook_attempt(text, text, uuid, text)
  to service_role;

create or replace function public.payment_operations_health()
returns table (
  generated_at timestamptz,
  is_healthy boolean,
  latest_webhook_received_at timestamptz,
  latest_webhook_completed_at timestamptz,
  webhook_receipts_24h bigint,
  failed_webhook_receipts_24h bigint,
  stuck_webhook_receipts bigint,
  stale_unpaid_checkout_intents bigint,
  paid_checkout_intents_without_order bigint,
  paid_stripe_orders_without_intent bigint,
  paid_stripe_orders_without_event bigint,
  processed_stripe_events_without_paid_order bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_active_staff()) then
    raise exception 'Active staff access required' using errcode = '42501';
  end if;

  return query
  with webhook_metrics as (
    select
      max(r.first_received_at) as latest_received,
      max(r.completed_at) as latest_completed,
      count(*) filter (
        where r.last_attempted_at >= now() - interval '24 hours'
      ) as receipts_24h,
      count(*) filter (
        where r.processing_status = 'failed'
          and r.last_attempted_at >= now() - interval '24 hours'
      ) as failures_24h,
      count(*) filter (
        where r.processing_status = 'received'
          and r.last_attempted_at < now() - interval '5 minutes'
      ) as stuck_receipts
    from public.stripe_webhook_receipts r
  ),
  reconciliation_metrics as (
    select
      (
        select count(*)
        from public.checkout_intents ci
        where ci.order_id is null
          and ci.status in ('pending', 'checkout_created')
          and ci.created_at < now() - interval '48 hours'
      ) as stale_intents,
      (
        select count(*)
        from public.checkout_intents ci
        where ci.status = 'paid' and ci.order_id is null
      ) as paid_intents_without_order,
      (
        select count(*)
        from public.orders o
        where o.payment_status = 'paid'
          and o.stripe_checkout_session_id is not null
          and not exists (
            select 1
            from public.checkout_intents ci
            where ci.order_id = o.id and ci.status = 'paid'
          )
      ) as paid_orders_without_intent,
      (
        select count(*)
        from public.orders o
        where o.payment_status = 'paid'
          and o.stripe_checkout_session_id is not null
          and not exists (
            select 1 from public.stripe_events se where se.order_id = o.id
          )
      ) as paid_orders_without_event,
      (
        select count(*)
        from public.stripe_events se
        left join public.orders o on o.id = se.order_id
        where se.order_id is null or o.id is null or o.payment_status <> 'paid'
      ) as events_without_paid_order
  )
  select
    now(),
    (
      w.failures_24h = 0
      and w.stuck_receipts = 0
      and m.stale_intents = 0
      and m.paid_intents_without_order = 0
      and m.paid_orders_without_intent = 0
      and m.paid_orders_without_event = 0
      and m.events_without_paid_order = 0
    ),
    w.latest_received,
    w.latest_completed,
    w.receipts_24h,
    w.failures_24h,
    w.stuck_receipts,
    m.stale_intents,
    m.paid_intents_without_order,
    m.paid_orders_without_intent,
    m.paid_orders_without_event,
    m.events_without_paid_order
  from webhook_metrics w
  cross join reconciliation_metrics m;
end;
$$;

comment on function public.payment_operations_health() is
  'Active-staff aggregate payment health. Returns counts only; no customer data or Stripe payloads.';

revoke all on function public.payment_operations_health() from public, anon;
grant execute on function public.payment_operations_health() to authenticated;

create or replace function private.cleanup_payment_operational_data(
  p_as_of timestamptz default clock_timestamp()
)
returns table (
  checkout_intents_marked_expired bigint,
  abandoned_checkout_intents_deleted bigint,
  old_webhook_receipts_deleted bigint,
  old_rate_limit_counters_deleted bigint,
  old_cron_run_details_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired bigint;
  v_deleted_intents bigint;
  v_deleted_receipts bigint;
  v_deleted_rate_limits bigint;
  v_deleted_cron_runs bigint;
begin
  if p_as_of is null then
    raise exception 'Cleanup reference time is required' using errcode = '22023';
  end if;

  update public.checkout_intents
  set status = 'expired', updated_at = clock_timestamp()
  where order_id is null
    and status in ('pending', 'checkout_created')
    and created_at < p_as_of - interval '48 hours';
  get diagnostics v_expired = row_count;

  delete from public.checkout_intents ci
  where ci.order_id is null
    and ci.status = 'expired'
    and ci.created_at < p_as_of - interval '30 days'
    and not exists (
      select 1
      from public.stripe_events se
      where se.checkout_session_id = ci.stripe_checkout_session_id
    )
    and not exists (
      select 1
      from public.stripe_webhook_receipts swr
      where swr.checkout_session_id = ci.stripe_checkout_session_id
    );
  get diagnostics v_deleted_intents = row_count;

  delete from public.stripe_webhook_receipts swr
  where swr.processing_status in ('processed', 'ignored', 'failed')
    and swr.last_attempted_at < p_as_of - interval '400 days';
  get diagnostics v_deleted_receipts = row_count;

  delete from private.checkout_rate_limit_counters c
  where c.last_attempted_at < p_as_of - interval '48 hours';
  get diagnostics v_deleted_rate_limits = row_count;

  delete from cron.job_run_details j
  where j.end_time is not null
    and j.end_time < p_as_of - interval '30 days';
  get diagnostics v_deleted_cron_runs = row_count;

  return query
  select
    v_expired,
    v_deleted_intents,
    v_deleted_receipts,
    v_deleted_rate_limits,
    v_deleted_cron_runs;
end;
$$;

comment on function private.cleanup_payment_operational_data(timestamptz) is
  'Conservative admin-only retention: expires stale unpaid intents, removes abandoned intents after 30 days, prunes metadata-only webhook receipts after 400 days, rate-limit counters after 48 hours, and completed Cron history after 30 days. Never deletes orders, paid intents, Stripe idempotency events, briefs, contacts, accounts, or campaigns.';

revoke all on function private.cleanup_payment_operational_data(timestamptz)
  from public, anon, authenticated, service_role;

select cron.schedule(
  'racoben-payment-operational-cleanup',
  '17 4 * * *',
  $cron$select * from private.cleanup_payment_operational_data();$cron$
);
