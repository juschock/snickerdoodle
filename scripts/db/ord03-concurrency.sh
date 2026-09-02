#!/usr/bin/env bash
set -euo pipefail

: "${ORD03_DB_URL:?Set ORD03_DB_URL to the disposable local Postgres URL}"
ord03_run_suffix="${ORD03_RUN_SUFFIX:-0001}"

if [[ ! "$ord03_run_suffix" =~ ^[a-z0-9]{1,16}$ ]]; then
  echo "ORD03_RUN_SUFFIX must contain only 1-16 lowercase letters or digits" >&2
  exit 64
fi

require_loopback_postgres_url() {
  local value="$1"
  local pattern='^postgres(ql)?://([^/@?#]+)@(127[.]0[.]0[.]1|localhost):([0-9]{1,5})/postgres$'
  if [[ ! "$value" =~ $pattern ]] ||
     (( 10#${BASH_REMATCH[4]:-0} < 1 || 10#${BASH_REMATCH[4]:-0} > 65535 )); then
    return 64
  fi
}
if require_loopback_postgres_url \
     'postgresql://user@127.0.0.1:5432@external.invalid:5432/postgres' ||
   ! require_loopback_postgres_url "$ORD03_DB_URL"; then
  echo "Refusing ORD-03 concurrency tests outside exact loopback PostgreSQL URL grammar" >&2
  exit 64
fi

ord03_tmp_dir="$(mktemp -d /private/tmp/snickerdoodle-ord03-concurrency.XXXXXX)"
trap 'rm -rf "$ord03_tmp_dir"' EXIT

owner_claims="select set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-4000-8000-000000000001','session_id','10000000-0000-4000-8000-000000000001','exp',floor(extract(epoch from clock_timestamp()))::bigint+3600,'role','authenticated','aal','aal2')::text,true)"
lead_b_claims="select set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-4000-8000-000000000004','session_id','10000000-0000-4000-8000-000000000004','exp',floor(extract(epoch from clock_timestamp()))::bigint+3600,'role','authenticated','aal','aal2')::text,true)"

expect_reason() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "ORD-03 concurrency assertion failed: $label (actual=$actual expected=$expected)" >&2
    exit 1
  fi
}

# The actual profile UPDATE trigger takes the global advisory lock before row
# locks. Assignment management must fail fast instead of waiting or deadlocking.
psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -Atc "
  begin;
  update public.profiles
  set full_name = full_name
  where id = '00000000-0000-4000-8000-000000000002';
  select pg_sleep(2);
  rollback;
" >"$ord03_tmp_dir/profile-lock-holder.out" 2>&1 &
profile_holder_pid=$!
sleep 0.4

profile_busy_reason="$(printf '%s\n' "
  begin;
  $owner_claims;
  set local role authenticated;
  select out_reason_code
  from public.manage_engagement_assignment(
    'grant',
    '23000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'service_lead',
    clock_timestamp() + interval '1 hour',
    'ord03-profile-lock-busy-${ord03_run_suffix}'
  );
  commit;
" | psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -At |
  awk 'NF { value=$0 } END { print value }')"
expect_reason "$profile_busy_reason" "profile_change_busy" "profile update and assignment lock order"
wait "$profile_holder_pid"

# A held per-order lock produces a retryable assignment_change_busy decision.
psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -Atc "
  begin;
  select pg_advisory_xact_lock(
    hashtextextended('23000000-0000-4000-8000-000000000002', 31032026)
  );
  select pg_sleep(2);
  rollback;
" >"$ord03_tmp_dir/order-lock-holder.out" 2>&1 &
order_holder_pid=$!
sleep 0.4

order_busy_reason="$(printf '%s\n' "
  begin;
  $owner_claims;
  set local role authenticated;
  select out_reason_code
  from public.manage_engagement_assignment(
    'grant',
    '23000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'service_lead',
    clock_timestamp() + interval '1 hour',
    'ord03-order-lock-busy-${ord03_run_suffix}'
  );
  commit;
" | psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -At |
  awk 'NF { value=$0 } END { print value }')"
expect_reason "$order_busy_reason" "assignment_change_busy" "per-order assignment contention"
wait "$order_holder_pid"

# Work creation uses a separate actor/idempotency lock and fails fast when a
# duplicate change with the same key is already in flight.
psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -Atc "
  begin;
  select pg_advisory_xact_lock(
    hashtextextended(
      '00000000-0000-4000-8000-000000000004:' || encode(
        sha256(convert_to('ord03-work-busy-create-${ord03_run_suffix}', 'UTF8')),
        'hex'
      ),
      17042026
    )
  );
  select pg_sleep(2);
  rollback;
" >"$ord03_tmp_dir/work-lock-holder.out" 2>&1 &
work_holder_pid=$!
sleep 0.4

work_busy_reason="$(printf '%s\n' "
  begin;
  $lead_b_claims;
  set local role authenticated;
  select reason_code
  from public.write_engagement_work_item(
    '23000000-0000-4000-8000-000000000001',
    null,
    'draft',
    '{\"fixture\":\"concurrency\"}'::jsonb,
    null,
    'ord03-work-busy-create-${ord03_run_suffix}'
  );
  commit;
" | psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -At |
  awk 'NF { value=$0 } END { print value }')"
expect_reason "$work_busy_reason" "work_item_change_busy" "work-item idempotency contention"
wait "$work_holder_pid"

# An assignment held open in one transaction serializes a conflicting change.
psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -Atc "
  begin;
  $owner_claims;
  set local role authenticated;
  select out_reason_code
  from public.manage_engagement_assignment(
    'grant',
    '23000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'service_lead',
    clock_timestamp() + interval '1 hour',
    'ord03-conflicting-grant-a-${ord03_run_suffix}'
  );
  select pg_sleep(2);
  commit;
" >"$ord03_tmp_dir/conflicting-grant-holder.out" 2>&1 &
conflict_holder_pid=$!
sleep 0.4

conflict_busy_reason="$(printf '%s\n' "
  begin;
  $owner_claims;
  set local role authenticated;
  select out_reason_code
  from public.manage_engagement_assignment(
    'grant',
    '23000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'assigned_reviewer',
    clock_timestamp() + interval '1 hour',
    'ord03-conflicting-grant-b-${ord03_run_suffix}'
  );
  commit;
" | psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -At |
  awk 'NF { value=$0 } END { print value }')"
expect_reason "$conflict_busy_reason" "profile_change_busy" "conflicting assignment change serialized"
wait "$conflict_holder_pid"

dual_role_reason="$(printf '%s\n' "
  begin;
  $owner_claims;
  set local role authenticated;
  select out_reason_code
  from public.manage_engagement_assignment(
    'grant',
    '23000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'assigned_reviewer',
    clock_timestamp() + interval '1 hour',
    'ord03-conflicting-grant-b-final-${ord03_run_suffix}'
  );
  commit;
" | psql -X -q "$ORD03_DB_URL" -v ON_ERROR_STOP=1 -At |
  awk 'NF { value=$0 } END { print value }')"
expect_reason "$dual_role_reason" "dual_role_assignment_denied" "post-serialization role conflict"

echo "ORD03_CONCURRENCY_PASS"
