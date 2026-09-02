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
  echo "Refusing payment capacity tests outside exact loopback PostgreSQL URL grammar" >&2
  exit 64
fi

payment_capacity_tmp_dir="$(mktemp -d /private/tmp/snickerdoodle-payment-capacity.XXXXXX)"

cleanup_payment_capacity_fixture() {
  psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
begin;
delete from public.stripe_webhook_receipts
where event_id in (
  'evt_test_payment_capacity_a_0001',
  'evt_test_payment_capacity_b_0001'
);
delete from public.stripe_events
where event_id in (
  'evt_test_payment_capacity_a_0001',
  'evt_test_payment_capacity_b_0001'
);
delete from public.checkout_intents
where id in (
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102'
);
delete from public.accounts
where source = 'stripe_checkout'
  and name in (
    'Synthetic Capacity Organization A',
    'Synthetic Capacity Organization B'
  );
commit;
SQL
}

trap 'cleanup_payment_capacity_fixture; rm -rf "$payment_capacity_tmp_dir"' EXIT
cleanup_payment_capacity_fixture

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status
) values
(
  '26000000-0000-4000-8000-000000000101',
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Synthetic Capacity Organization A',
    'campaignName', 'Synthetic Capacity Campaign A',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-03-01T12:00:00Z',
    'locationOrLink', 'https://capacity-a.example.invalid',
    'audience', 'Synthetic audience A',
    'mainGoal', 'Exercise pre-payment capacity',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'capacity-a@example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'capacity-a@example.invalid', 9900, 'usd', '2026-08-30', 'pending'
),
(
  '26000000-0000-4000-8000-000000000102',
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Synthetic Capacity Organization B',
    'campaignName', 'Synthetic Capacity Campaign B',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-03-02T12:00:00Z',
    'locationOrLink', 'https://capacity-b.example.invalid',
    'audience', 'Synthetic audience B',
    'mainGoal', 'Exercise pre-payment capacity',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'capacity-b@example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'capacity-b@example.invalid', 9900, 'usd', '2026-08-30', 'pending'
);
commit;
SQL

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$payment_capacity_tmp_dir/reserve-a.out" 2>"$payment_capacity_tmp_dir/reserve-a.err" &
begin;
set local role service_role;
select reservation_status
from public.reserve_stripe_checkout_capacity(
  '26000000-0000-4000-8000-000000000101',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
);
select pg_sleep(1);
commit;
SQL
reserve_a_pid=$!

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$payment_capacity_tmp_dir/reserve-b.out" 2>"$payment_capacity_tmp_dir/reserve-b.err" &
begin;
set local role service_role;
select reservation_status
from public.reserve_stripe_checkout_capacity(
  '26000000-0000-4000-8000-000000000102',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
);
select pg_sleep(1);
commit;
SQL
reserve_b_pid=$!

wait "$reserve_a_pid"
wait "$reserve_b_pid"

reserve_a="$(grep -E '^(reserved|same)$' "$payment_capacity_tmp_dir/reserve-a.out")"
reserve_b="$(grep -E '^(reserved|same)$' "$payment_capacity_tmp_dir/reserve-b.out")"

if [[ "$reserve_a|$reserve_b" != "reserved|reserved" ]]; then
  echo "Independent reservation race must allow both customers ($reserve_a|$reserve_b)" >&2
  exit 1
fi

