#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:?Set PGPASSWORD for the authority-bound disposable local databases}"

# Frozen read-only-discovered Docker authorities. Any identity drift resets the
# exact-version review; runtime callers cannot redirect or redefine either end.
source_host='127.0.0.1'
source_port='55422'
source_user='postgres'
source_name='postgres'
expected_source_identity='170004|172.23.0.2|5432|postgres|postgres|7679384459347529772|5'

restore_host='127.0.0.1'
restore_port='55522'
restore_user='postgres'
restore_name='postgres'
expected_restore_identity='170004|172.24.0.2|5432|postgres|postgres|7679426862603108396|5'

expected_client_version='17.5 (Homebrew)'
expected_target_whole_dump_sha='bd0177dc55964a0c1741cabd72df2124938e1d587c186a5888c696de900d49ba'
expected_source_schema_hash='43166a62d1ebdd5c4d66bf93189d9cc5605c9eea36c1fde2b986d0275e410f52'
expected_source_data_hash='3ba25d329809813632e5c5a6615b348d5345d33812d34cb376c5cc16d51ab77c'
expected_source_sequence_hash='c6213a79403af8b66c691ea24328026f476aa99bd3be654528bf6e8facc7e8ec'
expected_source_non_audit_sequence_hash='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
expected_source_object_count='454'
expected_source_row_count='81'

unset PGDATABASE PGHOST PGHOSTADDR PGPORT PGUSER PGSERVICE PGSERVICEFILE PGOPTIONS
export PGCONNECT_TIMEOUT=3
export PGSSLMODE=disable

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
acceptance="$repo_root/scripts/db/engagement-graph-integrity-acceptance.sql"
inventory="$repo_root/scripts/db/engagement-graph-inventory.sql"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/snickerdoodle-graph-restore.XXXXXX")"
restore_frontend_pid=''
restore_backend_pid=''
restore_fifo_open=false
target_connections_disabled=false

cleanup() {
  if [[ "$restore_fifo_open" == true ]]; then
    exec 3>&- || true
    restore_fifo_open=false
  fi
  if [[ -n "$restore_frontend_pid" ]] && kill -0 "$restore_frontend_pid" >/dev/null 2>&1; then
    kill -TERM "$restore_frontend_pid" >/dev/null 2>&1 || true
    wait "$restore_frontend_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$target_connections_disabled" == true ]]; then
    psql -X -q -h "$restore_host" -p "$restore_port" -U "$restore_user" \
      -d template1 -v ON_ERROR_STOP=1 \
      -c "alter database $restore_name with allow_connections true;" \
      >/dev/null 2>&1 || true
    target_connections_disabled=false
  fi
  case "$tmp_dir" in
    "${TMPDIR:-/tmp}"/snickerdoodle-graph-restore.*) rm -rf -- "$tmp_dir" ;;
    *) echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2 ;;
  esac
}
trap cleanup EXIT

source_psql=(
  psql -X -q -h "$source_host" -p "$source_port"
  -U "$source_user" -d "$source_name" -v ON_ERROR_STOP=1
)
restore_psql=(
  psql -X -q -h "$restore_host" -p "$restore_port"
  -U "$restore_user" -d "$restore_name" -v ON_ERROR_STOP=1
)
restore_control_psql=(
  psql -X -q -h "$restore_host" -p "$restore_port"
  -U "$restore_user" -d template1 -v ON_ERROR_STOP=1
)
source_dump=(
  pg_dump -h "$source_host" -p "$source_port"
  -U "$source_user" -d "$source_name"
)
restore_dump=(
  pg_dump -h "$restore_host" -p "$restore_port"
  -U "$restore_user" -d "$restore_name"
)

if [[ "$(psql --version)" != "psql (PostgreSQL) $expected_client_version" ]] ||
   [[ "$(pg_dump --version)" != "pg_dump (PostgreSQL) $expected_client_version" ]] ||
   [[ "$(pg_restore --version)" != "pg_restore (PostgreSQL) $expected_client_version" ]]; then
  echo "Refusing changed PostgreSQL client-tool identity" >&2
  exit 2
fi

read_identity() {
  psql -X -q -h "$1" -p "$2" -U "$3" -d "$4" -v ON_ERROR_STOP=1 -Atc "
    select concat_ws('|',
      current_setting('server_version_num'),
      host(inet_server_addr()),
      inet_server_port(),
      current_database(),
      current_user,
      (select system_identifier from pg_control_system()),
      (select oid from pg_database where datname = current_database())
    );
  "
}

source_identity="$(read_identity "$source_host" "$source_port" "$source_user" "$source_name")"
restore_identity="$(read_identity "$restore_host" "$restore_port" "$restore_user" "$restore_name")"
if [[ "$source_identity" != "$expected_source_identity" ]]; then
  echo "Refusing database outside the reviewed disposable source authority: $source_identity" >&2
  exit 2
