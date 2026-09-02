# SN Sprint 01 task-owned patch manifest

This manifest isolates the sprint-owned delta because a safe Git commit cannot
be constructed from the current index: the effective payment migrations,
database harnesses, and payment route tests are absent from `HEAD`, while the
tracked Checkout/webhook routes contain prerequisite launch work that predates
this sprint. Staging whole files would absorb unrelated work; staging only the
sprint hunks would produce a commit that cannot apply to `HEAD`.

## Sprint-owned new files

- `supabase/migrations/20260901163504_enable_multi_customer_payment_concurrency.sql`
- `scripts/db/multi-customer-payment-concurrency.sh`
- `tests/multi-customer-payment-concurrency.test.ts`
- `docs/customer-readiness/sn-sprint-01-multi-customer-payment-concurrency.md`
- this manifest

## Sprint-owned overlapping hunks

- `app/api/checkout/route.ts`: narrow the reservation result to `reserved | same`
  and remove the obsolete package-capacity 409 branch/copy.
- `app/api/stripe/webhook/route.ts`: remove translation of obsolete global
  capacity SQL errors; retain one durable generic finalization failure.
- `tests/payment-routes.test.ts`: replace the occupied-singleton route case with
  an independent-reservation success case and expect the generic finalization
  error for any obsolete provider fixture.
- `tests/multi-customer-payment-concurrency.test.ts`: reject the obsolete
  operational singleton wording and require concurrent, isolated order
  handling in each reconciled process document.
- `docs/internal-automation-pipeline.md`: replace the sequential singleton
  pilot instruction with capacity-gated concurrent, per-order-isolated work.
- `docs/marketing-plan-zero-budget.md`: replace the global active-order ceiling
  and outreach brake with staffing-, reviewer-, delivery-, and quality-capacity
  gates for independent orders.
- `docs/studio/studio-architecture.md`: make Studio concurrency capacity-gated
  and require isolated order records/workflows.
- `docs/studio/phase-plan.md`: retain first-order learning evidence without
  serializing capacity-gated concurrent independent orders.
- `package.json`: root version `1.0.0` to `1.0.1` only.
- `package-lock.json`: top-level and root-package versions `1.0.0` to `1.0.1`
  only.

## Explicit exclusions

The pre-existing staged deletion of `next-env.d.ts` and every unrelated tracked,
untracked, or deleted path remain outside this sprint. No commit, reset, clean,
checkout, push, remote access, provider mutation, deployment, or publication is
part of this artifact.
