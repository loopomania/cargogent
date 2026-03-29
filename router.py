from __future__ import annotations

from airlines import AFKLMTracker, CargoPalTracker, CathayTracker, ChallengeTracker, DeltaTracker, ElAlTracker, EthiopianTracker, LufthansaTracker, UnitedTracker, AirCanadaTracker, SilkWayTracker, DHLAviationTracker, CargoBookingTracker
from models import TrackingResponse


import os
from dotenv import load_dotenv

# Load .env file from /app or local dev root
load_dotenv(".env") or load_dotenv("../.env")

PROXY_URL = os.environ.get("PROXY_URL")
PREMIUM_PROXY_URL = os.environ.get("PREMIUM_PROXY_URL")

# Selective Proxying: Only use residential proxy for "Hard" airlines
PROXY_REQUIRED = {"elal", "el-al", "ly", "delta", "dl", "cargopal", "pal", "pr", "aircanada", "ac"}

_elal      = ElAlTracker(proxy=PREMIUM_PROXY_URL)
_lufthansa = LufthansaTracker(proxy=PROXY_URL)
_delta     = DeltaTracker(proxy=PREMIUM_PROXY_URL)
_afklm     = AFKLMTracker(proxy=PROXY_URL)
_united    = UnitedTracker(proxy=PROXY_URL)
_cargopal  = CargoPalTracker(proxy=PROXY_URL)
_cathay    = CathayTracker(proxy=PROXY_URL)
_ethiopian = EthiopianTracker(proxy=PROXY_URL)
_challenge = ChallengeTracker(proxy=PROXY_URL)
_aircanada = AirCanadaTracker(proxy=PREMIUM_PROXY_URL)
_silkway   = SilkWayTracker()
_cargobooking = CargoBookingTracker()
_cargobooking = CargoBookingTracker()
_dhl       = DHLAviationTracker()

TRACKERS = {
    "elal": _elal, "el-al": _elal, "ly": _elal,
    "lufthansa": _lufthansa, "lh": _lufthansa,
    "delta": _delta, "dl": _delta,
    "afklm": _afklm, "af": _afklm, "kl": _afklm, "klm": _afklm,
    "united": _united, "ua": _united,
    "cargopal": _cargopal, "pal": _cargopal, "pr": _cargopal,
    "cathay": _cathay, "cx": _cathay,
    "ethiopian": _ethiopian, "et": _ethiopian,
    "challenge": _challenge, "ch": _challenge,
    "aircanada": _aircanada, "ac": _aircanada,
    "silkway": _silkway, "7l": _silkway,
    "cargobooking": _cargobooking, "281": _cargobooking,
    "dhl": _dhl,
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
    "014": "aircanada",
    "079": "cargopal",
    "501": "silkway",
    "281": "cargobooking",
    "615": "dhl",
}


GROUND_SERVICE_MEMORY: dict[str, str] = {}

def normalize_airline(code: str) -> str:
    return code.strip().lower()


def get_airline_from_awb(awb: str) -> str:
    """Detect airline from AWB number (first 3 digits). Returns airline key or 'unsupported'."""
    digits = "".join(c for c in awb.strip() if c.isdigit())
    if len(digits) >= 3:
        prefix = digits[:3]
        if prefix in AWB_PREFIX_TO_AIRLINE:
            return AWB_PREFIX_TO_AIRLINE[prefix]
    return "unsupported"

import time

_AIRLINE_CIRCUIT_BREAKER: dict[str, dict] = {}
MAX_FAILURES = 3
COOLDOWN_SECONDS = 300  # 5 minutes

def is_airline_blocked(airline: str) -> bool:
    breaker = _AIRLINE_CIRCUIT_BREAKER.get(airline)
    if not breaker:
        return False
    if breaker["fails"] >= MAX_FAILURES:
        if time.time() < breaker["blocked_until"]:
            return True
        else:
            # Cooldown expired, half-open state (test one request)
            breaker["fails"] = MAX_FAILURES - 1 
            return False
    return False

def record_airline_success(airline: str):
    if airline in _AIRLINE_CIRCUIT_BREAKER:
        _AIRLINE_CIRCUIT_BREAKER[airline] = {"fails": 0, "blocked_until": 0}

def record_airline_failure(airline: str):
    breaker = _AIRLINE_CIRCUIT_BREAKER.setdefault(airline, {"fails": 0, "blocked_until": 0})
    breaker["fails"] += 1
    if breaker["fails"] >= MAX_FAILURES:
        breaker["blocked_until"] = time.time() + COOLDOWN_SECONDS


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
    
    if is_airline_blocked(key):
        return TrackingResponse(
            airline=airline.title(),
            awb=awb,
            status="Error",
            message=f"circuit_breaker: {airline.title()} tracer temporarily blocked (cooldown)",
            events=[]
        )
    
    import asyncio
    
    t0 = time.time()
    res = None
    last_error_msg = ""
    try:
        # A single 85s timeout ensures we allow enough time for complex browser automation on prod
        res = await asyncio.wait_for(tracker.track(awb, hawb=hawb), timeout=85.0)
        if res.status != "Error" or res.events:
            record_airline_success(key)
        else:
            last_error_msg = res.message
            record_airline_failure(key)
    except asyncio.TimeoutError:
        last_error_msg = "Primary airline tracker timed out (85s)"
        record_airline_failure(key)
    except Exception as e:
        last_error_msg = f"Primary tracker failed: {str(e)[:40]}"
        record_airline_failure(key)
            
    if not res or (res.status == "Error" and not getattr(res, "events", [])):
        res = TrackingResponse(
            airline=airline.title(),
            awb=awb,
            status="Error",
            message=last_error_msg or "Unknown error",
            events=[]
        )
    
    t1 = time.time()
    airline_duration = round(t1 - t0, 1)
    
    res.hawb = hawb
    if "durations" not in res.raw_meta:
        res.raw_meta["durations"] = {}
    res.raw_meta["durations"]["airline"] = airline_duration
    
    ground_duration = 0.0
    
    # 2. If HAWB is provided, also track from Ground Services
    if hawb:
        # Check if it's an import to Israel that hasn't landed yet
        is_import_to_tlv = res.destination == "TLV" or any(e.location == "TLV" for e in res.events)
        has_landed = any(
            e.location in ["TLV", "Israel"] or
            e.status_code in ["RCF", "NFD", "DLV", "AWD"]
            for e in res.events
        )
        
        skip_ground = res.destination == "TLV" and not has_landed

        if skip_ground:
            res.message += " | ground_skipped:not_arrived"
        else:
            t_g0 = time.time()
            ground_services = []
            res.message += " | no_ground_handlers_configured"

            t_g1 = time.time()
            ground_duration = round(t_g1 - t_g0, 1)

    res.raw_meta["durations"]["ground"] = ground_duration

    return res


async def route_track_by_awb(awb: str, hawb: Optional[str] = None) -> TrackingResponse:
    """Route tracking by AWB only; airline is detected from AWB prefix."""
    airline = get_airline_from_awb(awb)
    return await route_track(airline, awb, hawb=hawb)
