# SN Sprint 08 hosted preflight

Status: **PREFLIGHT COMPLETE / PROVIDER MUTATIONS NOT STARTED**
Captured: 2026-09-02 ET
Candidate: `1.1.0-rc.1` at commit `cfb7e0a5a268f58c0772abb5cbdf4cb0b71f8060`, tree `b5af672327b16664c4508ddc7e9b05cff58fdd41`
Branch: `agent/snickerdoodle-stripe-checkout`

This receipt contains no API keys, signing secrets, authentication factors, customer content, contact values, raw provider payloads, or payment-instrument data.

## Local custody

- Index is clean. The only worktree residue is the frozen excluded binary and `docs/marketing/` aggregate documented by SN07.
- Local runtime: Node `v22.23.2`; npm `10.9.8`; Vercel CLI `41.1.4`; Supabase CLI `2.31.8`.
- Local migration chain has 20 SQL migrations. Ledger SHA-256: `144d209da0c2b90901ab5ca2f2909b05f14011565c465c98de61389c5a857b38`.
- Git `origin` still targets `juschock/CauseBrief.git`. This is an identity/release-control blocker; no remote was changed.
- `.vercel/project.json` binds the checkout to Vercel team `team_eeG1yT8TtHfgdO7JkmiLkYTg`, project `prj_s5ioDg3l81ogNgZwmOREf3Q7iKQE`.

## Supabase pre-state

- Intended project: `snickerdoodle-studio` (`iybwbnabyphpzlmzypga`), organization `Racoben` (`mrwwseppdikgzvhkvdsl`), Pro, `ACTIVE_HEALTHY`, `us-east-2`, PostgreSQL `17.6.1.141` (server `17.6`).
- Hosted migration ledger has 15 entries. Historical provider filenames/versions diverge from the reconstructed local ledger, so migration identity must be reconciled semantically rather than by count alone.
- Exact missing accepted forward migrations:
  1. `20260901163504_enable_multi_customer_payment_concurrency.sql` — `b26e7c51ad3a1007181d58960698d8dcd804592c06727244a5b4020ba85323cb`
  2. `20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql` — `4c8a1dab63eff51339b0d32a06302bfb1a80064a827485d21a22277abbb951ed`
  3. `20260902044710_prove_payment_state_machine.sql` — `45759af59658153dce1eeaebcf9219d385e19c34b26f1437df11f7949cf72e2c`
  4. `20260902052346_harden_privileged_rpc_access.sql` — `69cae93f2f2b4cc853aef504a7278e42520fca45b9c22138e7b488a0be89396c`
  5. `20260902064553_implement_privacy_lifecycle_and_retention.sql` — `0adaa00fdd6566dd7576f3757e8d75fafcc8c94618758e2882880d20623dd616`
- Hosted schema still has `public.snickerdoodle_order_capacity` with one row and `uq_orders_one_active_standard_99`; customer B can therefore be blocked by customer A. This confirms the first missing migration is operationally required.
- Aggregate-only hosted preflight: 1 Auth user, 1 verified MFA factor, 1 order, 2 checkout intents, 1 Stripe event, 1 webhook receipt, 2 queue rows, 0 assignments, 0 Storage buckets/objects, and 1 Cron job. Data provenance is not inferred from counts.
- Current elevated RPCs use pinned empty `search_path`. Current advisor baseline: security 24 findings (17 INFO `rls_enabled_no_policy`; 7 WARN authenticated `SECURITY DEFINER` RPCs), performance 30 INFO (8 unindexed-FK, 21 unused-index, 1 Auth fixed-connection notice). Intended API RPC warnings require semantic authorization review, not blind revocation.
- Backup inventory is directly observed: latest physical backup `2026-09-02 09:18:39 UTC`; seven earlier daily restore points are visible through `2026-08-26`. Storage bytes are excluded. PITR is not enabled and remains out of scope because it is a paid add-on.
- No development branches or Edge Functions exist. Storage is not launch-critical for the current text-only workflow because the hosted project has zero buckets and the accepted application route set does not require blobs.