stored_expiry_a="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "select stripe_session_expires_at::text from public.stripe_checkout_reservations where intent_id = '26000000-0000-4000-8000-000000000101'::uuid;")"
stored_expiry_b="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "select stripe_session_expires_at::text from public.stripe_checkout_reservations where intent_id = '26000000-0000-4000-8000-000000000102'::uuid;")"
retry_result_a="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "set role service_role; select reservation_status || '|' || (stripe_session_expires_at = '$stored_expiry_a'::timestamptz)::text from public.reserve_stripe_checkout_capacity('26000000-0000-4000-8000-000000000101'::uuid, clock_timestamp() + interval '60 minutes', clock_timestamp() + interval '65 minutes');")"
retry_result_b="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "set role service_role; select reservation_status || '|' || (stripe_session_expires_at = '$stored_expiry_b'::timestamptz)::text from public.reserve_stripe_checkout_capacity('26000000-0000-4000-8000-000000000102'::uuid, clock_timestamp() + interval '60 minutes', clock_timestamp() + interval '65 minutes');")"
if [[ "$retry_result_a|$retry_result_b" != "same|true|same|true" ]]; then
  echo "Exact retries did not preserve both reserved Stripe expiries ($retry_result_a|$retry_result_b)" >&2
  exit 1
fi

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 \
  -v stripe_expiry_a="$stored_expiry_a" \
  -v stripe_expiry_b="$stored_expiry_b" <<'SQL'
begin;
set local role service_role;
select public.bind_stripe_checkout_capacity(
  '26000000-0000-4000-8000-000000000101',
  'cs_test_payment_capacity_a_0001',
  :'stripe_expiry_a'::timestamptz
);
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_capacity_a_0001',
  'checkout.session.completed', false, 'cs_test_payment_capacity_a_0001'
);
select public.finalize_stripe_checkout(
  'evt_test_payment_capacity_a_0001',
  'checkout.session.completed',
  'cs_test_payment_capacity_a_0001',
  'pi_test_payment_capacity_a_0001',
  '26000000-0000-4000-8000-000000000101',
  9900,
  'usd',
  'capacity-a@example.invalid',
  clock_timestamp()
) as order_a_id \gset
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_capacity_a_0001',
  'processed', :'order_a_id'::uuid, null
);

select public.bind_stripe_checkout_capacity(
  '26000000-0000-4000-8000-000000000102',
  'cs_test_payment_capacity_b_0001',
  :'stripe_expiry_b'::timestamptz
);
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_capacity_b_0001',
  'checkout.session.completed', false, 'cs_test_payment_capacity_b_0001'
);
select public.finalize_stripe_checkout(
  'evt_test_payment_capacity_b_0001',
  'checkout.session.completed',
  'cs_test_payment_capacity_b_0001',
  'pi_test_payment_capacity_b_0001',
  '26000000-0000-4000-8000-000000000102',
  9900,
  'usd',
  'capacity-b@example.invalid',
  clock_timestamp()
) as order_b_id \gset
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_capacity_b_0001',
  'processed', :'order_b_id'::uuid, null
);
commit;
SQL

fixture_counts="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc "
select concat_ws('|',
  (select count(*) from public.orders o
   join public.checkout_intents i on i.order_id = o.id
   where o.package_type = 'standard_99' and o.payment_status = 'paid'
     and i.id in (
       '26000000-0000-4000-8000-000000000101',
       '26000000-0000-4000-8000-000000000102'
     )),
  (select count(*) from public.stripe_checkout_reservations
   where intent_id in (
       '26000000-0000-4000-8000-000000000101',
       '26000000-0000-4000-8000-000000000102'
     ) and reservation_state = 'active'),
  (select count(*) from public.checkout_intents
   where id in (
       '26000000-0000-4000-8000-000000000101',
       '26000000-0000-4000-8000-000000000102'
     ) and status = 'paid' and order_id is not null),
  (select count(*) from public.accounts
   where source = 'stripe_checkout'
     and name in ('Synthetic Capacity Organization A', 'Synthetic Capacity Organization B')),
  (select count(*) from public.stripe_webhook_receipts
   where event_id in (
       'evt_test_payment_capacity_a_0001',
       'evt_test_payment_capacity_b_0001'
     )
     and processing_status = 'processed')
);")"

if [[ "$fixture_counts" != "2|2|2|2|2" ]]; then
  echo "Independent reservation race produced invalid isolated graphs ($fixture_counts)" >&2
  exit 1
fi

echo "PAYMENT_MULTI_CUSTOMER_CAPACITY_CONCURRENCY_PASS"
