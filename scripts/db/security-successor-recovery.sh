#!/usr/bin/env bash
set -euo pipefail

# Current-source -> distinct-target disposable recovery rehearsal for the
# Snickerdoodle security successor. This script is intentionally fail closed:
# it accepts only loopback PostgreSQL URLs, requires an explicit destructive
# target acknowledgement, refuses a shared PostgreSQL cluster, and never runs
# any mutation through the source URL.

umask 077
export LC_ALL=C
export PGCONNECT_TIMEOUT=3
export PGSSLMODE=disable
unset PGDATABASE PGHOST PGHOSTADDR PGPORT PGUSER PGSERVICE PGSERVICEFILE PGOPTIONS

: "${SNICK_RECOVERY_SOURCE_URL:?Set SNICK_RECOVERY_SOURCE_URL to the disposable loopback source URL}"
: "${SNICK_RECOVERY_TARGET_URL:?Set SNICK_RECOVERY_TARGET_URL to the distinct empty disposable loopback target URL}"
: "${SNICK_RECOVERY_TARGET_ADMIN_URL:?Set SNICK_RECOVERY_TARGET_ADMIN_URL to the same target as supabase_admin}"
: "${SNICK_RECOVERY_ALLOW_TARGET_RESET:?Set the exact disposable-target acknowledgement}"

if [[ "$SNICK_RECOVERY_ALLOW_TARGET_RESET" != "RESET_DISTINCT_DISPOSABLE_TARGET" ]]; then
  echo "Refusing target mutation without exact disposable-target acknowledgement" >&2
  exit 64
fi

require_loopback_postgres_url() {
  local label="$1"
  local value="$2"
  local url_pattern='^postgres(ql)?://([^/@?#]+)@(127[.]0[.]0[.]1|localhost):([0-9]{1,5})/postgres$'
  if [[ ! "$value" =~ $url_pattern ]]; then
    echo "Refusing $label outside exact loopback PostgreSQL URL grammar" >&2
    exit 64
  fi
  local port="${BASH_REMATCH[4]}"
  if (( 10#$port < 1 || 10#$port > 65535 )); then
    echo "Refusing $label with invalid TCP port" >&2
    exit 64
  fi
  printf '%s\n' "$((10#$port))"
}

if (require_loopback_postgres_url 'extra-authority self-test' \
      'postgresql://user@127.0.0.1:56022@external.invalid:5432/postgres' \
      >/dev/null 2>&1) ||
   (require_loopback_postgres_url 'malformed-port self-test' \
      'postgresql://user:pass@127.0.0.1:notaport/postgres' \
      >/dev/null 2>&1); then
  echo "Loopback URL parser rejected-boundary self-test failed" >&2
  exit 65
fi

source_expected_port="$(require_loopback_postgres_url "source" "$SNICK_RECOVERY_SOURCE_URL")"
target_expected_port="$(require_loopback_postgres_url "target" "$SNICK_RECOVERY_TARGET_URL")"
admin_expected_port="$(require_loopback_postgres_url "target admin" "$SNICK_RECOVERY_TARGET_ADMIN_URL")"

if [[ "$SNICK_RECOVERY_SOURCE_URL" == "$SNICK_RECOVERY_TARGET_URL" ]]; then
  echo "Source and target URLs must differ" >&2
  exit 64
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/snickerdoodle-security-recovery.XXXXXX")"
# Cluster-control operations require the disposable target's local superuser;
# the application-facing postgres role is intentionally not superuser in the
# Supabase image. Both URLs are identity-bound below to the same target DB OID
# and system identifier before this control URL is used.
target_control_url="${SNICK_RECOVERY_TARGET_ADMIN_URL%/postgres}/template1"
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
    psql -X -q "$target_control_url" -v ON_ERROR_STOP=1 \
      -c 'alter database postgres with allow_connections true;' \
      >/dev/null 2>&1 || true
    target_connections_disabled=false
  fi
  case "$tmp_dir" in
    "${TMPDIR:-/private/tmp}"/snickerdoodle-security-recovery.*)
      rm -rf -- "$tmp_dir"
      ;;
    *)
      echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2
      ;;
  esac
}
trap cleanup EXIT

