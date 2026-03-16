#!/bin/bash

# ULTIMATE FIX - Löscht Cache und kopiert Development-Build
# Gibt uns die vollständige Fehlermeldung!

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔧 ULTIMATE FIX - Anki Chatbot Addon"
echo "====================================="
echo ""
echo "Dieser Fix:"
echo "  1. Beendet Anki (falls läuft)"
echo "  2. Löscht den QWebEngine-Cache"
echo "  3. Kopiert Development-Build (nicht-minified)"
echo "  4. Zeigt vollständige Fehlermeldungen"
echo ""

# Prüfe und beende Anki
if pgrep -x "Anki" > /dev/null; then
    echo "⚠️  Anki läuft noch - beende Anki..."
    killall "Anki" 2>/dev/null || true
    sleep 3
fi

echo "✅ Anki ist gestoppt"
echo ""

# Lösche QWebEngine Cache
echo "🗑️  Lösche QWebEngine-Cache..."
CACHE_DIRS=(
    "$HOME/Library/Caches/Anki2"
    "$HOME/Library/Application Support/Anki2/cache"
    "$HOME/.cache/anki"
)

for dir in "${CACHE_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "   Lösche: $dir"
        rm -rf "$dir" 2>/dev/null || true
    fi
done

echo "✅ Cache gelöscht"
echo ""

# Lösche alte Web-Assets (außer Fonts)
echo "🗑️  Lösche alte JavaScript-Dateien..."
rm -f web/assets/*.js 2>/dev/null || true

echo ""
echo "📦 Kopiere Development-Build (nicht-minified)..."
echo ""

# Lösche Extended Attributes
xattr -cr web/assets/ 2>/dev/null || true

# Kopiere neue Dateien
cp -fv frontend/dist/assets/main.js web/assets/main.js
cp -fv frontend/dist/assets/main.css web/assets/main.css
cp -fv frontend/dist/index.html web/index.html

# Kopiere alle JS-Chunks
for file in frontend/dist/assets/*.js; do
    if [ "$file" != "frontend/dist/assets/main.js" ]; then
        filename=$(basename "$file")
        cp -fv "$file" "web/assets/$filename"
    fi
done

echo ""
echo "🔍 Verifiziere..."
NEW_MD5=$(md5 -q web/assets/main.js)
echo "   main.js Checksum: $NEW_MD5"
FILESIZE=$(ls -lh web/assets/main.js | awk '{print $5}')
echo "   main.js Größe: $FILESIZE"

echo ""
echo "✅ ULTIMATE FIX ABGESCHLOSSEN!"
echo ""
echo "⚡ WICHTIG: Dieser Build ist NICHT minified!"
echo "   Sie sehen jetzt die VOLLSTÄNDIGE Fehlermeldung!"
echo ""
echo "Nächste Schritte:"
echo "1. Starten Sie Anki NEU"
echo "2. Öffnen Sie das Chatbot-Addon"
echo "3. Wenn der Fehler auftritt, kopieren Sie die VOLLSTÄNDIGE Fehlermeldung"
echo "4. Die Fehlermeldung wird jetzt den genauen Ort und Grund zeigen!"



