#!/bin/bash

# Deploy-Skript für das Anki Chatbot Addon
# Erstellt ein .ankiaddon Paket mit allen notwendigen Dateien

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0] }" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🚀 Anki Chatbot Addon - Deployment"
echo "===================================="
echo ""

# Prüfe ob Anki läuft
if pgrep -x "Anki" > /dev/null; then
    echo "⚠️  WARNUNG: Anki läuft noch!"
    echo "   Bitte schließen Sie Anki vollständig, bevor Sie fortfahren."
    echo ""
    read -p "Anki schließen und Enter drücken zum Fortfahren (oder Ctrl+C zum Abbrechen)... "
fi

# Lese Version aus manifest.json
VERSION=$(grep -o '"human_version": "[^"]*"' manifest.json | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
    VERSION="1.0.0"
    echo "⚠️  Konnte Version nicht aus manifest.json lesen, verwende $VERSION"
fi

echo "📦 Version: $VERSION"
echo ""

# Schritt 1: Frontend bauen
echo "🏗️  Baue Frontend..."
cd frontend
npm run build
cd ..

# Schritt 2: Frontend-Dateien in web/ kopieren
echo ""
echo "📦 Kopiere Frontend-Dateien..."
bash UPDATE_FRONTEND.sh

# Schritt 3: .ankiaddon Paket erstellen
echo ""
echo "📦 Erstelle .ankiaddon Paket..."

PACKAGE_NAME="anki-ai-tutor-v${VERSION}.ankiaddon"

# Lösche altes Paket falls vorhanden
if [ -f "$PACKAGE_NAME" ]; then
    rm "$PACKAGE_NAME"
    echo "🗑️  Altes Paket gelöscht"
fi

# Erstelle ZIP-Archiv mit allen notwendigen Dateien
zip -r "$PACKAGE_NAME" \
    manifest.json \
    __init__.py \
    *.py \
    config.json \
    sessions.json \
    web/ \
    -x "*.pyc" \
    -x "__pycache__/*" \
    -x "*.map" \
    -x "web/index.html.bak" \
    > /dev/null

echo ""
echo "✅ Deployment erfolgreich!"
echo ""
echo "📦 Paket erstellt: $PACKAGE_NAME"
echo ""
echo "Sie können das Paket jetzt in Anki installieren:"
echo "  1. Öffne Anki"
echo "  2. Gehe zu Extras > Add-ons > Installiere aus Datei"
echo "  3. Wähle: $PACKAGE_NAME"
echo ""


