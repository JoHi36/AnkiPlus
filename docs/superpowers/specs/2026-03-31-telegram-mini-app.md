# Telegram Mini App — AnkiPlus Remote

**Datum:** 2026-03-31
**Status:** Design approved

## 1. Konzept

Eine Telegram Mini App die als Fernbedienung für AnkiPlus funktioniert. Zwei Modi:

- **Solo** — Karte auf dem Handy gerendert, volles Review-Erlebnis mobil
- **Duo** — Handy = Remote (Buttons + MC), Laptop = Karten-Canvas

### Leitprinzipien

- **Ein-Glas-Regel:** Im Duo-Modus hat der Desktop kein Input-Feld — das Handy ist das einzige Eingabegerät
- **Invisible Addiction:** Alle Oberflächen nutzen `var(--ds-*)` Tokens, `.ds-frosted` / `.ds-deep` Materialien
- **Slide-Transitions:** Karte gleitet links raus, nächste von rechts rein. Kein Flip, kein Swipe, clean.

## 2. Architektur

```
┌─────────────┐     WebSocket      ┌──────────────┐     WebSocket      ┌─────────────┐
│  Mini App   │ ◄──────────────►   │ Vercel Relay │ ◄──────────────►   │  Anki/Qt    │
│  (Telegram) │                    │  (WS Proxy)  │                    │  (Python)   │
└─────────────┘                    └──────────────┘                    └─────────────┘
       │                                                                      │
       │  Telegram initData (chat_id)                        Bot-Token (chat_id)
       └──────────────── automatisches Matching ──────────────────────────────┘
```

### 2.1 Relay-Server (Vercel)

- Vercel Edge Function mit WebSocket-Upgrade
- Hält zwei Verbindungen pro Session: Anki-Client + Mini-App-Client
- Matching über `chat_id` (aus Telegram `initData` bzw. Bot-Config)
- Reine Message-Weiterleitung, kein State, kein Speicher
- Heartbeat: Ping/Pong alle 30s, Disconnect nach 60s Stille

### 2.2 Anki WebSocket-Client (Python)

- Neues Modul `plusi/remote_ws.py`
- Verbindet sich zum Relay beim Bot-Start (wenn Telegram-Token konfiguriert)
- Läuft im selben Thread-Kontext wie der Telegram-Bot
- Sendet Card-State-Updates wenn sich der Reviewer-State ändert
- Empfängt Aktionen (flip, rate, mc_select) und führt sie über `_run_on_main()` aus
- Nutzt bestehende Helfer aus `plusi/telegram.py` (`_rate_card`, `_show_answer`, `_get_current_card`, etc.)

### 2.3 Mini App (React)

- Gehostet auf Vercel: `ankiplus.vercel.app/remote` (oder äquivalente Route)
- React + Vite + Tailwind, `design-system.css` importiert
- Shared Components aus `shared/components/` wo passend (`MultipleChoiceCard`)
- Telegram Web App SDK (`@twa-dev/sdk`) für `initData`, Theme, Viewport

### 2.4 Authentifizierung

- **Zero Interaction:** Kein Pairing-Code, kein QR-Code
- Mini App: Telegram liefert `initData` mit `chat_id` + HMAC-Signatur
- Relay validiert HMAC mit Bot-Token (Server-side)
- Anki-Client authentifiziert sich mit Bot-Token + `chat_id` aus Config
- Relay matched beide Clients über identische `chat_id`

## 3. WebSocket-Protokoll

Alle Messages sind JSON mit `type`-Feld.

### 3.1 Anki → Mini App

| Type | Payload | Wann |
|------|---------|------|
| `card_state` | `{ phase: "question"\|"answer", front_html, back_html, deck, progress: { current, total }, card_id }` | Bei jedem Kartenwechsel und Flip |
| `mc_options` | `{ options: [{ id, text }], card_id }` | Wenn MC für aktive Karte existiert |
| `mc_clear` | `{}` | Wenn keine MC-Optionen aktiv |
| `rated` | `{ ease, next_card_state }` | Bestätigung nach Rating |
| `connected` | `{ deck, state }` | Bei Verbindungsaufbau |
| `disconnected` | `{}` | Bei Trennung |

### 3.2 Mini App → Anki

| Type | Payload | Wann |
|------|---------|------|
| `flip` | `{}` | User tippt "Antwort zeigen" |
| `rate` | `{ ease: 1\|2\|3\|4 }` | User tippt Rating-Button |
| `mc_select` | `{ option_id }` | User wählt MC-Option |
| `open_deck` | `{ deck_id }` | User wählt Deck |
| `set_mode` | `{ mode: "solo"\|"duo" }` | User wechselt Modus |
| `get_decks` | `{}` | Deck-Liste anfordern |

### 3.3 Anki → Mini App (Responses)

| Type | Payload | Wann |
|------|---------|------|
| `deck_list` | `{ decks: [{ id, name, new, learn, review }] }` | Antwort auf `get_decks` |

