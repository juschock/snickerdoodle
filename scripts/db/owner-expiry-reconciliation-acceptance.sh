#!/usr/bin/env bash
set -euo pipefail

: "${PAYMENT_DB_URL:?Set PAYMENT_DB_URL to the disposable loopback PostgreSQL 17 URL}"

psql_bin="${PSQL_BIN:-psql}"

if [[ ! "$PAYMENT_DB_URL" =~ ^postgres(ql)?://[^/@?#]+@(127[.]0[.]0[.]1|localhost):[0-9]{1,5}/postgres$ ]]; then
  echo "Refusing owner expiry acceptance outside loopback PostgreSQL" >&2
  exit 64
fi

server_version="$("$psql_bin" -X -At "$PAYMENT_DB_URL" -c 'show server_version')"
if [[ "$server_version" != 17.* ]]; then
  echo "PostgreSQL 17 required; found $server_version" >&2
  exit 65
fi

psql_run() {
  "$psql_bin" -X -q -v ON_ERROR_STOP=1 "$PAYMENT_DB_URL" "$@"
}

if [[ "$(psql_run -Atc \
  "select to_regprocedure('public.resolve_owner_expired_checkout_alert(uuid,integer,uuid)') is not null")" != "t" ]]; then
  echo "Owner expiry reconciliation migration is not present" >&2
  exit 66
fi

cleanup() {
  psql_run >/dev/null 2>&1 <<'SQL' || true
begin;
delete from private.payment_alert_resolution_receipts
where alert_id in (
  select alert_id
  from private.payment_reconciliation_alerts
  where event_id like 'evt_owner_expiry_accept_%'
);

delete from private.payment_reconciliation_alerts
where event_id like 'evt_owner_expiry_accept_%';

delete from public.stripe_webhook_receipts
where event_id like 'evt_owner_expiry_accept_%';

delete from public.stripe_events
where event_id like 'evt_owner_expiry_accept_%';

delete from private.intake_manager_queue
where intake_kind = 'checkout'
  and intake_id::text like '74000000-0000-4000-8000-%';

delete from public.stripe_checkout_reservations
where intent_id::text like '74000000-0000-4000-8000-%';

delete from public.checkout_intents
where id::text like '74000000-0000-4000-8000-%';

delete from public.orders
where id = '74100000-0000-4000-8000-000000000001';

delete from public.campaigns
where id = '74200000-0000-4000-8000-000000000001';

delete from public.accounts
where id = '74300000-0000-4000-8000-000000000001';

delete from auth.sessions
where id = '74400000-0000-4000-8000-000000000001';

delete from public.profiles
where id = '74500000-0000-4000-8000-000000000001';

delete from auth.users
where id = '74500000-0000-4000-8000-000000000001';
commit;
SQL
}

trap cleanup EXIT
cleanup

psql_run -f scripts/db/owner-expiry-reconciliation-acceptance.sql
