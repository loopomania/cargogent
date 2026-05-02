#!/bin/bash

# Deployment script for CargoGent AWBTrackers to Hetzner
# IP: cargogent.com

SERVER_IP="cargogent.com"
SERVER_USER="root"
IMAGE_NAME="cargogent"
CONTAINER_NAME="cargogent_tracker"
PORT=8000

echo "🚀 Starting deployment to ${SERVER_IP}..."

# 1. Check SSH connection
echo "🔍 Checking SSH connection..."
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "exit"
if [ $? -ne 0 ]; then
    echo "❌ Error: Cannot connect to ${SERVER_IP} via SSH."
    echo "💡 Trying to authorize your local key..."
    # Local public key path from user info / earlier research
    PUB_KEY="$HOME/.ssh/id_ed25519.pub"
    if [ -f "$PUB_KEY" ]; then
        # If we have the 'rootPassword' from .env, we can try to copy the ID once if it fails
        SSH_PASS=$(grep "rootPassword" ../.env | cut -d'=' -f2)
        if [ ! -z "$SSH_PASS" ]; then
             echo "🔑 Found password in .env, attempting to install SSH key..."
             sshpass -p "${SSH_PASS}" ssh-copy-id -o StrictHostKeyChecking=no -i "$PUB_KEY" ${SERVER_USER}@${SERVER_IP}
        fi
    fi
    
    # Check again
    ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "exit"
    if [ $? -ne 0 ]; then
        echo "❌ Still cannot connect. Please ensure your key is added to Hetzner."
        exit 1
    fi
fi

# 2. Sync files to server
echo "📁 Preparing remote directory and syncing files..."
ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "mkdir -p /app/AWBTrackers"
rsync -avz -e "ssh -o StrictHostKeyChecking=no" --exclude '__pycache__' --exclude '.git' --exclude 'tc_script_*.js' ../AWBTrackers/ ${SERVER_USER}@${SERVER_IP}:/app/AWBTrackers/
rsync -avz -e "ssh -o StrictHostKeyChecking=no" ../.env ${SERVER_USER}@${SERVER_IP}:/app/AWBTrackers/.env

# 3. Remote execution: Install Docker (if missing) and Run with Docker
echo "🛠️  Running remote deployment commands..."
ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} << 'EOF'
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        echo "🐋 Docker not found. Installing..."
        apt-get update
        apt-get install -y docker.io
        systemctl start docker
        systemctl enable docker
    fi

    cd /app/AWBTrackers

    # Build the image
    echo "🏗️  Building Docker image..."
    docker build -t cargogent .

    echo "Skipping n8n workflow auto-import to preserve manual Active toggles."
#   if [ -d "/app/cargogent/n8n-workflows" ] || [ -d "/app/cargogent/backend/n8n_workflows" ]; then
#     for f in /app/cargogent/n8n-workflows/*.json /app/cargogent/backend/n8n_workflows/*.json; do
#       if [ -f "$f" ]; then
#         echo "Importing $(basename "$f")..."
#         docker cp "$f" cargogent-n8n-1:"/tmp/$(basename "$f")"
#         docker exec -u node cargogent-n8n-1 n8n import:workflow --input="/tmp/$(basename "$f")" || echo "Warning: Workflow import failed for $f"
#       fi
#     done
#   fi

    # Stop and remove existing container if it exists
    if [ "$(docker ps -aq -f name=cargogent_tracker)" ]; then
        echo "🛑 Stopping existing container..."
        docker stop cargogent_tracker
        docker rm cargogent_tracker
    fi

    # Run the container with environment variables from .env
    echo "🚢 Starting container..."
    docker run -d -p 8000:8000 --name cargogent_tracker --env-file .env --restart always cargogent

    echo "✅ Remote deployment complete!"
EOF

echo "🏁 Deployment to ${SERVER_IP} finished!"
echo "📍 Test endpoint: http://${SERVER_IP}:${PORT}/health"

# 4. Run post-deploy tests (accessibility + AWBTrackers benchmark) from local machine
DEPLOYED_URL="http://${SERVER_IP}:${PORT}"
echo ""
echo "🧪 Running post-deploy tests against $DEPLOYED_URL..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -x "$REPO_ROOT/scripts/post-deploy-test.sh" ]; then
  AWBTRACKERS_BASE_URL="$DEPLOYED_URL" "$REPO_ROOT/scripts/post-deploy-test.sh" || {
    echo "⚠️  Post-deploy tests failed; deployment succeeded but verify manually."
    exit 1
  }
else
  echo "⚠️  post-deploy-test.sh not found or not executable; skipping."
fi
