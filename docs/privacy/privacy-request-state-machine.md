# Snickerdoodle privacy-request state machine

Status: SN Sprint 05 local/synthetic candidate. Destructive execution is owner-reviewed, AAL2-gated, and database-atomic.

## States and transitions

| Current | Event / authority | Next | Effect |
|---|---|---|---|
| none | Backend creates exact-email request | `requested` | One exact non-anonymized contact resolved; IDs/counts stored, submitted email discarded |
| none | Backend creates request with duplicate contacts or raw-only matches | `needs_review` | Candidate scopes recorded; no destructive authority |
| none | Backend creates request with no match | `rejected` | Rejection timestamp/reason recorded; no mutation scope |
| `requested` / `needs_review` | Active owner + AAL2 + live session verifies an in-scope contact | `identity_verified` | Verified contact/account bound; idempotency receipt recorded |
| `identity_verified` | Active owner + AAL2 + live session executes | `processing` | Row lock acquired; typed operation begins in one transaction |
| `processing` | All operation mutations and receipts succeed | `completed` | Completion/action/audit metadata commits with the business effects |
| any execution state | Validation, authorization, or business mutation fails | unchanged by rollback | No partial export/correction/restriction/anonymization or false completion |
| `completed` | Same request/action retried | `completed` | Existing action/artifact returned; no duplicated history or mutation |

Verification is intentionally a local synthetic proof in this sprint. A hosted identity-verification and secure-delivery procedure remains a launch gate.

## Operations

- `access_export`: builds stable JSON from the verified graph, writes one private artifact with an explicit future expiry, and never mutates customer source data.
- `correction`: accepts only `contactName`, `email`, `phone`, `accountName`, and `campaignName`. Shared account names and ambiguous campaign names fail closed. Immutable payment/audit history is not rewritten.
- `restriction`: timestamps the verified contact. New pending/checkout intake for that exact email is rejected while payment reconciliation and mandatory order operations remain available.
- `deletion_anonymization`: deletes internal notes; anonymizes customer brief/work/intake/contact content; conditionally anonymizes unshared campaign/account content; redacts customer-identifying activity; preserves payment, refund/dispute, fulfillment, assignment, and metadata-only audit evidence.

## Authorization and isolation

Request creation is executable only by `service_role`. Verification, execution, and retrieval are exposed to `authenticated` solely through `SECURITY DEFINER` RPCs that re-check active owner role, AAL2, and a live Auth session at action time. Private tables have forced RLS and no direct `PUBLIC`, `anon`, `authenticated`, or `service_role` table privileges. Functions use an empty pinned `search_path` and schema-qualified objects.

Every resource ID originates from the resolver's stored scope or the verified contact graph. Caller-supplied customer IDs do not expand scope. Same-account contacts remain distinct, and operations against customer A do not read or mutate customer B.

## Artifacts and audit

Export payloads live only in `private.privacy_export_artifacts`, are bounded to 1 MiB, require authorized retrieval, and are purged after their explicit expiry. Request/action/audit records contain IDs, actor/action/time, decision, counts, and changed-field codes—never the submitted email, export payload, raw briefs, provider payloads, tokens, or secrets.

The executable specification is `scripts/db/privacy-lifecycle-acceptance.sql`; the clean 21-migration runner is `scripts/db/privacy-lifecycle-replay.sh`.
