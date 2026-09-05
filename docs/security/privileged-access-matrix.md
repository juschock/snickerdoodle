# Snickerdoodle privileged access matrix

Status: SN Sprint 04 local candidate. This is a database-boundary contract,
not hosted Supabase evidence. `owner`, `service_lead`, and
`assigned_reviewer` are application roles proven from `public.profiles` and
live order assignments; they are not PostgreSQL login roles or trusted JWT
labels.

## Role and assurance rules

| Actor | Identity source | Minimum assurance | Scope |
| --- | --- | --- | --- |
| anon | PostgreSQL `anon` | none | no application tables or elevated RPCs |
| ordinary authenticated | `auth.uid()` plus live `auth.sessions` row | AAL1 | no manager, assignment-admin, payment-internal, or direct-table access |
| owner | active `profiles.role = owner` plus live session | AAL2 for manager, paid brief, assignment admin, payment health, and owner fulfillment | portfolio-wide only through named RPCs |
| service lead | active profile plus active, unexpired `service_lead` assignment | live session; AAL1 accepted | assigned order only; raw engagement read, workspace work, fulfillment |
| assigned reviewer | active profile plus active, unexpired `assigned_reviewer` assignment | live session; AAL1 accepted | assigned order sanitized workspace; QA/review work items only |
| backend | server-held Supabase secret/service role | server boundary | named intake, rate-limit, Checkout, webhook, reconciliation RPCs only |

Email, display name, global `profiles.role`, client IDs, `user_metadata`, and
caller-supplied role claims never create engagement authority. Every sensitive
browser RPC rechecks the live session and database row at action time.

## Data objects

`Direct` describes grants to `anon`/`authenticated`. All listed tables have
RLS enabled; `RPC only` means browser table DML is revoked and the named RPC is
the sole application path.

| Objects | Direct | Owner | Service lead | Reviewer | Backend | Boundary |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | deny | internal predicates/admin workflow only | own identity is not a content grant | same | Auth trigger | no browser DML |
| `accounts`, `contacts`, `campaigns`, `orders` | deny | manager/paid-brief RPC projections | `read_service_lead_engagement` for assigned order | no raw rows | payment graph transaction | account/campaign/contact IDs are resolved from the locked order |
| `briefs` | deny | `read_owner_paid_brief`, AAL2 and paid exact intent | assigned-order raw read through service-lead RPC | no raw brief; sanitized workspace only | payment graph transaction | no ID-only or global staff access |
| `internal_notes`, `activity_events` | deny | internal/manager workflows | assigned-order scoped read; fulfillment writes fixed metadata | no raw notes | payment/fulfillment fixed metadata | audit message/payload is code-controlled |
| `pending_intakes` | deny | privacy-safe manager projection | deny | deny | select/insert/update for intake route | raw intake stays backend-only |
| `engagement_assignments` | deny | `manage_engagement_assignment`, AAL2 | current assignment only through RPC predicates | same | deny | order lock, active profile, expiry, idempotency, handoff |
| `engagement_work_items` | deny | no general direct access | assigned order; all allowed work types | assigned order; QA/review types only | deny | optimistic lock and per-actor idempotency |
| `checkout_intents`, `stripe_checkout_reservations` | deny | queue/paid-brief projections | deny | deny | server insert/read plus named lifecycle RPCs | intent/session uniqueness and exact server binding |
| `stripe_events`, `stripe_webhook_receipts` | deny | aggregate health/queue projections only | deny | deny | `process_stripe_payment_event` | signed webhook route; event/session/payment uniqueness |
| `private.payment_reconciliation_alerts` | deny | six-field alert review and eligible unpaid-expiry acknowledgment through named AAL2 RPCs | deny | deny | payment RPC internals | no provider payload or customer content; acknowledgment changes alert metadata only |
| rate-limit tables | deny | deny | deny | deny | named rate-limit RPCs | HMAC digests and bounded counters only |
| manager queue and access receipts | deny | queue and reconciliation RPCs, AAL2 | deny | deny | trigger/internal sync | queue is metadata-only; access and immutable alert-resolution receipts record bounded actor/count/time metadata |
| engagement audit/idempotency receipts | deny | internal only | internal only | internal only | internal only | metadata hashes/IDs only; no brief, email, payload, token, or secret columns |
| fulfillment idempotency | deny | wrapper, AAL2 | assigned-order wrapper | deny | deny | per-key order/event binding, locked SN03 transition |

