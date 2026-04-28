from __future__ import annotations
import logging
import re
import json as _json
import urllib.request
import urllib.error
from typing import Optional, Tuple, List

from models import TrackingEvent

logger = logging.getLogger(__name__)

BASE = "https://www.swissport.co.il"

# Export row field indices (observed from live API response, export=certificate2 mode)
# f[0]=mawb_prefix  f[1]=mawb_serial  f[2]=hwb  f[3]=flight
# f[5]=departure_datetime  f[6]=awb_to(dest_country?)  f[8]=status(Hebrew)
# f[10]=conn_airport  f[12]=act_pcs  f[14]=dec_pcs
# f[15]=wrh_acceptance  f[17]=customs(Hebrew)  f[19]=ism(is_master)
# f[28]=block_status  f[29]=security  f[30]=airline_code
# f[32]=fwd_status  f[33]=agent_name
# f[34]=mst_pcs  f[35]=mst_wt
_F = dict(
    mawb_prefix  = 0,
    mawb_serial  = 1,
    hwb          = 2,
    flight       = 3,
    departure    = 5,
    awb_dest     = 6,
    status       = 8,
    conn_airport = 10,
    act_pcs      = 12,
    dec_pcs      = 14,
    wrh_in       = 15,
    customs      = 17,
    ism          = 19,
    block        = 28,
    security     = 29,
    airline_code = 30,
    fwd_status   = 32,
    agent        = 33,
    mst_pcs      = 34,
    mst_wt       = 35,
)

# Status Hebrew → IATA-ish code + English
_STATUS_MAP = [
    (r"יצא לטיסה|departed|departure",   ("DEP", "Departed on flight")),
    (r"הגיע|arrived|arrival",            ("ARR", "Arrived")),
    (r"שוחרר|נמסר|delivered|delivered",   ("DLV", "Delivered")),
    (r"ממתין|waiting|ready",             ("RCS", "Ready for flight")),
    (r"קיבלנו|קלוט|נקלט|received|acceptance", ("RCS", "Received")),
    (r"בנוי מלא|consolidated|fully.?built", ("RCS", "Ready for Carriage")),
    (r"מוכן לטיסה|ready.?for.?flight",  ("RCS", "Ready for Flight")),
    (r"הצהרה|declaration",               ("GND", "Declaration")),
    (r"בנוי חלקי|partially.?built",      ("GND", "Partially Built")),
]

def _map_status(hebrew: str) -> Tuple[str, str]:
    for pattern, result in _STATUS_MAP:
        if re.search(pattern, hebrew, re.I):
            return result
    return "GND", hebrew or "Ground Processing"

def _map_customs(hebrew: str) -> Optional[str]:
    if not hebrew:
        return None
    if re.search(r"שוחרר|clear|ok|approved|released", hebrew, re.I):
        return "Cleared"
    if re.search(r"עצור|hold|no|blocked|pending|seized", hebrew, re.I):
        return "Hold"
    return hebrew  # return raw if unrecognised

def _safe(fields: list, idx: int) -> str:
    try:
        return fields[idx].strip()
    except IndexError:
        return ""

def _parse_mawb(awb: str) -> Tuple[str, str]:
    digits = "".join(c for c in awb if c.isdigit())
    if len(digits) >= 11:
        return digits[:3], digits[3:]
    if len(digits) >= 3:
        return digits[:3], digits[3:]
    return "", digits

def _clean_date(raw: str) -> Optional[str]:
    if not raw or raw in ("01/01/00", "01/01/00<br>00:00", ""):
        return None
    # Input: "DD/MM/YY HH:MM" or "DD/MM/YY<br>HH:MM"
    clean = raw.replace("<br>", " ").strip()
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})(?:\s+(\d{2}:\d{2}))?", clean)
    if m:
        d, m, y, t = m.groups()
        if len(y) == 2: y = "20" + y
        fmt = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
        if t: fmt += f" {t}"
        return fmt
    return clean


