#!/usr/bin/env python3
import sys
import os
import asyncio
import json
import requests
import argparse

# Add AWBTrackers to path so we can import router
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.append(os.path.join(REPO_ROOT, "AWBTrackers"))

try:
    from router import route_track_by_awb
except ImportError as e:
    print(f"Error: Could not import router. path={sys.path}")
    print(f"Details: {e}")
    sys.exit(1)

# Default test case
TEST_AWBS = [
    "114-64169324", # El Al
    "016-52822770", # United
    "160-83499253", # Cathay
]

async def check_consistency(awb, base_url):
    print(f"\nChecking consistency for AWB: {awb}")
    
    # 1. Direct Tracker Call
    print("  Fetching directly from tracker...")
    try:
        direct_response = await route_track_by_awb(awb)
        direct_data = direct_response.model_dump()
    except Exception as e:
        print(f"  [ERROR] Direct tracker failed: {e}")
        return False

    # 2. System API Call
    print(f"  Fetching from system API ({base_url})...")
    try:
        api_url = f"{base_url}/track/{awb}"
        api_response = requests.get(api_url, timeout=120)
        if api_response.status_code != 200:
            print(f"  [ERROR] System API returned {api_response.status_code}")
            return False
        system_data = api_response.json()
    except Exception as e:
        print(f"  [ERROR] System API call failed: {e}")
        return False

    # 3. Comparison
    print("  Comparing results...")
    
    # We compare key fields. Raw meta might differ if there are timestamps.
    fields_to_compare = ["airline", "awb", "status", "origin", "destination"]
    mismatches = []
    
    for field in fields_to_compare:
        if direct_data.get(field) != system_data.get(field):
            mismatches.append(f"{field}: direct='{direct_data.get(field)}' vs system='{system_data.get(field)}'")
            
    # Compare events length
    direct_events = direct_data.get("events", [])
    system_events = system_data.get("events", [])
    
    if len(direct_events) != len(system_events):
        mismatches.append(f"events_count: direct={len(direct_events)} vs system={len(system_events)}")
    elif len(direct_events) > 0:
        # Compare first event as a sample
        d_ev = direct_events[0]
        s_ev = system_events[0]
        if d_ev.get("status") != s_ev.get("status") or d_ev.get("date") != s_ev.get("date"):
            mismatches.append("first_event_data_mismatch")

    if mismatches:
        print(f"  [FAIL] Data inconsistency found for {awb}:")
        for m in mismatches:
            print(f"    - {m}")
        return False
    else:
        print(f"  [PASS] Data is consistent for {awb}")
        return True

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://168.119.228.149", help="Base URL of the system")
    parser.add_argument("--awb", help="Alternative AWB to test")
    args = parser.parse_args()

    # Strip trailing slash
    base_url = args.url.rstrip("/")
    
    awbs_to_test = [args.awb] if args.awb else TEST_AWBS
    
    results = []
    for awb in awbs_to_test:
        success = await check_consistency(awb, base_url)
        results.append(success)
        
    print("\n" + "="*40)
    if all(results):
        print("Final Result: ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("Final Result: SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
