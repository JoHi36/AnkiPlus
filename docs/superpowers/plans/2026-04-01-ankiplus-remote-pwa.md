# AnkiPlus Remote PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Telegram Mini App remote to a PWA with QR-code pairing, deployed on Firebase (relay) + Vercel (PWA), usable from any phone browser.

**Architecture:** QR code in Settings generates a pair code, user scans → PWA opens and auto-connects via Firebase relay. Session tokens persisted in localStorage for auto-reconnect. Existing review screens, hooks, and Python client are reused — only the auth layer and relay change.

**Tech Stack:** Firebase Cloud Functions (TypeScript relay handler), React PWA (existing `remote/`), Python `qrcode` library (QR generation), `plusi/remote_ws.py` (polling client).

**Spec:** `docs/superpowers/specs/2026-04-01-ankiplus-remote-pwa.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `functions/src/handlers/relay.ts` | Relay handler: pairing, polling, message forwarding |
| `remote/public/manifest.json` | PWA manifest (standalone, theme, icons) |
| `remote/public/icon-192.png` | PWA icon (192x192) |
| `remote/public/icon-512.png` | PWA icon (512x512) |
| `remote/src/components/PairingScreen.jsx` | "Scan QR" screen for first-time users |

### Modified Files

| File | Change |
|------|--------|
| `functions/src/index.ts` | Add `app.post('/relay', relayHandler)` route |
| `plusi/remote_ws.py` | Replace `chat_id`-based auth with `pair_code` + `session_token` |
| `tests/test_remote_ws.py` | Update tests for new pairing auth |
| `ui/bridge.py` | Add `getRemoteQR()` slot |
| `frontend/src/components/SettingsSidebar.jsx` | Add "Remote" section with QR code |
| `remote/src/hooks/useRemoteSocket.js` | Replace Telegram initData with pair_code + session_token auth |
| `remote/src/App.jsx` | Add PairingScreen, auto-reconnect logic |
| `remote/index.html` | Add manifest link |
| `config.py` | Add `remote_app_url` to telegram config defaults |

---

## Task 1: Firebase Relay Handler

**Files:**
- Create: `functions/src/handlers/relay.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Create the relay handler**

Create `functions/src/handlers/relay.ts`:

