# Anleitung: React Error #60 beheben

## Problem
Das Addon zeigt einen Fehler beim Laden von Chat-Nachrichten an:
```
Minified React error #60
```

Dies wird durch Debug-Code im Frontend verursacht, der entfernt wurde.

## Lösung

### Schritt 1: Anki schließen
**WICHTIG:** Schließen Sie Anki **vollständig**, bevor Sie fortfahren!

### Schritt 2: Update-Skript ausführen

#### Option A: Terminal (empfohlen)
```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon"
./UPDATE_FRONTEND.sh
```

#### Option B: Manuell kopieren
Falls das Skript nicht funktioniert, kopieren Sie die Dateien manuell:

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon"

# Kopiere die neuen Dateien
cp frontend/dist/assets/main.js web/assets/main.js
cp frontend/dist/assets/main.css web/assets/main.css
cp frontend/dist/index.html web/index.html

# Kopiere alle JavaScript-Chunks
cp frontend/dist/assets/*.js web/assets/
```

### Schritt 3: Anki neu starten
Starten Sie Anki neu. Die Fehler sollten nun behoben sein!

## Was wurde behoben?

1. **Debug-Logging entfernt** - Kein `fetch('http://127.0.0.1:7242/...')` mehr
2. **Bessere Fehlerbehandlung** - React Error #60 wird verhindert durch:
   - Validierung aller Render-Daten
   - Sichere String-Konvertierung
   - Verbesserte Error Boundaries
3. **Besseres Bildladen** - Fehler bei Unsplash 503 werden sauber angezeigt
4. **Stabileres Rendering** - Alle Daten werden vor dem Rendern validiert

## Wenn es immer noch nicht funktioniert

Falls die Fehler weiterhin auftreten:

1. **Cache leeren:**
   - Schließen Sie Anki
   - Löschen Sie den Ordner `web/assets/`
   - Führen Sie das Update-Skript erneut aus

2. **Komplett neu bauen:**
   ```bash
   cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/frontend"
   npm run build
   cd ..
   ./UPDATE_FRONTEND.sh
   ```

3. **Sessions zurücksetzen** (falls LaTeX-Probleme):
   - Sichern Sie `sessions.json`
   - Löschen Sie `sessions.json`
   - Starten Sie Anki neu

## Kontakt
Falls das Problem weiterhin besteht, öffnen Sie ein Issue mit dem vollständigen Console-Log.



