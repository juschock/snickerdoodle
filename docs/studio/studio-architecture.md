# RacobenStudio architecture

RacobenStudio is a **staff-only internal operations backend** — not a customer-facing SaaS portal.

## Portfolio layout (horizontal products)

```text
juschock/racoben          → racoben.com (parent site, rewrites only)
juschock/CauseBrief       → racoben.com/snickerdoodle (current legacy GitHub name; explicit owner authorization to rename it is still pending)
juschock/ShipCheck        → racoben.com/shipcheck (public product, when split)
juschock/RacobenStudio    → studio.racoben.com (internal ops — this system)
```

Snickerdoodle and RacobenStudio are **separate repos, separate Vercel projects, separate deployments**.

## Customer-facing vs internal

| | Snickerdoodle (public) | RacobenStudio (internal) |
|---|---|---|
| URL | `racoben.com/snickerdoodle` | `studio.racoben.com` (or temp Vercel URL) |
| Auth | None | Staff login required |
| Database | Server-only pending-intake persistence | Supabase Postgres for internal operations |
| AI | Never customer-facing | Internal drafting/critique/polish only |
| Audience | Prospects & customers | Authorized service lead, assigned independent marketing reviewer, future authorized ops staff |

**Do not** mount Studio at `racoben.com/snickerdoodle/studio`. It couples public marketing to sensitive operational data.

## What Studio manages

- Accounts (client organizations)
- Contacts
- Campaigns (many per account)
- Orders / kits (many per campaign)
- Briefs, fact ledgers, kit assets
- AI draft runs (internal artifacts)
- Independent marketing review tasks
- Delivery packages
- Analytics (operations, PMF, outcomes)
- Activity events and internal notes

## Roles

| Role | Assignment state | Capabilities |
|------|------------------|--------------|
| Owner | Authorized account owner | Full access |
| Service lead | Must be explicitly assigned | Accounts, orders, drafting workflow, delivery |
| Independent marketing reviewer | Unassigned; HARD HOLD | Per-order review queue, editor packet, approve/revise, edit final copy |

The reviewer does **not** need billing, AI prompt configuration, admin settings, other orders, or customer data beyond
the assigned per-order review packet. No identity, relationship, employment, compensation, ownership, availability,
assignment, authority, or access is inferred. Reviewer access may exist only after CEO designation and assignment,
availability and training confirmation, classification/conflict/IP clearance, least-privilege per-order access
approval, two timed synthetic rehearsals, and documented CFO+CRO concurrence for all monetary terms.

## Recommended stack (when built)

- Next.js App Router (internal dashboard)
- Supabase Postgres + Auth
- Supabase Storage (later, for delivered files)
- Vercel (Studio deployment)
- Internal AI scripts/jobs (separate from public app)

## Guiding principle

Design for scale; build only when the staged pilot proves an operational bottleneck. The first completed paid order
and its reconciliation are learning evidence, not a global acceptance lock; independent customer orders may run
concurrently within documented staffing, reviewer, and quality capacity. Studio must isolate each order's reservation,
assignment, access, QA, reconciliation, and delivery. It supports authorized roles; it is not customer self-service
and must not pre-authorize the unassigned reviewer.
