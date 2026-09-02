#!/usr/bin/env bash
set -euo pipefail

: "${PAYMENT_DB_URL:?Set PAYMENT_DB_URL to the disposable local Postgres URL}"

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
   ! require_loopback_postgres_url "$PAYMENT_DB_URL"; then
  echo "Refusing payment terminal-race tests outside exact loopback PostgreSQL URL grammar" >&2
  exit 64
fi

race_tmp_dir="$(mktemp -d /private/tmp/snickerdoodle-payment-terminal-race.XXXXXX)"

cleanup_terminal_race_fixture() {
  psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
begin;
delete from private.intake_manager_queue
where intake_kind = 'checkout'
  and intake_id = '27000000-0000-4000-8000-000000000001';
delete from private.payment_reconciliation_alerts
where event_id in (
  'evt_test_payment_terminal_paid_0001',
  'evt_test_payment_terminal_expired_0001',
  'evt_test_payment_terminal_async_failed_0001'
);
delete from public.stripe_webhook_receipts
where event_id in (
  'evt_test_payment_terminal_paid_0001',
  'evt_test_payment_terminal_expired_0001',
  'evt_test_payment_terminal_async_failed_0001'
);
delete from public.stripe_events
where event_id in (
  'evt_test_payment_terminal_paid_0001',
  'evt_test_payment_terminal_expired_0001',
  'evt_test_payment_terminal_async_failed_0001'
);
delete from public.checkout_intents
where id = '27000000-0000-4000-8000-000000000001';
delete from public.accounts
where source = 'stripe_checkout'
  and name = 'Synthetic Terminal Race Organization';
commit;
SQL
}

cleanup_terminal_race_artifacts() {
  cleanup_terminal_race_fixture
  rm -rf "$race_tmp_dir"
}

trap cleanup_terminal_race_artifacts EXIT
cleanup_terminal_race_fixture

deadlocks_before="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "select deadlocks from pg_stat_database where datname = current_database();")"

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
set local lock_timeout = '8s';
set local statement_timeout = '20s';

insert into public.checkout_intents (
  id,
  brief_json,
  delivery_email,
  amount_cents,
  currency,
  terms_version,
  stripe_checkout_session_id,
  status
) values (
  '27000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Synthetic Terminal Race Organization',
    'campaignName', 'Synthetic Terminal Race Campaign',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-03-01T12:00:00Z',
    'locationOrLink', 'https://terminal-race.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise paid and late terminal webhook serialization',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'terminal-race@payment.example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'terminal-race@payment.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'cs_test_payment_terminal_race_0001',
  'checkout_created'
);

do $$
declare
  v_stripe_expiry timestamptz := clock_timestamp() + interval '60 minutes';
begin
  perform * from public.reserve_stripe_checkout_capacity(
    '27000000-0000-4000-8000-000000000001',
    v_stripe_expiry,
    v_stripe_expiry + interval '5 minutes'
  );
  perform public.bind_stripe_checkout_capacity(
    '27000000-0000-4000-8000-000000000001',
    'cs_test_payment_terminal_race_0001',
    v_stripe_expiry
  );
end;
$$;
commit;
SQL

# The paid transaction wins deterministically and deliberately holds the exact
# intent/reservation rows after finalization. Both contradictory terminal events
# begin while those per-intent locks are held. They must wait (not deadlock),
# observe the committed paid state, preserve it, and durably acknowledge alerts.
psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$race_tmp_dir/paid.out" 2>"$race_tmp_dir/paid.err" &
begin;
set local role service_role;
set local lock_timeout = '8s';
set local statement_timeout = '20s';
set local application_name = 'snick_terminal_paid';
select * from public.process_stripe_payment_event(
  'evt_test_payment_terminal_paid_0001',
  'checkout.session.completed',
  false,
  'cs_test_payment_terminal_race_0001',
  '27000000-0000-4000-8000-000000000001',
  'pi_test_payment_terminal_race_0001',
  'cus_test_payment_terminal_race_0001',
  null,
  null,
  9900,
  null,
  'usd',
  'terminal-race@payment.example.invalid',
  'paid',
  clock_timestamp(),
  false
) \gset paid_
\echo PAID_LOCK_HELD :paid_order_id
select pg_sleep(2);
commit;
\echo PAID_ORDER :paid_order_id
SQL
paid_pid=$!

paid_ready=false
for _attempt in {1..200}; do
  lock_state="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc "
    select count(*)
    from pg_stat_activity
    where application_name = 'snick_terminal_paid'
      and state = 'active'
      and query like '%pg_sleep(2)%';")"
  if [[ "$lock_state" = "1" ]]; then
    paid_ready=true
    break
  fi
  if ! kill -0 "$paid_pid" 2>/dev/null; then
    break
  fi
  sleep 0.05
done

if [[ "$paid_ready" != true ]]; then
  echo "Paid webhook did not reach the deterministic lock-held checkpoint" >&2
  cat "$race_tmp_dir/paid.err" >&2 || true
  exit 1
