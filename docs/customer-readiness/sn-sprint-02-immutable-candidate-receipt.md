# SN Sprint 02 immutable-candidate receipt

## Candidate boundary

- Version: `1.0.2` (from `1.0.1`)
- Branch: `agent/snickerdoodle-stripe-checkout`
- Parent: `5aaecb0491065d14814970a5ca871b68da484cb1`
- Parent tree: `9c2e9be651e5cb5fe757ad342841db9959deab0d`
- Runtime: Node `v22.23.2`, npm `10.9.8`, PostgreSQL `17.5 (Homebrew)`
- Locked primary versions: Next `16.3.3`, React/React DOM `19.2.8`, Stripe `22.4.0`, Supabase JS `2.110.5`

The exact commit, committed tree, and parent-to-commit binary patch SHA-256 are
recorded in the local `sn-sprint-02` Git note attached after the one candidate
commit. A commit cannot contain its own final object ID or patch digest without
changing that ID; the attached note and final sprint report close that
self-reference explicitly.

## Migration set

The clean replay applies these 17 forward migrations in lexical order:

1. `20260714000000_foundational_schema.sql`
2. `20260714202709_staff_authorization.sql`
3. `20260714203158_add_foreign_key_indexes.sql`
4. `20260714212250_stripe_checkout_orders.sql`
5. `20260716020843_harden_public_grants.sql`
6. `20260716041133_payment_operations_security.sql`
7. `20260829000000_serialize_owner_protection.sql`
8. `20260829081456_assignment_scoped_access.sql`
9. `20260829123000_engagement_graph_integrity.sql`
10. `20260830140200_payment_launch_safety.sql`
11. `20260830154048_allow_assignment_history_cascade.sql`
12. `20260830190850_make_activity_event_delete_actions_restore_order_independent.sql`
13. `20260830191310_add_privacy_safe_intake_manager_queue.sql`
14. `20260830194934_capture_checkout_terms_version.sql`
15. `20260830202804_harden_checkout_reconciliation_and_owner_aal2.sql`
16. `20260901163504_enable_multi_customer_payment_concurrency.sql`
17. `20260901231324_lock_terminal_reconciliation_to_checkout_intent.sql`

Candidate-specific evidence identities:

- Sprint 01 migration: `b26e7c51ad3a1007181d58960698d8dcd804592c06727244a5b4020ba85323cb`
- Sprint 01 harness: `127291756b697d56417d89374e6402f91b1afdfa4c0ef6acee2bf02f67ed61c0`
- Sprint 02 terminal-reconciliation migration: `4c8a1dab63eff51339b0d32a06302bfb1a80064a827485d21a22277abbb951ed`
- Payment lifecycle SQL: `843cebd2d2db29a8e7bdf93ed6d3853c8c0ccaed001e437befe46dcd74a55877`
- Payment concurrency: `170d74cf681c31432a63333c41709ef5eb27751e220b33eab6464e0108023898`
- Two-customer capacity successor: `5d8eccda218716303ad5becb166d5ce48f4364d0f4dcec439360ba85b5eb8412`
- Terminal-race harness: `3c3ccf7c9a437a22865aed938162c6bbcebdc363ffd3c546e5d204bf6f0eb10f`

## Acceptance results

- `npm ci --ignore-scripts=false --no-audit --no-fund`: PASS, 648 packages installed from the lockfile.
- Vitest: PASS, 21 files / 119 tests.
- ESLint: PASS.
- Next type generation + TypeScript: PASS.
- Default-closed production build: PASS, 21 routes.
- Test-only commercial-gate build: PASS, 21 routes.
- Default-closed Playwright: PASS, 5 Chromium journeys.
- Commercial-gate/hold Playwright: PASS, 3 Chromium journeys.
- Gitleaks history and working-tree scan: PASS, no leaks.
- Production dependency audit: PASS, zero vulnerabilities.
- Full dependency audit warning: one high-severity Browserslist advisory in the
  dev-only `shadcn` toolchain; the production dependency set is unaffected.
- Full 17-migration clean replay on PostgreSQL 17.5: PASS.
- ORD-03 SQL and concurrency: PASS.
- Engagement-graph integrity: PASS.
- Privacy-safe manager queue: PASS.
- Payment lifecycle, replay, refund/dispute/expiry handling: PASS.
- Concurrent independent customers: PASS for 2 simultaneous paid graphs and
  100 parallel intent/reserve/bind operations; the Sprint 01 harness additionally
  produced 11 isolated paid graphs, one duplicate transition, two isolated
  failures, and 11 stable paid-ready queue rows.
- Paid-versus-expired/async-failure terminal race: PASS after the exact-intent
  action-time recheck successor.
- Least privilege: PASS by SQL catalog audit — zero browser grants on sensitive
  payment tables/RPCs, all seven changed payment SECURITY DEFINER functions
  pin `search_path=""`, old capacity table/index absent, per-intent primary key
  and manager feed index present.

## Warnings and external residuals

- `supabase db lint` cannot enable `plpgsql_check` in the Homebrew disposable
  cluster because that extension is unavailable. Static integrity tests,
  clean replay, catalog least-privilege checks, and executable SQL harnesses
  pass; this is an environment warning, not hosted advisor evidence.
- The frozen two-cluster security recovery harness correctly refuses these
  Homebrew clusters because its reviewed authority requires Supabase Docker
  container identities (`172.16/12`, internal port 5432, postgres plus
  supabase_admin roles). No assertion failure was reclassified as environment.
- Hosted Supabase migration application, managed Auth/session/ACL proof,
  provider backup/restore, Stripe restricted key and webhook, signed provider
  payment journey, Vercel preview/rollback, live domain binding, staff
  provisioning, monetary/legal approval, and production promotion remain open.
- No provider, remote, deployment, payment, customer, or production mutation is
  credited by this local receipt.
