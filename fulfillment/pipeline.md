# Snickerdoodle fulfillment pipeline (internal)

1. **Intake received** — A qualified, server-stored survey is manually accepted into a ticket folder: `Snickerdoodle_[EventName]_[YYYYMMDD]`.
2. **Intake normalization** — Parse submission into structured fields; flag missing info before starting.
3. **Fact ledger** — Build approved fact ledger per `docs/fact-ledger.md`. All AI steps use ledger only.
4. **Survey completeness check** — Verify dates, location, audience, goal, offer, tone, channels, delivery email.
5. **Campaign type mapping** — Select template pack from `templates/` (fundraiser, local-event, adoption-drive, etc.).
6. **Internal drafting** — The service-lead role uses ChatGPT and custom tooling per `fulfillment/internal-prompts.md`. Customer never sees this step.
7. **Channel adaptation** — Adapt copy for each requested channel.
8. **AI critique pass** — Diff output against fact ledger; flag invented or unsupported claims.
9. **AI polish pass** — Apply critique fixes without adding new facts.
10. **Deterministic QA** — Run `fulfillment/qa-checklist.md`.
11. **Editor packet** — Assemble the independent marketing review bundle per `docs/editor-packet.md`.
12. **Independent marketing review** — An assigned and cleared reviewer provides the final expert quality gate before packaging.
13. **Package & deliver** — Assemble ZIP + optional Google Doc link per `fulfillment/delivery-package.md`. Confirm that the normal 48-hour delivery window starts only after Racoben confirms the order following any required payment and receives a complete intake.

See also: `docs/internal-automation-pipeline.md`

## V1 constraints

- Current fit checks and server-stored pending intakes are not orders and cannot start production; no executable payment runtime exists.
- Future pilot: after Gate B and every retained gate open, treat each completed-order reconciliation as learning evidence rather than a global acceptance lock. Multiple independent orders may be accepted and processed concurrently within documented service-lead, reviewer, delivery, and quality capacity, with isolated reservation, assignment, access, QA, reconciliation, and delivery records per order.
- The two-person role model is HARD HOLD and rehearsal-only until CEO designation and assignment, availability and training confirmation, classification/conflict/IP clearance, least-privilege per-order access approval, two timed synthetic rehearsals, and documented CFO+CRO concurrence for all monetary terms.
- The reviewer is unassigned; do not infer identity, relationship, employment, compensation, ownership, availability, authority, or access. G5 external motion is also unassigned.

## Hard rule

AI is allowed and encouraged internally, but never customer-facing. AI must use only facts in the fact ledger. No invented sponsors, donation matches, statistics, quotes, links, partners, deadlines, outcomes, or claims.
