import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, MessageSquare, Layers } from 'lucide-react';
import FreeChatSearchBar from './FreeChatSearchBar';
import FreeChatView from './FreeChatView';
import ChatMessage from './ChatMessage';

/* ── tokens ── */
const T = {
  blue:   '#0a84ff',
  green:  '#30d158',
  yellow: '#ffd60a',
  red:    '#ff453a',
};

/* ── helpers ── */
function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((now - new Date(new Date(str).setHours(0,0,0,0))) / 86400000);
  if (diff === 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Gestern';
  if (diff < 7)  return `${diff}d`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function buildDeckTree(decks) {
  const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));
  const byName = {};
  const roots = [];

  sorted.forEach(deck => {
    byName[deck.name] = { ...deck, children: [] };
  });

  sorted.forEach(deck => {
    const parts = deck.name.split('::');
    if (parts.length === 1) {
      roots.push(byName[deck.name]);
    } else {
      const parentName = parts.slice(0, -1).join('::');
      if (byName[parentName]) {
        byName[parentName].children.push(byName[deck.name]);
      } else {
        roots.push(byName[deck.name]);
      }
    }
  });

  return roots;
}

/* ── Segmented progress bar ──
   Green = level3 (known), Yellow = level2 (learning), Blue = level1 (weak), Dark = new */
function SegmentedBar({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div style={{
        height: 2, borderRadius: 2, marginTop: 4,
        background: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        position: 'relative',
      }} />
    );
  }

  const { level3Percent = 0, level2Percent = 0, level1Percent = 0 } = stats;
  const total = level3Percent + level2Percent + level1Percent;
  const newPercent = Math.max(0, 100 - total);

  return (
    <div style={{
      height: 2, borderRadius: 2, marginTop: 4,
      background: 'rgba(255,255,255,0.06)',
      overflow: 'hidden',
      display: 'flex',
    }}>
      {level3Percent > 0 && (
        <div style={{ width: `${level3Percent}%`, height: '100%', background: T.green, transition: 'width 0.6s ease' }} />
      )}
      {level2Percent > 0 && (
        <div style={{ width: `${level2Percent}%`, height: '100%', background: T.yellow, transition: 'width 0.6s ease' }} />
      )}
      {level1Percent > 0 && (
        <div style={{ width: `${level1Percent}%`, height: '100%', background: T.blue, transition: 'width 0.6s ease' }} />
      )}
    </div>
  );
}

