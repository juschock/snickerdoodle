# SN08A provider-only legacy inventory

Scope: exact hosted migration `20260831035135_close_paid_fulfillment_and_backfill_queue` versus the accepted predecessor immediately before `20260901163504_enable_multi_customer_payment_concurrency.sql`. The exact provider SQL is retained as a secret-free test fixture; it is evidence, never an instruction or an application payload.

## Hosted facts at preflight

- `private.owner_fulfillment_close_receipts`: zero rows. **Retire.** Had it contained a row, the reconciliation migration would fail with SQLSTATE `23514` so independent evidence could be preserved deliberately.
- `private.owner_fulfillment_close_idempotency`: zero rows. **Retire** under the same fail-closed evidence rule.
- `private.protect_owner_fulfillment_close_receipt()`, and both append-only triggers on the two tables: **Retire** after closing the public caller and dropping the empty tables.
- `public.close_owner_paid_fulfillment(uuid,text)`: authenticated `SECURITY DEFINER` caller with owner+AAL2 checks, but it takes the global `snickerdoodle:standard_99:one-active-order:v1` advisory lock and writes a separate close lifecycle. **Retire**; revoke execution before dropping it.
- `private.backfill_paid_intake_manager_queue()`: one-use migration backfill with package-global obligation checks. **Retire.** It is not an application caller.
- `private.queue_checkout_intake_for_manager()`: overwritten with provider-specific terminal-state preservation. **Replace** first with the accepted predecessor body; SN03 then installs the sole current state-machine synchronizer.
- Provider queue constraints ending in `_v2_*`: **Replace** with the accepted predecessor names/semantics so the immutable SN03 migration can transform them deterministically.
- `public.snickerdoodle_order_capacity.capacity_origin`, its origin check, null-expiry checks, `private.set_capacity_origin_on_reservation()`, and trigger: **Retire.** These exist only to encode a provider-only historical singleton.
- One `historical_paid_backfill` capacity row: active, null expiry timestamps, exact non-null Checkout Session, and exact match to one authoritative paid checkout-intent/order/session graph. **Retire duplicated operational binding only.** The checkout intent, order, brief, Stripe event/receipt, activity, and manager-queue evidence remain intact.
- Ordinary singleton capacity constraints/table at this stage: **Preserve temporarily** only to restore the exact accepted predecessor. The immediately following accepted SN01 migration transforms the table into independent per-intent reservations and drops the global order constraint.
- `public.transition_order_fulfillment(uuid,text,text,uuid)` plus its SN04 private internal routine: **Authoritative replacement.** Exact order argument; owner+AAL2 or live exact-order `service_lead`; per-order row lock; expected-source-state check; UUID idempotency binding; paid-order requirement; metadata-only activity and access-denial audit; no global package lock.

No provider-only object is classified unknown. Any partial legacy inventory, nonempty legacy receipt, provider-only queue state that cannot map losslessly, incoherent historical paid graph, or null-expiry ordinary reservation is an explicit migration blocker.

## Dependency-safe order

1. Validate complete legacy inventory and evidence/data invariants.
2. Revoke all execution on the obsolete public RPC, then drop it.
3. Lock only affected application tables for the bounded retirement transaction.
4. Drop empty idempotency/receipt tables and their protector; drop the one-use backfill.
5. Drop capacity-origin trigger/helper, remove only validated duplicated historical bindings, and restore exact predecessor constraints.
6. Restore exact predecessor queue constraints and trigger body.
7. Allow the five accepted immutable RC migrations to install per-intent concurrency, terminal reconciliation, the authoritative payment state machine, privileged-access wrapper, and privacy lifecycle.

## Proof boundary

`scripts/db/hosted-legacy-reconciliation.sh` replays both (a) all 21 migrations from zero and (b) the first 15 accepted migrations, exact provider-only fixture, reconciliation migration, and final five accepted migrations. It requires byte-identical schema-only dumps, one preserved historical paid graph, absence of every legacy object/global-lock token, one public fulfillment path, and intended RPC grants. This is disposable PostgreSQL 17 evidence only; no hosted migration was applied.
