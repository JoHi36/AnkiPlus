#!/bin/bash
# NUCLEAR OPTION: Clear ALL possible caches and force reload
set -e
cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "☢️  NUCLEAR CACHE CLEAR - This will force Anki to reload everything"
echo ""

# 1. Kill Anki
echo "1️⃣  Killing Anki..."
killall "Anki" 2>/dev/null || true
sleep 2

# 2. Clear ALL QWebEngine caches
echo "2️⃣  Clearing ALL QWebEngine caches..."
rm -rf ~/Library/Application\ Support/Anki2/webview/* 2>/dev/null || true
rm -rf ~/Library/Caches/Anki2/webview/* 2>/dev/null || true
rm -rf ~/Library/Caches/net.ankiweb.dtop/* 2>/dev/null || true

# 3. Clear macOS extended attributes (prevents file locking)
echo "3️⃣  Clearing extended attributes..."
xattr -cr web/ 2>/dev/null || true

# 4. Delete OLD web assets completely
echo "4️⃣  Deleting OLD web assets..."
rm -rf web/assets/*.js web/assets/*.css web/index.html 2>/dev/null || true

# 5. Wait to ensure filesystem sync
echo "5️⃣  Waiting for filesystem sync..."
sync
sleep 1

# 6. Copy NEW files
echo "6️⃣  Copying NEW development build..."
cp -fv frontend/dist/index.html web/index.html
cp -fv frontend/dist/assets/main.js web/assets/main.js
cp -fv frontend/dist/assets/main.css web/assets/main.css
cp -fv frontend/dist/assets/*.js web/assets/ 2>/dev/null || true

# 7. Verify checksums
echo ""
echo "7️⃣  Verifying checksums..."
SRC_MD5=$(md5 -q frontend/dist/assets/main.js)
DST_MD5=$(md5 -q web/assets/main.js)
echo "   Source:      $SRC_MD5"
echo "   Destination: $DST_MD5"

if [ "$SRC_MD5" = "$DST_MD5" ]; then
    echo "   ✅ Checksums MATCH"
else
    echo "   ❌ ERROR: Checksums DO NOT MATCH!"
    exit 1
fi

# 8. Verify version marker
echo ""
echo "8️⃣  Verifying version marker..."
if grep -q "DEBUG BUILD VERSION" web/assets/main.js; then
    echo "   ✅ Version marker found in deployed file"
else
    echo "   ❌ ERROR: Version marker NOT found!"
    exit 1
fi

echo ""
echo "☢️  ✅ NUCLEAR CACHE CLEAR COMPLETE!"
echo ""
echo "🚀 NOW:"
echo "   1. Start Anki"
echo "   2. Open the chatbot"
echo "   3. Look for: '🔍🔍🔍 DEBUG BUILD VERSION: 2026-01-10-v4-DEVELOPMENT-MODE'"
echo "   4. If you DON'T see it, press Cmd+R (or Ctrl+R) to force reload the webview"
echo ""



