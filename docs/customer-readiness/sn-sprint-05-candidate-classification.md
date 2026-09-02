# SN Sprint 05 candidate classification

Baseline: branch `agent/snickerdoodle-stripe-checkout`, commit `3b6e97ff1310066c0ca958e0aaf4ebbb9d341e10`, tree `99de5af05c4b7155f49ef18c6a76108bbe0b0d3d`, version `1.0.4`. Baseline index was empty. Baseline porcelain-v1-z SHA-256 was `79164268aa1e2b6dbfb1aba2ba41cb01224c2a6b429c099c222b6c927ea7b9f6`.

## A — required coherent 1.0.5 candidate

- `package.json`, `package-lock.json`: version-only 1.0.5 custody.
- `lib/database.types.ts`: public privacy columns and RPC types.
- `supabase/migrations/20260902064553_implement_privacy_lifecycle_and_retention.sql`: forward-only privacy schema, resolver, state machine, raw-intake boundary, export/correction/restriction/anonymization, retention mechanism, access controls.
- `scripts/db/privacy-lifecycle-acceptance.sql`: synthetic row-level privacy corpus.
- `scripts/db/privacy-lifecycle-replay.sh`: PostgreSQL 17 full-chain replay and SN03/SN04 regression runner.
- `scripts/db/privileged-rpc-access-acceptance.sql`: exact successor authenticated privileged-RPC and metadata-only table inventory.
- `scripts/security/scan-secrets.sh`: exclude derived Git-note receipt refs while retaining all source-history and current-candidate scanning.
- `tests/privacy-lifecycle.test.ts`: static contract and exact-byte pins.
- `docs/privacy/data-subject-graph.md`, `docs/privacy/retention-field-matrix.md`, `docs/privacy/privacy-request-state-machine.md`: authoritative implementation boundaries.
- `docs/customer-readiness/sn-sprint-05-baseline-migration-shas.txt`: accepted 19-migration predecessor ledger.
- This classification and `docs/customer-readiness/sn-sprint-05-privacy-lifecycle-receipt.md`.

## B — generated/test artifacts, excluded

`.next/`, Playwright output, dependency directories, downloaded scanners, and disposable PostgreSQL clusters are ignored/generated and excluded from custody. None is staged.

## C — unrelated/user residue, byte-preserved and excluded

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`: SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `docs/marketing/`: sorted per-file SHA-256 listing aggregate `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

No category C path is staged, edited, deleted, or included in the sprint commit.
