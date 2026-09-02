#!/usr/bin/env bash
set -euo pipefail

# SN08A: prove one final schema from both the accepted clean chain and the
# faithful provider-only predecessor. All data and clusters are disposable,
# loopback-only, synthetic, permission-restricted, and removed on exit.

umask 077
export LC_ALL=C
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="${SNICK_PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
tmp_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/snickerdoodle-sn08a.XXXXXX")"
port="$((58000 + ($$ % 500)))"
data_dir="$tmp_dir/data"
log_file="$tmp_dir/postgres.log"
base_url="postgresql://postgres@127.0.0.1:$port"
clean_url="$base_url/clean"
hosted_url="$base_url/hosted"
blocked_url="$base_url/blocked"
reconcile_name='20260901160000_reconcile_provider_only_legacy_fulfillment.sql'
reconcile_path="$repo_root/supabase/migrations/$reconcile_name"
fixture_path="$repo_root/scripts/db/fixtures/hosted-20260831035135-close-paid-fulfillment.sql"
started=false

cleanup() {
  if [[ "$started" == true ]]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    "${TMPDIR:-/private/tmp}"/snickerdoodle-sn08a.*) rm -rf -- "$tmp_dir" ;;
    *) echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2; exit 70 ;;
  esac
}
trap cleanup EXIT

for tool in initdb pg_ctl postgres psql createdb pg_dump; do
  if [[ ! -x "$pg_bin/$tool" ]]; then
    echo "PostgreSQL 17 tool missing: $pg_bin/$tool" >&2
    exit 65
  fi
done
if [[ "$("$pg_bin/postgres" --version)" != postgres\ \(PostgreSQL\)\ 17.* ]]; then
  echo 'PostgreSQL 17 is required' >&2
  exit 65
fi
while read -r expected relative; do
  [[ -z "$expected" ]] && continue
  actual="$(shasum -a 256 "$repo_root/$relative" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Candidate migration changed: $relative ($actual)" >&2
    exit 65
  fi
done <"$repo_root/docs/customer-readiness/sn-sprint-08a-migration-shas.txt"
if [[ "$(shasum -a 256 "$fixture_path" | awk '{print $1}')" != \
  'cc26f913ff32c7df5a327c037fa65fc5705fd21a841d7d522cf0bdb8f15df6b0' ]]; then
  echo 'Hosted provider evidence fixture changed' >&2
  exit 65
fi

"$pg_bin/initdb" -D "$data_dir" -U postgres --auth=trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" \
  -o "-h 127.0.0.1 -p $port" -w start >/dev/null
started=true

"$pg_bin/psql" -X -q "$base_url/postgres" -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin superuser;
SQL
"$pg_bin/createdb" -h 127.0.0.1 -p "$port" -U postgres clean
"$pg_bin/createdb" -h 127.0.0.1 -p "$port" -U postgres hosted

setup_database() {
  local url="$1"
  "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1 <<'SQL'
create extension pgcrypto with schema public;
create schema auth authorization postgres;
create table auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false
);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refreshed_at timestamptz,
  not_after timestamptz
);
create function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
create schema cron authorization postgres;
create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default 'postgres',
  username text not null default 'postgres',
  active boolean not null default true
);
create table cron.job_run_details (
  runid bigint generated always as identity primary key,
  end_time timestamptz
);
create function cron.schedule(p_jobname text, p_schedule text, p_command text)
returns bigint language plpgsql set search_path = '' as $$
declare v_id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (p_jobname, p_schedule, p_command) returning jobid into v_id;
  return v_id;
end;
$$;
create function cron.alter_job(
  job_id bigint,
  schedule text default null,
  command text default null,
  database text default null,
  username text default null,
  active boolean default null
) returns void language sql set search_path = '' as $$
  update cron.job set
    schedule = coalesce($2, cron.job.schedule),
    command = coalesce($3, cron.job.command),
    database = coalesce($4, cron.job.database),
    username = coalesce($5, cron.job.username),
    active = coalesce($6, cron.job.active)
  where cron.job.jobid = $1;
$$;
create schema supabase_migrations authorization postgres;
create table supabase_migrations.schema_migrations (
  version text primary key,
  statements text,
  name text
);
SQL
}

seed_owner() {
  local url="$1"
  "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '68000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'sn08a-owner@example.invalid', '{}'::jsonb, '{}'::jsonb,
  now(), now(), false, false
);
update public.profiles set role = 'owner', active = true
where id = '68000000-0000-4000-8000-000000000001';
SQL
}

apply_migration() {
  local url="$1"
  local migration="$2"
  if [[ "$(basename "$migration")" == '20260716041133_payment_operations_security.sql' ]]; then
    sed '/^create extension if not exists pg_cron with schema pg_catalog;$/d' "$migration" |
      "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1
  else
    "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1 -f "$migration"
  fi
}

