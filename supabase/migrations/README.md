# Migration reconciliation ledger

Last reconciled against Supabase project `snickerdoodle-studio` (`iybwbnabyphpzlmzypga`): August 28, 2026.

SHA-256 values below use each SQL file with one canonical final newline. The **remote digest** was computed from the statements recorded in `supabase_migrations.schema_migrations`; the **public replay digest** is computed from this repository file.

| Version | Migration | Remote digest | Public replay digest | Reconciliation |
| --- | --- | --- | --- | --- |
| `20260714000000` | `foundational_schema` | Not present in remote ledger | See integrity test | Public-safe prehistory reconstructed from a read-only inventory of the live columns, defaults, primary keys, foreign keys, checks, delete actions, and six pre-ledger indexes. It creates the eight tables referenced by the first recorded migration, restores the live pre-ledger indexes, and enables RLS. `if not exists` makes it safe for the existing project, where these objects predated the remote migration ledger. |
| `20260714202709` | `staff_authorization` | `8dd5cd0835c1818b032bc8e80fc5cfe00d2ba39ba9a804bdda024d110a5d7f76` | `7ebcf2c69b4c76faf8754d4e93ab32f9a61a22a1d8d28736262c4972e3a37fee` | Intentional public-safe divergence: the live historical statement embedded a personal bootstrap email. The replay reads an optional transaction/session setting and publishes no personal address. The original statement text is not stored in this public package. |
| `20260714203158` | `add_foreign_key_indexes` | `34cc65628c044d3d23a539e6c6a77c637767997adcb28847f5fa1c3bb9883cc6` | `34cc65628c044d3d23a539e6c6a77c637767997adcb28847f5fa1c3bb9883cc6` | Exact match. |
| `20260714212250` | `stripe_checkout_orders` | `2d92cf603c7be7320f3fd92e78bd2f563b35be9b9ab819cb1d5973424cc2801b` | `2d92cf603c7be7320f3fd92e78bd2f563b35be9b9ab819cb1d5973424cc2801b` | Exact match. |
| `20260716020843` | `harden_public_grants` | `57fd8240aeb1e78e96e973efab05438025ba0ab8a274869c75bda5e8ea84c04c` | `57fd8240aeb1e78e96e973efab05438025ba0ab8a274869c75bda5e8ea84c04c` | Exact match. |
| `20260716041133` | `payment_operations_security` | `253603cd70db7f9c7949fa1065360ec4cdc5626f5630a0c1b9587a0f0b08e374` | `253603cd70db7f9c7949fa1065360ec4cdc5626f5630a0c1b9587a0f0b08e374` | Exact match. |

## Local reviewed migrations, not applied remotely

`20260829000000_serialize_owner_protection.sql` has local digest `975ba25c73efe71d3544029b41fc666943528866f165de6a4a7bdfec299a8bd2`. It uses a bounded table-locked cutover with `CREATE OR REPLACE TRIGGER`, a BEFORE STATEMENT nonblocking transaction advisory lock, a READ COMMITTED guard, and row-level invariant checks to serialize profile updates/deletes and protect owner demotions, deactivations, and deletions. It has **not** been applied to Supabase.

The exact digest received three fresh independent PASS reviews in tasks `01a04b44-bfd7-77b2-a667-6b58f17839ce`, `01a04b44-c1cd-78d1-8d77-68a611adcd84`, and `01a04b44-c46c-7f70-b9c0-1f3e259d40b5`. Only after those reviews, it was applied to a disposable local Supabase/Postgres 17 target containing two deterministic synthetic owners. The concurrent two-owner demotion left one active owner and returned a retryable failure for the other transaction; REPEATABLE READ, last-owner cascade deletion, and multi-row removal failed closed; zero-row contention returned immediately; and direct PUBLIC/anon execution remained denied. The post-migration schema-only fingerprint was `2d85691e0cdc576df22036a613371871a83fd88b5a9045544098886de8f082a0`. This is local evidence, not production DDL authority. Production still requires an explicit owner-approved action-time preflight, application, and postflight.

### Owner-protection review chronology and scope

- Predecessor `7cc98a...` is permanently vetoed for its cutover and row-lock ordering.
- Predecessor `c5b996...` is permanently vetoed for stronger-isolation behavior, unbounded waiting, and its lock cycle.
- Predecessor `2b6fa0...` is permanently vetoed for its `DROP TRIGGER` access-exclusive lock upgrade.
- Only exact digest `975ba25c73efe71d3544029b41fc666943528866f165de6a4a7bdfec299a8bd2` received the three PASS reviews above, and those reviews authorized only its isolated disposable-local application and tests.

The reviewed application gives no production or remote application, production-like predecessor replay, restore,
hosted, release, payment, collaborator, G5, or external credit. Any material edit to the SQL changes the candidate,
invalidates this exact-digest review and test credit, and resets independent review to zero before another application.
Production requires a separate exact-version review and owner-approved action-time preflight, application, and
postflight; this ledger never grants that authority.

