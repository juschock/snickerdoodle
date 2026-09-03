# SN08C.2 sandbox provider canary receipt

Recorded: 2026-09-03T02:48:09Z  
Classification: sandbox provider proof only; not a live-production launch receipt

## Frozen identities

- Accepted protected application candidate: commit `380cee4bb475b3b9e45b4b580931a4025e2aa816`, tree `2368420fc27b0bfd631b5ac4df7dc67f4e2a22d5`.
- Isolated ingress compatibility candidate: commit `a6ab884dbfdf551085d89b5de58727a7feacd506`, tree `8b8684e3f713ef0ce0f24386b5a0721c4ad9b039`.
- Vercel ingress deployment: `dpl_Fr1e5Q6gzQgfBn9uHXEMSvscRVnt`, READY Preview.
- Stable sandbox ingress alias: `https://snickerdoodle-webhook-ingress-sandbox.vercel.app`.
- Supabase project: `iybwbnabyphpzlmzypga`, with the accepted 21-migration ledger unchanged.
- Stripe sandbox account: `acct_1QuAMn4MU7boT10f`.
- Stripe sandbox product / price: `prod_VBgO5qK1uoS0hz` / `price_1UBJ1m4MU7boT10fhU1VoOZm` ($99.00 USD, one time).
- Stripe sandbox webhook destination: `we_1UBJ4L4MU7boT10f6cOS5XqU`, enabled for exactly seven accepted payment events.

No live Stripe, public application production, DNS, mail, or real-customer action occurred.

## Demonstrated blocker and repair

The first signed `checkout.session.completed` deliveries were rejected before business logic with `invalid_event_shape`. This was correct fail-closed behavior: Stripe showed the Checkout Session as paid and complete, while Supabase retained the intent as `checkout_created` with no order.

The demonstrated incompatibility was narrow: deterministic checkout intent IDs are RFC 9562 UUIDv8 values, but the new ingress shape guard accepted only UUID versions 1 through 5. Commit `a6ab884...` expands the canonical UUID version nibble to 1 through 8. Signature verification, raw-body handling, sandbox/live separation, offer/amount/currency checks, fixed RPC identity, and database privileges are unchanged.

Validation for the repair:

- UUIDv8-focused ingress proof: 11/11 PASS.
- Full unit/static suite: 29 files, 165/165 PASS under Node 22.23.2.
- Root lint: PASS.
- Root typecheck: PASS.
- Isolated ingress production build: PASS; routes remain only `/_not-found` and `/api/stripe/webhook`.
- Dependency installation audits during Vercel build: 0 vulnerabilities in both install scopes.
- Stable ingress probes: `/` returns 404; webhook GET returns 405.

## Hosted payment and webhook proof

- Customer B used a private, email-bound synthetic invite and completed Stripe-hosted sandbox Checkout.
- Stripe reported the Session `paid` and `complete`, amount 9900 USD, test mode, customer and PaymentIntent bindings present, and terms accepted.
- Stripe automatically retried the exact failed event after the repaired ingress became active; the delivery recovered with HTTP 200 and `{"received":true}`.
- A user-approved manual replay of that same event also returned HTTP 200.
- Ingress structured logs contain only request, event, order, reconciliation, and attempt identifiers; no signature, secret, raw payload, card data, or customer email was logged.

## Atomic database result after duplicate replay

- Checkout intent: `paid`.
- Checkout reservation: `active`.
- Webhook receipt: `processed`, attempt count 2, transition `checkout_paid`.
- Order: exactly 1 for the Stripe Checkout Session; status `new_intake`; payment status `paid`; 9900 USD.
- Stripe event rows for the event ID: exactly 1.
- Paid brief rows for the order: exactly 1.
- Activity rows for the order: 2, reflecting the original transition and duplicate receipt without a duplicate order effect.
- Manager queue: `checkout` / `paid_ready` / `paid`, correct terms version, order bound.
- Open reconciliation alerts for the paid intent/order: 0.

The manual replay therefore changed only the durable receipt attempt count. It did not create a second order, Stripe-event row, paid brief, or payment effect.

## Security posture and remaining gates

- The public ingress is sandbox-only and contains no UI route.
- The human application preview remains Vercel-auth protected.
- The owner operations route remains unavailable without Supabase sign-in and a live AAL2 session.
- The hosted owner profile is active, email-confirmed, and has a verified MFA factor.
- The current Supabase security advisor has no critical/error findings. Its INFO/WARN findings are the reviewed deny-by-default private tables and intentionally authenticated SECURITY DEFINER RPC surfaces whose function bodies enforce live role, assignment, and/or AAL2 checks. No privilege or policy was widened in this tranche.

Still required before a live-production launch receipt: a second distinct successful customer journey, real owner AAL2 queue and paid-brief read, exact fulfillment transition/close proof, explicit failed-or-expired payment proof, production monitoring/mail readiness, live-secret binding and owner canary, final legal/tax/retention approvals, restore/RPO/RTO proof, and an explicit production promotion decision.
