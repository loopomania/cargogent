from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from models import TrackingResponse
from router import (
    route_track,
    route_track_by_awb,
    _AIRLINE_CIRCUIT_BREAKER,
    MAX_FAILURES,
    COOLDOWN_SECONDS,
    TRACKERS,
    AWB_PREFIX_TO_AIRLINE,
)
import newrelic.agent
import time

app = FastAPI(title="Air Cargo Tracking Router API")


from typing import Optional

@app.get("/track/{airline}/{awb}", response_model=TrackingResponse)
async def track_awb_by_airline(airline: str, awb: str, hawb: Optional[str] = None, ground_only: bool = False):
    start_time = time.time()
    try:
        data = await route_track(airline, awb, hawb=hawb, ground_only=ground_only)
        duration = (time.time() - start_time) * 1000
        newrelic.agent.record_custom_metric(f"Custom/Trackers/{airline}/Success", 1)
        newrelic.agent.record_custom_metric(f"Custom/Trackers/{airline}/Duration", duration)
        return data
    except Exception as e:
        newrelic.agent.record_custom_metric(f"Custom/Trackers/{airline}/Failure", 1)
        raise e


@app.get("/track/{awb}", response_model=TrackingResponse)
async def track_awb_auto(awb: str, hawb: Optional[str] = None, ground_only: bool = False):
    """Track by AWB only; airline is detected by the router from AWB prefix."""
    data = await route_track_by_awb(awb, hawb=hawb, ground_only=ground_only)
    return data


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/circuit-breakers")
def circuit_breakers():
    """Returns circuit breaker state for every unique tracker (deduplicated by object identity)."""
    now = time.time()

    # Build a deduplicated list of canonical airline names (one entry per tracker instance)
    seen_trackers: dict[int, str] = {}
    for key, tracker in TRACKERS.items():
        tid = id(tracker)
        if tid not in seen_trackers:
            seen_trackers[tid] = key  # first alias wins as canonical name

    results = []
    for _tracker_id, canonical_key in seen_trackers.items():
        breaker = _AIRLINE_CIRCUIT_BREAKER.get(canonical_key, {"fails": 0, "blocked_until": 0})
        fails = breaker.get("fails", 0)
        blocked_until = breaker.get("blocked_until", 0)

        if fails >= MAX_FAILURES and now < blocked_until:
            status = "tripped"
            cooldown_remaining_s = round(blocked_until - now)
        elif fails > 0:
            status = "degraded"
            cooldown_remaining_s = None
        else:
            status = "closed"
            cooldown_remaining_s = None

        results.append({
            "airline": canonical_key,
            "status": status,
            "failures": fails,
            "max_failures": MAX_FAILURES,
            "cooldown_seconds": COOLDOWN_SECONDS,
            "cooldown_remaining_s": cooldown_remaining_s,
            "blocked_until": blocked_until if blocked_until > now else None,
        })

    # Sort: tripped first, then degraded, then closed alphabetically
    order = {"tripped": 0, "degraded": 1, "closed": 2}
    results.sort(key=lambda r: (order.get(r["status"], 9), r["airline"]))
    return {"circuit_breakers": results}


@app.get("/awb-stats")
def awb_stats():
    """Returns lightweight stats about the AWB prefix → airline mapping table."""
    return {
        "supported_airlines": len(set(id(t) for t in TRACKERS.values())),
        "supported_prefixes": len(AWB_PREFIX_TO_AIRLINE),
        "airline_keys": sorted({v for v in AWB_PREFIX_TO_AIRLINE.values()}),
    }


