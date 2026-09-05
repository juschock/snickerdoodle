# Snickerdoodle sandbox readiness receipt

Copy this file for one candidate and replace every `<required>` value. Do not place secrets, private survey links, customer emails, customer payloads, payment credentials, or preview-bypass material in the receipt. An unknown or failed required field means `HOLD`.

## Machine-readable decision record

```text
SNICKERDOODLE_SANDBOX_RECEIPT_SCHEMA=1
CLASSIFICATION=<SANDBOX_OPERATIONAL_PASS|HOLD>
RECORDED_AT_UTC=<required>
CANDIDATE_COMMIT=<required>
CANDIDATE_TREE=<required>
APP_DEPLOYMENT_ID=<required>
APP_EXPECTED_ALIAS=<required-non-secret-origin-only>
INGRESS_DEPLOYMENT_ID=<required>
INGRESS_EXPECTED_ALIAS=<required-non-secret-origin-only>
SUPABASE_PROJECT_REF=<required>
STRIPE_MODE=test
STRIPE_SANDBOX_ACCOUNT_ID=<required>
MIGRATION_COUNT=23
MIGRATION_LEDGER_SHA256=<required>
MIGRATION_BYTES_UNCHANGED=<true|false>
READINESS_VERIFIER_RESULT=<exact-PASS-line-or-FAIL>
READINESS_VERIFIER_SHA256=<required>
APP_PREVIEW_SSO_PROTECTED=<true|false>
INGRESS_ONLY_PUBLIC_SURFACE=<true|false>
OWNER_AAL2_PROOF=<pass|fail|not_run>
CUSTOMER_TWO_ISOLATION_PROOF=<pass|fail|not_run>
DUPLICATE_REPLAY_PROOF=<pass|fail|not_run>
FAILED_OR_EXPIRED_PROOF=<pass|fail|not_run>
PAID_BRIEF_PROOF=<pass|fail|not_run>
FULFILLMENT_CLOSE_PROOF=<pass|fail|not_run>
CLEANUP_PROOF=<pass|fail|not_run>
INCIDENT_RESPONSE_DRILL=<pass|fail|not_run>
LIVE_STRIPE_PROVEN=false
PUBLIC_PRODUCTION_PROMOTION_PROVEN=false
HOSTED_DESTRUCTIVE_RESTORE_PROVEN=false
PRODUCTION_MAIL_MONITORING_PROVEN=false
FINAL_DECISION=<SANDBOX_GO|HOLD>
```

The invariant `false` values above are deliberate. This receipt cannot be used to claim live readiness, public launch, production mail/monitoring, or hosted restore readiness.

## Candidate and environment identity

| Field | Evidence |
| --- | --- |
| Candidate commit and tree | `<required>` |
| App deployment ID and source identity | `<required>` |
| Protected sandbox app alias | `<required; origin only, no query or fragment>` |
| Ingress deployment ID and source identity | `<required>` |
| Public sandbox ingress alias | `<required; origin only, no query or fragment>` |
| Supabase project reference and region | `<required; no credential>` |
| Stripe test-mode account, product, and price IDs | `<required; no secret>` |
| Twenty-three-migration ledger hash | `<required>` |
| Git status before and after proof | `<required>` |

Confirm that app, ingress, Stripe, and Supabase identities all name the intended sandbox system. A deployment URL alone is not release identity.

## Read-only boundary verification

Build the exact candidate first, then run:

```sh
npm run build
node scripts/verify-sandbox-readiness.mjs \
  --app-url "<sandbox-app-origin>" \
  --expected-app-alias "<same-exact-sandbox-app-origin>" \
  --ingress-url "<sandbox-ingress-origin>" \
  --expected-ingress-alias "<same-exact-sandbox-ingress-origin>"
```

Record without alteration:

```text
<SNICKERDOODLE_SANDBOX_READINESS_PASS line or failure>
```

The verifier must observe the protected app SSO boundary without a bypass, app-layer manager 401 and 405/`Allow` boundaries in the sanitized local production build, private security headers, ingress root 404, webhook GET 405, and unsigned POST failure. It must not receive an auth token, create an invite, call Stripe or Supabase, or write provider data.

