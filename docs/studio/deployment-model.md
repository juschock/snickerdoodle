# RacobenStudio deployment model

## Public product apps (no Studio)

```text
racoben.com/              → juschock/racoben (site/)
racoben.com/snickerdoodle    → juschock/CauseBrief (current legacy GitHub name; rename pending, proxy rewrite)
racoben.com/shipcheck     → ShipCheck app (proxy rewrite)
```

Snickerdoodle public app constraints:

- No customer auth, customer-facing AI, payment runtime, or customer dashboard
- Flow: structured brief → polished human-reviewed campaign package
- V1 conversion: monitored email fit check → qualified, unlisted survey → server-only Supabase pending intake

## Internal Studio app (separate)

```text
studio.racoben.com        → juschock/RacobenStudio (production)
racoben-studio.vercel.app → temporary / staging (Vercel protection OK)
```

### Why separate deployment

Studio will hold:

- Staff authentication
- Client PII and order data
- AI draft artifacts and prompts
- Independent marketing review queue
- Revenue and analytics

Isolating it from the public Snickerdoodle site reduces attack surface, simplifies compliance narrative, and allows independent deploy cadence.

### Password-protected route on public site?

**Prototype only** — acceptable on a temp Vercel URL with Vercel Authentication or basic auth.

**Not recommended for production:** `racoben.com/snickerdoodle/studio`

### Parent domain ownership

`racoben.com` stays on the **Racoben parent** Vercel project. Product paths proxy to product origins via rewrites + env vars (same pattern as Snickerdoodle today).

Studio gets its **own subdomain** (`studio.racoben.com`) pointing directly to the RacobenStudio Vercel project — not a path rewrite on the parent.

## Environment variables (Studio project)

Examples (when implemented):

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # server only
NEXT_PUBLIC_SUPABASE_ANON_KEY=
STUDIO_INTAKE_API_SECRET=         # validates public brief submissions
```

Snickerdoodle public project (Phase 2 intake):

```text
STUDIO_INTAKE_URL=https://studio.racoben.com/api/intake
STUDIO_INTAKE_API_SECRET=         # shared secret, server-side only
```

## Connectivity summary

| Phase | Public Snickerdoodle | Studio |
|-------|-------------------|--------|
| V1 (now) | Fit-check email plus server-side pending-intake submission | Manual fit review / fulfillment docs |
| V2 | Server action or API route POSTs to Studio | Creates account → campaign → order |
| V3+ | Same intake endpoint | Full pipeline + analytics |

**Studio owns operational order records.** The public app has a deliberately narrow server-only Supabase connection
for pending intake and never exposes database credentials to the browser. It does not create an order.
