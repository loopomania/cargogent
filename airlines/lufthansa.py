from __future__ import annotations

import logging
from typing import List, Optional

from .base import AirlineTracker
from .common import summarize_from_events
from models import TrackingEvent, TrackingResponse

logger = logging.getLogger(__name__)

# ── IATA milestone status codes ───────────────────────────────────────────────
MILESTONE_CODES = {
    "BKD": "Booking Confirmed",
    "RCS": "Received from Shipper",
    "MAN": "Manifested",
    "DEP": "Departed",
    "ARR": "Arrived",
    "RCF": "Received from Flight",
    "NFD": "Consignee Notified",
    "AWD": "Documents Delivered",
    "DLV": "Delivered",
    "FOH": "Freight On Hand",
    "DIS": "Discrepancy",
    "RDD": "Ready for Delivery",
    "CRC": "Customs Cleared",
    "FPS": "Freight Part Short",
    "DDL": "Delivered at Door",
}

def _parse_new_api_response(payload: dict) -> List[TrackingEvent]:
    """
    Parses the structured JSON response from Lufthansa's new internal API.
    Extracts events from the 'statusHistories' array.
    """
    events: List[TrackingEvent] = []

    status_histories = payload.get("statusHistories") or []

    for sh in status_histories:
        code = sh.get("cargoEventType", "").upper()
        if code not in MILESTONE_CODES:
            continue

        location = None
        if sh.get("stationAirport"):
            location = sh.get("stationAirport", {}).get("airportCode")

        planned_event = sh.get("planedCargoEvent") or {}
        actual_event = sh.get("actualCargoEvent") or {}

        # Prefer actual event date, fallback to planned
        actual_date = actual_event.get("eventDateTime")
        planned_date = planned_event.get("eventDateTime")
        date = actual_date or planned_date

        pieces = None
        weight = None
        piece_info = actual_event.get("pieceInformation") or planned_event.get("pieceInformation") or {}
        if piece_info.get("piecesCount") is not None:
            pieces = str(piece_info.get("piecesCount"))
        if piece_info.get("piecesWeight") is not None:
            weight = str(piece_info.get("piecesWeight"))

        flight_str = None
        remarks_parts = []
        if sh.get("flight"):
            flt_info = sh.get("flight")
            carrier = flt_info.get("flightDesignator", {}).get("carrierCode", "")
            number = flt_info.get("flightDesignator", {}).get("flightNumber", "")
            suffix = flt_info.get("flightDesignator", {}).get("suffix", "")
            flight_str = f"{carrier}{number}{suffix}".strip()
            remarks_parts.append(f"Flight: {flight_str}")

            orig = (flt_info.get("originAirport") or {}).get("airportCode")
            dest = (flt_info.get("destinationAirport") or {}).get("airportCode")
            if orig and dest:
                remarks_parts.append(f"Segment: {orig} to {dest}")

        if planned_date and actual_date and planned_date != actual_date:
            remarks_parts.append(f"Planned: {planned_date}")

        events.append(TrackingEvent(
            status_code=code,
            status=MILESTONE_CODES.get(code, "Unknown"),
            location=location,
            date=date,
            pieces=pieces,
            weight=weight,
            flight=flight_str or None,
            remarks=" | ".join(remarks_parts) if remarks_parts else "Extracted from API",
        ))

    # Deduplicate: keep first occurrence of each (code, location, date) triple
    seen: set = set()
    unique: List[TrackingEvent] = []
    for ev in events:
        key = (ev.status_code, ev.location, ev.date)
        if key not in seen:
            seen.add(key)
            unique.append(ev)

    # Sort by date
    unique.sort(key=lambda ev: ev.date or "")

    return unique


class LufthansaTracker(AirlineTracker):
    name = "lufthansa"
    tracking_url = "https://www.lufthansa-cargo.com/en/eservices/etracking"

    async def track(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        return await self.run_sync(self._track_sync, awb, hawb=hawb, **kwargs)

    def _track_sync(self, awb: str, hawb=None, **kwargs) -> TrackingResponse:
        awb_clean = awb.replace("-", "").replace(" ", "")
        prefix = awb_clean[:3]
        number = awb_clean[3:]
        awb_fmt = f"{prefix}-{number}"
        message = "Success"
        blocked = False
        captured_json: Optional[dict] = None
        trace = []

        # The Lufthansa external API is publicly accessible — no proxy/browser needed.
        url = f"https://api-external.lufthansa-cargo.com/stp/shipments-details/{awb_clean}"
        headers = {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.lufthansa-cargo.com/",
            "Origin": "https://www.lufthansa-cargo.com",
        }

        trace.append("fetching_direct_api")
        try:
            from curl_cffi import requests as cffi_requests
            resp = cffi_requests.get(url, headers=headers, impersonate="chrome124", timeout=30)
            trace.append(f"http_status:{resp.status_code}")
            if resp.status_code == 200:
                captured_json = resp.json()
                trace.append("api_success")
                message = "Successfully loaded Lufthansa API data."
            elif resp.status_code in (401, 403):
                blocked = True
                message = f"API Error: HTTP {resp.status_code} — access blocked."
                trace.append(f"api_blocked:{resp.status_code}")
            elif resp.status_code == 404:
                message = f"AWB {awb_fmt} not found on Lufthansa."
                trace.append("api_not_found")
            else:
                message = f"API Error: HTTP {resp.status_code}"
                trace.append(f"api_error:{resp.status_code}")
        except Exception as e:
            trace.append(f"request_error:{str(e)[:60]}")
            message = f"Request Error: {str(e)[:60]}"

        # ── Parse events ──────────────────────────────────────────────────────
        events: List[TrackingEvent] = []
        origin = None
        destination = None

        if captured_json and not blocked:
            events = _parse_new_api_response(captured_json)

            # Extract origin/destination from awbDetails
            awb_details = captured_json.get("awbDetails", {})
            if awb_details.get("originAirport"):
                origin = awb_details["originAirport"].get("airportCode")
            if awb_details.get("destinationAirport"):
                destination = awb_details["destinationAirport"].get("airportCode")

        # Fallback to summarize from events if explicit origin/dest are missing
        summary_orig, summary_dest, status, flight = summarize_from_events(events)
        origin = origin or summary_orig
        destination = destination or summary_dest

        return TrackingResponse(
            airline=self.name,
            awb=awb_fmt,
            origin=origin,
            destination=destination,
            status=status,
            flight=flight,
            events=events,
            blocked=blocked,
            message=message,
            raw_meta={"trace": trace},
        )
