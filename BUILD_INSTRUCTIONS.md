
# Frontend Build-Anleitung

## Problem: Markdown wird nicht angezeigt

Wenn Markdown nicht formatiert wird, muss das Frontend neu gebaut werden.

## Lösung: Frontend neu bauen

### Schritt 1: Anki schließen
⚠️ **WICHTIG**: Schließe Anki komplett, bevor du das Frontend baust!

### Schritt 2: Terminal öffnen
Öffne ein Terminal und navigiere zum Frontend-Ordner:

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/frontend"
```

### Schritt 3: Frontend bauen
Führe den Build-Befehl aus:

```bash
npm run build
```

Dies erstellt die optimierten Dateien im `web/` Ordner.

### Schritt 4: Anki neu starten
Starte Anki neu und teste den Chatbot.

## Wenn der Build fehlschlägt

Falls du einen Fehler wie "EPERM: operation not permitted" siehst:

1. **Stelle sicher, dass Anki komplett geschlossen ist**
   - Prüfe im Activity Monitor, ob noch ein Anki-Prozess läuft
   - Beende alle Anki-Prozesse

2. **Versuche es erneut:**
   ```bash
   npm run build
   ```

3. **Falls es immer noch nicht funktioniert:**
   ```bash
   # Lösche den web-Ordner manuell
   rm -rf "../web/assets"
   # Dann baue neu
   npm run build
   ```

## Verifizierung

Nach dem Build sollten folgende Dateien im `web/assets/` Ordner existieren:
- `main.js` (enthält ReactMarkdown)
- `main.css`

Öffne `web/assets/main.js` und suche nach "react-markdown" - es sollte dort vorkommen.


