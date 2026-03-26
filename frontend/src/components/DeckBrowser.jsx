import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Layers } from 'lucide-react';
import TreeList from '../../../shared/components/TreeList';
import FreeChatSearchBar from './FreeChatSearchBar';
import ChatMessage from './ChatMessage';
import CardRefChip from './CardRefChip';
import DeckSectionDivider from './DeckSectionDivider';

const EMPTY_CITATIONS = {};

/* ── tokens ── */
const T = {
  blue:   'var(--ds-accent)',
  green:  'var(--ds-green)',
  yellow: 'var(--ds-yellow)',
  red:    'var(--ds-red)',
};

/* ── module-level style constants ── */
const SEGMENTED_BAR_BASE = {
  height: 2, borderRadius: 2, marginTop: 4,
  background: 'var(--ds-border-subtle)',
  overflow: 'hidden',
};
const SEGMENTED_BAR_FLEX = {
  height: 2, borderRadius: 2, marginTop: 4,
  background: 'var(--ds-border-subtle)',
  overflow: 'hidden',
  display: 'flex',
};
const BAR_SEGMENT_BASE = { height: '100%', transition: 'width 0.6s ease' };
const SESSION_ROW_BUTTON = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 16px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
};
const SESSION_DOT = {
  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
  background: 'var(--ds-text-muted)',
};
const SESSION_TITLE_CONTAINER = { flex: 1, minWidth: 0 };
const SESSION_PATH_LABEL = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
  color: 'var(--ds-text-muted)', textTransform: 'uppercase',
  marginBottom: 1,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const SESSION_TITLE_TEXT = {
  fontSize: 12, fontWeight: 400,
  color: 'var(--ds-text-secondary)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const SESSION_META_ROW = { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 };
const SESSION_META_ICON = { display: 'flex', alignItems: 'center', gap: 3, color: 'var(--ds-text-tertiary)', fontSize: 10 };
const SESSION_DATE_SPAN = { fontSize: 10, color: 'var(--ds-text-muted)', fontVariantNumeric: 'tabular-nums' };
const SECTION_LABEL_ROW = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '4px 16px 8px',
};
const SECTION_LABEL_TEXT = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--ds-text-tertiary)',
};
const SECTION_COUNT_BADGE = {
  fontSize: 9, color: 'var(--ds-text-muted)',
  background: 'var(--ds-hover-tint)',
  borderRadius: 4, padding: '0 4px',
  fontVariantNumeric: 'tabular-nums',
};
const DECK_ACTIONS_ROW = { display: 'flex', gap: 20, padding: '8px 16px 4px', justifyContent: 'center' };
const DECK_ACTION_BUTTON = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontSize: 11, color: 'var(--ds-text-tertiary)',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  transition: 'color 0.15s',
};
const DECK_SESSION_BADGE = {
  fontSize: 10, fontWeight: 600,
  color: 'var(--ds-accent)',
  background: 'var(--ds-accent-10)',
  borderRadius: 5,
  padding: '1px 5px',
  flexShrink: 0,
};
const DECK_CARD_COUNT = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
};
const DECK_BROWSER_OUTER = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' };
const DECK_SCROLL_CONTAINER_BASE = {
  flex: 1,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  paddingBottom: 24,
};
const DECK_SECTION_MARGIN = { marginBottom: 4 };
const DECK_EMPTY_LABEL = { padding: '12px 16px', fontSize: 12, color: 'var(--ds-text-muted)' };
const DECK_DIVIDER = { height: 1, background: 'var(--ds-border-subtle)', margin: '8px 16px' };
const CHAT_HISTORY_PADDING = { padding: '0 8px' };
const CARD_REF_CHIP_PADDING = { padding: '0 8px' };

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
    return <div style={SEGMENTED_BAR_BASE} />;
  }

  const { level3Percent = 0, level2Percent = 0, level1Percent = 0 } = stats;
  const total = level3Percent + level2Percent + level1Percent;
  const newPercent = Math.max(0, 100 - total);

  return (
    <div style={SEGMENTED_BAR_FLEX}>
      {level3Percent > 0 && (
        <div style={{ ...BAR_SEGMENT_BASE, width: `${level3Percent}%`, background: T.green }} />
      )}
      {level2Percent > 0 && (
        <div style={{ ...BAR_SEGMENT_BASE, width: `${level2Percent}%`, background: T.yellow }} />
      )}
      {level1Percent > 0 && (
        <div style={{ ...BAR_SEGMENT_BASE, width: `${level1Percent}%`, background: T.blue }} />
      )}
    </div>
  );
}

