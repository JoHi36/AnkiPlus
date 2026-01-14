# Anki Chatbot Addon - Technische Dokumentation

## Architektur

### Komponenten

- **ChatbotPanel**: Seitliches Panel-Widget (QDockWidget) - Python/Qt
- **ChatbotWidget**: Haupt-Widget für die Chat-UI - Python/Qt
- **WebBridge**: Bridge zwischen Python und JavaScript (QWebChannel)
- **Frontend**: Moderne React-UI mit Vite + Tailwind CSS + DaisyUI
- **AIHandler**: API-Integration für OpenAI, Anthropic und Google

### Integration in Anki

- Verwendet `QDockWidget` für seitliches Panel
- `QWebEngineView` lädt die React-UI aus dem `web/` Ordner
- Floating Action Button (FAB) für schnellen Zugriff
- Menü-Eintrag als Alternative

## Dateistruktur

```
anki-chatbot-addon/
├── manifest.json          # Addon-Metadaten
├── __init__.py           # Hauptdatei, Initialisierung (Python/Qt)
├── ai_handler.py          # KI-Integration (OpenAI, Anthropic, Google)
├── config.py              # Konfiguration
├── settings_dialog.py     # Einstellungsdialog (Python)
├── theme.py               # Theme-Helfer
├── web/                   # Build-Output (statische Dateien)
│   ├── index.html         # HTML-Entry-Point (von Vite generiert)
│   ├── assets/            # JS/CSS-Dateien (von Vite generiert)
│   └── ...
├── frontend/              # Frontend-Entwicklung (React + Vite)
│   ├── src/
│   │   ├── components/    # React-Komponenten
│   │   │   ├── ChatInput.jsx
│   │   │   ├── ChatMessage.jsx
│   │   │   ├── Header.jsx
│   │   │   ├── SettingsDialog.jsx
│   │   │   └── SettingsButton.jsx
│   │   ├── hooks/         # Custom Hooks
│   │   │   └── useAnki.js  # Anki-Bridge Hook
│   │   ├── utils/         # Utilities
│   │   │   └── sessions.js # Session-Management
│   │   ├── App.jsx        # Haupt-Komponente
│   │   └── main.jsx       # Entry Point
│   ├── index.html         # HTML Template
│   ├── vite.config.js     # Vite-Konfiguration
│   ├── tailwind.config.js  # Tailwind + DaisyUI Config
│   └── package.json       # Dependencies
├── Concept.md            # Konzeptdokumentation
├── DESIGN.md             # Design-Sprache
└── TECHNICAL.md          # Diese Datei
```

## Frontend-Architektur

### Technologie-Stack

- **Vite**: Build-Tool und Development-Server (extrem schnell)
- **React 18**: UI-Framework für Komponenten-basierte Entwicklung
- **Tailwind CSS**: Utility-First CSS Framework
- **DaisyUI**: Komponenten-Bibliothek für Tailwind (schnelle UI-Entwicklung)
- **Lucide React**: Professionelle Icon-Bibliothek

### Warum dieser Stack?

1. **Entwicklungsgeschwindigkeit**: Mit Tailwind + DaisyUI kannst du hochwertige UIs in Minuten statt Stunden bauen
2. **Moderne Tools**: React ermöglicht State-Management und Komponenten-Wiederverwendung
3. **Browser-Entwicklung**: Du entwickelst die UI im normalen Browser (Chrome/Safari) und testest sie erst am Ende in Anki
4. **Build-Optimierung**: Vite erzeugt minimalen, optimierten Code für Production

### Kommunikation Python ↔ JavaScript

Die Kommunikation läuft über **QWebChannel**:

1. **Python → JavaScript**: 
   - Python ruft `web_view.page().runJavaScript()` auf
   - Sendet Daten an `window.ankiReceive()`

2. **JavaScript → Python**:
   - JavaScript ruft Methoden auf `ankiBridge` (z.B. `ankiBridge.sendMessage()`)
   - Python empfängt über `@pyqtSlot` annotierte Methoden

