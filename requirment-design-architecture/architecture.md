# Multi-Airline Cargo Tracking API

**Repository**: [https://github.com/loopomania/cargogent](https://github.com/loopomania/cargogent)

## Architecture & Design

### Overview
The service is designed as a **router API** with one tracking function per airline.
Each airline adapter runs its own query logic (stealth browser automation, anti-bot handling, parsing),
but all adapters return the same JSON schema.

This lets you add new airlines without changing core API contracts.

### Core Components

1. **API Layer (`app.py`)**
   - Exposes:
     - `GET /track/{airline}/{awb}` (router endpoint)
     - `GET /track/{awb}` (legacy endpoint, defaults to El Al)
     - `GET /health`
   - Converts blocked/no-data cases to HTTP 403 when appropriate.

2. **Router Layer (`router.py`)**
   - Maps airline key -> tracker class (e.g., `elal`, `lh`).
   - Handles airline code normalization.
   - **Selective Proxying**: Dynamically decides whether to route requests through the residential proxy (IPRoyal) or direct connection based on the airline's security profile.

2.1 **Proxy Layer (Residential Proxies)**
   - **Service**: IPRoyal.
   - **Logic**: Used for "Hard" airlines (El Al, Delta, PAL) to bypass data center IP blocks.
   - **Performance**: Selective proxying ensures fast direct connections for non-blocked airlines.

3. **Airline Adapter Layer (`airlines/*.py`)**
   - `airlines/elal.py`: El Al flow using `undetected-chromedriver` targeting the legacy `elalextra.net/info/awb.asp` page for stability and session consistency.
   - `airlines/lufthansa.py`: Lufthansa eTracking flow using `undetected-chromedriver` and custom JavaScript-based text extraction to bypass Shadow DOM and React-rendered content.
   - `airlines/delta.py`: Delta Cargo flow using `undetected-chromedriver` at `deltacargo.com/Cargo/trackShipment` with form submission and table/text parsing.
   - `airlines/common.py`: Shared AWB normalization and parsing helpers.

4. **Shared Schema Layer (`models.py`)**
   - Unified `TrackingResponse` and `TrackingEvent` models.

5. **Container Layer (`Dockerfile` + Xvfb)**
   - Uses `undetected-chromedriver` within a Dockerized environment.
   - Starts a virtual display server (`Xvfb`) via `entrypoint.sh` to allow stealthy browser execution.

## API Endpoints

### Router Tracking Endpoint
- **URL**: `/track/{airline}/{awb}`
- **Method**: `GET`
- **Example**:
```bash
curl -s "http://localhost:8000/track/elal/11463874650"
curl -s "http://localhost:8000/track/lufthansa/02021483976"
curl -s "http://localhost:8000/track/delta/00610949890"
```

### Legacy El Al Endpoint
- **URL**: `/track/{awb}`
- **Method**: `GET`
- **Description**: Backward-compatible endpoint that routes to El Al.

### Health Endpoint
- **URL**: `/health`
- **Method**: `GET`

## Unified JSON Schema

```json
{
  "airline": "elal",
  "awb": "114-63874650",
  "origin": "TLV",
  "destination": "JFK",
  "status": "DLV",
  "flight": null,
  "events": [
    {
      "status_code": "RCF",
      "status": null,
      "location": "JFK",
      "date": "04 Jan 26 00:15",
      "pieces": "81",
      "weight": "2204.0",
      "remarks": "LY 011",
      "flight": null
    }
  ],
  "message": "Successfully loaded tracking data.",
  "blocked": false,
  "raw_meta": {
    "source_url": "https://www.elalextra.net/info/awb.asp?aid=114&awb=63874650&Lang=Eng"
  }
}
```

## Local / Docker Usage

### Build and Run

Docker image name: **`cargogent`**.

```bash
cd AWBTrackers
docker build -t cargogent .
docker run -d -p 8000:8000 --name cargogent_tracker cargogent
```

### Quick Tests (Local)
```bash
curl -s "http://localhost:8000/health"
curl -s "http://localhost:8000/track/elal/63883363"
```

### Remote (Hetzner)
- **Base URL**: `http://168.119.228.149:8000`
- **Deployment**: Managed via `scripts/deploy.sh`.
- **Environment**: Requires `.env` with `PROXY_URL` and Server credentials.

## Automated Deployment

To deploy local changes to the Hetzner server:
```bash
./scripts/deploy.sh
```
This script automates:
1. SSH key authorization.
2. File synchronization via `rsync`.
3. Secret management (`.env` syncing).
4. Docker build/restart with `--env-file`.

## Extension Pattern

To add another airline:

1. Create `airlines/<airline>.py` implementing `AirlineTracker`.
2. Register aliases in `router.py`.
3. Use `undetected-chromedriver` if the target has bot protection.
4. Keep output strictly in `TrackingResponse` schema.