## 4. Mini App Screens

### 4.1 Verbindungs-Screen

- Zeigt "Verbinde mit Anki..." mit Plusi-Animation
- Automatischer Reconnect bei Verbindungsverlust
- Fallback-Text wenn Anki nicht läuft: "Starte Anki auf deinem Computer"

### 4.2 Modus-Wahl

- Toggle oben: Solo / Duo
- Persistiert in `localStorage`
- Wechsel sendet `set_mode` an Anki (Desktop reagiert: Input rein/raus)

### 4.3 Deck-Picker

- Liste der Top-Level-Decks (keine Sub-Decks)
- Pro Deck: Name + Counts (Neu / Lernen / Wiederholen)
- Tap → `open_deck` → Wechsel zu Review-Screen

### 4.4 Duo-Modus — Question State

```
┌─────────────────────────┐
│  Anatomie    12/50      │  ← Deck + Fortschritt, dezent
│                         │
│                         │
│                         │
│   ┌─────────────────┐   │
│   │  Antwort zeigen │   │  ← Großer Frosted-Glass-Button
│   └─────────────────┘   │
│                         │
│         ~curious        │  ← Plusi Mood, klein
└─────────────────────────┘
```

### 4.5 Duo-Modus — Answer State

```
┌─────────────────────────┐
│  Anatomie    12/50      │
│                         │
│  ┌──────┐  ┌──────┐    │
│  │  1   │  │  2   │    │  ← Rating-Buttons, groß
│  │Nochm.│  │Schwer│    │
│  └──────┘  └──────┘    │
│  ┌──────┐  ┌──────┐    │
│  │  3   │  │  4   │    │
│  │ Gut  │  │Leicht│    │
│  └──────┘  └──────┘    │
│                         │
└─────────────────────────┘
```

### 4.6 Duo-Modus — MC aktiv

```
┌─────────────────────────┐
│  Anatomie    12/50      │
│                         │
│  ┌─────────────────┐    │
│  │ A) Mitochondrien│    │  ← MC-Optionen als Touch-Buttons
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ B) Ribosomen    │    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ C) Golgi-Apparat│    │
│  └─────────────────┘    │
│  ┌─────────────────┐    │
│  │ D) Lysosomen    │    │
│  └─────────────────┘    │
│                         │
└─────────────────────────┘
```

Nach MC-Auswahl → Ergebnis-Feedback (richtig/falsch) → Rating-Buttons.

### 4.7 Solo-Modus — Question State

```
┌─────────────────────────┐
│  Anatomie    12/50      │
│                         │
│  ┌─────────────────┐    │
│  │                 │    │
│  │   Karten-HTML   │    │  ← Full HTML-Rendering (Front)
│  │   (WebView)     │    │
│  │                 │    │
│  └─────────────────┘    │
│                         │
│   ┌─────────────────┐   │
│   │  Antwort zeigen │   │
│   └─────────────────┘   │
└─────────────────────────┘
```

### 4.8 Solo-Modus — Answer State

```
┌─────────────────────────┐
│  Anatomie    12/50      │
│  ┌─────────────────┐    │
│  │  Front-HTML     │    │  ← Kompakter
│  └─────────────────┘    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ← Divider
│  ┌─────────────────┐    │
│  │  Back-HTML      │    │
│  └─────────────────┘    │
│  ┌────┐┌────┐┌────┐┌────┐
│  │ 1  ││ 2  ││ 3  ││ 4  │  ← Rating-Buttons
│  └────┘└────┘└────┘└────┘
└─────────────────────────┘
```

## 5. Desktop-Verhalten (Duo-Modus)

### 5.1 Bei Verbindung (Mini App connected)

1. Input-Feld gleitet nach unten raus (`transform: translateY(100%)`, 300ms ease-out)
2. Dezenter Hinweis erscheint: Pill-Badge "Remote verbunden" (`.ds-frosted`, `var(--ds-green)` Dot)
3. Position: dort wo das Input war, oder unten-mittig
4. Alles andere (Karte, Header, Sidebar) bleibt unverändert

### 5.2 Bei Trennung (Mini App disconnected)

1. Pill-Badge verschwindet (fade-out)
2. Input-Feld gleitet von unten wieder hoch rein (300ms ease-in)

### 5.3 Implementierung

- `App.jsx`: Neuer State `remoteConnected` (via WebSocket-Message vom Python-Backend)
- Input-Container bekommt `transform` + `transition` basierend auf `remoteConnected`
- Pill-Badge ist ein kleines Overlay-Element, kein neuer View-State

## 6. Animationen (Mini App)

### 6.1 Slide-Transition (Kartenwechsel)

- Aktuelle Karte gleitet nach links raus (`translateX(-100%)`, 250ms)
- Neue Karte kommt von rechts rein (`translateX(100%) → 0`, 250ms)
- `framer-motion` `AnimatePresence` mit `key={card_id}`

