#!/usr/bin/env bash
# Deploy CargoGent full stack to Hetzner (production: Neon DB, no local Postgres).
# Usage: ./scripts/deploy-prod.sh
# Requires: .env with DATABASE_URL (Neon), ADMIN_EMAIL, ADMIN_PASSWORD_HASH, etc. See .env.prod.example.

set -e

SERVER_IP="${CARGOGENT_SERVER_IP:-cargogent.com}"
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
    SSH_PASS=$(grep "^rootPassword=" "$REPO_ROOT/.env-prod" 2>/dev/null | cut -d'=' -f2-)
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

# 3. Sync .env-prod to server (always, to pick up new keys)
echo "Syncing .env-prod to server..."
if [ -f "$REPO_ROOT/.env-prod" ]; then
  rsync -avz -e "ssh -o StrictHostKeyChecking=no" "$REPO_ROOT/.env-prod" "${SERVER_USER}@${SERVER_IP}:${APP_DIR}/.env-prod"
else
  echo "Warning: .env-prod not found locally — skipping sync."
fi

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
  DB_URL=$(grep '^DATABASE_URL=' /app/cargogent/.env-prod 2>/dev/null | cut -d'=' -f2-)
  ADMIN_EMAIL=$(grep '^ADMIN_EMAIL=' /app/cargogent/.env-prod 2>/dev/null | cut -d'=' -f2-)
  ADMIN_HASH=$(grep '^ADMIN_PASSWORD_HASH=' /app/cargogent/.env-prod 2>/dev/null | sed "s/^ADMIN_PASSWORD_HASH=//;s/^'//;s/'$//")
  if [ -n "$DB_URL" ]; then
    docker run --rm \
      -v /app/cargogent/backend/migrations:/migrations \
      -e "DATABASE_URL=$DB_URL" \
      postgres:16-alpine sh -c \
      'psql "$DATABASE_URL" -f /migrations/001_tenants.sql && psql "$DATABASE_URL" -f /migrations/002_users.sql && psql "$DATABASE_URL" -f /migrations/003_query_logs.sql && psql "$DATABASE_URL" -f /migrations/004_add_user_name.sql && psql "$DATABASE_URL" -f /migrations/005_add_is_protected.sql && psql "$DATABASE_URL" -f /migrations/006_customer_settings_and_awb_attention.sql && psql "$DATABASE_URL" -f /migrations/006_hawb_mawb_lines.sql && psql "$DATABASE_URL" -f /migrations/007_ingest_query_rework.sql && psql "$DATABASE_URL" -f /migrations/008_active_queries.sql && psql "$DATABASE_URL" -f /migrations/009_query_schedule_domain.sql && psql "$DATABASE_URL" -f /migrations/010_leg_status_domain.sql && psql "$DATABASE_URL" -f /migrations/011_query_notifications_schema.sql && psql "$DATABASE_URL" -f /migrations/012_dynamic_intervals_and_errors.sql && psql "$DATABASE_URL" -f /migrations/013_fix_leg_status_hash.sql && psql "$DATABASE_URL" -f /migrations/014_excel_sender.sql && psql "$DATABASE_URL" -f /migrations/015_add_error_log_detail.sql && psql "$DATABASE_URL" -f /migrations/016_backfill_domain_name.sql' \
      && echo "Migrations applied." || echo "Warning: Some migrations may have failed (idempotent — check logs)."

    # Sync admin credentials from .env into DB on every deploy (migration uses ON CONFLICT DO NOTHING)
    if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_HASH" ]; then
      echo "Syncing admin credentials from .env into DB..."
      docker run --rm postgres:16-alpine psql "$DB_URL" -c \
        "UPDATE users SET password_hash = '${ADMIN_HASH}' WHERE username = '${ADMIN_EMAIL}';" \
        && echo "Admin credentials synced." || echo "Warning: Admin credential sync failed."
    fi
  else
    echo "Warning: DATABASE_URL not found in .env — skipping migrations."
  fi

  echo "Skipping n8n workflow auto-import to preserve manual Active toggles."
#   if [ -d "/app/cargogent/n8n-workflows" ] || [ -d "/app/cargogent/backend/n8n_workflows" ]; then
#     for f in /app/cargogent/n8n-workflows/*.json /app/cargogent/backend/n8n_workflows/*.json; do
#       if [ -f "$f" ]; then
#         echo "Importing $(basename "$f")..."
#         docker cp "$f" cargogent-n8n-1:"/tmp/$(basename "$f")"
#         docker exec cargogent-n8n-1 n8n import:workflow --input="/tmp/$(basename "$f")" || echo "Warning: Workflow import failed for $f"
#       fi
#     done
#   fi

REMOTE

echo "Done. App: http://${SERVER_IP}/"
echo "Health: http://${SERVER_IP}/health  |  Backend: http://${SERVER_IP}/api/health"
echo "n8n:    http://${SERVER_IP}/n8n"

# 5. Optional: run post-deploy tests (set RUN_PROD_TESTS=1 to enable)
if [ -n "${RUN_PROD_TESTS}" ] && [ -x "$REPO_ROOT/scripts/post-deploy-test.sh" ]; then
  echo "Running post-deploy tests..."
  AWBTRACKERS_BASE_URL="http://${SERVER_IP}" "$REPO_ROOT/scripts/post-deploy-test.sh" || true
fi
