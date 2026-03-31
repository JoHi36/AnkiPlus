# AnkiPlus Remote — PWA

**Datum:** 2026-04-01
**Status:** Design approved
**Ersetzt:** `2026-03-31-telegram-mini-app.md` (Telegram-only → PWA-first)

## 1. Konzept

Eine Progressive Web App die als Fernbedienung für AnkiPlus funktioniert. Zwei Modi:

- **Solo** — Karte auf dem Handy gerendert, volles Review-Erlebnis mobil
- **Duo** — Handy = Remote (Buttons + MC), Laptop = Karten-Canvas

### Leitprinzipien

- **PWA-first:** Funktioniert in jedem Browser, installierbar als App. Telegram ist optionaler Distributionskanal.
- **Ein-Scan-Pairing:** QR-Code in Anki-Settings scannen → sofort verbunden. Kein Account, kein Code eintippen.
- **Ein-Glas-Regel:** Im Duo-Modus hat der Desktop kein Input-Feld — das Handy ist das einzige Eingabegerät.
- **Invisible Addiction:** Alle Oberflächen nutzen `var(--ds-*)` Tokens, `.ds-frosted` / `.ds-deep` Materialien.
- **Slide-Transitions:** Karte gleitet links raus, nächste von rechts rein.

## 2. Architektur

```
┌─────────────┐     HTTP Polling     ┌──────────────┐     HTTP Polling     ┌─────────────┐
│  PWA         │ ◄──────────────►   │ Firebase     │ ◄──────────────►   │  Anki/Qt    │
│  (Browser)  │                    │  Relay       │                    │  (Python)   │
└─────────────┘                    └──────────────┘                    └─────────────┘
       │                                  │                                    │
       │  pair_code (from QR)             │  pair_code + secret               │
       └──────────── automatisches Matching ──────────────────────────────────┘
```

### 2.1 Relay-Server (Firebase Cloud Function)

- Route `/relay` in der bestehenden `api` Express-App
- Hält In-Memory Map: `pair_code → { anki: queue[], miniapp: queue[] }`
- Matching über `pair_code`
- Reine Message-Weiterleitung, kein State, kein Speicher
- Session-TTL: 10 Minuten Inaktivität → automatische Cleanup
- Rate-Limiting: max 60 Messages/Minute pro Session

### 2.2 Pairing-Flow

```
Anki (Settings)                    Relay                         PWA (Handy)
─────────────────────────────────────────────────────────────────────────────
1. User klickt "Remote"
2. POST /relay { action: "create_pair" }
   → pair_code: "A3K9F2"
   → session_token: "abc123..."
3. QR-Code anzeigen:
   https://ankiplus.app/remote?pair=A3K9F2
                                                    4. User scannt QR
                                                    5. PWA öffnet mit ?pair=A3K9F2
                                                    6. POST /relay { action: "join_pair",
                                                       pair_code: "A3K9F2" }
                                                       → session_token: "xyz789..."
                                    7. Match! Beide Clients verbunden
                                    → peer_connected an beide
8. QR verschwindet,
   "Remote verbunden" Pill
                                                    9. PWA speichert session_token
                                                       in localStorage
                                                    10. Nächstes Mal: auto-reconnect
                                                        mit session_token (kein QR)
```

### 2.3 Authentifizierung

- **Anki-Client:** Registriert sich mit `action: "create_pair"` + `secret` (aus config). Bekommt `pair_code` + `session_token` zurück.
- **PWA-Client:** Öffnet mit `?pair=XXXXXX`, sendet `action: "join_pair"` mit dem Code. Bekommt `session_token` zurück.
- **Danach:** Beide Clients authentifizieren sich mit ihrem `session_token` für poll/send.
- **Auto-Reconnect:** PWA speichert `session_token` in `localStorage`. Beim nächsten Besuch → `action: "reconnect"` mit gespeichertem Token.
- **Pair-Code Ablauf:** 5 Minuten, danach ungültig. Neuer QR-Code nötig.

### 2.4 QR-Code Generierung (Python)

