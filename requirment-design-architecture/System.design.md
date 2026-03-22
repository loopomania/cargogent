# System Design - CargoGent

## Architecture
- n8n orchestrates workflows
- Tracker service handles airline + ground
- DB stores shipments, events, history

## Tenant Resolution
- Extract domain from email
- Match to tenant
- Reject if unknown

## Data Model
- HAWB (shipment)
- MAWB (transport)
- Relationship: many-to-many (Mapped via the `hawb_mawb_lines` DB table)
- Piece-aware counts required

## User notification preferences (settings page)
Persist per user (e.g. on `users` or `user_notification_settings`):
- **`incremental_email_interval_hours`** — chosen interval for “changes since last mail” (within allowed range, e.g. 1–4 hours).
- **`full_report_times_per_day`** — how many times per 24h to send the **full** report email (0 = none, 1, 2, … per product max).
- Workflow / cron uses these fields when deciding whether to enqueue or send incremental vs full-report messages.

## User screens (frontend + API)

### Settings
- CRUD for the persisted notification fields above; validate allowed intervals and max full reports per day.

### AWBs (default = “needs attention”)
**Default list query** (tenant-scoped): union / filter of:

1. **Stale 24h**  
   - Shipment is **still tracked** (e.g. present in `awbs_in_transit` or equivalent “active” flag) **and** **not delivered**.  
   - **`updated_at`** (or last meaningful history / last successful track timestamp) **< now − 24 hours**.  
   - Aligns with backend / n8n **24h stale** Slack rule — same predicates avoid drift between ops alerts and UI.

2. **On ground + special treatment**  
   - Latest aggregate status / mode = **on ground** (define using same enum/logic as scheduling “ground” bucket).  
   - **And** **`requires_special_treatment` = true** (or equivalent), populated from business rules once **type/stage** columns from Excel are defined (**TBD**). Until rules exist, UI can hide this bucket or show an empty state with copy “rules pending”.

**Other views (product):** optional tabs or filters — e.g. “All active”, “Delivered”, search by HAWB/MAWB — **not** the default landing behavior.

### Auth (Sign In)
- JWT-based session handling, persisted via HTTP-only cookies.
- Authentication validates against `users` table via Neon Postgres.
- Resolves tenant boundary explicitly based on credentials.

### Query (Manual Tracking)
- Currently a synchronous API endpoint performing live tracking.
- In the future, this will retrieve data directly from the DB with a UI option to force a manual "refresh".
- Aggregates historical + current response, applying **Discrepancy Rules** instantly for the UI timeline.

### User Management
- CRUD operations targeting the `users` table scoped to the admin's tenant.
- Secures passwords with hashing algorithms.
- Automatically generates and assigns unique 16-character keys for API access.

### Logs
- Surfaced via backend endpoints retrieving n8n execution history or local server logs.
- Helps Ops debug tracker failures and Slack alert triggers.

## Ground Services
- Providers: Maman, Swissport
- Same status model
- Query:
  - Import: MAWB + HAWB
  - Export: MAWB or fallback HAWB

## Status Mapping
Unified ground status:
- RCS, SEC, PRE, RCL, DEP, RCF, NFD, AWD, DLV, DIS

## Reconciliation & conflicts
Two different conflict types; **do not** apply the same rule to both.

### Excel vs database
- When incoming Excel data **disagrees** with persisted DB data for a shipment: **force a tracking re-query** (schedule **now** / next cycle as “due immediately”) **and** send **Slack** (CargoGent ops channel).
- Purpose: refresh truth from airline/ground; ops visibility.

### Tracker vs tracker (e.g. airline vs ground, or source A vs source B)
- When two **tracker** sources disagree on facts for the same check: **newest event wins** for merged/persisted interpretation **and** send **Slack** (implemented as an async workflow handled by n8n, triggered via API).
- Does **not** replace the Excel↔DB rule above; Excel↔DB always → **re-query + Slack**.

## Scheduling
- Orchestrated entirely by **n8n polling loops**.
- Every 2h on ground
- After landing: +1h
- Retry failure: 10 min

## Failure Handling
- 2 attempts per source
- If fail: reschedule + Slack

## Queue
- Key: tenant + HAWB + MAWB
- One job runs all sources

## Discrepancy Rules
- Piece mismatch
- Time diff > 30 min
- Carrier mismatch = severe
- Location mismatch = severe

## History
- Multiple rows per refresh (per source)

## Outbound Excel
TBD
