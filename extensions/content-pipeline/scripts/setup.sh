#!/bin/bash
# ══════════════════════════════════════════════
# Content Pipeline — Fresh Device Setup
# Run this after cloning on a new device:
#   cd extensions/content-pipeline && ./scripts/setup.sh
# ══════════════════════════════════════════════

set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  Content Pipeline Setup"
echo "═══════════════════════════════════════════"
echo ""

PIPELINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PIPELINE_DIR"

# ── Step 1: Create .env from template ──
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo "   ⚠️  IMPORTANT: Edit .env and fill in your API keys!"
  echo ""
else
  echo "✓ .env already exists"
fi

# ── Step 2: Install Node dependencies ──
echo ""
echo "📦 Installing Node dependencies..."
npm install 2>&1 | tail -3

# ── Step 3: Install Python dependencies ──
echo ""
echo "🐍 Installing Python dependencies..."
pip3 install edge-tts kokoro-onnx soundfile whisperx 2>&1 | tail -3 || echo "  ⚠️ Some Python deps failed — install manually"

# ── Step 4: Install system tools ──
echo ""
echo "🔧 Checking system tools..."

if command -v ffmpeg &>/dev/null; then
  echo "  ✓ ffmpeg installed"
else
  echo "  ⚠️ ffmpeg not found — install with: brew install ffmpeg"
fi

if command -v edge-tts &>/dev/null; then
  echo "  ✓ edge-tts installed"
else
  echo "  ⚠️ edge-tts not found — install with: pip3 install edge-tts"
fi

# ── Step 5: Install Playwright browsers ──
echo ""
echo "🌐 Installing Playwright Chromium..."
npx playwright install chromium 2>&1 | tail -2 || echo "  ⚠️ Playwright install failed"

# ── Step 6: Create openclaw directories ──
echo ""
echo "📁 Creating config directories..."
mkdir -p ~/.openclaw/models
mkdir -p ~/.openclaw/content-pipeline

# ── Step 7: Show what needs manual setup ──
echo ""
echo "═══════════════════════════════════════════"
echo "  Setup Complete! Manual steps remaining:"
echo "═══════════════════════════════════════════"
echo ""
echo "1. Edit .env with your API keys:"
echo "   nano $PIPELINE_DIR/.env"
echo ""
echo "   Required keys:"
echo "   - GOOGLE_AI_API_KEY    (https://aistudio.google.com/apikey)"
echo "   - GROQ_API_KEY         (https://console.groq.com)"
echo "   - DISCORD_BOT_TOKEN    (https://discord.com/developers)"
echo ""
echo "   Optional keys:"
echo "   - OPENROUTER_API_KEY   (https://openrouter.ai)"
echo "   - CEREBRAS_API_KEY     (https://cloud.cerebras.ai)"
echo "   - MISTRAL_API_KEY      (https://console.mistral.ai)"
echo "   - YOUTUBE_CLIENT_ID    (Google Cloud Console)"
echo "   - YOUTUBE_CLIENT_SECRET"
echo "   - FACEBOOK_PAGE_ID"
echo "   - FACEBOOK_PAGE_ACCESS_TOKEN"
echo "   - R2_ACCOUNT_ID        (Cloudflare dashboard)"
echo "   - R2_ACCESS_KEY_ID"
echo "   - R2_SECRET_ACCESS_KEY"
echo ""
echo "2. Set up openclaw gateway (if not done):"
echo "   cd $(dirname $PIPELINE_DIR)/.. && pnpm install && pnpm build"
echo "   pnpm openclaw config set gateway.mode local"
echo "   pnpm openclaw gateway run --bind loopback --port 18789 --force"
echo ""
echo "3. Test the pipeline:"
echo "   npx tsx src/cli.ts preview"
echo "   npx tsx src/cli.ts run news --skip-upload"
echo ""
