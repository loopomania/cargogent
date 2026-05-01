from __future__ import annotations

import re

from airlines import AFKLMTracker, CargoPalTracker, CathayTracker, ChallengeTracker, DeltaTracker, ElAlTracker, EthiopianTracker, LufthansaTracker, UnitedTracker, AirCanadaTracker, SilkWayTracker, DHLAviationTracker, CargoBookingTracker, AirEuropaTracker, EtihadTracker, TapTracker, ThaiTracker, EVATracker, MyFreighterTracker
from airlines.maman import MamanGroundTracker
from airlines.swissport import SwissportGroundTracker
from models import TrackingResponse


def normalize_iata_location(loc: str | None) -> str | None:
    """Extract clean IATA airport code from various location formats.
    
    Examples:
        'Athens (ATH)' → 'ATH'
        'Toronto (YYZ)' → 'YYZ'
        'TLV (Swissport)' → 'TLV'
        'ILTLV' → 'TLV'  (5-char country+airport)
        'TLV' → 'TLV'  (already clean)
    """
    if not loc or not loc.strip():
        return loc
    loc = loc.strip()
    
    # Pattern 1: "IATA (suffix)" — e.g., "TLV (Swissport)", "ATH(ARR)" — take the leading code
    m = re.match(r'^([A-Z]{3})\s*\(', loc)
    if m:
        return m.group(1)
        
    # Pattern 2: "CityName (IATA)" — extract the 3-letter code from parentheses
    # Ignore common 3-letter status codes like ARR, DEP, DLV inside parentheses
    m = re.search(r'\(([A-Z]{3})\)', loc)
    if m and m.group(1) not in ("ARR", "DEP", "DLV", "RCF", "RCS", "NFD", "AWD", "MAN", "BKD"):
        return m.group(1)
    
    # Pattern 3: 5-char country+airport — e.g., "ILTLV" → "TLV"
    if len(loc) == 5 and loc.isalpha() and loc.isupper():
        return loc[2:]
    
    # Already clean or unknown format — return as-is
    return loc


import os
from dotenv import load_dotenv

# Load .env file from /app or local dev root
load_dotenv(".env") or load_dotenv("../.env")

PROXY_URL = os.environ.get("PROXY_URL")
PREMIUM_PROXY_URL = os.environ.get("PREMIUM_PROXY_URL")

# Selective Proxying: Only use residential proxy for "Hard" airlines
PROXY_REQUIRED = {"elal", "el-al", "ly", "delta", "dl", "cargopal", "pal", "pr", "aircanada", "ac", "tap", "thai"}

_elal      = ElAlTracker(proxy=PREMIUM_PROXY_URL)
_lufthansa = LufthansaTracker(proxy=PREMIUM_PROXY_URL)
_delta     = DeltaTracker(proxy=PREMIUM_PROXY_URL)
_afklm     = AFKLMTracker(proxy=PROXY_URL)
_united    = UnitedTracker(proxy=PROXY_URL)
_cargopal  = CargoPalTracker(proxy=None)
_cathay    = CathayTracker(proxy=PREMIUM_PROXY_URL)
_ethiopian = EthiopianTracker(proxy=PROXY_URL)
_challenge = ChallengeTracker(proxy=PROXY_URL)
_aircanada = AirCanadaTracker(proxy=PREMIUM_PROXY_URL)
_silkway   = SilkWayTracker()
_cargobooking = CargoBookingTracker()
_cargobooking = CargoBookingTracker()
_dhl       = DHLAviationTracker()
_aireuropa = AirEuropaTracker()
_etihad    = EtihadTracker(proxy=PREMIUM_PROXY_URL)
_tap       = TapTracker(proxy=PREMIUM_PROXY_URL)
_thai      = ThaiTracker(proxy=PREMIUM_PROXY_URL)
_eva       = EVATracker(proxy=PREMIUM_PROXY_URL)
_myfreighter = MyFreighterTracker()

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
    "aireuropa": _aireuropa, "ux": _aireuropa, "air-europa": _aireuropa,
    "etihad": _etihad, "ey": _etihad,
    "tap": _tap, "tp": _tap,
    "thai": _thai, "tg": _thai,
    "eva": _eva, "br": _eva,
    "myfreighter": _myfreighter,
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
    "996": "aireuropa",
    "607": "etihad",
    "047": "tap",
    "217": "thai",
    "695": "eva",
    "488": "myfreighter",
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


