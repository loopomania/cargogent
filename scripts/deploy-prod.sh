#!/usr/bin/env bash
# Deploy CargoGent full stack to Hetzner (production: Neon DB, no local Postgres).
# Usage: ./scripts/deploy-prod.sh
# Requires: .env with DATABASE_URL (Neon), ADMIN_EMAIL, ADMIN_PASSWORD_HASH, etc. See .env.prod.example.

set -e

SERVER_IP="${CARGOGENT_SERVER_IP:-168.119.228.149}"
SERVER_USER="${CARGOGENT_SERVER_USER:-root}"
APP_DIR="/app/cargogent"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Deploying CargoGent (prod) to ${SERVER_IP}..."

# 1. SSH check
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "exit" 2>/dev/null; then
  echo "Cannot connect to ${SERVER_IP}. Trying ssh-copy-id..."
  PUB_KEY="$HOME/.ssh/id_ed25519.pub"
  if [ -f "$PUB_KEY" ]; then
    SSH_PASS=$(grep "^rootPassword=" "$REPO_ROOT/.env" 2>/dev/null | cut -d'=' -f2-)
    if [ -n "$SSH_PASS" ] && command -v sshpass &>/dev/null; then
      sshpass -p "$SSH_PASS" ssh-copy-id -o StrictHostKeyChecking=no -i "$PUB_KEY" "${SERVER_USER}@${SERVER_IP}"
    fi
  fi
  if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "exit"; then
    echo "SSH failed. Add your key to Hetzner or set rootPassword in .env."
    exit 1
  fi
fi

# 2. Sync repo (exclude dev-only)
echo "Syncing files to ${APP_DIR}..."
ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "mkdir -p $APP_DIR"
rsync -avz -e "ssh -o StrictHostKeyChecking=no" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '__pycache__' \
  --exclude 'dist' \
  --exclude 'tc_script_*.js' \
  --exclude '*.pyc' \
  "$REPO_ROOT/" "${SERVER_USER}@${SERVER_IP}:${APP_DIR}/"

# 3. Check for .env on server
echo "Checking for .env on server..."
ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "[ -f ${APP_DIR}/.env ]" || {
  if [ -f "$REPO_ROOT/.env.prod.example" ]; then
    echo "Warning: .env not found on server. Copying .env.prod.example to .env..."
    rsync -avz -e "ssh -o StrictHostKeyChecking=no" "$REPO_ROOT/.env.prod.example" "${SERVER_USER}@${SERVER_IP}:${APP_DIR}/.env"
    echo "IMPORTANT: You must SSH into the server and edit ${APP_DIR}/.env with your DATABASE_URL, ADMIN_EMAIL, and ADMIN_PASSWORD_HASH before the app will work!"
  else
    echo "Warning: .env not found on server and .env.prod.example missing locally."
  fi
}

# 4. Ensure Docker Compose on server, then up
echo "Building and starting containers..."
ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_IP}" "bash -s" << 'REMOTE'
  set -e
  cd /app/cargogent
  # Prefer plugin; fallback to standalone docker-compose; install if missing
  if docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    echo "Installing docker-compose..."
    curl -sL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    COMPOSE_CMD="docker-compose"
  fi
  $COMPOSE_CMD -f docker-compose.prod.yml up -d --build
  
  echo "Running database migrations..."
  sleep 5
  docker cp backend/migrations/001_tenants.sql cargogent-postgres-1:/tmp/001.sql || true
  docker cp backend/migrations/002_users.sql cargogent-postgres-1:/tmp/002.sql || true
  docker exec cargogent-postgres-1 psql -U cargogent -d cargogent -f /tmp/001.sql || true
  docker exec cargogent-postgres-1 psql -U cargogent -d cargogent -f /tmp/002.sql || true
  
  # Update admin password explicitly in case the migration created it with the old default
  docker exec cargogent-postgres-1 psql -U cargogent -d cargogent -c "UPDATE users SET password_hash = '\$2b\$10\$cFwIUBPGFAPjTlMN02W.cOpvdm6.Rij/mKFCLNGwKmjv7mvWZ/NvW' WHERE username = 'alon@cargogent.com';" || true

REMOTE

echo "Done. App: http://${SERVER_IP}/"
echo "Health: http://${SERVER_IP}/health  |  Backend: http://${SERVER_IP}/api/health"
echo "n8n:    http://${SERVER_IP}/n8n"

# 5. Optional: run post-deploy tests (set RUN_PROD_TESTS=1 to enable)
if [ -n "${RUN_PROD_TESTS}" ] && [ -x "$REPO_ROOT/scripts/post-deploy-test.sh" ]; then
  echo "Running post-deploy tests..."
  AWBTRACKERS_BASE_URL="http://${SERVER_IP}" "$REPO_ROOT/scripts/post-deploy-test.sh" || true
fi
