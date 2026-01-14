# Firebase MCP Integration Setup

Diese Anleitung erklärt, wie du Firebase MCP (Model Context Protocol) in diesem Anki Chatbot Addon einrichtest.

## Was ist Firebase MCP?

Firebase MCP ermöglicht es, Firebase-Dienste (Firestore, Storage, Authentication, etc.) über das Model Context Protocol zu nutzen. Dies erlaubt dem AI-Assistenten, direkt mit Firebase-Daten zu interagieren.

## Voraussetzungen

1. **Node.js** (Version 16.0.0 oder höher) muss installiert sein
2. Ein **Firebase-Projekt** mit aktivierten Diensten
3. **Service Account** Zugangsdaten von Firebase

## Setup-Schritte

### 1. Firebase Service Account erstellen

1. Gehe zur [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt aus (oder erstelle ein neues)
3. Gehe zu **Einstellungen** (⚙️) > **Service Accounts**
4. Klicke auf **"Neuen privaten Schlüssel generieren"**
5. Speichere die heruntergeladene JSON-Datei sicher (z.B. als `firebase-service-account.json`)

### 2. Umgebungsvariablen setzen

Setze die folgenden Umgebungsvariablen in deinem System:

**macOS/Linux:**
```bash
export FIREBASE_SERVICE_ACCOUNT_KEY_PATH="/pfad/zur/serviceAccountKey.json"
export FIREBASE_STORAGE_BUCKET="dein-projekt-id.appspot.com"
```

**Windows (PowerShell):**
```powershell
$env:FIREBASE_SERVICE_ACCOUNT_KEY_PATH="C:\pfad\zur\serviceAccountKey.json"
$env:FIREBASE_STORAGE_BUCKET="dein-projekt-id.appspot.com"
```

**Hinweis:** Die Storage Bucket ID findest du in der Firebase Console unter **Storage** > **Einstellungen**.

### 3. MCP-Konfiguration in Cursor

Die `mcp.json` Datei in diesem Projekt enthält eine Template-Konfiguration. Du musst diese in deine Cursor MCP-Konfiguration kopieren:

**Pfad:** `~/.cursor/mcp.json` (macOS/Linux) oder `%APPDATA%\Cursor\mcp.json` (Windows)

**Beispiel-Konfiguration:**
```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": [
        "-y",
        "firebase-tools@latest",
        "experimental:mcp"
      ],
      "env": {
        "SERVICE_ACCOUNT_KEY_PATH": "/absoluter/pfad/zu/serviceAccountKey.json",
        "FIREBASE_STORAGE_BUCKET": "dein-projekt-id.appspot.com"
      }
    }
  }
}
```

**Wichtig:** Ersetze die Platzhalter mit deinen tatsächlichen Werten!

### 4. Firebase MCP Server starten

Der Firebase MCP Server wird automatisch von Cursor gestartet, wenn:
- Die MCP-Konfiguration korrekt ist
- Node.js installiert ist
- Die Umgebungsvariablen gesetzt sind

Du kannst überprüfen, ob der Server läuft, indem du in Cursor die MCP-Ressourcen auflistest.

## Verwendung in Python

Das Modul `firebase_mcp.py` bietet eine einfache Python-API:

```python
from firebase_mcp import get_firebase_mcp

# Firebase MCP Instanz erstellen
firebase = get_firebase_mcp()

# Konfiguration prüfen
if firebase.is_configured():
    config = firebase.get_config()
    project_id = firebase.get_project_id()
    print(f"Firebase Project ID: {project_id}")
else:
    print("Firebase MCP ist nicht konfiguriert")
```

## Verfügbare MCP-Ressourcen

Sobald Firebase MCP konfiguriert ist, stehen folgende Ressourcen zur Verfügung:

- **Firestore Collections**: Lesen und Schreiben von Firestore-Daten
- **Storage Files**: Hoch- und Herunterladen von Dateien
- **Authentication**: Benutzerverwaltung
- **Realtime Database**: Echtzeit-Datenbankzugriff

## Troubleshooting

### Problem: "SERVICE_ACCOUNT_KEY_PATH ist nicht gesetzt"

**Lösung:** Stelle sicher, dass die Umgebungsvariable gesetzt ist:
```bash
echo $FIREBASE_SERVICE_ACCOUNT_KEY_PATH  # Sollte den Pfad anzeigen
```

### Problem: "Service Account Datei nicht gefunden"

**Lösung:** Überprüfe den Pfad zur Service Account JSON-Datei:
```bash
ls -la "$FIREBASE_SERVICE_ACCOUNT_KEY_PATH"
```

### Problem: Firebase MCP Server startet nicht

**Lösung:** 
1. Überprüfe, ob Node.js installiert ist: `node --version`
2. Teste manuell: `npx -y firebase-tools@latest experimental:mcp`
3. Überprüfe die MCP-Konfiguration in Cursor

### Problem: "FIREBASE_STORAGE_BUCKET ist nicht gesetzt"

**Lösung:** Die Storage Bucket ID findest du in der Firebase Console. Sie hat normalerweise das Format: `projekt-id.appspot.com`

## Weitere Informationen

- [Firebase MCP Blog Post](https://firebase.blog/posts/2025/05/firebase-mcp-server/)
- [Firebase Dokumentation](https://firebase.google.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)


