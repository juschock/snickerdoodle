# Snickerdoodle sandbox readiness receipt — 2026-09-03

Status: `HOLD`. This is a secret-free sandbox readiness record for the exact candidate below. It is not a live-production launch receipt.

## Machine-readable decision record

```text
SNICKERDOODLE_SANDBOX_RECEIPT_SCHEMA=1
CLASSIFICATION=HOLD
RECORDED_AT_UTC=2026-09-03T04:36:28Z
CANDIDATE_COMMIT=2545aac0790565806112ed744bc0079724c268f5
CANDIDATE_TREE=2383747f3e0864152b7ff7386326a4f0c9a9d729
APP_DEPLOYMENT_ID=dpl_En13aYDccEprr1q6VnoHCZqW2fit
APP_EXPECTED_ALIAS=https://snickerdoodle-sandbox-joshuauschock-gmailcoms-projects.vercel.app
INGRESS_DEPLOYMENT_ID=dpl_Fr1e5Q6gzQgfBn9uHXEMSvscRVnt
INGRESS_EXPECTED_ALIAS=https://snickerdoodle-webhook-ingress-sandbox.vercel.app
SUPABASE_PROJECT_REF=iybwbnabyphpzlmzypga
STRIPE_MODE=test
STRIPE_SANDBOX_ACCOUNT_ID=acct_1QuAMn4MU7boT10f
MIGRATION_COUNT=22
MIGRATION_LEDGER_SHA256=6e586b76e7d8efdc4a465d0f27d7bf4d4a07347af78a30a6a77490c10bb5ad0b
MIGRATION_BYTES_UNCHANGED=true
READINESS_VERIFIER_RESULT=SNICKERDOODLE_SANDBOX_READINESS_PASS schema=1 checks=75
READINESS_VERIFIER_SHA256=c3a562d18657261c91a11c8091c48ebb50cfe892f3e2bbedd56b9043a648cc02
APP_PREVIEW_SSO_PROTECTED=true
INGRESS_ONLY_PUBLIC_SURFACE=true
OWNER_AAL2_PROOF=not_run
CUSTOMER_TWO_ISOLATION_PROOF=not_run
DUPLICATE_REPLAY_PROOF=pass
FAILED_OR_EXPIRED_PROOF=not_run
PAID_BRIEF_PROOF=not_run
FULFILLMENT_CLOSE_PROOF=not_run
CLEANUP_PROOF=not_run
INCIDENT_RESPONSE_DRILL=not_run
LIVE_STRIPE_PROVEN=false
PUBLIC_PRODUCTION_PROMOTION_PROVEN=false
HOSTED_DESTRUCTIVE_RESTORE_PROVEN=false
PRODUCTION_MAIL_MONITORING_PROVEN=false
FINAL_DECISION=HOLD
```

The `false` and `not_run` values are deliberate release holds. The completed baseline and duplicate replay do not establish a two-customer, hosted-owner, fulfillment, cleanup, live-payment, public-launch, mail/monitoring, or hosted-restore result.

## Candidate and environment identity

| Field | Proven evidence |
| --- | --- |
| Candidate | Commit `2545aac0790565806112ed744bc0079724c268f5`; tree `2383747f3e0864152b7ff7386326a4f0c9a9d729` |
| Protected app deployment | `dpl_En13aYDccEprr1q6VnoHCZqW2fit`; READY Preview; Node 22; source is the candidate above; Vercel SSO protected |
| Protected app alias | `https://snickerdoodle-sandbox-joshuauschock-gmailcoms-projects.vercel.app` — origin only |
| Public ingress deployment | `dpl_Fr1e5Q6gzQgfBn9uHXEMSvscRVnt`; isolated sandbox webhook ingress |
| Public ingress alias | `https://snickerdoodle-webhook-ingress-sandbox.vercel.app` — origin only and the only intentionally public sandbox surface |
| Supabase | Project `iybwbnabyphpzlmzypga`; `us-east-2`; PostgreSQL `17.6.1` |
| Stripe sandbox | Test account `acct_1QuAMn4MU7boT10f`; product `prod_VBgO5qK1uoS0hz`; one-time $99 USD price `price_1UBJ1m4MU7boT10fhU1VoOZm`; seven-event endpoint `we_1UBJ4L4MU7boT10f6cOS5XqU` |
| Migrations | 22 SQL migrations; local aggregate ledger SHA-256 `6e586b76e7d8efdc4a465d0f27d7bf4d4a07347af78a30a6a77490c10bb5ad0b`; unchanged by this candidate |
| Git custody | Clean before and after the read-only verification and browser proofs; creation of this receipt is the only expected new working-tree path |

