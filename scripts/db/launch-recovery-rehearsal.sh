#!/usr/bin/env bash
set -euo pipefail

# SN Sprint 06 destructive recovery rehearsal. All clusters, dumps, fixtures,
# and blob artifacts are synthetic, loopback-only, permission-restricted, and
# deleted at exit.

umask 077
export LC_ALL=C
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pg_bin="${SNICK_PG17_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
tmp_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/snickerdoodle-sn06.XXXXXX")"
source_port="$((57000 + ($$ % 350)))"
target_port="$((source_port + 400))"
source_data="$tmp_dir/source-data"
target_data="$tmp_dir/target-data"
source_log="$tmp_dir/source-postgres.log"
target_log="$tmp_dir/target-postgres.log"
source_url="postgresql://postgres@127.0.0.1:$source_port/postgres"
prior_url="postgresql://postgres@127.0.0.1:$source_port/prior"
target_url="postgresql://postgres@127.0.0.1:$target_port/postgres"
current_dump="$tmp_dir/current-state.dump"
prior_dump="$tmp_dir/prior-state.dump"
prior_forward_dump="$tmp_dir/prior-forward-state.dump"
source_started=false
target_started=false

cleanup() {
  if [[ "$target_started" == true ]]; then
    "$pg_bin/pg_ctl" -D "$target_data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [[ "$source_started" == true ]]; then
    "$pg_bin/pg_ctl" -D "$source_data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    "${TMPDIR:-/private/tmp}"/snickerdoodle-sn06.*) rm -rf -- "$tmp_dir" ;;
    *) echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2; exit 70 ;;
  esac
}
trap cleanup EXIT

for tool in initdb pg_ctl postgres psql createdb pg_dump pg_restore; do
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
    echo "Accepted migration changed: $relative ($actual)" >&2
    exit 65
  fi
done <"$repo_root/docs/customer-readiness/sn-sprint-08b2-migration-shas.txt"

setup_cluster_roles() {
  local port="$1"
  "$pg_bin/psql" -X -q "postgresql://postgres@127.0.0.1:$port/postgres" \
    -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin superuser;
SQL
}

setup_database_prerequisites() {
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
  '65000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'recovery-owner@sn06.example.invalid', '{}'::jsonb,
  '{"full_name":"Synthetic Recovery Owner"}'::jsonb,
  now(), now(), false, false
);
update public.profiles set role = 'owner', active = true, updated_at = now()
where id = '65000000-0000-4000-8000-000000000001';
SQL
}

