import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSessions,
  saveSessions,
  createSession,
  findSessionByDeck,
  getSessionsForDeck,
  updateSession,
  updateSessionSections,
  deleteSession,
  clearAllSessions,
} from '../sessions';

// saveSessions touches window._bridgeSaveSessions — ensure it is absent
beforeEach(() => {
  delete (window as any)._bridgeSaveSessions;
});

// ---------------------------------------------------------------------------
// loadSessions
// ---------------------------------------------------------------------------
describe('loadSessions', () => {
  it('returns an empty array (bridge-only mode)', () => {
    expect(loadSessions()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveSessions
// ---------------------------------------------------------------------------
describe('saveSessions', () => {
  it('returns false when no bridgeSave and no window._bridgeSaveSessions', () => {
    expect(saveSessions([{ id: '1', messages: [] } as any])).toBe(false);
  });

  it('returns false for non-array input', () => {
    expect(saveSessions(null as any)).toBe(false);
    expect(saveSessions('bad' as any)).toBe(false);
  });

  it('calls bridgeSave callback when provided', () => {
    let called = false;
    let received: any = null;
    const bridgeSave = (sessions: any) => { called = true; received = sessions; };
    saveSessions([{ id: '1', messages: [] } as any], bridgeSave);
    expect(called).toBe(true);
    expect(Array.isArray(received)).toBe(true);
  });

  it('limits sessions to 50', () => {
    const manySessions = Array.from({ length: 60 }, (_, i) => ({ id: String(i), messages: [] as any[] }));
    let received: any[] = [];
    saveSessions(manySessions as any, (s) => { received = s; });
    expect(received.length).toBeLessThanOrEqual(50);
  });

  it('limits messages per session to 100', () => {
    const messages = Array.from({ length: 150 }, (_, i) => ({ text: `msg ${i}`, from: 'user' }));
    const sessions = [{ id: '1', messages }] as any;
    let received: any[] = [];
    saveSessions(sessions, (s) => { received = s; });
    expect(received[0].messages.length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------
describe('createSession', () => {
  it('creates a session with unique id', () => {
    const s1 = createSession([]);
    const s2 = createSession([]);
    expect(s1.id).toBeTruthy();
    expect(s2.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
  });

  it('uses deckName as session name when provided', () => {
    const session = createSession([], 'deck-1', 'Anatomie');
    expect(session.name).toBe('Anatomie');
  });

  it('falls back to "Session N" when no deckName', () => {
    const session = createSession([], null, null);
    expect(session.name).toMatch(/^Session \d+/);
  });

  it('initialises with empty messages and sections arrays', () => {
    const session = createSession([]);
    expect(session.messages).toEqual([]);
    expect(session.sections).toEqual([]);
  });

  it('stores provided deckId and deckName', () => {
    const session = createSession([], 'deck-42', 'Physiologie');
    expect(session.deckId).toBe('deck-42');
    expect(session.deckName).toBe('Physiologie');
  });

  it('sets initialSeenCardIds on session', () => {
    const session = createSession([], null, null, ['card-1', 'card-2']);
    expect(session.seenCardIds).toEqual(['card-1', 'card-2']);
  });

  it('createdAt is an ISO string', () => {
    const session = createSession([]);
    expect(() => new Date(session.createdAt)).not.toThrow();
    expect(new Date(session.createdAt).toISOString()).toBe(session.createdAt);
  });
});

// ---------------------------------------------------------------------------
// findSessionByDeck
// ---------------------------------------------------------------------------
describe('findSessionByDeck', () => {
  const sessions = [
    { id: 'a', deckId: 'deck-1', messages: [] },
    { id: 'b', deckId: 'deck-2', messages: [] },
  ] as any;

  it('finds existing session by deckId', () => {
    const result = findSessionByDeck(sessions, 'deck-1');
    expect(result?.id).toBe('a');
  });

  it('returns undefined for unknown deckId', () => {
    expect(findSessionByDeck(sessions, 'deck-99')).toBeUndefined();
  });

  it('returns undefined for empty sessions', () => {
    expect(findSessionByDeck([], 'deck-1')).toBeUndefined();
  });

  it('returns undefined when deckId is falsy', () => {
    expect(findSessionByDeck(sessions, '')).toBeUndefined();
    expect(findSessionByDeck(sessions, null as any)).toBeUndefined();
  });

  it('returns undefined when sessions is not an array', () => {
    expect(findSessionByDeck(null as any, 'deck-1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSessionsForDeck
// ---------------------------------------------------------------------------
describe('getSessionsForDeck', () => {
  const sessions = [
    { id: 'a', deckId: 'deck-1', messages: [] },
    { id: 'b', deckId: 'deck-1', messages: [] },
    { id: 'c', deckId: 'deck-2', messages: [] },
  ] as any;

  it('returns all sessions matching deckId', () => {
    const result = getSessionsForDeck(sessions, 'deck-1');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for unknown deck', () => {
    expect(getSessionsForDeck(sessions, 'deck-99')).toEqual([]);
  });

  it('returns empty array when sessions is not an array', () => {
    expect(getSessionsForDeck(null as any, 'deck-1')).toEqual([]);
  });

  it('returns empty array when deckId is falsy', () => {
    expect(getSessionsForDeck(sessions, null as any)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateSession
// ---------------------------------------------------------------------------
describe('updateSession', () => {
  const baseSession = { id: 'sess-1', messages: [], sections: [] };
  const sessions = [baseSession] as any;

  it('returns sessions unchanged when sessionId not found', () => {
    const result = updateSession(sessions, 'unknown-id', [{ text: 'hi', from: 'user' } as any]);
    expect(result).toEqual(sessions);
  });

  it('updates messages for matching session', () => {
    const newMessages = [{ text: 'hello', from: 'user' }] as any;
    const result = updateSession(sessions, 'sess-1', newMessages);
    expect(result[0].messages).toEqual(newMessages);
  });

  it('adds updatedAt timestamp after update', () => {
    const result = updateSession(sessions, 'sess-1', []);
    expect(result[0]).toHaveProperty('updatedAt');
    expect(() => new Date((result[0] as any).updatedAt)).not.toThrow();
  });

  it('updates sections when sections argument is provided', () => {
    const sections = [{ id: 'sec-1', title: 'Test' }] as any;
    const result = updateSession(sessions, 'sess-1', [], sections);
    expect(result[0].sections).toEqual(sections);
  });

  it('does not overwrite existing sections when sections is null', () => {
    const withSections = [{ id: 'sess-1', messages: [], sections: [{ id: 'sec-1' }] }] as any;
    const result = updateSession(withSections, 'sess-1', [], null);
    expect(result[0].sections).toEqual([{ id: 'sec-1' }]);
  });

  it('returns sessions unchanged for invalid input', () => {
    expect(updateSession(null as any, 'sess-1', [])).toBeNull();
    expect(updateSession(sessions, '', [])).toEqual(sessions);
  });

  it('limits messages to 100', () => {
    const manyMessages = Array.from({ length: 150 }, (_, i) => ({ text: `msg ${i}`, from: 'user' })) as any;
    const result = updateSession(sessions, 'sess-1', manyMessages);
    expect(result[0].messages.length).toBeLessThanOrEqual(100);
  });

  it('does not mutate non-matching sessions', () => {
    const multiSession = [
      { id: 'sess-1', messages: [], sections: [] },
      { id: 'sess-2', messages: [{ text: 'existing' }], sections: [] },
    ] as any;
    const result = updateSession(multiSession, 'sess-1', [{ text: 'new' } as any]);
    expect(result[1].messages[0].text).toBe('existing');
  });
});

// ---------------------------------------------------------------------------
// updateSessionSections
// ---------------------------------------------------------------------------
describe('updateSessionSections', () => {
  const sessions = [{ id: 'sess-1', messages: [], sections: [] }] as any;

  it('updates sections for matching session', () => {
    const sections = [{ id: 'sec-1', title: 'Kapitel 1' }] as any;
    const result = updateSessionSections(sessions, 'sess-1', sections);
    expect(result[0].sections).toEqual(sections);
  });

  it('sets sections to empty array when sections is null/undefined', () => {
    const result = updateSessionSections(sessions, 'sess-1', null as any);
    expect(result[0].sections).toEqual([]);
  });

  it('adds updatedAt timestamp', () => {
    const result = updateSessionSections(sessions, 'sess-1', []);
    expect(result[0]).toHaveProperty('updatedAt');
  });

  it('returns sessions unchanged when sessionId not found', () => {
    const result = updateSessionSections(sessions, 'unknown', []);
    expect(result).toEqual(sessions);
  });

  it('returns sessions unchanged for invalid input', () => {
    expect(updateSessionSections(null as any, 'sess-1', [])).toBeNull();
    expect(updateSessionSections(sessions, '', [])).toEqual(sessions);
  });

  it('does not touch messages when only updating sections', () => {
    const withMessages = [{ id: 'sess-1', messages: [{ text: 'hi' }], sections: [] }] as any;
    const result = updateSessionSections(withMessages, 'sess-1', [{ id: 'sec-1' } as any]);
    expect(result[0].messages).toEqual([{ text: 'hi' }]);
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------
describe('deleteSession', () => {
  const sessions = [
    { id: 'sess-1', messages: [] },
    { id: 'sess-2', messages: [] },
  ] as any;

  it('removes session with matching id', () => {
    const result = deleteSession(sessions, 'sess-1');
    expect(result.find((s: any) => s.id === 'sess-1')).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it('returns sessions unchanged when id not found', () => {
    const result = deleteSession(sessions, 'unknown');
    expect(result).toHaveLength(2);
  });

  it('returns sessions unchanged for invalid input', () => {
    expect(deleteSession(null as any, 'sess-1')).toBeNull();
    expect(deleteSession(sessions, '')).toEqual(sessions);
  });
});

// ---------------------------------------------------------------------------
// clearAllSessions
// ---------------------------------------------------------------------------
describe('clearAllSessions', () => {
  it('calls bridgeSave with empty array', () => {
    let received: any = null;
    clearAllSessions((s) => { received = s; });
    expect(received).toEqual([]);
  });

  it('returns false when no bridge is available', () => {
    expect(clearAllSessions()).toBe(false);
  });
});
