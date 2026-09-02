# SN Sprint 05 immutable privacy-lifecycle receipt

Disposition: local/synthetic PASS candidate, version 1.0.5. Baseline commit `3b6e97ff1310066c0ca958e0aaf4ebbb9d341e10`, baseline tree `99de5af05c4b7155f49ef18c6a76108bbe0b0d3d`.

Final commit, tree, parent, and patch identities are attached after commit in Git notes ref `sn-sprint-05`; this avoids a self-referential receipt commit.

## Exact database unit

- Migration count: 20.
- New migration: `supabase/migrations/20260902064553_implement_privacy_lifecycle_and_retention.sql`, SHA-256 `0adaa00fdd6566dd7576f3757e8d75fafcc8c94618758e2882880d20623dd616`.
- Privacy corpus: `scripts/db/privacy-lifecycle-acceptance.sql`, SHA-256 `0c33ce412271492bfc4833818fd3a32e2d3cfd530eb42249ee1b2243918d8362`.
- Replay runner: `scripts/db/privacy-lifecycle-replay.sh`, SHA-256 `38e2614d16dcf7adcd19b4fbd8443748bae652d22589373270b17aadc5dcf135`.
- All 19 predecessor hashes are preserved in `sn-sprint-05-baseline-migration-shas.txt` and verified by the replay runner before execution.

The exact-email resolver, request state machine, export/correction/restriction/anonymization, raw-intake allowlist, explicit export expiry, inactive symbolic retention policies, forced-RLS private records, and owner+AAL2 action-time checks are implemented. The focused corpus proves multi-order export; same-account contact non-conflation; A/B isolation; correction; restriction; anonymization; retry/rollback; payment/refund/dispute/fulfillment/queue survival; and deterministic retention using only `.invalid` synthetic identities.

## Acceptance evidence

- Node `v22.23.2`, npm `10.9.8`.
- Vitest: 24 files, 134 tests PASS.
- ESLint PASS; Next type generation and TypeScript PASS.
- Closed build PASS, 21 routes; closed Playwright 5/5 PASS.
- Gate-true test build PASS, 21 routes; hold Playwright 3/3 PASS.
- PostgreSQL `17.5` clean replay: 20 migrations PASS.
- DB markers PASS: privacy lifecycle; ORD-03; manager queue; SN04 privileged RPC; SN03 payment lifecycle; 100 intents; 10 paid graphs; duplicate event x5; two independent fulfillment operations; terminal race.
- Pinned Gitleaks 8.30.1: 29 source-history commits and current candidate PASS, no leaks. Derived Git-note refs are excluded because they contain immutable receipt digests, not source history.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: PASS.

## Evidence ceiling and open gates

This is local database-policy and synthetic-identity evidence only. Hosted Supabase migration/advisor results, real identity verification, secure export delivery, provider backup propagation, and processor-specific deletion remain unproved. Legal retention periods, legal bases, litigation/dispute holds, and accounting/tax requirements remain unapproved; all duration-based policies therefore stay inactive. No provider, hosted database, Stripe, Vercel, customer, email, export delivery, deployment, push, or production mutation occurred.