# Static metadata per canonical tracker key
_TRACKER_META: dict[str, dict] = {
    "elal":         {"display": "El Al",          "iata": ["LY"],       "proxy": "premium"},
    "lufthansa":    {"display": "Lufthansa Cargo", "iata": ["LH"],       "proxy": "premium"},
    "delta":        {"display": "Delta Cargo",     "iata": ["DL"],       "proxy": "premium"},
    "afklm":        {"display": "Air France / KLM","iata": ["AF","KL"],  "proxy": "standard"},
    "united":       {"display": "United Cargo",    "iata": ["UA"],       "proxy": "standard"},
    "cargopal":     {"display": "Cargo PAL",       "iata": ["PR"],       "proxy": "none"},
    "cathay":       {"display": "Cathay Pacific",  "iata": ["CX"],       "proxy": "premium"},
    "ethiopian":    {"display": "Ethiopian Cargo", "iata": ["ET"],       "proxy": "standard"},
    "challenge":    {"display": "Challenge Air",   "iata": ["CH"],       "proxy": "standard"},
    "aircanada":    {"display": "Air Canada Cargo","iata": ["AC"],       "proxy": "premium"},
    "silkway":      {"display": "Silk Way West",   "iata": ["7L"],       "proxy": "none"},
    "cargobooking": {"display": "CargoBooking",    "iata": ["281"],      "proxy": "none"},
    "dhl":          {"display": "DHL Aviation",    "iata": ["DHL"],      "proxy": "none"},
    "aireuropa":    {"display": "Air Europa",      "iata": ["UX"],       "proxy": "none"},
    "etihad":       {"display": "Etihad Cargo",    "iata": ["EY"],       "proxy": "premium"},
    "tap":          {"display": "TAP Air Portugal","iata": ["TP"],       "proxy": "premium"},
    "thai":         {"display": "Thai Airways",    "iata": ["TG"],       "proxy": "premium"},
    "eva":          {"display": "EVA Air",         "iata": ["BR"],       "proxy": "premium"},
    "myfreighter":  {"display": "MyFreighter",     "iata": ["C6"],       "proxy": "none"},
}


@app.get("/trackers")
def list_trackers():
    """Returns every unique tracker with its metadata and live circuit-breaker status."""
    now = time.time()

    # Build prefix lookup: canonical_key → [prefix, ...]
    prefixes_by_key: dict[str, list[str]] = {}
    for prefix, key in AWB_PREFIX_TO_AIRLINE.items():
        prefixes_by_key.setdefault(key, []).append(prefix)

    # Deduplicate by tracker object identity, preserving insertion order
    seen: dict[int, str] = {}
    for key, tracker in TRACKERS.items():
        tid = id(tracker)
        if tid not in seen:
            seen[tid] = key

    results = []
    for canonical_key in seen.values():
        breaker = _AIRLINE_CIRCUIT_BREAKER.get(canonical_key, {"fails": 0, "blocked_until": 0})
        fails = breaker.get("fails", 0)
        blocked_until = breaker.get("blocked_until", 0)

        if fails >= MAX_FAILURES and now < blocked_until:
            cb_status = "tripped"
            cooldown_remaining_s = round(blocked_until - now)
        elif fails > 0:
            cb_status = "degraded"
            cooldown_remaining_s = None
        else:
            cb_status = "closed"
            cooldown_remaining_s = None

        meta = _TRACKER_META.get(canonical_key, {
            "display": canonical_key.title(),
            "iata": [],
            "proxy": "unknown",
        })

        results.append({
            "key":                 canonical_key,
            "display":             meta["display"],
            "iata_codes":          meta["iata"],
            "awb_prefixes":        sorted(prefixes_by_key.get(canonical_key, [])),
            "proxy":               meta["proxy"],   # "none" | "standard" | "premium"
            "cb_status":           cb_status,       # "closed" | "degraded" | "tripped"
            "cb_failures":         fails,
            "cb_max_failures":     MAX_FAILURES,
            "cooldown_remaining_s": cooldown_remaining_s,
        })

    # Sort: tripped first, then degraded, then alphabetical
    order = {"tripped": 0, "degraded": 1, "closed": 2}
    results.sort(key=lambda r: (order.get(r["cb_status"], 9), r["display"]))
    return {"trackers": results}


# Frontend for testing and querying AWBs (must be after API routes)
static_dir = Path(__file__).parent / "static"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")

