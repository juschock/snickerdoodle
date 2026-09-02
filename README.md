# Snickerdoodle

Snickerdoodle by **Racoben Engineering, LLC**. The application is an independent local repository named `Snickerdoodle`. Its GitHub remote is still [github.com/juschock/CauseBrief](https://github.com/juschock/CauseBrief); the external repository rename remains pending.

This working tree is a local, fail-closed candidate and has not been deployed. By default it shows fictional samples and an explicit product-readiness hold; it does not offer orders, private intake, payment, capacity, or fulfillment. The intended public route is `racoben.com/snickerdoodle` through the Racoben parent-site Vercel rewrites, but the current live route serves a superseded commercial build and is a release blocker.

Built with Next.js App Router, Tailwind CSS v4, server-only Supabase intake/payment persistence, Stripe-hosted
Checkout, signed webhooks, and `basePath: '/snickerdoodle'`. The executable payment path is default-off and has only
local/synthetic evidence; it is not provider-bound or authorized for customer use.

## Closed-mode public description

Fictional campaign samples for product evaluation.

## Local development

```bash
npm ci
npm run dev
```

App runs at **http://localhost:3102/snickerdoodle** (port 3102 avoids conflicts with other local projects).

The local Vercel project link is stored in the gitignored `.vercel/project.json`. On a new machine or after Vercel CLI authentication expires:

```bash
vercel login
vercel link --yes --project campaign-kit --scope joshuauschock-gmailcoms-projects
vercel env pull .env.local --environment=preview --yes
```

Commercial mode is fail-closed. Every server-only public/intake gate in `.env.example` must be exactly `true` before the candidate
offer and private survey can render; a missing or alternate value closes the product. Those deployment values record
separately granted approvals and never grant approval themselves. In the default state, `/brief`, its token-exchange
API, its submission API, and the invite generator all return or render unavailable without reading intake data.

The gated candidate intake uses a private, email-bound signed `/brief` link whose maximum issuance window is seven
days. The capability travels in the URL fragment, is removed immediately, and is exchanged through the same-origin
API for a scoped HttpOnly cookie; the private route is excluded from analytics. One invite maps to at most one pending
intake without creating an order. `SNICKERDOODLE_PAYMENTS_ENABLED=false` remains an independent fail-closed marker.
New Checkout and webhook settlement have separate switches; both still require the exact retained commercial gates,
mode/origin binding, restricted Stripe key, webhook secret, checkout-security secret, and reviewed Supabase schema.
Environment flags record approval but never grant it. Never copy live payment secrets into a tracked file.

Only in an explicitly approved commercial test or later authorized operating window, generate (but do not send) a private link locally:

```bash
npm run brief:invite -- qualified@example.com
```

Run that only from a secure shell where `CHECKOUT_SECURITY_SECRET` is already loaded; do not put the secret in shell
history.

Never commit or place the generated capability URL in a public tracker. The individual handoff message, including its
exact private URL, still requires the three independent reviews and owner action-time approval described in
`docs/marketing/artifact-approval-gate.md`.

Before opening a pull request, run the same non-payment checks used by CI:

```bash
npm run security:secrets
npm audit signatures
npm run typecheck
npm run lint
npm test
npm run test:e2e:hold
npm run test:e2e
npm run build
npm run test:e2e:hold:built
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

The first hold suite creates a gate-true build and tests it with false runtime gates. `npm run test:e2e` then creates a
gate-default build and tests it with true runtime gates. These cross-combinations certify that one server-runtime
decision controls pages and APIs. The final default build and `test:e2e:hold:built` restore and verify the closed
artifact. The open suite is only a test of the dormant intake path; it grants no approval. The full dependency audit
is an additional local check; the production-dependency audit matches CI's blocking dependency check.

To test through the Racoben parent proxy, also run [juschock/racoben](https://github.com/juschock/racoben) (`site/`) and open **http://localhost:3100/snickerdoodle**.

## Deploy

1. Connect this repo to a Vercel project.
2. Deploy only after separate authorization. The app uses `basePath: '/snickerdoodle'` in `next.config.mjs` and defaults to commercial hold.
3. On the **Racoben parent site** Vercel project, set `SNICKERDOODLE_PRODUCTION_URL` to this deployment URL (e.g. `https://snickerdoodle.vercel.app`).

Do not include `/snickerdoodle` in the env var value.

Parent site rewrites `/snickerdoodle` and `/snickerdoodle/*` to this project.

## Connected services

- **GitHub:** `juschock/CauseBrief` (repository ID `1285364829`); the local `origin` points directly to it.
- **Vercel:** project `campaign-kit` (`prj_s5ioDg3l81ogNgZwmOREf3Q7iKQE`). The `.vercel` directory is local-only and must not be committed.
- **Supabase:** project `snickerdoodle-studio` (`iybwbnabyphpzlmzypga`). The exact local candidate uses server-side durable intake, HMAC-pseudonymized throttling, signed qualification links, per-intent payment reservations, isolated order/reconciliation state, and an audited AAL2 owner workspace. Clean replay, disposable backup/restore, ORD-03, and multi-customer payment lifecycle/concurrency pass locally; no successor migration is applied remotely, and hosted Auth/roles/default ACLs/recovery remain unverified.
- **Payments:** the Stripe SDK and executable default-off Checkout/signed-webhook path are present. Local acceptance covers exact `$99 USD` binding, creation-time-safe Session expiry, compensating/reconcilable capacity, idempotent paid finalization, and durable acknowledged expiry/failure/refund/dispute alerts. No restricted live key, webhook endpoint, provider test journey, charge, refund, deployment, or customer payment is bound by this evidence.
- **Racoben parent:** [juschock/racoben](https://github.com/juschock/racoben) owns `racoben.com` and proxies the `/snickerdoodle` route using `SNICKERDOODLE_PRODUCTION_URL`.
- **RacobenStudio:** [juschock/RacobenStudio](https://github.com/juschock/RacobenStudio) is the separate staff-only operations application. Do not copy its full `.env.local` into this public repository.

## Key docs

- `docs/operating-doctrine.md` — what Snickerdoodle sells and how it operates
- `docs/campaign-families.md` — launch campaign families and primary actions
- `docs/sample-kit-plan.md` — public sample kit strategy
- `docs/fact-ledger.md` — mandatory fact source for all AI drafting
- `docs/marketing-plan-zero-budget.md` — 90-day $0 acquisition, content, outreach, referral, and measurement plan
- `docs/production-readiness.md` — readiness evidence, architecture decisions, operational checks, and remaining launch gates
