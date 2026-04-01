# AnkiPlus Remote — Clean PWA Redesign

**Datum:** 2026-04-01
**Status:** Design approved
**Ersetzt:** `2026-04-01-ankiplus-remote-pwa.md` (inkrementeller Ansatz → sauberes Modul)

## 1. Problem

Das Remote-Feature wurde inkrementell gebaut (Telegram → PWA → QR-Pairing). Ergebnis: 12 von 15 Commits sind Fixes, Code ist über 6 Dateien verstreut, 3x duplizierte QR-Generierung, Thread-Crashes, Race Conditions durch `time.sleep()`.

## 2. Ziel

Ein sauberes `remote/` Python-Package das die gesamte Remote-Logik besitzt. Einmal pairen, danach auto-reconnect. Anki-State treibt den Modus (Duo/Solo) automatisch.

## 3. Architektur

```
┌──────────────┐     HTTP Polling     ┌──────────────┐     HTTP Polling     ┌──────────────┐
│  PWA          │ ◄──────────────►   │  Firebase    │ ◄──────────────►   │  Anki/Qt     │
│  (Phone)     │                    │  Relay       │                    │  remote/     │
└──────────────┘                    └──────────────┘                    └──────────────┘
```

### 3.1 Python-Package `remote/`

```
remote/
├── __init__.py      # start(), stop(), get_client() — public API
├── client.py        # RelayClient — polling, send, pairing, reconnect
├── actions.py       # Card-Ops: flip, rate, open_deck, get_decks (aus telegram.py)
└── state.py         # AnkiStateReporter — Hook-basierte State-Updates an PWA
```

**Verantwortlichkeiten:**

| Datei | Aufgabe |
|-------|---------|
| `__init__.py` | Lifecycle (start/stop), Config lesen, Client-Singleton |
| `client.py` | RelayClient: polling thread, send(), pair/reconnect, thread-safe callbacks |
| `actions.py` | Anki-Operationen: `flip()`, `rate(ease)`, `open_deck(id)`, `get_decks()`, `get_current_card()` |
| `state.py` | Subscribt auf Anki-Hooks, sendet `card_state` + `anki_state` an PWA |

### 3.2 Thread-Safety

**Regel:** Kein Code in `remote/` ruft Qt-Operationen direkt aus dem Polling-Thread auf.

`client.py` bietet eine Methode `dispatch_on_main(fn)`:

```python
def dispatch_on_main(self, fn):
    """Schedule fn on Qt main thread. Used by all callbacks."""
    QTimer.singleShot(0, fn)
```

Der Polling-Loop ruft Callbacks so auf:

```python
def _handle_message(self, msg):
    parsed = _parse_action(msg)
    if parsed and self._action_handler:
        at, p = parsed  # capture in local vars to avoid closure bug
        self.dispatch_on_main(lambda at=at, p=p: self._action_handler(at, p))
```

Peer-Change genauso:

```python
if msg_type == "peer_connected":
    self._peer_connected = True
    if self._on_peer_change:
        self.dispatch_on_main(lambda: self._on_peer_change(True))
```

### 3.2.1 Desktop React-App Benachrichtigung

`state.py` sendet auch an die Desktop React-App (für RemotePill):

```python
def _notify_desktop(self, connected):
    """Send remoteConnected/remoteDisconnected to main React app."""
    from .actions import _run_on_main
    def _fn():
        from aqt import mw
        from ..ui.main_view import get_main_view
        view = get_main_view()
        if view and hasattr(view, '_chatbot') and view._chatbot and view._chatbot.web_view:
            payload = json.dumps({
                "type": "remoteConnected" if connected else "remoteDisconnected",
                "data": {"connected": connected}
            })
            view._chatbot.web_view.page().runJavaScript(
                f"window.ankiReceive && window.ankiReceive({payload});"
            )
    _run_on_main(_fn)
```

Wird von `on_peer_change` Callback aufgerufen — so bleibt `RemotePill` in `App.jsx` funktionsfähig.

### 3.3 Actions (aus `plusi/telegram.py` extrahiert)

`remote/actions.py` enthält reine Anki-Operationen, Thread-safe via `_run_on_main()`:

Alle Funktionen bekommen `client` als Parameter (Dependency Injection, kein globaler Import):

