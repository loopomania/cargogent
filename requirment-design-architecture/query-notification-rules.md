# AWB Query, Notification, and Termination Rules

This document outlines the core logic and requirements for the continuous querying of Air Waybills (AWBs), how dynamic intervals are handled, notifications mapped, and the conditions under which querying should stop.

## 1. Dynamic Polling Engine & Intervals
The system actively queries AWBs by utilizing a global workflow heartbeat that executes **every 10 minutes**. However, individual shipments are scheduled dynamically using contextual interval delays:
1. **Standard Active Shipment**: Queried randomly every **6-9 hours**. If successful, it reschedules itself.
2. **In-Flight Shipment**: If the tracking status identifies the shipment is actively in the air (e.g. Departed/DEP without an Arrival), the polling interval widens to a random **10-15 hours**.
3. **Fresh Ingestion**: When a new shipment is mapped from an Excel ingest hook natively, it is scheduled to be queried on the **next 10 minute** cycle instantly.
4. **Error Handling & Retries**: 
   - If a query fails technically, it schedules a rapid retry for exactly **10 minutes**.
   - If a shipment hits **3 consecutive errors**, querying is immediately and forcefully halted. A system alert is dispatched directly via N8N targeting the **Slack Admin**.

## 2. Notification Mechanics
When a status change is detected, the system will execute two primary actions:
1. **Database Update**: Update the main database with the latest AWB status gracefully.
2. **Change Table Entry**: Update the dedicated event queue table `awb_latest_change` locking in anomaly payloads designed to be immediately shipped via the 10-minute worker (Slack loops, Emails, etc.).

## 3. Actionable Events & Rules for Notifications
In cases where an AWB requires attention (by the customer or system admin), notifications are driven by a set of rules. 

**Examples of Rule-Based Triggers:**
* **General Stagnation:** The AWB's last reported status has not changed in more than 24 hours (e.g., stuck "in warehouse" or "preparing to fly").
* **Flight Delays/Missing Updates:** A scheduled flight should have landed over 3 hours ago, but the system has not received any arrival updates.
* **Error Locking:** A shipment fails 3 physical queries natively triggering an admin Slack failure alert.

## 4. Query Termination Rules (When to Stop Querying)
The system must rigidly halt query executions instantly to avoid ratelimits and resource bloating manually if:
1. **Fully Delivered**: The shipment is fully delivered (the status of all pieces is historically logged as "delivered").
2. **Extended Stagnation (24 Hours)**: If an active shipment's status fails to log structural updates across an explicitly tracked 24-hour bracket, execution is physically halted tracking natively to **Slack Admin**. The customer UI Dashboard flags this dynamically as "Need Attention".
3. **Error Caps**: Exceeding the strict 3-consecutive failure threshold structurally locks the shipment off the queue natively.

## 5. Admin Dashboard - Active Queries
The system admin dashboard uniquely reads only open physical loops, mapping currently monitored querying engines successfully via `GET /api/track/active-queries`:
* **Customer**
* **MAWB** (Master Air Waybill)
* **HAWB** (House Air Waybill)
* **Last Query Date**: Timestamp checking.
* **Active Time (in days)**: The structural duration logged from initial `query_schedule`.

## Airline & Ground Splitting Logic
To improve performance and bypass strict airline bot protection for shipments arriving in Israel, the following orchestration is performed by the worker:
1. **Import (TLV Destination)**: When an airline fully delivers all expected pieces of a shipment to the airport, the backend flags the `query_schedule` with `ground_only = true`. Subsequent queries will explicitly skip the airline tracker and will exclusively query the Israeli Ground Handlers (Maman / Swissport) until the remaining pieces are released (`DLV`).
2. **Export (TLV Origin)**: Since airlines form the final leg of an export, once the airline reports a `DLV` milestone with all expected pieces, the backend marks it as fully `Delivered` and ceases all queries immediately.

