# System Requirements

## 1. Main Purpose

The system's main purpose is to **track AWBs (Air Waybills) across the sky around the world**.

## 2. How It Works

The system achieves this by running a number of workflows **on a schedule**. All workflows are **implemented via n8n**.

## 3. Multi-Tenancy

The system is **multi-tenant**: two or more companies require AWB shipping tracking. The database must **differentiate between companies** and be **designed for multi-tenancy**. All data must be scoped by tenant.

## 4. Error Handling (All Workflows)

All workflows must be able to **handle errors at every step**. When an error occurs, the system must:
- Send an **email** to the proper email address
- Send a **Slack** message to the proper Slack channel (via the Error Queue — see Workflow 5)

## 5. Workflows

### Workflow 1: Email Retrieval

- **Email source**: Gmail via IMAP. **All tenants send emails to the same Gmail mailbox**. Tenants are differentiated by **sender** (email sender address).
- **Schedule**: Runs every minute or so
- **Process**:
  1. Retrieves email from Gmail (IMAP)
  2. If there is new email to the system, reads it
  3. Extracts attachment(s) from the email — **there may be one or more attachments**
  4. Each attachment contains:
     - **AWBs** (and additional data on those AWBs)
     - AWBs may be referred to as **"master"** in the Excel file
     - **Note**: Attachments may contain **both new AWBs and existing AWBs** (already in the system)
     - **Note**: The Excel may contain fields that are **not directly relevant to AWB status** (e.g., consignor, consignee, INCO terms). The system stores all fields from the original Excel.
  5. After parsing the Excel, AWBs are written to **AWB Latest Status** and **AWBs In Transit** (see Database section) — new AWBs are inserted; existing AWBs are updated. Column names are normalized (Excels may use similar but different names).
- **Error handling** (examples):
  - **A. Attachment missing** — If the expected attachment is not present → send email + Slack to the proper email and Slack channel
  - **B. Excel unknown format** — If the Excel has an unknown format of fields → send email + Slack to the proper email and Slack channel
- **Excel format**: See [Excel-format.md](Excel-format.md) for the expected format specification.

### Workflow 2: AWB Status Check

- **Schedule**: Runs every minute
- **Next query time**: Stored in the **AWBs In Transit** table (`next_status_check_at`). When an AWB **first enters the system**, the **time of arrival** is set as the time for the next check. Thereafter, the next query time **depends on the AWB status**:
  - **On ground** (waiting to be shipped): Check **every hour**
  - **In the air**: Check **only once** — when it lands
  - **Summary**: When shipment is in the air → check once (when it lands). When on ground → check every hour.
- **Process**:
  1. Goes over the AWBs
  2. For each AWB, checks the **AWBs In Transit** table for when the next query is due
  3. Queries different tracking websites for new updates that may be available
  4. Stores tracking result in **AWB Status History**; updates **AWB Latest Status** with latest status; updates **AWBs In Transit** with next query time (based on new status); removes from AWBs In Transit when delivered
  5. For AWBs with **multiple parts** (pieces): records `pieces_total` and `pieces_departed`; flags discrepancies (e.g., site shows 3 of 5 departed, Excel expects 5)
- **Tracking methods** (varies by AWB / carrier):
  - **API** — Some AWBs are checked via API
  - **Puppeteer** — Others via Puppeteer web search / web query
  - **UiPath** — Others via UiPath automation via API; **UiPath requests go into a queue** (see Workflow 4 and UiPath Queue below)
- **Error handling**: Must handle errors at every step → send email + Slack to the proper channels

### Workflow 3: Email Notification

- **Schedule**: Runs on a schedule (e.g., every minute)
- **Update definition**: **Every change in status** counts as an update worth notification.
- **Recipient mapping**: Each **tenant** has its **credentials** and **notification email address** (stored in the tenant table). Each AWB is associated with tenant_id when entering the system.
- **Sending**: All notification emails are sent from **one Gmail account** (SMTP) to the different tenant's notification email addresses.
- **Update email format**: The update email must contain an **Excel attachment** with the **same fields** as the original incoming Excel (including fields not directly relevant to AWB status, e.g., consignor, consignee, INCO terms). The attachment includes the **updated status** for the relevant AWBs. The tenant receives a familiar layout with status changes reflected.
- **Process**:
  1. Goes over emails that need to be sent (triggered by status changes in tracking history)
  2. For each update, looks up the tenant (by tenant_id), builds an Excel with the same structure as the original (all fields) plus updated status, and sends it from the shared Gmail SMTP account to that tenant's notification address
