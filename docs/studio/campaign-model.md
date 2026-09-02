# Campaign model

Separate **Campaign** from **Order**. A campaign is the initiative; an order is one kit/deliverable inside it.

## Example

```text
Meadowline Animal Rescue (fictional example account)
├── Fall Adoption Weekend (Campaign — short_term)
│   └── Standard Launch Kit (Order)
├── Giving Tuesday Appeal (Campaign — short_term)
│   ├── Launch Kit (Order)
│   ├── Reminder Kit (Order)
│   └── Last-Call Kit (Order)
├── Monthly Foster Recruitment (Campaign — ongoing)
│   └── Q1 Refresh Kit (Order)
└── Spring Gala (Campaign — recurring)
    └── 2026 Gala Kit (Order)
```

## Campaign types

| Type | Example | Backend behavior |
|------|---------|------------------|
| `short_term` | Adoption event Saturday | Fixed deadline; often one primary kit |
| `ongoing` | Foster recruitment | Repeated assets over weeks/months |
| `recurring` | Annual gala, year-end appeal | Repeats each year; prior kits inform next |
| `evergreen` | Volunteer signup | Always active; periodic refreshes |

## Campaign fields

| Field | Notes |
|-------|-------|
| id | |
| account_id | FK |
| name | |
| campaign_type | short_term, ongoing, recurring, evergreen |
| status | planning, active, paused, completed, archived |
| start_date, end_date | optional |
| primary_goal | |
| primary_cta | |
| audience | |
| notes | |
| created_at, updated_at | |

## Campaign milestones

Optional checkpoints for ongoing/recurring campaigns.

| Field | Notes |
|-------|-------|
| id | |
| campaign_id | FK |
| name | e.g. "14 days out", "Launch day" |
| due_date | |
| completed_at | |
| notes | |

## Orders within campaigns

- One campaign → **many orders** over time
- Each order has its own brief (or brief delta), fact ledger, assets, review, delivery
- The assigned independent marketing review queue shows **campaign context**: past kits, tone notes, performance notes

## Independent marketing review context (ongoing clients)

When reviewing a new kit for a repeat client, surface:

- Prior orders for same campaign
- Phrases to include/avoid from account history
- Customer feedback from past kits
- Manual campaign metrics (if entered)

This improves consistency without customer-facing accounts.