fi
if [[ "$restore_identity" != "$expected_restore_identity" ]]; then
  echo "Refusing database outside the reviewed disposable restore authority: $restore_identity" >&2
  exit 2
fi
if [[ "$source_identity" == "$restore_identity" ]]; then
  echo "Source and restore authorities must be distinct" >&2
  exit 2
fi

# A normalized whole-database dump binds the target to the exact fresh local
# Supabase baseline, including managed schemas outside the selected application
# restore scope. PostgreSQL 17's random psql restrict markers are the only lines
# removed before hashing.
target_whole_dump_sha="$(
  "${restore_dump[@]}" |
    sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' |
    shasum -a 256 | awk '{print $1}'
)"
if [[ "$target_whole_dump_sha" != "$expected_target_whole_dump_sha" ]]; then
  echo "Refusing restore target outside the reviewed whole-database fresh baseline" >&2
  exit 2
fi

managed_target_before="$(
  "${restore_dump[@]}" \
    --exclude-schema=public --exclude-schema=private \
    --exclude-schema=supabase_migrations --exclude-schema=auth |
    sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' |
    shasum -a 256 | awk '{print $1}'
)"
auth_out_of_scope_data_before="$(
  "${restore_dump[@]}" --data-only --schema=auth \
    --exclude-table-data=auth.users --exclude-table-data=auth.sessions |
    sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' |
    shasum -a 256 | awk '{print $1}'
)"

source_boundary="$("${source_psql[@]}" -Atc "
  select concat_ws('|',
    not exists (select 1 from public.contacts where email !~ '@ord03[.]example[.]invalid$'),
    not exists (select 1 from public.accounts where source is distinct from 'synthetic_fixture'),
    (select count(*) from public.accounts) = 2,
    (select count(*) from public.orders) = 2,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.orders'::regclass
        and conname = 'orders_campaign_account_fkey' and convalidated
        and confdeltype = 'c' and confupdtype = 'a' and confmatchtype = 's'
    ),
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.orders'::regclass
        and conname = 'orders_primary_contact_account_fkey' and convalidated
        and confdeltype = 'n' and confupdtype = 'a' and confmatchtype = 's'
    ),
    not exists (
      select 1 from pg_constraint
      where conrelid = 'public.orders'::regclass
        and conname in ('orders_campaign_id_fkey', 'orders_primary_contact_id_fkey')
    )
  );
")"
if [[ "$source_boundary" != 't|t|t|t|t|t|t' ]]; then
  echo "Refusing source outside the exact migrated synthetic boundary: $source_boundary" >&2
  exit 2
fi

source_inventory="$("${source_psql[@]}" -Atf "$inventory")"
IFS='|' read -r source_schema_hash source_derived_schema_hash source_data_hash \
  source_sequence_hash source_non_audit_sequence_hash source_object_count \
  source_derived_object_count source_row_count source_trailing \
  <<<"$source_inventory"
if [[ -n "${source_trailing:-}" ]] ||
   [[ "$source_schema_hash" != "$expected_source_schema_hash" ]] ||
   [[ "$source_derived_schema_hash" != "$expected_source_schema_hash" ]] ||
   [[ "$source_data_hash" != "$expected_source_data_hash" ]] ||
   [[ "$source_sequence_hash" != "$expected_source_sequence_hash" ]] ||
   [[ "$source_non_audit_sequence_hash" != "$expected_source_non_audit_sequence_hash" ]] ||
   [[ "$source_object_count" != "$expected_source_object_count" ]] ||
   [[ "$source_derived_object_count" != "$expected_source_object_count" ]] ||
   [[ "$source_row_count" != "$expected_source_row_count" ]]; then
  echo "Refusing source outside the exact reviewed-data-plus-successor boundary: $source_inventory" >&2
  exit 2
fi

restore_started_at="$(date +%s)"

# One archive means Auth rows and all application schemas come from one pg_dump
# transaction/snapshot. The archive is then partitioned only during restore.
"${source_dump[@]}" \
  --format=custom \
  --file="$tmp_dir/coherent-source.dump"

if [[ "$("${source_psql[@]}" -Atf "$inventory")" != "$source_inventory" ]]; then
  echo "Source inventory changed while the coherent archive was captured" >&2
  exit 1
fi

pg_restore --section=pre-data \
  --schema=public --schema=private --schema=supabase_migrations \
  --file="$tmp_dir/application-pre.sql" "$tmp_dir/coherent-source.dump"
pg_restore --data-only --no-owner --no-privileges \
  --table=auth.users --table=auth.sessions \
  --file="$tmp_dir/auth-data.sql" "$tmp_dir/coherent-source.dump"
