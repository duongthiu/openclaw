#!/bin/bash
# ══════════════════════════════════════════════
# Start OpenClaw Gateway with all .env keys loaded
# Usage: ./scripts/start-gateway.sh
# ══════════════════════════════════════════════

set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
PIPELINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OPENCLAW_DIR="$(cd "$PIPELINE_DIR/../.." && pwd)"

# Load all keys from .env into environment
set -a
source "$PIPELINE_DIR/.env" 2>/dev/null || true
set +a

cd "$OPENCLAW_DIR"

echo "🦞 Starting OpenClaw Gateway..."
echo "   Dashboard: http://127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789}/"
echo "   Keys loaded from: $PIPELINE_DIR/.env"
echo ""

exec node scripts/run-node.mjs gateway run \
  --bind loopback \
  --port "${OPENCLAW_GATEWAY_PORT:-18789}" \
  --force
