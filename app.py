from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from models import TrackingResponse
from router import route_track, route_track_by_awb

app = FastAPI(title="Air Cargo Tracking Router API")


@app.get("/track/{airline}/{awb}", response_model=TrackingResponse)
async def track_awb_by_airline(airline: str, awb: str):
    data = await route_track(airline, awb)
    if data.blocked and not data.events:
        raise HTTPException(status_code=403, detail=data.message)
    return data


@app.get("/track/{awb}", response_model=TrackingResponse)
async def track_awb_auto(awb: str):
    """Track by AWB only; airline is detected by the router from AWB prefix."""
    data = await route_track_by_awb(awb)
    if data.blocked and not data.events:
        raise HTTPException(status_code=403, detail=data.message)
    return data


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Frontend for testing and querying AWBs (must be after API routes)
static_dir = Path(__file__).parent / "static"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")
