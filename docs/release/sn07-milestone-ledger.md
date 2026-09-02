# SN07 milestone ledger

This ledger binds the local `1.1.0-rc.1` release candidate to the accepted local evidence that precedes it. Historical receipts retain their original versions and identities.

| Milestone | Accepted local boundary | Evidence |
| --- | --- | --- |
| SN01 | Per-intent checkout reservations; 2/10/100 independent customer concurrency; no global order capacity | `docs/customer-readiness/sn-sprint-01-multi-customer-payment-concurrency.md`; migration `20260901163504_enable_multi_customer_payment_concurrency.sql` |
| SN02 | Reproducible launch/payment candidate and late-terminal race fix | Git note on `1b6bcd0aedf221d4366699aaae1b7e7f43dc3479`; SN02 receipt/classification |
| SN03 | One explicit payment state machine with atomic event processing, replay, refund/dispute, and fulfillment transitions | Git note on `c0e1b6287f44728ff9ef362bd39ebeb78838b2b1`; SN03 receipt |
| SN04 | Privileged RPC, AAL2 owner, assignment, RLS, grant, and direct-table denial proof | Git note on `3b6e97ff1310066c0ca958e0aaf4ebbb9d341e10`; access matrix and SN04 receipt |
| SN05 | Resolver, export, correction, restriction, anonymization/deletion, raw-intake, and retention lifecycle | Git note on `6d3d1380c4ac14d597d1a2673fee73f25837440e`; privacy artifacts and SN05 receipt |
| SN06 | Destructive PostgreSQL 17 backup/restore, queue rebuild, privacy tombstone replay, and synthetic blob reconciliation | Git note on `c01486dae367f87be049335d233f143de3a53c99`; recovery contract/runbook and SN06 receipt |

SN07 composes—not transfers or weakens—those exact boundaries. Its decisive database rehearsal replays all 20 migrations and runs the accepted payment, concurrency, authorization, privacy, queue, and recovery corpora on one disposable local target. Hosted/provider truth remains unproved.

The earlier `payment-launch-acceptance.sql`, `payment-launch-concurrency.sh`, `payment-capacity-concurrency.sh`, and exact accepted SN01 harness are retained as historical evidence only: their pre-SN03 service-role calls are superseded. They are deliberately excluded from the current RC runner. The successor atomic payment-state-machine concurrency harness re-proves the same 100 per-intent reservations, 10 independent paid graphs, duplicate-event and two-order fulfillment invariants against the final RPC surface; the separate terminal-race harness remains authoritative for late events.
