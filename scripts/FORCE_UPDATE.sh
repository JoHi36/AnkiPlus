#!/bin/bash

# FORCE UPDATE - Kopiert neue Frontend-Dateien mit Überschreibung
# WICHTIG: Anki muss geschlossen sein!

set -e  # Beende bei Fehler

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔄 Force Update - Anki Chatbot Frontend"
echo "========================================"
echo ""

# Prüfe ob Anki läuft
if pgrep -x "Anki" > /dev/null; then
    echo "❌ FEHLER: Anki läuft noch!"
    echo "   Bitte schließen Sie Anki VOLLSTÄNDIG."
    echo ""
    echo "   Zum Schließen:"
    echo "   1. Anki → Quit (Cmd+Q)"
    echo "   2. Warten Sie 5 Sekunden"
    echo "   3. Führen Sie dieses Skript erneut aus"
    exit 1
fi

echo "✅ Anki ist geschlossen"
echo ""

# Prüfe ob dist existiert
if [ ! -f "frontend/dist/assets/main.js" ]; then
    echo "❌ FEHLER: frontend/dist/assets/main.js nicht gefunden!"
    echo "   Bitte führen Sie zuerst aus:"
    echo "   cd frontend && npm run build"
    exit 1
fi

echo "📦 Kopiere Dateien (mit Überschreibung)..."
echo ""

# Lösche alte Attribute (macOS Extended Attributes können Probleme machen)
xattr -c web/assets/main.js 2>/dev/null || true
xattr -c web/assets/main.css 2>/dev/null || true

# Kopiere mit Force (-f)
cp -fv frontend/dist/assets/main.js web/assets/main.js
cp -fv frontend/dist/assets/main.css web/assets/main.css
cp -fv frontend/dist/index.html web/index.html

# Kopiere alle JS-Chunks
echo ""
echo "📦 Kopiere JavaScript-Chunks..."
for file in frontend/dist/assets/*.js; do
    if [ "$file" != "frontend/dist/assets/main.js" ]; then
        filename=$(basename "$file")
        cp -fv "$file" "web/assets/$filename"
    fi
done

echo ""
echo "🔍 Verifiziere Checksummen..."
OLD_MD5=$(md5 -q web/assets/main.js)
NEW_MD5=$(md5 -q frontend/dist/assets/main.js)

if [ "$OLD_MD5" = "$NEW_MD5" ]; then
    echo "✅ SUCCESS: Dateien erfolgreich kopiert!"
    echo "   Checksum: $OLD_MD5"
else
    echo "❌ FEHLER: Checksummen stimmen nicht überein!"
    echo "   web/assets/main.js:           $OLD_MD5"
    echo "   frontend/dist/assets/main.js: $NEW_MD5"
    exit 1
fi

echo ""
echo "✅ Frontend erfolgreich aktualisiert!"
echo ""
echo "Nächste Schritte:"
echo "1. Starten Sie Anki neu"
echo "2. Öffnen Sie das Chatbot-Addon"
echo "3. Die Fehler sollten nun behoben sein"



