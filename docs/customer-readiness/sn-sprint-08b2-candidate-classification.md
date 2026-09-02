# SN08B.2 RC.3 candidate classification

Baseline: `1.1.0-rc.2`, commit `da72dab6cbdf9f8dcc23e6e751725d4b41f2f6d9`, tree `af4be6e5b0b6422e64aab958731c8f5d744af991`.

## Category A — exact RC.3 candidate

- Runtime identity: `package.json`, `package-lock.json`, `lib/stripe.ts`, `tests/local-launch-rc.test.ts`.
- Superseded, previously unapplied migration: `supabase/migrations/20260902064553_implement_privacy_lifecycle_and_retention.sql`.
- Detector and dual-path proof: `scripts/db/privacy-detector-supersession-acceptance.sql`, `scripts/db/privacy-lifecycle-replay.sh`, `scripts/db/hosted-legacy-reconciliation.sh`, `scripts/db/launch-recovery-rehearsal.sh`.
- Static regression: `tests/privacy-lifecycle.test.ts`, `tests/privacy-detector-supersession.test.ts`.
- Ledger and chronology: `docs/customer-readiness/sn-sprint-08b2-migration-shas.txt`, `supabase/migrations/README.md`.
- Current release labels only: `docs/release/environment-contract.md`, `docs/release/hosted-readiness-manifest.md`, `docs/release/rollback-boundary.md`, `docs/release/route-access-inventory.md`.
- Exact adjudication, this classification, and `docs/customer-readiness/sn-sprint-08b2-immutable-receipt.md`.

All 20 migration files preceding the privacy migration remain byte-identical to
RC.2. Historical SN01–SN08A receipts and version references are intentionally
unchanged.

## Category B — frozen exclusions

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`: untracked binary SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `docs/marketing/`: untracked sorted path-plus-content aggregate SHA-256 `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

## Category C — preserved prior operational evidence

- `docs/customer-readiness/sn-sprint-08b-provider-receipt-2026-09-02.md`: untracked SHA-256 `cd74752d8e3f6041c35dcda9427ff05ae9feb1307f07a6037ff38f8d621154f6`.

Categories B and C remain unmodified, unstaged, and excluded from the RC.3
commit. No other unrelated tracked or staged residue is accepted into custody.
