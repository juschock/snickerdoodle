# Payment operations

**Code state (2026-08-30):** the application contains a fail-closed Stripe-hosted Checkout and signed-webhook
implementation for the one-time Snickerdoodle Campaign Package. Checkout does not open unless every commercial
approval flag, the payment switch, an exact public origin, a mode-matching Stripe key, the webhook signing secret,
and the checkout-security secret are present. Webhook settlement has a separate switch so paid obligations can
continue to reconcile while new checkout is paused.

**Provider state:** a `$99 USD` Stripe product/price has been reported, but this release has not independently bound
or exercised the exact live account, restricted key, webhook endpoint, charge eligibility, payout destination, or
settlement path. Those facts must be verified against the frozen release before customer payment can be accepted.
The code or product object alone is not payment readiness.

The intended customer flow is:

```text
approved fit check → signed, unlisted intake → durable pending checkout intent
→ Stripe-hosted payment → signed webhook → idempotent paid order finalization
→ Racoben order/schedule confirmation → bounded fulfillment
```

A fit check, survey submission, checkout return page, or Stripe redirect does not by itself create a fulfilled order
or start work. Racoben starts work only after the signed Stripe event is durably reconciled and the intake is complete.

## Required production configuration

- All eight `SNICKERDOODLE_*` commercial approval flags must be exactly `true`.
- `SNICKERDOODLE_PAYMENTS_ENABLED=true` opens new checkout; set it to `false` for an acquisition stop.
- `SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED=true` keeps signed payment settlement enabled independently.
- `SNICKERDOODLE_STRIPE_LIVEMODE=true`, an exact allowed origin, and mode-matching restricted Stripe key are required.
- A minimum-32-character checkout-security secret and Stripe webhook signing secret are required.
- Supabase URL, public key, and service-role key must target the exact reviewed schema.
- No secret belongs in source, logs, receipts, URLs, client bundles, or support messages.

## Checkout controls

- Private signed invite cookie and delivery-email binding.
- Strict public-origin and forwarded-host validation.
- Bounded JSON body, schema normalization, deterministic pending-intake ID, and client idempotency key.
- Pseudonymized durable rate limits for source address and delivery email.
- Stripe-hosted one-time Checkout with required billing address and terms consent.
- Exact `$99 USD` amount/offer metadata and Stripe idempotency key.
- Reuse of the previously bound open Checkout Session; fail closed on mismatches or stale sessions.
- A 60-minute provider expiry with at least 35 minutes remaining at actual Session creation, leaving a bounded margin
  for database/API latency while satisfying Stripe's creation-time minimum.
- An exact per-intent reservation. Independent customers never share a capacity row or lock. Definite pre-Session
  failures release only that intent atomically; provider ambiguity or bind failure retains that intent's idempotent
  reservation and opens a durable metadata-only reconciliation alert rather than silently orphaning the Session or
  creating a duplicate.

## Webhook and order controls

- Verify the Stripe signature over the exact bounded raw body before any database operation.
- Reject test/live mode mismatch.
- Persist an event receipt before processing and make duplicate/replay processing idempotent.
- Finalize only paid Checkout events matching the exact offer, amount, currency, intent, email, and payment intent.
- Record processed, ignored, or failed disposition without storing raw payment payloads in application logs.
- Persist `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
  `charge.dispute.created`, and `charge.dispute.closed` idempotently with a metadata-only reconciliation alert before
  acknowledging them with HTTP 200. A true signature, integrity, receipt, or database-processing failure still returns
  a failure so Stripe retries; a successfully recorded operator obligation does not create a retry storm.
- Keep the success page non-authoritative: only the reconciled signed event establishes the paid-order state.

For any open reconciliation alert, pause new checkout, reconcile the verified Stripe event against the bound
Checkout Session/payment intent and internal order through the authorized administrator procedure, preserve the
receipt, and resolve the customer obligation before reopening checkout. Application roles have no direct receipt,
event-ledger, or order-table mutation grant.

## Activation and rollback sequence

1. Account owner completes Stripe activation and payout setup; verify charges and payouts are enabled.
2. Bind the exact approved Stripe Product/Price to the server-side Checkout configuration, create a restricted
   production key, and create the signed webhook endpoint. Do not use a Payment Link as a second payment truth.
3. Apply and rehearse the exact Supabase production migration/role/recovery package; verify RLS and Data API grants separately.
4. Configure encrypted deployment secrets, deploy one immutable preview, and run a real Stripe test-mode purchase/refund/replay drill with synthetic data.
5. Promote the same artifact, run a low-value live self-test only if the account owner separately approves it, and verify bank/payout reconciliation.
6. If any integrity, reconciliation, support, or fulfillment control fails, disable new checkout while leaving webhook
   settlement available, preserve receipts, and roll back the deployment.

The live product/price creation does not authorize representing that Stripe can charge customers before Stripe reports
the account active. Checkout and webhook code accept only a mode-matching restricted key; a full-access `sk_*` key is
not a supported deployment input.

Stripe Tax and `automatic_tax` remain off pending the documented Virginia advertising-service tax decision; checkout
does not automatically collect tax and no tax-registration claim is made. The gated customer policy is a one-time
`$99 USD` purchase with a normal 48-hour window beginning only after successful payment, Racoben order confirmation,
and complete usable intake. It provides a full refund before substantive fulfillment starts; cancellation/full refund
if Racoben misses an unpaused window; and, for a material scope defect reported within seven calendar days after
delivery, the customer may choose one reasonable correction or a full refund. Results, platform outcomes, and
customer-caused delays are excluded.

Release remains blocked until an accountable monitored-inbox owner accepts same-day webhook receipt/alert review,
order reconciliation, refund execution, dispute response, and customer notice. The owner workspace now uses normal
Supabase password authentication followed by verified TOTP/AAL2 and exposes the privacy-safe queue plus full paid
brief, assignment, and reconciliation details only through owner-scoped audited RPCs. Hosted Auth, owner enrollment,
notification delivery, and the exact live Stripe Product/Price remain unverified and must be bound before enabling
checkout.
