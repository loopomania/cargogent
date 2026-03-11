from __future__ import annotations

from abc import ABC, abstractmethod

from models import TrackingResponse


class AirlineTracker(ABC):
    @abstractmethod
    async def track(self, awb: str) -> TrackingResponse:
        raise NotImplementedError
