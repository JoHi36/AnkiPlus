import React from 'react';
import DeckSearchBar from './DeckSearchBar';
import { DeckNode } from './DeckNode';
import AccountBadge from './AccountBadge';
import PlusiDock from './PlusiDock';
import { useDeckTree } from '../hooks/useDeckTree';
import { executeAction, bridgeAction } from '../actions';

export default function DeckBrowserView({ data, isPremium }) {
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
      flex: 1, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 20px 100px',
    }}>
      {/* Wordmark */}
      <div style={{
        fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px',
        color: 'var(--ds-text-primary)', marginBottom: 20, textAlign: 'center',
      }}>
        Anki<span style={{ color: 'var(--ds-accent)' }}>.plus</span>
        {isPremium && (
          <span style={{
            marginLeft: 10, fontSize: 10, fontWeight: 600, padding: '3px 10px',
            borderRadius: 10, verticalAlign: 'middle',
            background: 'var(--ds-accent)', color: 'white',
          }}>
            Pro
          </span>
        )}
      </div>

      {/* Search Bar */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 24 }}>
        <DeckSearchBar onSubmit={handleSearchSubmit} onOpenEmpty={handleSearchOpenEmpty} />
      </div>

      {/* Deck List */}
      <div style={{ width: '100%', maxWidth: 520 }}>
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