fi

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$race_tmp_dir/expired.out" 2>"$race_tmp_dir/expired.err" &
begin;
set local role service_role;
set local lock_timeout = '8s';
set local statement_timeout = '20s';
select * from public.process_stripe_payment_event(
  'evt_test_payment_terminal_expired_0001',
  'checkout.session.expired',
  false,
  'cs_test_payment_terminal_race_0001',
  '27000000-0000-4000-8000-000000000001',
  null,
  null,
  null,
  null,
  9900,
  null,
  'usd',
  null,
  'unpaid',
  clock_timestamp(),
  false
) \gset expired_
commit;
\echo EXPIRED_ORDER :expired_order_id
SQL
expired_pid=$!

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$race_tmp_dir/async-failed.out" 2>"$race_tmp_dir/async-failed.err" &
begin;
set local role service_role;
set local lock_timeout = '8s';
set local statement_timeout = '20s';
select * from public.process_stripe_payment_event(
  'evt_test_payment_terminal_async_failed_0001',
  'checkout.session.async_payment_failed',
  false,
  'cs_test_payment_terminal_race_0001',
  '27000000-0000-4000-8000-000000000001',
  'pi_test_payment_terminal_race_0001',
  null,
  null,
  null,
  9900,
  null,
  'usd',
  null,
  'unpaid',
  clock_timestamp(),
  false
) \gset failed_
commit;
\echo ASYNC_FAILED_ORDER :failed_order_id
SQL
async_failed_pid=$!

race_status=0
if ! wait "$paid_pid"; then
  race_status=1
fi
if ! wait "$expired_pid"; then
  race_status=1
fi
if ! wait "$async_failed_pid"; then
  race_status=1
fi

if [[ "$race_status" -ne 0 ]]; then
  echo "Payment terminal-race client failed" >&2
  for error_file in "$race_tmp_dir"/*.err; do
    if [[ -s "$error_file" ]]; then
      echo "--- ${error_file##*/}" >&2
      cat "$error_file" >&2
    fi
  done
  exit 1
fi

paid_order="$(awk '$1 == "PAID_ORDER" { print $2 }' "$race_tmp_dir/paid.out")"
expired_order="$(awk '$1 == "EXPIRED_ORDER" { print $2 }' "$race_tmp_dir/expired.out")"
async_failed_order="$(awk '$1 == "ASYNC_FAILED_ORDER" { print $2 }' "$race_tmp_dir/async-failed.out")"

if [[ ! "$paid_order" =~ ^[0-9a-f-]{36}$ ]] \
  || [[ "$paid_order" != "$expired_order" ]] \
  || [[ "$paid_order" != "$async_failed_order" ]]; then
  echo "Payment terminal-race assertion failed: events did not bind one paid order" >&2
  printf 'paid=%s expired=%s async_failed=%s\n' \
    "$paid_order" "$expired_order" "$async_failed_order" >&2
  cat "$race_tmp_dir/paid.out" "$race_tmp_dir/expired.out" \
    "$race_tmp_dir/async-failed.out" >&2 || true
  exit 1
fi

fixture_counts="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc "
select concat_ws('|',
  (select count(*) from public.accounts
   where source = 'stripe_checkout'
     and name = 'Synthetic Terminal Race Organization'),
  (select count(*) from public.contacts
   where email = 'terminal-race@payment.example.invalid'),
  (select count(*) from public.campaigns
   where name = 'Synthetic Terminal Race Campaign'),
  (select count(*) from public.orders
   where id = '$paid_order'::uuid
     and payment_status = 'paid'
     and status = 'new_intake'),
  (select count(*) from public.briefs where order_id = '$paid_order'::uuid),
  (select count(*) from public.checkout_intents
   where id = '27000000-0000-4000-8000-000000000001'
     and status = 'paid'
     and order_id = '$paid_order'::uuid),
  (select count(*) from public.stripe_checkout_reservations
   where reservation_state = 'active'
     and intent_id = '27000000-0000-4000-8000-000000000001'
     and order_id = '$paid_order'::uuid
     and released_at is null),
  (select count(*) from public.stripe_events
   where event_id = 'evt_test_payment_terminal_paid_0001'
     and order_id = '$paid_order'::uuid),
  (select count(*) from public.stripe_webhook_receipts
   where event_id in (
       'evt_test_payment_terminal_paid_0001',
       'evt_test_payment_terminal_expired_0001',
       'evt_test_payment_terminal_async_failed_0001'
     )
     and processing_status = 'processed'
     and attempt_count = 1
     and order_id = '$paid_order'::uuid),
  (select count(*) from private.payment_reconciliation_alerts
   where event_id = 'evt_test_payment_terminal_expired_0001'
     and event_type = 'checkout.session.expired'
     and alert_code = 'checkout_expired_attention_required'
     and alert_state = 'open'
     and checkout_intent_id = '27000000-0000-4000-8000-000000000001'
     and checkout_session_id = 'cs_test_payment_terminal_race_0001'
     and order_id = '$paid_order'::uuid),
  (select count(*) from private.payment_reconciliation_alerts
   where event_id = 'evt_test_payment_terminal_async_failed_0001'
     and event_type = 'checkout.session.async_payment_failed'
     and alert_code = 'async_payment_failed_attention_required'
     and alert_state = 'open'
     and checkout_intent_id = '27000000-0000-4000-8000-000000000001'
     and checkout_session_id = 'cs_test_payment_terminal_race_0001'
     and payment_intent_id = 'pi_test_payment_terminal_race_0001'
     and order_id = '$paid_order'::uuid)
); ")"

if [[ "$fixture_counts" != "1|1|1|1|1|1|1|1|3|1|1" ]]; then
  echo "Payment terminal-race assertion failed: paid state or durable evidence changed ($fixture_counts)" >&2
  exit 1
fi

deadlocks_after="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "select deadlocks from pg_stat_database where datname = current_database();")"

if [[ "$deadlocks_after" != "$deadlocks_before" ]]; then
  echo "Payment terminal-race assertion failed: PostgreSQL recorded a deadlock" >&2
  exit 1
fi

echo "PAYMENT_TERMINAL_RACE_CONCURRENCY_PASS"
