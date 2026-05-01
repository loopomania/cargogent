# CargoGent — System Requirements & Technical Design

**Product requirements (PRD):** [product.requirements.md](product.requirements.md)  
**Component architecture diagram:** [requirment-design-architecture/design-architecture.md](requirment-design-architecture/design-architecture.md)

This document is the **single canonical technical specification** for workflows, scheduling, database design, and integration behavior. It supersedes conflicting fragments in older drafts.

---

## 1. Main purpose

Track **AWBs (Air Waybills)** worldwide using scheduled workflows (e.g. **n8n**), **AWBTrackers**, email ingestion from **`info@cargogent.com`**, PostgreSQL storage, and notifications.

---

## 2. Multi-tenancy & email routing

- **Mailbox:** Inbound email is delivered to **`info@cargogent.com`** (single inbox; e.g. Gmail IMAP).
- **Tenant resolution:** Identify tenant from the **sender email domain** (e.g. `user@seedomain.com` → domain `seedomain.com`). Domain uniqueness is a **product constraint** for routing.
- **Users:** Multiple users per tenant; users with the **same domain** **share the same AWBs** (visibility rule).
- **Data isolation:** All AWB-related rows include **`tenant_id`** as the first logical scope column.

---

## 3. Scheduling (authoritative)

| Mechanism | Interval / rule |
|-----------|------------------|
| **AWB status check scheduler** | **Every 30 minutes** |
| **Next check when shipment is on ground** | **Now + random 6-9 hours** |
| **Next check when shipment is in air** | **Scheduled landing (ETA) + 1 hour**; if ETA is unknown → **Now + random 10-15 hours** (same cadence as ground default bucket) |
| **Email notification job** | **Every 60 minutes** (or aligned to user schedules for digest Excel) |
| **Email retrieval (IMAP)** | Frequent enough to meet product latency (e.g. **every 1–5 minutes**); exact n8n cron is implementation detail |
| **24h stale MAWB warning** | Evaluated **inside the same scheduled AWB status check run** (i.e. every **30 minutes** together with due checks) |
| **Parallel tracker calls** | **Up to 20** concurrent AWB queries |

---

## 4. Workflows

### 4.1 Workflow 1 — Incoming email (Excel)

**Trigger:** New mail at **`info@cargogent.com`** with Excel attachment(s).

**Process:**

1. Resolve **`tenant_id`** from **sender domain** (and thus which users may see the data).
2. Parse Excel; **normalize** column names per [Excel-format.md](requirment-design-architecture/Excel-format.md).
3. **HAWB is required** on every logical shipment row (never null in the model).
4. **New HAWBs:** Insert **one** row into **`awb_latest_status`** with **`PRIMARY KEY (tenant_id, hawb)`**; insert **one row per Excel line** into **`hawb_mawb_lines`** (same `tenant_id`, `hawb`, each distinct `mawb` from the file). Enqueue **`awbs_in_transit`** for **`(tenant_id, hawb)`** with **`next_status_check_at = NOW()`**.
5. **Existing HAWBs:** Reconcile **`hawb_mawb_lines`** with the Excel (add/update/remove lines by **`(tenant_id, hawb, mawb)`**). Merge non–MAWB/HAWB columns into **`awb_latest_status`** per product rules (e.g. last row in file wins, or explicit column semantics). On **any mismatch** with persisted business fields:
   - Enqueue **Slack alert** for **CargoGent ops** (`Alerts_Queue`).
   - Set **`next_status_check_at = NOW()`** for the affected AWB(s) to force immediate tracking refresh.
6. **Batch timestamp:** All rows from the **same ingest batch** share the **same batch update timestamp** (stored per row or on a batch header table — implementation choice; see §6).
7. **Original file:** Retain reference or blob for audit if required by compliance (optional table in §6).

**Errors:** Missing attachment / unknown format → email + Slack per error-handling policy.

---

### 4.2 Workflow 2 — AWB status check (tracking)

**Trigger:** Scheduler **every 30 minutes**.

**Process:**

