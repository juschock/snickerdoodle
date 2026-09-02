# Snickerdoodle campaign template library

V1 locked library: **10 campaign execution templates**.

Each template maps **one audience → one primary action → one coordinated package**. Not generic marketing.

Source of truth in code: `lib/campaign-templates.ts`

## Public vs internal

### Public proof samples (3)

Polished `/samples/*` pages for prospects:

| Template | Slug | Family |
|----------|------|--------|
| Animal Rescue Adoption Event | `adoption-event` | cause-nonprofit |
| Nonprofit Year-End Appeal | `year-end-appeal` | cause-nonprofit |
| Restaurant Local Discovery Campaign | `restaurant-local-discovery` | local-acquisition |

### Internal V1 library (7 additional)

Used for fulfillment, Studio classification, and future sample expansion — **not all public yet**:

| Template | Family |
|----------|--------|
| Volunteer Drive Campaign | cause-nonprofit |
| Sponsor Ask Campaign for Local Event | cause-nonprofit |
| Fast-Casual Lunch Offer Campaign | local-acquisition |
| Restaurant Catering / Signature Dish Campaign | local-acquisition |
| Brewery / Taproom Event Campaign | local-acquisition |
| Hobby / Collectibles Shop Event Campaign | local-acquisition |
| Seasonal Booking Campaign | booking-reservation |

**Seasonal Booking variants** (internal, not separate top-level templates):

- Pet groomer holiday booking
- Salon / barber back-to-school haircut

## Retired / merged templates

Earlier draft templates fold into sharper V1 templates:

| Earlier idea | Now |
|--------------|-----|
| Pet Groomer Holiday Booking (public) | Seasonal Booking variant — internal |
| Restaurant Slow-Night Reservation | Restaurant Local Discovery / Fast-Casual variant |
| Grand Opening | Restaurant Local Discovery / local launch variant |
| Lapsed Customer Win-Back | Future retention template |
| Local Service Quote-Request | Future service-business template |
| Salon Back-to-School | Seasonal Booking variant |

## Template record shape

Every entry in `lib/campaign-templates.ts` includes:

```text
id
title
family
audience
primaryActions
whyItBelongs
defaultDeliverables
exampleAngle
qaFocus
isPublicSample
sampleSlug (if public)
variants (optional)
```

## Uses

| Consumer | How |
|----------|-----|
| Public sample pages | `publicSampleKits` filtered by `isPublicSample` |
| Intake routing | `getTemplatesForIntakeFamily()` in survey form hints |
| RacobenStudio | Future: campaign classification on order create |
| Internal AI prompts | Future: template id → prompt pack selection |
| Fulfillment staff | `defaultDeliverables` + `qaFocus` checklists |

## Lead research (internal only)

Herndon small-business research informed **template shape**, not public copy:

- Hobby/collectibles → Hobby / Collectibles Shop Event Campaign
- Brewery → Brewery / Taproom Event Campaign
- Restaurants → Restaurant Local Discovery, Fast-Casual Lunch, Catering/Signature

The research notes intentionally retain only anonymous business categories. Do not place prospect names or identifying details in this public repository or in public materials unless they become customers and provide documented permission.

Public restaurant sample uses **fictional** Juniper Spoon Thai Kitchen.

## Doctrine reminder

```text
We sell campaign execution packages.
Every template exists to move one defined audience toward one defined action.
```

See also: `docs/template-taxonomy.md`, `docs/campaign-families.md`, `docs/sample-kit-plan.md`
