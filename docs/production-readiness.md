# Snickerdoodle production readiness

Last reviewed: August 30, 2026

This document is the release checklist and evidence record for the Snickerdoodle application. The local tree now
contains a gated Stripe Checkout candidate, but live processing remains disabled pending provider, database,
operations, legal, monetary, tax, and release authorization.

## Current readiness result

The local candidate now defaults to an explicit commercial hold. Public pages expose only product-readiness status and clearly labeled fictional samples. Price, delivery, service, order, payment, capacity, and private-intake paths remain suppressed unless all eight retained commercial gates are exactly `true`. The `/brief` page, capability exchange, intake API, and invite generator fail closed before accessing intake configuration or data. These deployment flags record approvals; they do not grant them.

The gated candidate intake still uses a signed capability in the URL fragment, immediate removal, same-origin exchange,
and a scoped HttpOnly cookie. The executable Stripe-hosted Checkout and signed-webhook paths require a restricted key,
exact mode/origin, independent acquisition and settlement switches, and every retained commercial gate. They remain
closed by default. Expiry, asynchronous failure, refund, and dispute events are durably receipted with idempotent
metadata-only reconciliation alerts before acknowledgement; true processing failures still fail for provider retry.
The normal owner workspace requires Supabase password authentication plus verified TOTP/AAL2 before queue or paid-brief
access. Provider binding, alert ownership, and hosted Auth remain launch blockers.

The amended local tree completed the validation evidence below after the hold-mode, assignment-access, payment-safety,
manager, and recovery changes. The exact current database successor received an independent exact-byte PASS after a
clean source-to-distinct-target disposable restore and full postflight. This remains a dirty, uncommitted, undeployed
local candidate; its separate immutable local manifest/receipt does not satisfy any provider or production gate.

## Verified evidence

| Area | Evidence | Result |
| --- | --- | --- |
| Runtime | Node.js 22; Next.js 16.3.3; React 19.2.8 | Pass |
| Compile | `npm run typecheck` | Pass |
| Static analysis | `npm run lint` | Pass |
| Unit and route tests | `npm test` | 20 files / 113 tests pass, including exact commercial-gate conjunction, canonical server-origin validation, durable intake, Stripe expiry/capacity compensation, signed-webhook lifecycle acknowledgement, AAL2 manager access, microsecond-safe pagination, public-key classification, analytics privacy, request bounds, and exact migration/harness custody |
| Browser journeys | Default closed build plus `npm run test:e2e:hold:built`; gate-true build plus `npm run test:e2e:built` | Closed-mode and dormant commercial journeys cover durable receipt truth, exact base-path returns, password→TOTP→AAL2 owner access, paid brief/assignment/reconciliation UI, analytics absence, axe, and mobile behavior; provider calls remain synthetic/local |
| Accessibility | axe WCAG 2 A/AA/2.1 AA checks in both closed and simulated-intake builds | Pass |
| Responsive UX | Mobile navigation and horizontal-overflow checks at 390 × 844 | Pass |
| Production build | Final default `npm run build` using the explicit webpack builder | Pass in commercial-hold mode; 21 routes generated |
| Dependencies | `npm audit`, `npm audit --omit=dev`, and `npm audit signatures` | 0 vulnerabilities; all 641 packages have verified registry signatures and 155 have verified attestations |
| Secrets | Repository scan through pinned Gitleaks | Full 26-commit history and the exact tracked/nonignored candidate worktree scanned; no leaks found |
| Liveness | `GET` and `HEAD /snickerdoodle/api/health` | Covered by tests |
| Database access | Exact local owner + assignment + payment/manager successors remove direct application-role profile/customer/assignment access; audited RPCs require a live Auth session, current assignment, and owner AAL2 where applicable. `service_role` lacks direct checkout-intent `UPDATE` and low-level failure-function execution; narrow wrappers create durable receipts/alerts. Hosted Supabase remains unchanged. | Pass locally; production DDL/Auth proof remains gated |
| ORD-03 | `scripts/db/ord03-acceptance.sql` and `scripts/db/ord03-concurrency.sh` on disposable Postgres 17.4 | Same/cross/unassigned/dual-role, expiry/revoke/handoff, stale session/JWT, idempotency, concurrency, audit, service-role, payment, and storage boundaries pass |
| Recovery | Exact current-source custom archive to a distinct disposable PostgreSQL system plus selected application/Auth/owner/default-ACL/Cron restore and full postflight | Pass locally; the manual filename-order source has no provider migration ledger, and managed-provider backup/PITR/RPO/RTO remain blocked |
| Payment boundary | Gated Stripe Checkout, signed webhook, exact `$99 USD` binding, restricted-key-only runtime, creation-time-safe expiry, compensated/reconcilable capacity, duplicate-safe paid finalization, and acknowledged durable lifecycle alerts | Pass locally; provider binding, operator ownership, and live proof remain gated |
| Hosted runtime | Vercel runtime error review for the prior seven days | No errors found |

