import requests

def test_track(awb):
    url = "https://www.brcargo.com/NEC_WEB/Tracking/QuickTracking/Index"
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36"
    })
    try:
        resp = session.get(url, timeout=10)
        with open("scratch/brcargo_index.html", "w") as f:
            f.write(resp.text)
        print("GET Status:", resp.status_code)
    except Exception as e:
        print("Error:", e)

test_track("69559552286")