source_psql() {
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000' \
    psql -X -q "$SNICK_RECOVERY_SOURCE_URL" -v ON_ERROR_STOP=1 "$@"
}

target_psql() {
  psql -X -q "$SNICK_RECOVERY_TARGET_URL" -v ON_ERROR_STOP=1 "$@"
}

target_admin_psql() {
  psql -X -q "$SNICK_RECOVERY_TARGET_ADMIN_URL" -v ON_ERROR_STOP=1 "$@"
}

source_dump() {
  PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=0' \
    pg_dump "$SNICK_RECOVERY_SOURCE_URL" "$@"
}

target_dump() {
  pg_dump "$SNICK_RECOVERY_TARGET_URL" "$@"
}

# The deterministic inventory creates three pg_temp-only helper functions.
# PostgreSQL rejects even temporary DDL when default_transaction_read_only is
# enabled, so this narrowly scoped helper omits that setting. The script never
# sends any persistent source DDL/DML, and exact inventory/Cron guards run
# before and after the target-only rehearsal.
source_inventory_read() {
  PGOPTIONS='-c statement_timeout=30000' \
    psql -X -q "$SNICK_RECOVERY_SOURCE_URL" -v ON_ERROR_STOP=1 \
      -Atf "$repo_root/scripts/db/engagement-graph-inventory.sql"
}