class SwissportGroundTracker:
    """
    Tracks export/import shipments handled by Swissport IL at TLV.
    Uses POST /json/ajax.aspx/SearchBeforeExp or SearchBeforeImp
    """
    name = "swissport"

    async def track(
        self,
        hawb: str,
        mawb: str,
        dir_type: str = "export"
    ) -> Tuple[Optional[str], Optional[str], List[TrackingEvent], bool, str]:
        """
        Return (weight, pieces, events, hawb_validated, ground_query_method).
        """
        prefix, serial = _parse_mawb(mawb)
        inner_hawb = hawb.strip() if hawb else ""
        digits_m = "".join(c for c in str(mawb) if c.isdigit())
        
        # 1. Primary: MAWB+HAWB
        if inner_hawb:
            w, p, evs = await self._query_swissport(prefix, serial, inner_hawb, dir_type)
            if w is not None or evs:
                return w, p, evs, True, "mawb_hawb"
                
        # 2. Fallback 1: Only MAWB
        w, p, evs = await self._query_swissport(prefix, serial, "", dir_type)
        if w is not None or evs:
            return w, p, evs, False, "only_mawb"
            
        # 3. Fallback 2: Prefix removed from HAWB
        hawb_no_prefix = re.sub(r'^[A-Za-z]+', '', inner_hawb)
        if hawb_no_prefix and hawb_no_prefix != inner_hawb:
            w, p, evs = await self._query_swissport(prefix, serial, hawb_no_prefix, dir_type)
            if w is not None or evs:
                return w, p, evs, True, "hawb_prefix_removed"
                
        # 4. Fallback 3: MAWB used also in HAWB
        if digits_m:
            w, p, evs = await self._query_swissport(prefix, serial, digits_m, dir_type)
            if w is not None or evs:
                return w, p, evs, False, "mawb_in_hawb"
                
        return None, None, [], False, "failed"

    async def _query_swissport(self, prefix: str, serial: str, inner: str, dir_type: str) -> Tuple[Optional[str], Optional[str], List[TrackingEvent]]:

        endpoint = "SearchBeforeExp" if dir_type == "export" else "SearchBeforeImp"
        payload = (
            f"{{ShtarPre:'{prefix}',"
            f"Shtar:'{serial}',"
            f"Inner:'{inner}', "
            f"Page:1,Sort:0,Dir:'asc',srtp:0,"
            f"stype:'2',"
            f"tisa:'',status:'',date1:'',date2:'',lg:0}}"
        )

        req = urllib.request.Request(
            f"{BASE}/json/ajax.aspx/{endpoint}",
            data=payload.encode("utf-8"),
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"{BASE}/heb/Results/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Origin": BASE,
            },
            method="POST",
        )

        try:
            resp = urllib.request.urlopen(req, timeout=15)
            raw = resp.read().decode("utf-8")
        except urllib.error.URLError as e:
            logger.error(f"Swissport request failed: {e}")
            return None, None, []

        try:
            d = _json.loads(raw).get("d", "")
        except Exception:
            d = raw

        if not d or d in ("-1", ""):
            logger.warning("Swissport: session expired or no data")
            return None, None, []

        parts = d.split("~")
        if len(parts) < 3:
            logger.warning(f"Swissport: sparse response ({len(parts)} parts) — inner AWB may be required")
            return None, None, []

        weight: Optional[str] = None
        pieces: Optional[str] = None
        events: List[TrackingEvent] = []

        for part in parts[2:]:
            if not part.strip():
                continue
            f = part.split("|")
            if len(f) < 10:
                continue

            row_hwb = _safe(f, _F["hwb"])
            ism = _safe(f, _F["ism"])

            # Skip the master (ism=1) row — it has no per-HAWB details
            if ism == "1":
                # But grab master-level weight/pieces as a reference
                mst_pcs = _safe(f, _F["mst_pcs"])
                mst_wt  = _safe(f, _F["mst_wt"])
                if mst_pcs and mst_pcs not in ("0", ""):
                    pieces = mst_pcs
                if mst_wt and mst_wt not in ("0", "0.0", ""):
                    weight = mst_wt
                continue

            # Filter on HAWB if provided
            if inner and row_hwb and inner.lower() not in row_hwb.lower():
                continue

            # --- Extract row data ---
            status_raw   = _safe(f, _F["status"])
            customs_raw  = _safe(f, _F["customs"])
            fwd_raw      = _safe(f, _F["fwd_status"])
            flight_raw   = _safe(f, _F["flight"])
            departure_raw= _safe(f, _F["departure"])
            wrh_in_raw   = _safe(f, _F["wrh_in"])
            airline_code = _safe(f, _F["airline_code"])
            conn_airport = _safe(f, _F["conn_airport"])
            agent_raw    = _safe(f, _F["agent"])
            block_raw    = _safe(f, _F["block"])
            security_raw = _safe(f, _F["security"])
            act_pcs_raw  = _safe(f, _F["act_pcs"])
            mst_pcs_raw  = _safe(f, _F["mst_pcs"])
            mst_wt_raw   = _safe(f, _F["mst_wt"])

            # HAWB-level pieces/weight — Swissport gives "1/1" format (accepted/declared)
            hawb_pcs = act_pcs_raw.split("/")[0].strip() if act_pcs_raw else None

            # Override master weight/pieces if HAWB is a sub-shipment
            # For weight we fall back to master totals (Swissport doesn't show per-HAWB weight in export view)
            if hawb_pcs and hawb_pcs not in ("0", ""):
                pieces = hawb_pcs
            if mst_wt_raw and mst_wt_raw not in ("0", "0.0", ""):
                weight = mst_wt_raw
            if mst_pcs_raw and mst_pcs_raw not in ("0", ""):
                if not pieces:
                    pieces = mst_pcs_raw

            sc, status_eng = _map_status(status_raw)
            customs_val = _map_customs(customs_raw)

            # Build remarks
            parts_remarks = []
            if customs_raw:
                parts_remarks.append(f"Customs: {customs_raw}")
            if fwd_raw:
                parts_remarks.append(f"Status: {fwd_raw}")
            if block_raw and block_raw not in ("לא חסום", "0", ""):
                parts_remarks.append(f"Block: {block_raw}")
            if security_raw and security_raw not in ("F", "0", ""):
                parts_remarks.append(f"Security: {security_raw}")
            if conn_airport:
                parts_remarks.append(f"Via: {conn_airport}")
            if wrh_in_raw and _clean_date(wrh_in_raw):
                parts_remarks.append(f"Warehouse in: {wrh_in_raw}")
            if agent_raw:
                parts_remarks.append(f"Agent: {agent_raw}")

            events.append(TrackingEvent(
                location="TLV (Swissport)",
                status=status_eng,
                status_code=sc,
                date=_clean_date(departure_raw),
                pieces=pieces,
                weight=weight,
                flight=flight_raw or None,
                customs=customs_val,
                remarks=" / ".join(parts_remarks) if parts_remarks else None,
                source="swissport",
            ))

        return weight, pieces, events
