# Anki+ (AnkiPlus) — Konzept & Vision

## Vision

**Anki+ verwandelt Anki von einer passiven Karteikarten-App in einen intelligenten, KI-gestützten Lernbegleiter.** Ein integrierter Tutor ("The Hybrid Tutor"), der den Kontext des Lernenden versteht — aktuelle Karte, Lernfortschritt, Schwierigkeiten — und proaktiv beim Lernen unterstützt. Langfristig entwickelt sich der Tutor zu einem autonomen Agenten, der Lernmuster erkennt, Strategien vorschlägt und Aufgaben automatisiert.

## Kernidee

Anki ist mächtig, aber stumm. Anki+ gibt Anki eine Stimme: einen medizinischen Experten-Tutor, der direkt in Anki lebt. Er kombiniert sein umfangreiches internes Wissen mit den konkreten Fakten aus den Anki-Karten des Nutzers. So entsteht ein **hybrider Ansatz** — die Präzision der eigenen Karten plus die Tiefe eines KI-Tutors.

---

## Architektur-Überblick

Anki+ ist ein **Multi-Tier-System** aus drei Schichten:

```
┌─────────────────────────────────────────────────────────┐
│  Anki Desktop (Host-App)                                │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  Python/Qt Backend│  │  React Frontend (Vite)      │  │
│  │  • Bridge (35+    │◄─►  • Chat-UI mit Streaming    │  │
│  │    PyQt Slots)    │  │  • Sessions, Deck-Browser   │  │
│  │  • Card Tracker   │  │  • Settings, Profile, Auth  │  │
│  │  • Custom Reviewer│  │  • Tailwind + DaisyUI       │  │
│  │  • Global Theme   │  │  • Markdown, KaTeX, Mermaid │  │
│  │  • Custom Screens │  │  • Framer Motion            │  │
│  └──────────────────┘  └─────────────────────────────┘  │
│           │                          │                   │
│           └──────── Message Queue ───┘                   │
│                   (100ms Polling)                        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (Streaming)
┌──────────────────────▼──────────────────────────────────┐
│  Firebase Cloud Functions (Backend)                      │
│  • Chat-Handler (AI-Routing → Gemini)                   │
│  • Auth (Firebase Auth + Google OAuth)                   │
│  • Quota-Management & Usage Tracking                     │
│  • Stripe Integration (Subscriptions)                    │
│  • Model-Endpunkte                                       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│  Landing Page (Vercel)                                   │
│  • Marketing & Demo (interaktiver Playground)            │
│  • Dashboard (Usage, Statistiken, Account)               │
│  • Subscription-Management (Stripe Checkout)             │
│  • Login/Register (Google OAuth)                         │
│  • Install-Anleitung                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Der Hybrid Tutor — Das Herzstück

Der KI-Tutor ist kein generischer Chatbot. Er ist ein **spezialisierter medizinischer Tutor** mit klarem Verhalten:

### Zwei Modi — angepasst an den Kartenstand

1. **Karte VERDECKT (Active Recall):**
   - Ermutigt den Nutzer, selbst zu antworten
   - Gibt Hinweise, ohne die Antwort zu verraten
   - Bewertet Antwortversuche mit Score (0–100), Feedback und Analyse
   - Bietet Multiple-Choice-Quiz (5 Optionen) als Alternative
   - Erkennt Eselsbrücken-Anfragen

2. **Karte OFFEN (Deep Dive):**
   - Erklärt Konzepte tiefgehend und strukturiert
   - Erstellt Vergleichstabellen, Mermaid-Diagramme, Molekülstrukturen
   - Nutzt Bilder aus Wikimedia Commons, PubChem oder den Karten selbst
   - Baut Brücken zwischen verwandten Konzepten

### Visuelle Superkräfte

Der Tutor nutzt reichhaltige Formatierung:
- **Markdown** mit Textmarker-Hervorhebungen, Smart Boxes (farbcodierte Blockquotes)
- **KaTeX** für mathematische/chemische Formeln ($H_2O$, $ATP$, $\alpha$-Helix)
- **Mermaid-Diagramme** für Prozesse, Stoffwechselwege, Strukturen (via Function Calling)
- **SMILES-Notation** für Molekülstrukturen (2D-Rendering)
- **Bilder** aus Wikimedia Commons, PubChem, oder direkt aus den Anki-Karten
- **Syntax-Highlighting** für Code-Blöcke

### Intent-System

Jede Antwort enthält einen Intent, der die UI steuert:
- `REVIEW` — Bewertung eines Antwortversuchs (mit Evaluation-Score)
- `MC` — Multiple-Choice-Quiz generieren
- `HINT` — Hinweis ohne Lösung
- `EXPLANATION` — Tiefgehende Erklärung
- `MNEMONIC` — Eselsbrücke
- `CHAT` — Freier Dialog
- `SYSTEM` — System-Information

---

## Features — Aktueller Stand

### ✅ Implementiert

#### Kern-Chat
- **Streaming-Antworten** in Echtzeit mit visueller Thought-Stream-Anzeige
- **Session-Management**: Mehrere Chat-Sessions, automatische Titel-Generierung, Deck-zugeordnet
- **Kontextbewusst**: Erkennt aktuelle Karte, Deck, Kartenstatus (verdeckt/offen)
- **Antwortbewertung**: Score-basiertes Review-System mit detaillierter Analyse
- **Multiple-Choice-Quiz**: KI-generierte 5-Optionen-Quiz mit Erklärungen
- **Antwortstile**: Präzise, Ausgewogen, Detailliert, Freundlich — wählbar pro Nutzer

#### KI-Integration
- **Google Gemini** als primärer AI-Provider (Gemini 3 Flash)
- **Backend-Routing** über Firebase Cloud Functions (kein direkter API-Zugriff vom Client)
- **Function Calling** für Mermaid-Diagramme
- **AI-Tools** ein-/ausschaltbar: Bilder, Diagramme, Moleküle (SMILES)
- **Streaming** über das Backend mit Retry-Logik und Backoff

#### Anki-Integration
- **Seitenpanel** (QDockWidget, rechts) mit Keyboard-Shortcut (Cmd/Ctrl+I)
- **Custom Reviewer**: Minimalistisches, Jony-Ive-inspiriertes Karten-UI (ersetzt natives Anki-UI)
- **Custom Screens**: Eigener Deck-Browser und Overview mit Tabs (Stapel | Session | Statistik)
- **Card Tracker**: Automatische Erkennung der aktuellen Karte, Deck-Wechsel, Kartenstatus
- **Globaler Dark Theme**: Umfassende Restyling aller Anki-UI-Elemente (960 Zeilen Stylesheet)
- **Toolbar/Bottom-Bar Hiding**: Immersive Mode durch Verstecken nativer UI-Elemente
- **Card-Markdown-Konvertierung**: Anki-Karten werden als Markdown-Kontext an die KI übergeben

#### Frontend (React + Vite)
- **44+ Komponenten**: Chat, Sessions, Settings, Deck-Browser, Card-Preview, Paywall, Quota, u.v.m.
- **8 Custom Hooks**: useAnki, useChat, useSessions, useModels, useDeckTracking, useCardContext, useQuotaDisplay
- **Tailwind CSS + DaisyUI**: Konsistentes Design-System mit Dark Theme
- **Framer Motion**: Animationen und Übergänge
- **react-markdown + KaTeX + react-syntax-highlighter + Mermaid**: Reichhaltiges Content-Rendering

#### Backend (Firebase Cloud Functions)
- **9 Handler**: Chat, Auth, Quota, Models, Stripe, Stripe-Webhook, Usage-History, Migration, Checkout-Verification
- **AI-Routing**: Backend routet Chat-Requests an Gemini mit System-Prompt und Kontext
- **Quota-Management**: Tageslimits, Usage-Tracking, Quota-Enforcement
- **Stripe-Integration**: Subscription-Management, Webhooks, Checkout-Sessions
- **Firebase Auth**: Google OAuth, Token-Management, Refresh-Token-Logik

#### Landing Page (Vercel)
- **Marketing-Page**: Hero-Section mit Partikel-Animation, interaktiver Demo-Playground
- **Dashboard**: Usage-Statistiken, Account-Übersicht, Aktivitätsverlauf
- **Pricing**: Vergleichstabelle, FAQ, Stripe Checkout
- **Auth-Flow**: Google Login, Registration, OAuth Callback
- **Install-Guide**: Anleitung zur Addon-Installation

#### Authentifizierung & Monetarisierung
- **Google OAuth** Login/Logout (im Addon und auf der Landing Page)
- **Firebase Auth** Token-Management mit automatischem Refresh
- **Stripe Subscriptions** mit Webhook-Handling
- **Quota-System**: Free-Tier mit Tageslimits, Upgrade-Prompt, Paywall-Modal
- **Device-ID-Tracking**: Eindeutige Geräte-Identifikation

### ⏳ In Entwicklung / Geplant

#### Agentische Funktionen (Phase 2)
- **Proaktive Unterstützung**: Agent erkennt Lernschwierigkeiten und schlägt aktiv Lösungen vor
- **Lernmuster-Analyse**: Erkennung von Wiederholungsmustern, schwachen Karten, optimalen Lernzeiten
- **Automatisierte Aufgaben**: Karten-Erstellung, Tag-Organisation, Deck-Optimierung
- **Adaptive Hilfe**: Passt Schwierigkeitsgrad und Erklärungstiefe an individuellen Lernstil an

#### UI & UX
- **Light Theme** Support (via DaisyUI Theme-Switching)
- **Erweiterte Statistiken** und Lernanalysen im Dashboard

---

## Technologie-Stack

| Schicht | Technologie | Zweck |
|---------|-------------|-------|
| **Host** | Anki (PyQt6) | Desktop-App, Widget-Hosting |
| **Backend (Addon)** | Python 3, PyQt6 | Bridge, Card-Tracking, Theme, Config |
| **Frontend (Addon)** | React 18, Vite 5, Tailwind 3, DaisyUI 4 | Chat-UI, Sessions, Settings |
| **Content Rendering** | react-markdown, KaTeX, Mermaid, react-syntax-highlighter | Markdown, Formeln, Diagramme, Code |
| **Animationen** | Framer Motion | UI-Übergänge, Streaming-Effekte |
| **Cloud Backend** | Firebase Cloud Functions (Node 20, TypeScript) | AI-Routing, Auth, Quota, Payments |
| **KI** | Google Gemini (3 Flash) | Tutoring, Quiz-Generierung, Diagramme |
| **Auth** | Firebase Auth, Google OAuth | Login, Token-Management |
| **Payments** | Stripe | Subscriptions, Webhooks |
| **Landing Page** | React (TypeScript), Vite, Vercel | Marketing, Dashboard, Checkout |
| **Datenbank** | Firestore | User-Daten, Quota, Usage-History |

---

## Kommunikationsarchitektur

### JavaScript ↔ Python Bridge

Die Kommunikation zwischen React-Frontend und Python-Backend läuft über ein **Message-Queue-System** (nicht QWebChannel, wegen Timing-Problemen):

**JS → Python:**
1. React ruft `bridge.sendMessage(data)` auf
2. JS fügt Nachricht zur Queue: `window.ankiBridge.addMessage(type, data)`
3. Python pollt Queue alle 100ms via QTimer
4. Python routet Nachricht an passenden Handler

**Python → JS:**
1. Python erstellt JSON-Payload
2. `web_view.page().runJavaScript("window.ankiReceive(...);")`
3. React's `useAnki` Hook empfängt und verarbeitet die Nachricht

### WebBridge — 35+ PyQt Slots

Die Bridge exponiert Methoden für alle Addon-Funktionen:
- **AI & Chat**: sendMessage, cancelRequest, setModel, generateSectionTitle
- **Settings**: openSettings, closePanel, saveSettings, getCurrentConfig, fetchModels, getAITools, saveAITools
- **Decks**: getCurrentDeck, getAvailableDecks, openDeck, getDeckStats, openDeckBrowser
- **Karten**: getCardDetails, goToCard, previewCard, showAnswer, hideAnswer, saveMultipleChoice, loadMultipleChoice
- **Sessions**: loadSessions, saveSessions
- **Auth**: authenticate, getAuthStatus, getAuthToken, refreshAuth, handleAuthDeepLink
- **Media**: searchImage, fetchImage, openUrl

---

## Design-Philosophie

**Clean, modern, hochwertig** — inspiriert von Wispr Flow und Cursor.

- **Dark-First**: Umfassender Dark Theme für Anki + eigene UI
- **Minimalismus**: Fokus auf Inhalt, keine Dekoration
- **Immersive Mode**: Natives Anki-UI wird durch eigene Screens ersetzt (Reviewer, Deck-Browser, Overview)
- **Farbpalette**: Primary Blue (#4a9eff), Dark Background (#1e1e1e), DaisyUI Theme-Tokens
- **Typografie**: System Font Stack für native Optik
- **Interaction Container**: Letzte Nachricht + Antwort im Fokus, Smart-Scroll

---

## Entwicklungspfad

1. ✅ **Basis-Integration** — Chatbot in Anki als Dock-Widget sichtbar
2. ✅ **UI-Verbesserung** — Seitliches Panel, Keyboard-Shortcuts
3. ✅ **Moderne Frontend-Architektur** — Migration zu React + Vite + Tailwind + DaisyUI
4. ✅ **KI-Integration** — Gemini-Backend mit Streaming, Function Calling, Multi-Tool-Support
5. ✅ **Kontextverständnis** — Card Tracker, Deck-Erkennung, Kartenstauts-Awareness
6. ✅ **Custom Reviewer** — Minimalistisches Karten-UI mit eigenem Design
7. ✅ **Custom Screens** — Eigener Deck-Browser und Overview
8. ✅ **Backend & Auth** — Firebase Cloud Functions, Google OAuth, Token-Management
9. ✅ **Monetarisierung** — Stripe Subscriptions, Quota-System, Paywall
10. ✅ **Landing Page** — Marketing, Dashboard, Demo, Install-Guide
11. ⏳ **Agentische Funktionen** — Proaktive Unterstützung, Lernmuster-Analyse, Automatisierung
12. ⏳ **Light Theme** — DaisyUI Theme-Switching

---

## Entwicklungsworkflow

### Frontend-Entwicklung

```bash
cd frontend
npm install        # Abhängigkeiten installieren
npm run dev        # Dev-Server (localhost:3000, Hot Module Replacement)
npm run build      # Production-Build → web/ Ordner
```

- Entwicklung im Browser mit Mock-Bridges (kein Anki nötig)
- Build für Anki: `npm run build`, dann Anki neu starten
- QWebEngineView lädt `web/index.html` als lokale Datei

### Custom Reviewer

```bash
cd custom_reviewer
npm run build      # Tailwind CSS kompilieren
```

### Cloud Functions

```bash
cd functions
npm run build      # TypeScript kompilieren
firebase deploy --only functions
```

### Landing Page

```bash
cd Landingpage
npm run dev        # Lokaler Dev-Server
# Deployment: Push zu Git → Vercel Auto-Deploy
```

---

## Projektstruktur (Übersicht)

```
AnkiPlus/
├── Python Backend (Anki Addon)
│   ├── __init__.py          — Entry Point, Hooks, Lifecycle
│   ├── bridge.py            — WebBridge (35+ PyQt Slots)
│   ├── widget.py            — ChatbotWidget, Message Queue, AI Threading
│   ├── ai_handler.py        — AI-Integration (Gemini, Streaming, Function Calling)
│   ├── ui_setup.py          — DockWidget, Shortcuts, Toolbar
│   ├── config.py            — Config-Management (config.json)
│   ├── system_prompt.py     — Hybrid Tutor System Prompt
│   ├── card_tracker.py      — Karten-Status-Tracking
│   ├── card_markdown.py     — Karten → Markdown Konvertierung
│   ├── anki_global_theme.py — Globaler Dark Theme (960 Zeilen)
│   ├── custom_reviewer/     — Custom Reviewer (HTML/CSS/JS)
│   ├── custom_screens.py    — Custom Deck-Browser & Overview
│   ├── auth_server.py       — OAuth Server
│   ├── sessions_storage.py  — Session-Persistenz
│   └── settings_window.py   — Settings Dialog
│
├── frontend/                — React Frontend (Vite)
│   ├── src/components/      — 44+ UI-Komponenten
│   ├── src/hooks/           — 8 Custom Hooks
│   ├── src/contexts/        — Session Context
│   └── src/utils/           — Utility-Funktionen
│
├── functions/               — Firebase Cloud Functions
│   ├── src/handlers/        — 9 API-Handler
│   ├── src/middleware/      — Auth Middleware
│   ├── src/utils/           — 9 Utility-Module
│   └── src/types/           — TypeScript Types
│
├── Landingpage/             — Marketing & Dashboard (Vercel)
│   ├── src/pages/           — 8 Seiten
│   ├── src/components/      — 20+ Komponenten (inkl. Demo)
│   └── src/hooks/           — Quota & Usage Hooks
│
├── shared/                  — Geteilte UI-Komponenten
├── web/                     — Frontend Build Output
└── Dokumentation (19 Markdown-Dateien)
```

---

## Offene Fragen & Nächste Schritte

- Wie proaktiv soll der Agent werden? (Push-Notifications vs. sanfte Hinweise)
- Welche Lernmuster soll die Analyse erkennen? (Vergessenskurve, Schwachstellen, Timing)
- Soll der Agent Karten automatisch erstellen/modifizieren können?
- Light Theme: Wann und wie priorisieren?
- Offline-Modus: Lokale LLM-Unterstützung als Fallback?
- Balance zwischen Automatisierung und Nutzerkontrolle

---

*Stand: März 2026 — Diese Datei spiegelt den aktuellen Entwicklungsstand wider.*
