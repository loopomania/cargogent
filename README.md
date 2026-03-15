# CargoGent

CargoGent tracks **AWBs (Air Waybills)** across carriers and updates status for multi-tenant workflows (email ingestion, status checks, notifications).

**Repository**: [https://github.com/loopomania/cargogent](https://github.com/loopomania/cargogent)

## What's in this repo

| Item | Description |
|------|-------------|
| **AWBTrackers** | Sub-project that **retrieves tracking info for AWBs**. Used by the AWB status-update workflow (Workflow 2). Exposes a REST API per airline and returns a unified tracking payload that updates both **AWB Status History** and **AWB Latest Status**. |
| **Specs & docs** | System requirements, Excel format, AWB status details, and design/architecture. |
| **awbs/** | Reference Excel files and DSV tracing specification. |
| **scripts/** | Utilities (e.g. Markdown → Docx). |

## Documentation

- **[System-requirmets.md](System-requirmets.md)** — System purpose, multi-tenancy, workflows (email retrieval, AWB status check, notifications, UiPath, error handling), and database design.
- **[design-architecture.md](design-architecture.md)** — High-level architecture, role of n8n and AWBTrackers, and how tracking data updates history and current status.
- **[Excel-format.md](Excel-format.md)** — Expected format of Excel attachments (AWBs and column mapping).
- **[awb-status_details.md](awb-status_details.md)** — Fields for status details (ETD, ATD, ETA, ATA, pieces, etc.).

## AWBTrackers (tracking service)

- **Role**: Retrieve tracking information for AWBs from airline/cargo sites (web automation and APIs where available).
- **Used in**: The **AWB status update** workflow: each status check calls AWBTrackers; the response is used to append to **AWB Status History** and to update **AWB Latest Status**.
- **Location**: [AWBTrackers/](AWBTrackers/)
- **Docker image**: Build and run as **`cargogent`** (see [AWBTrackers/architecture.md](AWBTrackers/architecture.md)).
- **API**: Endpoints `GET /track/{airline}/{awb}`, `GET /track/{awb}`, `GET /health` and unified JSON schema.

## Version control

This repository is version-controlled with Git. Remote:

```bash
git remote -v   # origin → https://github.com/loopomania/cargogent.git
```




the followig is abit differet 
once a cargo , aeb , lands  in israel its transfered to a local distributer
before shippig it to the customer
swissport israel and maman are  terminal services and ground handling logistics
to query the status of a AWB you need AWB ad house bill
when a cargo is shipped out of israel they also first handled in wissport israel or maman
before loaded to ann air line
This is https://www.swissport.co.il/heb/Main/
An  Airline works with one of the two and the same one all the time
to map do the following 
in the attached excel you have thew fields master and house ref
Query swissport and then Maman to map
its my guess