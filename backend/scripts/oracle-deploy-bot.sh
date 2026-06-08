#!/bin/bash
# Run on Oracle Ubuntu VM after cloning artivaa-backend.
# Usage: bash scripts/oracle-deploy-bot.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/artivaa-bot.env"
IMAGE="artivaa-bot:latest"
CONTAINER="artivaa-bot"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy artivaa-bot.env.example and fill values."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed. Run: curl -fsSL https://get.docker.com | sudo sh"
  exit 1
fi

cd "$ROOT"
echo "Building Docker image (may take 15–25 min on ARM)..."
docker build -f Dockerfile.bot -t "$IMAGE" .

docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file "$ENV_FILE" \
  "$IMAGE"

sleep 2
curl -sf "http://127.0.0.1:8000/health" && echo ""
echo "Bot running. Public test: curl http://YOUR_PUBLIC_IP:8000/health"
docker logs --tail 20 "$CONTAINER"
