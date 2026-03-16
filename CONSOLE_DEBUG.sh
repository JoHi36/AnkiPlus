#!/bin/bash
# Kopiert Console-Debug Version WITH DEVELOPMENT MODE
set -e
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🔍 Installing Console-Debug Version (DEVELOPMENT MODE)..."
if pgrep -x "Anki" > /dev/null; then
    echo "⚠️ Anki is running - killing..."
    killall "Anki" 2>/dev/null || true
    sleep 2
fi

echo "🧹 Clearing QWebEngine cache..."
rm -rf ~/Library/Application\ Support/Anki2/webview/Singleton* 2>/dev/null || true
rm -rf ~/Library/Application\ Support/Anki2/webview/Service\ Worker/ 2>/dev/null || true
rm -rf ~/Library/Application\ Support/Anki2/webview/Cache/ 2>/dev/null || true

echo "🗑️ Deleting old web assets..."
rm -f web/assets/*.js web/assets/*.css 2>/dev/null || true

echo "🏗️ Building frontend in DEVELOPMENT MODE..."
cd frontend
npm run build -- --mode development
cd ..

echo "📦 Copying new files..."
cp -fv frontend/dist/assets/main.js web/assets/main.js
cp -fv frontend/dist/assets/main.css web/assets/main.css
cp -fv frontend/dist/index.html web/index.html
cp -fv frontend/dist/assets/*.js web/assets/ 2>/dev/null || true

echo "✅ Console-Debug Version installed (DEVELOPMENT MODE)!"
echo "🔍 Look for: '🔍🔍🔍 DEBUG BUILD VERSION: 2026-01-10-v4-DEVELOPMENT-MODE' in console"
echo "Start Anki now!"

