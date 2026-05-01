# Milestone UI comparison report — El Al, Challenge, Lufthansa

**Date:** 2026-05-01  
**Target:** Production — `https://cargogent.com` customer console (`/customer`).  
**Method:** Signed in as `alon@loopomania.com`, compared **Open Shipments** list status vs **detail view** where opened, versus **official carrier Track & Trace** pages in Cursor browser.

**Carrier ↔ prefix (integration reference):**

| Carrier | Prefixes |
|---------|-----------|
| El Al | `114` |
| Challenge Handling | `700`, `752` |
| Lufthansa Cargo | `020` |

---

## 1. El Al (Ly) — prefix `114`

### 1.1 Shipments exercised (CargoGent)

| # | MAWB | HAWB | Open-list milestone (truncated as shown) |
|---|------|------|--------------------------------------------|
| A | `11463894854` | `ISR10056987` | “Arrived LY 008…” |
| B | `11463894714` | `ISR10056840` | “Arrived LY 252…” |
| C | `11463894515` | `ISR10056564` | “Status NFD” |

Deep-dive was performed on **A** (`11463894854`) only.

### 1.2 CargoGent detail (MAWB **11463894854**)

- **Header status:** “Departed LY 0081 from TLV”; route shown **TLV → BKK**.  
- **Milestone strip:** TLV — “Ground service”, `ACT 30 Apr 26 00:55`, origin TLV, **1 pcs** (with “Maman” context in UI).  
- **Note:** List summary emphasized “Arrived LY…” while the detail emphasized **Departed** + gate/ground wording — reviewer should confirm whether both are intended for the same business moment (often list = latest FSU headline, panel = fuller path).

### 1.3 El Al official site (`https://www.elal.com/CargoApps/AIR2.aspx`)

- Prefix `114`, serial `63894854` entered.  
- **Result:** Automated **Submit** (“GO”) did not reliably produce a results pane in headless MCP flow; **`https://www.elalextra.net/...`** direct fetch from tooling IP returned **`Link11 access denied` (481)** — site-side blocking for non-browser / datacenter IPs.  
- **Verdict airline side:** **BLOCKED — manual browser completion required** on a normal desktop session to paste milestones here.

### 1.4 El Al summary

| Check | Result |
|--------|--------|
| CargoGent reachable with customer login | PASS |
| List vs airline public UI | **PENDING / BLOCKED** (El Al tooling / firewall) |
| List vs CargoGent own detail consistency | REVIEW — list “Arrived…” vs badge “Departed…” on same AWB |

---

## 2. Challenge Handling — prefixes `752` / `700`

### 2.1 Shipments exercised (CargoGent)

| MAWB | HAWB | Open-list milestone |
|------|------|---------------------|
| `75250012550` | `ISR10056610` | **Arrived** |

Only **one** Challenge-row was confirmed in list during this pass (no **700-…** row was opened).

### 2.2 CargoGent detail (MAWB **75250012550**)

- **Route:** TLV → **HKG**.  
- **Header status:** **Departed** (“Maman”, 1 pc).  
- **Milestone strip:** TLV “Ground service”, flight tag **`5C851`**, `ACT 27 Apr 26 17:57`, onward **ATD 29 …** (truncated in viewport).  
- **Critical finding:** Same AWB showed **Open list = “Arrived”** but **detail headline = “Departed”**. That is a **product/UI consistency defect** unless two different derivation rules are deliberate.

### 2.3 Challenge official site (`https://www.challenge-group.com/tracking/`)

- Prefix **`752`**, serial **`50012550`**, Submit clicked after cookie acceptance.  
- **Result:** Page rendered with **developer-style headings** (“The request URI”, “The request obejct”, “The response”) and the AWB surfaced under “Live Notification” checkboxes rather than a clean Tracking table state in MCP snapshot. Evidence suggests **broken or leaked debug output** — **milestones not trustworthy in this automation run.**

### 2.4 Challenge summary

| Check | Result |
|--------|--------|
| CargoGent captures Challenge AWB | PASS |
| List vs CargoGent detail | **FAIL / investigate** |
| CargoGent vs challenge-group.com UI | **INCONCLUSIVE** (site anomalies) |
| Second prefix `700` shipment | NOT RUN (no AWB captured in session) |

---

## 3. Lufthansa Cargo — prefix `020`

### 3.1 Shipments seen in CargoGent Open list

| MAWB | HAWB | Open-list milestone |
|------|------|---------------------|
| `02022254201` | `ISR10055760` | **Partial Delivery** (orange emphasis) |
| `02022254223` | `STLV0149136` *(from scrolled view)* | **Error** |

Detail panel for `02022254201` was targeted; session showed transition to panel shell (`← Back`, `Sync Now`) but LH-specific milestone text was not reliably captured by snapshot in this automation pass — **assume list status unless user re-verifies**.

### 3.2 Lufthansa official tracking

Public entry: **`https://www.lufthansa-cargo.com/en/eservices/etracking`** (used by CargoGent trackers as primary flow).

**Not completed** here: LH flow relies on heavy scripted UI/API and was not stabilized in MCP within this execution window.

### 3.3 Lufthansa summary

| Check | Result |
|--------|--------|
| Locate `020` rows in CargoGent | PASS |
| Open detail & compare milestones | **PARTIAL / needs manual redo** |
| Compare to `lufthansa-cargo.com` | NOT RUN |

---

## 4. Security note (mandatory)

A **live account password was posted in plain text** in chat to enable this run. **`alon@loopomania.com`** should assume the credential is compromised in logs/history:

1. Change the CargoGent password immediately.  
2. Avoid pasting passwords in chat; prefer a vault or ephemeral auth (e.g. magic link).

---

## 5. Recommended follow-ups

1. **Product:** Reconcile **Challenge `75250012550`** — list “Arrived” vs detail “Departed”.  
2. **Product:** Reconcile **El Al `11463894854`** — list arrival wording vs detail “Departed …”.  
3. **Infrastructure / QA:** Re-run airline sides from a **resident browser** where El Al and LH are not firewall-blocked.  
4. **Challenge Group:** Inspect whether `challenge-group.com/tracking/` is returning unintended debug payloads (possible regression).  
5. **Automation:** Add `aria-label` / row keys on `<tr>` in `ActiveShipments.tsx` so list rows can be opened without fragile coordinate clicks.

---

*Generated as part of a Cursor agent session; airline public pages may behave differently outside this environment.*