normalize_dump() {
  sed -e '/^\\restrict /d' -e '/^\\unrestrict /d'
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

sha256_text() {
  shasum -a 256 | awk '{print $1}'
}

verify_file_sha() {
  local relative_path="$1"
  local expected_sha="$2"
  local actual_sha
  actual_sha="$(sha256_file "$repo_root/$relative_path")"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "Refusing changed recovery input: $relative_path ($actual_sha)" >&2
    exit 65
  fi
}

# Every executable input is pinned. A change requires a new bounded review.
verify_inputs() {
  verify_file_sha \
    'supabase/migrations/20260830202804_harden_checkout_reconciliation_and_owner_aal2.sql' \
    'fddf2a837db83ff0ef91ff6305352ba7713dbe47d4c4918755737829b0eefbac'
  verify_file_sha 'scripts/db/engagement-graph-inventory.sql' \
    '131c474108d0a257a8b541dda4b40cb411c5054e4b549987c3a7d0b058c8dafe'
  verify_file_sha 'scripts/db/ord03-acceptance.sql' \
    '476acaec8299ba4f299eeae3a3c822f7f525e6ead4e791526c121acb1aa27e8d'
  verify_file_sha 'scripts/db/engagement-graph-integrity-acceptance.sql' \
    '0c72bef44cff6de34f42fd4e717a812afb137d55b2015754bd13052472d2660a'
  verify_file_sha 'scripts/db/intake-manager-queue-acceptance.sql' \
    'a4cfa903c2e535b5eb5cd77ef8c9037db73e1094155536dc09eded5405dd902d'
  verify_file_sha 'scripts/db/payment-launch-acceptance.sql' \
    '843cebd2d2db29a8e7bdf93ed6d3853c8c0ccaed001e437befe46dcd74a55877'
  verify_file_sha 'scripts/db/ord03-concurrency.sh' \
    '0512f2eded077164725d3065254a66cc3f3a7b83b3a02a4f4f101d79f4c1b53d'
  verify_file_sha 'scripts/db/payment-launch-concurrency.sh' \
    '170d74cf681c31432a63333c41709ef5eb27751e220b33eab6464e0108023898'
  verify_file_sha 'scripts/db/payment-capacity-concurrency.sh' \
    '5d8eccda218716303ad5becb166d5ce48f4364d0f4dcec439360ba85b5eb8412'
  verify_file_sha 'scripts/db/payment-terminal-race-concurrency.sh' \
    '5b868013505c7f8624ea29df01248a24c40328e316732dcc3a340061188e50be'
  verify_file_sha \
    'supabase/migrations/20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql' \
    '4c8a1dab63eff51339b0d32a06302bfb1a80064a827485d21a22277abbb951ed'
  verify_file_sha 'scripts/db/multi-customer-payment-concurrency.sh' \
    '127291756b697d56417d89374e6402f91b1afdfa4c0ef6acee2bf02f67ed61c0'
}

verify_inputs

expected_client_version='17.5 (Homebrew)'
if [[ "$(psql --version)" != "psql (PostgreSQL) $expected_client_version" ]] ||
   [[ "$(pg_dump --version)" != "pg_dump (PostgreSQL) $expected_client_version" ]] ||
   [[ "$(pg_restore --version)" != "pg_restore (PostgreSQL) $expected_client_version" ]]; then
  echo "Refusing changed PostgreSQL client-tool identity" >&2
  exit 65
fi

read_identity() {
  psql -X -q "$1" -v ON_ERROR_STOP=1 -Atc "
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

source_identity="$(read_identity "$SNICK_RECOVERY_SOURCE_URL")"
target_identity="$(read_identity "$SNICK_RECOVERY_TARGET_URL")"
target_admin_identity="$(read_identity "$SNICK_RECOVERY_TARGET_ADMIN_URL")"

IFS='|' read -r source_server source_address source_port source_db source_user source_system source_db_oid source_trailing \
  <<<"$source_identity"
IFS='|' read -r target_server target_address target_port target_db target_user target_system target_db_oid target_trailing \
  <<<"$target_identity"
IFS='|' read -r admin_server admin_address admin_port admin_db admin_user admin_system admin_db_oid admin_trailing \
  <<<"$target_admin_identity"

private_container_address_pattern='^172[.](1[6-9]|2[0-9]|3[01])[.][0-9]{1,3}[.][0-9]{1,3}$'
if [[ -n "${source_trailing:-}" ]] || [[ -n "${target_trailing:-}" ]] ||
   [[ -n "${admin_trailing:-}" ]] || [[ "$source_server" != 1700* ]] ||
   [[ "$target_server" != 1700* ]] || [[ "$admin_server" != 1700* ]] ||
   [[ ! "$source_address" =~ $private_container_address_pattern ]] ||
   [[ ! "$target_address" =~ $private_container_address_pattern ]] ||
   [[ ! "$admin_address" =~ $private_container_address_pattern ]] ||
   [[ "$source_port" != '5432' ]] || [[ "$target_port" != '5432' ]] ||
   [[ "$admin_port" != '5432' ]] ||
   [[ "$source_expected_port" == "$target_expected_port" ]] ||
   [[ "$target_expected_port" != "$admin_expected_port" ]] ||
   [[ "$source_db|$source_user" != 'postgres|postgres' ]] ||
   [[ "$target_db|$target_user" != 'postgres|postgres' ]] ||
   [[ "$admin_db|$admin_user" != 'postgres|supabase_admin' ]]; then
  echo "Refusing unexpected source, target, or target-admin database identity" >&2
  exit 65
fi
if [[ "$source_system" == "$target_system" ]]; then
  echo "Source and target must be different PostgreSQL clusters, not merely different sessions or databases" >&2
  exit 65
fi
if [[ "$admin_system|$admin_db_oid" != "$target_system|$target_db_oid" ]]; then
  echo "Target admin URL does not resolve to the exact target authority" >&2
  exit 65
fi

source_boundary="$(source_psql -Atc "
  select concat_ws('|',
    (select count(*) = 6 from auth.users),
    (select count(*) = 6 from auth.sessions),
    not exists (
      select 1 from auth.users
      where email is null or email !~ '@ord03[.]example[.]invalid$'
    ),
    (select count(*) = 2 and bool_and(source = 'synthetic_fixture')
       from public.accounts),
    (select count(*) = 2 and bool_and(price_cents = 0)
       from public.orders),
    not exists (
      select 1 from public.contacts
      where email is null or email !~ '@ord03[.]example[.]invalid$'
    ),
    not exists (
      select 1 from public.briefs
      where delivery_email is null
         or delivery_email !~ '@ord03[.]example[.]invalid$'
    ),
    not exists (
      select 1 from public.pending_intakes
      where delivery_email is null or delivery_email !~ '[.]invalid$'
    ),
    not exists (
      select 1 from public.checkout_intents
      where delivery_email is null or delivery_email !~ '[.]invalid$'
    ),
    not exists (
      select 1 from public.orders
      where payment_status in ('paid', 'disputed')
    ),
    to_regnamespace('supabase_migrations') is null,
    to_regprocedure(
      'public.read_intake_manager_queue(integer,timestamp with time zone,uuid)'
    ) is not null,
    to_regprocedure(
      'public.record_stripe_operational_event(text,text,text,uuid,text,text,text,text)'
    ) is not null
  );
")"
if [[ "$source_boundary" != 't|t|t|t|t|t|t|t|t|t|t|t|t' ]]; then
  echo "Refusing source outside the exact local synthetic successor boundary: $source_boundary" >&2
  exit 65
fi

expected_cron_semantic='racoben-payment-operational-cleanup|17 4 * * *|select * from private.cleanup_payment_operational_data();|localhost|5432|postgres|postgres|f'
target_cron_semantic() {
  target_psql -Atc "
    select concat_ws('|', jobname, schedule, command, nodename, nodeport,
      database, username, active)
    from cron.job
    order by jobname, jobid;
  "
}
source_cron_semantic="$(source_psql -Atc "
  select concat_ws('|', jobname, schedule, command, nodename, nodeport,
    database, username, active)
  from cron.job
  order by jobname, jobid;
")"
if [[ "$source_cron_semantic" != "$expected_cron_semantic" ]]; then
  echo "Refusing changed source Cron boundary" >&2
  exit 65
fi

target_boundary="$(target_psql -Atc "
  select concat_ws('|',
    not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private', 'supabase_migrations')
        and c.relkind in ('r','p','v','m','S','f','c')
    ),
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'supabase_migrations')
    ),
    (select count(*) = 0 from auth.users),
    (select count(*) = 0 from auth.sessions),
    to_regnamespace('supabase_migrations') is null,
    not exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'auth' and c.relname = 'users'
        and t.tgname = 'on_auth_user_created' and not t.tgisinternal
    ),
    exists (select 1 from pg_extension where extname = 'pg_cron'),
    (select count(*) = 0 from cron.job),
    (select count(*) = 6
       from pg_roles
       where rolname in ('postgres','anon','authenticated','service_role','supabase_admin','pg_database_owner'))
  );
