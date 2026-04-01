import React from 'react';
import DeckSearchBar from './DeckSearchBar';
import { DeckNode } from './DeckNode';
import PlusiDock from './PlusiDock';
import { useDeckTree } from '../hooks/useDeckTree';
import { executeAction, bridgeAction } from '../actions';

const MAX_W = 'var(--ds-content-width)';

export default function DeckBrowserView({ data, isPremium, lidState, canvasOpen, sidebarOpen, onLidClick, onLidAnimEnd, searchBarRef, onSearchSubmit, flipRect }) {
  const { isExpanded, toggleExpanded, ensureRootsExpanded } = useDeckTree();

  if (!data) return null;

  const { roots = [], totalDue = 0 } = data;

  /* Auto-expand top-level decks on first render */
  ensureRootsExpanded(roots);

  const hide = canvasOpen || lidState === 'animating' || lidState === 'open' || lidState === 'reversing';

  return (
    <div style={{
      flex: 1, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0 20px',
      position: 'relative',
    }}>
      {/* Wordmark */}
      <div style={{
        flexShrink: 0, paddingTop: 120,
        display: hide ? 'none' : 'flex',
        alignItems: 'center', justifyContent: 'center',
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
      </div>



      {/* SearchBar — ALWAYS visible, animates via lid-lift */}
      <div style={{
        flexShrink: 0, width: '100%', maxWidth: MAX_W,
        marginBottom: 16, zIndex: 50,
        position: 'relative',
      }}>
        <DeckSearchBar
          ref={searchBarRef}
          onSubmit={onSearchSubmit}
          lidState={lidState}
          onLidClick={onLidClick}
          onLidAnimEnd={onLidAnimEnd}
          externalFlipRect={flipRect}
          sidebarOpen={sidebarOpen}
        />
      </div>

      {/* Deck List */}
      <div style={{
        flex: 1, overflowY: 'auto',
        width: '100%', maxWidth: MAX_W,
        paddingBottom: 100,
        scrollbarWidth: 'none',
        display: hide ? 'none' : 'block',
      }}>
        {roots.map((node, idx) => (
          <DeckNode
            key={node.id}
            node={node}
            depth={0}
            isExpanded={isExpanded}
            onToggle={(id) => toggleExpanded(id)}
            onStudy={(deckId) => executeAction('deck.study', { deckId })}
            onSelect={(deckId) => executeAction('deck.select', { deckId })}
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

      <div style={{ display: hide ? 'none' : undefined }}>
        <PlusiDock onClick={() => executeAction('plusi.ask')} />
      </div>
    </div>
  );
}
