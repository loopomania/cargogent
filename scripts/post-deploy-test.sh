#!/usr/bin/env bash
# Post-deployment automated tests: accessibility + AWBTrackers benchmark.
# Usage:
#   ./scripts/post-deploy-test.sh [BASE_URL]
#   or set AWBTRACKERS_BASE_URL (default: http://localhost:80 for Caddy, or http://localhost:8000 direct)
# Examples:
#   ./scripts/post-deploy-test.sh
#   ./scripts/post-deploy-test.sh http://168.119.228.149:8000
#   AWBTRACKERS_BASE_URL=http://my-server.com ./scripts/post-deploy-test.sh

set -e

BASE_URL="${1:-${AWBTRACKERS_BASE_URL:-http://localhost:80}}"
# Strip trailing slash
BASE_URL="${BASE_URL%/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AWBS_DIR="$REPO_ROOT/AWBTrackers"

echo "=============================================="
echo "CargoGent post-deploy tests"
echo "BASE_URL=$BASE_URL"
echo "=============================================="

# --- 1. Accessibility tests ---
echo ""
echo "--- 1. Accessibility ---"

# Health (Caddy or direct AWBTrackers)
if curl -sf --connect-timeout 5 "$BASE_URL/health" > /dev/null; then
  echo "  [PASS] GET $BASE_URL/health"
else
  echo "  [FAIL] GET $BASE_URL/health (connection or non-2xx)"
  exit 1
fi

# Backend API health (when Caddy fronts backend at /api)
if curl -sf --connect-timeout 5 "$BASE_URL/api/health" > /dev/null; then
  echo "  [PASS] GET $BASE_URL/api/health"
else
  echo "  [WARN] GET $BASE_URL/api/health (optional; backend may not be deployed)"
fi

# Track endpoint reachable (quick smoke: one AWB, may return 200 or 403)
TRACK_URL="$BASE_URL/track/elal/11463874650"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$TRACK_URL" || true)
if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "403" ]]; then
  echo "  [PASS] GET $TRACK_URL (HTTP $HTTP_CODE)"
else
  echo "  [WARN] GET $TRACK_URL (HTTP $HTTP_CODE) - track endpoint may be slow or blocked"
fi

# --- 2. AWBTrackers benchmark ---
echo ""
echo "--- 2. AWBTrackers benchmark ---"

if ! command -v python3 &> /dev/null; then
  echo "  [SKIP] python3 not found; install Python to run benchmark"
  exit 0
fi

cd "$AWBS_DIR"
export AWBTRACKERS_BASE_URL="$BASE_URL"
if python3 benchmark_trackers.py; then
  echo "  [PASS] Benchmark completed; see AWBTrackers/benchmark_results.json"
else
  echo "  [FAIL] Benchmark script failed"
  exit 1
fi

echo ""
echo "=============================================="
echo "Post-deploy tests finished successfully"
echo "=============================================="
