# Route and access inventory — 1.1.0-rc.3

All routes are under `/snickerdoodle` in the production build. The bare `/` is a security-header-preserving proxy redirect.

| Route | Class | Current contract |
| --- | --- | --- |
| `/`, `/snickerdoodle` | Public | Root redirect; truthful closed/open home selected by all eight commercial flags |
| `/snickerdoodle/faq`, `/snickerdoodle/privacy`, `/snickerdoodle/terms` | Public | Closed-state or approved commercial copy; no private intake link while held |
| `/snickerdoodle/samples`, `/snickerdoodle/samples/[slug]` | Public | Clearly fictional proof only |
| `/snickerdoodle/brief` | Private capability | Signed, expiring access fragment is exchanged for an HttpOnly cookie; unavailable unless commercial gates pass |
| `/snickerdoodle/brief/received` | Private continuation | Non-authoritative receipt; checkout CTA appears only when the exact payment runtime is available |
| `/snickerdoodle/checkout/success`, `/snickerdoodle/checkout/cancel` | Public return | No payment truth from query/redirect; both are noindex and no-store |
| `/snickerdoodle/manager/queue` | Staff | Supabase password session plus verified TOTP/AAL2 owner; no static secret fallback |
| `/snickerdoodle/auth/recovery` | Private recovery | Same-origin Supabase password recovery only; callback material is scrubbed immediately, the session stays in memory, and a fresh password sign-in is required after local sign-out |
| `/snickerdoodle/api/health` | Public operational | Metadata-only liveness, no-store; does not claim provider readiness |
| `/snickerdoodle/api/brief-access`, `/snickerdoodle/api/brief`, `/snickerdoodle/api/checkout` | Private capability/API | Exact origin, bounded input, signed capability; fail closed when commercial/payment config is incomplete |
| `/snickerdoodle/api/stripe/webhook` | Provider API | Bounded raw body and verified Stripe signature before the atomic payment RPC; independently fail closed |
| `/snickerdoodle/api/manager/queue`, `/snickerdoodle/api/manager/intakes/[intentId]`, `/snickerdoodle/api/manager/health` | Owner API | Authenticated active AAL2 owner; manager reads use aggregate or audited RPCs; no-store/noindex |
| `/snickerdoodle/api/manager/alerts` | Owner API | GET only; authenticated active AAL2 owner; returns exactly six metadata-only open-alert fields with no provider payload or customer content |
| `/snickerdoodle/api/manager/reconciliation` | Owner API | POST only; authenticated active AAL2 owner; exact-origin bounded strict JSON; resolves only a freshly reviewed eligible unpaid expiry through the idempotent reconciliation RPC |
| `/snickerdoodle/api/manager/invites` | Owner API | Authenticated active AAL2 owner; bounded exact-origin request creates an email-bound v2 capability in a URL fragment without persistence |
| `/snickerdoodle/api/manager/fulfillment` | Owner API | Authenticated active AAL2 owner; bounded exact-origin request applies one allowlisted paid-order lifecycle transition through the existing idempotent fulfillment RPC |
| `robots.txt`, `sitemap.xml`, `icon.svg` | Public metadata | Private/manager/checkout/API routes are not advertised |

The browser matrix checks every public and return route for 404s, dead private-intake links, raw errors, console failures, mobile overflow, accessibility, closed-state 503 behavior, and manager authentication behavior. It also submits a complete synthetic private intake through the real browser form into a local intercepted Checkout response and verifies the explicitly non-authoritative return page. Provider-backed success remains a hosted gate.