## Stripe pre-state

- Two distinct contexts are connected: `Racoben Engineering` live and `Default sandbox` test. Mode mixing is prohibited.
- Live has an active `Snickerdoodle Campaign Package` product and active one-time USD `9900` price, both metadata-bound to `product=snickerdoodle`, `offer_id=standard_99`, `offer_version=2026-08-30-v1`; tax behavior is unspecified and automatic tax remains off in application code.
- Live has one enabled Snickerdoodle webhook at the production route, subscribed only to checkout completion/async success/async failure/expiry, full refund, and dispute open/close events.
- Live account capabilities are enabled for charges and payouts, with no current or past-due account requirements observed. This does not authorize a live canary charge.
- Test has no Snickerdoodle product or price. It has one enabled Snickerdoodle webhook directed to a protected preview; its protection-bypass query value is intentionally omitted from this receipt.
- The existing test webhook URL must be replaced or rotated before reuse because its URL itself contains a protection-bypass credential.
- No secret-key or webhook-signing-secret custody was read or printed. A mode-consistent restricted runtime key and signing secret remain to be proven in Vercel before a signed test canary.

## Vercel, domain, and observability pre-state

- Linked project remains legacy-named `campaign-kit`, Pro, Next.js, Node `22.x`, project API `live=false`.
- Latest production deployment `dpl_A4ozQqB21BczVRPev69TLrTWZPYX` is `READY` but was built from historical commit `3cc5e7ac2c069643a4eeb3a2db54fc8bf0aba566`, not the accepted SN07 RC. It is not a valid RC deployment identity or rollback target.
- Previous production deployment `dpl_39poeXUP4VYA8PWU7x5NoVhsDvyp` is also the same historical commit and cannot receive RC rollback credit.
- `https://racoben.com/snickerdoodle` returns HTTP 200 from the latest deployment and currently displays active Fit Check, $99, human-review, 48-hour, and refund assertions. This live copy is not evidence that current legal, monetary, fulfillment, or production gates passed.
- `https://racoben.com/snickerdoodle/api/health` also returns HTTP 200 from that same historical deployment.
- Last-24-hour Vercel read-only telemetry reports no runtime errors and 23 HTTP 200 log events in the returned top status-code group. This is availability evidence only, not workflow correctness.
- Vercel CLI returned no persisted environment-variable rows for the linked project. Required runtime values must be inventoried and set in provider secret storage without printing values before an RC preview can be truthful or functional.
- `racoben.com` MX resolves to Microsoft/GoDaddy protection. Its observed SPF policy is `v=spf1 include:secureserver.net -all`; DMARC is strict `reject` with relaxed alignment and aggregate reporting.
- DKIM remains **unverified**, not proven absent: common selector probes returned no record, but selector guessing is not authoritative. Verification requires the actual mail-admin configuration or headers from a controlled sent message.
- `snickerdoodle@racoben.com` receive/send/reply-to behavior and aligned DKIM therefore remain a sender-authentication and inbox-readiness gate. No mail was sent or configured.

## Exact mutation plan and stop rules

1. Recompute all five local migration hashes and re-read the hosted ledger immediately before application.
2. Confirm the latest daily backup still predates the first mutation and record the exact timestamp. Do not enable PITR or incur spend.
3. Apply the five accepted migrations sequentially with their exact local filenames/bodies. Stop on the first error; do not repair production ad hoc.
4. Postflight the hosted ledger and schema: absence of singleton capacity/index; required uniqueness/indexes; RLS/grants/Data API denial; pinned privileged routines; advisor classification; multi-customer nonblocking using bounded synthetic rows only.
5. Configure a protected Vercel preview from exact RC bytes, provider env values in secret storage, and Stripe **test-mode** product/price/webhook only. Never place a bypass token in Git, receipts, logs, or user-facing output.
6. Run signed test-provider success, duplicate, retry, expiry/failure, refund, and dispute canaries; reconcile provider and database receipts without exposing customer/payment data.
7. Verify Auth/AAL2/scoped assignments, route matrix, mail authentication, monitoring ownership, immutable deployment identity, and rollback.
8. Do not promote or open commercial acquisition while repository identity, legal/terms/refund/tax/retention approvals, mail custody, or any hosted gate remains unresolved.

