# Excel Format Specification

This document describes the expected format of Excel attachments containing AWBs, as ingested by Workflow 1 (Email Retrieval).

## Reference Files

- **`awbs/__DSV Tracing Specification_170126.docx`** — Describes the purpose for CargoGent (air cargo import/export tracing)
- **`awbs/`** — Excel files with AWB status (e.g., `IL1 DSV Shipment Report (Transport Data)...xlsx`)

## Column Mapping

Excel files from different sources (e.g., Unifreight, CargoWise) may have the **same columns but with similar names**. The system must map these to a consistent schema. Define canonical column names and their aliases here.

## AWB with Multiple Parts

An AWB may have **a number of parts**:

1. **Physical pieces**: Use **Packages**, **Total Packages**, **Inner**, **Outer** (Core Shipment Fields and Container & Pack Fields) to track piece counts. Compare with tracking site data to detect splits (e.g., only X of Y pieces departed).
2. **Master / House**: One **Master** AWB can include multiple **House Ref** (HAWB) rows. Use **Is Master/ Lead** and **Master/ Lead Ref** to identify the relationship.

---

## Field List (DSV Shipment Report)

Based on the IL1 DSV Shipment Report (Transport Data) Excel structure.

### Core Shipment Fields

| Field | Description | AWB Status Relevant |
|-------|-------------|---------------------|
| Trans | Transport mode | |
| Cus Info | Customer info | |
| Origin Ctry | Origin country | ✓ |
| Dest Ctry | Destination country | ✓ |
| Consignor Code | Consignor/shipper code | |
| Consignor Name | Consignor/shipper name | |
| Consignee Code | Consignee/importer code | |
| Consignee Name | Consignee/importer name | |
| House Ref | House reference (HAWB) | ✓ |
| Additional Terms | Additional terms | |
| Screening Status | Screening status | |
| PPD/CCX | Prepaid/Collect term | |
| Goods Description | Goods description | |
| Shipment Origin ETD | Shipment origin ETD | ✓ |
| Shipment Dest ETA | Shipment destination ETA | ✓ |
| Weight | Weight | |
| UQ | Unit of quantity | |
| Volume | Volume | |
| Loading Meters | Loading meters | |
| Chargeable | Chargeable weight/volume | |
| Inner | Inner packages (piece count) | ✓ |
| Outer | Outer packages (piece count) | ✓ |
| Added | Added date | |
| Controlling Customer Code | Controlling customer code | |
| Controlling Customer Name | Controlling customer name | |
| Controlling Agent Code | Controlling agent code | |
| Controlling Agent Name | Controlling agent name | |
| Transport Job | Transport job ref | |
| Brokerage Job | Brokerage job ref | |
| Is Master/ Lead | Is master/lead shipment | ✓ |
| Master/ Lead Ref | Master/lead reference | ✓ |
| Import Broker Code | Import broker code | |
| Import Broker Name | Import broker name | |
| Export Broker Code | Export broker code | |
| Export Broker Name | Export broker name | |
| Estimated Pickup (Date & Time) | Estimated pickup | |

### Consol / Master AWB Fields

| Field | Description | AWB Status Relevant |
|-------|-------------|---------------------|
| Consol ID | Consolidation ID | ✓ |
| First Load | First load port/date | |
| Last Disch | Last discharge port/date | |
| Consol ETD First Load | Consol ETD first load | ✓ |
| Consol ETA Last Disch | Consol ETA last discharge | ✓ |
| Consol Transit Time | Consol transit time | |
| Consol ATD First Load | Consol ATD first load | ✓ |
| Consol ATA Last Discharge | Consol ATA last discharge | ✓ |
| Consol STD First Load | Consol STD first load | ✓ |
| Consol STA Last Discharge | Consol STA last discharge | ✓ |
| **Master** | **Master AWB number** | ✓ (primary) |
| Consol Contract Number | Consol contract number | |
| Vessel (ARV - LEG) | Vessel for arrival leg | |
| Flight/Voyage(ARV - LEG) | Flight/voyage for arrival leg | ✓ |
| Load(ARV - LEG) | Load port for leg | |
| Disch(ARV - LEG) | Discharge port for leg | |
| ETD Load(ARV - LEG) | ETD load for leg | ✓ |
| ETA Disch(ARV - LEG) | ETA discharge for leg | ✓ |

### Agent & Carrier Fields

| Field | Description | AWB Status Relevant |
|-------|-------------|---------------------|
| Send Agent Code | Sending agent code | |
| Send Agent Name | Sending agent name | |
| Recv Agent | Receiving agent code | |
| Recv Agent Name | Receiving agent name | |
| CoLoaded With | Co-loaded with | |
| CoLoader Name | Co-loader name | |
| Carrier Code | Carrier code | ✓ |
| Carrier SCAC | Carrier SCAC code | |
| Carrier Name | Carrier name | ✓ |
| TEU | TEU count | |
| Cntr Count | Container count | |
| 20F, 20R, 20H, 40F, 40R, 40H, 45F | Container sizes | |
| GEN | General | |
| Service Level Code | Service level code | |
| Shippers Reference | Shipper's reference | |

