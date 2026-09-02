# Environment contract — 1.1.0-rc.3

No values belong in this artifact. Missing, malformed, mode-mismatched, or partially enabled commercial/payment configuration leaves checkout or webhook processing unavailable.

| Variable | Visibility | Required when | Rule |
| --- | --- | --- | --- |
| `SNICKERDOODLE_COMMERCIAL_READY`, `SNICKERDOODLE_OFFER_APPROVED`, `SNICKERDOODLE_FULFILLMENT_READY`, `SNICKERDOODLE_REVIEWER_READY`, `SNICKERDOODLE_LEGAL_APPROVED`, `SNICKERDOODLE_PAYMENTS_READY`, `SNICKERDOODLE_G5_ASSIGNED`, `SNICKERDOODLE_MONETARY_APPROVED` | Server | Opening commercial mode | Every value must be exactly `true`; the flags record approvals and do not grant them |
| `SNICKERDOODLE_PAYMENTS_ENABLED` | Server | New Checkout Sessions | Exact `true`; disable independently for an acquisition stop |
| `SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED` | Server | Stripe settlement | Exact `true`; keep independent of new checkout |
| `SNICKERDOODLE_STRIPE_LIVEMODE` | Server | Payment runtime | Exact `true` or `false`, matching the restricted key and signed event mode |
| `SNICKERDOODLE_ALLOWED_ORIGIN` | Server | Intake/checkout | Exact canonical origin; HTTPS except loopback local tests; no path/query/credentials |
| `CHECKOUT_SECURITY_SECRET` | Server secret | Private access/checkout | At least 32 characters; never log or expose |
| `STRIPE_RESTRICTED_KEY` | Server secret | Checkout | Mode-matching restricted key; full-access `sk_*` is rejected |
| `STRIPE_WEBHOOK_SECRET` | Server secret | Webhook | Stripe endpoint signing secret; never client-visible |
| `SUPABASE_URL` | Server | Admin and manager APIs | Exact reviewed project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Server-owned database operations | Server only; never browser-visible |
| `SUPABASE_ANON_KEY` | Server | Manager SSR/RPC client | Used with the caller's access token; does not replace DB authorization |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public-safe fallback | Manager login client | Only Supabase public URL/anon key; no service credential |
| `NEXT_PUBLIC_SNICKERDOODLE_EMAIL` | Public | Mailto fit-check CTA | Approved monitored public address |
| `SNICKERDOODLE_ANALYTICS_ENABLED` | Server/build | Optional analytics | Exact `true` only in production; no campaign/customer content in events |

`npm run build` proves the closed configuration. `npm run build:gate-true-test` proves the open-copy branch without payment secrets. Unit tests prove malformed or incomplete payment configuration returns unavailable; production provider values and secret custody require hosted validation.