")"
if [[ "$target_boundary" != 't|t|t|t|t|t|t|t|t' ]]; then
  echo "Refusing non-empty or incompatible disposable target: $target_boundary" >&2
  exit 65
fi

auth_signature_sql="
  select format('%I.%I|%s|%s|%s', n.nspname, c.relname,
      a.attnum, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth' and c.relname in ('users','sessions')
    and a.attnum > 0 and not a.attisdropped
  order by c.relname, a.attnum;
"
source_auth_signature="$(source_psql -Atc "$auth_signature_sql" | sha256_text)"
target_auth_signature="$(target_psql -Atc "$auth_signature_sql" | sha256_text)"
if [[ "$source_auth_signature" != "$target_auth_signature" ]]; then
  echo "Source and target Auth table shapes differ" >&2
  exit 65
fi

inventory="$repo_root/scripts/db/engagement-graph-inventory.sql"
source_inventory="$(source_inventory_read)"
source_inventory_sha="$(printf '%s' "$source_inventory" | sha256_text)"

target_whole_baseline_sha="$(target_dump | normalize_dump | sha256_text)"
managed_target_before="$(
  target_dump --exclude-schema=public --exclude-schema=private \
    --exclude-schema=auth --exclude-schema=cron |
    normalize_dump | sha256_text
)"
auth_out_of_scope_before="$(
  target_dump --data-only --schema=auth \
    --exclude-table-data=auth.users --exclude-table-data=auth.sessions |
    normalize_dump | sha256_text
)"

restore_started_at="$(date +%s)"
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=0' \
  pg_dump "$SNICK_RECOVERY_SOURCE_URL" --format=custom \
    --serializable-deferrable --file="$tmp_dir/coherent-source.dump"
source_dump_sha="$(sha256_file "$tmp_dir/coherent-source.dump")"

if [[ "$(source_inventory_read)" != "$source_inventory" ]] ||
   [[ "$(source_psql -Atc "
     select concat_ws('|', jobname, schedule, command, nodename, nodeport,
       database, username, active)
     from cron.job order by jobname, jobid;
   ")" != "$source_cron_semantic" ]]; then
  echo "Source changed while the coherent archive was captured" >&2
  exit 1
