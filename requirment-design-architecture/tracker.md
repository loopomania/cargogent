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
2. **Ground Execution**: Concurrently contacts local ground services by injecting `HAWB`. Handlers like Swissport are queried initially with `HAWB`, dynamically falling back to `MAWB` queries if unsuccessful. 
3. **Merge**: Events from disparate queries are consolidated chronologically in the Unified Frontend View.
