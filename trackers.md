# Airline Tracker Implementations

This document details the technical strategy and key components for each airline tracker in the CargoGent suite.

## Core Architecture
All trackers inherit from the `AirlineTracker` base class, which provides a unified interface for the `router.py` layer.

### Key Shared Components:
- **undetected-chromedriver (UC)**: Used to bypass modern bot detection (Akamai, DataDome, Reblaze).
- **Xvfb (Virtual Framebuffer)**: Enables running "headful" browsers in a headless Docker environment, which is critical for bypassing Akamai.
- **Selective Proxying**: Managed in `router.py`. Only "Hard" trackers route through the IPRoyal residential proxy to minimize latency.

---

## Tracker Details

| Airline | Technical Strategy | Key Components |
| :--- | :--- | :--- |
| **El Al** | Legacy ASP Scraping | `UC`, Residential Proxy, Session management for legacy ASP.NET pages. |
| **Delta** | Akamai Bypass | `UC`, Non-headless mode on Xvfb, Residential Proxy, multi-line text parsing. |
| **PAL Cargo** | JSON API Interception | `curl_cffi` (impersonates browser TLS), Residential Proxy, double-JSON decoding. |
| **Lufthansa** | Shadow DOM Extraction | `UC`, Custom JavaScript injection to extract text from React/Shadow DOM components. |
| **AFKLM** | Angular Render Scraping | `UC`, Custom `getAllText` JS helper that traverses Shadow Roots and Flex layouts. |
| **United** | DOM Selector Parsing | `UC`, Automated expansion of "Movement Details" section, CSS selector extraction. |
| **Ethiopian** | History List Scraping | `UC`, Regex-based text processing of timeline events. |
| **Challenge** | Structured Row Extraction | `UC`, JavaScript-based row-to-JSON mapping for custom tracking tables. |
| **Cathay** | Multi-Line Text Rendering | `UC`, Non-headless on Xvfb, recursive DOM text flattening for React layouts. |

---

## Strategy Breakdown

### 1. Browser Steering (UC + Xvfb)
Most modern airline sites (Delta, AFKLM, United) use Akamai or custom React/Angular frontends. We use `undetected-chromedriver` to appear like a real user. By setting `headless=False` but providing a virtual display (DISPLAY=:99), we bypass JS-based headless detection.

### 2. Residential Proxying (IPRoyal)
Airlines like El Al and PAL block traffic from datacenter IPs (Hetzner, AWS). We use the `PROXY_URL` provided by IPRoyal to route these requests through residential home connections.

### 3. Text-First Extraction
When CSS selectors are unstable (due to React/Angular class mangling), we use custom JavaScript helpers to flatten the `document.body.innerText` while preserving line breaks, followed by regex parsing for dates and flight numbers.