`20260829081456_assignment_scoped_access.sql` has local digest
`8c12c5413d103b0d55fc2a324fcc19d0f9152f270e809fb70d6eec7babe2953f`. It adds an explicit
order-assignment lifecycle for the role aliases `service_lead` and `assigned_reviewer`, action-time live
`auth.sessions` validation, assignment/profile/session locks, fail-fast profile and order serialization,
idempotent assignment/work creation, optimistic work-item updates, metadata-only audit receipts, and
assignment-scoped audited RPCs. It removes standing application-role access to profiles and operational/customer
tables. The service role is confined to the non-payment pending-intake table and its private rate limiter. Historical
payment tables/functions are revoked from application roles and the named payment cleanup Cron is disabled; no
payment runtime, storage authority, upload path, provider call, or collaborator identity is introduced.

The exact digest received three independent PASS reviews in tasks
`01a04b44-bfd7-77b2-a667-6b58f17839ce`, `01a04b44-c1cd-78d1-8d77-68a611adcd84`, and
`01a04b44-c46c-7f70-b9c0-1f3e259d40b5` before execution. It then compiled and applied only to a disposable local
Supabase/Postgres 17.4 target after the exact owner migration. Core acceptance covered same-engagement access,
cross-engagement/unassigned/dual-role denial, reviewer write bounds, idempotent create/conflict behavior,
optimistic concurrency, inactive-subject revocation, handoff with no residual access, signed-out-session and expired
JWT denial, stronger-isolation failure, assignment-window expiry, audit reconstruction, service-role separation,
payment-era closure, and zero engagement storage policy. Concurrent profile, per-order, duplicate-work, and
conflicting-role changes failed fast and completed without deadlock. Two independent build-ups produced identical
`public`/`private`/`cron` schema-only fingerprints:
`a93845a31415876e37356a0ca1cde376f0bb83d3384c10c5d0ad51fea6905c7c`.

A selected-schema/data/ledger restore recovered a six-ledger pre-migration snapshot with no assignment table and an
eight-ledger post-migration snapshot with the assignment RPCs, four assignment history rows, two work items, 32
audit receipts, and six deterministic `.example.invalid` identities. Those portable restores intentionally excluded
managed role owners/default ACLs after a role-owned Auth default-privilege statement failed closed. Therefore local
schema/data/ledger recovery is proven, while managed-role/ACL restore, production-like predecessor restore, hosted
Auth behavior, backup retention, RPO/RTO, and production application remain `PARTIAL`/unproven.

### Assignment-access review chronology and scope

- Predecessor `10dffd...` is permanently vetoed for its Cron call, weak tuple locks, cross-role serialization,
  malformed audit inputs, inactive-subject revoke behavior, contact scoping, and create-idempotency defects.
- Predecessor `3716d0...` is permanently vetoed for stale session/owner authorization, incompatible profile lock
  ordering, and inactive-profile RLS fallback.
- Predecessors `b6a52c...`, `624183...`, and `fe17a8...` are permanently vetoed for, respectively, a direct
  row-locking profile-read path, a residual direct profile-admin path, and non-owner global-lock contention.
- Only exact digest `8c12c5413d103b0d55fc2a324fcc19d0f9152f270e809fb70d6eec7babe2953f`
  received three PASS reviews and disposable-local application/testing credit.

Any material edit to the assignment SQL changes its digest and resets its review set to zero. This evidence grants no
remote Supabase application, real Auth/session/provider proof, collaborator onboarding/access, production data,
release, payment, deployment, G5, publication, or other external authority.

## Sprint 01/02 payment successors, not applied remotely

`20260901163504_enable_multi_customer_payment_concurrency.sql` removes the accidental package-wide active-order
index and transforms the historical singleton row into one `stripe_checkout_reservations` row per Checkout intent.
It retains exact Session, PaymentIntent, event, amount, currency, email, order, and reconciliation bindings while
allowing independent customers to reserve, pay, and enter the manager queue concurrently.

`20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql` is a forward-only Sprint 02 correction. A
disposable concurrency test found that an expiry or asynchronous-failure webhook could read an unpaid snapshot
before a simultaneous paid finalizer acquired the intent lock. The successor takes the terminal-event decision lock
on only the exact intent before rechecking paid or compensated state. It introduces no package-global lock and does
not block unrelated customers. Both migrations remain local candidate bytes and have not been applied to hosted
Supabase; their local tests grant no provider, release, payment, deployment, or production authority.

## Replay requirements

- The foundational migration is a derived replay artifact, not evidence that it was applied to production. Its exact digest is pinned by the test suite.
- A clean replay that should bootstrap an existing profile as owner must set `app.settings.snickerdoodle_bootstrap_owner_email` privately for the applying transaction/session. Never commit the value.
- Replay the full sequence against a disposable database before any production schema change. The completed
  foundation-plus-five replay and reviewed local owner/assignment upgrade are not a production-like predecessor
  upgrade or managed-role/ACL restore drill.
- Treat the ledger as evidence, not as permission to mutate a database.
