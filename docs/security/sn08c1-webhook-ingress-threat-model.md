# SN08C.1 public webhook ingress threat model

Status: local candidate. This artifact authorizes no provider or production action.

## Trust boundary

The separate public service accepts one unauthenticated network operation:
`POST /api/stripe/webhook`. The caller is trusted only after the exact raw body
and `Stripe-Signature` header verify with the sandbox endpoint secret. The
service then normalizes one of seven allowed Stripe event types and invokes the
compile-time-fixed existing database boundary:

`public.process_stripe_payment_event(text,text,boolean,text,uuid,text,text,text,text,integer,integer,text,text,text,timestamptz,boolean)`

That RPC remains the only payment source of truth. It is `SECURITY DEFINER`, has
an empty pinned `search_path`, is denied to `PUBLIC`, `anon`, and
`authenticated`, and is executable only by `service_role`. It owns event
deduplication, binding validation, transaction rollback/retry, order/payment
state, queue synchronization, and audit/reconciliation receipts.

The protected `campaign-kit` application and the separate ingress import the
same `server-only` verifier/normalizer/fixed-RPC module. Neither adapter defines
payment transitions. No database migration, grant, policy, or new RPC is part
of SN08C.1.

## Threats, mitigations, and proof

| Threat | Mitigation | Local proof |
| --- | --- | --- |
| Signature forgery or missing signature | Reject before normalization or database access; use Stripe's official raw-body verifier. | Unsigned and bad-signature tests return 400 with zero processor calls. |
| Body mutation | Verify the received bytes, not parsed/re-serialized JSON. | A one-byte amount mutation against the original signature returns 400. |
| Replay and duplicate delivery | Pass the verified Stripe `event.id` to the existing atomic RPC; its event-scoped lock and receipt make retries idempotent. | Same signed event delivered five times has one modeled business effect; the existing PostgreSQL duplicate-event corpus proves one durable transition. |
| Event-ID collision or provider-ID substitution | Existing RPC binds replay fields and validates intent, Session, PaymentIntent, Customer, charge, dispute, amount, currency, and order scope. | Existing payment-state-machine and cross-customer database corpora remain required gates. |
| Environment or live/test confusion | Runtime requires exact product, sandbox mode, rc.3 source commit, Supabase project ref, and canonical project URL; any drift returns 503. Verified events with `livemode=true` return 400. | Wrong identity, mode, candidate, project ref, URL, missing secret, and live-event tests fail closed. |
| Privilege escalation | Public request data cannot choose an RPC or table. The shared module contains one literal RPC target; the existing RPC revalidates all bindings and owns the transaction. | Static source test rejects computed/dynamic RPC targets; SN04 privilege corpus remains required. |
| Arbitrary or unsupported Stripe event | Only seven exact event types reach normalization/database processing. Other correctly signed events are acknowledged as ignored without a database call. | Unsupported-event test returns 200/ignored and makes zero processor calls. |
| Malformed envelope | Require JSON content type, successful signed JSON parsing, bounded event ID/type, boolean mode, integer creation time, and object payload. | Signed malformed JSON and malformed signed envelopes return 400 before processing. |
| Denial of service/body abuse | Reject declared or streamed bodies over 256 KiB; reject non-JSON and unsupported events before the database. Platform rate limiting/IP controls remain a hosted defense-in-depth check, not local credit. | Declared oversize returns 413; wrong content type returns 415. Existing stream-overflow test covers chunked bodies. |
| Secret leakage | Secrets are server-only Vercel variables; no `NEXT_PUBLIC_` names, Stripe API key, live key, or protection credential exists in the service contract. Responses are generic and logs are metadata-only. | Response/log test excludes webhook secret, signature, body, email, amount, and raw payload; repository secret scans are required. |
| Logging of card, payload, or PII | Never log request bodies, signatures, customer email, provider payloads, or card data. Security logger redacts sensitive-key metadata. | Focused log test and full secret scan. |
| Shared core entering a browser bundle | Both the handler and ingress runtime begin with `import 'server-only'`; only Route Handlers import them. | A dedicated Client Component negative fixture must fail the Next.js build with the server-only boundary error. |
| Accidental public UI or alternate API | The service has no page, layout, static assets, health route, or second API route. Only `POST` is exported. Next returns 405 for GET/PUT/PATCH/DELETE and 404 at `/`. | Build route inventory and local HTTP method matrix. |

## Residual hosted checks

- Confirm the eventual Vercel project root is exactly
  `services/snickerdoodle-webhook-ingress` and remains publicly reachable only
  at the webhook route.
- Configure all sensitive values as preview/sandbox-scoped sensitive variables;
  never copy a live Stripe key or a deployment-protection credential.
- Confirm the hosted service can call only the expected Supabase project and
  that Supabase audit/advisor posture remains consistent with SN08B.3.
- Configure Stripe sandbox to send only the seven allowed events.
- Consider Stripe IP allowlisting or a Vercel firewall rule as defense in depth
  after confirming current published Stripe address ranges and no availability
  regression. Signature verification remains mandatory regardless.

## Stop conditions

Stop on any client-bundle inclusion, dynamic RPC target, new database grant,
live-mode event acceptance, project-identity ambiguity, raw-body/signature
logging, unbounded request body, public UI route, payment-state duplication, or
regression in the accepted payment/auth/queue database corpora.
