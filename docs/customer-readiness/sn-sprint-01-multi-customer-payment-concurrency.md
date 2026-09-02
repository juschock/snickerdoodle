# SN Sprint 01 — Multi-Customer Payment Concurrency

## Effective design

The forward migration `20260901163504_enable_multi_customer_payment_concurrency.sql`
renames the accidental singleton capacity table to
`public.stripe_checkout_reservations`, makes `intent_id` the primary key, and
drops `uq_orders_one_active_standard_99`. Each Checkout intent owns one
reservation row. Reservation, binding, compensation, finalization, and terminal
failure paths lock only the named intent/reservation plus the named Stripe event.

The following safety boundaries remain unchanged:

- deterministic local Checkout intent and outbound Stripe idempotency key;
- unique Checkout Session and PaymentIntent identifiers;
- unique Stripe event receipts and replay-safe finalization;
- exact 9,900-cent USD, delivery-email, offer, intent, Session, and PaymentIntent binding;
- verified webhook signature processing before any payment RPC;
- durable setup ambiguity, refund, dispute, expiry, and async-failure reconciliation;
- service-role-only payment RPC execution with no direct reservation-table access;
- AAL2 owner-only, keyset-paginated manager queue access.

## Local acceptance boundary

The disposable PostgreSQL 17 acceptance command is:

```bash
PAYMENT_DB_URL='postgresql://<local-user>@127.0.0.1:<disposable-port>/postgres' \
PSQL_BIN='/path/to/postgresql@17/bin/psql' \
./scripts/db/multi-customer-payment-concurrency.sh
```

The harness uses synthetic `.invalid` identities only. It proves 100 parallel
intent creation/reservation/Session bindings, 10 concurrent independent paid graphs, duplicate
event replay, paid/expired/async-failure interleavings, one-customer failure
isolation, independent fulfillment writes, all paid-ready queue rows, stable
queue indexes, and direct-table/RPC privilege denial. It does not prove hosted
Supabase roles, Auth sessions, Stripe delivery, Vercel runtime, provider backup,
or production performance.

## Operational documentation reconciliation

The sprint also removes obsolete human/process serialization from
`docs/internal-automation-pipeline.md`, `docs/marketing-plan-zero-budget.md`,
`docs/studio/studio-architecture.md`, and `docs/studio/phase-plan.md`. The first
completed order and its reconciliation remain learning evidence but do not
serialize acceptance: multiple independent customer orders may be accepted and
processed concurrently within documented staffing, reviewer, commercial, and
quality gates. Every order remains isolated across reservation, assignment,
access, QA, reconciliation, and delivery; capacity risk pauses new acceptance
rather than creating a global one-order rule.

## Rollback and forward recovery

The migration is one transaction. A pre-commit failure rolls back automatically.
There is intentionally no down migration that would collapse multiple customer
reservations or active orders into a singleton. Before hosted application, take
and verify a provider-supported backup and rehearse restore. Any post-commit
defect requires a new reviewed forward migration that preserves every per-intent
reservation/order binding; never restore the package-wide unique index or global
advisory-lock key.
