# Editor packet

The editor packet is the independent marketing review bundle — the final human quality gate before customer delivery.

## Purpose

Give an assigned and cleared independent marketing reviewer everything needed to approve or revise a campaign
package in one place, without re-running production from scratch.

The reviewer role is currently unassigned and under HARD HOLD. This specification does not identify a person or
infer relationship, employment, compensation, ownership, availability, assignment, authority, or access. It may be
used operationally only after CEO designation and assignment, availability and training confirmation,
classification/conflict/IP clearance, least-privilege per-order access approval, two timed synthetic rehearsals,
and documented CFO+CRO concurrence for all monetary terms.

## When to assemble

After deterministic QA passes and before package assembly.

## Packet contents

```text
Snickerdoodle_EditorPacket_[EventName]_[YYYYMMDD]/
├── 00_Fact_Ledger.md          — approved fact ledger (see docs/fact-ledger.md)
├── 01_Brief_Original.txt      — raw customer submission
├── 02_Draft_All_Channels.md   — combined draft output
├── 03_Critique_Notes.md       — AI critique pass findings + resolutions
├── 04_QA_Checklist.md         — completed fulfillment/qa-checklist.md
├── 05_Change_Log.md           — what changed between draft and polish pass
└── 06_Independent_Review.md    — approval checklist (below)
```

## Independent marketing review checklist (`06_Independent_Review.md`)

```markdown
# Independent marketing review — [Campaign Name]

- [ ] Fact ledger matches customer brief
- [ ] No invented sponsors, stats, quotes, links, partners, deadlines, outcomes, or claims
- [ ] Tone matches customer request
- [ ] All requested channels included
- [ ] Dates, times, location/link, and offer/ask are correct
- [ ] Phrases to include/avoid respected
- [ ] Copy is usable without extra explanation
- [ ] Appropriate for nonprofit / local / community voice if applicable
- [ ] Ready for customer delivery

Decision: [ ] Approved  [ ] Needs revision

Notes:
```

## Reviewer role

- **Final expert quality gate** — not the first drafter.
- The service lead and internal AI tooling produce drafts; the assigned and cleared reviewer approves what ships.
- Revisions go back through polish + QA, not straight to the customer.

## After approval

1. Apply the reviewer’s edits to final deliverable files.
2. Assemble customer package per `fulfillment/delivery-package.md`.
3. Deliver to customer delivery email within SLA.
