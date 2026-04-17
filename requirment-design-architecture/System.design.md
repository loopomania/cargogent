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
  - Export: For shipments originating from Israel, CargoGent queries Maman Ground Services directly via HAWB. 
    * Maman returns the authentic piece count and weight for the HAWB.
    * This dynamically overrides the consolidated MAWB's pieces/weight in the unified `TrackingResponse`.
    * Synthetic events detailing storage type, customs status, and billing are prepended.

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

## Outbound Excel (Daily Return Excel)

**Trigger:** n8n scheduled workflow, daily at noon (tenant timezone).

**Format:** mirrors the exact template layout of the original inbound Excel (same columns, same order, same headers). One return file per `excel_template` per tenant.

**Content:**
- All active shipments for the tenant are included.
- All columns show their **latest** values.
- If a field's latest value differs from the **original** value (first ingest), the cell is formatted in **RED** and displays both values: `"original → latest"`.
- "Latest" may originate from a newer inbound Excel **or** from tracker query results.

**Import leg expansion:** if the tracker discovers intermediate legs not present in the original inbound Excel, new rows are inserted in the return Excel matching the same column layout. These rows show tracker-derived data with no RED marking (no original to compare against).

**Export:** rows match the original per-leg layout. Tracker may update dates per leg; diffs are per-leg.

**Audit:** each generated file is recorded in `excel_return_snapshots` (shipment count, diff count, file path, recipients).

**Versioning model (applies to all data):**
1. First ingest from Excel = **original (base) data**. Frozen, never overwritten.
2. Any subsequent change from any source (Excel or tracker) = **latest value**.
3. Only two versions kept: original and latest.
4. `values_original` / `values_latest` JSONB on `excel_transport_lines` store versioned fields.
5. `raw_excel_row` JSONB preserves the complete original parse for regeneration fidelity.


## Email workflow

1. the email workflow starts by reading email with an excel attachment
there are two excel types:
    - import excel
    - export excel

2. import excel:
    current relevate columns:
    Shipment ID - the id of the shipment 
    Origin - the origin of the shipment 
    Destination - the destination of the shipment 
    Master - the master AWB of the shipment 
    House Ref - the house AWB of the shipment 
    Weight - the weight of the shipment 
    UQ - next to weight column, the uq of the shipment KG or LB
    Outer - the outer of the shipment , number of outer boxes
    UQ - next to outer column, the uq of the outer boxes 
    Origin ETD - the origin etd of the shipment 
    Dest ETA - the dest eta of the shipment 
    Leg Load Port - the leg load port of the shipment 
    Leg Discharge Port - the leg discharge port of the shipment 
    Leg ATD - the leg atd of the shipment 
    Leg ATA - the leg ata of the shipment 
3. export excel:
   current relevate columns:
   File number - the id of the shipment 
   Job number - the job number of the shipment 
   Customs file number - the customs file number of the shipment 
   Load Port/Gateway ID - the load port/gateway id of the shipment 
   Incoterms ID - the incoterms id of the shipment 
   Carrier ID - the carrier id of the shipment 
   Carrier Name - the carrier name of the shipment 
   Ch. Wght - the weight of the shipment 
   PCS - the number of pieces of the shipment 
   Master BL - the master AWB of the shipment 
   Full HAWB - the full HAWB of the shipment 
   ETD - the etd of the shipment 
   ATD - the atd of the shipment 
   ATA - the ata of the shipment    
   יציאה מממ"ן / סוויספורט - the departure from maman / swissport of the shipment 
   Remarks - the remarks of the shipment 


4. the import excel contains more columns, but only the columns above are relevant for now, the other columns should be ignored
   1. all relevant columns must be saved in the database, with the customer ID of the customer who sent the email
   2. when a shipment has more then one leg, the excel will have more then one row for the same shipment, each row will have the same shipment id, but different leg data
   3. first time a shipment is in the excel it may not have all the columns
   4. each time the excel with shipment id already exists in the database, we need to update the shipment with the new data
   5. if update data is different from the data in the database, we need to keep the original data and keep the new data as a new version of the data.
   6. only two sets of data version should be kept, the original data and the latest version of the data.
   7. only the following columns may be updated:
    Weight - the weight of the shipment 
    UQ - next to weight column, the uq of the shipment KG or LB
    Outer - the outer of the shipment , number of outer boxes
    UQ - next to outer column, the uq of the outer boxes 
    Origin ETD - the origin etd of the shipment 
    Dest ETA - the dest eta of the shipment 
    Leg Load Port - the leg load port of the shipment 
    Leg Discharge Port - the leg discharge port of the shipment 
    Leg ATD - the leg atd of the shipment 
    Leg ATA - the leg ata of the shipment
   8. if a shipment id has changes in the other columns, we need to keep the original data and send slack alert to the system admin
   9. the first time a shipment is added to the database, we need to schedule a tracking job for this shipment, this is done by adding the shipment to the tracking table with the next tracking date set to now
10. the export excel contains more columns, but only the columns above are relevant for now, the other columns should be ignored
    1. all relevant columns must be saved in the database, with the customer ID of the customer who sent the email
    2. when a shipment has more then one leg, the excel will have more then one row for the same shipment, each row will have the same file number, but different leg data
    3. first time a shipment is in the excel it may not have all the columns
    4. each time the excel with file number already exists in the database, we need to update the shipment with the new data
    5. if update data is different from the data in the database, we need to keep the original data and keep the new data as a new version of the data.
    6. only two sets of data version should be kept, the original data and the latest version of the data.
    7. only the following columns may be updated:
    Ch. Wght - the weight of the shipment 
    PCS - the number of pieces of the shipment 
    Leg Load Port - the leg load port of the shipment 
    Leg Discharge Port - the leg discharge port of the shipment 
    Leg ATD - the leg atd of the shipment 
    Leg ATA - the leg ata of the shipment
    8. if a file number has changes in the other columns, we need to keep the original data and send slack alert to the system admin
    9. the first time a Master AWB and House AWB should be added to the database a different table then in import and export table , table names schelued_tracking_jobs , we need to schedule a tracking job for this file number, this is done by adding the file number to the tracking table with the next tracking date set to now
## query workflow
1. any pair of Master AWB and House AWB should be unique in the table schelued_tracking_jobs
2. any new pair of Master AWB and House AWB , both from import and export excel files, should be added to the table schelued_tracking_jobs with the next tracking date set to now
3. When a shipment is fully delived , we need to remove it from the table schelued_tracking_jobs
4. if shipment is marked by the user as completed or canceled ,  we need to remove it from the table schelued_tracking_jobs
5. the schedule query updates the table shipments_tracking_events with the latest information from the airline or ground services
6. it may be that the query results will contain more then one event for the same shipment, in that case we need to add all of them to the table shipments_tracking_events
7. In additon to the events a table shipments_tracking_summary should be updated with the latest information from the airline or ground services

