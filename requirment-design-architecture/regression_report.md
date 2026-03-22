# Regression Testing Report

Generated on: 2026-03-17 12:25:46

| Airline | AWB | System Status | Events | Browser Status | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| AFKLM | 057-03264111 | NFD | 6 | ERROR: Target page, context or browser has been closed | ❌ FAIL |
| Cathay | 160-83499312 | ERROR: HTTPConnectionPool(host='localhost', port=8000): Read timed out. (read timeout=60) | 0 | ERROR: Target page, context or browser has been closed | ❌ FAIL |
| Delta | 006-96300027 | ERROR: HTTP 403 | 0 | ERROR: Target page, context or browser has been closed | ❌ FAIL |
| El Al | 114-23175913 | ERROR: HTTPConnectionPool(host='localhost', port=8000): Read timed out. (read timeout=60) | 0 | Loaded | ❌ FAIL |
| Ethiopian | 071-59799423 | In Transit | 0 | Loaded | ❌ FAIL |
| United | 016-56472850 | DLV | 25 | ERROR: Target page, context or browser has been closed | ❌ FAIL |
| Lufthansa | 020-22253700 | NFD | 10 | ERROR: Target page, context or browser has been closed | ❌ FAIL |
| CargoPal | 079-50741328 | None | 0 | Loaded | ❌ FAIL |
| Challenge | 700-14103305 | Arrived | 2 | Loaded | ✅ PASS |


## Detailed Discrepancies

### AFKLM (057-03264111)
- **Browser Error**: Target page, context or browser has been closed

### Cathay (160-83499312)
- **System Error**: HTTPConnectionPool(host='localhost', port=8000): Read timed out. (read timeout=60)
- **Browser Error**: Target page, context or browser has been closed
- **System Issue**: No events found. Message: None

### Delta (006-96300027)
- **System Error**: HTTP 403
- **Browser Error**: Target page, context or browser has been closed
- **System Issue**: No events found. Message: {"detail":"Delta tracking failed: net::ERR_PROXY_AUTH_UNSUPPORTED at https://www.deltacargo.com/Cargo/trackShipment?awbNumber=00696300027"}

### El Al (114-23175913)
- **System Error**: HTTPConnectionPool(host='localhost', port=8000): Read timed out. (read timeout=60)
- **System Issue**: No events found. Message: None

### Ethiopian (071-59799423)
- **System Issue**: No events found. Message: ok

### United (016-56472850)
- **Browser Error**: Target page, context or browser has been closed

### Lufthansa (020-22253700)
- **Browser Error**: Target page, context or browser has been closed

### CargoPal (079-50741328)
- **System Issue**: No events found. Message: Success