## RPC and routine disposition

There are 37 `SECURITY DEFINER` routines after the owner-expiry reconciliation migration. All 37 pin
`search_path = ''`; all referenced application relations/routines are schema
qualified; none is executable by `anon` or PostgreSQL `PUBLIC`.

Authenticated elevated surface (exactly thirteen routines):

| RPC | Authorization inside function | Result scope |
| --- | --- | --- |
| `execute_privacy_request` | live active owner + AAL2; previously verified exact request | executes one bounded privacy action with idempotency and audit receipts |
| `manage_engagement_assignment` | live active owner + AAL2 | one order/role/subject; denial is audited |
| `payment_operations_health` | live active owner + AAL2 | aggregate counts only |
| `read_intake_manager_queue` | live active owner + AAL2 | keyset metadata feed |
| `read_owner_paid_brief` | live active owner + AAL2 | exact paid intent/order |
| `read_owner_reconciliation_alerts` | live active owner + AAL2 | exactly six metadata-only fields for open alerts, newest first |
| `read_privacy_export` | live active owner + AAL2; exact unexpired export request | exact approved export artifact with retrieval audit |
| `read_engagement_workspace` | live active assignment | exact order sanitized work items |
| `read_service_lead_engagement` | live active service-lead assignment | exact order/customer brief graph |
| `resolve_owner_expired_checkout_alert` | live active owner + AAL2; exact intent/session/processed-receipt revalidation, occurrence guard, and idempotency | acknowledges one eligible unpaid expiry; mutates only alert metadata and an immutable metadata receipt |
| `write_engagement_work_item` | live active assignment and role/type rule | exact order/item with optimistic lock |
| `transition_order_fulfillment` | owner+AAL2 or live assigned service lead | exact paid order; denial audited; SN03 atomic body |
| `verify_privacy_request` | live active owner + AAL2; exact candidate subject binding | verifies one privacy request with idempotency and audit receipts |

Backend elevated surface: `consume_intake_rate_limit`,
`consume_checkout_rate_limit`, `reserve_stripe_checkout_capacity`,
`bind_stripe_checkout_capacity`, `resolve_stripe_checkout_setup`,
`compensate_stripe_checkout_setup`, and `process_stripe_payment_event` are
`service_role` executable. The event wrapper serializes only matching local
Checkout intent IDs before entering the unchanged SN03 transaction; unrelated
customers remain concurrent. Historical low-level payment functions remain in
the catalog for reproducible migrations but have owner-only ACLs and are not
application capabilities.

All `private.*` elevated functions, the four SN04 internal implementations,
queue trigger functions, cleanup, and audit writers have owner-only EXECUTE.
Trigger invocations are attached to exact tables; they are not Data API RPCs.

## Deny and revocation behavior

- Assignment expiry, revoke, end, profile deactivation, session deletion, and
  reassignment are rechecked from authoritative rows on every call.
- Reassignment ends the predecessor before the successor is inserted under
  the established profile/order/idempotency lock order. The predecessor has no
  residual workspace or fulfillment access.
- Wrong order/account/contact/campaign IDs cannot replace the order-derived
  graph. Unauthorized workspace calls return no content; unauthorized
  fulfillment returns `authorization_denied` without locking or mutating the
  order and leaves a metadata-only receipt.
- Caller search paths cannot resolve application objects because every
  elevated routine has an empty path and qualified references.
- Hosted Auth session revocation, provider default privileges, PostgREST
  schema exposure, and Supabase Security Advisor remain hosted-only gates.
