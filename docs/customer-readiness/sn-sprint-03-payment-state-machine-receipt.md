# SN Sprint 03 immutable candidate receipt

## Candidate boundary

- Version: `1.0.3` (from `1.0.2`)
- Branch: `agent/snickerdoodle-stripe-checkout`
- Parent: `1b6bcd0aedf221d4366699aaae1b7e7f43dc3479`
- Parent tree: `01815a3e34e7b01fe1d0530bd7c0d05b16331d29`
- Runtime: Node `v22.23.2`, npm `10.9.8`, PostgreSQL `17.5`
- Locked application versions: Next `16.3.3`, React/React DOM `19.2.8`,
  Stripe `22.4.0`, Supabase JS `2.110.5`

The final commit, tree, parent-to-commit binary patch SHA-256, and final
working-tree residue are recorded in the local `sn-sprint-03` Git note attached
after the candidate commit. A commit cannot contain its own object identity
without changing that identity.

## Authoritative lifecycle

`lib/payment-state-machine.ts` is the machine-readable event map used by the
verified webhook route. It records provider event, source states, destination,
forbidden regressions, provider object, affected rows, transaction boundary,
idempotency, terminal precedence, and reconciliation behavior.

`public.process_stripe_payment_event(...)` is the only service-role payment
mutation entrypoint. One database transaction claims/deduplicates the event,
validates the exact intent/Session/PaymentIntent/Customer/charge/dispute and
server-owned 9,900-cent USD binding, mutates the exact order graph, synchronizes
the manager queue and activity/reconciliation metadata, and completes the
receipt. Its inner subtransaction rolls back every business effect before the
outer transaction records `failed_retryable`. The older low-level routines
remain migration-era implementation details and have no service-role execute
grant.

`public.transition_order_fulfillment(...)` applies live-session owner or exact
`service_lead` authorization, one order row lock, expected-source-state
checking, request idempotency, queue synchronization, and an activity receipt.

## Exact evidence identities

- New migration `20260902044710_prove_payment_state_machine.sql`:
  `45759af59658153dce1eeaebcf9219d385e19c34b26f1437df11f7949cf72e2c`
- State-machine SQL corpus:
  `8cdcb45d18be16a7fd2e47b29dd340210ee809296f2f2e0abbda4f91094880d0`
- Parallel harness:
  `de1efbda45f677771eefb453f6674e461b60c033f69f09cadf2c402135c2d35b`
- Preserved Sprint 01 migration:
  `b26e7c51ad3a1007181d58960698d8dcd804592c06727244a5b4020ba85323cb`
- Preserved Sprint 01 harness:
  `127291756b697d56417d89374e6402f91b1afdfa4c0ef6acee2bf02f67ed61c0`
- Preserved Sprint 02 race migration:
  `4c8a1dab63eff51339b0d32a06302bfb1a80064a827485d21a22277abbb951ed`

The three SN03 hashes above are pre-receipt identities and are recomputed in
the final Git note if candidate documentation changes the aggregate patch; the
source files themselves are frozen before the final decisive rerun.

## Acceptance evidence

- Vitest: PASS, 22 files / 122 tests.
- ESLint: PASS.
- Next type generation + TypeScript: PASS.
- Default-closed production build: PASS, 21 routes.
- Test-only commercial-gate build: PASS, 21 routes.
- Default-closed Playwright: PASS, 5 Chromium journeys.
- Commercial-gate/hold Playwright: PASS, 3 Chromium journeys.
- Gitleaks history and working-tree scan: PASS, no leaks.
- Production dependency audit: PASS, zero vulnerabilities.
- Fresh 18-migration replay: PASS on PostgreSQL 17.5. The local Homebrew
  environment lacks `pg_cron`; replay substituted only that extension
  declaration with a disposable API-compatible cron schema. All 18 project
  migration files otherwise ran in filename order and the exact SN03 migration
  ran unmodified. This is not hosted pg_cron evidence.
- Row-level state-machine corpus: PASS. It proves successful payment, duplicate
  event x5, transaction failure and retry, expiry, asynchronous failure, later
  legitimate success, full and partial refund behavior, dispute open/won/lost,
  stale terminal delivery, cross-customer provider-ID substitution denial,
  mixed queue states, simultaneous-safe order closure, and catalog grants.
- Parallel corpus: PASS. It proves 100 independent intent/reserve/bind flows,
  10 simultaneous paid customer graphs, one effective transition for an event
  delivered five times, and two simultaneous isolated fulfillment starts.
- The frozen Sprint 02 paid-versus-terminal race remains covered by its
  unchanged migration/hash and by the successor stale-terminal regression.

## Warnings and hosted-only residuals

- This is local synthetic proof, not Stripe delivery or hosted Supabase proof.
- Hosted migration application, provider transaction behavior, signed Stripe
  test event delivery, restricted runtime key, webhook endpoint, manager Auth
  provisioning, backup/restore, preview/rollback, and production promotion are
  outside this sprint and remain separately gated.
- Commercial readiness and payment activation remain fail closed unless every
  existing runtime gate is enabled. No browser redirect or query parameter is
  payment truth.
- No remote, provider, deployment, DNS, mail, payment/refund, customer-data,
  publication, spend, push, or production action occurred.
