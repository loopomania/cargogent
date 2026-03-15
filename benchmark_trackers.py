import requests
import time
import json
import os
from concurrent.futures import ThreadPoolExecutor

BASE_URL = os.environ.get("AWBTRACKERS_BASE_URL", "http://localhost:8000")

TEST_CASES = [
    {"airline": "Cathay", "awb": "160-83499253"},
    {"airline": "United", "awb": "016-52822770"},
    {"airline": "El Al", "awb": "114-64169324"},
    {"airline": "Lufthansa", "awb": "020-21483976"},
    {"airline": "Delta", "awb": "006-12345678"},
    {"airline": "PAL", "awb": "079-66119856"},
    {"airline": "AFKLM", "awb": "057-12345678"},
    {"airline": "Ethiopian", "awb": "071-41973620"},
    {"airline": "Challenge", "awb": "700-12345675"},
]

def track_shipment(case):
    airline = case["airline"]
    awb = case["awb"]
    print(f"Tracking {airline} (AWB: {awb})...")
    start_time = time.time()
    try:
        response = requests.get(f"{BASE_URL}/track/{awb}", timeout=120)
        end_time = time.time()
        duration = end_time - start_time
        if response.status_code == 200:
            data = response.json()
            events_count = len(data.get("events", []))
            status = data.get("status", "N/A")
            return {
                "airline": airline,
                "awb": awb,
                "status": status,
                "events_count": events_count,
                "duration": f"{duration:.2f}s",
                "success": True,
                "message": data.get("message", "ok")
            }
        else:
            return {
                "airline": airline,
                "awb": awb,
                "status": "Error",
                "events_count": 0,
                "duration": f"{duration:.2f}s",
                "success": False,
                "message": f"HTTP {response.status_code}"
            }
    except Exception as e:
        end_time = time.time()
        return {
            "airline": airline,
            "awb": awb,
            "status": "Exception",
            "events_count": 0,
            "duration": f"{end_time - start_time:.2f}s",
            "success": False,
            "message": str(e)
        }

def main():
    print("Starting Benchmark for Airline Trackers...")
    print("-" * 60)
    
    results = []
    for case in TEST_CASES:
        results.append(track_shipment(case))
    
    # Save first
    with open("benchmark_results.json", "w") as f:
        json.dump(results, f, indent=4)
    print(f"\nFull results saved to benchmark_results.json")

    print("\nBenchmark Results:")
    print("-" * 110)
    print(f"{'Airline':<15} | {'AWB':<15} | {'Status':<30} | {'Events':<10} | {'Duration':<10} | {'Result':<10}")
    print("-" * 110)
    
    for r in results:
        res_str = "PASS" if r["success"] else "FAIL"
        # Use str() to avoid NoneType formatting issues
        airline = str(r.get("airline", "N/A"))
        awb = str(r.get("awb", "N/A"))
        status = str(r.get("status", "N/A"))[:28]
        events = str(r.get("events_count", 0))
        duration = str(r.get("duration", "N/A"))
        print(f"{airline:<15} | {awb:<15} | {status:<30} | {events:<10} | {duration:<10} | {res_str:<10}")
    
    print("-" * 110)

if __name__ == "__main__":
    main()
