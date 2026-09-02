# Snickerdoodle non-payment data unit

**Evidence date:** 2026-08-29
**Source:** branch `agent/snickerdoodle-stripe-checkout`, base `5aaecb0491065d14814970a5ca871b68da484cb1` plus preserved dirty candidate
**Disposable target:** local Supabase/Postgres only; deterministic synthetic identities; no real/customer data
**Disposition:** `CONDITIONAL / LOCAL`; not a release, deployment, commercial, real-data, collaborator-access, or payment approval

## Canonical packet reconciliation

The canonical governance packet remains directionally correct, with these source-bound updates:

- The reconstructed foundation plus all five recorded remote-ledger migrations now replay successfully from empty twice in disposable Supabase/Postgres 17. Both schema-only fingerprints were `d2f49961ed5dc781ff72dd7b3f2582abc65961bf381d18bd2bc55369810a60b0`. This advances only `DB-02`; it does not prove production-like predecessor upgrade, backup restore, hosted binding, RPO/RTO, or production safety.
- The owner-serialization SQL remains unapplied to Supabase. Before it, a disposable two-owner race allowed both demotions to commit and produced zero active owners. The final local digest `975ba25c73efe71d3544029b41fc666943528866f165de6a4a7bdfec299a8bd2` then received three fresh independent PASS reviews and was applied only to the disposable target. The same two-owner race left one owner, stronger-isolation/last-owner cascade-delete/multi-row cases failed closed, zero-row contention returned immediately, and PUBLIC/anon trigger-function execution was absent. This advances `TEN-07` and `INT-03` only for the exact local target; production remains unapplied.
- The permanent owner-protection review chronology is: `7cc98a...` vetoed for cutover/row-lock ordering; `c5b996...` vetoed for stronger-isolation behavior, unbounded waiting, and its lock cycle; `2b6fa0...` vetoed for a `DROP TRIGGER` access-exclusive lock upgrade; exact final `975ba25c...a8bd2` triple-PASS only for isolated disposable-local application. Any material SQL edit resets the review to zero. This record gives no production/remote application, production-like replay/restore, hosted, release, payment, collaborator, G5, or external credit.
- Payment is absent from the web runtime. Exact local migration `8c12c541...2953f` now revokes application/service-role access to payment-era tables and routines and disables the named cleanup Cron on the disposable target. Historical payment rows/columns remain preserved for reversibility, and production remains unchanged, so payment `NOT_APPLICABLE` is proven only for the exact local web-plus-data candidate—not for hosted Supabase.
- No AI/model SDK, provider key, provider request, upload route, file input, or object-storage call exists in the candidate application. `tests/non-payment-boundary.test.ts` makes that narrow current-candidate assertion executable. Any added SDK, key, request, upload, storage path, or AI/provider flow invalidates it immediately.
- The exact local candidate now has an explicit engagement-assignment lifecycle for `service_lead` and `assigned_reviewer`. Standing active-staff content policies and direct application-role operational grants are removed; global `operator`/`reviewer`, historical `orders.assigned_reviewer_id`, email/name, future-role claims, and caller-supplied order IDs do not grant authority. Hosted Supabase remains on the five-ledger predecessor and receives no credit.
- The public hosted surface remains stale and contradictory; `CAND-03`, `LEGAL-02`, `MKT-01`, `MKT-05`, and `MKT-06` remain blocked even when the local candidate is truthful.

## Exact implemented two-role database matrix

These are assignment labels only. No collaborator identity, relationship, availability, compensation, authority, or access is recorded or inferred. An active owner is the assignment authorizer; an assignee with `service_lead` or `assigned_reviewer` needs an active profile but does not need, acquire, or imply owner/admin status. The planning expectation that the CEO may fill the service-lead role is not an authorization rule and is not encoded in the database.

| Action/data | `service_lead` assignment | `assigned_reviewer` assignment |
| --- | --- | --- |
| View or disposition `pending_intakes` | Denied/unimplemented as an assignment-scoped operator action; the separate server-only `service_role` intake path is not role authority | Denied |
| Assign, revoke, expire, or hand off an engagement role | Denied by this role alone; the audited management RPC separately requires a live active-owner caller | Denied |
| View sanitized brief, fact ledger, draft, QA checklist, and review comments | Allowed only during a live assignment to that order | Allowed only during a live assignment to that order |
| View order, account, campaign, primary-contact, and raw order-brief projection | Allowed only during a live service-lead assignment to that order | Denied |
| Create/update sanitized brief, fact ledger, draft, QA checklist, or review comment work items | Allowed only during a live assignment to that order | Limited to QA checklist and review comment work items during a live assignment |
| Approve claims, delivery, revision acceptance, or business closure | Not implemented as database authority; any work-item content remains subject to retained gates | Not implemented as binding authority; QA/comment records cannot bind a customer or Racoben |
| Send/publish, operate customer/social/email/provider account, upload customer data, or call AI/provider | Denied in this candidate | Denied |
| Price, payment, refund, tax, webhook, entitlement or reconciliation action | Denied in this candidate | Denied |
| Staff/account/security settings, secrets, integration configuration, export/delete/legal hold | Denied by assignment; broader owner administration remains a separately approved case outside this unit | Denied |
| Access after assignment expiry, revoke, or handoff | Denied at the next action-time check | Denied at the next action-time check |

