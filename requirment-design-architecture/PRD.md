# PRD - CargoGent

## Overview
CargoGent is a multi-tenant shipment tracking platform for freight forwarders.

## Tenancy
- Tenant identified by sender email domain
- Email sent to info@cargogent.com
- All data assigned to tenant
- Full tenant isolation

## Core Concepts
- HAWB = shipment identity (business)
- MAWB = airline transport identity
- One MAWB may include multiple HAWBs
- One HAWB may map to multiple MAWBs

## Tracking
- Airline tracking: MAWB + airline
- Ground services: MAWB + HAWB
- Providers: Maman, Swissport (same status model)
- Export Tracking (Israel): Maman Ground Services are queried explicitly for export HAWBs out of Israel. The system overwrites the MAWB tracking response's total weight and pieces with the HAWB's authentic statistics, as the MAWB often behaves as a consolidated pallet. Maman ground events (Customs Status, Flight Assignment, Processing) are prepended to the shipment's history.

## Status Rules
- Delivered only when ALL pieces delivered
- Otherwise: In Transit

## User screens
1. user sign in shows different screens based on the user role
    - admin user
    - customer user

2. admin user screens
    1. Query screen  - allow to query by HAWB or MAWB)(already exists in its base forum ,without database)
    2. Query Logs - show all queries that were made in the system
    3. user management - allow to create new users, reset passwords, generate 16-character access keys, and revoke access (already exists in its base forum)
3. customer user screens
    1. AWBs - show all AWBs for the customer
       1. top bar -  show the number of open (in process) AWBs
       2. alert table - show all AWBs that need attention (stale or on ground + special treatment)
       3. open AWBs table - show all open AWBs
          1. with pagination 500 AWBs per page
       4. all table shows MAWB and HAWB wieght , pieces , ATD(ETD) , ATA(ETA) 
       5. when cliecking on a row in the table, it will open the shipment detail view on top of the table
       6. shipment detail view:
          1. show smae screen of the existing query page, with on option to refresh query
          2. if the query data is different from the data arrived from the excel, show the query data with a note that it is different from the excel data and the date of the excel data
    2. settings
       1. dark mode toggle
       2. update notification settings
          1. incremental email interval
          2. full report frequency per day
        
    

### 1. Settings
- Same capabilities as **Notifications** below: incremental email interval, full-report frequency per day, and any other account/preferences the product adds later.

### 2. AWBs
- **Default view:** a **table** of AWBs / HAWBs that **need attention** (not the full shipment list until the user changes filter or tab).
- **Rows included by default:**
  1. **Stale update (24h):** Shipments that **should have received** a tracking update (e.g. still in active tracking / in transit) but **nothing meaningful has changed** on the record for **≥ 24 hours** — operator should investigate (stuck tracker, wrong MAWB, airline silence, etc.).
  2. **On ground + special treatment:** HAWBs that are **on ground** (per latest status / mode) **and** flagged as **needing special treatment** (e.g. specific **type** or **stage** per business rules — exact Excel columns / rules **TBD** in System design).
- Table columns should include at least: identifiers (**HAWB**, **MAWB**), last status, last update time, reason bucket (stale vs special-treatment), and quick actions (open detail, refresh track) as product defines.
- User sees only shipments allowed for their **tenant** (and domain visibility rules).

### 3. Sign In (Authentication)
- Secure login using email and password.
- Session timeout handling with automatic redirect.
- Tenant resolution natively tied to user login credentials.

### 4. Admin Tools
- **Query (Manual Tracking)**: Currently an ad-hoc AWB/HAWB query tool allowing immediate fetch from live trackers. In the future, this will be optimized to retrieve data from the database with a dedicated option to run a manual query refresh. Displays a smart timeline combining air and ground events.
- **User Management**: Admin interface to create new users, reset passwords, generate 16-character access keys, and revoke access.
- **System Logs**: Operational view for admins to inspect system activity, tracker execution results, and errors.

## Notifications
- Content includes **HAWB + MAWB** (and relevant status context).
- **User settings page** (per user): each user configures their own delivery preferences.
  - **Incremental / “what changed” emails:** user selects a **preferred interval** (e.g. **every 1–4 hours** — exact allowed steps are a product/UI choice). The system sends update emails at that cadence when there are changes to report.
  - **Full report by email:** user selects **how many times per day** a full report is sent (e.g. 0 / 1 / 2 / more — cap defined in product). This is independent of the incremental interval.
- Notifications respect tenant isolation; only data the user is allowed to see is included.

## Scheduling
- **Orchestration**: All polling loops are handled natively by n8n workflows.
- Ground: every 2 hours
- In air: next check 1 hour after landing
- Fallback: every 2 hours

## Workflow 2: Shipment Status Tracking
1. Select due shipments
2. Call airline + ground services
3. Store raw + parsed
4. Append history
5. Update latest
6. Recalculate HAWB status
7. Schedule next run
