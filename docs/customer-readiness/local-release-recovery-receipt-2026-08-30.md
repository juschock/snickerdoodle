# Snickerdoodle local recovery and customer-path release receipt

> **Superseded chronology:** this candidate was independently blocked after freeze. The current local successor is
> identified by `local-release-security-successor-receipt-2026-08-30.md`. Nothing in this historical receipt carries
> forward unless the successor receipt explicitly re-verifies it.

Status: **LOCAL_SYNTHETIC_ONLY / FREEZE COMPLETE / NOT PROVIDER OR PRODUCTION CERTIFIED**
Evidence date: 2026-08-30 ET
Authority: no push, deployment, provider mutation, real data, publication, payment activation, or customer acceptance

## Exact frozen source identity

- Read-only local source archive: `/private/tmp/snickerdoodle-local-release-a42999cc38dcd56032f021632a09ce3babc7567501628d5a76c00464cfd0cff8.tar`
- Archive SHA-256: `384e1344a1473218c5787197b605315afae26c8b5173e91a9bf510b7908d798c`
- Status-independent path/mode/content manifest SHA-256: `a42999cc38dcd56032f021632a09ce3babc7567501628d5a76c00464cfd0cff8`
- Included files: 186 existing tracked or nonignored files; ignored secrets, dependency trees, `.next`, Playwright reports, and test results are excluded.
- Extraction rehearsal: the archive was extracted to a separate local directory and reproduced manifest SHA-256 `a42999cc38dcd56032f021632a09ce3babc7567501628d5a76c00464cfd0cff8` exactly.
- Pre-receipt HEAD-relative dirty fingerprint: `78965658f27f66952f5b438d9dbeb7529020a3577c8516a6f308115af0cc999a`.
- This receipt was created after and is intentionally not inside the archive, avoiding a circular self-identity. The archive is the exact candidate; an external SHA-256 identifies this receipt.
- The source repository remains dirty and contains preserved prior work. Nothing was staged or committed.

The manifest serializes every NUL-safe, `LC_ALL=C` path-sorted included file as `path + NUL + POSIX mode + NUL + ordinary SHA-256 record`, skipping recorded paths that do not currently exist. Any candidate byte, executable-mode, or path-set change creates a new identity and resets review.

## Recovery and database acceptance

The clean filename-order migration replay and the disposable source database both passed. A schema/data/ledger archive was then restored to a separate PostgreSQL 17 target; the restored target reproduced the complete selected inventory and passed the same acceptance suite.

- Disposable source: `/private/tmp/snick-release-replay.TwnAHA` on local port 55622.
- Disposable restore target: `/private/tmp/snick-release-restore.DFITD7` on local port 55722.
- Source archive: `/private/tmp/snick-final-candidate.XdxYaK/coherent-source.dump`.
- Source archive SHA-256: `ca22910bc13356c8dd39a27a024cb1806799684153317ebf3d2a15e7f258539f`.
- Source and restored inventory identity: `b17c5bb408d5d53eac5c5298caea20a09650263935e3b3cc1c4974baa0954b7d|b17c5bb408d5d53eac5c5298caea20a09650263935e3b3cc1c4974baa0954b7d|ab0d7247f8f6a02865a5d1ad81a2b54a83bb5d76c798388d4c3ed9d258aa62ba|be7cc4d827ef22b151fa44a773b4eca664ced0c8ca0a2eedb4e2a8324bd67b63|0962b0d3a3c55f29923882a29f6d3504588e61fe18ab050d5caef6a45f4918c3|521|521|28`.
- Restore-order correction: both `activity_events` account and order deletion foreign keys are recreated as validated `ON DELETE SET NULL`, `DEFERRABLE INITIALLY DEFERRED` constraints, removing the internal trigger-order dependency that caused restored account deletion to fail.
- Restore-order migration SHA-256: `57fdb96cd348e359d9136c75ea900ba982cf9ae231109298a88de4d90a1b0f43`.
- Privacy-safe manager-queue migration SHA-256: `60459167017df426de2fc31be151260fc695236dc0db87f34ce6448efe41ab08`.
- Checkout terms-version migration SHA-256: `4b5d73e38a4552e6fa84b1d79d4cc580df68b1b9d6312d16f61872319c70f247`.