No credential, customer email, private link, event payload, card data, or preview-bypass material is recorded here.

## Read-only boundary verification

The exact candidate was built before the following no-bypass probe:

```sh
node scripts/verify-sandbox-readiness.mjs \
  --app-url https://snickerdoodle-sandbox-joshuauschock-gmailcoms-projects.vercel.app \
  --expected-app-alias https://snickerdoodle-sandbox-joshuauschock-gmailcoms-projects.vercel.app \
  --ingress-url https://snickerdoodle-webhook-ingress-sandbox.vercel.app \
  --expected-ingress-alias https://snickerdoodle-webhook-ingress-sandbox.vercel.app
```

Exact result:

```text
SNICKERDOODLE_SANDBOX_READINESS_PASS schema=1 checks=75
```

Verifier SHA-256: `c3a562d18657261c91a11c8091c48ebb50cfe892f3e2bbedd56b9043a648cc02`.

The verifier observed the protected app SSO boundary without a bypass; app-layer manager health, invite, and fulfillment 401 and 405/`Allow` boundaries in a sanitized local production build; private security headers; ingress root 404; webhook GET 405; and unsigned webhook POST failure. It received no auth token and performed no invite, Stripe, Supabase, or database mutation.

## Candidate validation evidence

| Check | Result |
| --- | --- |
| Focused fulfillment and proxy tests | PASS, 28/28 |
| Full Vitest suite | PASS, 31 files and 188/188 tests |
| ESLint | PASS |
| Next type generation and TypeScript | PASS |
| Default production build | PASS, 24 routes including `/api/manager/fulfillment` |
| Gate-true/hold production build | PASS, the same 24 routes |
| Main Chromium browser matrix | PASS, 6/6, including public routing, synthetic private-intake flow, mobile layout, accessibility, and manager password/TOTP boundary |
| Closed-state Chromium matrix | PASS, 3/3, including fail-closed APIs and accessibility |
| Readiness verifier | PASS, 75 checks |
| Secret scan | PASS, full Git history and current candidate working tree, 0 findings |

These are local and boundary checks. The browser manager journey uses synthetic responses and does not prove a hosted owner session or hosted fulfillment transition.

## Signed provider and customer proofs

The completed provider evidence below is derived from `docs/customer-readiness/sn08c2-sandbox-provider-canary-receipt-2026-09-02.md`. No customer identity or private payload is repeated.

