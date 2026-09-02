# SN Sprint 04 privileged-access receipt

## Candidate

- Version: `1.0.4` from `1.0.3`.
- Parent: `c0e1b6287f44728ff9ef362bd39ebeb78838b2b1`.
- New migration:
  `supabase/migrations/20260902052346_harden_privileged_rpc_access.sql`,
  SHA-256 `69cae93f2f2b4cc853aef504a7278e42520fca45b9c22138e7b488a0be89396c`.
- Access corpus:
  `scripts/db/privileged-rpc-access-acceptance.sql`, SHA-256
  `0c0816e419f34de548ab1f1b1556ec09c804120dd1107e590ab282f1d3f14091`.
- Exact commit/tree/patch identities are attached as the local Git note
  `sn-sprint-04` after the isolated commit so the receipt does not claim a
  self-referential Git identity.

Prior migration bytes remain unchanged:

- SN01 multi-customer migration:
  `b26e7c51ad3a1007181d58960698d8dcd804592c06727244a5b4020ba85323cb`.
- SN02 terminal-reconciliation migration:
  `4c8a1dab63eff51339b0d32a06302bfb1a80064a827485d21a22277abbb951ed`.
- SN03 state-machine migration:
  `45759af59658153dce1eeaebcf9219d385e19c34b26f1437df11f7949cf72e2c`.

## Authorization result

- Effective application catalog: 41 routines, 35 `SECURITY DEFINER`.
- Unsafe elevated search paths: `0`; anonymous elevated executions: `0`.
- Authenticated elevated surface: exactly eight named RPCs in
  `docs/security/privileged-access-matrix.md`.
- Browser table DML: none across `public` and `private` application tables.
- All application tables retain RLS; private receipt/idempotency tables remain
  forced RLS where designed.
- Assignment administration, manager queue, paid-brief retrieval, payment
  health, and owner fulfillment require a live active owner at AAL2.
- Service-lead/reviewer access remains live-session, active-profile,
  exact-order assignment scoped. Revoke, expiry, deactivation, and reassignment
  are checked at action time.
- Fulfillment denial is metadata-audited without order mutation. Valid calls
  retain the SN03 locked/idempotent transaction.
- All four private successor implementation functions are non-callable by
  `PUBLIC`, `anon`, `authenticated`, and `service_role`.

## Regression found and fixed

The inherited unified payment RPC locked only the provider event ID. Different
event IDs for the same Checkout intent could therefore enter concurrently; a
late terminal call could retain a pre-payment statement snapshot after waiting
for the paid transaction. The successor wrapper takes one transaction advisory
lock derived only from the local Checkout intent before entering the unchanged
SN03 body. The terminal paid/expired/async-failure race now resolves to one paid
order with durable non-regressive evidence. Unrelated intents use different
keys and the 100-intent parallel corpus remains green.

## Local validation

- Runtime: Node `22.23.2`, npm `10.9.8`, PostgreSQL `17.5`, Supabase CLI
  `2.31.8`.
- Fresh filename-order replay: 19 migrations PASS. Homebrew lacks `pg_cron`, so
  only the extension installation statement used the established API-compatible
  disposable stub; project migration bytes otherwise ran unmodified.
- SN04 access/adversarial corpus: PASS.
- ORD-03 lifecycle and concurrency corpora: PASS.
- Manager AAL2/paid-brief/keyset corpus: PASS.
- SN03 lifecycle corpus: PASS.
- Terminal paid/failure race: PASS.
- Parallel state-machine corpus: PASS — 100 intents, 10 paid graphs, one event
  delivered five times, and two isolated fulfillment transitions.
- Unit/static: 127/127 PASS; lint PASS; typecheck PASS.
- Builds: closed and gate-true 21-route builds PASS.
- Browser: closed 5/5 and commercial-hold 3/3 PASS.
- Gitleaks history/worktree: PASS; npm production audit: 0 vulnerabilities.

Supabase CLI `db lint` could not enable its optional local `plpgsql_check`
extension. This is an environment warning, not a substituted PASS. The exact
catalog queries and executable adversarial corpus are the local function/grant
evidence. Hosted Supabase Security Advisor remains pending.

The historical SN01 concurrency shell is retained unchanged as historical
evidence but is no longer an executable current gate: it intentionally calls
low-level payment RPCs revoked by SN03 and expects an expired intent never to
accept later authoritative success, contradicting the canonical SN03 state
machine. Its covered 2/10/100, replay, isolation, and fulfillment behaviors are
superseded by the current SN03 parallel corpus.

## Hosted-only residuals

No hosted Supabase migration, Auth/TOTP session, PostgREST schema exposure,
Security Advisor, backup/restore, or provider-default-privilege proof occurred.
No Stripe, Vercel, DNS, email, customer, collaborator, payment, refund, push,
deployment, publication, or production action occurred.
