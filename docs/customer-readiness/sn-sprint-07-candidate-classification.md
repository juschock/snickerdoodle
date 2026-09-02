# SN Sprint 07 candidate classification

Baseline: `c01486dae367f87be049335d233f143de3a53c99` on `agent/snickerdoodle-stripe-checkout`, version `1.0.6`.

## Category A — RC candidate

- `package.json`, `package-lock.json`: exact `1.1.0-rc.1` package identity; dependency versions unchanged.
- `lib/stripe.ts`: Stripe application identity aligned with the RC.
- `docs/payment-operations.md`: current per-intent concurrency and single-payment-truth operating language.
- `scripts/db/launch-recovery-rehearsal.sh`: one final RC signal after the accepted recovery, payment, authorization, privacy, queue, terminal-race, and 2/10/100 successor concurrency corpora pass.
- `tests/local-launch-rc.test.ts`: version, route classification, effective singleton-residue, evidence composition, hosted-boundary, and rollback contract regression tests.
- `e2e/market-readiness.spec.ts`: synthetic private-intake form submission through the browser boundary to the explicitly non-authoritative checkout return; no provider call.
- `docs/release/environment-contract.md`, `hosted-readiness-manifest.md`, `rollback-boundary.md`, `route-access-inventory.md`, `sn07-milestone-ledger.md`: release/control artifacts.
- This classification and `sn-sprint-07-local-launch-rc-receipt.md`: custody evidence.

No schema or migration byte changes are part of SN07. All 20 accepted migration hashes remain exactly those in `docs/customer-readiness/sn-sprint-06-baseline-migration-shas.txt`.

## Category B — generated/test artifacts

Build, Playwright, coverage, database dumps, temporary clusters, and synthetic blob rehearsal data remain ignored and uncommitted. The recovery runner creates backups outside Git with mode 600 and deletes them on exit.

## Category C — preserved exclusions

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin` — untracked, SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `docs/marketing/` — pre-existing untracked marketing tree, aggregate SHA-256 `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860` under the established sorted path-plus-content algorithm.

Neither exclusion is staged, modified, inspected for publication approval, or included in the RC commit.
