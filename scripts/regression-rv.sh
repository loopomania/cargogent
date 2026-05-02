#!/usr/bin/env bash
# Regression re-verify (RV): milestone contracts + Cathay merge/parse sanity + prod smoke (optional).
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== RV: milestone contracts (backend) ==="
(cd "$ROOT/backend" && npm run test:milestone)
echo ""
echo "=== RV: Cathay merge + infer (offline, stdlib-only) ==="
python3 "$ROOT/AWBTrackers/airlines/cathay_merge.py"

echo ""
echo "=== RV: DHL Aviation table parse (html.parser fixture) ==="
python3 <<'RV_DHL_PY'
# Mirrors AWBTrackers/airlines/dhl_aviation.py helpers (keep in sync when changing DHL scrape).
import re
from bs4 import BeautifulSoup

_REMARK_HIDE_SHOW_CONTENT = re.compile(r"\s*\+\s*Show\s+content\b.*$", re.IGNORECASE)
_WEEKDAY_HEADER = re.compile(
    r"^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s",
    re.IGNORECASE,
)

def clean(remarks_td):
    for hidden in remarks_td.find_all(style=re.compile(r"display:\s*none")):
        hidden.decompose()
    for btn in remarks_td.find_all("button"):
        btn.decompose()
    text = remarks_td.get_text(separator=" ", strip=True)
    return _REMARK_HIDE_SHOW_CONTENT.sub("", text).strip()

def norm(raw_code, remarks):
    code = (raw_code or "").strip().upper()
    rem_l = (remarks or "").strip().lower()
    if code == "FFM":
        return "MAN"
    if not code and "scheduled for movement" in rem_l:
        return "SFM"
    return code

_HTML = '''<div id="tracking-results"><div class="tab-pane" id="tabcontent-1">
<table class="table tracking-summary"><tr><td>x</td><td>Waybill</td><td>Fri x</td></tr></table>
<table class="table tracking-results">
<tr><th colspan="2">Saturday, April 25, 2026</th><th>Qty</th><th>Loc</th><th>Fac</th><th>Time</th></tr>
<tr><td>FFM</td><td>Manifested onto movement K4248 to LEJ <button>b</button></td><td>1 pcs</td><td>TLV</td><td>GTW</td><td>12:21</td></tr>
<tr><td></td><td>Scheduled for Movement</td><td>1 pcs</td><td>LEJ</td><td>HUB</td><td>05:42</td></tr>
</table></div></div>'''

soup = BeautifulSoup(_HTML, "html.parser")
rd = soup.find(id="tracking-results")
tbl = rd.find("table", class_="tracking-results")
rows = tbl.find_all("tr")
dt = ""
out = []
for r in rows:
    th = r.find("th")
    colspan_ok = str(th.get("colspan")) == "2" if th else False
    dt_guess = th.get_text(strip=True) if th else ""
    if th and (colspan_ok or _WEEKDAY_HEADER.match(dt_guess)):
        dt = dt_guess.split("\n")[0].strip()
        continue
    tds = r.find_all("td")
    if len(tds) >= 6:
        raw = tds[0].get_text(strip=True)
        rem = clean(tds[1])
        code = norm(raw, rem)
        out.append((code, rem, dt + " " + tds[5].get_text(strip=True)))
assert len(out) == 2, out
assert out[0][0] == "MAN" and "K4248" in out[0][1]
assert out[1][0] == "SFM"
print("dhl_fixture_ok")
RV_DHL_PY
python3 -m py_compile "$ROOT/AWBTrackers/airlines/dhl_aviation.py"

BASE_URL="${1:-${RV_BASE_URL}}"
if [[ -n "$BASE_URL" ]]; then
  echo ""
  echo "=== RV: post-deploy smoke ($BASE_URL) ==="
  AWBTRACKERS_BASE_URL="$BASE_URL" "$ROOT/scripts/post-deploy-test.sh"
fi

echo ""
echo "=== Regression RV finished OK ==="