```python
def flip(client):
    """Show answer + send state to PWA. Runs on main thread."""
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer:
            return
        mw.reviewer._showAnswer()
        # Atomar: wir sind auf Main-Thread, State ist garantiert aktuell
        client.send(_build_card_state_from_reviewer(phase="answer"))
    _run_on_main(_fn)

def rate(client, ease):
    """Rate current card. State-Update kommt via Hook (reviewer_did_show_question)."""
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer or not mw.reviewer.card:
            return
        mw.reviewer._answerCard(ease)
        # KEIN send() — Anki zeigt nächste Karte → Hook feuert → state.py sendet
    _run_on_main(_fn)

def open_deck(client, deck_id):
    """Open deck and start review. Runs on main thread."""
    # ... analog, sendet card_state nach Deck-Wechsel

def get_decks(client):
    """Return list of decks with due counts, send to PWA."""
    # ... analog

def get_current_card():
    """Return {front_html, back_html, deck, card_id, progress}."""
    # ... analog, rein lokal (kein client nötig)
```

**Kein `time.sleep()`.** State-Updates werden durch Anki-Hooks getrieben, nicht durch Warten.

### 3.4 State-Broadcasting (Hook-basiert)

`remote/state.py` registriert sich auf Anki-Hooks und sendet Updates:

```python
class AnkiStateReporter:
    def __init__(self, client):
        self.client = client

    def register_hooks(self):
        gui_hooks.reviewer_did_show_question.append(self._on_show_question)
        gui_hooks.state_will_change.append(self._on_state_change)

    def _on_show_question(self, card):
        """Anki zeigt neue Frage → card_state an PWA senden."""
        if not self.client.is_peer_connected:
            return
        state = _build_card_state(card, phase="question")
        self.client.send(state)

    def _on_state_change(self, new_state, old_state):
        """Anki-State ändert sich → anki_state an PWA senden."""
        if not self.client.is_peer_connected:
            return
        mapped = _map_anki_state(new_state)  # "reviewing" | "browsing" | "idle"
        self.client.send({"type": "anki_state", "state": mapped})
```

**Answer-Phase:** Wenn der Reviewer die Antwort zeigt, feuert `reviewer_did_show_question` NICHT. Stattdessen:
- Remote `flip()` ruft `mw.reviewer._showAnswer()` auf
- `_showAnswer()` triggert Anki intern → wir haken in `webview_will_set_content` oder nutzen den bestehenden Hook in `__init__.py:on_reviewer_did_show_question`, der bereits bei Answer-State sendet
- Alternative: `actions.flip()` sendet nach dem `_showAnswer()` Call direkt den card_state mit `phase="answer"` — da wir bereits auf dem Main-Thread sind, ist das atomar und race-free

**Entscheidung:** `actions.flip()` sendet den State selbst (einfacher, kein zusätzlicher Hook nötig). Siehe Signatur in Sektion 3.3.

`rate()` muss KEINEN State senden — nach dem Rating zeigt Anki die nächste Karte, was `reviewer_did_show_question` triggert → `state.py` sendet automatisch.

### 3.5 Config

Alte `telegram.*` Keys werden beim Start einmalig nach `remote.*` migriert:

```python
# In remote/__init__.py
DEFAULTS = {
    "relay_url": "https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay",
    "relay_secret": "",
    "app_url": "https://ankiplus.app/remote",
    "session_token": None,  # persistiert nach erstem Pairing
}

def _migrate_config(config):
    """Einmalig: telegram.* → remote.* migrieren."""
    tg = config.get("telegram", {})
    if tg.get("relay_url") and not config.get("remote", {}).get("relay_url"):
        config["remote"] = {
            "relay_url": tg["relay_url"],
            "relay_secret": tg.get("relay_secret", ""),
            "app_url": tg.get("remote_app_url", DEFAULTS["app_url"]),
        }
```

## 4. Pairing-Flow (einmalig)

```
Anki Settings                     Relay                          PWA (Handy)
───────────────────────────────────────────────────────────────────────────
1. User klickt "Remote verbinden"
2. client.create_pair()
   POST /relay {action: create_pair}
   → pair_code: "A3K9F2"
   → session_token gespeichert
3. QR-Code in SettingsSidebar:
   https://ankiplus.app/remote?pair=A3K9F2
                                                  4. User scannt QR
                                                  5. POST /relay {action: join_pair}
                                                     → session_token gespeichert
                                              6. Beide Seiten verbunden
7. Config speichert session_token              7. localStorage speichert token
   → ab jetzt auto-reconnect                     → ab jetzt auto-reconnect
```

**Auto-Reconnect bei Neustart:**

```python
def start():
    config = get_config().get("remote", {})
    token = config.get("session_token")
    if token:
        # Reconnect mit bestehendem Token
        client.reconnect(token)
    # Kein Token → warten bis User in Settings pairt
```

## 5. PWA-Änderungen

### 5.1 Relay-URL externalisieren

