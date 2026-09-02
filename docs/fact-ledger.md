# Fact ledger

The fact ledger is the single source of truth for a Snickerdoodle order. All internal AI drafting, adaptation, critique, and polish steps must use **only** facts recorded here.

## Purpose

- Prevent hallucinated sponsors, statistics, quotes, links, partners, deadlines, outcomes, or claims.
- Give the assigned and cleared independent marketing reviewer a quick accuracy reference during review.
- Make deterministic QA possible.

## When to create

Immediately after intake normalization, before any AI drafting.

## Ledger template

```text
Snickerdoodle Fact Ledger
Order: Snickerdoodle_[EventName]_[YYYYMMDD]
Status: draft | complete | approved

--- Organization ---
Organization name:
Contact / delivery email:

--- Campaign ---
Campaign name:
Campaign type:
Date & time:
Location or link:
Audience:
Main goal:
Offer / ask:

--- Verified details (from brief only) ---
Key details:
Phrases to include:
Phrases to avoid:
Website / social links:
Additional notes:

--- Channels requested ---
[List from brief]

--- Tone ---
Requested tone:

--- Explicit unknowns / gaps ---
[Fields missing or ambiguous — do not invent values]

--- Do-not-invent list (hard rule) ---
The following must NOT appear unless explicitly stated in the brief:
- sponsors or partners
- donation matches
- statistics or impact numbers
- quotes or testimonials
- URLs not provided
- deadlines not stated
- outcomes or guarantees
- awards, press coverage, or endorsements
```

## Rules

1. **Every fact must trace to the customer brief.** If it is not in the brief, it does not go in the ledger.
2. **Unknown fields stay empty.** Mark gaps in “Explicit unknowns / gaps” — never guess.
3. **AI prompts must include the full ledger**, not paraphrased summaries that could drift.
4. **Critique pass must diff output against the ledger**, not against general marketing best practices alone.
5. **The assigned and cleared independent marketing reviewer verifies the ledger** before approving the editor packet.

## Examples of violations

| Violation | Fix |
|---|---|
| “Thanks to our sponsor Acme Corp” (not in brief) | Remove or ask customer |
| “95% of donations go directly to programs” (not in brief) | Remove |
| “Register by Friday” (brief says “mid-October”) | Use brief date only |
| Fake testimonial quote | Remove entirely |

## Ledger approval

- **draft** — intake received, normalization in progress
- **complete** — all brief fields mapped; gaps documented
- **approved** — the assigned and cleared independent marketing reviewer confirms the ledger is accurate before packaging
