# Snickerdoodle recovery contract

This contract applies to the closed, local 1.0.6 candidate. Recovery is not complete merely because PostgreSQL accepts a dump. The service stays closed until every runbook gate passes against one immutable source and artifact identity.

## Authoritative and derived state

PostgreSQL is authoritative for accounts, contacts, campaigns, orders, briefs, pending intakes, checkout intents and reservations, Stripe event identities and receipts, reconciliation alerts, engagements, assignments, work items, privacy requests/actions/tombstones, retention policy configuration, and metadata-only audit receipts. A logical backup must preserve rows, constraints, indexes, sequences, routines, triggers, policies, RLS flags, owners, ACLs, and the migration ledger.

`private.intake_manager_queue` is a derived metadata-only read model. Its authoritative inputs are `public.pending_intakes`, `public.checkout_intents`, `public.orders`, and `private.payment_reconciliation_alerts`. It can be reconciled with `scripts/db/rebuild-intake-manager-queue.sql`; the procedure preserves existing receipt IDs, removes orphan receipts, creates missing receipts, and repairs the known queue index. It must never infer a paid order from a browser redirect or synthesize an authoritative payment row.

Application build output, caches, and generated indexes are reconstructable only from an immutable source revision, exact lockfile, approved environment contract, and migration set. They are not database backup content.

## Backup classes

| Class | Authority and custody | Recovery treatment | Hosted-only evidence still required |
| --- | --- | --- | --- |
| PostgreSQL | Supabase Postgres in production; local PG17 in this rehearsal | Transaction-consistent logical backup; restore before forward migrations; verify selected content and complete schema/ACL/RLS inventory | Provider backup availability, cadence, encryption, retention, restore target, PITR/RPO |
| Storage/blob objects | Object store is authoritative for any future uploaded/delivered object; metadata belongs in DB | Restore separately from an immutable manifest; detect missing/orphan/hash mismatch; reapply privacy tombstones before availability | Supabase Storage export/restore, bucket policy, signed delivery, encryption, regional recovery |
| Privacy/export artifacts | Private DB payload with explicit expiry today; future files require private blob custody | Never restore an expired export to readable state; replay newer durable deletion/tombstone decisions over older snapshots | Secure export delivery and deletion propagation across provider backups |
| Stripe/provider state | Stripe is authoritative for provider objects/events; DB is the durable local projection | Never claim a DB restore recreates/refunds/changes Stripe. Reconcile signed provider state after local uniqueness and identity checks | Restricted key, webhook endpoint/secret, provider replay/reconciliation rehearsal |
| App config/secrets | Deployment provider/secret manager, never Git or DB dump | Recreate from an approved name-only inventory; compare configuration fingerprint without disclosing values | Vercel project binding, scoped secrets, immutable preview/promote identity |
| Cache/derived build | Non-authoritative | Rebuild only after source/schema/config verification; discard stale copies | Hosted cache invalidation and multi-region behavior |

## Invariants before reopen

- Each Checkout Session, PaymentIntent, charge, and Stripe event identity is unique and bound to one intended checkout/order graph.
- Duplicate historical events have one effective transition; valid new signed events follow the existing atomic state machine.
- Refund, dispute, reconciliation, fulfillment, and assignment histories remain coherent and do not cross customer boundaries.
- Owner AAL2 and live assignment checks operate at action time. Anon/ordinary clients cannot directly access backend payment, privacy, queue, or audit tables.
- Privacy restriction and anonymization survive. After restoring an older snapshot, every newer durable privacy tombstone is replayed before a customer, operator, export, or blob route opens.
- All RLS flags, policies, function definitions/search paths, explicit grants, constraints, indexes, sequences, and the exact migration ledger match the candidate.
- Missing authoritative database rows or missing provider/blob evidence are blockers. Only explicitly derived queue/index/cache state may be rebuilt.

The local rehearsal measures mechanics, not a production SLA. Legal retention periods and hosted RPO/RTO remain approval/provider decisions.