/* ── Deck row (recursive) ── */
function DeckRow({ deck, deckStatsMap, deckSessionCountMap, onOpenDeck, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = deck.children && deck.children.length > 0;
  const stats = deckStatsMap[deck.id];
  const loading = !stats;
  const displayName = deck.name.split('::').pop();

  // Count sessions for this deck name (exact or sub-deck)
  const sessionCount = deckSessionCountMap[deck.name] || 0;

  const handleClick = useCallback(() => {
    if (hasChildren) {
      setExpanded(v => !v);
    } else {
      onOpenDeck(deck.id, deck.name);
    }
  }, [hasChildren, onOpenDeck, deck.id, deck.name]);

  return (
    <div>
      <motion.button
        onClick={handleClick}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: `6px 16px 6px ${16 + depth * 16}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 0,
        }}
        whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        whileTap={{ scale: 0.99 }}
      >
        {/* Chevron / dot */}
        <div style={{ width: 14, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, paddingTop: 1 }}>
          {hasChildren ? (
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ display: 'flex' }}
            >
              <ChevronRight size={12} style={{ color: 'rgba(255,255,255,0.28)' }} />
            </motion.div>
          ) : (
            <div style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              flexShrink: 0,
            }} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: depth === 0 ? 13 : 12,
              fontWeight: depth === 0 ? 600 : 400,
              color: depth === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.48)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {displayName}
            </span>

            {/* Session badge */}
            {sessionCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: T.blue,
                background: 'rgba(10,132,255,0.12)',
                borderRadius: 5,
                padding: '1px 5px',
                flexShrink: 0,
              }}>
                {sessionCount}
              </span>
            )}

            {/* Card count */}
            {stats && (
              <span style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.2)',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {stats.totalCards}
              </span>
            )}
          </div>

          {/* Progress bar (leaf decks only) */}
          {!hasChildren && (
            <SegmentedBar stats={stats} loading={loading} />
          )}
        </div>
      </motion.button>

      {/* Sub-decks */}
      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 370, damping: 34 }}
            style={{ overflow: 'hidden' }}
          >
            {deck.children.map(child => (
              <DeckRow
                key={child.id}
                deck={child}
                deckStatsMap={deckStatsMap}
                deckSessionCountMap={deckSessionCountMap}
                onOpenDeck={onOpenDeck}
                depth={depth + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Session row ── */
function SessionRow({ session, index, onClick }) {
  const title = session.deckName ? session.deckName.split('::').pop() : 'Unbenannt';
  const path = session.deckName && session.deckName.includes('::')
    ? session.deckName.split('::').slice(0, -1).join(' › ')
    : null;
  const msgCount = session.messages?.length ?? 0;
  const sectionCount = new Set((session.messages || []).map(m => m.sectionId).filter(Boolean)).size;
  const date = formatDate(session.updatedAt || session.createdAt);

  return (
    <motion.button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 16px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 400, damping: 30 }}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      whileTap={{ scale: 0.99 }}
    >
      {/* dot */}
      <div style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(255,255,255,0.14)',
      }} />

      {/* title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {path && (
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
            color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase',
            marginBottom: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {path}
          </div>
        )}
        <div style={{
          fontSize: 12, fontWeight: 400,
          color: 'rgba(255,255,255,0.5)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
      </div>

      {/* meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {sectionCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.22)', fontSize: 10 }}>
            <Layers size={9} />
            <span>{sectionCount}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.22)', fontSize: 10 }}>
          <MessageSquare size={9} />
          <span>{msgCount}</span>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>
          {date}
        </span>
      </div>
    </motion.button>
  );
}

/* ── Section label ── */
function SectionLabel({ children, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 16px 8px',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
      }}>
        {children}
      </span>
      {count != null && (
        <span style={{
          fontSize: 9, color: 'rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 4, padding: '0 4px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main export
   ══════════════════════════════════════════════════════════ */
function DeckActions({ bridge }) {
  const items = [
    { label: '+ Neuer Stapel', action: () => bridge?.createNewDeck?.() },
    { label: 'Importieren',    action: () => bridge?.openImport?.()    },
    { label: 'Statistik',      action: () => bridge?.openStats?.()     },
  ];
  return (
    <div style={{ display: 'flex', gap: 20, padding: '8px 16px 4px', justifyContent: 'center' }}>
      {items.map(({ label, action }, i) => (
        <button
          key={i}
          onClick={action}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 11, color: 'rgba(255,255,255,0.22)',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.45)'}
          onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.22)'}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function DeckBrowser({
  bridge,
  sessions,
  onSelectSession,
  onOpenDeck,
  headerHeight,
  onFreeChatOpen,
  freeChatOpen = false,
  animPhase = 'idle',
  freeChatInitialText = '',
  freeChatHook = null,
  onFreeChatClose = null,
}) {
  const [decks, setDecks] = useState([]);
  const [deckStatsMap, setDeckStatsMap] = useState({});

  /* Load deck list */
  useEffect(() => {
    if (!bridge?.getAvailableDecks) return;
    try {
      const result = JSON.parse(bridge.getAvailableDecks());
      setDecks(result.decks || []);
    } catch (e) {
      console.error('DeckBrowser: Error loading decks', e);
    }
  }, [bridge]);

  /* Load stats for every deck (synchronous call) */
  useEffect(() => {
    if (!bridge?.getDeckStats || !decks.length) return;
    decks.forEach(deck => {
      try {
        const raw = bridge.getDeckStats(deck.id);
        if (raw) {
          const stats = JSON.parse(raw);
          setDeckStatsMap(prev => ({ ...prev, [deck.id]: stats }));
        }
      } catch (_) {}
    });
  }, [bridge, decks]);

  /* Load chat history from DB on mount */
  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (freeChatHook?.loadForDeck && !historyLoadedRef.current) {
      historyLoadedRef.current = true;
      freeChatHook.loadForDeck(0); // 0 = global, loads all messages
    }
  }, [freeChatHook]);

  /* Also handle async deckStats events (Python may push updates) */
  useEffect(() => {
    const handler = (e) => {
      const { deckId, data } = e.detail || {};
      if (deckId != null && data) {
        setDeckStatsMap(prev => ({ ...prev, [deckId]: data }));
      }
    };
    window.addEventListener('deckStats', handler);
    return () => window.removeEventListener('deckStats', handler);
  }, []);

  const deckTree = useMemo(() => buildDeckTree(decks), [decks]);

  /* Session count per deck name */
  const deckSessionCountMap = useMemo(() => {
    const map = {};
    (sessions || []).forEach(s => {
      if (s.deckName) {
        map[s.deckName] = (map[s.deckName] || 0) + 1;
      }
    });
    return map;
  }, [sessions]);

  /* Recent sessions */
  const recentSessions = useMemo(() => (
    [...(sessions || [])]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 12)
  ), [sessions]);

  const deckContentVisible = animPhase === 'idle' || animPhase === 'exiting';
  const deckContentStyle = {
    transition: 'opacity 250ms ease, transform 250ms ease',
    opacity: deckContentVisible ? 1 : 0,
    transform: deckContentVisible ? 'translateY(0)' : 'translateY(60px)',
    pointerEvents: deckContentVisible ? 'auto' : 'none',
    flexShrink: 0,
    // When not visible: collapse to 0 so FreeChatView fills all available space
    ...(deckContentVisible ? {} : { flex: '0 0 0', overflow: 'hidden' }),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Scrollable deck content — animates out when freeChatOpen */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          paddingTop: (headerHeight || 60) + 12,
          paddingBottom: 24,
          ...deckContentStyle,
        }}
      >
        {/* ── Free Chat Search Bar ── */}
        {onFreeChatOpen && (
          <FreeChatSearchBar onOpen={onFreeChatOpen} />
        )}

        {/* ── Decks ── */}
        <div style={{ marginBottom: 4 }}>
          <SectionLabel count={decks.length}>Decks</SectionLabel>

          {decks.length === 0 && (
            <div style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
              Keine Decks gefunden
            </div>
          )}

          {deckTree.map((deck, i) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035, type: 'spring', stiffness: 360, damping: 32 }}
            >
              <DeckRow
                deck={deck}
                deckStatsMap={deckStatsMap}
                deckSessionCountMap={deckSessionCountMap}
                onOpenDeck={onOpenDeck}
                depth={0}
              />
            </motion.div>
          ))}
        </div>

        {/* ── Deck Actions ── */}
        <DeckActions bridge={bridge} />

        {/* ── Divider ── */}
        {recentSessions.length > 0 && (
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 16px' }} />
        )}

        {/* ── Sessions ── */}
        {recentSessions.length > 0 && (
          <div>
            <SectionLabel count={sessions?.length}>Sessions</SectionLabel>

            {recentSessions.map((session, i) => (
              <SessionRow
                key={session.id}
                session={session}
                index={i}
                onClick={() => onSelectSession(session.id)}
              />
            ))}
          </div>
        )}

        {/* ── Chat History (all messages across decks) ── */}
        {!freeChatOpen && freeChatHook && freeChatHook.messages && freeChatHook.messages.length > 0 && (
          <div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 16px' }} />
            <SectionLabel count={freeChatHook.messages.length}>Chat-Verlauf</SectionLabel>
            <div style={{ padding: '0 8px' }}>
              {freeChatHook.messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg.text}
                  from={msg.from}
                  cardContext={null}
                  citations={msg.citations || {}}
                  bridge={bridge}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FreeChatView — renders inline when freeChatOpen, fills remaining space */}
      {freeChatOpen && freeChatHook && (
        <FreeChatView
          freeChatHook={freeChatHook}
          initialText={freeChatInitialText}
          onClose={onFreeChatClose}
          bridge={bridge}
          animPhase={animPhase}
        />
      )}
    </div>
  );
}
