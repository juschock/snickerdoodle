# SN Sprint 03 candidate classification

## Baseline

- Sprint: `SN Sprint 03 — Payment State-Machine Proof`
- Version: `1.0.2` to `1.0.3`
- Branch: `agent/snickerdoodle-stripe-checkout`
- Parent commit: `1b6bcd0aedf221d4366699aaae1b7e7f43dc3479`
- Parent tree: `01815a3e34e7b01fe1d0530bd7c0d05b16331d29`

## Category A — coherent 1.0.3 candidate

- `app/api/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `lib/database.types.ts`
- `lib/payment-state-machine.ts`
- `lib/stripe.ts`
- `package.json`
- `package-lock.json`
- `scripts/db/payment-state-machine-acceptance.sql`
- `scripts/db/payment-state-machine-concurrency.sh`
- `supabase/migrations/20260902044710_prove_payment_state_machine.sql`
- `tests/intake-receipt-boundary.test.ts`
- `tests/payment-boundary.test.ts`
- `tests/payment-launch-safety.test.ts`
- `tests/payment-routes.test.ts`
- `tests/payment-state-machine.test.ts`
- `docs/customer-readiness/sn-sprint-03-candidate-classification.md`
- `docs/customer-readiness/sn-sprint-03-payment-state-machine-receipt.md`

These files comprise one lifecycle unit: a machine-readable transition map,
one signed-event route/RPC transaction, the forward schema transition,
order-scoped fulfillment transitions, generated schema types, exact fixtures,
regression assertions, and the version/receipt boundary.

## Category B — generated or test residue

Build, type-generation, Playwright, and dependency-install outputs remain
ignored and are not candidate paths. No generated output is staged or
committed.

## Category C — unrelated preserved work

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`
  - SHA-256: `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`
- `docs/marketing/`
  - sorted file-content aggregate SHA-256:
    `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`

Both paths predate this sprint, are out of scope, and remain untracked and
unmodified. The candidate commit must leave them uncommitted.

## Historical identities preserved

- Sprint 01 migration:
  `b26e7c51ad3a1007181d58960698d8dcd804592c06727244a5b4020ba85323cb`
- Sprint 01 harness:
  `127291756b697d56417d89374e6402f91b1afdfa4c0ef6acee2bf02f67ed61c0`
- Sprint 02 terminal-race migration:
  `4c8a1dab63eff51339b0d32a06302bfb1a80064a827485d21a22277abbb951ed`

They were verified byte-identical and are not category A changes.
