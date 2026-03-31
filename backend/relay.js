/**
 * POST /api/relay
 * Polling-based message relay for AnkiPlus Remote.
 *
 * Both Anki (Python) and Mini App (React) poll this endpoint.
 *
 * POST body:
 *   { action: "register", chat_id: "123", client: "anki"|"miniapp", secret: "..." }
 *   { action: "send", chat_id: "123", client: "anki"|"miniapp", message: {...} }
 *   { action: "poll", chat_id: "123", client: "anki"|"miniapp" }
 *   { action: "disconnect", chat_id: "123", client: "anki"|"miniapp" }
 *
 * Response:
 *   { ok: true, messages: [...] }  (for poll)
 *   { ok: true }                   (for register/send/disconnect)
 */
const functions = require("firebase-functions");
const crypto = require("crypto");

// In-memory session store (resets on cold start — acceptable for relay)
const sessions = new Map();

// Session TTL: 10 minutes of inactivity
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_QUEUE_SIZE = 50;

function getSession(chatId) {
  let s = sessions.get(chatId);
  if (!s) {
    s = {
      anki: { connected: false, queue: [], lastSeen: 0 },
      miniapp: { connected: false, queue: [], lastSeen: 0 },
    };
    sessions.set(chatId, s);
  }
  return s;
}

function cleanStaleSessions() {
  const now = Date.now();
  for (const [chatId, s] of sessions) {
    const ankiStale = now - s.anki.lastSeen > SESSION_TTL_MS;
    const miniStale = now - s.miniapp.lastSeen > SESSION_TTL_MS;
    if (ankiStale && miniStale) {
      sessions.delete(chatId);
    }
  }
}

function validateInitData(initDataStr, botToken) {
  if (!initDataStr || !botToken) return null;
  try {
    const params = new URLSearchParams(initDataStr);
    const hash = params.get("hash");
    params.delete("hash");
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (computedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return String(user.id || "");
  } catch {
    return null;
  }
}

exports.relay = functions.region("europe-west1").https.onRequest(async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  cleanStaleSessions();

  const { action, chat_id, client, message, secret, init_data } = req.body || {};

  if (!action || !chat_id || !client) {
    res.status(400).json({ error: "Missing action, chat_id, or client" });
    return;
  }

  if (client !== "anki" && client !== "miniapp") {
    res.status(400).json({ error: "client must be 'anki' or 'miniapp'" });
    return;
  }

  // Auth: Anki uses shared secret, Mini App uses Telegram initData
  const botToken = functions.config().telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN || "";

  if (client === "anki") {
    const expectedSecret = functions.config().telegram?.relay_secret || process.env.RELAY_SECRET || "";
    if (!expectedSecret || secret !== expectedSecret) {
      res.status(401).json({ error: "Invalid secret" });
      return;
    }
  } else {
    const validatedChatId = validateInitData(init_data, botToken);
    if (!validatedChatId || validatedChatId !== String(chat_id)) {
      res.status(401).json({ error: "Invalid initData" });
      return;
    }
  }

  const session = getSession(String(chat_id));
  const self = session[client];
  const other = client === "anki" ? session.miniapp : session.anki;

  if (action === "register") {
    self.connected = true;
    self.lastSeen = Date.now();
    if (other.connected) {
      other.queue.push({ type: "peer_connected" });
    }
    res.json({ ok: true, peer_connected: other.connected });
    return;
  }

  if (action === "send") {
    self.lastSeen = Date.now();
    if (!message) { res.status(400).json({ error: "Missing message" }); return; }
    if (other.queue.length < MAX_QUEUE_SIZE) {
      other.queue.push(message);
    }
    res.json({ ok: true });
    return;
  }

  if (action === "poll") {
    self.lastSeen = Date.now();
    const messages = self.queue.splice(0);
    res.json({ ok: true, messages });
    return;
  }

  if (action === "disconnect") {
    self.connected = false;
    if (other.connected) {
      other.queue.push({ type: "peer_disconnected" });
    }
    res.json({ ok: true });
    return;
  }

  res.status(400).json({ error: "Unknown action" });
});