### Development-Workflow

1. **Entwicklung**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   - Öffnet Dev-Server auf `http://localhost:3000`
   - Mock-Bridge für Browser-Testing
   - Hot Module Replacement (Änderungen sofort sichtbar)

2. **Build**:
   ```bash
   npm run build
   ```
   - Erstellt optimierte Dateien in `web/`
   - Löscht alte Dateien automatisch
   - Verwendet relative Pfade für lokale Dateien

3. **Test in Anki**:
   - Starte Anki neu
   - UI wird aus `web/` geladen
   - Echte Anki-Bridge aktiv

### UI-Komponenten (React)

- **App.jsx**: Haupt-Komponente, verwaltet State und Kommunikation
- **Header.jsx**: Minimaler Header mit Session-Picker (zentriert)
- **ChatMessage.jsx**: User-Nachrichten als subtile Bubbles, Bot-Antworten als Fließtext
- **ChatInput.jsx**: Schwebendes Input-Feld mit zwei Bereichen (Input oben, Controls unten)
- **SettingsDialog.jsx**: Einstellungsdialog mit Live-Modell-Abruf
- **SettingsButton.jsx**: Settings-Button links oben im Chatfenster

### Backend-Komponenten (Python)

- **ChatbotWidget**: Lädt und verwaltet QWebEngineView
- **WebBridge**: QObject mit @pyqtSlot Methoden für JS-Kommunikation
- **AIHandler**: Implementiert API-Integration für OpenAI, Anthropic und Google
- **toggle_chatbot()**: Öffnet/schließt das Dock-Widget
- **create_floating_button()**: Erstellt den FAB

## API-Integration

### Unterstützte Provider

1. **OpenAI**
   - Modelle werden live von der API abgerufen
   - Unterstützt: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
   - API-Endpoint: `https://api.openai.com/v1/chat/completions`

2. **Anthropic (Claude)**
   - Statische Model-Liste (API bietet keine Model-Liste)
   - Unterstützt: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
   - API-Endpoint: `https://api.anthropic.com/v1/messages`

3. **Google (Gemini)**
   - Modelle werden live von der API abgerufen
   - Unterstützt: Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini Pro
   - API-Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

### Live-Modell-Abruf

- Modelle werden automatisch abgerufen wenn:
  - Settings-Dialog geöffnet wird und API-Key eingegeben wird
  - API-Key gespeichert wird
  - Addon gestartet wird (wenn API-Key vorhanden)
- Fallback auf statische Model-Liste bei Fehlern

### Konfiguration

- API-Keys werden in `config.json` gespeichert (lokal, nicht übertragen)
- Provider-Wechsel lädt automatisch die entsprechenden Modelle
- Model-Auswahl wird in der Config gespeichert

## Technische Details

### UI-Komponenten (React)
- **React Components**: Modulare, wiederverwendbare UI-Bausteine
- **Tailwind CSS**: Utility-First Styling (kein manuelles CSS nötig)
- **DaisyUI**: Fertige Komponenten (Buttons, Cards, etc.)
- **Lucide React**: Professionelle Icons

### Event-Handling
- **React State**: Verwaltet UI-State (Messages, Sessions, Models)
- **useAnki Hook**: Verwaltet Anki-Bridge Verbindung
- **QWebChannel**: Bidirektionale Kommunikation Python ↔ JS

### Session-Management
- **localStorage**: Sessions werden im Browser gespeichert
- **React State**: Aktuelle Session und Messages im State
- **Auto-Save**: Nachrichten werden automatisch gespeichert

## Zukünftige Erweiterungen

- Anki-Datenbank-Zugriff
- Kontextanalyse (aktuelle Karte erkennen)
- Agent-Logik (proaktive Unterstützung)
- Markdown-Rendering in Nachrichten
- Code-Syntax-Highlighting
- Animierte Übergänge (Framer Motion)
- Typing-Indicator
- Message-Timestamps
