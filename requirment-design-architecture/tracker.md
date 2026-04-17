# AWBTrackers Architecture

`AWBTrackers` is a dedicated microservice architecture designed to scrape, parse, and normalize cargo tracking data from both airline carriers and ground service providers.

## Core Design

### 1. `router.py` (The Entrypoint)
- **Role**: Routes incoming tracking requests based on the AWB prefix to the appropriate airline tracker.
- **Ground Service Fallback**: Automatically queries designated ground handlers (Maman, Swissport) if a House AWB (HAWB) is provided.
- **LRU Preference Memory**: Maintains an in-memory (and `ground_prefs.json` persisted) heuristic to prioritize whichever ground service previously returned results for a given airline.

### 2. `airlines/base.py`
- Exposes the abstract `AirlineTracker` base class defining the `track(awb, hawb)` interface.
- Standardizes the response model into `TrackingResponse` and `TrackingEvent` components.

### 3. Data Models (`models.py`)
- `TrackingResponse`: High-level summary wrapping `origin`, `destination`, `status`, `events`, and metadata.
- `TrackingEvent`: Normalized, chronological line items denoting `status_code`, `location`, `pieces`, `weight`, `date`, and `flight`.

## Implementation Methods & Libraries

Different trackers employ varying techniques based on the target website's anti-bot posture.

### Direct API & AJAX Tracking
- **Libraries**: `requests`
- **Method**: The preferred, most stable tracking mechanism. Reverse-engineers underlying JSON or XML POST/GET calls from the carrier's frontend.
- **Examples**: `SwissportTracker`, `MamanTracker`, `AFKLMTracker`. Usually requires explicit Header replication (User-Agent, Accept, X-Requested-With) and careful session management.

### Headless Browser Automation (Selenium)
- **Libraries**: `undetected_chromedriver`, `selenium`, `lxml`
- **Method**: Utilized strictly for "Hard" airlines featuring robust initial anti-bot screens (e.g., Cloudflare Turnstile, Datadome, Akamai).
- **Execution Strategy**: Runs a full Chromium instance via `undetected_chromedriver` to render DOM elements. Scrapes populated table elements bypassing dynamic payloads.
- **Examples**: `CargoPalTracker`, `DeltaTracker`, `ElAlTracker`.
- **Infrastructure Requirements**: Often relies on residential proxies (`PROXY_URL` in `.env`) to circumvent bot-scoring blacklists.

## Fallback & MUX Logic

When querying a shipment (Export/Import), the router initiates:
1. **Primary Carrier Query**: Resolves the air telemetry.
2. **Ground Execution**: Concurrently contacts local ground services by injecting `HAWB`.

### Ground Service Mapping
The system maps incoming AWBs (by prefix) or Carrier Names to designated handler APIs (Maman or Swissport) for Israeli import/export operations:
- **Challenge Airlines (700)**: Both (Maman & Swissport)
- **Maman Group**: El Al (114), Lufthansa (020), United (016), Air Canada (014), Air France/KLM (057/074), Ethiopian (071), Silk Way (501), AZAL (771), Air India (098), Delta (006), Cathay (160), UPS (406), FedEx (023)
- **Swissport**: Etihad (607), Finnair (105), Air Baltic (657), Tarom (281), Air China (999), DHL (615)

### Query Strategy & Validation Fallbacks
Ground service implementations utilize a prioritized fallback cascade to fetch data:
1. **Primary**: Query using both `MAWB + HAWB` unchanged.
2. If Primary fails, **Fallback 1**: Query using `Only MAWB`.
3. If Fallback 1 fails, **Fallback 2**: Remove 3-letter prefix from `HAWB`.
4. If Fallback 2 fails, **Fallback 3**: Mirror `MAWB` into `HAWB` parameter.

**Data Integrity Constraint**:
- When a query is made for `MAWB+HAWB` and it fails, but subsequently succeeds using *only* `MAWB` (or other fallbacks), this typically implies DSV has not yet populated the Ground Service with the HAWB specifics.
- **Rules of Engagement**: 
  1. This means we are NOT able to validate the true HAWB details and status (e.g., pieces, weight).
  2. The system flags this in the database query results (`hawb_validated = false`).
  3. The *only* reliable data that can be safely extracted globally during this MAWB-level phase is the arrival date to the ground service and the customs clearance state.

3. **Merge**: Events from disparate queries are consolidated chronologically in the Unified Frontend View.
