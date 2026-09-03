# Snickerdoodle payment incident response

Status: sandbox operations runbook. This document does not authorize a live Stripe action, a public production promotion, or a destructive hosted restore.

## Safety boundary

When payment integrity, customer isolation, or webhook authenticity is uncertain, stop new checkout before investigation. An authorized operator may set `SNICKERDOODLE_PAYMENTS_ENABLED=false` in the affected app environment and deploy that configuration. Keep the signed webhook ingress available when its signature and database boundaries remain trustworthy so provider truth can continue to reconcile.

Do not delete provider events, payment receipts, checkout intents, orders, or recovery evidence. Do not roll the database backward to erase Stripe truth. Never place a preview-bypass token, webhook secret, service-role key, customer email, payment identifier, or private survey token in a URL, command transcript, ticket, or receipt.

The public sandbox surface is limited to the webhook ingress. The human app remains behind Vercel SSO until a separate production-promotion authorization is recorded.

## Severity and first response

| Class | Examples | Required first response |
| --- | --- | --- |
| Critical integrity or privacy | unsigned request accepted; wrong Supabase or Stripe mode; cross-customer disclosure; duplicate financial or fulfillment effect; secret or customer data exposed | Disable new checkout, preserve webhook handling only if trustworthy, restrict access, preserve evidence, and hold all fulfillment and promotion. Escalate immediately to the active owner and affected provider. |
| Paid-customer obligation | Stripe says paid but order/brief/access is missing; webhook is failed or stuck; refund or dispute | Disable new checkout if the condition is systemic. Reconcile the exact Stripe event, Checkout Session, PaymentIntent, local receipt, intent, and order. Resolve the customer obligation before reopening. |
| Operational degradation | stale unpaid intents; cleanup overdue; mail unavailable; monitoring gap; provider outage without integrity loss | Mark `attention_required`, stop the affected operation, preserve records, and investigate the smallest affected boundary. Do not describe this as healthy. |

All open webhook and paid-order exceptions receive same-day human review. No severity label permits bypassing AAL2, widening database grants, making the preview public, or changing live provider state.

## Triage sequence

1. Record the UTC detection time, sandbox environment identity, candidate commit/tree, app and ingress deployment identifiers, Supabase project reference, and Stripe sandbox account identifier. Record identifiers only where access is restricted; never record secrets or customer content.
2. Run the read-only verifier from the exact built candidate. It uses no bypass credential and performs no provider or database mutation:

   ```sh
   node scripts/verify-sandbox-readiness.mjs \
     --app-url "$SNICKERDOODLE_SANDBOX_APP_URL" \
     --expected-app-alias "$SNICKERDOODLE_EXPECTED_APP_ALIAS" \
     --ingress-url "$SNICKERDOODLE_SANDBOX_INGRESS_URL" \
     --expected-ingress-alias "$SNICKERDOODLE_EXPECTED_INGRESS_ALIAS"
   ```

   A valid result is exactly one `SNICKERDOODLE_SANDBOX_READINESS_PASS` line. The four variables above contain non-secret origin URLs only. Do not add query parameters.
3. In the manager console, use an active owner session at AAL2 to inspect aggregate payment health. Any failed/stuck receipt, stale unpaid intent, or inconsistent paid graph is `attention_required`.
4. Compare provider truth to database truth without changing either: Stripe event and delivery status; Checkout Session; PaymentIntent; webhook receipt; checkout intent; order; brief-access and fulfillment state. The fixed `public.process_stripe_payment_event(...)` boundary remains authoritative for state transition.
5. Preserve a secret-free incident receipt before correction. Obtain a second human review for any production-bound decision.

## Incident playbooks

### Protected app becomes public or an alias changes

- Hold checkout and do not distribute the alias.
- Restore Vercel SSO protection to the entire human app. Do not create a path exception or use a bypass token.
- Confirm the exact expected alias and deployment identity, then rerun the verifier.
- Reopen only after the unauthenticated app returns the trusted Vercel SSO boundary and manager routes remain 401/405 with private security headers in the exact local build.

### Webhook authentication or ingress routing fails

- If any unsigned request reached business logic, treat it as a critical integrity incident and hold checkout and fulfillment.
- Confirm the ingress root is 404, webhook GET is 405, and an unsigned POST fails closed. Do not replay a fabricated signed event.
- Inspect the matching Stripe sandbox delivery and the stored webhook receipt. Never copy a signing secret or a URL containing credentials.
- Keep retries enabled only when the ingress still verifies the raw request body and the database target is the expected sandbox project.
- Reopen after a newly signed sandbox delivery succeeds once and a duplicate delivery has no duplicate financial or fulfillment effect.

### Failed or stuck receipt; paid event without a complete order graph

