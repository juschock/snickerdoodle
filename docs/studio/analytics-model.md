# Analytics model

Three layers. **V1 outcome analytics are manual** — Snickerdoodle does not send email or publish posts, so performance data comes from client reports unless integrations are added later.

## Layer A — Internal operations analytics

How authorized service-lead and independent-review roles run fulfillment. The reviewer role is currently unassigned
and under HARD HOLD; these are future measurement fields, not evidence of assignment, availability, authority, or access.

**Track per order:**

- Intake → delivery total time
- Time in each status (drafting, independent marketing review, revision, packaging)
- AI draft / critique / polish duration (from `ai_draft_runs`, `fulfillment_metrics`)
- Revision count
- On-time delivery (vs `due_at`)

**Track aggregate:**

- Orders created / delivered per week
- Average fulfillment time
- Revenue per client, repeat order rate
- Package type mix
- Brief → paid conversion (when sales tracked)

**Validation metrics** (from product research):

- Paid kits sold
- Conversation-to-paid conversion
- Time to delivery
- Rewrite rate
- Use rate (customer-reported)
- Satisfaction / would buy again
- Path to $1,000/month

### fulfillment_metrics (per order)

| Field | Notes |
|-------|-------|
| order_id | FK |
| intake_review_minutes | |
| fact_ledger_minutes | |
| drafting_minutes | |
| ai_polish_minutes | |
| human_review_minutes | |
| revision_minutes | |
| packaging_minutes | |
| total_minutes | computed |

## Layer B — Sales / PMF analytics

Learn who pays and why.

**Track:**

- Lead source, outreach campaign, segment
- Organization type
- Campaign trigger (event, year-end, launch)
- Price quoted vs accepted
- Objections, lost reason
- Follow-up date

**Tables (suggested):**

- `lead_sources` — name, channel
- `outreach_events` — account_id, date, channel, status, notes

Enables insights like: rescues convert better than churches; year-end appeals beat open houses.

## Layer C — Customer campaign outcome analytics

What happened **after** the client used the kit.

**V1: manual entry form** in Studio (`campaign_metrics`).

| Field | Notes |
|-------|-------|
| campaign_id | FK |
| metric_date | |
| email_sends, email_opens, email_clicks | |
| donations_count, donation_amount | |
| tickets_sold, rsvps, volunteer_signups | |
| landing_page_visits, social_posts_used | |
| notes | |
| source | manual, client_report |

**customer_feedback (per order or campaign):**

| Field | Notes |
|-------|-------|
| order_id, campaign_id | |
| used_materials_percent | |
| satisfaction_score | |
| would_buy_again | |
| testimonial | |
| revision_notes | |

## Do not build yet

- Mailchimp, Constant Contact, Eventbrite, Givebutter integrations
- Google Analytics / Meta auto-import
- Complex BI dashboards

Build manual entry first; integrate only after PMF validation.
