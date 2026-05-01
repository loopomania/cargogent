from __future__ import annotations
import logging
import urllib.request
import urllib.error
import re
import json
from typing import Optional, List, Tuple, Dict, Any

from models import TrackingEvent, TrackingResponse

logger = logging.getLogger(__name__)

# Status Hebrew/English → IATA-ish code + English
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

def _map_status(text: str) -> Tuple[str, str]:
    for pattern, result in _STATUS_MAP:
        if re.search(pattern, text, re.I):
            return result
    return "GND", text or "Ground Processing"

class MamanGroundTracker:
    name = "maman"
    base_url = "https://mamanonline.maman.co.il/Public/{dir_type}/awbstatus"
    
    @staticmethod
    def _clean_date(raw: Any) -> Optional[str]:
        if not raw: return None
        raw_str = str(raw).strip()
        # Format: "17 Apr 26 15:51" or "2026-04-22T09:50:00.000Z"
        if "T" in raw_str and "-" in raw_str:
            return raw_str.split(".")[0].replace("T", " ")
            
        months = {
            "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
            "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
        }
        # Regex for "17 Apr 26 15:51"
        m = re.match(r"(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{2,4})(?:\s+(\d{2}:\d{2}))?", raw_str)
        if m:
            d, mon, y, t = m.groups()
            mm = months.get(mon[:3].capitalize(), "01")
            if len(y) == 2: y = "20" + y
            fmt = f"{y}-{mm}-{d.zfill(2)}"
            if t: fmt += f" {t}"
            return fmt
        return raw_str
    
    @staticmethod
    def _parse_hawb(hawb: str) -> Tuple[Optional[str], Optional[str]]:
        """Extract prefix and serial from a HAWB string like ISR10049167 or MAWB like 00638686476."""
        if not hawb: return None, None
        m = re.match(r"^([a-zA-Z]+)(\d+)$", hawb.strip())
        if m:
            return m.group(1).upper(), m.group(2)
        # Fallback for plain numerics or 11-digit formats if somehow passed:
        digits = "".join(c for c in hawb if c.isdigit())
        if len(digits) >= 11:
            return digits[:3], digits[3:11]
        elif len(digits) > 7:
            return "ISR", digits[-8:]  # assume standard 8 digit serial for Israel ground?
        return None, None

    async def track(self, hawb: str, mawb: str, dir_type: str = "export") -> Tuple[Optional[str], Optional[str], List[TrackingEvent], bool, str]:
        """
        Query Maman ground tracker with forced prioritized fallbacks.
        Returns: (weight, pieces, events, hawb_validated, ground_query_method)
        """
        m_pref, m_short = self._parse_hawb(mawb)
        h_pref, h_short = self._parse_hawb(hawb)
        inner_hawb = str(hawb).strip() if hawb else ""
        digits_m = "".join(c for c in str(mawb) if c.isdigit())
        
        # 1. Primary: Both MAWB + HAWB
        if h_pref and h_short:
            w, p, evs = await self._query_maman(h_short, h_pref, dir_type)
            if w is not None or evs:
                return w, p, evs, True, "mawb_hawb"
                
        # 2. Fallback 1: Only MAWB
        if m_pref and m_short:
            w, p, evs = await self._query_maman(m_short, m_pref, dir_type)
            if w is not None or evs:
                return w, p, evs, False, "only_mawb"
                
        # 3. Fallback 2: Prefix removed from HAWB
        hawb_no_prefix = re.sub(r'^[A-Za-z]+', '', inner_hawb)
        if hawb_no_prefix and hawb_no_prefix != inner_hawb:
            n_pref, n_short = self._parse_hawb(hawb_no_prefix)
            if n_pref and n_short:
                w, p, evs = await self._query_maman(n_short, n_pref, dir_type)
                if w is not None or evs:
                    return w, p, evs, True, "hawb_prefix_removed"
                    
        # 4. Fallback 3: MAWB mirrored into HAWB
        if len(digits_m) > 3:
            w, p, evs = await self._query_maman(digits_m[3:], digits_m[:3], dir_type)
            if w is not None or evs:
                return w, p, evs, False, "mawb_in_hawb"
                
        return None, None, [], False, "failed"

    async def _query_maman(self, short: str, prefix: str, dir_type: str) -> Tuple[Optional[str], Optional[str], List[TrackingEvent]]:
        if not prefix or not short:
            return None, None, []
            
        url = self.base_url.format(dir_type=dir_type) + f"?handler=Search&SHTAR_MITAN_ID_SHORT={short}&SHTAR_MITAN_ID_PREF={prefix}"
        
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        })
        
        try:
            html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8")
        except urllib.error.URLError as e:
            logger.error(f"Maman request URLError: {e}")
            return None, None, []
        except TimeoutError as e:
            logger.error(f"Maman request TimeoutError: {e}")
            return None, None, []
        except Exception as e:
            logger.error(f"Maman request Exception: {e}")
            return None, None, []

            
        weight = None
        pieces = None
        events: List[TrackingEvent] = []
        
        # 1. Parse headerViewModel for pieces and weights
        m_head = re.search(r'value\("headerViewModel",\s*(\{.*?\})\);', html)
        if m_head:
            try:
                data = json.loads(m_head.group(1))
                w = data.get("WGT_TOTAL")
                p = data.get("QTY_TOTAL")
                if w is not None: weight = str(w)
                if p is not None: pieces = str(p)
            except json.JSONDecodeError:
                pass
                
        # 2. Parse awbStatusResultViewModel for Ground Status events
        m_res = re.search(r'value\("awbStatusResultViewModel",\s*(\[.*?\])\);', html)
        if m_res:
            try:
                results = json.loads(m_res.group(1))
                for idx, r in enumerate(results):
                    # Gather interesting metadata
                    remarks_parts = []
                    
                    # Custom clearance
                    custom_cd  = r.get("CUSTOM_CD", "")   # e.g. 'יש' (yes) or 'אין' (no)
                    has_custom = r.get("HAS_CUSTOM")        # boolean or string

                    # Map Hebrew/boolean to English
                    if custom_cd in ("יש", "yes", "Y", "1") or has_custom is True or str(has_custom).lower() in ("true", "1", "yes"):
                        customs_status = "Cleared"
                    elif custom_cd in ("אין", "no", "N", "0") or has_custom is False or str(has_custom).lower() in ("false", "0", "no"):
                        customs_status = "Pending"
                    else:
                        customs_status = None  # unknown

                    if customs_status:
                        remarks_parts.append(f"Customs: {customs_status}")
                        
                    # Storage Type (Special reqs)
                    storage_type = r.get("STORAGE_TYPE")
                    storage_type_eng = r.get("STORAGE_TYPE_DSC_Eng")
                    _STORAGE_HEB = {
                        "רגילה": "Standard", "קירור": "Cold Storage",
                        "מסוכן": "Dangerous Goods", "ערך": "High Value",
                        "חי": "Live Animals", "טעון שמירה": "Security Hold",
                    }
                    storage_label = storage_type_eng or _STORAGE_HEB.get(storage_type, storage_type)
                    if storage_label:
                        remarks_parts.append(f"Storage: {storage_label}")

                        
                    status_raw = r.get("STATUS_DESC_Eng") or r.get("STATUS_DESC") or "Ground Processing"
                    sc, status_eng = _map_status(status_raw)
                    
                    # Flights
                    flt_cod = r.get("AIR_COD_OUT") or ""
                    flt_num = r.get("FLTNO") or ""
                    flt = str(flt_cod) + str(flt_num)
                    if len(flt) > 3:
                        remarks_parts.append(f"Assigned Flight: {flt} @ {r.get('FLTIME_STR')}")
                    
                    date_val = self._clean_date(r.get("RAMPA_DATE") or r.get("WGT_DATE") or r.get("BASE_BILL_DATE"))
                    
                    # Location
                    loc = "TLV (MAMAN)"
                    
                    events.append(TrackingEvent(
                        location=loc,
                        status=status_eng,
                        status_code=sc,
                        date=date_val,
                        pieces=pieces,
                        weight=weight,
                        customs=customs_status,
                        remarks=" / ".join(remarks_parts) if remarks_parts else None,
                        flight=flt if flt else None,
                        source="maman",
                    ))
            except json.JSONDecodeError:
                pass
                
        return weight, pieces, events