## Architecture and scalability

- Next.js route handlers remain stateless. Pending intake, idempotency, and HMAC-pseudonymized delivery-email rate-limit state are durable in Postgres rather than process memory.
- Browser-submitted text is schema-validated and capped before it reaches downstream services. Request bodies also have a maximum accepted size.
- The app does not trust proxy-forwarded IP headers for per-person throttling. Behind the parent rewrite, intake requires an email-bound HMAC-signed qualification capability whose issuance window may never exceed seven days. The capability travels in the URL fragment, is removed before survey rendering, is exchanged through a same-origin route for a scoped HttpOnly/SameSite=Strict cookie, and is excluded from analytics; private responses use `no-store` and `no-referrer`. One invite maps to one deterministic pending-intake ID even if an attacker rotates request content or idempotency keys. Every valid cookie-backed submission consumes the durable pseudonymized email allowance before body parsing or intake lookup, including malformed and existing-intake replays, avoiding a shared-proxy global lockout while aggregate creation remains bounded by issued invites.
- The only deployable visual asset is the original lightweight `public/icon.svg`; governed marketing stills remain outside public paths until their separate publication gate passes.
- The health endpoint performs a lightweight process check and does not disclose configuration, database details, or secrets.
- Production dependencies were reduced by moving the shadcn scaffolding CLI to development-only dependencies.
- CI runs compile, lint, unit, browser, accessibility, dependency, secret, and production-build checks on each push and pull request.
- One server-runtime evaluator controls both rendered pages and route handlers. The build cannot freeze a different public state: CI tests a gate-true build with false runtime gates, then a gate-default build with true runtime gates, and finishes by rebuilding and re-verifying the default closed artifact. Passing the dormant customer-intake simulation is not approval to activate the offer.
- Private-intake origin checks require the exact server-only `SNICKERDOODLE_ALLOWED_ORIGIN`; missing, malformed, credential-bearing, path-bearing, query-bearing, or fragment-bearing values fail closed with `503` before private configuration or data access.
- `engines.node` is pinned to Vercel-supported `22.x`, matching `.nvmrc`, CI, and the certified local runtime instead of inheriting the project dashboard's newer default major.
- The application can scale horizontally because public page rendering and non-payment route handling do not rely on server-local state. Database capacity, rate limits, and third-party quotas must still be monitored as traffic grows.

## Database posture

The connected Supabase project is `snickerdoodle-studio` (`iybwbnabyphpzlmzypga`), currently running Postgres 17. The remote migration ledger and public-schema privileges were inspected on August 28, 2026. Generated schema types are checked in at `lib/database.types.ts`.

The package now includes an idempotent foundational migration reconstructed from a read-only inventory of the live schema. It creates the eight tables referenced by the first recorded migration and restores the six live indexes that predate the remote ledger, making the sequence structurally complete for a clean replay. The five applied remote migration digests are recorded in `supabase/migrations/README.md`; four public replay files match their remote statements exactly, while the staff-authorization replay intentionally replaces a historical personal bootstrap email with a private session setting. On 2026-08-29, the foundation plus all five ledger migrations replayed from empty twice in an isolated local Supabase/Postgres 17 target with the same schema-only fingerprint, `d2f49961ed5dc781ff72dd7b3f2582abc65961bf381d18bd2bc55369810a60b0`. This is not a production-like snapshot upgrade, backup restore, RPO/RTO result, or production DDL authorization.

The local `20260829000000_serialize_owner_protection.sql` migration fixes the demonstrated concurrent-owner lockout race with a bounded table-locked cutover, a BEFORE STATEMENT nonblocking transaction advisory lock, a READ COMMITTED guard, and row-level update/delete invariant checks. Before it, a disposable two-owner rehearsal allowed both concurrent demotions to commit and left zero active owners. The final digest `975ba25c73efe71d3544029b41fc666943528866f165de6a4a7bdfec299a8bd2` received three fresh independent PASS reviews, then applied successfully to the authorized disposable local target. One concurrent demotion failed retryably while the other committed, leaving one active owner; stronger-isolation, last-owner cascade-delete, multi-row removal, and zero-row contention tests failed closed as designed. It remains unapplied to Supabase. Production still requires separate owner action-time authorization, exact preflight, application, and postflight.

