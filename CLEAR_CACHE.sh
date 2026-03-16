#!/bin/bash

# Anki Cache komplett löschen
echo "🧹 Lösche Anki Cache..."

# Qt WebEngine Cache
rm -rf ~/Library/Caches/Anki2/QtWebEngine
rm -rf ~/Library/Application\ Support/Anki2/QtWebEngine

# Anki Cache
rm -rf ~/Library/Caches/Anki2/*

# Addon Cache (falls vorhanden)
rm -rf ~/Library/Application\ Support/Anki2/addons21/__pycache__
rm -rf ~/Library/Application\ Support/Anki2/addons21/anki-chatbot-addon/__pycache__
rm -rf ~/Library/Application\ Support/Anki2/addons21/anki-chatbot-addon/*/__pycache__

echo "✅ Cache gelöscht!"
echo "🔄 Bitte starte Anki jetzt neu."
