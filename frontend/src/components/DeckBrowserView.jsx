import React from 'react';
import DeckSearchBar from './DeckSearchBar';
import { DeckNode } from './DeckNode';
import AccountBadge from './AccountBadge';
import PlusiDock from './PlusiDock';
import { useDeckTree } from '../hooks/useDeckTree';
import { executeAction, bridgeAction } from '../actions';

const MAX_W = 'var(--ds-content-width)';

export default function DeckBrowserView({ data, isPremium, onToggleView }) {
  const { isExpanded, toggleExpanded } = useDeckTree();

  if (!data) return null;

  const { roots = [], totalDue = 0 } = data;

  const handleStudy = (deckId) => {
    executeAction('deck.study', { deckId });
  };

  const handleSelect = (deckId) => {
    executeAction('deck.select', { deckId });
  };

  const handleSearchSubmit = (text) => {
    executeAction('chat.open', { text });
  };

  const handleSearchOpenEmpty = () => {
    executeAction('chat.open', { text: '' });
  };

  return (
    <div style={{
      flex: 1, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0 20px',
    }}>
      {/* Wordmark — fixed at top, never scrolls */}
      <div style={{
        flexShrink: 0, paddingTop: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, marginBottom: 24, width: '100%', maxWidth: MAX_W,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{
            fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
            fontSize: 46, fontWeight: 700, letterSpacing: '-1.8px',
            color: 'var(--ds-text-primary)', lineHeight: 1,
          }}>Anki</span>
          <span style={{
            fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
            fontSize: 46, fontWeight: 300, letterSpacing: '-1px',
            color: 'var(--ds-text-muted)', lineHeight: 1,
          }}>.plus</span>
        </div>
        <span
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            padding: '4px 9px', borderRadius: 7, alignSelf: 'center',
            marginTop: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            ...(isPremium
              ? { background: 'var(--ds-accent-10)', border: '1px solid var(--ds-accent-20)', color: 'var(--ds-accent)' }
              : { background: 'var(--ds-hover-tint)', border: '1px solid var(--ds-border-medium)', color: 'var(--ds-text-placeholder)' }),
          }}
          onClick={() => executeAction('settings.toggle')}
        >
          {isPremium ? 'Pro' : 'Free'}
        </span>

        {/* Knowledge Graph toggle */}
        {onToggleView && (
          <button
            onClick={onToggleView}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              background: 'var(--ds-hover-tint)',
              border: '1px solid var(--ds-border)',
              borderRadius: 8,
              padding: '6px 14px',
              color: 'var(--ds-text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--ds-text-primary)';
              e.currentTarget.style.background = 'var(--ds-active-tint)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--ds-text-secondary)';
              e.currentTarget.style.background = 'var(--ds-hover-tint)';
            }}
          >
            Knowledge Graph
          </button>
        )}
      </div>

      {/* Search Bar — fixed, never scrolls, same max-width */}
      <div style={{
        flexShrink: 0, width: '100%', maxWidth: MAX_W,
        marginBottom: 16,
      }}>
        <DeckSearchBar onSubmit={handleSearchSubmit} onOpenEmpty={handleSearchOpenEmpty} />
      </div>

      {/* Deck List — only this scrolls, clipped right at the search bar bottom edge */}
      <div style={{
        flex: 1, overflowY: 'auto',
        width: '100%', maxWidth: MAX_W,
        paddingBottom: 100,
        scrollbarWidth: 'none',
      }}>
        {roots.map((node, idx) => (
          <DeckNode
            key={node.id}
            node={node}
            depth={0}
            isExpanded={isExpanded}
            onToggle={toggleExpanded}
            onStudy={handleStudy}
            onSelect={handleSelect}
            index={idx}
          />
        ))}

        {roots.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px 0',
            color: 'var(--ds-text-muted)', fontSize: 13,
          }}>
            Keine Stapel vorhanden
          </div>
        )}
      </div>

      {/* Fixed position elements */}
      <AccountBadge isPremium={isPremium} onClick={() => executeAction('settings.toggle')} />
      <PlusiDock onClick={() => executeAction('plusi.ask')} />
    </div>
  );
}
