# Snickerdoodle privacy and retention field matrix

Status: SN Sprint 05 local/synthetic candidate. No legal duration is approved or encoded. Approval-dependent policy rows are symbolic, inactive, and have no interval.

| Data class / objects | Purpose and owner | Export | Correction | Erasure action | Retention control |
|---|---|---|---|---|---|
| Contact (`contacts`: name, email, phone, role, notes) | Customer identity and order contact; product owner | Yes for verified contact | Name, exact-normalized email, phone | Replace identifiers with deterministic `.invalid` values; null optional PII; mark restricted/anonymized | `customer_content`, unapproved/inactive |
| Shared account (`accounts`: name, website, location, notes) | Customer organization context; may serve multiple contacts | Only account reached through subject-owned orders | Name only when no other live contact shares account | Anonymize only when no unaffected contact remains | `customer_content`, unapproved/inactive |
| Campaign (`campaigns`: name, action, notes) | Campaign definition and customer work context | Only campaigns reached through subject-owned orders | Name only when subject resolves to one campaign | Anonymize only when no unaffected order/contact shares campaign | `customer_content`, unapproved/inactive |
| Raw intake (`pending_intakes.brief_json`, `checkout_intents.brief_json`, `briefs.raw_submission_json` plus delivery email) | Accepted customer instructions | Yes when deterministically scoped | Email propagation where applicable | Empty JSON, replace email, expire unbound intake, mark anonymized | `pending_intake_content` / `abandoned_checkout_content`, unapproved/inactive |
| Brief normalized fields | Fulfillment instructions | Yes | Email propagation; other corrections require ordinary workflow | Null customer content, replace email, mark anonymized | `customer_content`, unapproved/inactive |
| Work product (`engagement_work_items.content_json`) | Fulfillment draft/output | Not in v1 export; customer delivery channel remains separate | Ordinary fulfillment workflow | Replace content with privacy-state marker; preserve row/lifecycle | `customer_content`, unapproved/inactive |
| Orders and safe payment facts | Contract, accounting, refund/dispute, fulfillment integrity | Amount, currency, status, timestamps | Immutable history is not rewritten | Retain structural facts; direct contact FK remains pseudonymized | `payment_accounting`, retain-required, unapproved/inactive |
| Stripe/events/receipts/reconciliation | Provider reconciliation and fraud/payment evidence | Excluded | Immutable append/transition process only | Retain narrowly required provider facts; never export raw internals | `payment_accounting`, retain-required, unapproved/inactive |
| Customer-visible activity | Explain customer/order lifecycle | Allowlisted event code and time | Immutable history | Redact message and identifying metadata; retain safe state/amount fields | `security_audit`, retain-required, unapproved/inactive |
| Internal notes | Operator-only working notes | Excluded | Operator workflow | Hard-delete when subject-owned order is deleted/anonymized | `customer_content`, unapproved/inactive |
| Assignments/staff audit | Authorization, accountability, fulfillment custody | Excluded | Immutable control process | Retain staff actor/action/time and order reference; not customer-owned | `security_audit`, retain-required, unapproved/inactive |
| Privacy requests/actions/audit | Request state, idempotency, decision reconstruction | Excluded from customer payload | Append-only action semantics | Retain metadata only; no submitted email or duplicate exported PII | `security_audit`, retain-required, unapproved/inactive |
| Export artifact payload | Temporary authorized delivery artifact | The artifact itself | Regenerate only through a new request | Purge payload at explicit per-artifact expiry | Immediate explicit expiry; no legal-duration assumption |

## Raw-intake admission

Database triggers require a JSON object of at most 64 KiB, an explicit key/type allowlist, and reject card-like values, Stripe secrets, private-key material, and credential-like assignments. Synthetic-only fixture keys are accepted only for rows whose resolved account source is `synthetic_fixture`. An anonymized row may contain only `{}`. Normalized-away unknown fields are not stored.

## Policy mechanism

`private.find_retention_candidates(as_of)` uses a caller-supplied test clock. Export expiry works immediately because each artifact has an explicit expiry. Pending-intake and abandoned-checkout policies cannot produce candidates until an authorized later migration or decision sets a non-null interval, `approval_state = 'approved'`, and `active = true`. `private.apply_retention_action` rechecks eligibility at action time and is idempotent. `pg_cron` is deliberately not a correctness dependency.

## Approval gaps

Final legal bases, durations, litigation/dispute holds, tax/accounting rules, secure hosted delivery, backup propagation, and processor-specific deletion behavior remain unresolved external/legal controls. The system therefore fails closed rather than guessing a duration.
