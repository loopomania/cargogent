import requests
import time
import os
import random
from playwright.sync_api import sync_playwright

awb_prefix = "114"
awb_serial = "63884461"
proxy = "wss://brd-customer-hl_547c1a8a-zone-scraping_browser:6mcl83f7k4s7@brd.superproxy.io:9222"

url = f"https://www.elalextra.net/info/awb.asp?aid={awb_prefix}&awb={awb_serial}&Lang=Eng"

with sync_playwright() as p:
    print(f"Connecting to {url}...")
    browser = p.chromium.connect_over_cdp(proxy)
    page = browser.new_page()
    page.goto(url, timeout=60000)
    time.sleep(5)
    page.reload()
    time.sleep(5)
    text = page.evaluate("document.body.innerText")
    html = page.content()
    print("--- TEXT ---")
    print(text)
    print("--- HTML SNIPPET ---")
    print(html[:2000])
    browser.close()