fi

pg_restore --section=pre-data \
  --schema=public --schema=private \
  --file="$tmp_dir/application-pre.sql" "$tmp_dir/coherent-source.dump"
pg_restore -l "$tmp_dir/coherent-source.dump" >"$tmp_dir/archive.list"
awk '$4 == "TABLE" && $5 == "DATA" && $6 == "auth" && $7 == "users" { print }' \
  "$tmp_dir/archive.list" >"$tmp_dir/auth-users-data.list"
awk '$4 == "TABLE" && $5 == "DATA" && $6 == "auth" && $7 == "sessions" { print }' \
  "$tmp_dir/archive.list" >"$tmp_dir/auth-sessions-data.list"
if [[ "$(awk 'END { print NR + 0 }' "$tmp_dir/auth-users-data.list")" != '1' ]] ||
   [[ "$(awk 'END { print NR + 0 }' "$tmp_dir/auth-sessions-data.list")" != '1' ]]; then
  echo "Archive does not contain exactly one Auth users and sessions data section" >&2
  exit 1
fi
pg_restore --use-list="$tmp_dir/auth-users-data.list" --no-owner --no-privileges \
  --file="$tmp_dir/auth-users.sql" "$tmp_dir/coherent-source.dump"
pg_restore --use-list="$tmp_dir/auth-sessions-data.list" --no-owner --no-privileges \
  --file="$tmp_dir/auth-sessions.sql" "$tmp_dir/coherent-source.dump"
pg_restore --section=data \
  --schema=public --schema=private \
  --file="$tmp_dir/application-data.sql" "$tmp_dir/coherent-source.dump"
pg_restore --section=post-data \
  --schema=public --schema=private \
  --file="$tmp_dir/application-post.sql" "$tmp_dir/coherent-source.dump"

awk '$4 == "TRIGGER" && $5 == "auth" && $6 == "users" && $7 == "on_auth_user_created" { print }' \
  "$tmp_dir/archive.list" >"$tmp_dir/auth-trigger.list"
if [[ "$(awk 'END { print NR + 0 }' "$tmp_dir/auth-trigger.list")" != '1' ]]; then
  echo "Archive does not contain exactly one reviewed application Auth trigger" >&2
  exit 1
fi
pg_restore --use-list="$tmp_dir/auth-trigger.list" \
  --file="$tmp_dir/auth-trigger.sql" "$tmp_dir/coherent-source.dump"

# PostgreSQL requires the default-ACL owner to execute these statements.
# Split only the source-generated supabase_admin statements; all other
# application post-data remains in the single application transaction.
awk '
  /^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin / {
    print > admin_file
    next
  }
  { print > filtered_file }
' admin_file="$tmp_dir/supabase-admin-default-acl.sql" \
  filtered_file="$tmp_dir/application-post-filtered.sql" \
  "$tmp_dir/application-post.sql"
if [[ ! -s "$tmp_dir/supabase-admin-default-acl.sql" ]]; then
  echo "Source archive did not contain the required supabase_admin default ACL" >&2
  exit 1
fi

# pg_dump omits explicit owner ACLs because owners already possess implicit
# privileges. The selected inventory intentionally distinguishes NULL from an
# explicit owner ACL, so reproduce only owner entries that are explicit in the
# source catalog. Non-owner ACLs remain pg_dump-owned.
source_psql -Atc "
  with explicit_owner_acl as (
    select n.nspname, c.relname, c.relkind, owner_role.rolname,
      acl.is_grantable,
      string_agg(acl.privilege_type, ', ' order by acl.privilege_type) privileges
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles owner_role on owner_role.oid = c.relowner
    cross join lateral aclexplode(c.relacl) acl
    where n.nspname in ('public', 'private')
      and c.relkind in ('r','p','v','m','S','f')
      and acl.grantee = c.relowner
    group by n.nspname, c.relname, c.relkind, owner_role.rolname,
      acl.is_grantable
  )
  select format('grant %s on %s %I.%I to %I%s;',
    privileges,
    case when relkind = 'S' then 'sequence' else 'table' end,
    nspname, relname, rolname,
    case when is_grantable then ' with grant option' else '' end)
  from explicit_owner_acl
  order by nspname, relname, is_grantable;
