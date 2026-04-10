#!/bin/bash
# Launch Anki with Chromium remote debugging enabled.
#
# Usage:
#   ./scripts/DEBUG_ANKI.sh          # default port 8888
#   ./scripts/DEBUG_ANKI.sh 9222     # custom port
#
# Then open http://localhost:<PORT> in Chrome/Arc/Edge and click the
# AnkiPlus page to get full DevTools (Elements, Console, Network, Sources).
# Safari does NOT work — only Chromium-based browsers can connect.
#
# Keep this Terminal window open while debugging. Closing it kills Anki.

set -e

PORT="${1:-8888}"
ANKI_BIN="/Applications/Anki.app/Contents/MacOS/launcher"

if [ ! -x "$ANKI_BIN" ]; then
    echo "❌ Anki launcher not found at: $ANKI_BIN"
    echo "   Is Anki installed in /Applications?"
    exit 1
fi

if pgrep -x "Anki" > /dev/null || pgrep -f "Anki.app" > /dev/null; then
    echo "⚠️  Anki is already running — quitting it first..."
    osascript -e 'tell application "Anki" to quit' 2>/dev/null || true
    sleep 2
    # Force kill if it didn't quit cleanly
    pkill -f "Anki.app" 2>/dev/null || true
    sleep 1
fi

echo "🐛 Launching Anki with remote debugging on port $PORT..."
echo "   → Open http://localhost:$PORT in Chrome after Anki loads"
echo "   → Keep this Terminal window open while debugging"
echo ""

export QTWEBENGINE_REMOTE_DEBUGGING="$PORT"
exec "$ANKI_BIN"