```typescript
import { Request, Response } from 'express';
import * as crypto from 'crypto';

// In-memory session store (resets on cold start — acceptable for relay)
const sessions = new Map<string, {
  anki: { token: string; queue: any[]; lastSeen: number };
  pwa: { token: string; queue: any[]; lastSeen: number };
  pairCode: string;
}>();

// Pair codes waiting for a PWA to join
const pendingPairs = new Map<string, { ankiToken: string; secret: string; createdAt: number }>();

const SESSION_TTL_MS = 10 * 60 * 1000;  // 10 min inactivity
const PAIR_TTL_MS = 5 * 60 * 1000;      // 5 min to scan QR
const MAX_QUEUE_SIZE = 50;
const RELAY_SECRET = process.env.RELAY_SECRET || '';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for readability
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function cleanStale(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.anki.lastSeen > SESSION_TTL_MS && now - s.pwa.lastSeen > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
  for (const [code, p] of pendingPairs) {
    if (now - p.createdAt > PAIR_TTL_MS) {
      pendingPairs.delete(code);
    }
  }
}

function findSessionByToken(token: string): { session: any; role: 'anki' | 'pwa' } | null {
  for (const s of sessions.values()) {
    if (s.anki.token === token) return { session: s, role: 'anki' };
    if (s.pwa.token === token) return { session: s, role: 'pwa' };
  }
  return null;
}

export async function relayHandler(req: Request, res: Response): Promise<void> {
  cleanStale();

  const { action, secret, pair_code, session_token, message } = req.body || {};

  if (!action) {
    res.status(400).json({ error: 'Missing action' });
    return;
  }

  // ── create_pair: Anki creates a new pairing code ──
  if (action === 'create_pair') {
    if (!RELAY_SECRET || secret !== RELAY_SECRET) {
      res.status(401).json({ error: 'Invalid secret' });
      return;
    }
    const pairCode = generatePairCode();
    const ankiToken = generateToken();
    pendingPairs.set(pairCode, { ankiToken, secret, createdAt: Date.now() });
    res.json({ ok: true, pair_code: pairCode, session_token: ankiToken });
    return;
  }

  // ── join_pair: PWA joins with a pair code from QR ──
  if (action === 'join_pair') {
    const pending = pendingPairs.get(pair_code);
    if (!pending) {
      res.status(404).json({ error: 'Invalid or expired pair code' });
      return;
    }
    pendingPairs.delete(pair_code);
    const pwaToken = generateToken();
    const sessionId = generateToken().slice(0, 16);
    const now = Date.now();
    sessions.set(sessionId, {
      anki: { token: pending.ankiToken, queue: [{ type: 'peer_connected' }], lastSeen: now },
      pwa: { token: pwaToken, queue: [], lastSeen: now },
      pairCode: pair_code,
    });
    res.json({ ok: true, session_token: pwaToken });
    return;
  }

  // ── reconnect: PWA reconnects with stored session_token ──
  if (action === 'reconnect') {
    const found = findSessionByToken(session_token);
    if (!found) {
      res.status(404).json({ error: 'Session expired' });
      return;
    }
    found.session[found.role].lastSeen = Date.now();
    const otherRole = found.role === 'anki' ? 'pwa' : 'anki';
    const peerConnected = Date.now() - found.session[otherRole].lastSeen < SESSION_TTL_MS;
    res.json({ ok: true, peer_connected: peerConnected });
    return;
  }

  // ── poll: get pending messages ──
  if (action === 'poll') {
    const found = findSessionByToken(session_token);
    if (!found) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const self = found.session[found.role];
    self.lastSeen = Date.now();
    const messages = self.queue.splice(0);
    res.json({ ok: true, messages });
    return;
  }

  // ── send: send message to peer ──
  if (action === 'send') {
    const found = findSessionByToken(session_token);
    if (!found) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }
    found.session[found.role].lastSeen = Date.now();
    const otherRole = found.role === 'anki' ? 'pwa' : 'anki';
    const other = found.session[otherRole];
    if (other.queue.length < MAX_QUEUE_SIZE) {
      other.queue.push(message);
    }
    res.json({ ok: true });
    return;
  }

  // ── disconnect ──
  if (action === 'disconnect') {
    const found = findSessionByToken(session_token);
    if (found) {
      const otherRole = found.role === 'anki' ? 'pwa' : 'anki';
      found.session[otherRole].queue.push({ type: 'peer_disconnected' });
    }
    res.json({ ok: true });
    return;
  }

  res.status(400).json({ error: 'Unknown action' });
}
```

- [ ] **Step 2: Register the route in index.ts**

In `functions/src/index.ts`, add the import and route:

After the other handler imports (around line 17), add:

```typescript
import { relayHandler } from './handlers/relay';
```

After `app.post('/embed', validateToken, embedHandler);` (line 100), add:

```typescript
// Remote relay — no auth middleware, relay handles its own auth
app.post('/relay', relayHandler);
```

- [ ] **Step 3: Build to verify**

Run: `cd functions && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add functions/src/handlers/relay.ts functions/src/index.ts
git commit -m "feat(functions): add relay handler with pair-code auth for PWA remote"
```

---

## Task 2: Update Python Relay Client for Pairing

**Files:**
- Modify: `plusi/remote_ws.py`
- Modify: `tests/test_remote_ws.py`

- [ ] **Step 1: Update tests for new pairing API**

In `tests/test_remote_ws.py`, replace the `TestRelayClient` class:

```python
class TestRelayClient:
    """Test the RelayClient lifecycle."""

    def test_client_init_defaults(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient(
            relay_url="https://example.com/api/relay",
            secret="test",
        )
        assert client.relay_url == "https://example.com/api/relay"
        assert not client.is_connected
        assert client.mode == "duo"
        assert client.pair_code is None
        assert client.session_token is None

    def test_client_set_mode(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        client.mode = "solo"
        assert client.mode == "solo"
```

Add a new test class for `create_pair`:

```python
class TestCreatePair:
    """Test pairing code generation."""

    def test_create_pair_builds_correct_payload(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "mysecret")
        # We can't test network calls, but we can test the payload builder
        payload = client._build_create_pair_payload()
        assert payload["action"] == "create_pair"
        assert payload["secret"] == "mysecret"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_remote_ws -v`
Expected: Failures — `pair_code`, `session_token`, `_build_create_pair_payload` not found

- [ ] **Step 3: Update RelayClient for pairing**

In `plusi/remote_ws.py`, replace the `RelayClient.__init__` and update `start()`:

