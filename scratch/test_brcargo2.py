import requests

def test_track(prefix, awb):
    url = "https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/QuickTrackingPartialView"
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest"
    })
    try:
        resp = session.post(url, data={"prefix": prefix, "AWBNo": awb}, timeout=10)
        print("POST Status:", resp.status_code)
        with open("scratch/brcargo_partial.html", "w") as f:
            f.write(resp.text)
    except Exception as e:
        print("Error:", e)

test_track("695", "59552286")