record_migration() {
  local url="$1"
  local migration="$2"
  local filename version name
  filename="$(basename "$migration")"
  version="${filename%%_*}"
  name="${filename#*_}"
  name="${name%.sql}"
  "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1 \
    -v version="$version" -v name="$name" <<'SQL'
insert into supabase_migrations.schema_migrations(version, statements, name)
values (:'version', null, :'name');
SQL
}

replay_clean() {
  local count=0 migration
  for migration in "$repo_root"/supabase/migrations/*.sql; do
    apply_migration "$clean_url" "$migration"
    record_migration "$clean_url" "$migration"
    count=$((count + 1))
    if [[ "$(basename "$migration")" == '20260714202709_staff_authorization.sql' ]]; then
      seed_owner "$clean_url"
    fi
  done
  if [[ "$count" != 21 ]]; then
    echo "Expected 21 clean migrations, replayed $count" >&2
    exit 65
  fi
}

seed_pre_capacity_paid_graph() {
  "$pg_bin/psql" -X -q "$hosted_url" -v ON_ERROR_STOP=1 <<'SQL'
select
  clock_timestamp() + interval '60 minutes' as stripe_expiry,
  clock_timestamp() + interval '65 minutes' as reservation_expiry
\gset sn08a_
set role service_role;
insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version,
  stripe_checkout_session_id, status
) values (
  '68000000-0000-4000-8000-000000000010',
  jsonb_build_object(
    'organizationType', 'Nonprofit / Community organization',
    'campaignFamily', 'Cause / Nonprofit campaign',
    'primaryAction', 'Register',
    'organizationName', 'Synthetic SN08A Organization',
    'campaignName', 'Synthetic SN08A Campaign',
    'campaignType', 'Fundraiser',
    'campaignTypeOther', '',
    'dateTime', '2099-01-01T12:00:00Z',
    'locationOrLink', 'https://sn08a.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise hosted predecessor reconciliation',
    'offerAsk', 'Register',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'sn08a-buyer@example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'sn08a-buyer@example.invalid', 9900, 'usd', '2026-08-30',
  'cs_test_sn08a_historical', 'checkout_created'
);
select public.reserve_stripe_checkout_capacity(
  '68000000-0000-4000-8000-000000000010',
  :'sn08a_stripe_expiry'::timestamptz,
  :'sn08a_reservation_expiry'::timestamptz
);
select public.bind_stripe_checkout_capacity(
  '68000000-0000-4000-8000-000000000010',
  'cs_test_sn08a_historical',
  :'sn08a_stripe_expiry'::timestamptz
);
select public.begin_stripe_webhook_attempt(
  'evt_test_sn08a_historical', 'checkout.session.completed', false,
  'cs_test_sn08a_historical'
);
select public.finalize_stripe_checkout(
  'evt_test_sn08a_historical', 'checkout.session.completed',
  'cs_test_sn08a_historical', 'pi_test_sn08a_historical',
  '68000000-0000-4000-8000-000000000010', 9900, 'usd',
  'sn08a-buyer@example.invalid', clock_timestamp()
);
select public.complete_stripe_webhook_attempt(
  'evt_test_sn08a_historical', 'processed',
  (select order_id from public.checkout_intents
   where id = '68000000-0000-4000-8000-000000000010'), null
);
reset role;
-- Faithfully emulate the pre-capacity paid graph that caused the provider-only
-- migration to synthesize a null-expiry historical singleton binding.
delete from public.snickerdoodle_order_capacity
where intent_id = '68000000-0000-4000-8000-000000000010';
SQL
}

replay_hosted_path() {
  local count=0 migration filename
  for migration in "$repo_root"/supabase/migrations/*.sql; do
    filename="$(basename "$migration")"
    if [[ "$filename" > '20260830202804_harden_checkout_reconciliation_and_owner_aal2.sql' ]]; then
      break
    fi
    apply_migration "$hosted_url" "$migration"
    record_migration "$hosted_url" "$migration"
    count=$((count + 1))
    if [[ "$filename" == '20260714202709_staff_authorization.sql' ]]; then
      seed_owner "$hosted_url"
    fi
  done
  if [[ "$count" != 15 ]]; then
    echo "Expected 15 accepted hosted predecessors, replayed $count" >&2
    exit 65
  fi

  seed_pre_capacity_paid_graph
  apply_migration "$hosted_url" "$fixture_path"

  if [[ "$("$pg_bin/psql" -X -qAt "$hosted_url" -c \
    "select count(*) from public.snickerdoodle_order_capacity where capacity_origin='historical_paid_backfill'")" != 1 ]]; then
    echo 'Faithful hosted predecessor did not synthesize one historical binding' >&2
    exit 1
  fi

  "$pg_bin/createdb" -h 127.0.0.1 -p "$port" -U postgres \
    --template=hosted blocked
  "$pg_bin/psql" -X -q "$blocked_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into private.owner_fulfillment_close_receipts (
  actor_profile_id, checkout_intent_id, order_id,
  idempotency_key_hash, request_hash, assignments_revoked, capacity_released
) values (
  '68000000-0000-4000-8000-000000000001',
  '68000000-0000-4000-8000-000000000010',
  (select order_id from public.checkout_intents
   where id = '68000000-0000-4000-8000-000000000010'),
  repeat('a', 64), repeat('b', 64), 0, false
);
SQL
  if "$pg_bin/psql" -X -q "$blocked_url" -v ON_ERROR_STOP=1 \
      -f "$reconcile_path" >"$tmp_dir/blocked.out" 2>"$tmp_dir/blocked.err"; then
    echo 'Reconciliation did not block nonempty legacy evidence' >&2
    exit 1
  fi
  if ! grep -q 'Legacy fulfillment receipts are material evidence' \
      "$tmp_dir/blocked.err" \
    || [[ "$("$pg_bin/psql" -X -qAt "$blocked_url" -c \
      'select count(*) from private.owner_fulfillment_close_receipts')" != 1 ]] \
    || [[ "$("$pg_bin/psql" -X -qAt "$blocked_url" -c \
      "select to_regprocedure('public.close_owner_paid_fulfillment(uuid,text)') is not null")" != t ]]; then
    echo 'Failed legacy-evidence retirement did not roll back intact' >&2
    exit 1
  fi

  for migration in "$repo_root"/supabase/migrations/*.sql; do
    filename="$(basename "$migration")"
    if [[ "$filename" < "$reconcile_name" ]]; then continue; fi
    apply_migration "$hosted_url" "$migration"
    record_migration "$hosted_url" "$migration"
  done
}

schema_dump() {
  "$pg_bin/pg_dump" --schema-only --no-owner --file="$2" "$1"
}

assert_final() {
  local url="$1"
  "$pg_bin/psql" -X -qAt "$url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  v_public_fulfillment_count integer;
begin
  select count(*) into v_public_fulfillment_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('close_owner_paid_fulfillment', 'transition_order_fulfillment');

  if v_public_fulfillment_count <> 1
    or pg_catalog.to_regprocedure(
      'public.transition_order_fulfillment(uuid,text,text,uuid)'
    ) is null
    or pg_catalog.to_regprocedure(
      'public.close_owner_paid_fulfillment(uuid,text)'
    ) is not null
    or pg_catalog.to_regclass(
      'private.owner_fulfillment_close_receipts'
    ) is not null
    or pg_catalog.to_regclass(
      'private.owner_fulfillment_close_idempotency'
    ) is not null
    or pg_catalog.to_regprocedure(
      'private.backfill_paid_intake_manager_queue()'
    ) is not null
    or exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.stripe_checkout_reservations'::regclass
        and a.attname = 'capacity_origin' and a.attnum > 0 and not a.attisdropped
    )
    or exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prokind in ('f', 'p')
        and pg_catalog.pg_get_functiondef(p.oid) like
          '%snickerdoodle:standard_99:one-active-order:v1%'
    )
  then
    raise exception 'Provider-only fulfillment or singleton residue remains';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.transition_order_fulfillment(uuid,text,text,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'private.transition_order_fulfillment_internal(uuid,text,text,uuid)',
    'execute'
  ) then
    raise exception 'Authoritative fulfillment grants are incorrect';
  end if;
end;
$$;
select 'FINAL_OK';
SQL
}

setup_database "$clean_url"
setup_database "$hosted_url"
replay_clean
replay_hosted_path

schema_dump "$clean_url" "$tmp_dir/clean-schema.sql"
schema_dump "$hosted_url" "$tmp_dir/hosted-schema.sql"
if ! cmp -s "$tmp_dir/clean-schema.sql" "$tmp_dir/hosted-schema.sql"; then
  diff -u "$tmp_dir/clean-schema.sql" "$tmp_dir/hosted-schema.sql" || true
  echo 'Schema convergence failed' >&2
  exit 1
fi
clean_schema_hash="$(shasum -a 256 "$tmp_dir/clean-schema.sql" | awk '{print $1}')"

assert_final "$clean_url"
assert_final "$hosted_url"

if [[ "$("$pg_bin/psql" -X -qAt "$hosted_url" -c \
  "select count(*) from public.checkout_intents i join public.orders o on o.id=i.order_id join public.briefs b on b.order_id=o.id where i.id='68000000-0000-4000-8000-000000000010' and i.status='paid' and o.payment_status='paid'")" != 1 ]]; then
  echo 'Historical paid graph was not preserved' >&2
  exit 1
fi

echo 'SNICK_SN08A_HOSTED_RECONCILIATION_PASS postgres=17 migrations=21 paths=clean_hosted_predecessor'
echo "SN08A_FINAL_SCHEMA_SHA256=$clean_schema_hash"
echo 'SN08A_HISTORICAL_GRAPH=preserved'
echo 'SN08A_PROVIDER_ONLY_OBJECTS=retired'
echo 'SN08A_LEGACY_RECEIPT_PRESERVATION=blocked_23514_and_rolled_back'
echo 'SN08A_AUTHORITATIVE_FULFILLMENT=public.transition_order_fulfillment'
echo 'SN08A_TEMP_ARTIFACT_CLEANUP=armed'
