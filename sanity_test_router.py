
import sys
import os

# Add AWBTrackers to path
sys.path.append(os.path.join(os.getcwd(), "AWBTrackers"))

from AWBTrackers.router import get_airline_from_awb, AWB_PREFIX_TO_AIRLINE

def test_router():
    test_cases = [
        ("01437623036", "elal"),
        ("07966119856", "cargopal"),
        ("11463874650", "elal"),
        ("02021483976", "lufthansa"),
        ("00612345678", "delta"),
    ]
    
    print("Testing AWB Prefix -> Airline Mapping:")
    print("-" * 40)
    all_pass = True
    for awb, expected in test_cases:
        actual = get_airline_from_awb(awb)
        status = "PASS" if actual == expected else "FAIL"
        print(f"AWB: {awb} -> Expected: {expected}, Actual: {actual} | {status}")
        if actual != expected:
            all_pass = False
            
    if all_pass:
        print("\nAll sanity tests PASSED!")
    else:
        print("\nSome sanity tests FAILED!")
        sys.exit(1)

if __name__ == "__main__":
    test_router()
