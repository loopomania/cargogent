1. the email workflow starts by reading email with an excel attachment
there are two excel types:
    - import excel
    - export excel

2. import excel (L2077 - Air Import):
    Template: `dsv_air_import_l2077`
    Header row: row 5 (4 rows of metadata above)
    Complete column list (31 columns):
    Col  1: File Number       — the id of the shipment (= `shipment_id`)
    Col  2: Job Number        — the job number of the shipment
    Col  3: Customs File No   — the customs file number
    Col  4: Importer Name     — the importer name
    Col  5: Exporter Name     — the exporter name
    Col  6: Load Port/Gateway ID — origin airport/port code
    Col  7: Incoterms ID      — trade terms
    Col  8: Carrier ID        — airline code (e.g. EY, LH)
    Col  9: Carrier Name      — airline name
    Col 10: Ch. Wght           — chargeable weight
    Col 11: PCS               — pieces count
    Col 12: Master BL         — Master AWB number
    Col 13: Full HAWB         — House AWB number
    Col 14: ETD               — estimated time of departure (first leg)
    Col 15: ATD               — actual time of departure (first leg)
    Col 16: ETA               — estimated time of arrival (Israel landing)
    Col 17: ATA               — actual time of arrival (Israel landing)
    Col 18: ITR Date          — ITR date
    Col 19: יציאה מממ"ן / סוויספורט — departure from Maman/Swissport
    Col 20: Remarks           — general remarks
    Col 21: Updated ATD       — updated ATD (comparison field)
    Col 22: ATD DSV Vs. ATD AIRLINE — DSV ATD vs airline ATD
    Col 23: Updated ETA       — updated ETA (comparison field)
    Col 24: ETA DSV Vs. ETA AIRLINE — DSV ETA vs airline ETA
    Col 25: Updated ATA       — updated ATA (comparison field)
    Col 26: ATA DSV Vs. ATA AIRLINE — DSV ATA vs airline ATA
    Col 27: תאריך קליטה בממ"ן /סוויספורט — intake date at Maman/Swissport
    Col 28: תאריך שחרור מממ"ן /סוויספורט — release date from Maman/Swissport
    Col 29: תאריך שחרור Vs. תאריך קליטה — release vs intake comparison
    Col 30: Remarks 1         — additional remarks 1
    Col 31: Remarks 2         — additional remarks 2

    Import row structure: **one row per shipment**. Each shipment appears once.
    Only one set of ETD/ATD/ETA/ATA is shown (first leg departure / Israel landing).
    If tracker discovers intermediate legs, additional leg rows are added in the return Excel.

3. export excel (IL1 Shipment Profile Report):
    Template: `il1_shipment_profile`
    Header row: row 14 (13 rows of metadata/filters above)
    Complete column list (27 columns, starting at col 3):
    Col  3: Shipment ID       — the id of the shipment (= `shipment_id`)
    Col  4: Origin            — origin airport/office code
    Col  5: Origin Ctry       — origin country
    Col  6: Destination       — destination airport/office code
    Col  7: Dest Ctry         — destination country
    Col  8: Master            — Master AWB number
    Col  9: House Ref         — House AWB number
    Col 10: INCO              — Incoterms
    Col 11: Additional Terms  — additional trade terms
    Col 12: PPD/CCX           — prepaid / collect
    Col 13: Weight            — weight
    Col 14: UQ                — weight unit (KG/LB)
    Col 15: Volume            — volume
    Col 16: UQ                — volume unit (M3)
    Col 17: Chargeable        — chargeable weight
    Col 18: UQ                — chargeable unit
    Col 19: Inner             — inner package count
    Col 20: UQ                — inner unit (CTN)
    Col 21: Outer             — outer package count
    Col 22: UQ                — outer unit (PLT)
    Col 23: Shipment Event (WHR - %) — shipment event/milestone
    Col 24: Origin ETD        — estimated time of departure from origin
    Col 25: Dest ETA          — estimated time of arrival at destination
    Col 26: Leg Load Port     — leg load port
    Col 27: Leg Discharge Port — leg discharge port
    Col 28: Leg ATD           — leg actual time of departure
    Col 29: Leg ATA           — leg actual time of arrival

    Export row structure: **one row per leg**. A shipment with 2 connections has 3 rows,
    each with its own Leg Load Port, Leg Discharge Port, Leg ATD, Leg ATA.
    Shipment-level fields (Shipment ID, Origin, Master, House Ref, Weight, etc.) repeat on each leg row.

4. both excel files contain more columns than listed above — all columns must be saved in the database
5. all relevant columns must be saved in the database, with the customer ID of the customer who sent the email
6. when a shipment has more than one leg, the excel will have more than one row for the same shipment, each row will have the same shipment id, but different leg data
7. first time a shipment is in the excel it may not have all the columns
8. each time the excel with shipment id already exists in the database, we need to update the shipment with the new data

## Versioning rules (original vs latest)

9. First ingest of a shipment = **original (base) data**. Frozen, never overwritten.
10. Any subsequent change from **any source** (newer Excel OR tracker query) = **latest value**.
11. Only **two sets** of data version are kept: original and latest.
12. Only the following columns may be updated (import):
    Ch. Wght, PCS, ETD, ATD, ETA, ATA, Updated ATD, ATD DSV Vs. ATD AIRLINE,
    Updated ETA, ETA DSV Vs. ETA AIRLINE, Updated ATA, ATA DSV Vs. ATA AIRLINE
13. Only the following columns may be updated (export):
    Weight, UQ (weight), Outer, UQ (outer),
    Origin ETD, Dest ETA, Leg Load Port, Leg Discharge Port, Leg ATD, Leg ATA

## Daily return Excel (NEW)

14. Every day at noon, a return Excel is generated and emailed to the tenant users.
15. The return Excel mirrors the **exact layout** of the original template (same columns, same order, same headers).
16. All rows are returned with their **latest** values.
17. If a field's latest value differs from the original value, the cell is:
    - Formatted in **RED**
    - Shows both values: `"original → latest"`
18. For import shipments: if tracker discovers intermediate legs not in the original Excel,
    **new rows are added** in the return Excel matching the same column layout.
19. For export shipments: rows match the original per-leg layout; diffs are per-leg.
20. The return Excel workflow is implemented as an **n8n scheduled workflow** triggered daily at noon.
