# Intake connectivity

How the public Snickerdoodle site connects to RacobenStudio.

## Dormant candidate intake (commercial hold is the current default)

Every public/intake readiness variable documented in `.env.example` must be exactly `true` before this flow can
render or accept data. Missing, partial, or loosely truthy values keep the page, token exchange, submission route,
and invite generator closed. The variables record separately granted approvals and do not grant authority.

```text
Public visitor → monitored fit-check email
Qualified prospect → private, 7-day, email-bound signed /snickerdoodle/brief link
                    → capability arrives in the URL fragment and is exchanged for a scoped HttpOnly cookie
                    → the fragment is removed before the survey is rendered; analytics drops the private route
                    → one signed invite maps to at most one pending intake
                    → POST /snickerdoodle/api/brief
                    → Supabase pending_intakes (status: pending; no price/payment/session/order fields)
                    → authorized manual fit review
```

The public site never exposes the brief route as a conversion CTA, and its sitemap omits the route. The page is
`noindex, nofollow` and sends `Referrer-Policy: no-referrer`. A qualified handoff carries the HMAC-signed capability
in the URL fragment; the client removes it immediately and exchanges it through the same-origin brief-access route
for a scoped, HttpOnly, SameSite=Strict cookie before rendering the survey. Global analytics drops the private route
and rejects any event containing an access capability. Without a valid cookie it shows only a fit-check prompt. The
invite is bound to a pseudonymized delivery email, may never span more than seven days from issuance, and maps to one
deterministic intake even if request bodies or idempotency keys are rotated. Submission validates the parent-proxy
origin, caps the request body, consumes the durable email throttle, and stores only a pending intake. It does not
create an order, collect payment, or begin fulfillment. Pending intake rows use the existing conservative cleanup policy.

Only during an explicitly approved operating or synthetic-test window, create a qualified invite locally with
`npm run brief:invite -- qualified@example.com` while `CHECKOUT_SECURITY_SECRET` and every commercial gate are
available in the shell. The resulting capability URL is private and must never be
committed, logged in a public tracker, or placed in a social post. It is inserted only into an exact-version-approved
individual handoff and invalidates that handoff's approval if changed. Copying the generated URL preserves the
fragment locally; the server never receives the capability in an ordinary navigation request.

## Phase 2 (target after operational review)

```text
Customer → /snickerdoodle/brief form
         → Snickerdoodle server route (POST)
         → RacobenStudio POST /api/intake (authenticated via shared secret)
         → Supabase: account, contact, campaign, order, brief, activity event
         → Notify authorized fulfillment roles
         → Customer confirmation page (no AI, no account creation)
```

### Public site responsibilities

- Validate form fields (same schema as today `lib/intake.ts`)
- Require an expiring, email-bound qualified-prospect invite
- POST to Studio intake URL **server-side only** (secret never exposed to browser)
- Show success UI (preserve current confirmation UX)
- **Do not** own Postgres or business logic

### Studio intake endpoint responsibilities

1. Validate payload + API secret
2. Match or create **Account** (by organization name + email heuristics)
3. Create **Contact** (delivery email)
4. Create or match **Campaign** (from campaign name + type)
5. Create **Order** (status: New Intake)
6. Store **Brief** (raw JSON + normalized fields)
7. Create draft **Fact Ledger** (missing facts flagged)
8. **Activity event:** `brief_submitted`
9. Notify staff email
10. Return `{ orderId }` to public site for confirmation display (optional)

No customer login. No customer dashboard.

### API shape (sketch)

```http
POST /api/intake
Authorization: Bearer <STUDIO_INTAKE_API_SECRET>
Content-Type: application/json

{ ...BriefFormData fields... }
```

Rate-limit and validate origin on Studio side.

## Phase 3+

- Webhook from email parser for mailto fallback
- Duplicate detection (same org resubmits)
- Payment workflow only after Gate B explicitly reopens

## Hard rules (unchanged)

- AI internal only
- Fact ledger before drafting
- Assigned and cleared independent marketing review before delivery
- No customer-facing AI, prompts, or chat

The two-person fulfillment model is role-only and remains on HARD HOLD. The independent marketing reviewer is
unassigned; no identity, relationship, employment, compensation, ownership, availability, assignment, authority,
or access is inferred. Operational reviewer participation requires CEO designation and assignment, availability
and training confirmation, classification/conflict/IP clearance, least-privilege per-order access approval, two
timed synthetic rehearsals, and documented CFO+CRO concurrence for all monetary terms. G5 external motion remains
unassigned.

The local assignment data plane is now implemented and disposable-tested for the role aliases `service_lead` and
`assigned_reviewer`; it is not applied to hosted Supabase and creates no collaborator profile, session, assignment,
or provider access. See `docs/customer-readiness/non-payment-data-unit.md` for the exact local/hosted boundary.
