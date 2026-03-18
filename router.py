from __future__ import annotations

from airlines import AFKLMTracker, CargoPalTracker, CathayTracker, ChallengeTracker, DeltaTracker, ElAlTracker, EthiopianTracker, LufthansaTracker, UnitedTracker, MamanTracker, SwissportTracker
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
    "maman": MamanTracker(),
    "swissport": SwissportTracker(),
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


async def route_track(airline: str, awb: str, hawb: Optional[str] = None) -> TrackingResponse:
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
    
    # 1. Track from airline
    import asyncio
    try:
        res = await asyncio.wait_for(tracker.track(awb, hawb=hawb), timeout=55.0)
    except Exception as e:
        from airlines.models import TrackingResponse
        res = TrackingResponse(
            airline=airline.title(),
            awb=awb,
            status="Error",
            message=f"Primary tracker failed: {str(e)[:40]}",
            events=[]
        )
    
    res.hawb = hawb
    
    # 2. If HAWB is provided, also track from Ground Services
    if hawb:
        # Track from Maman
        try:
            maman = TRACKERS["maman"]
            maman_res = await asyncio.wait_for(maman.track(awb, hawb=hawb), timeout=30.0)
            if maman_res.events:
                res.events.extend(maman_res.events)
                res.message += " | maman_synced"
        except Exception as e:
            res.message += f" | maman_error:{str(e)[:20]}"

        # Track from Swissport
        try:
            swissport = TRACKERS["swissport"]
            swissport_res = await asyncio.wait_for(swissport.track(awb, hawb=hawb, origin=res.origin), timeout=20.0)
            if swissport_res.events:
                res.events.extend(swissport_res.events)
                res.message += " | swissport_synced"
        except Exception as e:
            res.message += f" | swissport_error:{str(e)[:20]}"

    return res


async def route_track_by_awb(awb: str, hawb: Optional[str] = None) -> TrackingResponse:
    """Route tracking by AWB only; airline is detected from AWB prefix."""
    airline = get_airline_from_awb(awb)
    return await route_track(airline, awb, hawb=hawb)