```javascript
// .env
VITE_RELAY_URL=https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay

// App.jsx
const RELAY_URL = import.meta.env.VITE_RELAY_URL;
```

### 5.2 Auto-Modus (Duo ↔ Solo)

PWA empfängt neuen Message-Type `anki_state`:

```javascript
// useRemoteSocket.js
if (msg.type === 'anki_state') {
    setAnkiState(msg.state); // "reviewing" | "browsing" | "idle"
}
```

```javascript
// App.jsx — Modus-Logik
const effectiveMode = useMemo(() => {
    if (ankiState === 'reviewing') return 'duo';
    return 'solo';
}, [ankiState]);
```

Kein manueller Toggle mehr nötig (aber möglich als Override falls gewünscht).

### 5.3 Abhängigkeiten aufräumen

- `@twa-dev/sdk` entfernen (Telegram-Relikt)
- Hardcoded Relay-URL in `App.jsx` → Environment Variable

## 6. Relay (Firebase Cloud Function)

Keine Änderungen nötig. Der Handler in `functions/src/handlers/relay.ts` ist sauber. Das Protokoll (`create_pair`, `join_pair`, `reconnect`, `poll`, `send`, `disconnect`) bleibt identisch.

## 7. Aufräumen — Was gelöscht wird

| Datei | Was | Warum |
|-------|-----|-------|
| `plusi/remote_ws.py` | Ganze Datei | Ersetzt durch `remote/client.py` |
| `ui/bridge.py` | `getRemoteQR()`, `getRemoteStatus()` | Nur noch in settings_sidebar |
| `ui/widget.py` | `_msg_get_remote_qr()`, `_msg_get_remote_status()` | Duplikat, weg |
| `__init__.py` | `_start_remote_relay()`, `_handle_remote_action()`, `_handle_peer_change()`, `_send_current_card_state()` | Wandert nach `remote/` |
| `frontend/src/components/SettingsSidebar.jsx` | Hardcoded Fallback-URL | Kommt aus Config |

### Was in `plusi/telegram.py` bleibt vs. geht

| Funktion | Verbleibt? | Grund |
|----------|------------|-------|
| `_run_on_main()` | → `remote/actions.py` (kopiert) | Brauchen wir im Remote-Kontext |
| `_get_current_card()` | → `remote/actions.py` | Remote-spezifisch |
| `_get_deck_list()` | → `remote/actions.py` | Remote-spezifisch |
| `_open_deck()` | → `remote/actions.py` | Remote-spezifisch |
| `_rate_card()` | → `remote/actions.py` | Remote-spezifisch |
| `_show_answer()` | → `remote/actions.py` | Remote-spezifisch |
| `_notify_frontend()` | Bleibt in telegram.py | Wird noch von Telegram-Bot genutzt |
| `AnkiPlusTelegramBot` | Bleibt in telegram.py | Telegram-Bot ist separat |

## 8. Integration in `__init__.py`

Vorher (130 Zeilen Remote-Code in `__init__.py`):
```python
def _start_remote_relay(): ...
def _handle_remote_action(action_type, params): ...
def _send_current_card_state(client, phase="question"): ...
def _handle_peer_change(connected): ...
```

Nachher (5 Zeilen):
```python
def on_profile_loaded():
    # ... existing code ...
    
    # Start remote if previously paired
    from .remote import start
    start()
```

## 9. Phase 2 (nicht in Scope)

- **Lokaler HTTP-Server** für Offline-Mac (Phone-Hotspot-Szenario)
- Dual-Transport: Relay + lokaler Server, gleiches Protokoll
- Erfordert `remote/local_server.py` + PWA Fallback-Logik

## 10. Dateien die erstellt/geändert werden

### Neu
- `remote/__init__.py`
- `remote/client.py`
- `remote/actions.py`
- `remote/state.py`

### Geändert
- `__init__.py` — Remote-Code durch `remote.start()` ersetzen
- `config.py` — `remote.*` Defaults hinzufügen
- `ui/settings_sidebar.py` — QR-Generierung vereinfachen (kein Thread, direkt client.pair_code nutzen)
- `ui/bridge.py` — Remote-Methoden entfernen
- `ui/widget.py` — Remote-Methoden entfernen
- `frontend/src/components/SettingsSidebar.jsx` — Hardcoded URL entfernen
- `remote/src/App.jsx` — RELAY_URL aus env, anki_state Handling
- `remote/src/hooks/useRemoteSocket.js` — anki_state Message-Type
- `remote/.env` — VITE_RELAY_URL

### Gelöscht
- `plusi/remote_ws.py`