### Address Fields

| Field | Description |
|-------|-------------|
| Consignor City | Consignor city |
| Consignor State | Consignor state |
| Consignor PostCode | Consignor postal code |
| Consignee City | Consignee city |
| Consignee State | Consignee state |
| Consignee PostCode | Consignee postal code |
| Notify Party (Org) | Notify party org |
| Notify Party | Notify party name |

### Value & Reference Fields

| Field | Description |
|-------|-------------|
| Goods Value | Goods value |
| Cur | Currency |
| Insurance Value | Insurance value |
| Marks And Nums | Marks and numbers |
| Release Type | Release type |
| Order References | Order references |
| Booking Date | Booking date |
| Set Point Temp | Set point temperature |

### Container & Pack Fields

| Field | Description |
|-------|-------------|
| Container No. | Container number |
| Seal Num | Seal number |
| Total TEU | Total TEU |
| Packages | Packages (piece count per line) — used for multi-part AWB verification |
| Total Packages | Total packages (piece count) — used for multi-part AWB verification |
| Total Weight | Total weight |
| Line Price | Line price |
| Total Line Price | Total line price |
| OutTurn | Out turn |
| Total OutTurn | Total out turn |
| Out Turned Weight | Out turned weight |
| Total Out Turned Weight | Total out turned weight |
| PackOutTurned Volume | Pack out turned volume |
| Total PackOutTurned Volume | Total pack out turned volume |
| Packing Pillaged | Packing pillaged |
| Packing Damaged | Packing damaged |
| Packing OutTurned Length | Packing out turned length |
| Packing OutTurned Width | Packing out turned width |
| Packing OutTurned Height | Packing out turned height |
| Packing OutTurned Comment | Packing out turned comment |
| Packing Marks And Numbers | Packing marks and numbers |
| Packing Length | Packing length |
| Packing Width | Packing width |
| Packing Height | Packing height |
| Commodity | Commodity |
| Pack Ref. | Pack reference |
| Cont. Ref. | Container reference |
| Marks & Numbers | Marks and numbers |
| Hazardous | Hazardous flag |
| Requires Temperature Control | Temperature control flag |
| Required Temperature Maximum | Max temperature |
| Required Temperature Minimum | Min temperature |

### Custom Attributes

| Field | Description |
|-------|-------------|
| Custom Attribute - Text1 | Custom text 1 |
| Custom Attribute - Text2 | Custom text 2 |
| Custom Attribute - Date1 | Custom date 1 |
| Custom Attribute - Date2 | Custom date 2 |
| Custom Attribute - DecimalNo1 | Custom decimal 1 |
| Custom Attribute - DecimalNo2 | Custom decimal 2 |
| Custom Attribute - Flag1 | Custom flag 1 |
| Custom Attribute - Flag2 | Custom flag 2 |

### Pickup & Delivery Addresses

| Field | Description |
|-------|-------------|
| Pick From (Org) | Pick from org |
| Pick From (Name) | Pick from name |
| Pick From Address1 | Pick from address 1 |
| Pick From Address2 | Pick from address 2 |
| Pick From City | Pick from city |
| Pick From State | Pick from state |
| Pick From PostCode | Pick from postal code |
| Pick From Country | Pick from country |
| Pickup Local Transport (Org) | Pickup local transport org |
| Pickup Local Transport | Pickup local transport |
| Pickup CFS (Org) | Pickup CFS org |
| Pickup CFS | Pickup CFS |
| Deliver To (Org) | Deliver to org |
| Deliver To (Name) | Deliver to name |
| Deliver To Address1 | Deliver to address 1 |
| Deliver To Address2 | Deliver to address 2 |
| Deliver To City | Deliver to city |
| Deliver To State | Deliver to state |
| Deliver To PostCode | Deliver to postal code |
| Deliver To Country | Deliver to country |
| Delivery Local Transport (Org) | Delivery local transport org |
| Delivery Local Transport | Delivery local transport |
| Delivery CFS (Org) | Delivery CFS org |
| Delivery CFS | Delivery CFS |

### Shipment Custom Fields

| Field | Description |
|-------|-------------|
| Shipment - Custom Field 01 | Custom field 01 |
| Shipment - Custom Field 02 | Custom field 02 |
| Shipment - Custom Field 03 | Custom field 03 |
| Shipment - Custom Field 04 | Custom field 04 |
| Shipment - Custom Field 05 | Custom field 05 |
| Shipment - Custom Field 06 | Custom field 06 |
| Shipment - Custom Field 07 | Custom field 07 |
| Shipment - Custom Field 08 | Custom field 08 |

