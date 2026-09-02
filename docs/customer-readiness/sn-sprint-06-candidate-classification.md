# SN Sprint 06 candidate classification

Baseline: branch `agent/snickerdoodle-stripe-checkout`, commit `6d3d1380c4ac14d597d1a2673fee73f25837440e`, tree `fb5eb8247aaa020a8f795ff32f2de13f9b5c2185`, version `1.0.5`. Baseline index was empty. Baseline porcelain-v1-z SHA-256 was `79164268aa1e2b6dbfb1aba2ba41cb01224c2a6b429c099c222b6c927ea7b9f6`.

## A — required coherent 1.0.6 candidate

- `package.json`, `package-lock.json`: version-only 1.0.6 custody; dependency versions unchanged.
- `docs/customer-readiness/sn-sprint-06-baseline-migration-shas.txt`: exact accepted 20-migration ledger.
- `docs/recovery/recovery-contract.md`: authoritative versus derived state, backup classes, invariants, and evidence ceilings.
- `docs/recovery/launch-recovery-runbook.md`: fail-closed restore, forward migration, blob/privacy/payment reconciliation, verification, reopen, and rollback order.
- `scripts/db/launch-recovery-rehearsal.sh`: loopback-only destructive PG17 current/prior snapshot rehearsal, exact inventory, prior-forward, post-restore regressions, measurement, restrictive artifact custody, and guarded cleanup.
- `scripts/db/rebuild-intake-manager-queue.sql`: deterministic repair of the metadata-only queue/index from authoritative source rows.
- `scripts/db/sn06-recovery-postflight.sql`: restored payment/privacy/assignment/fulfillment/queue/isolation/FK invariants.
- `scripts/db/sn06-prior-snapshot-fixture.sql`, `scripts/db/sn06-replay-privacy-tombstone.sql`: synthetic older-snapshot resurrection and newer durable tombstone replay proof.
- `scripts/recovery/synthetic-blob-reconciliation.sh`: synthetic separate-manifest missing/orphan/tombstone/hash reconciliation and cleanup proof.
- `tests/launch-recovery.test.ts`: static fail-closed and evidence-boundary regression contract.
- This classification and `docs/customer-readiness/sn-sprint-06-launch-recovery-receipt.md`.

No migration is added. All 20 predecessor migration bytes remain unchanged.

## B — generated/test artifacts, excluded

`.next/`, Playwright output, dependency directories, downloaded scanners, and all disposable PostgreSQL clusters/dumps/schema diffs/blob directories/manifests are ignored or created outside the repository and excluded from custody. Rehearsal artifacts use mode 0600 under a mode-0700 temporary root and are deleted by an exact-path trap. None is staged.

## C — unrelated/user residue, byte-preserved and excluded

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`: SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `docs/marketing/`: sorted per-file SHA-256 listing aggregate `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

No category C path is staged, edited, deleted, or included in the sprint commit.
