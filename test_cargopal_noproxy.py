import requests

def test_cargopal():
    source_url = "https://cargo.pal.com.ph/Services/Shipment/AWBTrackingService.svc/GetAWBTrackingRecord?AWBNo=50741110&BasedOn=0&AccountSNo=0&flag=0&CarrierCode=079&AWBTrackingCaptchaCode="
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://cargo.pal.com.ph/Tracking/AWB",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
    }
    
    resp = requests.get(source_url, headers=headers, verify=False, timeout=10)
    print("Status code:", resp.status_code)
    print("Length:", len(resp.text))

test_cargopal()