### 6.2 Phase-Transition (Question → Answer)

- Rating-Buttons faden rein von unten (`opacity: 0→1`, `translateY(20px→0)`, 200ms)
- Im Solo-Modus: Back-HTML expandiert von der Divider-Linie

### 6.3 Rating-Feedback

- Getippter Button: kurzer Scale-Pulse (`1.0 → 0.95 → 1.0`, 150ms)
- Dann Slide-Transition zur nächsten Karte

## 7. Tech-Stack

| Komponente | Technologie |
|-----------|------------|
| Mini App | React 18 + Vite + Tailwind + `design-system.css` |
| Animationen | `framer-motion` |
| Telegram SDK | `@twa-dev/sdk` |
| Relay | Vercel Edge Function (WebSocket) |
| Anki WS-Client | Python `websockets` (asyncio in Thread) |
| Styling | `var(--ds-*)` Tokens, `.ds-frosted`, `.ds-deep` |

### 7.1 Mini App Dateistruktur (auf Vercel)

```
remote/
├── index.html
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── hooks/
│   │   ├── useRemoteSocket.js    # WebSocket-Verbindung + Reconnect
│   │   └── useCardState.js       # Card-State aus WS-Messages
│   ├── components/
│   │   ├── RemoteView.jsx        # Hauptcontainer (Solo/Duo Switch)
│   │   ├── DeckPicker.jsx        # Deck-Auswahl
│   │   ├── QuestionScreen.jsx    # Flip-Button (Duo) oder Karte+Flip (Solo)
│   │   ├── AnswerScreen.jsx      # Rating-Buttons (Duo) oder Karte+Rating (Solo)
│   │   ├── MCScreen.jsx          # Multiple-Choice
│   │   ├── ConnectingScreen.jsx  # Verbindungsaufbau
│   │   ├── RatingButtons.jsx     # 4 Rating-Buttons (shared)
│   │   ├── ProgressBar.jsx       # Deck-Fortschritt
│   │   └── RemotePill.jsx        # "Remote verbunden" Badge (für Desktop-Export)
│   └── styles/
│       └── index.css             # Importiert design-system.css
├── vite.config.js
├── tailwind.config.js            # Nutzt shared/config/tailwind.preset.js
└── package.json
```

### 7.2 Relay (Vercel Edge Function)

```
api/
└── remote-ws.js                  # WebSocket relay, ~50 Zeilen
```

- Hält Map: `chat_id → { anki: WebSocket, miniapp: WebSocket }`
- Validiert Telegram `initData` HMAC bei Mini-App-Connect
- Validiert shared secret bei Anki-Connect
- Leitet Messages 1:1 durch, kein Processing

### 7.3 Anki Python-Modul

```
plusi/
└── remote_ws.py                  # WebSocket-Client für Relay
```

- Verbindet sich zum Relay mit `chat_id` + shared secret
- Lauscht auf Anki-Hooks (`reviewer_did_show_question`, `state_will_change`)
- Sendet `card_state` bei jedem State-Change
- Empfängt `flip`, `rate`, `mc_select` und ruft bestehende Helfer auf
- Reconnect-Logik mit Exponential Backoff

## 8. Bestehende Code-Änderungen

### 8.1 `plusi/telegram.py`

- Bot-Menü-Button für Mini App registrieren (`setChatMenuButton`)
- `/remote` Command öffnet Mini App Link statt Inline-Buttons
- Bestehende Inline-Remote bleibt als Fallback

### 8.2 `frontend/src/App.jsx`

- Neuer State: `remoteConnected` (Boolean)
- Input-Container: `transform: translateY(remoteConnected ? '100%' : '0')`
- Remote-Pill-Badge wenn connected

### 8.3 `ui/widget.py` / `ui/main_view.py`

- Message-Handler für `remoteConnected`/`remoteDisconnected` vom Python WS-Client
- Weiterleitung an React via `window.ankiReceive()`

### 8.4 `config.py`

- Telegram-Config erweitern: `relay_url`, `relay_secret` (neben bestehendem `bot_token`)

## 9. Sicherheit

- Telegram `initData` wird Server-side (Relay) via HMAC-SHA256 mit Bot-Token validiert
- Anki-Client authentifiziert sich mit shared secret (in config, nicht im Code)
- Relay speichert keine Messages, reines Forwarding
- WebSocket-Verbindungen sind TLS-verschlüsselt (wss://)
- Rate-Limiting auf dem Relay: max 60 Messages/Minute pro `chat_id`

## 10. Nicht im Scope (v1)

- Plusi-Chat in der Mini App (bleibt im normalen Telegram-Chat)
- Statistik-Tab in der Mini App
- Offline-Support / Service Worker
- Multi-Device (mehrere Mini Apps gleichzeitig)
- Karten-Editing über die Remote
