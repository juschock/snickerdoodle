# RacobenStudio phase plan

Build only for a measured staged-pilot bottleneck, not full SaaS. Do not start Studio until Snickerdoodle is live on
`racoben.com/snickerdoodle`, sample kits exist, and the one-order/freeze/reconcile pilot produces evidence that
manual operations are blocking safe delivery.

## Prerequisites (Snickerdoodle public)

- [ ] `racoben.com/snickerdoodle` proxied and verified
- [ ] `snickerdoodle@racoben.com` receiving mail
- [ ] Two public sample kits published
- [ ] First paid validation cycle started

## Order lifecycle statuses

```text
New Intake
Needs Clarification
Ready for Drafting
Drafting
AI Critique
Ready for Human Review
Independent Review
Revision Needed
Approved
Packaged
Delivered
Follow-Up Sent
Closed
```

## Studio Phase 1 — Internal CRM / ops

**Goal:** Replace spreadsheets for accounts and order tracking.

- Staff login (Supabase Auth)
- Accounts list + detail
- Contacts
- Campaigns list (multi per account)
- Orders list + status board
- Brief viewer (read-only from stored submission)
- Internal notes
- Activity log

**No:** payment, customer portal, AI runner, integrations.

## Studio Phase 2 — Production pipeline

- Fact ledger editor
- Kit asset editor (draft/final text)
- AI draft run records (manual paste or script hook)
- Editor packet assembly
- Independent marketing review queue
- Delivery package tracker + status transitions

## Studio Phase 3 — Analytics

- Fulfillment metrics entry / timers
- Manual campaign outcome metrics
- Customer feedback capture
- Simple dashboards: fulfillment time, rewrite rate, revenue per client

## Studio Phase 4 — Automation

- Prompt runner for draft / critique / polish
- Package folder generator
- Delivery email drafter (staff sends manually)

## Studio Phase 5 — Integrations (only if validated)

- Stripe
- Mailchimp / Eventbrite / Givebutter
- Public brief form → Studio intake API (if not done in Phase 2)

## Public Snickerdoodle coupling

| Studio phase | Public Snickerdoodle change |
|--------------|--------------------------|
| 1 | Existing fit-check plus pending-intake flow continues |
| 2 | Optional: move order creation behind a reviewed Studio API |
| 3+ | Same intake; no customer dashboard |

## Open questions

1. **Repo name:** `RacobenStudio` (portfolio-wide) vs `SnickerdoodleStudio` (product-specific)?
2. **Account matching:** Auto-merge by email domain vs manual dedup?
3. **Campaign auto-create:** Every brief creates new campaign vs prompt staff to link existing?
4. **Subdomain:** `studio.racoben.com` vs `ops.racoben.com`?
5. **When to split:** After how many confirmed orders does manual fit review become blocking?

Recommended planning defaults: `RacobenStudio`, manual account matching in V1, authorized staff picks the campaign
on intake review, `studio.racoben.com`, and no Studio build until a reconciled pilot demonstrates concrete ops pain.
The first completed paid order and its required reconciliation are learning evidence, not a global acceptance lock;
the pilot may accept and process multiple independent customer orders concurrently within documented staffing,
reviewer, and quality capacity. Each order requires isolated reservation, assignment, access, QA, reconciliation,
and delivery records. This is not build, deployment, access, payment, or external-action authority.
