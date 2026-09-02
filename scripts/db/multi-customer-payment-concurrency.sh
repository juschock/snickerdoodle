#!/usr/bin/env bash
set -euo pipefail

: "${PAYMENT_DB_URL:?Set PAYMENT_DB_URL to the disposable loopback PostgreSQL URL}"

psql_bin="${PSQL_BIN:-psql}"
if [[ ! "$PAYMENT_DB_URL" =~ ^postgres(ql)?://[^/@?#]+@(127[.]0[.]0[.]1|localhost):[0-9]{1,5}/postgres$ ]]; then
  echo "Refusing multi-customer payment tests outside a loopback PostgreSQL URL" >&2
  exit 64
fi

psql_run() {
  "$psql_bin" -X -q -v ON_ERROR_STOP=1 "$PAYMENT_DB_URL" "$@"
}

cleanup() {
  psql_run >/dev/null 2>&1 <<'SQL' || true
begin;
delete from public.stripe_webhook_receipts where event_id like 'evt_sprint01_%';
delete from public.stripe_events where event_id like 'evt_sprint01_%';
delete from private.payment_reconciliation_alerts where event_id like 'evt_sprint01_%';
delete from public.checkout_intents
where id::text like '51000000-0000-4000-8000-%';
delete from public.accounts
where source = 'stripe_checkout' and name like 'Sprint01 Synthetic Organization %';
commit;
SQL
}
trap cleanup EXIT
cleanup

reserve_and_bind() {
  local n="$1"
  local suffix
  local reservation_output
  suffix="$(printf '%012d' "$n")"
  reservation_output="$(psql_run -At -v intent_id="51000000-0000-4000-8000-$suffix" \
    -v session_id="cs_test_sprint01_$(printf '%03d' "$n")" \
    -v customer_number="$n" -v customer_email="sprint01-$n@example.invalid" <<'SQL'
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
    'organizationName', 'Sprint01 Synthetic Organization ' || :'customer_number',
    'campaignName', 'Sprint01 Synthetic Campaign ' || :'customer_number',
    'campaignType', 'Product launch',
    'campaignTypeOther', '',
    'dateTime', '2099-09-01T12:00:00Z',
    'locationOrLink', 'https://sprint01-' || :'customer_number' || '.example.invalid',
    'audience', 'Synthetic audience ' || :'customer_number',
    'mainGoal', 'Exercise independent checkout concurrency',
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
select reservation_status, stripe_session_expires_at::text as stripe_expiry
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
\echo :reservation_status
SQL
  )"
  reservation_output="${reservation_output##*$'\n'}"
  [[ "$reservation_output" == 'reserved' ]] || {
    echo "unexpected reservation status for intent $n: $reservation_output" >&2
    return 1
  }
}

payment_pids=()
for n in $(seq 1 100); do
  reserve_and_bind "$n" &
  payment_pids+=("$!")
done
for payment_pid in "${payment_pids[@]}"; do wait "$payment_pid"; done

reservation_counts="$(psql_run -Atc "
select concat_ws('|',
  count(*),
  count(distinct intent_id),
  count(distinct checkout_session_id),
  count(*) filter (where reservation_state = 'reserved')
)
from public.stripe_checkout_reservations
where intent_id::text like '51000000-0000-4000-8000-%';
")"
[[ "$reservation_counts" == '100|100|100|100' ]] || {
  echo "100-way reservation/binding assertion failed: $reservation_counts" >&2
  exit 1
}

finalize_one() {
  local n="$1"
  local suffix
  suffix="$(printf '%012d' "$n")"
  psql_run -v intent_id="51000000-0000-4000-8000-$suffix" \
    -v event_id="evt_sprint01_paid_$(printf '%03d' "$n")" \
    -v session_id="cs_test_sprint01_$(printf '%03d' "$n")" \
    -v payment_id="pi_test_sprint01_$(printf '%03d' "$n")" \
    -v email="sprint01-$n@example.invalid" <<'SQL'
begin;
set local role service_role;
select public.begin_stripe_webhook_attempt(
  :'event_id', 'checkout.session.completed', false, :'session_id'
);
select public.finalize_stripe_checkout(
  :'event_id', 'checkout.session.completed', :'session_id', :'payment_id',
  :'intent_id'::uuid, 9900, 'usd', :'email', clock_timestamp()
) as order_id \gset
select public.complete_stripe_webhook_attempt(
  :'event_id', 'processed', :'order_id'::uuid, null
);
commit;
SQL
}

pids=()
for n in $(seq 1 10); do
  finalize_one "$n" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

graph_counts="$(psql_run -Atc "
select concat_ws('|',
  count(distinct i.order_id),
  count(distinct o.account_id),
  count(distinct o.primary_contact_id),
  count(distinct o.campaign_id),
  count(distinct b.order_id)
)
from public.checkout_intents i
join public.orders o on o.id = i.order_id
join public.briefs b on b.order_id = o.id
where i.id::text like '51000000-0000-4000-8000-%';
")"
[[ "$graph_counts" == '10|10|10|10|10' ]] || {
  echo "10-way independent order-graph assertion failed: $graph_counts" >&2
  exit 1
}

# Exact duplicate delivery is idempotent and returns the original order.
finalize_one 1
duplicate_counts="$(psql_run -Atc "
select concat_ws('|',
  (select count(*) from public.orders where stripe_checkout_session_id = 'cs_test_sprint01_001'),
  (select count(*) from public.stripe_events where event_id = 'evt_sprint01_paid_001'),
  (select attempt_count from public.stripe_webhook_receipts where event_id = 'evt_sprint01_paid_001')
);")"
[[ "$duplicate_counts" == '1|1|2' ]] || {
  echo "duplicate-event assertion failed: $duplicate_counts" >&2
  exit 1
}

# A paid intent stays paid when a later terminal event arrives; the event is
# retained as reconciliation metadata and cannot affect another intent.
psql_run <<'SQL'
begin;
set local role service_role;
select public.record_stripe_operational_event(
  'evt_sprint01_paid_then_expired_001',
  'checkout.session.expired',
  'cs_test_sprint01_001',
  '51000000-0000-4000-8000-000000000001',
  'pi_test_sprint01_001', null, null,
  'checkout_expired_attention_required'
);
commit;
SQL

# Expire intent 11 while intent 13 finalizes. Intent 12 fails asynchronously;
# neither failure can block or contaminate intent 13.
psql_run <<'SQL' &
begin;
set local role service_role;
select public.record_stripe_operational_event(
  'evt_sprint01_expired_011', 'checkout.session.expired',
  'cs_test_sprint01_011', '51000000-0000-4000-8000-000000000011',
  null, null, null, 'checkout_expired_attention_required'
);
commit;
SQL
expiry_pid=$!
psql_run <<'SQL' &
begin;
set local role service_role;
select public.record_stripe_operational_event(
  'evt_sprint01_failed_012', 'checkout.session.async_payment_failed',
  'cs_test_sprint01_012', '51000000-0000-4000-8000-000000000012',
  null, null, null, 'async_payment_failed_attention_required'
);
commit;
SQL
failure_pid=$!
finalize_one 13 &
success_pid=$!
wait "$expiry_pid" "$failure_pid" "$success_pid"

if psql_run >/dev/null 2>&1 <<'SQL'; then
begin;
set local role service_role;
select public.finalize_stripe_checkout(
  'evt_sprint01_paid_after_expiry_011', 'checkout.session.completed',
  'cs_test_sprint01_011', 'pi_test_sprint01_011',
  '51000000-0000-4000-8000-000000000011',
  9900, 'usd', 'sprint01-11@example.invalid', clock_timestamp()
);
rollback;
SQL
  echo "expired intent unexpectedly finalized" >&2
  exit 1
fi

terminal_counts="$(psql_run -Atc "
select concat_ws('|',
  (select status from public.checkout_intents where id='51000000-0000-4000-8000-000000000001'),
  (select status from public.checkout_intents where id='51000000-0000-4000-8000-000000000011'),
  (select status from public.checkout_intents where id='51000000-0000-4000-8000-000000000012'),
  (select status from public.checkout_intents where id='51000000-0000-4000-8000-000000000013'),
  (select count(*) from public.orders where stripe_checkout_session_id='cs_test_sprint01_013')
);")"
[[ "$terminal_counts" == 'paid|expired|expired|paid|1' ]] || {
  echo "out-of-order/failure-isolation assertion failed: $terminal_counts" >&2
  exit 1
}

# Independent fulfillment writes do not share locks or rows.
psql_run -c "update public.orders set status='drafting' where stripe_checkout_session_id='cs_test_sprint01_001'; select pg_sleep(0.5);" &
fulfillment_a=$!
psql_run -c "update public.orders set status='ready_for_human_review' where stripe_checkout_session_id='cs_test_sprint01_002';" &
fulfillment_b=$!
wait "$fulfillment_a" "$fulfillment_b"

psql_run <<'SQL'
do $body$
declare
  v_global_key_found boolean;
  v_paid_ready integer;
  v_queue_index boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%one-active-order:v1%'
  ) into v_global_key_found;

  if v_global_key_found
    or to_regclass('public.uq_orders_one_active_standard_99') is not null
    or to_regclass('public.snickerdoodle_order_capacity') is not null
  then
    raise exception 'obsolete global capacity mechanism remains effective';
  end if;

  if has_table_privilege('anon', 'public.stripe_checkout_reservations', 'select')
    or has_table_privilege('authenticated', 'public.stripe_checkout_reservations', 'select')
    or has_table_privilege('service_role', 'public.stripe_checkout_reservations', 'select')
    or has_table_privilege('anon', 'public.stripe_checkout_reservations', 'insert')
    or has_table_privilege('authenticated', 'public.stripe_checkout_reservations', 'insert')
    or has_table_privilege('service_role', 'public.stripe_checkout_reservations', 'insert')
  then
    raise exception 'reservation table direct privilege widened';
  end if;

  if has_function_privilege('anon',
      'public.reserve_stripe_checkout_capacity(uuid,timestamptz,timestamptz)', 'execute')
    or has_function_privilege('authenticated',
      'public.reserve_stripe_checkout_capacity(uuid,timestamptz,timestamptz)', 'execute')
    or not has_function_privilege('service_role',
      'public.reserve_stripe_checkout_capacity(uuid,timestamptz,timestamptz)', 'execute')
    or has_function_privilege('service_role',
      'public.record_stripe_checkout_failure(text,text,text,uuid)', 'execute')
  then
    raise exception 'payment RPC privilege boundary is invalid';
  end if;

  select count(*) into v_paid_ready
  from private.intake_manager_queue
  where queue_state = 'paid_ready'
    and intake_id::text like '51000000-0000-4000-8000-%';
  if v_paid_ready <> 11 then
    raise exception 'manager queue omitted paid-ready rows: %', v_paid_ready;
  end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'private'
      and indexname = 'intake_manager_queue_feed_idx'
      and indexdef like '%updated_at DESC, queue_receipt_id DESC%'
  ) into v_queue_index;
  if not v_queue_index then
    raise exception 'manager queue keyset index is missing';
  end if;
end;
$body$;
SQL

aal2_paid_ready="$(psql_run -At <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '01000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000001',
    'aal', 'aal2',
    'session_id', '01000000-0000-4000-8000-000000000002',
    'exp', floor(extract(epoch from clock_timestamp()))::bigint + 3600
  )::text,
  true
);
select count(*) filter (where queue_state = 'paid_ready')
from public.read_intake_manager_queue(100, null, null);
commit;
SQL
)"
aal2_paid_ready="${aal2_paid_ready##*$'\n'}"
[[ "$aal2_paid_ready" == '11' ]] || {
  echo "AAL2 manager queue omitted paid-ready rows: $aal2_paid_ready" >&2
  exit 1
}

echo "MULTI_CUSTOMER_PAYMENT_CONCURRENCY_PASS reservations=100 graphs=11 duplicate=1 isolated_failures=2 paid_ready=11"
