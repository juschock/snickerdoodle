#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:?Set PGPASSWORD for the authority-bound disposable local source}"

# These values are intentionally frozen to the read-only-discovered Docker
# source identity. A changed port, cluster, address, database, role, server
# version, or system identifier requires new bytes and a new review cycle.
graph_db_host='127.0.0.1'
graph_db_port='55422'
graph_db_user='postgres'
graph_db_name='postgres'
expected_connection_identity='170004|172.23.0.2|5432|postgres|postgres|7679384459347529772|5'
expected_client_version='psql (PostgreSQL) 17.5 (Homebrew)'
expected_migration_sha='dbd1074748d25d36ab4ce9641c2c5e4d783a089f6138ca3b52aadfc453dcaae8'
expected_fixture_inventory='da5ea651d47aad04661809c28c02c69ba0d18146e97a9b1753875e089738929f|43166a62d1ebdd5c4d66bf93189d9cc5605c9eea36c1fde2b986d0275e410f52|3ba25d329809813632e5c5a6615b348d5345d33812d34cb376c5cc16d51ab77c|c6213a79403af8b66c691ea24328026f476aa99bd3be654528bf6e8facc7e8ec|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|450|454|81'
dirty_order_id='23000000-0000-4000-8000-000000000099'

unset PGDATABASE PGHOST PGHOSTADDR PGPORT PGUSER PGSERVICE PGSERVICEFILE PGOPTIONS
export PGCONNECT_TIMEOUT=3
export PGSSLMODE=disable

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260829123000_engagement_graph_integrity.sql"
inventory="$repo_root/scripts/db/engagement-graph-inventory.sql"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/snickerdoodle-graph-preflight.XXXXXX")"
holder_pid=''
holder_backend_pid=''
holder_application_name="snickerdoodle_graph_preflight_holder_$$"

psql_base=(
  psql -X -q
  -h "$graph_db_host"
  -p "$graph_db_port"
  -U "$graph_db_user"
  -d "$graph_db_name"
  -v ON_ERROR_STOP=1
)

stop_holder() {
  local termination_result='t'
  local residue='0'
  if [[ "$holder_backend_pid" =~ ^[0-9]+$ ]]; then
    termination_result="$("${psql_base[@]}" -Atc "
      select coalesce(bool_and(pg_terminate_backend(pid)), true)
      from pg_stat_activity
      where pid = $holder_backend_pid
        and application_name = '$holder_application_name';
    ")" || termination_result='f'
  fi
  if [[ -n "$holder_pid" ]]; then
    if kill -0 "$holder_pid" >/dev/null 2>&1; then
      kill -TERM "$holder_pid" >/dev/null 2>&1 || true
    fi
    wait "$holder_pid" >/dev/null 2>&1 || true
    holder_pid=''
  fi
  for _ in {1..40}; do
    residue="$("${psql_base[@]}" -Atc "
      select count(*)
      from pg_stat_activity a
      left join pg_locks l
        on l.pid = a.pid
       and l.relation = 'public.orders'::regclass
       and l.mode = 'RowExclusiveLock'
       and l.granted
      where a.application_name = '$holder_application_name'
         or (a.pid = nullif('$holder_backend_pid', '')::integer and l.pid is not null);
    ")" || residue='1'
    [[ "$residue" == '0' ]] && break
    sleep 0.1
  done
  holder_backend_pid=''
  [[ "$termination_result" == 't' && "$residue" == '0' ]]
}

cleanup() {
  stop_holder || echo "Lock-holder cleanup could not be fully verified" >&2
  case "$tmp_dir" in
    "${TMPDIR:-/tmp}"/snickerdoodle-graph-preflight.*) rm -rf -- "$tmp_dir" ;;
    *) echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2 ;;
  esac
}
trap cleanup EXIT

if [[ "$(psql --version)" != "$expected_client_version" ]]; then
  echo "Refusing changed psql client identity" >&2
  exit 2
fi

actual_migration_sha="$(shasum -a 256 "$migration" | awk '{print $1}')"
if [[ "$actual_migration_sha" != "$expected_migration_sha" ]]; then
  echo "Migration identity changed: expected=$expected_migration_sha actual=$actual_migration_sha" >&2
  exit 2
fi

connection_identity="$("${psql_base[@]}" -Atc "
  select concat_ws('|',
    current_setting('server_version_num'),
    host(inet_server_addr()),
    inet_server_port(),
    current_database(),
    current_user,
    (select system_identifier from pg_control_system()),
    (select oid from pg_database where datname = current_database())
  );
")"
if [[ "$connection_identity" != "$expected_connection_identity" ]]; then
  echo "Refusing database outside the reviewed disposable source authority: $connection_identity" >&2
  exit 2
fi

fixture_inventory="$("${psql_base[@]}" -Atf "$inventory")"
if [[ "$fixture_inventory" != "$expected_fixture_inventory" ]]; then
  echo "Refusing database outside the exact disposable pre-migration inventory: $fixture_inventory" >&2
  exit 2
fi