The review chronology is permanent: predecessor `7cc98a...` was vetoed for cutover/row-lock ordering; `c5b996...`
was vetoed for stronger-isolation behavior, unbounded waiting, and its lock cycle; and `2b6fa0...` was vetoed for a
`DROP TRIGGER` access-exclusive lock upgrade. Only the exact final `975ba25c...a8bd2` digest received the three PASS
reviews, scoped solely to isolated disposable-local application and testing. That evidence gives no production or
remote application, production-like predecessor replay, restore, hosted, release, payment, collaborator, G5, or
external credit. Any material SQL edit invalidates the exact-digest evidence and resets independent review to zero.

Exact local migration `20260829081456_assignment_scoped_access.sql`, SHA-256
`8c12c5413d103b0d55fc2a324fcc19d0f9152f270e809fb70d6eec7babe2953f`, received three independent
PASS reviews before disposable execution. It implements order-scoped `service_lead` and `assigned_reviewer`
assignments, grant windows/lifecycle/predecessors, action-time JWT/`auth.sessions`/profile/assignment checks,
nonblocking shared lock order with the owner migration, idempotency, optimistic work updates, and metadata-only audit
receipts. It removes application-role profile/customer/assignment grants, confines service role to pending intake/rate
limiting, and fails closed the historical payment application surface and Cron without deleting reversible data.

The exact migration compiled and applied repeatedly after the six-ledger predecessor plus deterministic synthetic
`.example.invalid` fixtures. Core and concurrency harnesses covered same-engagement use; cross-engagement,
unassigned, dual-role, and reviewer-scope denials; assignment expiry/revoke/handoff; deleted or mismatched sessions;
expired JWT; stronger isolation; duplicate/conflicting assignment/work changes; audit reconstruction; service-role
separation; payment closure; and zero storage authority. Two reviewed build-ups produced identical
`public`/`private`/`cron` fingerprints,
`a93845a31415876e37356a0ca1cde376f0bb83d3384c10c5d0ad51fea6905c7c`.

Earlier selected-schema/data/ledger rehearsals recovered the pre- and post-assignment states but excluded managed
owners/default ACLs after a role-owned Supabase Auth default-privilege statement stopped the first portable attempt.
That limitation is historical. The current exact successor harness now preserves selected application data, synthetic
Auth users/sessions, owners, explicit/default ACLs, and disabled Cron semantics from one coherent local archive and
restores them to a distinct PostgreSQL system identifier. ORD-03, engagement graph, manager, payment, and four
concurrency postflights all pass after restore. The source was built by manual filename-order replay and intentionally
has no `supabase_migrations` provider ledger, so the harness records `ABSENT_NOT_RESTORED` rather than synthesizing
provider evidence. Real hosted Auth/session behavior, provider migration history, backup retention/authority, PITR,
RPO/RTO, remote application, and production-like data remain blocked.

Unused-index advisor notices were not acted on because the production dataset is too small to provide meaningful usage evidence. Re-evaluate indexes after representative traffic exists.

The read-only Supabase advisor snapshot at `2026-08-29T00:08Z` reported one security warning: leaked-password protection is disabled. It also reported an informational `RLS enabled, no policy` notice for `private.checkout_rate_limit_counters`; that table is intentionally private, has no Data API grants, and is accessed only through the server/service-role rate-limit routine. Performance notices were unused-index observations only; no indexes were removed from the low-traffic production database.

A refreshed read-only snapshot at `2026-08-29T06:12Z` confirmed the project is `ACTIVE_HEALTHY` on Postgres
17.6 in `us-east-2`, the same five remote migrations are applied, all twelve inventoried `public`/`private` tables
have RLS enabled, and no Supabase development branch exists. It returned the same leaked-password warning and
private-table informational notice. Backup schedule, retention, point-in-time recovery eligibility, and restoration
authority were not exposed by the available read-only project evidence. No production-like predecessor replay or
backup-restore drill has been completed. Therefore the database is suitable only for the current narrowly scoped
pending-intake path; it is not yet certified as a recoverable customer-order system.

