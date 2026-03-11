from __future__ import annotations

from airlines import ElAlTracker, LufthansaTracker
from models import TrackingResponse


TRACKERS = {
    "elal": ElAlTracker(),
    "el-al": ElAlTracker(),
    "ly": ElAlTracker(),
    "lufthansa": LufthansaTracker(),
    "lh": LufthansaTracker(),
}


def normalize_airline(code: str) -> str:
    return code.strip().lower()


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