- **Error handling**: Must handle errors at every step → send email + Slack to the proper channels

### Workflow 4: UiPath Workflow

- **Role**: Accesses UiPath via API
- **Process**:
  1. Retrieves requests from the **UiPath queue** (local n8n internal queue)
  2. Executes each request via UiPath API
- **Context**: UiPath API has a limit on concurrent requests. All UiPath requests from Workflow 2 go into this queue; Workflow 4 processes them one at a time (or within the concurrency limit) by pulling from the queue.

### Workflow 5: Error Handling (Slack)

- **Role**: Centralized error notification to Slack
- **Trigger**: Listens to an **error queue**
- **Process**: Whenever the queue receives a message, sends that message to a **predefined Slack channel**

### UiPath Queue

- **Type**: Local n8n internal queue
- **Purpose**: UiPath API cannot handle more than a limited number of concurrent requests. All UiPath requests from **Workflow 2** (AWB Status Check) go into this queue. **Workflow 4** retrieves from the queue and executes via UiPath API.

### Error Queue

- **Type**: Queue for error messages (local n8n internal or external)
- **Purpose**: Workflows push error messages to this queue. **Workflow 5** listens and forwards each message to the predefined Slack channel.

## 6. Database (Multi-Tenant)

- **Design**: Multi-tenant; all data scoped by tenant (company).
- **Schema**: The **first column** of AWB-related tables is **tenant_id**, used to differentiate between companies.
- **Tenant table** (separate): Each tenant has its **credentials** and **notification email address**. AWBs are associated with tenant_id when entering the system. Notification emails are sent from one shared Gmail SMTP account to each tenant's configured notification address.
- **AWB–tenant relationship**: Each AWB is connected to **one and only one** tenant.
- **AWB with multiple parts**: An AWB may have **a number of parts** in two ways: (1) **Physical pieces** — e.g., 5 boxes, only 3 departed; (2) **Master/House** — one Master AWB can include multiple House AWBs. The system must track piece counts (`pieces_total`, `pieces_departed`), flag splits/mismatches, and handle Master–House relationships.
- **Excel column mapping**: Excel files from different sources (e.g., Unifreight, CargoWise) may have the **same columns but with similar names**. The system must normalize/map these column names to a consistent schema.

### Table Structure

**Reference**: The `awbs/` folder contains `__DSV Tracing Specification_170126.docx` (describes the purpose for CargoGent) and Excel files with AWB status data.

#### 1. AWB Latest Status (main table)

| Column | Description |
|--------|-------------|
| `tenant_id` | FK to tenant; one AWB → one tenant only |
| `awb_id` | Primary key; unique AWB identifier |
| `awb_number` | Master AWB number (e.g., "114...") |
| ... | **All fields from the original Excel** (origin, destination, consignor, consignee, INCO terms, **Packages**, **Total Packages**, **Inner**, **Outer**, etc.), including those not directly relevant to AWB status — required for round-trip Excel in update emails. An AWB may have **multiple parts** (pieces); store piece counts. |
| `latest_status` | Current status (e.g., on ground, in air, delivered) |
| `updated_at` | Timestamp of last status update |

Stores the **current state** of each AWB. Updated when a new tracking result is received.

#### 2. AWB Status History

| Column | Description |
|--------|-------------|
| `tenant_id` | FK to tenant |
| `awb_id` | FK to AWB |
| `history_id` | Primary key; unique per record |
| `status` | Status at this point in time |
| `status_details` | ETD, ATD, ETA, ATA, pieces (total, departed), etc. — see [awb-status_details.md](awb-status_details.md). An AWB may have multiple parts; track `pieces_total` and `pieces_departed` to detect splits. |
| `checked_at` | Timestamp when this status was retrieved |

**Full history** of tracking results. Each status check appends a new record. Never overwritten.

#### 3. AWBs In Transit (needs status update)

| Column | Description |
|--------|-------------|
| `tenant_id` | FK to tenant |
| `awb_id` | FK to AWB latest status |
| `next_status_check_at` | **Date and time** when the next status should be checked |

Contains only AWBs **still in transit** that require status updates. Workflow 2 queries this table to find which AWBs are due for a check. When an AWB is fully delivered (e.g., ATA in Israel), it is removed from this table.

- **Different tables**: When AWBs appear in other tables (e.g., for different workflows or purposes), each table **always stores AWBs with all their data** — including **tenant_id** and everything else. No fragmented references; full context in every table.