## Hosted-state evidence

Read-only Vercel evidence on August 29, 2026 confirms this directory is linked to project `campaign-kit`
(`prj_s5ioDg3l81ogNgZwmOREf3Q7iKQE`) in account `team_eeG1yT8TtHfgdO7JkmiLkYTg`. The platform reports
`live: false`, a project dashboard runtime setting of Node `24.x`, and a latest READY preview deployment with no
production target. This conflicts with the exact candidate's tested/pinned Node `22.x` runtime and must be
reconciled before deployment.

The stable Vercel alias `https://campaign-kit-phi.vercel.app/snickerdoodle` and canonical
`https://racoben.com/snickerdoodle` both returned HTTP 200 in read-only checks, but they serve a superseded build:
the new `/snickerdoodle/api/health` endpoint returned 404 on both. The canonical live page advertises an unadopted
one-time `$99` package, human review, a 48-hour delivery claim, and an active `/brief` path that prepares an email
intake. Those claims and conversion mechanics conflict with the controlling HARD HOLD and must not be treated as a
safe current candidate. This deployed-revision drift is an explicit release blocker. No current local change is
deployed, and no present hosted URL is release evidence for this candidate. Vercel reported no grouped runtime errors
for the project in the prior seven days, but that clean error signal applies only to the superseded hosted build.

## Customer and operator journey coverage

| Journey | Current exact-candidate coverage | Market-ready delta |
| --- | --- | --- |
| Public discovery and proof | Fail-closed product-status home, three fictional full samples, hold-aware FAQ/terms/privacy, metadata, sitemap, and accessible responsive navigation | Exact closed-mode Preview/canonical verification; legal/claims acceptance |
| Qualification and intake | Dormant candidate: signed-invite generator, fragment-to-HttpOnly-cookie exchange, unlisted survey, server validation, durable throttling/idempotency, pending-intake persistence, received page; every entry point fails closed by default | Approved offer/fulfillment/reviewer/legal/payment/monetary/G5 gates; inbox ownership; applied migration; production secret/origin preflight; live synthetic postflight |
| Purchase and order start | Executable but default-off local candidate: durable server intake, Stripe-hosted Checkout creation, signed webhook, per-intent reservation, isolated idempotent paid orders, lifecycle alerts, and truthful return pages | Exact provider configuration, test-mode journey, legal/tax/refund acceptance, monitored reconciliation, and retained owner/CFO/CRO gates |
| Fulfillment and delivery | Role-only pipeline, fact ledger, templates, QA checklist, editor packet, delivery-package specification, and locally proven assignment-scoped service-lead/reviewer data plane | Assigned/cleared reviewer, real Auth/provider proof, two timed fulfillment rehearsals, measured capacity, delivery/support evidence |
| Staff operations | Normal Supabase password + verified TOTP/AAL2 owner workspace, privacy-safe intake/payment queue, full paid brief, assignment status, reconciliation state, and metadata access receipts | Hosted Auth enrollment/session proof, notification delivery, assignment mutation UI, delivery tooling, and managed-role recovery proof |
| Post-order support | Terms/privacy/support routes, explicit cancellation/refund/correction policy, durable refund/dispute alerts, and candidate measurement definitions | Accountable response owner, provider refund/dispute rehearsal, customer status/notice workflow, and permissioned feedback loop |

Snickerdoodle is the sole Racoben product permitted to plan human-delivered service fulfillment, but the prospective
independent marketing reviewer remains unassigned and under HARD HOLD. The journey specifications do not infer
identity, employment, compensation, ownership, availability, assignment, authority, or access. G5 external motion
also remains UNASSIGNED.

## UX and operational behavior

- A keyboard-visible skip link moves directly to the main content.
- Required brief fields expose native `required` state, limits, hints, and accessible error summaries.
- Submission state is announced and prevents accidental repeat submission.
- Public pages include useful metadata, canonical URLs, social metadata, absolute icons, a friendly not-found page, and a recoverable error boundary.
- The only public image asset is an original Snickerdoodle SVG mark; inherited placeholder/v0 image assets were removed.
- Security headers are asserted end-to-end on both the base-path homepage and a nested public page.
- Privacy, terms, support, and service-scope links are reachable from the footer.
- Legal pages are an operational baseline, not legal advice; counsel should review them before a broad commercial launch.

## Release procedure

