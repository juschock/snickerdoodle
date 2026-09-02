# Snickerdoodle customer data-subject graph

Status: SN Sprint 05 local/synthetic candidate. This is a data-control map, not a legal-retention determination or proof of hosted-provider behavior.

## Deterministic subject root

`private.normalize_privacy_email` trims and lowercases a syntactically valid email. `public.create_privacy_request` is backend-only and resolves that exact normalized value against non-anonymized `contacts`, `pending_intakes`, and `checkout_intents`. It stores resource IDs and counts, never the submitted email. One contact is resolvable; zero contacts with raw intake is `needs_review`; multiple contacts are `needs_review`; no match is `rejected`. Fuzzy, display-name, and caller-supplied graph traversal are not accepted.

## Contact-bound graph

```text
verified contact
  -> account (context; may be shared with other contacts)
  -> orders where orders.primary_contact_id = contact.id
       -> campaign
       -> brief + raw_submission_json
       -> checkout intent and reservation
       -> payment/event/reconciliation records
       -> customer-visible activity
       -> engagement work items and fulfillment state
       -> assignments and staff/auth audit references
  -> exact-email pending intake scopes
  -> exact-email checkout-intent scopes
```

The contact-to-order edge, not account membership alone, owns customer export and destructive scope. This prevents one contact in a shared account from exporting or erasing another contact's orders. An account or campaign is anonymized only when no unaffected live contact/order shares it.

## Data ownership boundaries

- Customer-owned/exportable: the verified contact's profile fields; applicable account and campaign presentation fields; their orders; briefs and raw intake; safe amount/currency/status/reference-independent payment facts; delivery state; allowlisted customer-visible activity.
- Linked but not customer-owned: staff profiles, engagement assignments, internal notes, privileged-access receipts, authorization/session evidence, and operator-only audit details. These can reference the order but are not included merely because of that reference.
- Required-evidence boundary: order/payment status and integer amounts, fulfillment lifecycle, reconciliation outcomes, assignment/action history, and metadata-only audits remain structurally coherent after anonymization.
- Never exported: raw Stripe/webhook payloads, provider object IDs, HMAC material, credentials/tokens, rate-limit internals, internal notes, staff private data, or security decision internals.

## Raw-only subjects

Pending intakes and checkout intents without a live contact are scoped only by exact normalized email. They require owner review before identity verification. Deletion can anonymize those scoped rows without manufacturing an account or contact.

## Evidence and limits

The executable corpus is `scripts/db/privacy-lifecycle-acceptance.sql`. It covers a two-order subject, a second contact in the same account, an isolated customer, and raw-only scopes. Local database policy evidence does not prove hosted identity delivery, provider backups, or secure export delivery.
