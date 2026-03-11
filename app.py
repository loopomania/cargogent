from fastapi import FastAPI, HTTPException

from models import TrackingResponse
from router import route_track

app = FastAPI(title="Air Cargo Tracking Router API")


@app.get("/track/{airline}/{awb}", response_model=TrackingResponse)
async def track_awb_by_airline(airline: str, awb: str):
    data = await route_track(airline, awb)
    if data.blocked and not data.events:
        raise HTTPException(status_code=403, detail=data.message)
    return data


@app.get("/track/{awb}", response_model=TrackingResponse)
async def track_awb_default_elal(awb: str):
    # Backward-compatible endpoint: defaults to El Al.
    data = await route_track("elal", awb)
    if data.blocked and not data.events:
        raise HTTPException(status_code=403, detail=data.message)
    return data


@app.get("/health")
def health_check():
    return {"status": "ok"}