1. Use Node.js 22.x, matching `package.json`, `.nvmrc`, CI, and the certified runtime, and run `npm ci`.
2. Run the complete verification sequence from the README.
3. Review the diff for credentials, generated files, schema changes, and unexpected lockfile changes. `next-env.d.ts` is generated and intentionally ignored.
4. Commit on a `codex/` branch, push, and let GitHub Actions finish successfully.
5. Review the Vercel Preview through the full public non-payment journeys on desktop and mobile.
6. Resolve or explicitly accept every remaining launch gate below.
7. Promote the reviewed deployment and verify the canonical Racoben route, health endpoint, logs, and analytics.
8. Record the release commit, deployment URL, time, operator, and any accepted risks.

## Monitoring and rollback

- Monitor availability with `GET /snickerdoodle/api/health` and separately exercise a rendered public page; a liveness response alone does not prove every dependency works.
- Watch Vercel function errors, latency, and traffic, plus Supabase database health, connection count, storage, and security advisors.
- Investigate elevated form validation failures and rate-limit events as possible UX problems or abuse.
- Roll back by promoting the last known-good Vercel deployment. If a database migration is involved, use a tested forward-fix or a migration-specific rollback plan; never improvise destructive SQL in production.

## Remaining launch gates

1. **Deployed-revision drift:** replace the superseded live `$99`/human-review/48-hour/intake build only through an authorized, exact-version release. Until canonical read-back proves the approved fail-closed revision, the live route is a release blocker and not a safe candidate.
2. **Source control and deployment:** freeze, obtain three exact-version reviews where required, commit, push, obtain green CI, inspect the Preview, and promote only with separate authorization. The current local work has not been deployed.
3. **Commercial-readiness controls:** keep all eight server-only `SNICKERDOODLE_*` commercial gates false unless their exact retained evidence exists. Keep `SNICKERDOODLE_ALLOWED_ORIGIN` server-only and exact. Flags record approval but never grant it. Verify closed-mode page/API/invite behavior in Preview and canonical production before any external motion.
4. **Pending production security migrations:** local disposable proof includes owner digest `975ba25c…a8bd2`, assignment digest `8c12c541…2953f`, restore-order digest `57fdb96c…b0f43`, and current payment/manager successor digest `fddf2a83…efbac`. Obtain separate production owner authorization; verify the entire filename-order chain, active-owner/Auth/function-owner/ACL/Cron preflight, provider migration-ledger state, and rollback/forward-fix plan before any application. Run exact owner/assignment/session/manager/payment/ACL postflight. Do not deploy before production completion.
5. **Supabase account setting:** enable leaked-password protection in the Supabase Auth password-security settings, or document why password login is out of scope.
6. **Production route:** confirm the Racoben parent rewrite targets the intended production deployment and verify the canonical route after promotion.
7. **Hosted runtime:** reconcile the Vercel project Node `24.x` setting with the exact candidate's certified Node `22.x`, then prove the Preview and production deployment commit, route, and health endpoint.
8. **Operational ownership:** assign the product-question inbox, future pending-intake review, fulfillment, incident response, and rollback roles. G5 external motion remains unassigned.
9. **Reviewer and capacity:** keep the prospective independent marketing reviewer on HARD HOLD until CEO designation/assignment, availability/training confirmation, classification/conflict/IP clearance, least-privilege per-order access approval, and two timed synthetic rehearsals establish safe capacity.
10. **Legal review:** have an appropriate reviewer confirm the privacy notice, terms, claims, refund handling, and jurisdiction-specific requirements.
11. **Monetary governance:** obtain documented CFO+CRO concurrence for the candidate price and every price, fee, refund/chargeback term, provider commitment, fulfillment payment, budget exception, and other monetary term; concurrence does not authorize external action.
12. **Backup and restore:** exact local selected application/Auth/owner/default-ACL/Cron recovery and postflight pass between distinct disposable systems. The manual source has no provider ledger. Verify hosted provider-ledger behavior, backup/PITR coverage and retention, restoration authority and RTO/RPO, managed-service ownership/ACL equivalence, and a production-like no-egress restore before treating the database as a customer-order system.
13. **Payments:** keep `SNICKERDOODLE_PAYMENTS_ENABLED=false` until the exact provider-bound test-mode journey, alert ownership, recovery, legal/monetary, preview/rollback, and final go-live gates pass. The implementation is executable but a flag records authorization; it does not grant it.
