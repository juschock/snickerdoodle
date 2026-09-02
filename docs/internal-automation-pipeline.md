# Snickerdoodle internal automation pipeline

Staff-only production workflow. Customers never see this process.

## Overview

```text
Qualified customer survey (server-stored pending intake)
        ↓
1. Intake normalization
        ↓
2. Fact ledger
        ↓
3. Campaign-type selection
        ↓
4. Internal AI drafting
        ↓
5. Channel adaptation
        ↓
6. AI critique pass
        ↓
7. AI polish pass
        ↓
8. Deterministic QA
        ↓
9. Editor packet
        ↓
10. Independent marketing review (final quality gate)
        ↓
11. Package assembly
        ↓
12. Delivery
```

## Stage details

### 1. Intake normalization

- Parse email or form submission into structured fields.
- Flag missing required fields before production starts.
- Create internal folder: `Snickerdoodle_[EventName]_[YYYYMMDD]`.

### 2. Fact ledger

- Extract only verified facts from the survey into a single source of truth.
- See `docs/fact-ledger.md`.
- All downstream AI steps must reference the ledger, not the raw survey alone.

### 3. Campaign-type selection

- Map brief to template pack in `templates/`.
- Note channel weights and tone emphasis for the campaign type.

### 4. Internal AI drafting

- The service-lead role uses ChatGPT and custom tooling to generate first drafts.
- Prompts in `fulfillment/internal-prompts.md`.
- **Hard rule:** use fact ledger only. No invented facts.

### 5. Channel adaptation

- Adapt base copy for each requested channel (email, Instagram, Facebook, etc.).
- Respect platform length and format norms.

### 6. AI critique pass

- Run a structured critique against the fact ledger and brief constraints.
- Flag unsupported claims, tone mismatches, missing channels, and phrase violations.

### 7. AI polish pass

- Apply fixes from critique pass.
- Improve clarity, flow, and CTA strength without adding new facts.

### 8. Deterministic QA

- Run `fulfillment/qa-checklist.md` mechanically where possible.
- Verify dates, links, channel coverage, file naming.

### 9. Editor packet

- Assemble the independent marketing review packet per `docs/editor-packet.md`.
- Include fact ledger, drafts, critique notes, and QA results.

### 10. Independent marketing review

- The assigned and cleared independent marketing reviewer is the final expert quality gate.
- Approve, edit, or return for revision before packaging.

### 11. Package assembly

- Build customer deliverable per `fulfillment/delivery-package.md`.

### 12. Delivery

- Send ZIP + optional Google Doc link to customer delivery email.
- Confirm that the normal 48-hour delivery window starts only after Racoben confirms the order following any required payment and receives a complete intake.

## Hard rules

- AI is internal only. Never customer-facing.
- AI must use only facts in the fact ledger.
- No invented sponsors, donation matches, statistics, quotes, links, partners, deadlines, outcomes, or claims.
- Independent marketing review is required before every delivery in V1.

## V1 constraints

The current product accepts only fit checks and server-stored pending intakes. It has no executable payment runtime;
a pending intake is not an order and cannot start production. The future paid pilot may begin only after Gate B and
all release, legal, reviewer, economics, and external-motion gates open. The first completed order and its
reconciliation are learning evidence, not a global acceptance lock: multiple independent customer orders may be
accepted and processed concurrently within documented service-lead, reviewer, and quality capacity. Every order keeps
isolated reservation, assignment, access, QA, reconciliation, and delivery records; pause new acceptance whenever
those staffing or quality gates cannot protect every accepted order.

The two-person role model remains on HARD HOLD. No reviewer identity, relationship, employment, compensation,
ownership, availability, assignment, authority, or access is implied. Activation requires CEO designation and
assignment, availability and training confirmation, classification/conflict/IP clearance, least-privilege
per-order access approval, two timed synthetic rehearsals, and documented CFO+CRO concurrence for all monetary
terms. G5 external motion remains unassigned.