1. Select from **`awbs_in_transit`** where **`next_status_check_at <= NOW()`** and row is **not** locked by another worker (`locked_until` expired or null).
2. **Lease (not boolean only):** Before processing, set **`locked_until = NOW() + lease_ttl`** and **`worker_id`** (or equivalent) for crash recovery; clear lease after success or failure.
3. Call **AWBTrackers** (or backend proxy) up to **20** parallel requests.
4. On result (per **HAWB**; may run **AWBTrackers once per active `(tenant_id, hawb, mawb)` line** when multiple MAWBs exist):
   - **Append** **`awb_status_history`** (never overwrite); include **`mawb`** (or equivalent) in **`status_details`** when the check was for a specific MAWB line.
   - **Update** **`awb_latest_status`** (aggregate `latest_status`, `updated_at`, and mapped fields — e.g. worst/most recent across lines, per product rule).
   - Recompute **`next_status_check_at`** for **`(tenant_id, hawb)`**: **+2h** if on ground; **ETA + 1h** if in air (use **most constraining** ETA across active MAWB lines if multiple).
   - If **delivered / complete** per product rules for that HAWB → **remove** **`(tenant_id, hawb)`** from **`awbs_in_transit`** and optionally archive or clear **`hawb_mawb_lines`**.
5. **24h stale rule:** In the same run, for open shipments, if **`updated_at` (or last meaningful track) < NOW() - 24h`** and not delivered → enqueue **`Alerts_Queue`** (Slack to ops).

---

### 4.3 Workflow 3 — Email notifications

**Trigger:** **Every 60 minutes** (and/or user-specific windows for daily/twice-daily Excel).

**Process:**

1. **Delta / “changes since last email”:** **Per user** — use `Pending_Notifications` + last-sent watermark per user.
2. **Full Excel (daily / twice daily):** Generate **canonical layout** plus **extra status columns** (latest status, last update time, etc.).
3. Send via shared SMTP (or n8n); mark notifications sent.

---

### 4.4 Workflow 4 — Slack alerts (ops)

**Trigger:** Inserts into **`Alerts_Queue`** (from Workflow 1–2) or internal API.

**Process:** Post to **one** Slack channel for **CargoGent ops** only; mark `sent_to_slack`.

---

### 4.5 Workflow 5 — Error queue (optional extension)

Centralized errors from any workflow → Slack (same ops channel or dedicated error channel — **product default: ops channel** unless split later).

---

### 4.6 UiPath (if used)

Long-running or rate-limited automations go through an internal queue; see legacy notes in repo. Does not change §3 scheduling rules.

---

## 5. MAWB / HAWB rules (technical)

- **Strict shipment identity:** **`(tenant_id, hawb)`** — exactly **one** logical house shipment row in **`awb_latest_status`** per tenant + HAWB.
- **HAWB:** Required (never null). **MAWB** is **not** part of the primary key of the shipment aggregate.
- **Excel many-to-one MAWB → many HAWBs:** Example for one tenant: `(hawb1, mawb1)`, `(hawb2, mawb1)`, `(hawb3, mawb1)`, `(hawb4, mawb1)`, `(hawb4, mawb2)` → **four** parent rows (`hawb1`…`hawb4`) and **five** rows in **`hawb_mawb_lines`** (hawb4 appears twice with different MAWBs).
- **MAWB may change** over time (rebooking): update or replace lines in **`hawb_mawb_lines`**; parent **`awb_latest_status`** remains keyed by **`(tenant_id, hawb)`**.
- **Export lifecycle** details: [product.requirements.md](product.requirements.md) §9. **Import lifecycle:** **TBD**.

---

## 6. Database design (target schema)

> **Note:** `backend/migrations/*.sql` is a **minimal/stub** subset. Implement new migrations to match this section.

### 6.1 `tenants`

| Column | Description |
|--------|-------------|
| `id` | UUID PK |
| `name` | Company name |
| `notification_email` | Default tenant contact for mail (if used) |
| `allowed_sender_domains` | Text[] or child table: domains mapping to this tenant for `info@cargogent.com` routing |

### 6.2 `users`

| Column | Description |
|--------|-------------|
| `id` | UUID PK |
| `tenant_id` | FK → tenants |
| `username` / `email` | Login email; domain must match tenant routing rules |
| `password_hash`, `role`, … | Auth |
| `notification_setting` | Enum: e.g. `REALTIME`, `DAILY_EXCEL`, `TWICE_DAILY_EXCEL` |
| `last_notification_sent_at` | Optional watermark for per-user delta emails |

### 6.3 `awb_latest_status` (wide table — **one row per `(tenant_id, hawb)`**)

| Column | Description |
|--------|-------------|
| **`tenant_id`** | UUID FK → tenants, **part of PK** |
| **`hawb`** | TEXT NOT NULL, **part of PK** |
| **PK** | **`PRIMARY KEY (tenant_id, hawb)`** — strict; no second row for the same house under the same tenant. |
| **Wide columns** | All non-key Excel fields that describe the **shipment / house** (consignor, consignee, pieces, etc.) per product mapping. |
| **`latest_status`** | Aggregate status for the HAWB (derived from tracker + business rules). |
| **`updated_at`** | Last meaningful update to this aggregate row. |
| **`batch_ingest_at`** | Optional; timestamp shared by all HAWBs touched in the same ingest batch. |

**Note:** Do **not** duplicate the same `(tenant_id, hawb)` for a second MAWB. Multiple MAWBs for the same HAWB live only in **`hawb_mawb_lines`**.

### 6.4 `hawb_mawb_lines` (Excel MAWB lines per HAWB)

One row per **distinct `(tenant_id, hawb, mawb)`** present in the latest reconciled Excel for that house.

| Column | Description |
|--------|-------------|
| **`tenant_id`, `hawb`** | FK → `awb_latest_status(tenant_id, hawb)` ON DELETE CASCADE |
| **`mawb`** | TEXT NOT NULL |
| **PK** | **`PRIMARY KEY (tenant_id, hawb, mawb)`** |
| Optional | Line-specific columns (weight, pieces on this MAWB line) if they differ per line in Excel |

**Example (one tenant):** Lines `(hawb1,mawb1)`, `(hawb2,mawb1)`, `(hawb3,mawb1)`, `(hawb4,mawb1)`, `(hawb4,mawb2)` → **4** parents in `awb_latest_status`, **5** rows here.

### 6.5 `awb_status_history`

Append-only: `history_id`, **`tenant_id`**, **`hawb`**, optional **`mawb`** (which line was queried), `status`, `status_details` JSONB (see [awb-status_details.md](requirment-design-architecture/awb-status_details.md)), `checked_at`.

**FK:** **`(tenant_id, hawb)`** → `awb_latest_status`.

### 6.6 `awbs_in_transit`

| Column | Description |
|--------|-------------|
| **`tenant_id`, `hawb`** | **`PRIMARY KEY (tenant_id, hawb)`** — one queue row per house shipment |
| `next_status_check_at` | timestamptz |
| `locked_until` | Lease expiry |
| `worker_id` | Lease holder |

**FK:** **`(tenant_id, hawb)`** → `awb_latest_status`.

### 6.7 `pending_notifications`

`notification_id`, `tenant_id`, `user_id`, **`hawb`**, `change_summary`, `created_at`, `sent` boolean.  
**FK:** **`(tenant_id, hawb)`** → `awb_latest_status` (optional composite FK).

### 6.8 `alerts_queue`

`alert_id`, `tenant_id`, **`hawb`** (nullable if global), `alert_type`, `message`, `created_at`, `sent_to_slack` boolean.

### 6.9 Optional: `email_ingest_batches`

`batch_id`, `tenant_id`, `received_at`, `message_id`, `sender`, `attachment_storage_ref` — links rows ingested in one mail.

---

## 7. Warning rules (technical)

| Rule | Implementation note |
|------|---------------------|
| Excel ↔ DB mismatch | `Alerts_Queue` + Slack ops + `next_status_check_at = NOW()` |
| 24h no update on open MAWB | Checked **each tracking scheduler tick (30 min)** |
| HAWB type / stage attention | **TBD** — column mapping pending |

---

## 8. Related files

- [product.requirements.md](product.requirements.md)
- [requirment-design-architecture/design-architecture.md](requirment-design-architecture/design-architecture.md)
- [requirment-design-architecture/Excel-format.md](requirment-design-architecture/Excel-format.md)
- [requirment-design-architecture/awb-status_details.md](requirment-design-architecture/awb-status_details.md)
- `backend/migrations/` — current DB stubs; align with §6 over time.

---

## 9. Change log (this consolidation)

- Polling: **on ground 2h**, **in air ETA+1h**, scheduler **30 min**, **20** concurrent trackers.
- Inbound mail: **`info@cargogent.com`**, tenant by **sender domain**; users with same domain share AWBs.
- Storage: **wide `awb_latest_status`** + child **`hawb_mawb_lines`**; batch rows share **same batch timestamp** where applicable.
- Identity: **strict `PRIMARY KEY (tenant_id, hawb)`** on the house shipment; **multiple MAWB lines** per HAWB via **`hawb_mawb_lines` `PRIMARY KEY (tenant_id, hawb, mawb)`** (supports e.g. hawb4 + mawb1 and hawb4 + mawb2 in one Excel).
- Queue locking: **lease** (`locked_until`, `worker_id`).
- Slack: **single ops channel**; Excel/DB alerts **ops only**.
- Full Excel export: **canonical + extra status columns**.
