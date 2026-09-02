# Route and access inventory — 1.1.0-rc.2

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
| `/snickerdoodle/api/health` | Public operational | Metadata-only liveness, no-store; does not claim provider readiness |
| `/snickerdoodle/api/brief-access`, `/snickerdoodle/api/brief`, `/snickerdoodle/api/checkout` | Private capability/API | Exact origin, bounded input, signed capability; fail closed when commercial/payment config is incomplete |
| `/snickerdoodle/api/stripe/webhook` | Provider API | Bounded raw body and verified Stripe signature before the atomic payment RPC; independently fail closed |
| `/snickerdoodle/api/manager/queue`, `/snickerdoodle/api/manager/intakes/[intentId]` | Owner API | Authenticated AAL2 owner, audited RPC, no-store/noindex |
| `robots.txt`, `sitemap.xml`, `icon.svg` | Public metadata | Private/manager/checkout/API routes are not advertised |

The browser matrix checks every public and return route for 404s, dead private-intake links, raw errors, console failures, mobile overflow, accessibility, closed-state 503 behavior, and manager authentication behavior. It also submits a complete synthetic private intake through the real browser form into a local intercepted Checkout response and verifies the explicitly non-authoritative return page. Provider-backed success remains a hosted gate.
