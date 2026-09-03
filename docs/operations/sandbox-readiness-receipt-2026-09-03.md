# Snickerdoodle sandbox readiness receipt — 2026-09-03

Status: `HOLD`. Overall full-stack completion estimate: `92%`. This is a secret-free sandbox readiness record for the exact candidate below. It is not a live-production launch receipt.

## Machine-readable decision record

```text
SNICKERDOODLE_SANDBOX_RECEIPT_SCHEMA=1
CLASSIFICATION=HOLD
RECORDED_AT_UTC=2026-09-03T05:15:40Z
CANDIDATE_COMMIT=16a5d6f6183e2b5b1ba370e3b135a51050c279d8
CANDIDATE_TREE=79968008cba773da0226598e78deeeed7344002f
APP_DEPLOYMENT_ID=dpl_HdceMmAZJTR8U7ngwLTKSecWbpQ6
APP_IMMUTABLE_URL=https://campaign-ig6j35u6e-joshuauschock-gmailcoms-projects.vercel.app
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
INCIDENT_RESPONSE_DRILL=pass
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
| Candidate | Commit `16a5d6f6183e2b5b1ba370e3b135a51050c279d8`; tree `79968008cba773da0226598e78deeeed7344002f` |
| Protected app deployment | `dpl_HdceMmAZJTR8U7ngwLTKSecWbpQ6`; READY Preview; Node 22; source is the candidate above; Vercel SSO protected |
| Protected app immutable URL | `https://campaign-ig6j35u6e-joshuauschock-gmailcoms-projects.vercel.app` — exact deployment, origin only |
| Protected app alias | `https://snickerdoodle-sandbox-joshuauschock-gmailcoms-projects.vercel.app` — origin only |
| Public ingress deployment | `dpl_Fr1e5Q6gzQgfBn9uHXEMSvscRVnt`; isolated sandbox webhook ingress |
| Public ingress alias | `https://snickerdoodle-webhook-ingress-sandbox.vercel.app` — origin only and the only intentionally public sandbox surface |
| Supabase | Project `iybwbnabyphpzlmzypga`; `us-east-2`; PostgreSQL `17.6.1` |
| Stripe sandbox | Test account `acct_1QuAMn4MU7boT10f`; product `prod_VBgO5qK1uoS0hz`; one-time $99 USD price `price_1UBJ1m4MU7boT10fhU1VoOZm`; seven-event endpoint `we_1UBJ4L4MU7boT10f6cOS5XqU` |
| Migrations | 22 SQL migrations; local aggregate ledger SHA-256 `6e586b76e7d8efdc4a465d0f27d7bf4d4a07347af78a30a6a77490c10bb5ad0b`; unchanged by this candidate |
| Git custody | The deployed app identity is the exact candidate commit and tree above. Later evidence-only receipt commits do not change that deployment identity. |

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
| Full Vitest suite | PASS, 34 files and 198/198 tests |
| ESLint | PASS |
| Next type generation and TypeScript | PASS |
| Default production build | PASS, 24 routes |
| Commercial production build | PASS, 24 routes |
| Commercial Chromium browser matrix | PASS, 6/6, including public routing, synthetic private-intake flow, mobile layout, accessibility, and manager password/TOTP boundary |
| HOLD Chromium browser matrix | PASS, 3/3, including fail-closed APIs and accessibility |
| Readiness verifier | PASS, 75 checks |
| Public-polish gate coupling | PASS. One gate-driven metadata selector controls the mode; commercial homepage title, description, Open Graph, Twitter, and FAQ metadata contain no HOLD wording. Checkout success and cancel header/footer chrome uses the same readiness gate with required explicit props. |
| Authenticated exact public-detritus probes | PASS. The privacy page displayed the exact approved analytics promises, the old configuration note was absent, and checked public copy contained no development-stage terms. Robots preserved public allow while disallowing `/snickerdoodle/brief`, `/snickerdoodle/checkout`, `/snickerdoodle/manager`, and `/snickerdoodle/api`. |
| Exact hosted app probes | PASS. The immutable deployment and stable alias passed; anonymous access returned HTTP 302 at the Vercel SSO boundary; the authenticated health probe returned HTTP 200; queried runtime errors were 0. |
| Secret scan | PASS. Full-history scan covered 35 commits and the current working tree scan returned 0 findings. |
| Production dependency audit | PASS, 0 vulnerabilities |

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
scenario=unsigned_webhook_authentication_failure
detection_time=2026-09-03T04:43:26Z
exercise_start_time=2026-09-03T04:43:26Z
operator_role=Snickerdoodle primary developer
reviewer_role=Implementation: PG & SN guide
checkout_hold_decision=no_hold
checkout_hold_reason=rejected before business logic and receipt creation
detection_point=raw-body Stripe signature verification
unsigned_request=empty JSON object
unsigned_response=HTTP 400
expected_business_effect=none
evidence_scope=aggregate-only
pre_receipt_count=2
pre_latest_received_at=2026-09-02 21:30:50.045566+00
pre_failed_retryable_count=0
pre_unfinished_count=0
pre_total_attempts=3
post_receipt_count=2
post_latest_received_at=2026-09-02 21:30:50.045566+00
post_failed_retryable_count=0
post_unfinished_count=0
post_total_attempts=3
vercel_app_runtime_error_query_start=2026-09-03T04:43:20Z
vercel_app_runtime_error_query_result=none
ingress_exact_deployment_error_log_window=2026-09-03T04:43:20Z–2026-09-03T04:46:00Z
ingress_exact_deployment_error_log_result=none
secret_or_pii_exposure=false
provider_mutation=false
database_mutation=false
recovery_or_fail_closed_result=pass
post_exercise_verifier=SNICKERDOODLE_SANDBOX_READINESS_PASS schema=1 checks=75
post_exercise_health=not_run_pending_owner_aal2
reopen_decision=continue_private_sandbox
```

This `pass` is scoped only to the earlier unsigned-webhook authentication-failure exercise against the unchanged ingress. The unsigned request failed closed before business logic and receipt creation, the pre/post aggregates were identical, and no runtime or ingress error entry was found in the stated windows. It does not establish broader payment, mail, live-provider, or public-production incident readiness.

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

Open gates: second distinct customer and isolation; failed/expired Checkout; hosted owner AAL2 health and paid-brief access; hosted fulfillment and repeated close; authorized cleanup and post-cleanup health; broader payment/mail/live incident readiness; production mail/monitoring; live Stripe; public production promotion; hosted destructive restore/RPO/RTO; tax, legal, retention, and real-customer approvals.

This receipt authorizes no new action. Live Stripe, public production promotion, hosted destructive restore, production mail/monitoring, and real-customer operation remain unproven and held.
