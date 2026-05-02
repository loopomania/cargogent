import requests
import json

def test_track(prefix, awb):
    url = "https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/QuickTrackingGet"
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://www.brcargo.com",
        "Referer": "https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/Index"
    })
    
    # We saw these params:
    # prefix: $("#QUTR00Prefix").val(),
    # AWBNo: $("#QUTR00AWBNo").val(),
    # _isRobot: QUTR00isRobot ? "Y" : "N",
    # _verification_code: $("#QUTR00Verification_code").val(),
    # _verification_id: $("#QUTR00Verification_id").val()
    # Let's try sending without robot check first.
    data = {
        "prefix": prefix,
        "AWBNo": awb,
        "_isRobot": "N",
        "_verification_code": "",
        "_verification_id": "8a40e615-b9db-400f-a35d-04bd4f4038fd"
    }
    try:
        resp = session.post(url, data=data, timeout=10)
        print("POST Status:", resp.status_code)
        print("Content:", resp.text)
    except Exception as e:
        print("Error:", e)

test_track("695", "59552286")
