# CargoGent Design & Architecture

## 1. Purpose

CargoGent tracks **AWBs (Air Waybills)** for multiple tenants. Workflows run on a schedule (e.g. via n8n): email retrieval with Excel attachments, **AWB status check** (using **AWBTrackers** to retrieve tracking info), email notifications, UiPath automation, and centralized error handling. All data is multi-tenant; the database differentiates by tenant and stores both **AWB Latest Status** and **AWB Status History**.

## 2. High-Level Overview

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    Caddy (Reverse Proxy)                 │
                    │              Port 80/443, SSL, Rate limiting             │
                    └─────────────────────────┬───────────────────────────────┘
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────────────┐
        │                                     │                                     │
        ▼                                     ▼                                     ▼
┌───────────────┐                   ┌───────────────┐                   ┌───────────────┐
│   Frontend    │                   │   Backend     │                   │     n8n      │
│  Nginx:8080   │                   │   Node:3000   │                   │   Node:5678   │
│  (SPA static) │                   │   (Express)   │                   │  (Workflows)  │
└───────┬───────┘                   └───────┬───────┘                   └───────┬───────┘
        │                                  │                                     │
        │                                  │         ┌───────────────────────────┘
        │                                  │         │
        │                                  ▼         ▼
        │                          ┌───────────────┐  ┌─────────────────────────────┐
        │                          │  PostgreSQL  │  │      AWBTrackers            │
        │                          │  (Neon/db)   │  │  (Tracking API :8000)       │
        └──────────────────────────┴──────┬──────┘  └──────────────┬──────────────┘
                                           │                        │
                                           │   Workflow 2           │ GET /track/{airline}/{awb}
                                           │   (AWB Status Check)   │ → TrackingResponse
                                           └────────────────────────┘
```

## 3. Component Roles

### n8n

- **Role**: Orchestrates all scheduled workflows (email retrieval, AWB status check, notifications, UiPath queue, error queue → Slack).
- **Tech**: n8n (Node.js).
- **Workflows**: See [System-requirmets.md](System-requirmets.md) (Workflows 1–5).

### AWBTrackers (tracking service)

- **Role**: **Retrieve tracking info for AWBs.** Used **in the AWB status-update workflow (Workflow 2)**.
- **Tech**: Python, FastAPI, browser automation (e.g. undetected-chromedriver, Playwright) and APIs per airline.
- **Location**: Sub-project [AWBTrackers/](AWBTrackers/). API docs: [AWBTrackers/architecture.md](AWBTrackers/architecture.md).
- **Docker image**: **`cargogent`** (build from `AWBTrackers/` with `docker build -t cargogent .`).
- **Endpoints**: `GET /track/{airline}/{awb}`, `GET /track/{awb}` (default El Al), `GET /health`.
- **Output**: Unified JSON schema (`TrackingResponse`: `airline`, `awb`, `origin`, `destination`, `status`, `events[]`, `blocked`, `raw_meta`, etc.). Each `TrackingEvent` has `status_code`, `status`, `location`, `date`, `pieces`, `weight`, `remarks`, `flight`.

### Workflow 2 & use of AWBTrackers data

- Workflow 2 (**AWB Status Check**) runs on a schedule. For each AWB due for a check (from **AWBs In Transit**), it obtains fresh tracking data. **AWBTrackers is used for that**: the workflow (or a backend service called by n8n) calls AWBTrackers, then uses the response to update the database.
- **The data returned by AWBTrackers updates both:**
  1. **AWB Status History** — **append** one new record per status check: current status, `status_details` (derived from `TrackingResponse` and `events`: ETD, ATD, ETA, ATA, pieces, location, flight, etc.), and `checked_at` timestamp. History is never overwritten.
  2. **AWB Latest Status** — **update** the row for that AWB: set `latest_status` (and any other stored fields) from the latest tracking state (e.g. from `TrackingResponse.status` and the most recent event), and set `updated_at`. When the shipment is delivered, the AWB is removed from **AWBs In Transit** and `next_status_check_at` is no longer used for it.

So: **one call to AWBTrackers per status check** → **one new history row** + **one update to latest status** (and optionally removal from AWBs In Transit when delivered).

### Backend

- **Role**: REST API, auth, business logic, DB access, Excel handling. Can proxy or aggregate calls to AWBTrackers for n8n.
- **Tech**: Node.js, Express.

### Frontend

- **Role**: SPA for tenants and operators.
- **Tech**: React, Vite, Nginx (static).

### Database (multi-tenant)

- **Role**: Persistent storage; all AWB data scoped by `tenant_id`.
- **Tables**: Tenant, **AWB Latest Status**, **AWB Status History**, **AWBs In Transit** (see [System-requirmets.md](System-requirmets.md)).

## 4. Data flow (tracking)

1. Workflow 2 selects AWBs from **AWBs In Transit** where `next_status_check_at` is due.
2. For each AWB, the workflow (or backend) determines the airline and calls **AWBTrackers**: `GET /track/{airline}/{awb}` (or `/track/{awb}` for default carrier).
3. AWBTrackers returns a **TrackingResponse** (and optionally 403 if blocked).
4. The workflow/backend:
   - **Appends** to **AWB Status History**: one row with status, `status_details` from the response (and events), `checked_at` = now.
   - **Updates** **AWB Latest Status**: `latest_status`, `updated_at`, and any other mapped fields from the response.
   - Updates **AWBs In Transit**: set `next_status_check_at` from business rules (e.g. when landed vs on ground); remove row when delivered.

## 5. Summary

| Component   | Purpose |
|------------|---------|
| n8n        | Workflows 1–5 (email, status check, notifications, UiPath, errors). |
| AWBTrackers| Retrieve AWB tracking info for Workflow 2; response updates **History** (append) and **Latest Status** (update). |
| Backend    | API, DB, integration with n8n and AWBTrackers. |
| Database   | Multi-tenant; AWB Latest Status, AWB Status History, AWBs In Transit. |
