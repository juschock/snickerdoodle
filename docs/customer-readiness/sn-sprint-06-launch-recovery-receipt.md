# SN Sprint 06 immutable launch-recovery receipt

Disposition: local/synthetic PASS candidate, version 1.0.6. Baseline commit `6d3d1380c4ac14d597d1a2673fee73f25837440e`, baseline tree `fb5eb8247aaa020a8f795ff32f2de13f9b5c2185`. Final commit, tree, parent, and patch identities are attached after commit in Git notes ref `sn-sprint-06` to avoid a self-referential receipt commit.

## Exact recovery unit

No migration was added. The exact 20-migration ledger is `docs/customer-readiness/sn-sprint-06-baseline-migration-shas.txt` (SHA-256 `144d209da0c2b90901ab5ca2f2909b05f14011565c465c98de61389c5a857b38`); every hash was verified before both source and prior-snapshot replay.

- Rehearsal `scripts/db/launch-recovery-rehearsal.sh`: `a0ec0c79738af23ce0c7b2641f7f4024d843ce6d1b16eefc0ec44fec1bb0d8b0`.
- Queue rebuild `scripts/db/rebuild-intake-manager-queue.sql`: `07f8d092658aa12063d12557a5c96b4e6c3c95a7d6e6554dca5bd5f3b6e64258`.
- Postflight `scripts/db/sn06-recovery-postflight.sql`: `7ecf8eba0d1ce6b5bbf995657b44c28f542f9bdac8cc9e418a90380b6e058e09`.
- Prior fixture/tombstone replay: `0751618fe9631fda84fffe6b772cd74eccd6462facf3c2f885cfb24f77b14cf8` / `e10899816d4aa0305559bceacfeab7dc037b80a6c6bfe4667dd9b85ec35e2fe1`.
- Blob reconciliation `scripts/recovery/synthetic-blob-reconciliation.sh`: `8aa84097af6767154bb07dd391d5b56f7b8870342e757ea72535cdec1c36641f`.
- Recovery contract/runbook: `b919de1d0ec1659aa51e58dc4ef0f61900b9b9edffa8c70d2590278c62e4ac59` / `bcf3b9c74509578c93c12ae803b18736be79ff7eacefed6a1c9652c5e5e7d01c`.

## Destructive restore evidence

PostgreSQL 17.5 current-state logical backup SHA-256 `6a9b6b46fbe9b283245846f3ed1e3da6a3b5c32f964acf8f71ad7a49ccae4ece`, mode 0600, was generated under a mode-0700 temporary root and removed by the guarded exit trap. Measured locally: backup 99 ms; empty-target restore 153 ms; post-restore verification 4,277 ms; restore+verification 4,430 ms; prior-19 restore/forward-20/canonicalization/tombstone 620 ms. The tested local recovery-point loss was zero committed writes between snapshot and destruction; this is not a hosted cadence or SLA.

The current snapshot restored with exact data, sequence, non-audit-sequence, object-count, and row-count fingerprints. PostgreSQL logically normalized redundant parentheses in only `stripe_webhook_receipts_last_error_code_check`; the harness permits exactly that two-line/one-hunk semantic normalization and no other schema diff. Restored canonical schema hash is `9b8ad17cb9075681f38b7a1470dc7bba886e0886fbfc771fb7440a93ebda75e1` across 809 selected objects.

Final prior-snapshot-forward/tombstone database fingerprint: `9b8ad17cb9075681f38b7a1470dc7bba886e0886fbfc771fb7440a93ebda75e1|9b8ad17cb9075681f38b7a1470dc7bba886e0886fbfc771fb7440a93ebda75e1|9901bc29923d9d7fe8fa2550c6c7af28602b552c7e04aedbb24dd416bd23ab95|72bde60c804c434c29705da9f16768b6e6b4d311f51b607d818707871880fbb4|188f4233edca8fff10fd187e42d069d5de1d657e5b9a7d1339df0d8acebc687c|809|809|39`.

## Acceptance evidence

- Node v22.23.2, npm 10.9.8; Vitest 25 files / 141 tests PASS; ESLint PASS; Next type generation and TypeScript PASS.
- Closed and gate-true production builds PASS, 21 routes each. Closed Playwright 5/5 PASS; hold Playwright 3/3 PASS.
- PG17 current snapshot destructive restore PASS; privacy postflight, derived queue/index corruption/rebuild, ORD-03, manager queue, SN04 privileged RPC/AAL2/assignment/search-path/direct-table corpus, SN03 lifecycle and terminal-race corpus PASS.
- Concurrency PASS: 100 distinct intents, 10 paid graphs, duplicate event x5 with one effect, two independent fulfillment operations, no cross-customer blocking.
- Prior accepted 19-migration snapshot restore plus forward migration to 20 PASS; newer synthetic deletion tombstone reapplied before reopen and the restored identity/content remained anonymized.
- Synthetic blob corpus PASS: one missing object restored by hash, one orphan removed, one tombstoned object withheld; manifest/object modes 0600 and guarded cleanup PASS.
- Pinned Gitleaks 8.30.1: 30 source-history commits and current candidate PASS, no leaks. `npm audit --omit=dev`: 0 vulnerabilities. `git diff --check`: PASS.

## Evidence ceiling and open gates

This is local logical-database, synthetic-identity, and synthetic-blob evidence. Hosted Supabase backup/PITR/cadence/restore, Auth configuration, Storage inventory and policies, provider-side privacy propagation, Stripe signed reconciliation, Vercel config/rollback, production observability, secure export delivery, real identity verification, and approved legal retention/accounting rules remain unproved and block production reopen. No push, deploy, provider/account mutation, real/customer data, payment/refund, email, publication, or production action occurred.
