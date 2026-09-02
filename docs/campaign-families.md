# Snickerdoodle Campaign Families

Three launch families. All V1 templates map to one family. See `lib/campaign-templates.ts` and `docs/template-taxonomy.md`.

## 1. Cause / Nonprofit (`cause-nonprofit`)

**Templates (4):**

- Animal Rescue Adoption Event *(public sample)*
- Nonprofit Year-End Appeal *(public sample)*
- Volunteer Drive Campaign
- Sponsor Ask Campaign for Local Event

Examples: fundraising, year-end, adoption events, volunteer drives, sponsor asks.

Primary actions:

```text
donate · attend · volunteer · register · share · sponsor · follow up
```

---

## 2. Local Customer Acquisition (`local-acquisition`)

**Templates (5):**

- Restaurant Local Discovery Campaign *(public sample)*
- Fast-Casual Lunch Offer Campaign
- Restaurant Catering / Signature Dish Campaign
- Brewery / Taproom Event Campaign
- Hobby / Collectibles Shop Event Campaign

Examples: local discovery, lunch offers, catering inquiry, taproom events, trade nights.

Primary actions:

```text
visit · buy · order · book · call · redeem · review · refer
```

---

## 3. Booking / Reservation (`booking-reservation`)

**Templates (1 + variants):**

- Seasonal Booking Campaign
  - *variants:* pet groomer holiday booking, salon back-to-school haircut

Examples: grooming, salons, seasonal appointment pushes.

Primary actions:

```text
book · reserve · schedule · rebook
```

---

## Intake routing

Early survey questions should determine:

1. organization type
2. campaign family
3. desired action

Survey hints suggest templates via `getTemplatesForIntakeFamily()` — see `lib/intake.ts` and `components/brief-form.tsx`.

---

## Core rule

Every package exists to move **one clearly defined audience** toward **one clearly defined action**.