Hard stops remain: any new spend, tax enablement/classification, material legal/retention/refund decision, destructive restore/deletion, uninvolved-customer charge, or owner live $99 canary consequence.

## Execution stop: incompatible hosted predecessor

Captured during resumed execution on 2026-09-02 ET. **No migration was applied.**

- A clean disposable PostgreSQL 17 replay of the accepted local state immediately before the five final migrations produced 524 selected application-catalog objects and total catalog MD5 `2e5c82e061474d7be5f0ca88daa339b9`.
- The hosted predecessor produced 567 selected objects and total catalog MD5 `a72bb86328840db64b1ea173ba4e484a`. Category counts also differ: local/hosted columns `238/256`, constraints `138/150`, functions `34/38`, indexes `69/73`, policies `11/11`, relations `27/29`, triggers `7/10`.
- The difference is not platform noise alone. Hosted migration `close_paid_fulfillment_and_backfill_queue` introduced provider-only application objects absent from the accepted local predecessor: `private.owner_fulfillment_close_receipts`, `private.owner_fulfillment_close_idempotency`, their append-only triggers/helper, and authenticated `SECURITY DEFINER` RPC `public.close_owner_paid_fulfillment(uuid,text)`.
- The RPC has pinned empty `search_path` and an AAL2 owner check, but its body explicitly reads and writes `public.snickerdoodle_order_capacity`, takes the global advisory lock derived from `snickerdoodle:standard_99:one-active-order:v1`, and directly closes orders/queue entries through a lifecycle distinct from the accepted SN03/SN04 `transition_order_fulfillment` boundary.
- `20260901163504_enable_multi_customer_payment_concurrency.sql` renames/transforms the singleton capacity table to per-intent reservations and removes the global one-active-order model. The provider-only RPC is not altered or revoked by any of the five accepted migrations. Applying the five unchanged would therefore leave an authenticated elevated API path that is stale, potentially runtime-broken after the table transformation, and contradictory to the accepted multi-customer/privileged-RPC state machine.
- This fails semantic predecessor compatibility and the SN04 requirement that every privileged path be explicitly inventoried, authorized, and regression-tested. Migration count, successful DDL application, or later advisor output cannot cure that custody defect.

Required next unit: a new reviewed forward-only compatibility migration must explicitly retire or reconcile the provider-only close RPC/tables/triggers with the accepted fulfillment state machine, followed by a new local replay/upgrade corpus and immutable candidate custody. That work is outside the instruction to apply only the five accepted SQL files and introduce no schema/code change, so execution stopped before provider mutation.

## Governing disposition and SN08A boundary

The governing session subsequently selected **RETIRE** for the provider-only legacy objects. SN08A creates one pre-final migration, `20260901160000_reconcile_provider_only_legacy_fulfillment.sql`, so the hosted predecessor can be normalized before the five immutable RC migrations execute. The exact inventory and lossless-retirement rules are recorded in `sn-sprint-08a-provider-legacy-inventory.md`.

Read-only aggregate confirmation immediately before local implementation found zero legacy close receipts, zero legacy idempotency rows, one active `historical_paid_backfill` capacity row with null expiry fields, and an exact non-null Session binding to one coherent paid intent/order graph. Queue state consisted only of accepted-predecessor-compatible `awaiting_payment` and `paid_ready` rows. No identifiers, content, or customer values were retained in the evidence.

SN08A is local/synthetic only. No Supabase DDL, migration ledger entry, Stripe/Vercel/mail mutation, deployment, push, or other provider change is performed or credited. Hosted application remains a separately gated SN08 action after acceptance of the immutable RC.2 candidate.