" >"$tmp_dir/explicit-owner-acl.sql"

# --schema filters intentionally omit CREATE SCHEMA and schema ACL records.
# Rebuild only the current public/private shells from the source catalog. The
# manual filename-order replay has no provider migration ledger; both source
# and target guards require that absence, and no such ledger is synthesized.
source_psql -Atc "
  with selected_schema as (
    select n.oid, n.nspname, owner_role.rolname owner_name, n.nspacl
    from pg_namespace n
    join pg_roles owner_role on owner_role.oid = n.nspowner
    where n.nspname in ('public', 'private')
  ), statements as (
    select nspname, 1 statement_order,
      format('create schema %I authorization %I;', nspname, owner_name) statement
    from selected_schema
    union all
    select nspname, 2,
      format('revoke all on schema %I from public;', nspname)
    from selected_schema
    union all
    select s.nspname, 3,
      format('grant %s on schema %I to %s%s;',
        string_agg(a.privilege_type, ', ' order by a.privilege_type),
        s.nspname,
        case when a.grantee = 0 then 'public'
          else quote_ident(grantee_role.rolname) end,
        case when a.is_grantable then ' with grant option' else '' end)
    from selected_schema s
    cross join lateral aclexplode(s.nspacl) a
    left join pg_roles grantee_role on grantee_role.oid = a.grantee
    group by s.nspname, a.grantee, grantee_role.rolname, a.is_grantable
  )
  select statement from statements order by nspname, statement_order, statement;
" >"$tmp_dir/selected-schema-bootstrap.sql"
if [[ ! -s "$tmp_dir/selected-schema-bootstrap.sql" ]]; then
  echo "Could not derive selected-schema ownership and ACL bootstrap" >&2
  exit 1
fi

restore_fifo="$tmp_dir/restore-input.fifo"
mkfifo "$restore_fifo"
exec 3<>"$restore_fifo"
restore_fifo_open=true
restore_application_name="snickerdoodle_security_restore_$$"
PGAPPNAME="$restore_application_name" psql -X -q "$SNICK_RECOVERY_TARGET_URL" \
  -v ON_ERROR_STOP=1 <"$restore_fifo" 3>&- \
  >"$tmp_dir/restore.stdout" 2>"$tmp_dir/restore.stderr" &
restore_frontend_pid=$!

for _attempt in {1..50}; do
  restore_backend_pid="$(psql -X -q "$target_control_url" -v ON_ERROR_STOP=1 -Atc "
    select pid from pg_stat_activity
    where datname = 'postgres'
      and application_name = '$restore_application_name';
  ")"
  [[ "$restore_backend_pid" =~ ^[0-9]+$ ]] && break
  sleep 0.1
done
if [[ ! "$restore_backend_pid" =~ ^[0-9]+$ ]]; then
  echo "Could not identify the authority-bound restore backend" >&2
  exit 1
fi

psql -X -q "$target_control_url" -v ON_ERROR_STOP=1 \
  -c 'alter database postgres with allow_connections false;'
target_connections_disabled=true
psql -X -q "$target_control_url" -v ON_ERROR_STOP=1 -c "
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where datname = 'postgres' and pid <> $restore_backend_pid;
"

target_exclusivity="$(psql -X -q "$target_control_url" -v ON_ERROR_STOP=1 -Atc "
  select concat_ws('|',
    (select not datallowconn from pg_database where datname = 'postgres'),
    (select count(*) = 1 from pg_stat_activity where datname = 'postgres'),
    exists (
      select 1 from pg_stat_activity
      where pid = $restore_backend_pid and datname = 'postgres'
        and application_name = '$restore_application_name'
    )
  );
")"
if [[ "$target_exclusivity" != 't|t|t' ]]; then
  echo "Could not establish exclusive restore-target connection state" >&2
  exit 1
fi