```python
class RelayClient:
    """Manages connection to the Firebase relay for remote control."""

    def __init__(self, relay_url, secret):
        self.relay_url = relay_url
        self.secret = secret
        self.mode = "duo"
        self.pair_code = None
        self.session_token = None
        self._connected = False
        self._peer_connected = False
        self._stop_event = threading.Event()
        self._thread = None
        self._action_handler = None
        self._on_peer_change = None
        self._on_pair_created = None
```

Update `start()` to use `create_pair`:

```python
    def start(self):
        """Create a pairing code and start polling."""
        if self._thread and self._thread.is_alive():
            return True

        # Create a new pairing session
        resp = _relay_post(self.relay_url, self._build_create_pair_payload())
        if not resp or not resp.get("ok"):
            logger.error("remote_ws: create_pair failed")
            return False

        self.pair_code = resp.get("pair_code")
        self.session_token = resp.get("session_token")
        self._connected = True

        if self._on_pair_created:
            self._on_pair_created(self.pair_code)

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._poll_loop,
            daemon=True,
            name="AnkiRemoteRelay",
        )
        self._thread.start()
        logger.info("remote_ws: started, pair_code=%s", self.pair_code)
        return True
```

Add the payload builder and update poll/send to use `session_token`:

```python
    def _build_create_pair_payload(self):
        """Build payload for create_pair action."""
        return {"action": "create_pair", "secret": self.secret}

    def set_pair_created_handler(self, handler):
        """Set callback for pair code creation: handler(pair_code: str)."""
        self._on_pair_created = handler
```

Update `stop()`:

```python
    def stop(self):
        """Stop polling and disconnect."""
        self._stop_event.set()
        self._connected = False

        if self.session_token:
            _relay_post(self.relay_url, {
                "action": "disconnect",
                "session_token": self.session_token,
            })

        if self._peer_connected:
            self._peer_connected = False
            if self._on_peer_change:
                self._on_peer_change(False)

        self.pair_code = None
        self.session_token = None
        logger.info("remote_ws: stopped")
```

Update `send()`:

```python
    def send(self, message):
        """Send a message to the PWA via relay."""
        if not self._connected or not self.session_token:
            return
        _relay_post(self.relay_url, {
            "action": "send",
            "session_token": self.session_token,
            "message": message,
        })
```

Update `_poll_loop()`:

```python
    def _poll_loop(self):
        """Polling loop — runs in daemon thread."""
        while not self._stop_event.is_set():
            try:
                if not self.session_token:
                    self._stop_event.wait(RETRY_DELAY)
                    continue

                resp = _relay_post(self.relay_url, {
                    "action": "poll",
                    "session_token": self.session_token,
                })

                if resp and resp.get("ok"):
                    for msg in resp.get("messages", []):
                        self._handle_message(msg)

            except Exception as exc:
                logger.error("remote_ws: poll error: %s", exc)
                if not self._stop_event.is_set():
                    self._stop_event.wait(RETRY_DELAY)
                    continue

            self._stop_event.wait(POLL_INTERVAL)

        logger.info("remote_ws: poll loop exited")
```

Update `get_client()` to remove `chat_id`:

```python
def get_client():
    """Get or create the singleton RelayClient."""
    global _client
    if _client is None:
        config = get_config()
        tg = config.get("telegram", {})
        relay_url = tg.get("relay_url", "").strip()
        secret = tg.get("relay_secret", "").strip()
        if not relay_url or not secret:
            return None
        _client = RelayClient(relay_url, secret)
    return _client
```

Also update `TestRelayClientCallbacks` to use new constructor:

