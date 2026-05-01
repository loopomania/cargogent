# Multi-Airline Cargo Tracking API

**Repository**: [https://github.com/loopomania/cargogent](https://github.com/loopomania/cargogent)

---

## Architecture & Design

### Overview

The service is a **FastAPI-based router API** that provides unified air cargo tracking across 15 airline trackers and 2 ground service trackers. Each airline adapter implements its own scraping/query logic tailored to the airline's website or API, but all return the same `TrackingResponse` JSON schema. This lets new airlines be added without changing core API contracts.

### Core Components

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          FastAPI (app.py)                               │
│   GET /track/{airline}/{awb}  │  GET /track/{awb}  │  GET /health       │
└──────────────────────┬───────────────────────┬───────────────────────────┘
                       │                       │
              ┌────────▼───────────────────────▼─────────┐
              │           Router (router.py)              │
              │  • AWB prefix → airline auto-detection    │
              │  • Circuit breaker (3 failures → 5m cool) │
              │  • 85s timeout per tracker                │
              │  • Ground service orchestration           │
              └─────────────────┬────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────────┐
        │                       │                           │
  ┌─────▼──────┐    ┌──────────▼──────────┐    ┌───────────▼─────────┐
  │  Airline    │    │  Ground Service     │    │  Shared             │
  │  Adapters   │    │  Adapters           │    │                     │
  │  (15)       │    │  (2)                │    │  • models.py        │
  │             │    │                     │    │  • common.py        │
  │  elal.py    │    │  maman.py           │    │  • base.py          │
  │  lufthansa  │    │  swissport.py       │    │  • proxy_util.py    │
  │  delta.py   │    │                     │    │                     │
  │  ...        │    │                     │    │                     │
  └─────────────┘    └─────────────────────┘    └─────────────────────┘
```

### 1. API Layer (`app.py`)

- **Framework**: FastAPI with Uvicorn
- **Endpoints**:
  - `GET /track/{airline}/{awb}?hawb=` — route by explicit airline key
  - `GET /track/{awb}?hawb=` — auto-detect airline from AWB prefix
  - `GET /health` — liveness probe
- Converts blocked/no-data cases to appropriate HTTP responses.

### 2. Router Layer (`router.py`)

- Maps airline keys and aliases → tracker instances (e.g., `elal`, `ly`, `el-al` all resolve to `ElAlTracker`).
- **AWB Prefix Auto-Detection**: First 3 digits of AWB → airline (e.g., `114` → El Al, `020` → Lufthansa).
- **Circuit Breaker**: Tracks consecutive failures per airline; blocks after 3 failures for a 5-minute cooldown.
- **Timeout**: All tracker calls are wrapped in an `asyncio.wait_for` with an 85-second limit.
- **Ground Service Orchestration**: When a HAWB is provided, the router also queries the appropriate Israeli ground handler (Maman or Swissport) and merges the ground events into the unified response.

### 3. Airline Adapter Layer (`airlines/*.py`)

All trackers extend `AirlineTracker` (defined in `base.py`), which provides:
- A `proxy` attribute set at init time
- An abstract `track(awb, hawb)` coroutine
- A `run_sync()` helper that offloads blocking Selenium/Playwright work to `asyncio.to_thread()`

### 4. Proxy Layer (`proxy_util.py`)

Two utility functions support proxy routing:
- **`get_rotating_proxy()`** — Transforms a base IPRoyal proxy URL into a session-rotated one with random sticky sessions. For non-IPRoyal providers (BrightData, etc.), passes the URL through unchanged.
- **`get_proxy_extension()`** — Generates a Chrome extension on-the-fly for proxy authentication (manifest.json + background.js), used by `undetected-chromedriver` trackers that need authenticated proxy access.

### 5. Ground Service Layer

Israeli ground handlers are queried when a HAWB is provided to enrich tracking with warehouse acceptance, customs clearance, and delivery events:

| Ground Handler | Airlines Routed | API Type |
|---|---|---|
| **Maman** | El Al, Air Canada, United, Delta, CargoBooking, PAL Cargo, Challenge, Ethiopian | Direct HTTP (`urllib`) to `mamanonline.maman.co.il` |
| **Swissport** | Lufthansa, Cathay, Silk Way, Air France/KLM, DHL | Direct HTTP (`urllib`) to `swissport.co.il` |

### 6. Container Layer

- **Base Image**: `mcr.microsoft.com/playwright/python:v1.50.0-jammy`
- **Chrome**: Google Chrome pinned to `146.0.7680.164-1` (matches `version_main=146` in UC trackers)
- **Virtual Display**: Xvfb starts on `:99` at 1920×1080 via `entrypoint.sh` to support headful browser sessions
- **Server**: `uvicorn app:app --host 0.0.0.0 --port 8000`

### 7. Shared Schema Layer (`models.py`)

- **`TrackingEvent`** — Individual status milestone (status_code, location, date, pieces, weight, flight, customs, source)
- **`TrackingResponse`** — Unified response envelope (airline, awb, hawb, origin, destination, status, events[], raw_meta)

---

## Supported Airlines

### Airline Tracker Matrix

| # | Airline | Key(s) | AWB Prefix | Scraping Method | Proxy Service | Target URL |
|---|---|---|---|---|---|---|
| 1 | **El Al** | `elal`, `ly`, `el-al` | `114` | Playwright via BrightData Scraping Browser (CDP over WSS) | BrightData (Premium) | `elal.com/en/Cargo/Pages/Online-Tracking.aspx` |
| 2 | **Lufthansa** | `lufthansa`, `lh` | `020` | undetected-chromedriver + perf-log network interception | IPRoyal (Rotating Residential) | `lufthansa-cargo.com` eTracking portal |
| 3 | **Delta** | `delta`, `dl` | `006` | Playwright via BrightData Scraping Browser (CDP over WSS) | BrightData (Premium) | `deltacargo.com/Cargo/trackShipment` |
| 4 | **Air France / KLM** | `afklm`, `af`, `kl`, `klm` | `057`, `074` | undetected-chromedriver | IPRoyal (Rotating Residential) | `afklcargo.com/mycargo/shipment/detail/` |
| 5 | **United** | `united`, `ua` | `016` | undetected-chromedriver | IPRoyal (Rotating Residential) | `unitedcargo.com/en/us/track/awb/` |
| 6 | **PAL Cargo** | `cargopal`, `pal`, `pr` | `079` | Direct HTTP (`requests`) | None | `cargo.pal.com.ph` REST API |
| 7 | **Cathay Cargo** | `cathay`, `cx` | `160` | undetected-chromedriver | IPRoyal (Rotating Residential) | `cathaycargo.com/en-us/track-and-trace.html` |
| 8 | **Ethiopian** | `ethiopian`, `et` | `071` | undetected-chromedriver | IPRoyal (Rotating Residential) | `cargo.ethiopianairlines.com/my-cargo/track-your-shipment` |
| 9 | **Challenge Group** | `challenge`, `ch` | `700`, `752` | undetected-chromedriver | IPRoyal (Rotating Residential) | `challenge-group.com/tracking/` |
| 10 | **Air Canada** | `aircanada`, `ac` | `014` | Playwright via BrightData Scraping Browser (CDP over WSS) | BrightData (Premium) | `aircanada.com/cargo/tracking?awbnb=` |
| 11 | **Silk Way West** | `silkway`, `7l` | `501` | Direct HTTP (`curl_cffi`) | None | `sww.enxt.solutions/api/TrackAndTrace/` (JSON API) |
| 12 | **DHL Aviation** | `dhl` | `615` | Direct HTTP (`curl_cffi`) | None | `aviationcargo.dhl.com/track/` (HTML scrape) |
| 13 | **CargoBooking** | `cargobooking`, `281` | `281` | undetected-chromedriver | None | `cargobooking.aero/track-and-trace?awb=` |
| 14 | **Air Europa** | `aireuropa`, `ux` | `996` | Direct HTTP (`requests`) | None | `uxtracking.com/tracking.asp` |
| 15 | **Etihad Cargo** | `etihad`, `ey` | `607` | Playwright via BrightData Scraping Browser (CDP over WSS) | BrightData (Premium) | `etihadcargo.com/en/e-services/shipment-tracking` |

### Scraping Method Legend

| Method | Description | Used By |
|---|---|---|
| **Playwright + BrightData CDP** | Connects to BrightData's Scraping Browser over WebSocket (WSS). The remote browser handles anti-bot, CAPTCHAs, and IP reputation. Playwright drives DOM interaction via CDP. | El Al, Delta, Air Canada |
| **undetected-chromedriver (UC)** | Runs a patched Chromium locally (headful via Xvfb) that evades common bot-detection fingerprinting. Optional proxy auth via generated Chrome extension. | Lufthansa, AFKLM, United, Cathay, Ethiopian, Challenge, CargoBooking |
| **Direct HTTP (`curl_cffi`)** | Async HTTP client with browser TLS fingerprint impersonation (`chrome110`). No browser needed. Fastest method. | Silk Way, DHL Aviation |
| **Direct HTTP (`requests`)** | Standard Python `requests` library for simple REST/HTML calls. | PAL Cargo, Air Europa |

### Proxy Service Details

| Service | Type | Variable | Used By |
|---|---|---|---|
| **BrightData Scraping Browser** | Premium managed browser (WSS endpoint) | `PREMIUM_PROXY_URL` | El Al, Delta, Air Canada |
| **IPRoyal Residential** | Rotating residential proxy with sticky sessions | `PROXY_URL` | Lufthansa, AFKLM, United, Cathay, Ethiopian, Challenge |
| **None (Direct)** | No proxy — direct connection from server | — | PAL Cargo, Air Europa, Silk Way, DHL Aviation, CargoBooking |

> **Selective Proxying Logic**: The router only engages the proxy for airlines known to block data-center IPs. Direct-connect airlines enjoy faster response times (typically < 5s vs 30-60s for browser-based trackers).

---

## AWB Prefix Routing Table

```
114 → El Al          020 → Lufthansa       006 → Delta
057 → Air France     074 → KLM             016 → United
160 → Cathay         071 → Ethiopian        700 → Challenge
752 → Challenge      014 → Air Canada       079 → PAL Cargo
501 → Silk Way       281 → CargoBooking     615 → DHL Aviation
996 → Air Europa     607 → Etihad Cargo
```

---

## Ground Service Integration

When a HAWB (House Air Waybill) is provided alongside the MAWB, the router enriches the airline tracking data with Israeli ground handler events:

### Flow

1. **Direction Detection**: Determine if the shipment is an export from Israel (`origin = TLV` or HAWB starts with `ISR`) or an import.
2. **Skip Logic**: For imports to TLV that haven't landed yet, ground service query is skipped to avoid noise.
3. **Handler Selection**: Based on the airline, route to Maman or Swissport (see table above).
4. **Event Merging**: Ground events (warehouse acceptance, customs, delivery) are appended to the airline events array. Weight and pieces are updated if HAWB validation succeeded.
5. **Metadata**: `raw_meta` includes `hawb_validated`, `ground_query_method`, and timing in `durations.ground`.

---

## Unified JSON Schema

```json
{
  "airline": "elal",
  "awb": "114-63874650",
  "hawb": "ISR10049167",
  "origin": "TLV",
  "destination": "JFK",
  "status": "DLV",
  "flight": null,
  "events": [
    {
      "status_code": "RCS",
      "status": "Received",
      "location": "TLV",
      "date": "04 Jan 26 00:15",
      "pieces": "81",
      "weight": "2204.0",
      "remarks": "LY 011",
      "flight": "LY011",
      "customs": "Cleared",
      "source": "maman"
    }
  ],
  "message": "Success | ground_export_synced(Maman)",
  "blocked": false,
  "raw_meta": {
    "hawb_validated": true,
    "ground_query_method": "hawb_direct",
    "durations": { "airline": 37.1, "ground": 0.6 },
    "source_url": "https://..."
  }
}
```

---

## Local / Docker Usage

### Build and Run

Docker image name: **`cargogent`**.

```bash
cd AWBTrackers
docker build -t cargogent .
docker run -d -p 8000:8000 --env-file ../.env --name cargogent_tracker cargogent
```

### Quick Tests
```bash
# Health check
curl -s "http://localhost:8000/health"

# Track by airline + AWB
curl -s "http://localhost:8000/track/elal/11463874650"
curl -s "http://localhost:8000/track/lufthansa/02021483976"
curl -s "http://localhost:8000/track/delta/00610949890"

# Auto-detect airline from AWB prefix
curl -s "http://localhost:8000/track/02021483976"

# Track with HAWB (triggers ground service enrichment)
curl -s "http://localhost:8000/track/elal/11463874650?hawb=ISR10049167"
```

### Remote (Hetzner Production)
- **Base URL**: `http://168.119.228.149:8000`
- **Deployment**: Managed via `scripts/deploy-prod.sh`
- **Environment**: Requires `.env` with `PROXY_URL`, `PREMIUM_PROXY_URL`, and server credentials

---

## Automated Deployment

```bash
./scripts/deploy-prod.sh
```

This script automates:
1. SSH key authorization
2. File synchronization via `rsync`
3. Secret management (`.env` syncing)
4. Docker build/restart with `--env-file`
5. Database migrations

---

## Resilience Features

| Feature | Description |
|---|---|
| **Circuit Breaker** | 3 consecutive failures → airline blocked for 5 minutes. Auto-recovers with half-open test request. |
| **Timeout Guard** | 85-second `asyncio.wait_for` wraps every tracker call. Prevents runaway browser sessions. |
| **Session Rotation** | IPRoyal proxy sessions are randomized per request to avoid IP bans. |
| **Retry-friendly** | `run_sync()` uses `asyncio.to_thread()` ensuring trackers don't block the event loop. Max 3 concurrent browser sessions via the thread pool. |
| **Cookie/Banner Handling** | Browser-based trackers dismiss cookie consent banners automatically to prevent DOM interference. |

---

## Extension Pattern

To add a new airline:

1. Create `airlines/<airline>.py` implementing the `AirlineTracker` base class.
2. Register the class in `airlines/__init__.py`.
3. Add aliases and AWB prefix(es) in `router.py` (`TRACKERS` dict and `AWB_PREFIX_TO_AIRLINE`).
4. Choose the scraping method based on the airline's anti-bot profile:
   - **No protection** → Direct HTTP (`curl_cffi` or `requests`)
   - **Light protection** → `undetected-chromedriver` with optional IPRoyal proxy
   - **Heavy protection** (Akamai, PerimeterX, Cloudflare) → Playwright + BrightData Scraping Browser
5. If the airline operates in/out of Israel, add the ground handler mapping in `router.py` (`run_maman` or `run_swissport` sets).
6. Keep output strictly in `TrackingResponse` schema.