printf '%s\n' '\set ON_ERROR_STOP on' >&3
printf '%s\n' 'begin;' >&3
printf '%s\n' "do \$\$ begin
  if (select datallowconn from pg_database where datname = current_database())
    or exists (
      select 1 from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
    )
  then
    raise exception 'Target exclusivity changed before restore'
      using errcode = '55000';
  end if;
end; \$\$;" >&3
printf '%s\n' 'drop trigger if exists on_auth_user_created on auth.users;' >&3
printf '%s\n' 'drop schema if exists private cascade;' >&3
printf '%s\n' 'drop schema if exists public cascade;' >&3
printf '\\i %s\n' "$tmp_dir/selected-schema-bootstrap.sql" >&3
printf '%s\n' 'truncate table auth.sessions, auth.users cascade;' >&3
printf '\\i %s\n' "$tmp_dir/application-pre.sql" >&3
printf '\\i %s\n' "$tmp_dir/auth-users.sql" >&3
printf '\\i %s\n' "$tmp_dir/auth-sessions.sql" >&3
printf '\\i %s\n' "$tmp_dir/application-data.sql" >&3
printf '\\i %s\n' "$tmp_dir/application-post-filtered.sql" >&3
printf '\\i %s\n' "$tmp_dir/auth-trigger.sql" >&3
printf '\\i %s\n' "$tmp_dir/explicit-owner-acl.sql" >&3
printf '%s\n' 'commit;' >&3
printf '%s\n' '\echo SNICK_SECURITY_RESTORE_TRANSACTION_PASS' >&3
exec 3>&-
restore_fifo_open=false

set +e
wait "$restore_frontend_pid"
restore_status=$?
set -e
restore_frontend_pid=''

psql -X -q "$target_control_url" -v ON_ERROR_STOP=1 \
  -c 'alter database postgres with allow_connections true;'
target_connections_disabled=false
if [[ "$restore_status" -ne 0 ]] ||
   ! grep -Fxq 'SNICK_SECURITY_RESTORE_TRANSACTION_PASS' "$tmp_dir/restore.stdout"; then
  echo "Exclusive selected application/Auth restore failed" >&2
  sed -n '1,80p' "$tmp_dir/restore.stderr" >&2
  exit 1
fi

target_admin_psql -f "$tmp_dir/supabase-admin-default-acl.sql"

# Recreate the one disabled current-source Cron job only through pg_cron's API.
# It is inactive before commit and can never execute during this rehearsal.
target_admin_psql <<'SQL'
begin;
select cron.schedule(
  'racoben-payment-operational-cleanup',
  '17 4 * * *',
  'select * from private.cleanup_payment_operational_data();'
) as job_id \gset
select cron.alter_job(
  :'job_id'::bigint,
  schedule => '17 4 * * *',
  command => 'select * from private.cleanup_payment_operational_data();',
  database => 'postgres',
  username => 'postgres',
  active => false
);
commit;
SQL

restored_inventory="$(target_psql -Atf "$inventory")"
if [[ "$restored_inventory" != "$source_inventory" ]]; then
  echo "Restored selected schema/data/ledger/Auth/owner/ACL inventory differs" >&2
  echo "source=$source_inventory" >&2
  echo "target=$restored_inventory" >&2
  exit 1
fi
restored_cron_semantic="$(target_cron_semantic)"
if [[ "$restored_cron_semantic" != "$source_cron_semantic" ]]; then
  echo "Restored Cron semantic state differs" >&2
  exit 1
fi

managed_target_after="$(
  target_dump --exclude-schema=public --exclude-schema=private \
    --exclude-schema=auth --exclude-schema=cron |
    normalize_dump | sha256_text
)"
auth_out_of_scope_after="$(
  target_dump --data-only --schema=auth \
    --exclude-table-data=auth.users --exclude-table-data=auth.sessions |
    normalize_dump | sha256_text
)"
if [[ "$managed_target_after" != "$managed_target_before" ]] ||
   [[ "$auth_out_of_scope_after" != "$auth_out_of_scope_before" ]]; then
  echo "Out-of-scope managed or Auth target state changed" >&2
  exit 1
fi

