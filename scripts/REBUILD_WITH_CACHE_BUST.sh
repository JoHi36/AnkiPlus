#!/bin/bash
# Rebuild with cache-busting timestamp
set -e
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🔨 Rebuilding with cache-busting..."

# Kill Anki
echo "1️⃣  Killing Anki..."
killall "Anki" 2>/dev/null || true
sleep 2

# Clear caches
echo "2️⃣  Clearing caches..."
rm -rf ~/Library/Application\ Support/Anki2/webview/* 2>/dev/null || true
rm -rf ~/Library/Caches/Anki2/webview/* 2>/dev/null || true

# Build with NODE_ENV=development to force React development build
echo "3️⃣  Building frontend in DEVELOPMENT mode..."
cd frontend
NODE_ENV=development npm run build -- --mode development
cd ..

# Get timestamp for cache busting
TIMESTAMP=$(date +%s)
echo "4️⃣  Cache-bust timestamp: $TIMESTAMP"

# Modify index.html to add cache-busting parameter
echo "5️⃣  Adding cache-busting to HTML..."
sed -i.bak "s|src=\"\./assets/main\.js\"|src=\"./assets/main.js?v=$TIMESTAMP\"|g" frontend/dist/index.html
sed -i.bak "s|href=\"\./assets/main\.css\"|href=\"./assets/main.css?v=$TIMESTAMP\"|g" frontend/dist/index.html

# Delete old web assets
echo "6️⃣  Deleting old web assets..."
rm -rf web/assets/*.js web/assets/*.css web/index.html 2>/dev/null || true

# Copy new files
echo "7️⃣  Copying new files..."
cp -fv frontend/dist/index.html web/index.html
cp -fv frontend/dist/assets/main.js web/assets/main.js
cp -fv frontend/dist/assets/main.css web/assets/main.css
cp -fv frontend/dist/assets/*.js web/assets/ 2>/dev/null || true

# Verify
echo "8️⃣  Verifying..."
if grep -q "v=$TIMESTAMP" web/index.html; then
    echo "   ✅ Cache-busting parameter found: v=$TIMESTAMP"
else
    echo "   ❌ ERROR: Cache-busting parameter NOT found!"
    exit 1
fi

if grep -q "DEBUG BUILD VERSION" web/assets/main.js; then
    echo "   ✅ Version marker found"
else
    echo "   ❌ ERROR: Version marker NOT found!"
    exit 1
fi

echo ""
echo "✅ Build complete with cache-busting!"
echo "🔍 Look for: '🔍🔍🔍 DEBUG BUILD VERSION: 2026-01-10-v4-DEVELOPMENT-MODE'"
echo ""
echo "Start Anki now!"