| Proof | Status | Secret-free evidence |
| --- | --- | --- |
| Baseline synthetic customer | PASS | This is Customer A for the present readiness sequence and is labeled Customer B in the source receipt. One test-mode Checkout completed paid at 9900 USD. The resulting graph contains one paid checkout intent, one active reservation, one processed webhook receipt, exactly one order, one Stripe-event row, one paid-brief row, one `paid_ready` manager-queue item, and zero open reconciliation alerts. |
| Second distinct customer | `not_run` — HOLD | No second independent hosted Checkout and order graph has been exercised for this candidate. |
| Cross-customer isolation | `not_run` — HOLD | Two distinct hosted customers are required before A/B isolation can be evaluated. |
| Duplicate delivery | PASS | Automatic provider retry recovered with HTTP 200; one approved replay also returned HTTP 200. The durable receipt attempt count became 2, while order, Stripe-event, and paid-brief cardinality remained one. No second payment, access, queue, or fulfillment effect was observed. |
| Failed or expired checkout | `not_run` — HOLD | The recovered webhook-delivery failure is not a failed-or-expired Checkout proof. No unpaid/expired hosted journey and safe fresh-link retry has been completed. |
| Owner AAL2 and paid brief | `not_run` — HOLD | Local authorization tests pass, and the hosted profile/factor preconditions exist, but no real hosted AAL2 owner queue/paid-brief read has been exercised. |
| Fulfillment and idempotent close | `not_run` — HOLD | The candidate route and all three allowlisted transitions pass local tests. No hosted owner start, deliver, close, or repeated-close exercise has run. |
| Cleanup | `not_run` — HOLD | Read-only preflight identified exactly one true stale intent older than 48 hours with no order and no provider session. If authorized, the existing routine would also prune two rate-counter rows and five completed cron-run rows; the preflight showed no customer, payment, receipt, order, event, paid-brief, queue, or privacy evidence deletion. The routine has not run. |

## Aggregate payment health

The owner-only hosted health view has not been exercised. No aggregate result is inferred from the cleanup preflight.

```text
status=not_run
generated_at=not_run
webhook_receipts_24h=not_run
failed_webhook_receipts_24h=not_run
stuck_webhook_receipts=not_run
stale_unpaid_checkout_intents=not_run
paid_checkout_intents_without_order=not_run
paid_stripe_orders_without_intent=not_run
paid_stripe_orders_without_event=not_run
processed_stripe_events_without_paid_order=not_run
attention_reasons=owner AAL2 hosted health proof required
```

The read-only cleanup preflight's one stale unpaid candidate is pending operational attention. It is not silently classified as healthy and has not been mutated.

## Incident response drill

```text
scenario=not_run
detection_time=not_run
operator_role=not_run
reviewer_role=not_run
checkout_hold_decision=not_run
evidence_preservation=not_run
secret_and_pii_hygiene=not_run
recovery_or_fail_closed_result=not_run
post_exercise_verifier=not_run
post_exercise_health=not_run
reopen_decision=HOLD
```

No incident-response drill result is claimed from the passive readiness verification.

## Release boundary attestations

- [x] The human app remained behind Vercel SSO during the recorded boundary exercise.
- [x] No preview bypass, query secret, path exception, or public human-app route was used.
- [x] The webhook ingress was the only intentionally public sandbox surface.
- [x] The recorded provider webhook used raw-body signature verification and the existing fixed payment RPC boundary.
- [x] No migration, grant, policy, RPC, or database privilege changed; all 22 migration bytes match the recorded ledger.
- [x] The recorded duplicate replay caused no duplicate payment or order effect.
- [ ] Two-customer isolation has not run; cross-customer isolation is not attested.
- [x] No live Stripe object, secret, charge, refund, or webhook changed in this tranche.
- [x] No public production promotion, DNS change, or real-customer intake occurred.
- [x] No destructive hosted restore occurred; production RPO/RTO remains unproven.
- [x] Production mail delivery and monitoring response remain unproven.

## Decision

Final classification: `HOLD`.

Active owner role/date: `not_run — HOLD`.

Independent reviewer role/date: `not_run — HOLD`.

Open gates: second distinct customer and isolation; failed/expired Checkout; hosted owner AAL2 health and paid-brief access; hosted fulfillment and repeated close; authorized cleanup and post-cleanup health; incident-response drill; production mail/monitoring; live Stripe; public production promotion; hosted destructive restore/RPO/RTO; tax, legal, retention, and real-customer approvals.

This receipt authorizes no new action. Live Stripe, public production promotion, hosted destructive restore, production mail/monitoring, and real-customer operation remain unproven and held.
