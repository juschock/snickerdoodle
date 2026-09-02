#!/usr/bin/env bash
set -euo pipefail

: "${PAYMENT_DB_URL:?Set PAYMENT_DB_URL to the disposable loopback PostgreSQL URL}"

psql_bin="${PSQL_BIN:-psql}"
if [[ ! "$PAYMENT_DB_URL" =~ ^postgres(ql)?://[^/@?#]+@(127[.]0[.]0[.]1|localhost):[0-9]{1,5}/postgres$ ]]; then
  echo "Refusing payment state-machine concurrency outside loopback PostgreSQL" >&2
  exit 64
fi

psql_run() {
  "$psql_bin" -X -q -v ON_ERROR_STOP=1 "$PAYMENT_DB_URL" "$@"
}

cleanup() {
  psql_run >/dev/null 2>&1 <<'SQL' || true
begin;
delete from public.stripe_webhook_receipts where event_id like 'evt_sprint03_parallel_%';
delete from public.stripe_events where event_id like 'evt_sprint03_parallel_%';
delete from private.payment_reconciliation_alerts where event_id like 'evt_sprint03_parallel_%';
delete from public.checkout_intents where id::text like '53100000-0000-4000-8000-%';
delete from public.accounts where source = 'stripe_checkout' and name like 'Sprint03 Parallel %';
delete from auth.sessions where id = '53100000-0000-4000-8000-200000000001';
commit;
SQL
}
trap cleanup EXIT
cleanup

reserve_and_bind() {
  local n="$1"
  local suffix
  suffix="$(printf '%012d' "$n")"
  psql_run -v intent_id="53100000-0000-4000-8000-$suffix" \
    -v session_id="cs_test_sprint03_parallel_$(printf '%03d' "$n")" \
    -v customer_number="$n" -v customer_email="sprint03-parallel-$n@example.invalid" <<'SQL'
begin;
set local role service_role;
insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status
) values (
  :'intent_id'::uuid,
  jsonb_build_object(
    'organizationType', 'Small business',
    'campaignFamily', 'Offer / Promotion campaign',
    'primaryAction', 'Buy',
    'organizationName', 'Sprint03 Parallel ' || :'customer_number',
    'campaignName', 'Sprint03 Parallel Campaign ' || :'customer_number',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-09-02T12:00:00Z',
    'locationOrLink', 'https://parallel-' || :'customer_number' || '.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Parallel state-machine proof',
    'offerAsk', 'Buy',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', :'customer_email',
    'additionalNotes', 'No customer data'
  ),
  :'customer_email', 9900, 'usd', '2026-08-30', 'pending'
);
select stripe_session_expires_at::text as stripe_expiry
from public.reserve_stripe_checkout_capacity(
  :'intent_id'::uuid,
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
)
\gset
select public.bind_stripe_checkout_capacity(
  :'intent_id'::uuid, :'session_id', :'stripe_expiry'::timestamptz
);
commit;
SQL
}

reservation_pids=()
for n in $(seq 1 100); do
  reserve_and_bind "$n" &
  reservation_pids+=("$!")
done
for reservation_pid in "${reservation_pids[@]}"; do wait "$reservation_pid"; done

reservation_counts="$(psql_run -Atc "
select concat_ws('|', count(*), count(distinct intent_id),
  count(distinct checkout_session_id),
  count(*) filter (where reservation_state='reserved'))
from public.stripe_checkout_reservations
where intent_id::text like '53100000-0000-4000-8000-%';")"
[[ "$reservation_counts" == '100|100|100|100' ]] || {
  echo "100-way reservation assertion failed: $reservation_counts" >&2
  exit 1
}

process_paid() {
  local n="$1"
  local suffix
  suffix="$(printf '%012d' "$n")"
  psql_run -v intent_id="53100000-0000-4000-8000-$suffix" \
    -v event_id="evt_sprint03_parallel_paid_$(printf '%03d' "$n")" \
    -v session_id="cs_test_sprint03_parallel_$(printf '%03d' "$n")" \
    -v payment_id="pi_test_sprint03_parallel_$(printf '%03d' "$n")" \
    -v customer_id="cus_test_sprint03_parallel_$(printf '%03d' "$n")" \
    -v customer_email="sprint03-parallel-$n@example.invalid" <<'SQL'
begin;
set local role service_role;
select processing_status, transition_code
from public.process_stripe_payment_event(
  :'event_id', 'checkout.session.completed', false,
  :'session_id', :'intent_id'::uuid, :'payment_id', :'customer_id',
  null, null, 9900, null, 'usd', :'customer_email', 'paid',
  clock_timestamp(), false
);
commit;
SQL
}

payment_pids=()
for n in $(seq 1 10); do
  process_paid "$n" &
  payment_pids+=("$!")
done
for payment_pid in "${payment_pids[@]}"; do wait "$payment_pid"; done

graph_counts="$(psql_run -Atc "
select concat_ws('|', count(distinct i.order_id), count(distinct o.account_id),
  count(distinct o.primary_contact_id), count(distinct o.campaign_id),
  count(distinct b.order_id))
from public.checkout_intents i
join public.orders o on o.id=i.order_id
join public.briefs b on b.order_id=o.id
where i.id::text like '53100000-0000-4000-8000-%';")"
[[ "$graph_counts" == '10|10|10|10|10' ]] || {
  echo "10-way independent paid graph assertion failed: $graph_counts" >&2
  exit 1
}

# Four concurrent retries plus the original delivery must produce one effect.
duplicate_pids=()
for _ in $(seq 1 4); do
  process_paid 1 &
  duplicate_pids+=("$!")
done
for duplicate_pid in "${duplicate_pids[@]}"; do wait "$duplicate_pid"; done

duplicate_counts="$(psql_run -Atc "
select concat_ws('|',
  (select count(*) from public.orders where stripe_checkout_session_id='cs_test_sprint03_parallel_001'),
  (select count(*) from public.stripe_events where event_id='evt_sprint03_parallel_paid_001'),
  (select attempt_count from public.stripe_webhook_receipts where event_id='evt_sprint03_parallel_paid_001'));")"
[[ "$duplicate_counts" == '1|1|5' ]] || {
  echo "parallel duplicate assertion failed: $duplicate_counts" >&2
  exit 1
}

# Separate order fulfillment transitions run concurrently under one live owner
# session; each locks and mutates only its own order.
psql_run <<'SQL'
insert into auth.sessions (id, user_id, not_after)
values (
  '53100000-0000-4000-8000-200000000001',
  '00000000-0000-4000-8000-000000000001',
  clock_timestamp() + interval '1 hour'
)
on conflict (id) do update set not_after=excluded.not_after;
SQL

order_a="$(psql_run -Atc "select id from public.orders where stripe_payment_intent_id='pi_test_sprint03_parallel_001'")"
order_b="$(psql_run -Atc "select id from public.orders where stripe_payment_intent_id='pi_test_sprint03_parallel_002'")"

fulfill_one() {
  local order_id="$1"
  local key="$2"
  psql_run -v order_id="$order_id" -v key="$key" <<'SQL'
begin;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
set local "request.jwt.claims"='{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2","session_id":"53100000-0000-4000-8000-200000000001","exp":1999999999}';
set local role authenticated;
select public.transition_order_fulfillment(
  :'order_id'::uuid, 'fulfillment.started', 'new_intake', :'key'::uuid
);
commit;
SQL
}

fulfill_one "$order_a" '53100000-0000-4000-8000-300000000001' &
fulfillment_a=$!
fulfill_one "$order_b" '53100000-0000-4000-8000-300000000002' &
fulfillment_b=$!
wait "$fulfillment_a" "$fulfillment_b"

fulfillment_counts="$(psql_run -Atc "
select concat_ws('|',
  (select status from public.orders where id='$order_a'),
  (select status from public.orders where id='$order_b'),
  (select count(*) from private.order_fulfillment_idempotency
    where idempotency_key::text like '53100000-0000-4000-8000-3%'));")"
[[ "$fulfillment_counts" == 'drafting|drafting|2' ]] || {
  echo "independent fulfillment assertion failed: $fulfillment_counts" >&2
  exit 1
}

echo "SN Sprint 03 parallel PASS: 100 intents; 10 paid graphs; event x5; 2 fulfillment"