replay_migrations() {
  local url="$1"
  local limit="$2"
  local count=0 migration filename version name
  for migration in "$repo_root"/supabase/migrations/*.sql; do
    count=$((count + 1))
    if (( count > limit )); then break; fi
    filename="$(basename "$migration")"
    if [[ "$filename" == '20260716041133_payment_operations_security.sql' ]]; then
      sed '/^create extension if not exists pg_cron with schema pg_catalog;$/d' "$migration" |
        "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1
    else
      "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1 -f "$migration"
    fi
    version="${filename%%_*}"
    name="${filename#*_}"
    name="${name%.sql}"
    "$pg_bin/psql" -X -q "$url" -v ON_ERROR_STOP=1 \
      -v version="$version" -v name="$name" <<'SQL'
insert into supabase_migrations.schema_migrations(version, statements, name)
values (:'version', null, :'name');
SQL
    if [[ "$filename" == '20260714202709_staff_authorization.sql' ]]; then
      seed_owner "$url"
    fi
  done
  if [[ "$count" -lt "$limit" ]]; then
    echo "Expected $limit migrations, found only $count" >&2
    exit 65
  fi
}

reset_target_database() {
  "$pg_bin/psql" -X -q "postgresql://postgres@127.0.0.1:$target_port/template1" \
    -v ON_ERROR_STOP=1 <<'SQL'
drop database if exists postgres with (force);
create database postgres with template template0 owner postgres;
SQL
}

inventory() {
  local url="$1"
  "$pg_bin/psql" -X -qAt "$url" -v ON_ERROR_STOP=1 \
    -f "$repo_root/scripts/db/engagement-graph-inventory.sql"
}

schema_hash() {
  inventory "$1" | awk -F'|' '{print $1}'
}

now_ms() {
  perl -MTime::HiRes=time -e 'printf "%.0f\n", time() * 1000'
}

"$pg_bin/initdb" -D "$source_data" -U postgres --auth=trust --no-locale >/dev/null
"$pg_bin/initdb" -D "$target_data" -U postgres --auth=trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$source_data" -l "$source_log" \
  -o "-h 127.0.0.1 -p $source_port" -w start >/dev/null
source_started=true
"$pg_bin/pg_ctl" -D "$target_data" -l "$target_log" \
  -o "-h 127.0.0.1 -p $target_port" -w start >/dev/null
target_started=true
setup_cluster_roles "$source_port"
setup_cluster_roles "$target_port"

setup_database_prerequisites "$source_url"
replay_migrations "$source_url" 22
"$pg_bin/psql" -X -q "$source_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/privacy-lifecycle-acceptance.sql"
source_inventory="$(inventory "$source_url")"

backup_start="$(now_ms)"
"$pg_bin/pg_dump" --format=custom --file="$current_dump" "$source_url"
backup_ms=$(($(now_ms) - backup_start))
chmod 600 "$current_dump"
backup_hash="$(shasum -a 256 "$current_dump" | awk '{print $1}')"
[[ "$(stat -f '%Lp' "$current_dump")" == '600' ]]

# Prove replacement rather than in-place repair: destroy a sentinel database,
# restore the exact snapshot into the newly created target, then compare the
# full selected schema/data/sequence inventory before running any mutation.
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -c 'create table public.sn06_destroyed_sentinel(id integer primary key);'
reset_target_database
restore_start="$(now_ms)"
"$pg_bin/pg_restore" --exit-on-error --single-transaction \
  --dbname="$target_url" "$current_dump"
restore_ms=$(($(now_ms) - restore_start))
if "$pg_bin/psql" -X -qAt "$target_url" -c \
  "select to_regclass('public.sn06_destroyed_sentinel') is not null" | grep -qx t; then
  echo 'Destructive target replacement did not remove sentinel' >&2
  exit 1
fi
restored_inventory="$(inventory "$target_url")"
if [[ "$restored_inventory" != "$source_inventory" ]]; then
  "$pg_bin/pg_dump" --schema-only --format=plain "$source_url" >"$tmp_dir/source-schema.sql"
  "$pg_bin/pg_dump" --schema-only --format=plain "$target_url" >"$tmp_dir/restore-schema.sql"
  diff -u "$tmp_dir/source-schema.sql" "$tmp_dir/restore-schema.sql" \
    >"$tmp_dir/schema.diff" || true
  IFS='|' read -r source_schema source_successor source_data_hash \
    source_sequence source_non_audit source_objects source_successor_objects \
    source_rows <<<"$source_inventory"
  IFS='|' read -r restore_schema restore_successor restore_data_hash \
    restore_sequence restore_non_audit restore_objects restore_successor_objects \
    restore_rows <<<"$restored_inventory"
  changed_lines="$(grep -E '^[+-][^-+]' "$tmp_dir/schema.diff" | wc -l | tr -d ' ')"
  hunk_count="$(grep -c '^@@' "$tmp_dir/schema.diff" || true)"
  if [[ "$source_data_hash|$source_sequence|$source_non_audit|$source_objects|$source_successor_objects|$source_rows" != \
      "$restore_data_hash|$restore_sequence|$restore_non_audit|$restore_objects|$restore_successor_objects|$restore_rows" \
      || "$hunk_count" != '1' || "$changed_lines" != '2' \
      || "$(grep -c 'stripe_webhook_receipts_last_error_code_check' "$tmp_dir/schema.diff")" != '2' ]]; then
    echo 'Current snapshot differs materially after restore' >&2
    echo "source=$source_inventory" >&2
    echo "restore=$restored_inventory" >&2
    head -200 "$tmp_dir/schema.diff" >&2
    exit 1
  fi
  echo "SN06_LOGICAL_NORMALIZATION source_schema=$source_schema restored_schema=$restore_schema constraint=stripe_webhook_receipts_last_error_code_check"
fi
restored_schema_hash="$(printf '%s\n' "$restored_inventory" | awk -F'|' '{print $1}')"

verify_start="$(now_ms)"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/sn06-recovery-postflight.sql"

# Corrupt only derivable state, prove fail-closed detection, then rebuild from
# authoritative rows. Authoritative order/payment rows are never synthesized.
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 <<'SQL'
delete from private.intake_manager_queue
where intake_kind = 'checkout'
  and intake_id = '65700000-0000-4000-8000-000000000001';
insert into private.intake_manager_queue (
  queue_receipt_id, intake_kind, intake_id, queue_state, payment_state
) values (
  '67900000-0000-4000-8000-000000000001', 'non_payment',
  '67900000-0000-4000-8000-000000000002', 'received', 'not_applicable'
);
drop index private.intake_manager_queue_state_created_idx;
SQL
if "$pg_bin/psql" -X -qAt "$target_url" -c \
  "select exists (select 1 from private.intake_manager_queue where intake_kind='checkout' and intake_id='65700000-0000-4000-8000-000000000001') and not exists (select 1 from private.intake_manager_queue where queue_receipt_id='67900000-0000-4000-8000-000000000001')" | grep -qx t; then
  echo 'Queue corruption was not detected' >&2
  exit 1
fi
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/rebuild-intake-manager-queue.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select count(*) from private.intake_manager_queue) <>
      (select count(*) from public.pending_intakes) +
      (select count(*) from public.checkout_intents)
    or exists (select 1 from private.intake_manager_queue
      where queue_receipt_id = '67900000-0000-4000-8000-000000000001')
    or to_regclass('private.intake_manager_queue_state_created_idx') is null then
    raise exception 'Derived queue/index rebuild failed';
  end if;
end;
$$;
SQL

"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/ord03-synthetic-fixture.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/ord03-acceptance.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/intake-manager-queue-acceptance.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/privileged-rpc-access-acceptance.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/payment-state-machine-acceptance.sql"
PSQL_BIN="$pg_bin/psql" PAYMENT_DB_URL="$target_url" \
  bash "$repo_root/scripts/db/payment-state-machine-concurrency.sh"
PSQL_BIN="$pg_bin/psql" PAYMENT_DB_URL="$target_url" \
  bash "$repo_root/scripts/db/payment-terminal-race-concurrency.sh"
verify_ms=$(($(now_ms) - verify_start))
current_final_fingerprint="$(inventory "$target_url")"

# Create a known prior accepted (20-migration) database snapshot, then restore
# it into the same destructive target, migrate forward, and replay the newer
# durable privacy tombstone before any reopen decision.
"$pg_bin/createdb" -h 127.0.0.1 -p "$source_port" -U postgres prior
setup_database_prerequisites "$prior_url"
replay_migrations "$prior_url" 20
"$pg_bin/psql" -X -q "$prior_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/sn06-prior-snapshot-fixture.sql"
"$pg_bin/pg_dump" --format=custom --file="$prior_dump" "$prior_url"
chmod 600 "$prior_dump"
reset_target_database
prior_restore_start="$(now_ms)"
"$pg_bin/pg_restore" --exit-on-error --single-transaction \
  --dbname="$target_url" "$prior_dump"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/migrations/20260902064553_implement_privacy_lifecycle_and_retention.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/supabase/migrations/20260903030728_release_rejected_checkout_session_setup.sql"
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into supabase_migrations.schema_migrations(version, statements, name)
values
  ('20260902064553', null, 'implement_privacy_lifecycle_and_retention'),
  ('20260903030728', null, 'release_rejected_checkout_session_setup');
SQL
"$pg_bin/pg_dump" --format=custom --file="$prior_forward_dump" "$target_url"
chmod 600 "$prior_forward_dump"
reset_target_database
"$pg_bin/pg_restore" --exit-on-error --single-transaction \
  --dbname="$target_url" "$prior_forward_dump"
if [[ "$(schema_hash "$target_url")" != "$restored_schema_hash" ]]; then
  echo 'Prior snapshot plus forward migration does not match current schema' >&2
  exit 1
fi
"$pg_bin/psql" -X -q "$target_url" -v ON_ERROR_STOP=1 \
  -f "$repo_root/scripts/db/sn06-replay-privacy-tombstone.sql"
prior_forward_ms=$(($(now_ms) - prior_restore_start))

if [[ "$("$pg_bin/psql" -X -qAt "$target_url" -c \
  'select count(*) from supabase_migrations.schema_migrations')" != '22' ]]; then
  echo 'Restored migration ledger is not at 22' >&2
  exit 1
fi
final_db_fingerprint="$(inventory "$target_url")"

bash "$repo_root/scripts/recovery/synthetic-blob-reconciliation.sh"

if git -C "$repo_root" ls-files --error-unmatch "$current_dump" >/dev/null 2>&1; then
  echo 'Temporary database backup unexpectedly tracked by Git' >&2
  exit 1
fi

echo "SNICK_SN06_RECOVERY_PASS postgres=17 migrations=22"
echo "SNICK_SN07_WHOLE_PRODUCT_RC_PASS journeys=success_failure_refund_dispute_privacy_auth_recovery concurrency=2_10_100"
echo "SN06_BACKUP_SHA256=$backup_hash"
echo "SN06_BACKUP_MODE=600"
echo "SN06_BACKUP_MS=$backup_ms"
echo "SN06_RESTORE_MS=$restore_ms"
echo "SN06_VERIFY_MS=$verify_ms"
echo "SN06_PRIOR_FORWARD_MS=$prior_forward_ms"
echo "SN06_LOCAL_TESTED_RPO=0_committed_writes_between_snapshot_and_restore"
echo "SN06_CURRENT_SOURCE_INVENTORY=$source_inventory"
echo "SN06_CURRENT_RESTORED_FINAL_INVENTORY=$current_final_fingerprint"
echo "SN06_FINAL_DB_FINGERPRINT=$final_db_fingerprint"
echo 'SN06_TEMP_ARTIFACT_CLEANUP=armed'