/* ── Session row ── */
const SessionRow = React.memo(function SessionRow({ session, index, onClick }) {
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
      style={SESSION_ROW_BUTTON}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 400, damping: 30 }}
      whileHover={{ backgroundColor: 'var(--ds-hover-tint)' }}
      whileTap={{ scale: 0.99 }}
    >
      {/* dot */}
      <div style={SESSION_DOT} />

      {/* title */}
      <div style={SESSION_TITLE_CONTAINER}>
        {path && (
          <div style={SESSION_PATH_LABEL}>
            {path}
          </div>
        )}
        <div style={SESSION_TITLE_TEXT}>
          {title}
        </div>
      </div>

      {/* meta */}
      <div style={SESSION_META_ROW}>
        {sectionCount > 0 && (
          <div style={SESSION_META_ICON}>
            <Layers size={9} />
            <span>{sectionCount}</span>
          </div>
        )}
        <div style={SESSION_META_ICON}>
          <MessageSquare size={9} />
          <span>{msgCount}</span>
        </div>
        <span style={SESSION_DATE_SPAN}>
          {date}
        </span>
      </div>
    </motion.button>
  );
});

/* ── Section label ── */
function SectionLabel({ children, count }) {
  return (
    <div style={SECTION_LABEL_ROW}>
      <span style={SECTION_LABEL_TEXT}>
        {children}
      </span>
      {count != null && (
        <span style={SECTION_COUNT_BADGE}>
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
    <div style={DECK_ACTIONS_ROW}>
      {items.map(({ label, action }, i) => (
        <button
          key={i}
          onClick={action}
          style={DECK_ACTION_BUTTON}
          onMouseEnter={e => e.target.style.color = 'var(--ds-text-secondary)'}
          onMouseLeave={e => e.target.style.color = 'var(--ds-text-tertiary)'}
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
  freeChatHook = null,
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

  /* Convert deckTree to TreeList items */
  const toTreeItems = useCallback((nodes) => nodes.map(node => ({
    id: node.id,
    label: node.name.split('::').pop(),
    _deckName: node.name,
    children: node.children?.length ? toTreeItems(node.children) : undefined,
  })), []);
  const deckTreeItems = useMemo(() => toTreeItems(deckTree), [deckTree, toTreeItems]);

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

  return (
    <div style={DECK_BROWSER_OUTER}>
      {/* Scrollable deck content */}
      <div
        style={{
          ...DECK_SCROLL_CONTAINER_BASE,
          paddingTop: (headerHeight || 60) + 12,
        }}
      >
        {/* ── Free Chat Search Bar ── */}
        {onFreeChatOpen && (
          <FreeChatSearchBar onOpen={onFreeChatOpen} />
        )}

        {/* ── Decks ── */}
        <div style={DECK_SECTION_MARGIN}>
          {decks.length === 0 && (
            <div style={DECK_EMPTY_LABEL}>
              Keine Decks gefunden
            </div>
          )}

          <TreeList
            items={deckTreeItems}
            header="Decks"
            onItemClick={(item) => onOpenDeck(item.id, item._deckName)}
            defaultExpanded={true}
            renderRight={(item) => {
              const stats = deckStatsMap[item.id];
              const sessionCount = deckSessionCountMap[item._deckName] || 0;
              return (
                <>
                  {sessionCount > 0 && (
                    <span style={DECK_SESSION_BADGE}>
                      {sessionCount}
                    </span>
                  )}
                  {stats && (
                    <span style={DECK_CARD_COUNT}>
                      {stats.totalCards}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>

        {/* ── Deck Actions ── */}
        <DeckActions bridge={bridge} />

        {/* ── Divider ── */}
        {recentSessions.length > 0 && (
          <div style={DECK_DIVIDER} />
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
        {freeChatHook && freeChatHook.messages && freeChatHook.messages.length > 0 && (
          <div>
            <div style={DECK_DIVIDER} />
            <SectionLabel count={freeChatHook.messages.length}>Chat-Verlauf</SectionLabel>
            <div style={CHAT_HISTORY_PADDING}>
              {freeChatHook.messages.map((msg, idx) => {
                const prevMsg = idx > 0 ? freeChatHook.messages[idx - 1] : null;
                const deckChanged = msg.deckName && (!prevMsg || prevMsg.deckName !== msg.deckName);
                const showDivider = deckChanged || (idx === 0 && msg.deckName);

                return (
                  <React.Fragment key={msg.id}>
                    {showDivider && <DeckSectionDivider deckName={msg.deckName} />}
                    <ChatMessage
                      message={msg.text}
                      from={msg.from}
                      cardContext={null}
                      citations={msg.citations || EMPTY_CITATIONS}
                      bridge={bridge}
                    />
                    {msg.cardId && (
                      <div style={CARD_REF_CHIP_PADDING}>
                        <CardRefChip
                          cardId={msg.cardId}
                          cardFront={msg.cardFront}
                          bridge={bridge}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