```python
class TestRelayClientCallbacks:
    """Test that RelayClient routes messages to callbacks."""

    def test_peer_connected_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        events = []
        client.set_peer_change_handler(lambda c: events.append(c))
        client._handle_message({"type": "peer_connected"})
        assert events == [True]
        assert client.is_peer_connected

    def test_peer_disconnected_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        client._peer_connected = True
        events = []
        client.set_peer_change_handler(lambda c: events.append(c))
        client._handle_message({"type": "peer_disconnected"})
        assert events == [False]
        assert not client.is_peer_connected

    def test_action_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        actions = []
        client.set_action_handler(lambda t, p: actions.append((t, p)))
        client._handle_message({"type": "rate", "ease": 2})
        assert actions == [("rate", {"ease": 2})]

    def test_unknown_message_no_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        actions = []
        client.set_action_handler(lambda t, p: actions.append((t, p)))
        client._handle_message({"type": "bogus_xyz"})
        assert actions == []
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_remote_ws -v`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add plusi/remote_ws.py tests/test_remote_ws.py
git commit -m "feat(plusi): update relay client for pair-code auth (PWA)"
```

---

## Task 3: QR Code Bridge Method

**Files:**
- Modify: `ui/bridge.py`

- [ ] **Step 1: Add getRemoteQR slot**

At the end of `ui/bridge.py` (before the closing of the class), add:

```python
    @pyqtSlot(result=str)
    def getRemoteQR(self):
        """Generate pairing QR code and start relay client.

        Returns JSON: { qr_data_url: "data:image/png;base64,...", pair_code: "A3K9F2" }
        Or: { error: "..." }
        """
        try:
            try:
                from ..plusi.remote_ws import get_client, start_remote
                from ..config import get_config
            except ImportError:
                from plusi.remote_ws import get_client, start_remote
                from config import get_config

            config = get_config()
            tg = config.get("telegram", {})
            relay_url = tg.get("relay_url", "").strip()
            remote_app_url = tg.get("remote_app_url", "").strip()

            if not relay_url:
                return json.dumps({"error": "relay_url not configured"})

            # Start the relay client (creates pair code)
            if not start_remote():
                return json.dumps({"error": "Could not connect to relay"})

            client = get_client()
            if not client or not client.pair_code:
                return json.dumps({"error": "No pair code generated"})

            # Build QR URL
            pair_url = f"{remote_app_url}?pair={client.pair_code}"

            # Generate QR code as base64 PNG
            import io
            import base64
            try:
                import qrcode
                qr = qrcode.QRCode(version=1, box_size=8, border=2)
                qr.add_data(pair_url)
                qr.make(fit=True)
                img = qr.make_image(fill_color="#FFFFFF", back_color="#141416")
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                data_url = f"data:image/png;base64,{b64}"
            except ImportError:
                # qrcode not installed — return URL for manual entry
                logger.warning("qrcode library not installed, returning URL only")
                data_url = ""

            return json.dumps({
                "qr_data_url": data_url,
                "pair_code": client.pair_code,
                "pair_url": pair_url,
            })

        except Exception as e:
            logger.exception("getRemoteQR error: %s", e)
            return json.dumps({"error": str(e)})

    @pyqtSlot(result=str)
    def getRemoteStatus(self):
        """Get current remote connection status."""
        try:
            try:
                from ..plusi.remote_ws import get_client
            except ImportError:
                from plusi.remote_ws import get_client

            client = get_client()
            if not client:
                return json.dumps({"connected": False, "peer_connected": False})

            return json.dumps({
                "connected": client.is_connected,
                "peer_connected": client.is_peer_connected,
                "pair_code": client.pair_code,
                "mode": client.mode,
            })
        except Exception as e:
            logger.exception("getRemoteStatus error: %s", e)
            return json.dumps({"connected": False, "peer_connected": False})
```

- [ ] **Step 2: Add remote_app_url to config defaults**

In `config.py`, add `remote_app_url` to the telegram section:

```python
    "telegram": {
        "enabled": False,
        "bot_token": "",
        "keep_awake": False,
        "relay_url": "",
        "relay_secret": "",
        "remote_app_url": "",    # PWA URL (e.g. https://ankiplus-remote.vercel.app/remote/)
    },
```

- [ ] **Step 3: Run all tests**

Run: `python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add ui/bridge.py config.py
git commit -m "feat(bridge): add getRemoteQR and getRemoteStatus slots"
```

---

## Task 4: Settings Sidebar — Remote Section

**Files:**
- Modify: `frontend/src/components/SettingsSidebar.jsx`

- [ ] **Step 1: Add Remote section to SettingsSidebar**

At the end of the existing settings sections (before the closing wrapper), add:

```jsx
{/* ── Remote ── */}
<RemoteSection bridge={bridge} />
```

Add the `RemoteSection` component above the main export (within the same file):

```jsx
const QR_CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--ds-space-md)',
  padding: 'var(--ds-space-lg)',
  background: 'var(--ds-bg-canvas)',
  borderRadius: 'var(--ds-radius-lg)',
  border: '1px solid var(--ds-border)',
};

