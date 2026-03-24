import React from 'react';

/**
 * TopBar — unified top bar for all views.
 * Adapts content based on activeView and ankiState.
 */
export default function TopBar({
  activeView = 'deckBrowser',
  ankiState = 'deckBrowser',
  messageCount = 0,
  totalDue = 0,
  deckName = '',
  dueNew = 0,
  dueLearning = 0,
  dueReview = 0,
  onTabClick,
  onSidebarToggle,
  holdToResetProps = {},
}) {
  const activeTab = (ankiState === 'overview' || ankiState === 'review') ? 'session' : 'stapel';

  // Plus button
  const plusButton = (
    <button
      onClick={onSidebarToggle}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginRight: 8,
        transition: 'transform 0.2s ease, opacity 0.15s ease',
        display: 'flex', alignItems: 'center', outline: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.6'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="5" y="0" width="4" height="14" rx="2" fill="var(--ds-accent)" opacity="0.6"/>
        <rect x="0" y="5" width="14" height="4" rx="2" fill="var(--ds-accent)" opacity="0.6"/>
      </svg>
    </button>
  );

  // Left content — depends on view
  let leftContent;
  if (activeView === 'freeChat') {
    leftContent = (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {plusButton}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
          {messageCount} {messageCount === 1 ? 'Nachricht' : 'Nachrichten'}
        </span>
      </div>
    );
  } else if (ankiState === 'overview') {
    const shortDeck = deckName ? deckName.split('::').pop() : '';
    leftContent = (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {plusButton}
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)',
          maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shortDeck}
        </span>
      </div>
    );
  } else {
    leftContent = (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {plusButton}
        {totalDue > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
            Heute: {totalDue} Karten
          </span>
        )}
      </div>
    );
  }

  // Right content
  let rightContent;
  if (activeView === 'freeChat') {
    rightContent = <HoldToResetIndicator {...holdToResetProps} />;
  } else if (ankiState === 'overview') {
    rightContent = (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: 'var(--ds-stat-new)', fontVariantNumeric: 'tabular-nums' }}>{dueNew}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: 'var(--ds-stat-learning)', fontVariantNumeric: 'tabular-nums' }}>{dueLearning}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: 'var(--ds-stat-review)', fontVariantNumeric: 'tabular-nums' }}>{dueReview}</span>
      </div>
    );
  } else {
    rightContent = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {[
          { color: 'var(--ds-stat-new)', label: 'Neu' },
          { color: 'var(--ds-stat-learning)', label: 'F\u00e4llig' },
          { color: 'var(--ds-stat-review)', label: 'Wieder' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 10, fontWeight: 500, color }}>{label}</span>
          </span>
        ))}
      </div>
    );
  }

  // Tab bar
  const tabs = [
    { id: 'stapel', label: 'Stapel' },
    { id: 'session', label: 'Session' },
    { id: 'statistik', label: 'Statistik' },
  ];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56, paddingTop: 4, flexShrink: 0,
      background: 'transparent',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{leftContent}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 8,
        background: 'var(--ds-hover-tint)',
      }}>
        {tabs.map(({ id, label }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => onTabClick?.(id)}
              style={{
                padding: '5px 16px', fontSize: 12, borderRadius: 6,
                border: 'none', cursor: isActive ? 'default' : 'pointer',
                fontWeight: isActive ? 600 : 500,
                background: isActive ? 'var(--ds-border-subtle)' : 'transparent',
                color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)',
                transition: 'background 0.15s, color 0.15s',
                fontFamily: 'inherit', lineHeight: 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{rightContent}</div>
    </div>
  );
}

function HoldToResetIndicator({ progress = 0, isHolding = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
        opacity: isHolding ? 1 : 0.6, transition: 'opacity 0.15s',
      }}>
        Zur\u00fccksetzen
      </span>
      <span style={{
        background: 'var(--ds-border-subtle)', padding: '2px 6px', borderRadius: 4,
        fontSize: 10, fontWeight: 600, color: 'var(--ds-text-secondary)',
        position: 'relative', overflow: 'hidden', minWidth: 18, textAlign: 'center',
      }}>
        R
        <span style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: `${progress * 100}%`,
          background: progress > 0.8 ? 'var(--ds-red)' : 'var(--ds-text-muted)',
          transition: isHolding ? 'none' : 'width 0.15s ease',
          borderRadius: 1,
        }} />
      </span>
    </div>
  );
}
