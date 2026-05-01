# CargoGent — Product Requirements Document (PRD)

**Version:** 1.0 (consolidated from workflow sources and product decisions)  
**Canonical technical design:** [System-requirmets.md](System-requirmets.md)

---

## 1. Vision & prime directive

CargoGent monitors **MAWB** and **HAWB** shipments and keeps the database aligned with the latest information from **airlines** and **ground services**. Users are **freight forwarders** or their clients. The system stores tracking events, supports reporting, and notifies users when data changes.

---

## 2. Tenancy & users

- **Multi-tenant:** Many organizations use the system; data is isolated per tenant.
- **User:** A person who logs in (e.g. `kuku@seedomain.com`). **Email domain identifies the tenant context for inbound data** (e.g. `seedomain.com` is unique per tenant context).
- **Shared visibility:** If two users share the **same email domain**, they **see the same AWBs** for that domain/tenant rules.
- **Inbound mailbox (single):** All customer Excel emails are received at **`info@cargogent.com`**. **Routing:** The **sender’s email domain** is used to identify which tenant (and thus which users under that domain) the shipment belongs to.

---

## 3. Ingestion (email + Excel)

- Users periodically send emails to **`info@cargogent.com`** with an **Excel** attachment.
- **All columns** from the Excel are stored in the database (**wide table** strategy — see System doc).
- **Versioning / batch timestamp:** Each row carries **last update** metadata; **all AWBs in the same inbound batch** share the **same batch date/time**.
- Excel contains **MAWB**, **HAWB** (required — never null in the model), and static/dynamic shipment fields.
- **New vs existing:** New house lines are inserted; existing lines are compared and updated per conflict rules (see System doc).

---

## 4. Tracking & scheduling (product rules)

| Rule | Value |
|------|--------|
| **Tracking scheduler** | Runs **every 30 minutes** |
| **On ground** | Next check **+random 6-9 hours** |
| **In air** | Next check **1 hour after scheduled landing** (ETA + 1h); if ETA unknown, fallback defined in technical doc |
| **Concurrency** | Up to **20** parallel AWB tracking queries |
| **Completed shipment** | Removed from active tracking queue; **history retained** for analysis/reporting |

---

## 5. Conflict handling (Excel vs database)

When Excel and database disagree:

- **Slack alert** to **CargoGent ops** (system admin channel only).
- Set **`next_status_check_at` to now** (force an immediate tracking cycle to refresh “truth” from airline/ground).

Same pattern for **mismatches** in general: **Slack + reschedule to now**.

---

## 6. Notifications (email)

- **Per-user** “changes since last email” (delta notifications).
- **Daily / twice-daily** full Excel: **canonical column layout** with **additional status columns** (not necessarily identical to every legacy Excel variant — see System doc for mapping).
- User-selectable notification modes (real-time / daily / twice daily) — details in System doc.

---

## 7. Slack & admin alerts

- **One Slack channel** for **CargoGent ops** (system administrators).
- **Excel ↔ DB mismatch** and related **admin** alerts go to **CargoGent ops only** (not tenant self-service Slack unless product changes later).

---

## 8. Warnings (business)

| Warning | Behavior |
|---------|----------|
| **MAWB open, no update > 24h** | Evaluated as part of the **scheduled tracking job** (same cadence as the **30-minute** scheduler — not a separate 10-minute job). |
| **HAWB “type” / “stage” needs attention** | **TBD** — Excel columns / rules to be defined later. |

---

## 9. MAWB / HAWB lifecycle (export — product summary)

- MAWB is tied to an **airline**; one MAWB can have **many HAWBs**.
- **HAWB is mandatory** in the data model; **MAWB may change** over time (rebooking, cancellation).
- **HAWB** may be split across flights; same MAWB/airline rules apply where relevant; rare cases: **different MAWB** (different airline) for part of the shipment.
- **Excel:** May show **multiple rows** sharing the same **MAWB** across different **HAWBs**, and **multiple rows** for the **same HAWB** with **different MAWBs** (e.g. `hawb4` + `mawb1` and `hawb4` + `mawb2`). The DB uses **strict one row per `(tenant_id, hawb)`** plus a **child table** of MAWB lines — see [System-requirmets.md](System-requirmets.md) §6.

---

## 10. Import lifecycle

**TBD** — To be defined (export lifecycle is documented above; import flow may differ for checks and “completed” criteria).

---

## 11. Out of scope (for this PRD)

- Implementation (n8n node wiring, exact IMAP polling interval for mail fetch — see System doc).
- Legal / SLA — unless added later.

---

## 12. Related documents

- **[System-requirmets.md](System-requirmets.md)** — Architecture, workflows, database tables, technical behavior.
- **[Excel-format.md](requirment-design-architecture/Excel-format.md)** — Column mapping and aliases.
- **[awb-status_details.md](requirment-design-architecture/awb-status_details.md)** — Status / `status_details` field semantics.
- **[requirment-design-architecture/design-architecture.md](requirment-design-architecture/design-architecture.md)** — Component diagram and AWBTrackers flow.