## Signed provider and customer proofs

Use synthetic sandbox identities only. Keep emails, survey text, private links, card data, secrets, and event payloads out of this receipt.

| Proof | Required observations | Result and secret-free evidence |
| --- | --- | --- |
| Customer A baseline | One signed test payment yields one receipt, intent, paid order, private brief, and queue item | `<required>` |
| Customer B | Independent signed test payment yields its own one-to-one graph | `<required>` |
| Isolation | A cannot access B's brief/order/fulfillment identity; B cannot access A's | `<required>` |
| Duplicate delivery | Repeated event changes no amount, order cardinality, access, queue, or fulfillment after first effect | `<required>` |
| Failed or expired checkout | No paid order/access; documented retry or fresh-link path succeeds | `<required>` |
| Owner AAL2 | AAL1 and revoked sessions fail; active owner at AAL2 can read aggregate health and assigned paid brief | `<required>` |
| Fulfillment | Assigned owner advances the correct paid order and closes it once; repeated close has no second effect | `<required>` |
| Cleanup | Stale unpaid state is handled by the documented path; paid evidence and privacy tombstones remain | `<required>` |

Record before/after counts and hashed or provider-safe identifiers, not payloads.

## Aggregate payment health

Record the owner-only health view after the proofs:

```text
status=<healthy|attention_required>
generated_at=<required UTC>
webhook_receipts_24h=<required>
failed_webhook_receipts_24h=<required>
stuck_webhook_receipts=<required>
stale_unpaid_checkout_intents=<required>
paid_checkout_intents_without_order=<required>
paid_stripe_orders_without_intent=<required>
paid_stripe_orders_without_event=<required>
processed_stripe_events_without_paid_order=<required>
attention_reasons=<none or required explanation and incident reference>
```

Any unexplained nonzero exception keeps the receipt at `HOLD`. Stale unpaid checkout state is labeled `attention_required`; it is not silently treated as vague system breakage or as healthy.

## Incident response drill

Exercise one synthetic scenario from `docs/operations/payment-incident-response.md` without live provider state or customer data.

| Field | Evidence |
| --- | --- |
| Scenario and UTC detection time | `<required>` |
| Operator role and reviewer role | `<required; roles, not credentials>` |
| Checkout hold decision | `<required>` |
| Provider and database evidence preserved | `<required>` |
| Secret/PII hygiene confirmed | `<true|false>` |
| Recovery or fail-closed result | `<required>` |
| Readiness verifier after exercise | `<required>` |
| Aggregate health after exercise | `<required>` |
| Reopen decision and reason | `<required>` |

## Release boundary attestations

- [ ] The human app remained behind Vercel SSO for the entire exercise.
- [ ] No preview bypass, query secret, path exception, or public human-app route was used.
- [ ] The webhook ingress was the only intentionally public sandbox surface.
- [ ] All webhook business processing used raw-body signature verification and the existing fixed RPC boundary.
- [ ] No migration, grant, policy, RPC, or database privilege changed; all 23 migration bytes match the ledger.
- [ ] No duplicate payment, access, queue, or fulfillment effect occurred.
- [ ] No cross-customer disclosure or wrong-provider write occurred.
- [ ] No live Stripe object, secret, charge, refund, or webhook changed.
- [ ] No public production promotion, DNS change, or real customer intake occurred.
- [ ] No destructive hosted restore occurred; production RPO/RTO remains unproven.
- [ ] Production mail and monitoring response remain unproven unless covered by a separate accepted receipt.

## Decision

`SANDBOX_GO` requires every sandbox proof above to pass, all attestations to be checked, an exact verifier PASS, unchanged migration bytes, and no unexplained aggregate-health exception. It authorizes continued private sandbox validation only.

Final classification: `<SANDBOX_OPERATIONAL_PASS|HOLD>`

Active owner role/date: `<required>`

Independent reviewer role/date: `<required>`

Open incidents or explicit holds: `<required; write none only after review>`

The live Stripe, public production promotion, hosted destructive restore, production mail/monitoring, tax, legal, retention, and real-customer gates remain outside this receipt and unproven.
