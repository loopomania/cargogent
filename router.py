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


GROUND_SERVICE_MEMORY: dict[str, str] = {}

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
    
    import asyncio
    import time
    
    t0 = time.time()
    res = None
    last_error_msg = ""
    for attempt in range(2):
        try:
            res = await asyncio.wait_for(tracker.track(awb, hawb=hawb), timeout=40.0)
            if res.status != "Error" or res.events:
                break
            else:
                last_error_msg = res.message
        except asyncio.TimeoutError:
            last_error_msg = f"Primary airline tracker timed out (attempt {attempt+1})"
        except Exception as e:
            last_error_msg = f"Primary tracker failed (attempt {attempt+1}): {str(e)[:40]}"
            
    if not res or (res.status == "Error" and not getattr(res, "events", [])):
        from models import TrackingResponse
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
            ground_services = ["maman", "swissport"]
            
            # Reorder ground services based on recent LRU preference for this airline
            pref = GROUND_SERVICE_MEMORY.get(key)
            if pref and pref in ground_services:
                ground_services.remove(pref)
                ground_services.insert(0, pref)
                
            for g_name in ground_services:
                timeout_val = 30.0 if g_name == "maman" else 20.0
                try:
                    g_tracker = TRACKERS[g_name]
                    if g_name == "swissport":
                        g_res = await asyncio.wait_for(g_tracker.track(awb, hawb=hawb, origin=res.origin), timeout=timeout_val)
                    else:
                        g_res = await asyncio.wait_for(g_tracker.track(awb, hawb=hawb), timeout=timeout_val)
                        
                    if g_res.events:
                        res.events.extend(g_res.events)
                        res.message += f" | {g_name}_synced"
                        GROUND_SERVICE_MEMORY[key] = g_name  # Update cache
                        break # Found events, skip the other
                except asyncio.TimeoutError:
                    res.message += f" | {g_name}_timed_out"
                except Exception as e:
                    res.message += f" | {g_name}_error:{str(e)[:20]}"

            t_g1 = time.time()
            ground_duration = round(t_g1 - t_g0, 1)

    res.raw_meta["durations"]["ground"] = ground_duration

    return res


async def route_track_by_awb(awb: str, hawb: Optional[str] = None) -> TrackingResponse:
    """Route tracking by AWB only; airline is detected from AWB prefix."""
    airline = get_airline_from_awb(awb)
    return await route_track(airline, awb, hawb=hawb)