predecessor_boundary="$("${psql_base[@]}" -Atc "
  select concat_ws('|',
    not exists (select 1 from public.orders where id = '$dirty_order_id'),
    not exists (
      select 1 from pg_constraint
      where conrelid = 'public.orders'::regclass
        and conname in ('orders_campaign_account_fkey', 'orders_primary_contact_account_fkey')
    ),
    (
      select count(*) = 1
      from pg_constraint con
      where con.conrelid = 'public.orders'::regclass
        and con.conname = 'orders_campaign_id_fkey'
        and con.contype = 'f'
        and con.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'campaign_id' and not attisdropped)
        ]::smallint[]
        and con.confrelid = 'public.campaigns'::regclass
        and con.confkey = array[
          (select attnum from pg_attribute where attrelid = 'public.campaigns'::regclass and attname = 'id' and not attisdropped)
        ]::smallint[]
        and con.convalidated and not con.condeferrable and not con.condeferred
        and con.confdeltype = 'c' and con.confupdtype = 'a' and con.confmatchtype = 's'
    ),
    (
      select count(*) = 1
      from pg_constraint con
      where con.conrelid = 'public.orders'::regclass
        and con.conname = 'orders_primary_contact_id_fkey'
        and con.contype = 'f'
        and con.conkey = array[
          (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'primary_contact_id' and not attisdropped)
        ]::smallint[]
        and con.confrelid = 'public.contacts'::regclass
        and con.confkey = array[
          (select attnum from pg_attribute where attrelid = 'public.contacts'::regclass and attname = 'id' and not attisdropped)
        ]::smallint[]
        and con.convalidated and not con.condeferrable and not con.condeferred
        and con.confdeltype = 'n' and con.confupdtype = 'a' and con.confmatchtype = 's'
    )
  );
")"
if [[ "$predecessor_boundary" != 't|t|t|t' ]]; then
  echo "Refusing changed predecessor graph boundary: $predecessor_boundary" >&2
  exit 2
fi

# The dirty row and the migration run in one client transaction. The expected
# 23514 makes psql exit; connection close rolls back both the inserted row and
# every attempted DDL statement. No cleanup DELETE or ambiguous ownership flag
# is needed or permitted.
set +e
"${psql_base[@]}" -v VERBOSITY=verbose \
  -c "
    begin;
    insert into public.orders (
      id, campaign_id, account_id, primary_contact_id,
      package_type, price_cents, status
    ) values (
      '$dirty_order_id',
      '22000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      'payment_disabled_synthetic', 0, 'synthetic_preflight'
    );
  " \
  -f "$migration" >"$tmp_dir/dirty.stdout" 2>"$tmp_dir/dirty.stderr"
dirty_status=$?
set -e

if [[ "$dirty_status" -eq 0 ]] ||
   ! grep -Eq '^psql:.*ERROR:  23514: Cannot enforce engagement graph: cross-account campaign reference exists$' "$tmp_dir/dirty.stderr"; then
  echo "Dirty-data preflight did not fail with the exact reviewed 23514 condition" >&2
  sed -n '1,20p' "$tmp_dir/dirty.stderr" >&2
  exit 1
fi

if [[ "$("${psql_base[@]}" -Atf "$inventory")" != "$expected_fixture_inventory" ]] ||
   [[ "$("${psql_base[@]}" -Atc "select count(*) from public.orders where id = '$dirty_order_id';")" != '0' ]]; then
  echo "Dirty-data client transaction did not roll back to the exact fixture" >&2
  exit 1
fi

# Keep the conflicting transaction open indefinitely with psql \watch. After
# the exact five-second migration timeout, terminate the captured backend,
# reap the direct frontend child, and prove both the session and lock vanished.
PGAPPNAME="$holder_application_name" "${psql_base[@]}" \
  >"$tmp_dir/holder.stdout" 2>"$tmp_dir/holder.stderr" <<'SQL' &
begin;
lock table public.orders in row exclusive mode;
select 1;
\watch 60
SQL
holder_pid=$!

holder_backend_pid=''
for _ in {1..40}; do
  holder_backend_pid="$("${psql_base[@]}" -Atc "
    select a.pid
    from pg_locks l
    join pg_stat_activity a on a.pid = l.pid
    where l.relation = 'public.orders'::regclass
      and l.mode = 'RowExclusiveLock'
      and l.granted
      and a.application_name = '$holder_application_name';
  ")"
  [[ "$holder_backend_pid" =~ ^[0-9]+$ ]] && break
  sleep 0.1
done
if [[ ! "$holder_backend_pid" =~ ^[0-9]+$ ]]; then
  stop_holder || true
  echo "Could not establish the synthetic lock-contention precondition" >&2
  exit 1
fi

set +e
"${psql_base[@]}" -v VERBOSITY=verbose -f "$migration" \
  >"$tmp_dir/lock.stdout" 2>"$tmp_dir/lock.stderr"
lock_status=$?
set -e

if [[ "$lock_status" -eq 0 ]] ||
   ! grep -Eq '^psql:.*ERROR:  55P03: canceling statement due to lock timeout$' "$tmp_dir/lock.stderr"; then
  stop_holder || true
  echo "Lock-contention preflight did not fail with the exact reviewed 55P03 condition" >&2
  sed -n '1,20p' "$tmp_dir/lock.stderr" >&2
  exit 1
fi
if ! stop_holder; then
  echo "Could not terminate and verify removal of the exact lock-holder backend" >&2
  exit 1
fi

if [[ "$("${psql_base[@]}" -Atf "$inventory")" != "$expected_fixture_inventory" ]]; then
  echo "Lock-timeout client transaction did not restore the exact fixture inventory" >&2
  exit 1
fi

echo "ENGAGEMENT_GRAPH_PREFLIGHT_PASS authority=$connection_identity inventory=$expected_fixture_inventory"
