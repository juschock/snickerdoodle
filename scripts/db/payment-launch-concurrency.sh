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
  echo "Refusing payment concurrency tests outside exact loopback PostgreSQL URL grammar" >&2
  exit 64
fi

payment_tmp_dir="$(mktemp -d /private/tmp/snickerdoodle-payment-concurrency.XXXXXX)"

cleanup_payment_fixture() {
  psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
begin;
delete from public.stripe_webhook_receipts
where event_id in (
  'evt_test_payment_concurrent_a_0001',
  'evt_test_payment_concurrent_b_0001'
);
delete from public.stripe_events
where event_id in (
  'evt_test_payment_concurrent_a_0001',
  'evt_test_payment_concurrent_b_0001'
);
delete from public.checkout_intents
where id = '26000000-0000-4000-8000-000000000001';
delete from public.accounts
where source = 'stripe_checkout'
  and name = 'Synthetic Concurrent Payment Organization';
commit;
SQL
}

trap 'cleanup_payment_fixture; rm -rf "$payment_tmp_dir"' EXIT
cleanup_payment_fixture

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
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
  '26000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Synthetic Concurrent Payment Organization',
    'campaignName', 'Synthetic Concurrent Payment Campaign',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-02-01T12:00:00Z',
    'locationOrLink', 'https://payment-concurrency.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise concurrent paid finalization',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'concurrent@payment.example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'concurrent@payment.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'cs_test_payment_concurrent_0001',
  'checkout_created'
);

do $$
declare
  v_stripe_expiry timestamptz := clock_timestamp() + interval '60 minutes';
begin
  perform * from public.reserve_stripe_checkout_capacity(
    '26000000-0000-4000-8000-000000000001',
    v_stripe_expiry,
    v_stripe_expiry + interval '5 minutes'
  );
  perform public.bind_stripe_checkout_capacity(
    '26000000-0000-4000-8000-000000000001',
    'cs_test_payment_concurrent_0001',
    v_stripe_expiry
  );
end;
$$;
commit;
SQL

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$payment_tmp_dir/finalize-a.out" 2>"$payment_tmp_dir/finalize-a.err" &
begin;
set local role service_role;
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_concurrent_a_0001',
  'checkout.session.completed',
  false,
  'cs_test_payment_concurrent_0001'
);
select public.finalize_stripe_checkout(
  'evt_test_payment_concurrent_a_0001',
  'checkout.session.completed',
  'cs_test_payment_concurrent_0001',
  'pi_test_payment_concurrent_0001',
  '26000000-0000-4000-8000-000000000001',
  9900,
  'usd',
  'concurrent@payment.example.invalid',
  clock_timestamp()
) as order_id \gset
select pg_sleep(2);
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_concurrent_a_0001',
  'processed',
  :'order_id'::uuid,
  null
);
commit;
select :'order_id';
SQL
finalize_a_pid=$!
sleep 0.4

psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -At <<'SQL' \
  >"$payment_tmp_dir/finalize-b.out" 2>"$payment_tmp_dir/finalize-b.err" &
begin;
set local role service_role;
select public.begin_stripe_webhook_attempt(
  'evt_test_payment_concurrent_b_0001',
  'checkout.session.async_payment_succeeded',
  false,
  'cs_test_payment_concurrent_0001'
);
select public.finalize_stripe_checkout(
  'evt_test_payment_concurrent_b_0001',
  'checkout.session.async_payment_succeeded',
  'cs_test_payment_concurrent_0001',
  'pi_test_payment_concurrent_0001',
  '26000000-0000-4000-8000-000000000001',
  9900,
  'usd',
  'concurrent@payment.example.invalid',
  clock_timestamp()
) as order_id \gset
select public.complete_stripe_webhook_attempt(
  'evt_test_payment_concurrent_b_0001',
  'processed',
  :'order_id'::uuid,
  null
);
commit;
select :'order_id';
SQL
finalize_b_pid=$!

wait "$finalize_a_pid"
wait "$finalize_b_pid"

order_a="$(tail -1 "$payment_tmp_dir/finalize-a.out")"
order_b="$(tail -1 "$payment_tmp_dir/finalize-b.out")"

if [[ ! "$order_a" =~ ^[0-9a-f-]{36}$ ]] || [[ "$order_a" != "$order_b" ]]; then
  echo "Payment concurrency assertion failed: concurrent events returned different orders" >&2
  exit 1
fi

fixture_counts="$(psql -X -q "$PAYMENT_DB_URL" -v ON_ERROR_STOP=1 -Atc "
select concat_ws('|',
  (select count(*) from public.accounts
   where source = 'stripe_checkout'
     and name = 'Synthetic Concurrent Payment Organization'),
  (select count(*) from public.contacts
   where email = 'concurrent@payment.example.invalid'),
  (select count(*) from public.campaigns
   where name = 'Synthetic Concurrent Payment Campaign'),
  (select count(*) from public.orders
   where id = '$order_a'::uuid and payment_status = 'paid'),
  (select count(*) from public.briefs where order_id = '$order_a'::uuid),
  (select count(*) from public.checkout_intents
   where id = '26000000-0000-4000-8000-000000000001'
     and status = 'paid' and order_id = '$order_a'::uuid),
  (select count(*) from public.stripe_events
   where order_id = '$order_a'::uuid
     and event_id in (
       'evt_test_payment_concurrent_a_0001',
       'evt_test_payment_concurrent_b_0001'
     )),
  (select count(*) from public.stripe_webhook_receipts
   where order_id = '$order_a'::uuid
     and processing_status = 'processed'
     and attempt_count = 1
     and event_id in (
       'evt_test_payment_concurrent_a_0001',
       'evt_test_payment_concurrent_b_0001'
     )),
  (select count(*) from public.stripe_checkout_reservations
   where reservation_state = 'active'
     and intent_id = '26000000-0000-4000-8000-000000000001'
     and order_id = '$order_a'::uuid)
); ")"

if [[ "$fixture_counts" != "1|1|1|1|1|1|2|2|1" ]]; then
  echo "Payment concurrency assertion failed: duplicate or incomplete graph ($fixture_counts)" >&2
  exit 1
fi

echo "PAYMENT_LAUNCH_CONCURRENCY_PASS"
