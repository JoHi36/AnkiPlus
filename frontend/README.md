# Anki Chatbot Frontend

Modernes Frontend für das Anki Chatbot Addon, gebaut mit **Vite + React + Tailwind CSS + DaisyUI**.

## 🚀 Quick Start

### Installation

```bash
cd frontend
npm install
```

### Entwicklung

```bash
npm run dev
```

Öffnet einen Development-Server auf `http://localhost:3000`. Du kannst die UI im Browser entwickeln und testen (mit Mock-Daten).

### Build für Anki

```bash
npm run build
```

Dies erstellt optimierte, statische Dateien im `../web/` Ordner, die von Anki geladen werden.

## 📁 Projektstruktur

```
frontend/
├── src/
│   ├── components/      # React-Komponenten
│   │   ├── ChatMessage.jsx
│   │   ├── ChatInput.jsx
│   │   ├── Header.jsx
│   │   └── SessionPicker.jsx
│   ├── hooks/          # Custom React Hooks
│   │   └── useAnki.js  # Anki-Bridge Hook
│   ├── utils/          # Utilities
│   │   └── sessions.js # Session-Management
│   ├── App.jsx         # Haupt-Komponente
│   ├── main.jsx        # Entry Point
│   └── index.css       # Global Styles + Tailwind
├── index.html          # HTML Template
├── vite.config.js      # Vite-Konfiguration
├── tailwind.config.js  # Tailwind + DaisyUI Config
└── package.json        # Dependencies
```

## 🛠️ Technologie-Stack

- **Vite**: Schneller Build-Tool und Dev-Server
- **React 18**: UI-Framework
- **Tailwind CSS**: Utility-First CSS Framework
- **DaisyUI**: Komponenten-Bibliothek für Tailwind

## 🔌 Anki-Integration

Die UI kommuniziert mit dem Python-Backend über `QWebChannel`:

- **Development**: Mock-Bridge für Browser-Testing
- **Production**: Echte Anki-Bridge über `window.qt.webChannelTransport`

## 📝 Workflow

1. **Entwicklung**: Ändere Code in `src/`, siehst Änderungen sofort im Browser
2. **Build**: `npm run build` erstellt optimierte Dateien in `web/`
3. **Test in Anki**: Starte Anki neu, UI wird aus `web/` geladen

## 🎨 Design-System

Das Design folgt dem Design-System in `../DESIGN.md` und nutzt:
- Tailwind Utility Classes
- DaisyUI Komponenten
- Custom Farben aus `tailwind.config.js`

