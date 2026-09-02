# SN Sprint 04 candidate classification

- Sprint: `SN Sprint 04 — Privileged RPC and Access Hardening`
- Baseline: `c0e1b6287f44728ff9ef362bd39ebeb78838b2b1`
- Baseline tree: `52789ee7cb88da05ff6488c8b9e69d63739ce66b`
- Version: `1.0.3` to `1.0.4`

## Category A — coherent 1.0.4 candidate

- `package.json`
- `package-lock.json`
- `lib/stripe.ts`
- `supabase/migrations/20260902052346_harden_privileged_rpc_access.sql`
- `scripts/db/privileged-rpc-access-acceptance.sql`
- `scripts/db/ord03-acceptance.sql`
- `scripts/db/ord03-concurrency.sh`
- `scripts/db/intake-manager-queue-acceptance.sql`
- `scripts/db/payment-terminal-race-concurrency.sh`
- `scripts/db/security-successor-recovery.sh`
- `tests/privileged-access-hardening.test.ts`
- `tests/migration-integrity.test.ts`
- `docs/security/privileged-access-matrix.md`
- `docs/customer-readiness/sn-sprint-04-candidate-classification.md`
- `docs/customer-readiness/sn-sprint-04-privileged-access-receipt.md`

The existing ORD-03 and manager fixtures now supply the assurance and unified
event boundaries required by the effective SN03/SN04 schema. Historical
receipts keep their historical hashes; current executable recovery pins the
successor hashes. The terminal-race harness now exercises the sole atomic
payment event RPC and removes its own metadata-only queue fixture.

## Category B — generated/ignored artifacts

Build, test, package-cache, Playwright, and disposable PostgreSQL files remain
ignored and are not candidate inputs.

## Category C — preserved unrelated residue

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`
  — SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`
- `docs/marketing/` — sorted per-file aggregate SHA-256
  `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`

Neither category C path is staged, modified, or included in the sprint commit.
