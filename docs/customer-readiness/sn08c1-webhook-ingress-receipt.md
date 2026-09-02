# SN08C.1 webhook-ingress immutable receipt

Status: **FROZEN LOCAL PASS**. External actions: none.

## Custody

- Product/version: Snickerdoodle `1.1.0-rc.3` (unchanged).
- Authoritative application baseline: commit
  `380cee4bb475b3b9e45b4b580931a4025e2aa816`, tree
  `2368420fc27b0bfd631b5ac4df7dc67f4e2a22d5`.
- Evidence-only parent: `613c7f6e4c024b5781ed90db0707d09d46fead7f`.
- SN08C.1 candidate commit: `ea0e4be94c35880f32a3d95a9068e40551c06769`.
- Candidate tree: `4d4ffaff54033a3a15e8a46f88051ecfd60aab11`.
- Parent-to-candidate binary patch SHA-256:
  `e62f08f7620c24de28e861c2bfa40ce2938d5ea18b541c9b03449914668848b5`.
- Candidate inventory: 27 task-owned paths. Index is clean. Only the three
  classified pre-existing exclusions below remain untracked.

## Architecture and boundaries

- Shared server-only verifier/normalizer/fixed-RPC handler SHA-256:
  `1c6a337b365a57241588ef277be258e22cfa0e9981f752ae33891ca48e9dd9d2`.
- Both the protected app adapter and separate ingress use that handler and its
  one literal `process_stripe_payment_event` call. The accepted service-role-only
  database RPC remains the sole transition engine and atomic transaction
  boundary. No migration, grant, policy, state machine, generic RPC, or direct
  table path was added.
- Separate project root: `services/snickerdoodle-webhook-ingress`. Its build
  exposes only `POST /api/stripe/webhook` plus framework `/_not-found`; HTTP
  proof returns 405 for GET/PUT/PATCH/DELETE, 404 for `/`, and 503 for an
  unconfigured POST.
- Runtime requires exact Snickerdoodle, sandbox, rc.3 source, Supabase project
  `iybwbnabyphpzlmzypga`, canonical project URL, service-role credential, and
  webhook secret identities. Live events/config and identity drift fail closed.
  There is no Stripe API key, public env, UI, health route, bypass credential,
  or caller-selectable RPC.
- Service manifest SHA-256:
  `d1186665f667d29850046b34b5cad11e7aad886dac9c5e5754a2cdcf1212ebfb`.
  Service lockfile SHA-256:
  `f7111d33c0ba11e686265f0ff99abfb5fcbfbd336d74d1c0bb74163b9b0cd88d`.
- Threat model SHA-256:
  `3c7def3acb11c6860ffe3e61a7d6b3213f710e2395af4b402bb61592d85382b3`.
  Candidate manifest SHA-256:
  `6800a1247c79e5e43cba453f596e5dc2def9357aa97cc6f93f55ad31ceaba9d0`.

## Frozen-candidate validation

- Toolchain: Node `22.23.2`, npm `10.9.8`.
- Root unit/static: 29 files, 165 tests PASS; focused shared webhook/payment
  boundary: 6 files, 42 tests PASS. This includes unsigned/bad/mutated-body
  denial, valid sandbox acceptance, live/project drift denial, duplicate x5,
  malformed/oversize/content/method handling, fixed RPC, secret-safe output,
  no UI, and equivalent normalized RPC input across both adapters.
- Root lint PASS; root typecheck PASS; normal and commercial-gate builds PASS,
  each with 21 routes.
- Separate ingress lint/typecheck/build PASS; two-route build inventory PASS;
  loopback HTTP surface PASS.
- Next.js Client Component negative build fails as required at the `server-only`
  boundary (`SERVER_ONLY_BOUNDARY_PASS`).
- Browser: 6/6 main journeys PASS and 3/3 commercial-hold journeys PASS,
  including manager AAL2, intake return, mobile, accessibility, closed routes,
  and fail-closed API behavior.
- Disposable PostgreSQL 17 destructive rehearsal PASS across all 21 existing
  migrations. Payment state machine, duplicate event x5, retry, terminal race,
  100 intents, 10 paid graphs, two isolated fulfillments, manager queue,
  privileged RPC/AAL2/assignment, privacy/tombstone, backup/restore, and
  post-restore event behavior PASS. No database byte changed in SN08C.1.
- Production dependency audits: root 0 vulnerabilities; ingress 0
  vulnerabilities. Full secret scan: 35 commits plus working candidate, no
  leaks. Exact staged scan: 261.38 KB, no leaks.

## Preserved exclusions

- `local-release-security-successor-manifest-2026-08-30.bin`:
  `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `sn-sprint-08b-provider-receipt-2026-09-02.md`:
  `cd74752d8e3f6041c35dcda9427ff05ae9feb1307f07a6037ff38f8d621154f6`.
- `docs/marketing/` aggregate:
  `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

## Remaining boundary

No Vercel project, deployment, environment variable, Stripe sandbox catalog,
webhook endpoint, provider secret, hosted canary, push, live charge, or public
promotion was created or changed. Provider execution remains paused for the
required guide continuation after this local PASS.
