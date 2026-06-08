#!/bin/bash
# Start Artivaa bot on Mac (local). Run tunnel separately: ngrok http 8000
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../python-services/ai-processing-service/legacy-bot" && pwd)"
ENV_FILE="$ROOT/.env"

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Create $ENV_FILE first (copy .env.example, set DATABASE_URL + GEMINI_API_KEY)."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Running npm install..."
  npm install
fi

if ! npx playwright --version >/dev/null 2>&1; then
  echo "Installing Playwright Chromium..."
  npx playwright install chromium
fi

echo "Starting bot on http://localhost:8000"
echo "Next: new terminal → ngrok http 8000 → update Render BOT_BASE_URL"
exec node index.js
