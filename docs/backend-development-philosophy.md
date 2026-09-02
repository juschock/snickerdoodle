# Snickerdoodle Backend Development Philosophy

Snickerdoodle is a productized service first, not a full SaaS product.

The purpose of the backend work is to support fast, high-quality, human-reviewed fulfillment of campaign packages while keeping the customer-facing experience simple and trustworthy.

## Core Principle

Build just enough internal tooling to make high-quality, human-reviewed campaign packages efficiently.

Start by doing the work manually so we can sell and learn quickly. Only automate the parts that are repetitive and well-understood after we have validated the offer with real customers.

## Customer-Facing Experience

The customer should see a clean, simple flow:

1. Fill out a structured campaign survey.
2. Submit the campaign details.
3. Receive a polished, human-reviewed campaign package.

The customer should not see:

- AI chat interfaces
- prompt boxes
- model settings
- token usage
- “generate with AI” controls
- customer-facing AI claims
- automated output with no review step

Snickerdoodle is not positioned as an AI writing tool. It is positioned as a polished campaign-package service by Racoben.

## Internal Production Model

Customer-facing:

```text
structured brief → polished human-reviewed campaign package
```

Internal role model (service lead using ChatGPT and custom AI tooling, with a prospective independent marketing reviewer as final expert quality gate):

```text
intake normalization
→ fact ledger
→ campaign-type selection
→ internal AI drafting
→ channel adaptation
→ AI critique pass
→ AI polish pass
→ deterministic QA
→ editor packet
→ independent marketing review
→ package assembly
→ delivery
```

The prospective independent marketing reviewer is the final expert quality gate, not the first drafter. That role is
unassigned and under HARD HOLD. This document records no identity, employment, compensation, ownership,
availability, assignment, authority, or access. The two-person workflow may activate only after CEO designation and
assignment, availability and training confirmation, classification/conflict/IP clearance, least-privilege per-order
access approval, two timed synthetic rehearsals, and documented CFO+CRO concurrence for every monetary term.

See also:

- `docs/internal-automation-pipeline.md`
- `docs/fact-ledger.md`
- `docs/editor-packet.md`

## Hard Rule: Internal AI Only

AI is allowed and encouraged internally, but never customer-facing.

AI must use only facts in the fact ledger. No invented sponsors, donation matches, statistics, quotes, links, partners, deadlines, outcomes, or claims.

## Backend Definition

For V1, “backend” primarily means the internal production workflow, not a traditional SaaS backend.

Over time, internal tooling should live in a **separate, access-controlled system** that only Snickerdoodle fulfillment staff can reach — not in the public customer app. That internal system may include:

- form submission handling
- intake normalization
- fact ledger management
- internal fulfillment folders
- template selection
- internal AI drafting prompts
- channel adaptation helpers
- AI critique and polish passes
- deterministic QA checks
- editor packet generation
- delivery checklists
- file packaging conventions
- internal status tracking

The backend does not currently include:

- customer accounts
- dashboards (customer-facing)
- automated payment workflows
- automated delivery portals
- customer-facing AI
- complex admin panels exposed to customers
- multi-user customer roles
- subscription billing

The public app does use one narrow server-only Supabase path to store qualified survey submissions as pending
intents. It does not expose database credentials, create orders, or begin fulfillment. Broader customer or payment
features may be considered later only after demand is validated.

## Internal AI Use

AI may be used internally by Racoben as a production aid.

Acceptable internal AI uses:

- first-draft generation (from fact ledger only)
- channel-specific copy variations
- subject line generation
- CTA variations
- tone adjustments
- press release drafts
- social post variants
- campaign schedule drafts
- critique and polish passes
- formatting assistance

AI output must be reviewed before delivery.

Human review is required for:

- accuracy
- tone
- event details
- names
- dates
- links
- prices
- donation asks
- sensitive wording
- nonprofit/community voice
- inappropriate claims
- hallucinated facts

The customer buys the finished campaign package, not raw AI output.

## Human-in-the-Loop Requirement

Human review is required for V1.

This is not optional at the beginning.

Independent marketing review is the final expert quality gate. Marketing copy for nonprofits, local events,
fundraisers, and small businesses requires judgment, tone, and accuracy. The human review step is part of the
product quality. Until the reviewer and all two-person activation gates above are cleared, fulfillment remains on
HARD HOLD and this workflow is rehearsal-only.

