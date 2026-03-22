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

## Status Rules
- Delivered only when ALL pieces delivered
- Otherwise: In Transit

## User screens

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
