from __future__ import annotations

from airlines import AFKLMTracker, CargoPalTracker, CathayTracker, ChallengeTracker, DeltaTracker, ElAlTracker, EthiopianTracker, LufthansaTracker, UnitedTracker
from models import TrackingResponse


import os
from dotenv import load_dotenv

# Load .env file from /app or local dev root
load_dotenv(".env") or load_dotenv("../.env")

PROXY_URL = os.environ.get("PROXY_URL")

# Selective Proxying: Only use residential proxy for "Hard" airlines
PROXY_REQUIRED = {"elal", "el-al", "ly", "delta", "dl", "cargopal", "pal", "pr"}

TRACKERS = {
    "elal": ElAlTracker(proxy=PROXY_URL),
    "el-al": ElAlTracker(proxy=PROXY_URL),
    "ly": ElAlTracker(proxy=PROXY_URL),
    "lufthansa": LufthansaTracker(),
    "lh": LufthansaTracker(),
    "delta": DeltaTracker(proxy=PROXY_URL),
    "dl": DeltaTracker(proxy=PROXY_URL),
    "afklm": AFKLMTracker(),
    "af": AFKLMTracker(),
    "kl": AFKLMTracker(),
    "klm": AFKLMTracker(),
    "united": UnitedTracker(),
    "ua": UnitedTracker(),
    "cargopal": CargoPalTracker(proxy=PROXY_URL),
    "pal": CargoPalTracker(proxy=PROXY_URL),
    "pr": CargoPalTracker(proxy=PROXY_URL),
    "cathay": CathayTracker(),
    "cx": CathayTracker(),
    "ethiopian": EthiopianTracker(),
    "et": EthiopianTracker(),
    "challenge": ChallengeTracker(),
    "ch": ChallengeTracker(),
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
    "071": "ethiopian",
    "700": "challenge",
    "752": "challenge",
    "014": "elal",
    "079": "cargopal",
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
