from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TrackingEvent(BaseModel):
    status_code: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    date: Optional[str] = None
    pieces: Optional[str] = None
    weight: Optional[str] = None
    remarks: Optional[str] = None
    flight: Optional[str] = None


class TrackingResponse(BaseModel):
    airline: str
    awb: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    status: Optional[str] = None
    flight: Optional[str] = None
    events: List[TrackingEvent] = Field(default_factory=list)
    message: str = "ok"
    blocked: bool = False
    raw_meta: Dict[str, Any] = Field(default_factory=dict)
