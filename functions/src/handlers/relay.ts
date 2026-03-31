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

  // ── create_pair: Anki creates a new pairing code + session ──
  if (action === 'create_pair') {
    if (!RELAY_SECRET || secret !== RELAY_SECRET) {
      res.status(401).json({ error: 'Invalid secret' });
      return;
    }
    const pairCode = generatePairCode();
    const ankiToken = generateToken();
    const sessionId = generateToken().slice(0, 16);
    const now = Date.now();
    // Create session immediately so Anki can poll right away
    sessions.set(sessionId, {
      anki: { token: ankiToken, queue: [], lastSeen: now },
      pwa: { token: '', queue: [], lastSeen: 0 },
      pairCode,
    });
    // Also store in pendingPairs so join_pair can find the session
    pendingPairs.set(pairCode, { ankiToken, secret, createdAt: now });
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
    const now = Date.now();
    // Find the existing session by anki token
    let found = false;
    for (const s of sessions.values()) {
      if (s.anki.token === pending.ankiToken) {
        s.pwa.token = pwaToken;
        s.pwa.lastSeen = now;
        s.anki.queue.push({ type: 'peer_connected' });
        found = true;
        break;
      }
    }
    if (!found) {
      // Session expired between create_pair and join_pair — create fresh
      const sessionId = generateToken().slice(0, 16);
      sessions.set(sessionId, {
        anki: { token: pending.ankiToken, queue: [{ type: 'peer_connected' }], lastSeen: now },
        pwa: { token: pwaToken, queue: [], lastSeen: now },
        pairCode: pair_code,
      });
    }
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