pg_restore --section=data \
  --schema=public --schema=private --schema=supabase_migrations \
  --file="$tmp_dir/application-data.sql" "$tmp_dir/coherent-source.dump"
pg_restore --section=post-data \
  --schema=public --schema=private --schema=supabase_migrations \
  --file="$tmp_dir/application-post.sql" "$tmp_dir/coherent-source.dump"

pg_restore -l "$tmp_dir/coherent-source.dump" >"$tmp_dir/archive.list"
awk '$4 == "TRIGGER" && $5 == "auth" && $6 == "users" && $7 == "on_auth_user_created" { print }' \
  "$tmp_dir/archive.list" >"$tmp_dir/auth-trigger.list"
if [[ "$(awk 'END { print NR + 0 }' "$tmp_dir/auth-trigger.list")" != '1' ]]; then
  echo "Coherent archive does not contain exactly one reviewed application Auth trigger" >&2
  exit 1
fi
pg_restore --use-list="$tmp_dir/auth-trigger.list" \
  --file="$tmp_dir/auth-trigger.sql" "$tmp_dir/coherent-source.dump"

# Open the one restore session before closing the reviewed target database to
# new connections. A FIFO keeps that session idle until the control connection
# disables target connections and terminates every other target backend. All
# selected restore files then execute in one explicit transaction.
restore_fifo="$tmp_dir/restore-input.fifo"
mkfifo "$restore_fifo"
exec 3<>"$restore_fifo"
restore_fifo_open=true
restore_application_name="snickerdoodle_graph_restore_$$"
PGAPPNAME="$restore_application_name" "${restore_psql[@]}" \
  <"$restore_fifo" >"$tmp_dir/restore.stdout" 2>"$tmp_dir/restore.stderr" &
restore_frontend_pid=$!

for _ in {1..40}; do
  restore_backend_pid="$("${restore_control_psql[@]}" -Atc "
    select pid from pg_stat_activity
    where datname = '$restore_name'
      and application_name = '$restore_application_name';
  ")"
  [[ "$restore_backend_pid" =~ ^[0-9]+$ ]] && break
  sleep 0.1
done
if [[ ! "$restore_backend_pid" =~ ^[0-9]+$ ]]; then
  echo "Could not identify the authority-bound restore backend" >&2
  exit 1
fi

"${restore_control_psql[@]}" -c \
  "alter database $restore_name with allow_connections false;"
target_connections_disabled=true
"${restore_control_psql[@]}" -c "
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where datname = '$restore_name'
    and pid <> $restore_backend_pid;
"
target_exclusivity="$("${restore_control_psql[@]}" -Atc "
  select concat_ws('|',
    (select not datallowconn from pg_database where datname = '$restore_name'),
    (select count(*) = 1 from pg_stat_activity where datname = '$restore_name'),
    exists (
      select 1 from pg_stat_activity
      where pid = $restore_backend_pid
        and datname = '$restore_name'
        and application_name = '$restore_application_name'
    )
  );
")"
if [[ "$target_exclusivity" != 't|t|t' ]]; then
  echo "Could not establish exclusive restore-target connection state: $target_exclusivity" >&2
  exit 1
fi

printf '%s\n' '\set ON_ERROR_STOP on' >&3
printf '%s\n' 'begin;' >&3
printf '%s\n' "do \$\$ begin
  if (select datallowconn from pg_database where datname = current_database())
    or exists (select 1 from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid())
    or exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private', 'supabase_migrations')
    )
    or exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'supabase_migrations')
    )
    or to_regnamespace('private') is not null
    or to_regnamespace('supabase_migrations') is not null
    or (select count(*) from auth.users) <> 0
    or (select count(*) from auth.sessions) <> 0
    or exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth' and c.relname = 'users'
        and t.tgname = 'on_auth_user_created' and not t.tgisinternal
    )
  then
    raise exception 'Target changed between baseline and exclusive restore gate'
      using errcode = '55000';
  end if;
end; \$\$;" >&3
printf '\\i %s\n' "$tmp_dir/application-pre.sql" >&3
printf '\\i %s\n' "$tmp_dir/auth-data.sql" >&3
printf '\\i %s\n' "$tmp_dir/application-data.sql" >&3
printf '\\i %s\n' "$tmp_dir/application-post.sql" >&3
printf '\\i %s\n' "$tmp_dir/auth-trigger.sql" >&3
printf '%s\n' 'commit;' >&3
printf '%s\n' '\echo SNICKERDOODLE_RESTORE_TRANSACTION_PASS' >&3
exec 3>&-
restore_fifo_open=false

set +e
wait "$restore_frontend_pid"
restore_status=$?
set -e
restore_frontend_pid=''

