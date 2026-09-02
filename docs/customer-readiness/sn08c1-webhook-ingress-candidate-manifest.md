# SN08C.1 webhook-ingress candidate manifest

## Custody and scope

- Authoritative application baseline: `380cee4bb475b3b9e45b4b580931a4025e2aa816`.
- Authoritative application tree: `2368420fc27b0bfd631b5ac4df7dc67f4e2a22d5`.
- Preserved SN08B.3 evidence-only parent: `613c7f6e4c024b5781ed90db0707d09d46fead7f`.
- Product version remains `1.1.0-rc.3`; this is a separately deployable
  provider-integration service, not a new commercial application release.
- Scope is local/synthetic only. There is no migration or provider mutation.

## Topology and single-source proof

`lib/stripe-webhook-handler.ts` is the one shared server-only network adapter.
It bounds raw bytes, verifies `Stripe-Signature`, validates the event envelope,
enforces sandbox/live and offer integrity, applies the seven-event allowlist,
uses `normalizeStripePaymentEvent`, and invokes the literal
`process_stripe_payment_event` RPC. The accepted database function remains the
only transition engine and transaction boundary.

- Protected application adapter: `app/api/stripe/webhook/route.ts`.
- Separate ingress adapter:
  `services/snickerdoodle-webhook-ingress/app/api/stripe/webhook/route.ts`.
- Ingress runtime identity: `lib/webhook-ingress-runtime.ts`.
- No second transition map, alternate RPC, generic SQL client, or direct table
  mutation is introduced.
- No database privileges, grants, policies, functions, or schemas change.

## Separate project root and route inventory

Vercel project root candidate:
`services/snickerdoodle-webhook-ingress`.

| Route | Exported method | Result |
| --- | --- | --- |
| `/api/stripe/webhook` | `POST` | Signed Stripe sandbox event processing. |
| `/api/stripe/webhook` | GET/PUT/PATCH/DELETE | Framework 405; no handler export. |
| `/` and every UI path | none | Framework 404; no page or public assets exist. |

The service uses Next.js `16.3.3`, React `19.2.8`, Stripe `22.4.0`, Supabase JS
`2.110.5`, TypeScript `5.7.3`, and Node `22.x`. Its manifest and lockfile are
isolated inside the service root.

## Exact environment-name contract

| Name | Sensitivity | Required invariant |
| --- | --- | --- |
| `SNICKERDOODLE_INGRESS_IDENTITY` | non-secret | Exactly `snickerdoodle`. |
| `SNICKERDOODLE_INGRESS_MODE` | non-secret | Exactly `sandbox`. |
| `SNICKERDOODLE_INGRESS_CANDIDATE` | non-secret | Exact rc.3 application commit. |
| `SNICKERDOODLE_SUPABASE_PROJECT_REF` | non-secret | Exact accepted hosted project ref. |
| `SUPABASE_URL` | non-secret | Exact HTTPS origin derived from that project ref. |
| `SUPABASE_SERVICE_ROLE_KEY` | sensitive/server-only | Existing backend credential; never sent to clients or logged. |
| `STRIPE_WEBHOOK_SECRET` | sensitive/server-only | New sandbox endpoint secret; never a live secret. |

There is intentionally no Stripe API key, `NEXT_PUBLIC_` variable, live-mode
secret, Vercel bypass credential, customer identity, or caller-selectable RPC
configuration.

## Task-owned candidate paths

- `app/api/stripe/webhook/route.ts`
- `lib/stripe-webhook-handler.ts`
- `lib/webhook-ingress-runtime.ts`
- `services/snickerdoodle-webhook-ingress/**` excluding ignored build/install artifacts
- `tests/webhook-ingress.test.ts`
- narrow existing payment static/route test updates required by shared-core extraction
- `tests/fixtures/webhook-ingress-client-boundary/**`
- `scripts/test-webhook-ingress-server-only.sh`
- `vitest.config.ts` test-only `server-only` alias
- this manifest and `docs/security/sn08c1-webhook-ingress-threat-model.md`
- final SN08C.1 immutable receipt

## Preserved exclusions

- `docs/customer-readiness/local-release-security-successor-manifest-2026-08-30.bin`:
  SHA-256 `2c6f925d526c9725870b1d33072833ce1689448b72ea4063520bea0633efdb46`.
- `docs/customer-readiness/sn-sprint-08b-provider-receipt-2026-09-02.md`:
  SHA-256 `cd74752d8e3f6041c35dcda9427ff05ae9feb1307f07a6037ff38f8d621154f6`.
- `docs/marketing/` aggregate:
  SHA-256 `f47ed9af03c2864672509390a20e97604bc71e5177397cc8c9416d17899b0860`.

These pre-existing untracked paths remain byte-preserved and excluded from the
candidate commit.

External actions: none.