### Event & CTO Fields

| Field | Description |
|-------|-------------|
| Event ( - ) | Event |
| Related Consol ID | Related consol ID |
| Departure Container Yard Code | Departure CY code |
| Departure Container Yard | Departure CY |
| Departure Container Yard City | Departure CY city |
| Arrival Container Yard Code | Arrival CY code |
| Arrival Container Yard | Arrival CY |
| Arrival Container Yard City | Arrival CY city |
| Departure CFS Code | Departure CFS code |
| Departure CFS | Departure CFS |
| Departure CFS City | Departure CFS city |
| Arrival CFS Code | Arrival CFS code |
| Arrival CFS | Arrival CFS |
| Arrival CFS City | Arrival CFS city |
| HBL Issue Date | HBL issue date |
| Note | Note |
| Detail Goods Description | Detail goods description |
| Arrival CTO Code | Arrival CTO code |
| Arrival CTO Name | Arrival CTO name |
| Arrival CTO City | Arrival CTO city |
| Departure CTO Code | Departure CTO code |
| Departure CTO Name | Departure CTO name |
| Departure CTO City | Departure CTO city |

### Leg Fields (Leg 1, 2, 3...)

Each leg has the same structure. Example for Leg 1:

| Field | Description | AWB Status Relevant |
|-------|-------------|---------------------|
| Leg N - Leg Order | Leg order | |
| Leg N - Route Transport Mode | Transport mode | |
| Leg N - Route Transport Type | Transport type | |
| Leg N - Leg Status | Leg status | ✓ |
| Leg N - Leg Charter Route | Charter route | |
| Leg N - Leg Is Linked | Is linked | |
| Leg N - Leg Notes | Leg notes | |
| Leg N - Route Voyage | Voyage | |
| Leg N - Route Vessel | Vessel | |
| Leg N - Route Creditor | Creditor | |
| Leg N - Route Creditor Name | Creditor name | |
| Leg N - Route Carrier | Carrier | ✓ |
| Leg N - Route Carrier Name | Carrier name | ✓ |
| Leg N - Route Carrier Ref. | Carrier ref | ✓ |
| Leg N - Route Carrier Service Level | Service level | |
| Leg N - Route Carrier SCAC | Carrier SCAC | |
| Leg N - Leg Load Port | Load port | ✓ |
| Leg N - Leg Dep. From | Departure from | |
| Leg N - Leg ETD | Leg ETD | ✓ |
| Leg N - Leg ATD | Leg ATD | ✓ |
| Leg N - Leg FCL Receival | FCL receival | |
| Leg N - Leg FCL Cut Off | FCL cut off | |
| Leg N - Leg Docs Due | Docs due | |
| Leg N - Leg LCL Receival | LCL receival | |
| Leg N - Leg LCL Cut Off | LCL cut off | |
| Leg N - Leg Discharge Port | Discharge port | ✓ |
| Leg N - Leg Arrival At | Arrival at | |
| Leg N - Leg ETA | Leg ETA | ✓ |
| Leg N - Leg ATA | Leg ATA | ✓ |
| Leg N - Leg FCL Available | FCL available | |
| Leg N - Leg FCL Storage | FCL storage | |
| Leg N - Leg Depot Available | Depot available | |
| Leg N - Leg Depot Storage | Depot storage | |

---

## Key Fields for AWB Tracking

Primary fields used for status tracking and updates:

- **Master** — Master AWB number (primary identifier)
- **House Ref** — House AWB reference (one Master can have multiple House AWBs)
- **Packages** / **Total Packages** / **Inner** / **Outer** — Piece counts; verify against tracking site, flag splits (X of Y departed)
- **Shipment Origin ETD** / **Shipment Dest ETA**
- **Consol ETD First Load** / **Consol ETA Last Disch**
- **Consol ATD First Load** / **Consol ATA Last Discharge**
- **Leg N - Leg ETD** / **Leg N - Leg ATD** / **Leg N - Leg ETA** / **Leg N - Leg ATA**
- **Carrier Code** / **Carrier Name**
- **Flight/Voyage(ARV - LEG)**

## Column Aliases (for mapping)

| Canonical | Aliases |
|-----------|---------|
| Master | Master AWB, MAWB, Master Ref |
| House Ref | HAWB, House AWB, House Reference |
| Shipment Origin ETD | ETD, Origin ETD |
| Shipment Dest ETA | ETA, Dest ETA |
| Consol ATD First Load | ATD, Consol ATD |
| Consol ATA Last Discharge | ATA, Consol ATA |
| Packages | Pieces, Piece count |
| Total Packages | Total pieces, Pieces total |
