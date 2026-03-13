# AWB Status Details — Field List

Fields stored in `status_details` (AWB Status History) and used for tracking. Based on DSV Tracing Specification and air cargo tracing conventions.

## AWB with Multiple Parts

An AWB may have **a number of parts** in two senses:

1. **Physical pieces**: A shipment may consist of multiple pieces (e.g., 5 boxes). Only some may have departed (e.g., 3 of 5).
2. **Master / House**: One Master AWB (MAWB) can include multiple House AWBs (HAWBs) in a consolidation.

The system must:
- Store `pieces_total` and `pieces_departed` (or equivalent) for physical pieces
- Verify that the number of pieces on the tracking site matches the Excel
- Flag if a split occurred (e.g., only X of Y pieces departed)
- For consolidations: track Master AWB and its House AWBs (House Ref) as related parts

## Timing Fields

| Field | Description | Example |
|-------|-------------|---------|
| `etd` | Estimated Time of Departure | 2026-02-08T14:00:00Z |
| `atd` | Actual Time of Departure | 2026-02-08T14:32:00Z |
| `eta` | Estimated Time of Arrival | 2026-02-08T22:00:00Z |
| `ata` | Actual Time of Arrival | 2026-02-08T21:45:00Z |
| `std` | Scheduled Time of Departure | 2026-02-08T14:00:00Z |
| `sta` | Scheduled Time of Arrival | 2026-02-08T22:00:00Z |

## Shipment Details

| Field | Description | Example |
|-------|-------------|---------|
| `pieces` | Number of pieces | 5 |
| `pieces_departed` | Pieces that have departed (e.g., "3 of 5") | 3 |
| `pieces_total` | Total pieces in shipment | 5 |
| `weight` | Weight (kg) | 125.5 |
| `volume` | Volume (m³) | 0.85 |

## Location & Movement

| Field | Description | Example |
|-------|-------------|---------|
| `origin` | Origin airport/city code | JFK |
| `destination` | Destination airport/city code | TLV |
| `current_location` | Current location (airport, warehouse, in transit) | FRA |
| `flight_number` | Flight number | LY001 |
| `carrier` | Airline/carrier code (first 3 digits of AWB = airline) | 114 (El Al) |

## Status

| Field | Description | Example |
|-------|-------------|---------|
| `status` | High-level status | `on_ground`, `in_air`, `delivered` |
| `status_description` | Human-readable status text | "Departed from origin" |
| `remarks` | Notes or remarks from tracing | "Recheck in 3 days" |

## Source & Metadata

| Field | Description | Example |
|-------|-------------|---------|
| `source` | Where the data was retrieved (API, track-trace, airline site) | track-trace.com |
| `raw_response` | Raw response from tracking source (optional, for debugging) | — |

---

## Notes

- **ETD → ATD → ETA → ATA** is the correct flow of movements.
- **Pieces**: Verify that the number of pieces on the tracking site matches the Excel; flag if a split occurred (e.g., only X of Y pieces departed).
- **Status values**: `on_ground`, `in_air`, `delivered` — used to determine next check frequency (every hour when on ground; once when in air until landing).
