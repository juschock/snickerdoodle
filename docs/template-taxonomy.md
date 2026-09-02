# Snickerdoodle template taxonomy

How campaign templates are organized for V1.

## Families

Three launch families — every template belongs to exactly one:

```text
cause-nonprofit       → 4 templates
local-acquisition     → 5 templates
booking-reservation   → 1 template (+ variants)
```

Family ids in code: `cause-nonprofit` | `local-acquisition` | `booking-reservation`

Intake survey labels map via `INTAKE_FAMILY_TO_TEMPLATE_FAMILY` in `lib/campaign-templates.ts`.

---

## cause-nonprofit

**Abstraction:** mission-driven campaigns where the audience supports a cause, event, or community effort.

| Template | Primary actions |
|----------|-----------------|
| Animal Rescue Adoption Event | attend, RSVP, donate, foster, share |
| Nonprofit Year-End Appeal | donate before year-end |
| Volunteer Drive Campaign | sign up for a volunteer shift |
| Sponsor Ask Campaign for Local Event | sponsor, in-kind, provide venue/items, share |

**Core arc (many templates):**

```text
announcement → story/mission → reminder → last call → day-of → thank-you → follow-up
```

---

## local-acquisition

**Abstraction:** local businesses acquiring customers, visits, orders, or event turnout.

| Template | Primary actions |
|----------|-----------------|
| Restaurant Local Discovery Campaign | visit, order, reserve, try, review, refer |
| Fast-Casual Lunch Offer Campaign | visit, order online, try combo, bring a friend, review |
| Restaurant Catering / Signature Dish Campaign | request catering, order, visit, try platter, review |
| Brewery / Taproom Event Campaign | visit, attend event, bring a friend, try release, join list |
| Hobby / Collectibles Shop Event Campaign | attend trade night, visit, buy, join list, refer |

**Core formula:**

```text
local trigger + specific offer + proof + simple CTA + deadline or capacity
```

Restaurant Local Discovery is the **primary public proof** for small-business capability — broader than a single vertical grand opening.

---

## booking-reservation

**Abstraction:** calendar-based service businesses filling appointment slots.

| Template | Primary actions |
|----------|-----------------|
| Seasonal Booking Campaign | book, reserve, schedule, rebook |

**Variants:**

- Pet groomer holiday booking
- Salon / barber back-to-school haircut

**Core funnel:**

```text
booking trigger → offer → booking page → confirmation → reminder → review/rebook
```

---

## Public proof set (V1)

Snickerdoodle publicly proves three capabilities:

1. **Cause / community** — Animal Rescue Adoption Event
2. **Deadline fundraising** — Nonprofit Year-End Appeal
3. **Local business acquisition** — Restaurant Local Discovery Campaign

Not an encyclopedia — proof, not bloat.

---

## Vertical vs action

Templates are organized by **business model + action**, not geography:

```text
restaurant     → local discovery / lunch offer / catering inquiry
brewery        → taproom event / slow-night traffic
hobby shop     → trade night / collector event
service biz    → seasonal booking (future: quote request)
```

Avoid generic “grand opening” as the default small-business template.

---

## Relationship to samples

| Layer | Location | Count |
|-------|----------|-------|
| Template metadata | `lib/campaign-templates.ts` | 10 |
| Full public sample kits | `lib/sample-kits.ts` → `publicSampleKits` | 3 |
| Internal fulfillment | templates + `fulfillment/` + fact ledger | 10 |

Sample pages render rich kit content; templates define classification, deliverables, and QA for all ten.
