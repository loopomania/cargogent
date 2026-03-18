#!/usr/bin/env bash
# Quick test that the local stack is reachable. Run after: docker compose up -d
# Usage: ./scripts/test-local.sh [BASE_URL]

set -e

BASE="${1:-https://localhost}"
echo "Testing $BASE ..."

fail() { echo "  [FAIL] $1"; exit 1; }
pass() { echo "  [PASS] $1"; }

# 1. Frontend (root)
if ! curl -kLsf --connect-timeout 3 "$BASE/" > /dev/null; then
  echo "  Cannot reach $BASE. Start the stack: docker compose up -d"
  echo "  Then open http://localhost in the browser (use http, not https)."
  fail "GET $BASE/ (frontend)"
fi
pass "GET $BASE/ (frontend)"

# 2. Backend health
if ! curl -kLsf --connect-timeout 3 "$BASE/api/health" > /dev/null; then
  fail "GET $BASE/api/health"
fi
pass "GET $BASE/api/health"

# 3. Login
RES=$(curl -kLsf --connect-timeout 5 -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alon@cargogent.com","password":"!A2sQWxz!ZX@"}')
if ! echo "$RES" | grep -q '"user"'; then
  fail "POST $BASE/api/auth/login"
fi
pass "POST $BASE/api/auth/login"

echo ""
echo "All checks passed. Open in browser: $BASE"
echo "Use http (not https). From another device use http://<this-machine-ip>"
