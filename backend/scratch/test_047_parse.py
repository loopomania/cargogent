import json

data = {
  "Awb": {
    "AwbOrigin": "TLV",
    "AwbDestination": "CMN",
    "Segments": {
      "Segment": [
        {
          "@sequence": "1",
          "Origin": "TLV",
          "Dest": "LIS",
          "FlightNum": "LY375",
          "Status": "Booked",
          "EventDate": "23APR26",
          "EventTime": "11:04",
          "StatusCode": "KK"
        },
        {
          "@sequence": "10",
          "Origin": "LIS",
          "Dest": "CMN",
          "FlightNum": "LY",
          "Status": "Transferred to another Airline",
          "EventDate": "26APR26",
          "EventTime": "22:51",
          "StatusCode": "TFD"
        },
        {
          "@sequence": "17",
          "Origin": "LIS",
          "Dest": "CMN",
          "FlightNum": "TP1436",
          "Status": "Planned For Flight",
          "EventDate": "27APR26",
          "EventTime": "09:00",
          "StatusCode": ""
        }
      ]
    },
    "Routing": {
      "line": [
        {"FlightNum": "LY375", "FlightDate": "26APR26", "FlightOrigin": "TLV", "FlightDest": "LIS"},
        {"FlightNum": "TP1436", "FlightDate": "29APR26", "FlightOrigin": "LIS", "FlightDest": "CMN"}
      ]
    }
  }
}

# TAP Status Mapping
TAP_STATUS_MAP = {
    "BKD": "Booking Confirmed",
    "KK": "Booking Confirmed", # Added KK
    "RCS": "Received from Shipper",
    "MAN": "Manifested",
    "DEP": "Departed",
    "ARR": "Arrived",
    "RCF": "Received from Flight",
    "NFD": "Consignee Notified",
    "DLV": "Delivered",
    "CCD": "Customs Released",
    "CRC": "Customs Communicated",
    "DIS": "Discrepancy",
    "FOH": "Freight On Hand",
    "RCT": "Received from Other Airline",
    "TRM": "Transferring to Other Airline",
    "TFD": "Transferred to Other Airline",
    "AWD": "Documents Delivered",
}

events = []
segments = data["Awb"]["Segments"]["Segment"]
for seg in segments:
    status_code = seg.get("StatusCode", "").strip()
    status_desc = seg.get("Status", "").strip()
    
    if not status_code:
        if status_desc == "Planned For Flight":
            status_code = "BKD"
        else:
            continue
            
    if status_code == "KK":
        status_code = "BKD"
        
    mapped_status = TAP_STATUS_MAP.get(status_code, status_desc or "Unknown")
    
    events.append({
        "status_code": status_code,
        "status": mapped_status,
        "location": seg.get("Origin", ""),
        "flight": seg.get("FlightNum", "")
    })

print(json.dumps(events, indent=2))
