from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from models import TrackingResponse


class AirlineTracker(ABC):
    def __init__(self, proxy: Optional[str] = None):
        self.proxy = proxy

    @abstractmethod
    async def track(self, awb: str) -> TrackingResponse:
        raise NotImplementedError
