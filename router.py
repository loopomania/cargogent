from __future__ import annotations

from airlines import AFKLMTracker, CargoPalTracker, CathayTracker, DeltaTracker, ElAlTracker, LufthansaTracker, UnitedTracker
from models import TrackingResponse


TRACKERS = {
    "elal": ElAlTracker(),
    "el-al": ElAlTracker(),
    "ly": ElAlTracker(),
    "lufthansa": LufthansaTracker(),
    "lh": LufthansaTracker(),
    "delta": DeltaTracker(),
    "dl": DeltaTracker(),
    "afklm": AFKLMTracker(),
    "af": AFKLMTracker(),
    "kl": AFKLMTracker(),
    "klm": AFKLMTracker(),
    "united": UnitedTracker(),
    "ua": UnitedTracker(),
    "cargopal": CargoPalTracker(),
    "pal": CargoPalTracker(),
    "pr": CargoPalTracker(),
    "cathay": CathayTracker(),
    "cx": CathayTracker(),
}

# AWB prefix (first 3 digits) -> airline key for router detection
AWB_PREFIX_TO_AIRLINE: dict[str, str] = {
    "114": "elal",
    "020": "lufthansa",
    "006": "delta",
    "057": "afklm",  # Air France
    "074": "afklm",  # KLM
    "016": "united",
    "160": "cathay",
}


def normalize_airline(code: str) -> str:
    return code.strip().lower()


def get_airline_from_awb(awb: str) -> str:
    """Detect airline from AWB number (first 3 digits). Returns airline key or 'elal' as default."""
    digits = "".join(c for c in awb.strip() if c.isdigit())
    if len(digits) >= 3:
        prefix = digits[:3]
        if prefix in AWB_PREFIX_TO_AIRLINE:
            return AWB_PREFIX_TO_AIRLINE[prefix]
    return "elal"


async def route_track(airline: str, awb: str) -> TrackingResponse:
    key = normalize_airline(airline)
    tracker = TRACKERS.get(key)
    if not tracker:
        return TrackingResponse(
            airline=key,
            awb=awb,
            events=[],
            blocked=False,
            message=f"unsupported_airline:{key}",
            raw_meta={"supported": sorted(TRACKERS.keys())},
        )
    return await tracker.track(awb)


async def route_track_by_awb(awb: str) -> TrackingResponse:
    """Route tracking by AWB only; airline is detected from AWB prefix."""
    airline = get_airline_from_awb(awb)
    return await route_track(airline, awb)