Both the source and restored target passed:

- `ORD03_CORE_ACCEPTANCE_PASS`
- `ORD03_CONCURRENCY_PASS`
- `ENGAGEMENT_GRAPH_INTEGRITY_ACCEPTANCE_PASS`
- `INTAKE_MANAGER_QUEUE_ACCEPTANCE_PASS`
- `PAYMENT_LAUNCH_ACCEPTANCE_PASS`
- `PAYMENT_LAUNCH_CONCURRENCY_PASS`
- `PAYMENT_CAPACITY_CONCURRENCY_PASS`

The disabled local `pg_cron` cleanup job was recreated through the extension owner API, rather than by unsafe direct writes to the provider-owned catalog. Managed-provider ownership, roles, default ACLs, runtime behavior, backup service, PITR, RPO, and RTO remain unverified.

## Customer and manager path correction

- The customer form no longer opens `mailto:` or displays a client-only receipt.
- Validated intake is durably inserted on the server before a Stripe redirect may be returned.
- A checkout return never claims payment; paid state comes only from a verified, signed, idempotently reconciled Stripe webhook.
- Checkout success and cancel pages exist at the deployed base path.
- Exact terms version `2026-08-30` is persisted with every new checkout intent.
- Customer terms now state the unchanged `$99` offer, conditional approximately 48-hour delivery, cancellation/refund/correction boundary, and customer-delay exclusions.
- Privacy text now describes durable intake, Stripe processing, retention/rights, the metadata-only manager queue, and analytics default-off behavior.
- Provider analytics is absent unless an explicit server-owned flag is exactly `true`; the private brief subtree remains suppressed, and allowed public events lose query strings and fragments.
- Owner UI: `/snickerdoodle/manager/queue`.
- Owner UI precondition: a current Supabase JWT whose authenticated profile is active `owner` and whose Auth session is live. The bearer token is held only for one request, cleared immediately, and never stored in local/session storage, a cookie, URL, rendered queue, or application log.
- The UI exposes only receipt ID, intake kind, queue/payment state, order reference, terms version, and timestamps. Raw answers, delivery email, card data, Stripe payloads, and customer secrets are excluded by the database RPC and response validator.

This is a usable manager experience only after provider Auth and the owner profile/session are configured and independently verified. The local browser test uses a synthetic response and does not prove a hosted login/session or provider data path.

## Application and security verification

- Node 22 lint: PASS.
- TypeScript and generated route typecheck: PASS.
- Unit/route suite: 18 files, 97 tests PASS.
- Production build: PASS; 21 generated application pages and routes, including manager queue and checkout return routes.
- Commercial-gate browser suite: 5 PASS, including valid-route zero-console, base-path checkout returns, mobile/accessibility, analytics absence, and the owner queue UI.
- Fail-closed HOLD browser suite: 3 PASS, including direct intake/API refusal and accessibility.
- Gitleaks 8.30.1: 26 commits and exact tracked-plus-nonignored candidate scanned; no leaks found.
- `npm audit`: zero vulnerabilities.
- `git diff --check`: PASS.

## Remaining provider and production blockers

No provider or production readiness is claimed. Before a customer can be accepted, a separately authorized exact release must still prove:

1. provider-equivalent Supabase migration replay, Auth owner/session behavior, runtime roles/default ACLs, data isolation, backup/restore, PITR/RPO/RTO, and the exact manager queue against synthetic data;
2. restricted live Stripe credentials, exact Price/product, signed webhook endpoint, idempotent test-mode checkout/refund/failure/replay/dispute journey, and bank/reconciliation controls;
3. transactional email/domain authentication and monitored delivery/support/refund paths without raw intake in notifications;
4. immutable Vercel preview binding, environment read-back, hosted base-path/CSP/zero-console/browser checks, rollback rehearsal, and same-artifact production promotion;
5. exact operator/reviewer availability, fulfillment rehearsal, support/refund ownership, legal approval, monetary concurrence, and final actual-CEO go-live authorization.

Until those gates pass, all commercial environment flags remain absent or false and the safe state remains HOLD.