The backend should support the review step, not replace it prematurely.

## Development Phases

### Phase 0 — Offer Definition

Goal: define the product clearly before building automation.

Required artifacts:

- landing page
- intake form
- pricing
- fulfillment checklist
- QA checklist
- internal prompt library
- delivery package structure
- fact ledger spec
- editor packet spec

No customer auth, customer dashboard, or payment integration is required in this phase. The narrow pending-intake
store is already implemented for operational reliability.

**Status:** complete for V1 UI/offer testing.

### Phase 1 — Staged Manual Pilot

Goal: after every release, legal, reviewer, economics, payment, and external-motion gate opens, accept and process
multiple independent paid orders concurrently within documented service-lead, reviewer, delivery, and quality
capacity. Treat each completed-order reconciliation as learning evidence, never as a global acceptance lock, and
preserve isolated reservation, assignment, access, QA, reconciliation, and delivery records per order.

Workflow:

1. While payments are absent, a qualified prospect may submit the unlisted survey; the server validates and stores
   only a pending intake in Supabase. This is not an order and does not begin fulfillment.
2. After Gate B and all retained gates open, Racoben accepts only the independent orders that documented staffing,
   reviewer, delivery, and quality capacity can protect concurrently.
3. The service lead normalizes intake and builds a fact ledger.
4. Internal AI assists with first drafts (fact-ledger constrained).
5. Channel adaptation, critique, and polish passes run internally.
6. The service lead completes deterministic QA and prepares the editor packet.
7. The assigned, cleared independent marketing reviewer reviews and approves the package.
8. Final files are packaged manually and delivered within the promised delivery window.
9. New acceptance freezes until that order, handling time, revision burden, support, and economics are reconciled.

Success criteria:

- two timed synthetic rehearsals completed before any capacity or turnaround claim
- one reconciled paid order, followed only if safe by at most two more sequential orders
- clear understanding of common campaign types
- clear understanding of fulfillment bottlenecks
- customer feedback on usefulness

**Status:** future conditional pilot; HARD HOLD. The current phase is non-payment fit-check and pending-intake
validation only. G5 external motion remains unassigned.

### Phase 2 — Lightweight Internal Tooling

Goal: reduce repetitive manual work after real orders reveal the workflow.

Build in a **staff-only internal app or workspace** (locked-down access — not linked from the public site).

Possible tools:

- internal intake viewer
- fact ledger builder
- campaign-type template selector
- internal draft-generation helper
- channel adaptation runner
- critique/polish prompt runner
- folder/package generator
- QA checklist tracker
- editor packet generator
- delivery status tracker
- reusable file naming system

Still required:

- final independent marketing review by an assigned and cleared reviewer
- human QA
- no customer-facing AI
- no full SaaS dashboard unless proven necessary

### Phase 3 — Robust Backend

Goal: add heavier infrastructure only after the offer is validated.

Possible future additions:

- database
- customer accounts
- order history
- payment integration
- automated delivery
- internal admin dashboard
- subscription plans
- team workflows
- saved campaign templates

These should not be built until there is evidence that customers are paying and the fulfillment process is repeatable.

## What Not to Build Early

Do not build early:

- complex SaaS backend
- customer accounts
- subscription billing
- full admin dashboard (customer-facing)
- automated campaign generation without review
- customer-facing AI prompt interface
- multi-tenant data model
- CRM features
- email sending platform
- social posting automation
- marketing analytics platform
- analytics that stores personal/project data

Snickerdoodle V1 should sell the outcome, not the software.

## V1 Backend Goal

The V1 backend should make it easy to receive, normalize, draft, review, package, and deliver campaign packages.

The goal is not scale.

The goal is learning.

## V1 Business Goal

The first business milestone is not full automation.

The first business milestone is:

- sell 5–10 campaign packages
- fulfill them well
- learn what customers actually need
- identify which parts of fulfillment are repetitive
- automate only after the process is understood

## Guiding Sentence

Snickerdoodle should begin as a high-quality, human-reviewed productized service with internal AI-assisted fulfillment, then gradually evolve into software only where automation clearly improves speed, consistency, or margin.

## Related internal docs

```text
fulfillment/   — pipeline, QA, prompts, delivery package
templates/     — campaign-type template notes
docs/          — product philosophy, fact ledger, editor packet, automation pipeline
```