"${restore_control_psql[@]}" -c \
  "alter database $restore_name with allow_connections true;"
target_connections_disabled=false
if [[ "$restore_status" -ne 0 ]] ||
   ! grep -Fxq 'SNICKERDOODLE_RESTORE_TRANSACTION_PASS' "$tmp_dir/restore.stdout"; then
  echo "Exclusive single-transaction restore failed" >&2
  sed -n '1,40p' "$tmp_dir/restore.stderr" >&2
  exit 1
fi

restored_inventory="$("${restore_psql[@]}" -Atf "$inventory")"
if [[ "$restored_inventory" != "$source_inventory" ]]; then
  echo "Restored content/owner/ACL/RLS/policy/trigger/index/sequence/type/view inventory differs" >&2
  echo "source=$source_inventory" >&2
  echo "restore=$restored_inventory" >&2
  exit 1
fi

stable_inventory() {
  local schema_hash derived_schema_hash data_hash sequence_hash non_audit_hash
  local object_count derived_object_count row_count trailing
  IFS='|' read -r schema_hash derived_schema_hash data_hash sequence_hash \
    non_audit_hash object_count derived_object_count row_count trailing <<<"$1"
  if [[ -n "${trailing:-}" ]]; then
    return 1
  fi
  printf '%s|%s|%s|%s|%s|%s|%s\n' \
    "$schema_hash" "$derived_schema_hash" "$data_hash" "$non_audit_hash" \
    "$object_count" "$derived_object_count" "$row_count"
}

source_stable_inventory="$(stable_inventory "$source_inventory")"
audit_sequence_before="$("${restore_psql[@]}" -Atc "
  select concat_ws('|', last_value, is_called)
  from private.engagement_access_audit_receipts_receipt_id_seq;
")"
IFS='|' read -r audit_value_before audit_called_before <<<"$audit_sequence_before"
if [[ ! "$audit_value_before" =~ ^[0-9]+$ ]] || [[ "$audit_called_before" != 't' ]]; then
  echo "Refusing unexpected restored audit sequence state: $audit_sequence_before" >&2
  exit 1
fi

"${restore_psql[@]}" -f "$acceptance"
first_acceptance_inventory="$("${restore_psql[@]}" -Atf "$inventory")"
first_audit_sequence="$("${restore_psql[@]}" -Atc "
  select concat_ws('|', last_value, is_called)
  from private.engagement_access_audit_receipts_receipt_id_seq;
")"
if [[ "$(stable_inventory "$first_acceptance_inventory")" != "$source_stable_inventory" ]] ||
   [[ "$first_audit_sequence" != "$((audit_value_before + 2))|t" ]]; then
  echo "First postflight changed state beyond two expected rolled-back audit sequence values" >&2
  exit 1
fi

"${restore_psql[@]}" -f "$acceptance"
second_acceptance_inventory="$("${restore_psql[@]}" -Atf "$inventory")"
second_audit_sequence="$("${restore_psql[@]}" -Atc "
  select concat_ws('|', last_value, is_called)
  from private.engagement_access_audit_receipts_receipt_id_seq;
")"
if [[ "$(stable_inventory "$second_acceptance_inventory")" != "$source_stable_inventory" ]] ||
   [[ "$second_audit_sequence" != "$((audit_value_before + 4))|t" ]]; then
  echo "Repeat postflight changed state beyond four expected rolled-back audit sequence values" >&2
  exit 1
fi

managed_target_after="$(
  "${restore_dump[@]}" \
    --exclude-schema=public --exclude-schema=private \
    --exclude-schema=supabase_migrations --exclude-schema=auth |
    sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' |
    shasum -a 256 | awk '{print $1}'
)"
auth_out_of_scope_data_after="$(
  "${restore_dump[@]}" --data-only --schema=auth \
    --exclude-table-data=auth.users --exclude-table-data=auth.sessions |
    sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' |
    shasum -a 256 | awk '{print $1}'
)"
target_connection_residue="$("${restore_psql[@]}" -Atc "
  select count(*) from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid();
")"
if [[ "$managed_target_after" != "$managed_target_before" ]] ||
   [[ "$auth_out_of_scope_data_after" != "$auth_out_of_scope_data_before" ]] ||
   [[ "$target_connection_residue" != '0' ]]; then
  echo "Out-of-scope managed/Auth target state or connection exclusivity changed" >&2
  exit 1
fi

restore_finished_at="$(date +%s)"
restore_seconds=$((restore_finished_at - restore_started_at))
echo "ENGAGEMENT_GRAPH_RECOVERY_PASS source=$source_identity restore=$restore_identity inventory=$source_inventory postflight_sequence_delta=4 restore_seconds=$restore_seconds"
