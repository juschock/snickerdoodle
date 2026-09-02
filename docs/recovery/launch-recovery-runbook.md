# Snickerdoodle launch recovery runbook

## Closed-state rule

Set and independently verify the public/commercial surface closed before restoration. Do not accept checkout, intake, customer access, manager work, provider reconciliation, or collaborator access during recovery. Failure or ambiguity at any step leaves the service closed.

## Immutable inputs

Record the candidate commit/tree, patch hash, package/lock version, runtime, exact migration hashes, backup hash and mode, source provider/project/database identity, target identity, environment-name inventory, blob manifest, durable privacy-tombstone ledger watermark, and rollback snapshot. Never place secret values or customer content in the receipt.

## Ordered procedure

1. Confirm incident authority, closed state, source/target identities, and destructive-target approval. Preserve the old target for forensics when possible.
2. Acquire a transaction-consistent database snapshot and separate blob manifest/snapshot. Record hashes, timestamps, permissions, and the privacy-ledger watermark. A database dump does not cover blobs, Stripe, Auth/provider settings, functions, or deployment configuration.
3. Restore PostgreSQL into an empty target; do not merge it into an unknown schema.
4. Verify dump integrity, migration ledger, PostgreSQL compatibility, schema/owner/ACL/RLS/policy/trigger/function/index/sequence inventory, and authoritative row invariants.
5. Apply only forward migrations newer than the snapshot, in exact ledger order. Re-run schema parity.
6. Reconcile blob inventory and hashes. Quarantine missing, orphaned, mismatched, or unowned objects; do not make them customer-visible.
7. Replay durable privacy tombstones and deletion/anonymization actions newer than the snapshot across database rows, exports, and blobs. Verify that an older backup did not permanently resurrect a subject.
8. Rebuild only declared derived state: manager queue, approved indexes, application build, and caches. Validate every rebuilt item against its authoritative source.
9. Prove payment identity uniqueness and event dedupe. Reconcile with Stripe only under separately approved provider access; ambiguous items remain attention records and cannot be fulfilled.
10. Run owner+AAL2, assignment expiry/revocation, cross-customer denial, direct-table denial, RLS/search-path, privacy, queue, payment, fulfillment, and smoke/browser checks.
11. Verify observability and rollback readiness. A named operator reviews the immutable receipt.
12. Reopen only with explicit action-time authority after every gate is PASS. Restore failure, unknown provider state, missing blobs, privacy replay failure, schema drift, or incomplete auth proof requires rollback or continued HOLD.

## Local executable rehearsal

Run `bash scripts/db/launch-recovery-rehearsal.sh` with PostgreSQL 17. It verifies all 20 accepted migration bytes, creates a permission-restricted synthetic snapshot, destroys and recreates a distinct target database, performs exact inventory comparison, runs payment/auth/privacy/queue regressions, corrupts and repairs only derived queue/index state, restores a 19-migration prior snapshot and migrates it forward, reapplies a newer synthetic privacy tombstone, and runs synthetic blob manifest reconciliation. Temporary clusters and dumps are removed by an exact-path trap.

The printed backup/restore/verification durations are local measurements. The tested local recovery-point loss is zero committed writes between the logical snapshot and destructive restore. Neither result is a hosted cadence, RPO, RTO, availability promise, or production restore proof.

## Failure and rollback

Stop on the first failed command. Keep public/commercial routes closed. Do not patch the restored database ad hoc. Preserve sanitized logs and artifact identities, reset to the last known-good target/snapshot, correct procedures in a new reviewed candidate, and repeat from step 1. Never reuse a receipt after source, migration, config, backup, target, or script bytes change.