- `qrcode` Library (reines Python, keine externe Abhängigkeit)
- Generiert PNG → Base64 → an React via Bridge als Data-URL
- Angezeigt in SettingsSidebar unter "Remote" Sektion

### 2.5 Anki WebSocket-Client (Python)

- Bestehendes Modul `plusi/remote_ws.py` (schon implementiert)
- Polling-basiert über `_relay_post()`
- Sendet Card-State-Updates bei Reviewer-State-Änderungen
- Empfängt Aktionen (flip, rate, mc_select) und führt sie aus

### 2.6 PWA (React)

- Gehostet auf Vercel: `ankiplus.app/remote`
- React + Vite + Tailwind, `design-system.css` importiert
- Shared Components aus `shared/components/` wo passend
- PWA Manifest für Home-Screen Installation

## 3. Relay-Protokoll

Alle Messages sind JSON mit `type`-Feld.

### 3.1 Pairing

| Action | Payload | Response | Wer |
|--------|---------|----------|-----|
| `create_pair` | `{ secret }` | `{ ok, pair_code, session_token }` | Anki |
| `join_pair` | `{ pair_code }` | `{ ok, session_token }` | PWA |
| `reconnect` | `{ session_token }` | `{ ok, peer_connected }` | PWA |

### 3.2 Anki → PWA

| Type | Payload | Wann |
|------|---------|------|
| `card_state` | `{ phase, front_html, back_html, deck, progress: { current, total }, card_id }` | Bei jedem Kartenwechsel und Flip |
| `mc_options` | `{ options: [{ id, text }], card_id }` | Wenn MC für aktive Karte existiert |
| `mc_clear` | `{}` | Wenn keine MC-Optionen aktiv |
| `rated` | `{ ease, next_card_state }` | Bestätigung nach Rating |
| `connected` | `{ deck, state }` | Bei Verbindungsaufbau |
| `disconnected` | `{}` | Bei Trennung |
| `deck_list` | `{ decks: [{ id, name, new, learn, review }] }` | Antwort auf `get_decks` |

### 3.3 PWA → Anki

| Type | Payload | Wann |
|------|---------|------|
| `flip` | `{}` | User tippt "Antwort zeigen" |
| `rate` | `{ ease: 1\|2\|3\|4 }` | User tippt Rating-Button |
| `mc_select` | `{ option_id }` | User wählt MC-Option |
| `open_deck` | `{ deck_id }` | User wählt Deck |
| `set_mode` | `{ mode: "solo"\|"duo" }` | User wechselt Modus |
| `get_decks` | `{}` | Deck-Liste anfordern |

## 4. PWA Screens

### 4.1 Pairing-Screen (Erstverbindung)

```
┌─────────────────────────┐
│                         │
│   ┌─────────────────┐   │
│   │                 │   │
│   │    (Plusi       │   │
│   │     Animation)  │   │
│   │                 │   │
│   └─────────────────┘   │
│                         │
│   Verbinde mit Anki...  │
│                         │
│   Scanne den QR-Code    │
│   in den AnkiPlus       │
│   Settings              │
│                         │
└─────────────────────────┘
```

Wird angezeigt wenn:
- Kein `session_token` in `localStorage`
- Oder `reconnect` fehlgeschlagen

### 4.2 Verbindungs-Screen (Auto-Reconnect)

- Zeigt "Verbinde mit Anki..." mit Plusi-Animation
- Automatischer Reconnect mit gespeichertem `session_token`
- Fallback-Text wenn Anki nicht läuft: "Starte Anki auf deinem Computer"

### 4.3 Modus-Wahl

- Toggle oben: Solo / Duo
- Persistiert in `localStorage`
- Wechsel sendet `set_mode` an Anki

### 4.4 Duo-Modus — Question State

