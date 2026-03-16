#!/bin/bash

# Update-Skript für das Anki Chatbot Addon Frontend
# Dieses Skript kopiert die neu gebauten Dateien in den web-Ordner

echo "🔄 Anki Chatbot Addon - Frontend Update"
echo "========================================"
echo ""

# Prüfe ob Anki läuft
if pgrep -x "Anki" > /dev/null; then
    echo "⚠️  WARNUNG: Anki läuft noch!"
    echo "   Bitte schließen Sie Anki vollständig, bevor Sie fortfahren."
    echo ""
    read -p "Anki schließen und Enter drücken zum Fortfahren (oder Ctrl+C zum Abbrechen)... "
fi

# Pfade
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIST_DIR="$SCRIPT_DIR/frontend/dist"
WEB_DIR="$SCRIPT_DIR/web"

# Prüfe ob dist-Verzeichnis existiert
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ Fehler: dist-Verzeichnis nicht gefunden!"
    echo "   Bitte führen Sie zuerst 'cd frontend && npm run build' aus."
    exit 1
fi

# Prüfe ob web-Verzeichnis existiert
if [ ! -d "$WEB_DIR" ]; then
    echo "❌ Fehler: web-Verzeichnis nicht gefunden!"
    exit 1
fi

echo "📦 Kopiere neue Dateien..."
echo ""

# Kopiere nur die JavaScript und CSS Dateien (nicht die Fonts, die sind schon da)
cp -v "$DIST_DIR/assets/main.js" "$WEB_DIR/assets/main.js"
cp -v "$DIST_DIR/assets/main.css" "$WEB_DIR/assets/main.css"
cp -v "$DIST_DIR/index.html" "$WEB_DIR/index.html"

# Kopiere alle anderen JS-Dateien (Chunks)
echo ""
echo "📦 Kopiere JavaScript-Chunks..."
find "$DIST_DIR/assets" -name "*.js" ! -name "main.js" -exec cp -v {} "$WEB_DIR/assets/" \;

echo ""
echo "✅ Frontend erfolgreich aktualisiert!"
echo ""
echo "Sie können Anki jetzt wieder starten."
echo "Die Fehler sollten nun behoben sein."