- Pause new checkout if more customers could be affected.
- Reconcile the event, Checkout Session, PaymentIntent, receipt, intent, order, and brief-access record by provider identifier and correlation ID.
- Do not mark an order paid from a browser return. Provider and signed-webhook truth control payment state.
- Use provider retry/replay only under active owner supervision and capture before/after aggregate counts. Never manufacture an event or mutate a receipt to force success.
- Reopen after payment health shows no failed/stuck receipt and no paid graph inconsistency, the paid brief is accessible only to its intended customer, and fulfillment advances exactly once.

### Stale unpaid or expired checkout

- Treat stale unpaid checkout intents as `attention_required`, not proof of a broken payment system.
- Confirm Stripe remains unpaid/expired and that no order or paid access exists.
- Run only the documented cleanup path under active-owner supervision. Capture counts, not customer payloads. Do not enable an unreviewed cron or delete paid evidence.
- Reopen after retry/expiry behavior is idempotent and a fresh private link can complete without binding to another survey.

### Duplicate, replay, or terminal-state race

- Hold fulfillment for the affected order.
- Compare receipt attempts and terminal state; do not delete the duplicate receipt.
- Confirm repeated delivery changes no amount, ownership, paid state, queue cardinality, or fulfillment state after the first valid transition.
- Reopen only when the duplicate/replay proof and terminal-race proof both pass for the candidate.

### Wrong environment, live mode, or provider identity

- Stop immediately. Do not send another request.
- Confirm sandbox Stripe mode/account, sandbox Vercel aliases/deployments, and exact Supabase project reference without printing credentials.
- Treat any live Stripe object or wrong-project write as a separately governed incident. This runbook does not authorize reversal, refund, deletion, or migration.
- Reopen sandbox only after identity is corrected and the complete two-customer canary is repeated.

### Cross-customer, owner, or AAL2 boundary failure

- Hold checkout, manager actions, and fulfillment. Preserve access logs without copying private intake content.
- Confirm customer A cannot use customer B's private link, brief, order, or delivery identity and vice versa.
- Confirm manager health, queue, assignment, invite generation, and close actions require an active owner at AAL2. Revoked or AAL1 sessions must fail.
- Reopen only after isolation, assignment, revocation, paid-brief, and exact-once fulfillment checks pass for two independent sandbox customers.

### Fulfillment or close fails

- Do not create a second order or manually rewrite payment state.
- Preserve the paid order and current queue state. Verify the assigned reviewer and AAL2 owner boundary.
- Retry only the documented idempotent fulfillment transition. Confirm a second close has no second effect.
- Reopen after the intended package is associated with the correct paid customer and all queue/health exceptions are resolved.

### Secret, token, PII, or private intake exposure

- Hold checkout and access to the affected surface. Do not paste exposed material into an incident receipt.
- Rotate the affected provider secret through the provider's approved control plane; invalidate leaked private links where supported; preserve a redacted timeline.
- Run the full history, working-tree, and staged secret scans. Inspect Vercel logs and stored receipts for payload leakage using restricted access.
- Reopen only after rotation, containment, no further exposure, privacy review, and clean scans. A leaked preview-bypass URL is never reusable.

### Stripe, Supabase, Vercel, mail, or monitoring outage

- Stop the operation whose provider truth cannot be established. Keep unaffected read-only surfaces private.
- Prefer provider retry and forward recovery; do not broaden grants, bypass auth, or make the app public.
- Mail failure does not change payment truth. Preserve the paid obligation and contact the customer through an approved channel only after identity is verified.
- Reopen after provider health, the readiness verifier, payment aggregate health, and the affected end-to-end sandbox path all pass.

### Backup or restore incident

- Do not run a destructive hosted restore under this runbook.
- Use `docs/recovery/launch-recovery-runbook.md` and a separately authorized restore plan. Reconcile Stripe/provider truth after database recovery.
- A local PG17 restore rehearsal is evidence for code and schema behavior only. It does not prove hosted RPO, hosted RTO, or production restoration.

### Refund, dispute, or customer complaint

- Preserve the event and order graph and suspend fulfillment where appropriate.
- Escalate the monetary decision to the authorized owner. Do not issue a live or sandbox refund solely from this runbook.
- After an authorized provider action, require the signed event to reconcile through the normal idempotent path and retain the customer-obligation record.

## Reopen and promotion gates

Sandbox checkout may reopen only when all affected incident conditions are closed, the verifier passes, aggregate health has no unexplained exception, the two-customer isolation canary passes, duplicate and failed/expired paths pass, AAL2 owner paid-brief and fulfillment-close proofs pass, and cleanup leaves paid evidence intact.

Sandbox operational pass is not launch authorization. The following remain explicit holds until separately exercised and approved:

- live Stripe configuration, webhook, charge, refund, dispute, or monetary canary;
- public production promotion, DNS publication, or removal of Vercel SSO;
- hosted destructive restore, measured production RPO/RTO, and post-restore provider reconciliation;
- production mail delivery and monitoring response;
- tax, legal, retention, and real-customer-data decisions.

Record each exercise in `docs/operations/SANDBOX_READINESS_RECEIPT_TEMPLATE.md`. If any required field is unknown, the classification remains `HOLD`.
