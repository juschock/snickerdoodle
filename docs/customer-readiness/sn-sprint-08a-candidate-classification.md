# SN Sprint 08A candidate classification

Baseline: `1.1.0-rc.1` commit `cfb7e0a5a268f58c0772abb5cbdf4cb0b71f8060`, tree `b5af672327b16664c4508ddc7e9b05cff58fdd41`.

## Category A — exact RC.2 candidate

- Runtime identity: `package.json`, `package-lock.json`, `lib/stripe.ts`, `tests/local-launch-rc.test.ts`.
- Single new migration and ledger documentation: `supabase/migrations/20260901160000_reconcile_provider_only_legacy_fulfillment.sql`, `supabase/migrations/README.md`, `docs/customer-readiness/sn-sprint-08a-migration-shas.txt`.
- Exact provider evidence fixture and convergence harness: `scripts/db/fixtures/hosted-20260831035135-close-paid-fulfillment.sql`, `scripts/db/hosted-legacy-reconciliation.sh`.
- Replay/count compatibility: `scripts/db/privacy-lifecycle-replay.sh`, `scripts/db/launch-recovery-rehearsal.sh`, `docs/privacy/privacy-request-state-machine.md`.
- Current release metadata: `docs/release/environment-contract.md`, `docs/release/hosted-readiness-manifest.md`, `docs/release/rollback-boundary.md`, `docs/release/route-access-inventory.md`.
- SN08 evidence: hosted preflight, provider inventory, this classification, `tests/provider-legacy-reconciliation.test.ts`, and immutable receipt.

## Category B — preserved exclusions

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`: untracked binary, expected SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `docs/marketing/`: untracked marketing aggregate, expected deterministic aggregate SHA-256 `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

Neither exclusion is staged, committed, rewritten, deleted, or used as release evidence. No unrelated Category C tracked changes existed at baseline.