The local implementation uses opaque profile/order UUIDs, role, grant window, lifecycle/end metadata, authorizing owner, predecessor linkage, live `auth.sessions` validation, and action-time assignment/profile/session locks. Audited SECURITY DEFINER RPCs expose the reviewer only to workspace items and restrict reviewer writes to QA checklists/comments; the service lead alone can read the raw order engagement projection. The separate `pending_intakes` table has no order-assignment relationship and no assignment-scoped disposition RPC. An order status change also does not automatically revoke an assignment; the active-owner management RPC must revoke, expire, or hand it off. Those operator-journey integrations remain `PARTIAL`/HOLD. Profile onboarding/activation remains an external administrator ceremony under HARD HOLD. A personal name or relationship is neither necessary nor permitted in governance evidence.

## Exact local ORD-03 evidence

- Migration SHA-256: `8c12c5413d103b0d55fc2a324fcc19d0f9152f270e809fb70d6eec7babe2953f`; three independent PASS reviews before disposable execution.
- Deterministic fixtures: six `.example.invalid` Auth identities, two fictional accounts/contacts/campaigns/orders/briefs, zero real/customer data.
- Core harness: `scripts/db/ord03-acceptance.sql` covers grant/replay/conflict, same/cross/unassigned/dual-role behavior, reviewer scope, optimistic updates, inactive-subject revoke, handoff, deleted/mismatched session, expired JWT, assignment expiry persistence, stronger-isolation denial, ACLs, payment/Cron closure, storage absence, and audit reconstruction.
- Concurrency harness: `scripts/db/ord03-concurrency.sh` covers actual profile-update lock contention, per-order contention, duplicate-work contention, and conflicting assignment serialization without deadlock.
- Replays: two reviewed build-ups produced the same app-schema fingerprint, `a93845a31415876e37356a0ca1cde376f0bb83d3384c10c5d0ad51fea6905c7c`.
- Portable restore: the six-ledger pre snapshot restored without assignment objects; the eight-ledger post snapshot restored assignments, work items, audit receipts, and only synthetic identities. Managed role owners/default ACLs were excluded after an Auth role-owned default-privilege restore failed closed, so hosted role/ACL recovery remains unproven.
- Boundary: local Postgres policy/lock behavior is proven. Real Supabase Auth issuance/logout traffic, hosted function ownership/BYPASSRLS, production data, remote application, and provider read-back remain `PARTIAL`/blocked.

## Acceptance status for this bounded unit

| Test | Status | Evidence or blocker |
| --- | --- | --- |
| `CAND-04` | `PROVEN` local / `PARTIAL` hosted | Payment routes are unconditional `503`; exact local migration closes historical application-role payment tables/routines/Cron. Hosted data plane remains unchanged. |
| `DB-01` | `PARTIAL` | Supabase/Postgres identified; local target is disposable, production bindings are not certified here. |
| `DB-02` | `PROVEN` locally | Two empty replays completed with the same schema fingerprint and six migration-ledger rows. |
| `DB-03` | `PARTIAL` | Isolated synthetic pre/post schema/data/ledger restores passed; no production-like predecessor snapshot or managed-role/default-ACL restore was supplied. |
| `DB-04` | `PARTIAL` | Eight-row disposable ledger, exact hashes, functions/RLS/ACL/Cron inventory, and repeatable app-schema fingerprint `a93845a...05c7c` captured. Production fingerprint remains pending. |
| `TEN-07` / `INT-03` | `PROVEN` locally / `PARTIAL` hosted | Owner migration serializes owner changes; assignment migration proves live-session deletion, assignment revoke/expiry/handoff, and profile/assignment contention locally. Production application and real hosted Auth behavior remain missing. |
| `ORD-03` | `PROVEN` local DB policy / `PARTIAL` end to end and hosted | Exact migration and deterministic core/concurrency harness pass locally. Pending-intake disposition and automatic order-close revocation are not implemented; the operator journey, real hosted Auth/session/provider behavior, and production application remain unproven. |
| `VEND-03` (AI/upload only) | `PROVEN` for exact local source | No AI/upload/provider route, SDK, key, request or storage call. Payment N/A is not claimed. |
| `MKT-06` | `PARTIAL` local / `BLOCKED` hosted | Local payment routes and CTAs are fail-closed; stale hosted copy conflicts. |
| `REC-02` / `REC-05` | `PARTIAL` | Portable schema/data/ledger rollback and recovery restores passed locally; managed owners/default ACLs, production-like data, hosted backup authority, RPO/RTO, and hostile no-egress restore remain open. |

## External actions explicitly avoided

No production Supabase query or migration, Vercel deployment, GitHub mutation, Stripe SDK/provider object, payment, account change, live invite, customer/collaborator record, upload, AI/provider call, publication, outbound message, or spend occurred in this unit.