const QR_IMG_STYLE = {
  width: 200,
  height: 200,
  borderRadius: 'var(--ds-radius-md)',
};

const STATUS_DOT_STYLE = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
  marginRight: 'var(--ds-space-xs)',
};

function RemoteSection({ bridge }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ connected: false, peer_connected: false });

  const generateQR = useCallback(async () => {
    if (!bridge?.getRemoteQR) return;
    setLoading(true);
    setError(null);
    try {
      const result = JSON.parse(bridge.getRemoteQR());
      if (result.error) {
        setError(result.error);
      } else {
        setQrData(result);
      }
    } catch (e) {
      setError('Fehler beim Generieren');
    }
    setLoading(false);
  }, [bridge]);

  // Poll status every 2s when QR is shown
  useEffect(() => {
    if (!qrData || !bridge?.getRemoteStatus) return;
    const interval = setInterval(() => {
      try {
        const s = JSON.parse(bridge.getRemoteStatus());
        setStatus(s);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [qrData, bridge]);

  return (
    <div style={{ marginTop: 'var(--ds-space-lg)' }}>
      <h3 style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 'var(--ds-space-sm)' }}>
        Remote
      </h3>

      {!qrData ? (
        <button
          onClick={generateQR}
          disabled={loading}
          style={{
            width: '100%',
            padding: 'var(--ds-space-md)',
            borderRadius: 'var(--ds-radius-lg)',
            border: '1px solid var(--ds-border)',
            background: 'var(--ds-bg-canvas)',
            color: 'var(--ds-text-primary)',
            fontSize: 'var(--ds-text-sm)',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Verbindung wird hergestellt...' : 'Remote verbinden'}
        </button>
      ) : (
        <div style={QR_CONTAINER_STYLE}>
          {status.peer_connected ? (
            <div style={{ textAlign: 'center' }}>
              <span style={{ ...STATUS_DOT_STYLE, background: 'var(--ds-green)' }} />
              <span style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-green)' }}>Verbunden</span>
            </div>
          ) : (
            <>
              {qrData.qr_data_url ? (
                <img src={qrData.qr_data_url} alt="QR Code" style={QR_IMG_STYLE} />
              ) : (
                <div style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-secondary)', textAlign: 'center' }}>
                  Öffne auf deinem Handy:<br />
                  <span style={{ color: 'var(--ds-accent)', wordBreak: 'break-all' }}>{qrData.pair_url}</span>
                </div>
              )}
              <p style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-tertiary)', textAlign: 'center' }}>
                Scanne mit deinem Handy
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <p style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-red)', marginTop: 'var(--ds-space-xs)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

Make sure `useState`, `useEffect`, `useCallback` are imported at the top of SettingsSidebar.jsx.

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SettingsSidebar.jsx
git commit -m "feat(settings): add Remote section with QR code pairing"
```

---

## Task 5: PWA — Update Auth for Pairing

**Files:**
- Modify: `remote/src/hooks/useRemoteSocket.js`
- Modify: `remote/src/App.jsx`
- Create: `remote/src/components/PairingScreen.jsx`

- [ ] **Step 1: Update useRemoteSocket for pair_code + session_token auth**

Replace `remote/src/hooks/useRemoteSocket.js`:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 500;
const RECONNECT_DELAY = 3000;
const TOKEN_KEY = 'ankiplus-remote-token';

export default function useRemoteSocket(relayUrl) {
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [messages, setMessages] = useState([]);
  const tokenRef = useRef(localStorage.getItem(TOKEN_KEY));
  const pollRef = useRef(null);

  const post = useCallback(async (payload) => {
    try {
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await resp.json();
    } catch {
      return null;
    }
  }, [relayUrl]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      const resp = await post({ action: 'poll', session_token: token });
      if (resp?.ok && resp.messages?.length) {
        for (const msg of resp.messages) {
          if (msg.type === 'peer_connected') setPeerConnected(true);
          else if (msg.type === 'peer_disconnected') setPeerConnected(false);
          else setMessages(prev => [...prev, msg]);
        }
      } else if (resp?.error === 'Invalid session') {
        // Session expired — need re-pairing
        localStorage.removeItem(TOKEN_KEY);
        tokenRef.current = null;
        setConnected(false);
        setNeedsPairing(true);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, POLL_INTERVAL);
  }, [post]);

  // Try to connect on mount
  useEffect(() => {
    if (!relayUrl) return;
    let active = true;

    async function tryConnect() {
      const storedToken = localStorage.getItem(TOKEN_KEY);

      if (storedToken) {
        // Try reconnect with stored token
        const resp = await post({ action: 'reconnect', session_token: storedToken });
        if (resp?.ok && active) {
          tokenRef.current = storedToken;
          setConnected(true);
          setPeerConnected(resp.peer_connected || false);
          setNeedsPairing(false);
          startPolling();
          return;
        }
      }

      // Check URL for pair code
      const params = new URLSearchParams(window.location.search);
      const pairCode = params.get('pair');
      if (pairCode && active) {
        const resp = await post({ action: 'join_pair', pair_code: pairCode });
        if (resp?.ok && resp.session_token) {
          localStorage.setItem(TOKEN_KEY, resp.session_token);
          tokenRef.current = resp.session_token;
          setConnected(true);
          setPeerConnected(true); // just paired → peer is there
          setNeedsPairing(false);
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
          startPolling();
          return;
        }
      }

      // No token, no pair code → show pairing screen
      if (active) setNeedsPairing(true);
    }

    tryConnect();

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [relayUrl, post, startPolling]);

  const consumeMessages = useCallback(() => {
    const current = [...messages];
    setMessages([]);
    return current;
  }, [messages]);

  const send = useCallback((message) => {
    const token = tokenRef.current;
    if (!token) return;
    post({ action: 'send', session_token: token, message });
  }, [post]);

  return { connected, peerConnected, needsPairing, send, messages, consumeMessages };
}
```

- [ ] **Step 2: Create PairingScreen component**

Create `remote/src/components/PairingScreen.jsx`:

```jsx
import React from 'react';
import { motion } from 'framer-motion';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 'var(--ds-space-xl)',
  padding: 'var(--ds-space-2xl)',
  textAlign: 'center',
};

const TITLE_STYLE = {
  fontSize: 'var(--ds-text-xl)',
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
};

const DESC_STYLE = {
  fontSize: 'var(--ds-text-md)',
  color: 'var(--ds-text-secondary)',
  lineHeight: 1.5,
};

const ICON_STYLE = {
  width: 64,
  height: 64,
  borderRadius: 'var(--ds-radius-lg)',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 32,
};

const PairingScreen = () => (
  <div style={CONTAINER_STYLE}>
    <motion.div
      style={ICON_STYLE}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      📱
    </motion.div>
    <div style={TITLE_STYLE}>AnkiPlus Remote</div>
    <div style={DESC_STYLE}>
      Öffne die AnkiPlus Settings auf deinem Computer und scanne den QR-Code um dich zu verbinden.
    </div>
  </div>
);

export default React.memo(PairingScreen);
```

- [ ] **Step 3: Update App.jsx for pairing flow**

In `remote/src/App.jsx`, update the imports and hook usage:

Replace the Telegram-specific constants at the top:

```jsx
const RELAY_URL = window.location.origin + '/api/relay';
```

(Remove `tg`, `INIT_DATA`, `CHAT_ID` constants.)

Update the hook call:

```jsx
const { connected, peerConnected, needsPairing, send, messages, consumeMessages } = useRemoteSocket(RELAY_URL);
```

Add import for PairingScreen:

```jsx
import PairingScreen from './components/PairingScreen';
```

Remove the Telegram `useEffect` (`tg.expand()`, `tg.ready()`).

Update the early return to handle pairing:

```jsx
  if (needsPairing) {
    return (
      <div style={CONTAINER_STYLE}>
        <PairingScreen />
      </div>
    );
  }

  if (!connected || !peerConnected || !card) {
    return (
      <div style={CONTAINER_STYLE}>
        <ConnectingScreen peerConnected={peerConnected} />
      </div>
    );
  }
```

- [ ] **Step 4: Build to verify**

Run: `cd remote && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add remote/src/hooks/useRemoteSocket.js remote/src/components/PairingScreen.jsx remote/src/App.jsx
git commit -m "feat(remote): replace Telegram auth with QR pair-code flow"
```

---

## Task 6: PWA Manifest + Icons

**Files:**
- Create: `remote/public/manifest.json`
- Create: `remote/public/icon-192.png`
- Create: `remote/public/icon-512.png`
- Modify: `remote/index.html`

- [ ] **Step 1: Create manifest.json**

Create `remote/public/manifest.json`:

```json
{
  "name": "AnkiPlus Remote",
  "short_name": "AnkiPlus",
  "start_url": "/remote/",
  "display": "standalone",
  "background_color": "#141416",
  "theme_color": "#141416",
  "orientation": "portrait",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Generate placeholder icons**

Generate simple colored square icons using Python (temporary — replace with real icons later):

```bash
cd remote/public
python3 -c "
from PIL import Image, ImageDraw, ImageFont
for size in [192, 512]:
    img = Image.new('RGB', (size, size), '#141416')
    d = ImageDraw.Draw(img)
    # Draw a simple 'A+' text
    fs = size // 3
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', fs)
    except:
        font = ImageFont.load_default()
    d.text((size//2, size//2), 'A+', fill='#0A84FF', anchor='mm', font=font)
    img.save(f'icon-{size}.png')
print('Icons generated')
"
```

If Pillow is not available, create minimal 1x1 PNGs as placeholders:

```bash
python3 -c "
import base64, os
# Minimal valid 1x1 blue PNG
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==')
for s in ['192', '512']:
    with open(f'icon-{s}.png', 'wb') as f:
        f.write(png)
print('Placeholder icons created')
"
```

- [ ] **Step 3: Update index.html**

In `remote/index.html`, add the manifest link and meta tags in `<head>`:

```html
  <link rel="manifest" href="/remote/manifest.json" />
  <meta name="theme-color" content="#141416" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="apple-touch-icon" href="/remote/icon-192.png" />
```

Also remove the Telegram Web App script:

```html
  <!-- REMOVE this line: -->
  <!-- <script src="https://telegram.org/js/telegram-web-app.js"></script> -->
```

- [ ] **Step 4: Build to verify**

Run: `cd remote && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add remote/public/ remote/index.html
git commit -m "feat(remote): add PWA manifest and icons, remove Telegram SDK"
```

---

## Task 7: Deploy

**Files:** No new files — deployment commands only.

- [ ] **Step 1: Install qrcode Python library**

Run: `pip3 install qrcode[pil]`

- [ ] **Step 2: Set Firebase config**

Generate a relay secret and set it:

```bash
RELAY_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo "Generated secret: $RELAY_SECRET"
firebase functions:config:set relay.secret="$RELAY_SECRET"
```

- [ ] **Step 3: Deploy Firebase Functions**

Run: `cd functions && npm run build && cd .. && firebase deploy --only functions`
Expected: Deploy succeeds, `/relay` endpoint is live

Note the API URL: `https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay`

- [ ] **Step 4: Deploy PWA to Vercel**

Run: `cd remote && npx vercel --prod`

Note the deployment URL (e.g. `https://ankiplus-remote.vercel.app/remote/`)

- [ ] **Step 5: Update local config.json**

```bash
python3 -c "
import json
with open('config.json', 'r') as f:
    config = json.load(f)
tg = config.setdefault('telegram', {})
tg['relay_url'] = 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay'
tg['relay_secret'] = '$RELAY_SECRET'
tg['remote_app_url'] = 'https://ankiplus-remote.vercel.app/remote/'
with open('config.json', 'w') as f:
    json.dump(config, f, indent=2)
print('Config updated')
"
```

- [ ] **Step 6: Test end-to-end**

1. Restart Anki
2. Open Settings sidebar → scroll to "Remote" → click "Remote verbinden"
3. QR code should appear
4. Scan with phone camera → PWA opens → auto-connects
5. Start a review session in Anki
6. Phone should show "Antwort zeigen" button
7. Tap button → Anki flips card
8. Rating buttons appear → tap one → next card

- [ ] **Step 7: Commit config changes (not config.json)**

```bash
git add -A
git commit -m "chore: prepare deployment config for PWA remote"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Firebase relay handler (TypeScript) | `functions/src/handlers/relay.ts`, `functions/src/index.ts` |
| 2 | Python client update (pair-code auth) | `plusi/remote_ws.py`, `tests/test_remote_ws.py` |
| 3 | QR Code bridge method | `ui/bridge.py`, `config.py` |
| 4 | Settings sidebar Remote section | `SettingsSidebar.jsx` |
| 5 | PWA auth update (pairing flow) | `useRemoteSocket.js`, `PairingScreen.jsx`, `App.jsx` |
| 6 | PWA manifest + icons | `manifest.json`, icons, `index.html` |
| 7 | Deploy (Firebase + Vercel + config) | Deployment commands |
