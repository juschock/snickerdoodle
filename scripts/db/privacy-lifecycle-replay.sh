#!/usr/bin/env bash
set -euo pipefail

# Clean, disposable PostgreSQL 17 replay for SN Sprint 05. The temporary
# cluster listens only on loopback and is removed after the test run.

umask 077
export LC_ALL=C
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="${SNICK_PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
tmp_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/snickerdoodle-sn05.XXXXXX")"
port="$((56000 + ($$ % 700)))"
data_dir="$tmp_dir/data"
log_file="$tmp_dir/postgres.log"
db_url="postgresql://postgres@127.0.0.1:$port/postgres"
started=false

cleanup() {
  if [[ "$started" == true ]]; then
    "$pg_bin/pg_ctl" -D "$data_dir" -m fast -w stop >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    "${TMPDIR:-/private/tmp}"/snickerdoodle-sn05.*) rm -rf -- "$tmp_dir" ;;
    *) echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2 ;;
  esac
}
trap cleanup EXIT

for tool in initdb pg_ctl psql postgres; do
  if [[ ! -x "$pg_bin/$tool" ]]; then
    echo "PostgreSQL 17 tool missing: $pg_bin/$tool" >&2
    exit 65
  fi
done
if [[ "$("$pg_bin/postgres" --version)" != postgres\ \(PostgreSQL\)\ 17.* ]]; then
  echo "PostgreSQL 17 is required" >&2
  exit 65
fi

while read -r expected relative; do
  actual="$(shasum -a 256 "$repo_root/$relative" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Accepted predecessor changed: $relative ($actual)" >&2
    exit 65
  fi
done <"$repo_root/docs/customer-readiness/sn-sprint-05-baseline-migration-shas.txt"

"$pg_bin/initdb" -D "$data_dir" -U postgres --auth=trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" \
  -o "-h 127.0.0.1 -p $port" -w start >/dev/null
started=true

"$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin superuser;

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
SQL

migration_count=0
for migration in "$repo_root"/supabase/migrations/*.sql; do
  migration_count=$((migration_count + 1))
  if [[ "$(basename "$migration")" == \
    '20260716041133_payment_operations_security.sql' ]]; then
    sed '/^create extension if not exists pg_cron with schema pg_catalog;$/d' "$migration" |
      "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1
  else
    "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 -f "$migration"
  fi
  if [[ "$(basename "$migration")" == \
    '20260714202709_staff_authorization.sql' ]]; then
    "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '65000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'privacy-owner@sn05.example.invalid', '{}'::jsonb,
  '{"full_name":"Synthetic Privacy Owner"}'::jsonb,
  now(), now(), false, false
);
update public.profiles set role = 'owner', active = true, updated_at = now()
where id = '65000000-0000-4000-8000-000000000001';
SQL
  fi
done
if [[ "$migration_count" != '21' ]]; then
  echo "Expected 21 migrations, replayed $migration_count" >&2
  exit 65
fi

if [[ "${SNICK_PRIVACY_REPLAY_ONLY:-false}" != true ]]; then
  "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/privacy-lifecycle-acceptance.sql"
  "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/ord03-synthetic-fixture.sql"
  "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/ord03-acceptance.sql"
  "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/intake-manager-queue-acceptance.sql"
  "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/privileged-rpc-access-acceptance.sql"
  "$pg_bin/psql" -X -q "$db_url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/payment-state-machine-acceptance.sql"
  PAYMENT_DB_URL="$db_url" \
    bash "$repo_root/scripts/db/payment-state-machine-concurrency.sh"
  PAYMENT_DB_URL="$db_url" \
    bash "$repo_root/scripts/db/payment-terminal-race-concurrency.sh"
fi

printf '%s\n' "SNICK_PRIVACY_REPLAY_PASS postgres=17 migrations=$migration_count"