```
┌─────────────────────────┐
│  Anatomie    12/50      │  ← Deck + Fortschritt
│                         │
│                         │
│   ┌─────────────────┐   │
│   │  Antwort zeigen │   │  ← Großer Frosted-Glass-Button
│   └─────────────────┘   │
│                         │
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
│  │ A) Mitochondrien│    │
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

### 4.7 Solo-Modus — Question State

```
┌─────────────────────────┐
│  Anatomie    12/50      │
│  ┌─────────────────┐    │
│  │                 │    │
│  │   Karten-HTML   │    │  ← Full HTML-Rendering
│  │                 │    │
│  └─────────────────┘    │
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
│  │  Front-HTML     │    │
│  └─────────────────┘    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  ┌─────────────────┐    │
│  │  Back-HTML      │    │
│  └─────────────────┘    │
│  ┌────┐┌────┐┌────┐┌────┐
│  │ 1  ││ 2  ││ 3  ││ 4  │
│  └────┘└────┘└────┘└────┘
└─────────────────────────┘
```

### 4.9 Deck-Picker

- Liste der Top-Level-Decks
- Pro Deck: Name + Counts (Neu / Lernen / Wiederholen)
- Tap → `open_deck` → Wechsel zu Review-Screen

## 5. Desktop-Verhalten (Duo-Modus)

### 5.1 Bei Verbindung

1. Input-Feld gleitet nach unten raus (`transform: translateY(100%)`, 300ms ease-out)
2. Pill-Badge "Remote verbunden" (`.ds-frosted`, `var(--ds-green)` Dot)

### 5.2 Bei Trennung

1. Pill-Badge verschwindet (fade-out)
2. Input-Feld gleitet von unten wieder hoch rein

### 5.3 Implementierung (bereits done)

- `App.jsx`: State `remoteConnected` + RemotePill Component
- Input-Container mit `transform` + `transition`
- Python `_handle_peer_change()` sendet Events an React

## 6. Settings-Integration (QR-Code)

### 6.1 SettingsSidebar — "Remote" Sektion

Neue Sektion in `SettingsSidebar.jsx` (unterhalb der bestehenden Sektionen):

```
┌─────────────────────────────────┐
│  Remote                         │
│                                 │
│  ┌───────────────────────┐      │
│  │                       │      │
│  │      ┌─────────┐      │      │
│  │      │ QR-Code │      │      │
│  │      │         │      │      │
│  │      └─────────┘      │      │
│  │                       │      │
│  │  Scanne mit deinem    │      │
│  │  Handy um AnkiPlus    │      │
│  │  Remote zu verbinden  │      │
│  │                       │      │
│  └───────────────────────┘      │
│                                 │
│  Status: Verbunden ●            │  ← Grüner Dot wenn connected
│                                 │
└─────────────────────────────────┘
```

### 6.2 QR-Code Bridge Method

Neuer `@pyqtSlot` in Bridge:

```python
@pyqtSlot(result=str)
def getRemoteQR(self):
    """Generate pairing QR code and register with relay."""
    # 1. Generate pair_code (6 alphanumeric chars)
    # 2. POST to relay: create_pair
    # 3. Generate QR with qrcode library
    # 4. Return { qr_data_url: "data:image/png;base64,...", pair_code: "A3K9F2" }