async def route_track(airline: str, awb: str, hawb: Optional[str] = None, ground_only: bool = False) -> TrackingResponse:
    key = normalize_airline(airline)
    tracker = TRACKERS.get(key)
    
    res = None
    last_error_msg = ""
    airline_duration = 0.0
    t0 = time.time()
    
    if ground_only:
        res = TrackingResponse(
            airline=airline.title(),
            awb=awb,
            status="Skipped",
            message="Skipped airline tracking; ground_only mode.",
            events=[],
            raw_meta={"durations": {"airline": 0.0}, "ground_only": True},
        )
    elif not tracker:
        last_error_msg = f"unsupported_airline:{key}"
        res = TrackingResponse(
            airline=key,
            awb=awb,
            status="Error",
            events=[],
            blocked=False,
            message=last_error_msg,
            raw_meta={"supported": sorted(TRACKERS.keys()), "durations": {}},
        )
    elif is_airline_blocked(key):
        res = TrackingResponse(
            airline=airline.title(),
            awb=awb,
            status="Error",
            message=f"circuit_breaker: {airline.title()} tracer temporarily blocked (cooldown)",
            events=[],
            raw_meta={"durations": {}},
        )
    else:
        import asyncio
        
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
                events=[],
                raw_meta={"durations": {}},
            )
        
        t1 = time.time()
        airline_duration = round(t1 - t0, 1)
    
    res.hawb = hawb
    if "durations" not in res.raw_meta:
        res.raw_meta["durations"] = {}
    res.raw_meta["durations"]["airline"] = airline_duration
    if ground_only:
        res.raw_meta["ground_only"] = True
    
    ground_duration = 0.0
    
    # 2. If HAWB is provided, also track from Ground Services
    if hawb:
        if ground_only:
            is_import_to_tlv = True
            is_export_from_tlv = False
            has_landed = True
        else:
            # Check if it's an import to Israel that hasn't landed yet
            is_import_to_tlv = res.destination == "TLV" or any(e.location == "TLV" for e in res.events)
            
            # Determine if it's an export from Israel
            is_export_from_tlv = False
            if res.origin in ["TLV", "Israel"]:
                is_export_from_tlv = True
            elif any(e.location in ["TLV", "Israel"] and e.status_code in ["BKD", "RCS", "DEP"] for e in res.events):
                is_export_from_tlv = True
            elif hawb and hawb.upper().startswith("ISR"):
                # HAWB prefix 'ISR' strongly indicates Israeli origin ground service
                is_export_from_tlv = True

            has_landed = any(
                e.location in ["TLV", "Israel"] or
                e.status_code in ["RCF", "NFD", "DLV", "AWD"]
                for e in res.events
            )
        
        skip_ground = (res.destination == "TLV" or is_import_to_tlv) and not has_landed

        if skip_ground and not is_export_from_tlv:
            res.message += " | ground_skipped:not_arrived"
        else:
            t_g0 = time.time()
            maman_synced = False
            dir_type = "export" if is_export_from_tlv else "import"
            
            # Determine mapping based on airline key
            airline_key = normalize_airline(airline)
            # Based on new analysis from IL1 export and L2077 import data:
            # Maman: El Al, Air Canada, United, Delta, CargoBooking, PAL Cargo, Challenge, Ethiopian
            # Swissport: Lufthansa, Cathay, Silk Way, Air France/KLM, DHL
            run_maman = airline_key in {
                "elal", "ly", "united", "ua", "aircanada", "ac", "ethiopian", "et", 
                "cargopal", "pal", "pr", "delta", "dl", "challenge", "ch", "cargobooking", "281"
            }
            run_swissport = airline_key in {
                "lufthansa", "lh", "cathay", "cx", "silkway", "7l", 
                "afklm", "af", "kl", "klm", "dhl"
            }
            
            # Default to Maman if unknown Israeli
            if not run_maman and not run_swissport:
                run_maman = True

            async def _run_ground(TrackerCls, name):
                tracker = TrackerCls()
                return await tracker.track(hawb, mawb=awb, dir_type=dir_type)

            results_ground = []
            if run_maman:
                w, p, evs, h_val, q_method = await _run_ground(MamanGroundTracker, "maman")
                if w is not None or evs:
                    results_ground.append((w, p, evs, h_val, q_method, "Maman"))
            if run_swissport and not results_ground:
                w, p, evs, h_val, q_method = await _run_ground(SwissportGroundTracker, "swissport")
                if w is not None or evs:
                    results_ground.append((w, p, evs, h_val, q_method, "Swissport"))
                    
            if results_ground:
                w, p, evs, h_val, q_method, source_name = results_ground[0]
                maman_synced = True
                
                # Apply validation metadata
                res.raw_meta["hawb_validated"] = h_val
                res.raw_meta["ground_query_method"] = q_method
                
                for ev in res.events:
                    if w is not None and h_val: ev.weight = w
                    if p is not None and h_val: ev.pieces = p
                res.events.extend(evs)
                res.message += f" | ground_{dir_type}_synced({source_name})"
                
                # If airline tracker failed/pending but ground data is available,
                # upgrade status so the backend persists the events
                if res.status in ("Error", "Pending Ground Data") and evs:
                    last_ground_status = evs[-1].status if evs else None
                    res.status = last_ground_status or "Ground Data Only"
                
                # Derive origin/destination from ground data.
                # Ground handler locations are the ultimate origin/destination,
                # overriding what the airline might report (e.g. if airline only tracks from a transit hub).
                for ev in evs:
                    loc = (ev.location or "").split("(")[0].strip()  # "TLV (Swissport)" → "TLV"
                    if loc:
                        if dir_type == "export":
                            res.origin = loc
                        elif dir_type == "import":
                            res.destination = loc
                        break
                
                if not h_val:
                    res.message += " | Note: HAWB details not validated (MAWB only fallback used)"
            else:
                res.message += " | HAWB failed to retrieve data from ground service (missing data/status)"
                res.raw_meta["ground_status"] = "no_data"

            t_g1 = time.time()
            ground_duration = round(t_g1 - t_g0, 1)

    res.raw_meta["durations"]["ground"] = ground_duration

    # Normalize origin/destination to clean IATA codes before returning
    res.origin = normalize_iata_location(res.origin)
    res.destination = normalize_iata_location(res.destination)

    return res


async def route_track_by_awb(awb: str, hawb: Optional[str] = None, ground_only: bool = False) -> TrackingResponse:
    """Route tracking by AWB only; airline is detected from AWB prefix."""
    airline = get_airline_from_awb(awb)
    return await route_track(airline, awb, hawb=hawb, ground_only=ground_only)
