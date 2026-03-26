from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from models import TrackingResponse

# Shared executor for all sync (Selenium/UC) trackers.
# Max 3 concurrent browser sessions to avoid OOM under load.
_browser_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="uc-tracker")


class AirlineTracker(ABC):
    def __init__(self, proxy: Optional[str] = None):
        self.proxy = proxy

    @abstractmethod
    async def track(self, awb: str, hawb: Optional[str] = None, **kwargs) -> TrackingResponse:
        raise NotImplementedError

    async def run_sync(self, fn, *args, **kwargs):
        """Run a synchronous (blocking) function in the shared browser thread pool.
        
        Use this in UC/Selenium-based trackers to avoid blocking the FastAPI event loop:
            return await self.run_sync(self._track_sync, awb, hawb=hawb)
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _browser_executor,
            lambda: fn(*args, **kwargs)
        )