```

## 7. Animationen (PWA)

### 7.1 Slide-Transition (Kartenwechsel)

- Aktuelle Karte gleitet nach links raus (`translateX(-100%)`, 250ms)
- Neue Karte kommt von rechts rein (`translateX(100%) → 0`, 250ms)
- `framer-motion` `AnimatePresence` mit `key={card_id}`

### 7.2 Phase-Transition (Question → Answer)

- Rating-Buttons faden rein von unten (`opacity: 0→1`, `translateY(20px→0)`, 200ms)
- Im Solo-Modus: Back-HTML expandiert von der Divider-Linie

### 7.3 Rating-Feedback

- Getippter Button: kurzer Scale-Pulse (`1.0 → 0.95 → 1.0`, 150ms)
- Dann Slide-Transition zur nächsten Karte

## 8. Tech-Stack

| Komponente | Technologie |
|-----------|------------|
| PWA | React 18 + Vite + Tailwind + `design-system.css` |
| Animationen | `framer-motion` |
| PWA Manifest | `manifest.json` (standalone, theme-color) |
| QR-Code (Python) | `qrcode` Library → Base64 PNG |
| Relay | Firebase Cloud Function (Express Route) |
| Anki Client | Python `urllib` polling (bestehendes `plusi/remote_ws.py`) |
| Styling | `var(--ds-*)` Tokens, `.ds-frosted`, `.ds-deep` |

### 8.1 PWA Dateistruktur

```
remote/
├── index.html
├── manifest.json
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── hooks/
│   │   ├── useRemoteSocket.js
│   │   └── useCardState.js
│   ├── components/
│   │   ├── RemoteView.jsx        # Hauptcontainer (Solo/Duo Switch)
│   │   ├── DeckPicker.jsx
│   │   ├── QuestionScreen.jsx
│   │   ├── AnswerScreen.jsx
│   │   ├── MCScreen.jsx
│   │   ├── ConnectingScreen.jsx
│   │   ├── PairingScreen.jsx     # Erstverbindung (kein Token)
│   │   ├── RatingButtons.jsx
│   │   ├── ProgressBar.jsx
│   │   └── CardHTML.jsx
│   └── styles/
│       └── index.css
├── vite.config.js
├── tailwind.config.js
└── package.json
```

### 8.2 Relay (Firebase)

Neue Route in `functions/src/index.ts`:

```
app.post('/relay', relayHandler);
```

Handler in `functions/src/handlers/relay.ts`.

### 8.3 PWA Manifest

```json
{
  "name": "AnkiPlus Remote",
  "short_name": "AnkiPlus",
  "start_url": "/remote/",
  "display": "standalone",
  "background_color": "#141416",
  "theme_color": "#141416",
  "icons": [{ "src": "icon-192.png", "sizes": "192x192" }]
}
```

## 9. Bestehender Code — Was sich ändert

### 9.1 Relay (NEU)

- `functions/src/handlers/relay.ts` — Relay-Logik (Pairing + Message-Forwarding)
- `functions/src/index.ts` — Route `/relay` hinzufügen

### 9.2 QR-Code Bridge (NEU)

- `ui/bridge.py` — `getRemoteQR()` Slot
- `plusi/remote_ws.py` — `create_pair()` Funktion ergänzen

### 9.3 Settings UI (MODIFY)

- `frontend/src/components/SettingsSidebar.jsx` — "Remote" Sektion mit QR-Code
- `ui/settings_sidebar.py` — Bridge-Wiring für QR

### 9.4 PWA Auth (MODIFY)

- `remote/src/hooks/useRemoteSocket.js` — Pairing statt Telegram initData
- `remote/src/App.jsx` — PairingScreen statt immer ConnectingScreen

### 9.5 Bereits implementiert (KEEP)

- `plusi/remote_ws.py` — RelayClient (Polling, Message-Handling)
- `frontend/src/components/RemotePill.jsx` — Desktop Pill-Badge
- `frontend/src/App.jsx` — remoteConnected State + Input-Slide
- `remote/src/components/*` — Alle Review-Screens
- `config.py` — telegram.relay_url, telegram.relay_secret
- `__init__.py` — Lifecycle-Wiring

## 10. Sicherheit

- Pair-Code: 6 alphanumerische Zeichen (36^6 ≈ 2 Milliarden Kombinationen)
- Pair-Code Ablauf: 5 Minuten
- Session-Token: 32 Byte random hex
- Relay speichert keine Messages, reines Forwarding
- HTTPS only (Vercel + Firebase)
- Rate-Limiting: max 60 Messages/Minute pro Session

## 11. Telegram als optionaler Kanal

Die PWA kann auch als Telegram Mini App geladen werden:
- Bot Menu Button öffnet `ankiplus.app/remote`
- Telegram `initData` wird als alternativer Auth-Pfad unterstützt (neben Pairing)
- Kein Telegram-Account nötig für die PWA

## 12. Nicht im Scope (v1)

- Plusi-Chat in der PWA
- Statistik-Tab
- Offline-Support / Service Worker
- Multi-Device (mehrere Remotes gleichzeitig)
- Karten-Editing über Remote
- Push-Notifications
