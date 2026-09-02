# Hosted readiness manifest — 1.1.0-rc.3

## Locally proven

- Node 22 lockfile build, closed/open-copy builds, route/browser matrices, and no-secret/dependency scans.
- Full 21-migration PostgreSQL 17 replay, including the provider-only legacy retirement; per-intent 2/10/100 concurrency; payment atomicity/replay/refund/dispute; queue, AAL2, assignment, privacy, and destructive recovery corpora.
- Checkout remains server-controlled and the redirect is never payment truth. Closed mode returns 503 for checkout/webhook.
- Database dump custody, destructive local restore, privacy-tombstone replay, derived queue rebuild, and synthetic blob inventory/reconciliation.

## Hosted validation required

- Bind the immutable commit/build to the intended Vercel project, preview URL, production domain, runtime, base path, secrets, and rollback target; verify headers, health, routes, logs, and alerts after promotion.
- Apply the exact migration ledger to the intended Supabase project only after a recoverable pre-mutation backup; run Advisor, grants/RLS inventory, two-real-session tenant/assignment checks, owner TOTP enrollment, Storage inventory, and restore drill.
- Verify Stripe restricted-key permissions, Product/Price binding, signed webhook endpoint, event replay/reconciliation, test-mode purchase/refund/dispute, account mode, and payout readiness.
- Verify monitored transactional/operational mail delivery, suppression/incident handling, and owner response coverage.
- Verify secure privacy identity proofing, export delivery/expiry, deletion operations, approved retention/accounting periods, and production backup RPO/RTO.

## Provider mutation required

Supabase migration/application, Auth identities/TOTP, Storage/backup configuration, Stripe key/webhook/catalog configuration, Vercel preview/promotion/rollback, mail setup, and any analytics configuration. None is performed or credited by SN07 or SN08A.

## Legal/operations approval required

Exact offer, price, scope, claims, terms/refund/cancellation, tax treatment, retention/accounting periods, collaborator participation/access, fulfillment coverage, monitored support/reconciliation ownership, monetary concurrence, publication authority, and G5 assignment.

Any missing or contradictory item leaves commercial mode and new checkout closed.