# ORD03 acceptance intentionally commits. Normalize only its reserved synthetic
# test state after proving the exact restore, never the source. The source guard
# above proves there is no real/customer/payment-bearing data.
target_psql <<'SQL'
begin;
set local lock_timeout = '8s';
set local statement_timeout = '30s';
truncate table
  private.assignment_change_idempotency,
  private.work_item_change_idempotency,
  private.engagement_access_audit_receipts,
  public.engagement_work_items,
  public.engagement_assignments
restart identity cascade;

update public.profiles
set role = case
      when id in (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002'
      ) then 'owner'
      when id in (
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000006'
      ) then 'reviewer'
      else 'operator'
    end,
    active = true,
    updated_at = clock_timestamp()
where id between
  '00000000-0000-4000-8000-000000000001'::uuid
  and '00000000-0000-4000-8000-000000000006'::uuid;

delete from auth.sessions
where user_id between
  '00000000-0000-4000-8000-000000000001'::uuid
  and '00000000-0000-4000-8000-000000000006'::uuid;
insert into auth.sessions (
  id, user_id, created_at, updated_at, refreshed_at, not_after
)
select
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  clock_timestamp(), clock_timestamp(), clock_timestamp(),
  clock_timestamp() + interval '1 day'
from generate_series(1, 6) as fixture(n);
commit;
SQL

target_psql -f "$repo_root/scripts/db/ord03-acceptance.sql"
target_psql -f "$repo_root/scripts/db/engagement-graph-integrity-acceptance.sql"
target_psql -f "$repo_root/scripts/db/intake-manager-queue-acceptance.sql"
target_psql -f "$repo_root/scripts/db/payment-launch-acceptance.sql"

run_suffix="r$((10#$(date +%H%M%S)))"
ORD03_DB_URL="$SNICK_RECOVERY_TARGET_URL" ORD03_RUN_SUFFIX="$run_suffix" \
  bash "$repo_root/scripts/db/ord03-concurrency.sh"
PAYMENT_DB_URL="$SNICK_RECOVERY_TARGET_URL" \
  bash "$repo_root/scripts/db/payment-launch-concurrency.sh"
PAYMENT_DB_URL="$SNICK_RECOVERY_TARGET_URL" \
  bash "$repo_root/scripts/db/payment-capacity-concurrency.sh"
PAYMENT_DB_URL="$SNICK_RECOVERY_TARGET_URL" \
  bash "$repo_root/scripts/db/payment-terminal-race-concurrency.sh"
PAYMENT_DB_URL="$SNICK_RECOVERY_TARGET_URL" \
  bash "$repo_root/scripts/db/multi-customer-payment-concurrency.sh"

verify_inputs
if [[ "$(source_inventory_read)" != "$source_inventory" ]] ||
   [[ "$(source_psql -Atc "
     select concat_ws('|', jobname, schedule, command, nodename, nodeport,
       database, username, active)
     from cron.job order by jobname, jobid;
   ")" != "$source_cron_semantic" ]]; then
  echo "Source changed during target-only acceptance" >&2
  exit 1
fi

target_connection_residue="$(target_psql -Atc "
  select count(*) from pg_stat_activity
  where datname = current_database()
    and pid <> pg_backend_pid()
    and backend_type = 'client backend';
")"
if [[ "$target_connection_residue" != '0' ]]; then
  echo "Target has unexpected remaining connections" >&2
  exit 1
fi

postflight_inventory="$(target_psql -Atf "$inventory")"
postflight_inventory_sha="$(printf '%s' "$postflight_inventory" | sha256_text)"
cron_semantic_sha="$(printf '%s' "$source_cron_semantic" | sha256_text)"
restore_finished_at="$(date +%s)"
restore_seconds=$((restore_finished_at - restore_started_at))

printf '%s\n' \
  "SNICK_SECURITY_SUCCESSOR_RECOVERY_PASS source_host_port=$source_expected_port target_host_port=$target_expected_port source_identity=$source_identity target_identity=$target_identity source_inventory_sha256=$source_inventory_sha source_inventory=$source_inventory source_dump_sha256=$source_dump_sha target_baseline_sha256=$target_whole_baseline_sha cron_semantic_sha256=$cron_semantic_sha postflight_inventory_sha256=$postflight_inventory_sha provider_migration_ledger=ABSENT_NOT_RESTORED restore_seconds=$restore_seconds"
