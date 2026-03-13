from airlines.common import track_trace_query
import requests
from bs4 import BeautifulSoup

def test_track_trace():
    print("Testing track_trace_query for Delta 006-38686476...")
    url = track_trace_query("006-38686476")
    print(f"URL from track-trace: {url}")
    
    if url:
        print("Fetching direct URL...")
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://www.track-trace.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(url, headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Response length: {len(response.text)}")
        
        soup = BeautifulSoup(response.text, "html.parser")
        print(f"Title: {soup.title.string if soup.title else 'No Title'}")
        
        # Look for events table
        tables = soup.find_all("table")
        print(f"Found {len(tables)} tables")
        
        # Test basic parsing
        from airlines.common import parse_events_from_html_table
        events = parse_events_from_html_table(response.text)
        print(f"Extracted {len(events)} events using common parser.")
        for e in events:
            print(f" - [{e.date}] [{e.status_code}] [{e.location}] {e.remarks} (Flight: {e.flight})")

if __name__ == "__main__":
    test_track_trace()
