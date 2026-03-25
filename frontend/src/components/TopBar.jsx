import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';

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
  settingsOpen = false,
  holdToResetProps = {},
}) {
  const activeTab = activeView === 'statistik' ? 'statistik'
    : (ankiState === 'overview' || ankiState === 'review') ? 'session'
    : 'stapel';

  // Plus/Close button — morphs between + and × via CSS rotation
  const plusButton = (
    <button
      onClick={onSidebarToggle}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginRight: 8,
        transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.15s ease',
        transform: settingsOpen ? 'rotate(45deg)' : 'rotate(0deg)',
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

  // Tab bar with sliding indicator
  const tabs = [
    { id: 'stapel', label: 'Stapel' },
    { id: 'session', label: 'Session' },
    { id: 'statistik', label: 'Statistik' },
  ];

  const tabContainerRef = useRef(null);
  const tabRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [isFirstRender, setIsFirstRender] = useState(true);
  const [rubberBand, setRubberBand] = useState('none');
  const prevTabRef = useRef(activeTab);

  // Measure active tab position and trigger rubber band
  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab];
    const container = tabContainerRef.current;
    if (el && container) {
      const tabRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setIndicator({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      });

      // Rubber band: scale-stretch container toward direction of movement at edges
      if (!isFirstRender) {
        const tabIndex = tabs.findIndex(t => t.id === activeTab);
        const prevIndex = tabs.findIndex(t => t.id === prevTabRef.current);
        if (tabIndex !== prevIndex) {
          const movingRight = tabIndex > prevIndex;
          const isEdge = tabIndex === 0 || tabIndex === tabs.length - 1;
          if (isEdge) {
            // Stretch via scaleX + translateX — no layout shift
            setRubberBand(movingRight ? 'right' : 'left');
            setTimeout(() => setRubberBand('none'), 350);
          } else {
            setRubberBand('none');
          }
        }
      }
    }
    prevTabRef.current = activeTab;

    if (isFirstRender) {
      const timer = setTimeout(() => setIsFirstRender(false), 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  // Compute rubber band transform
  const rubberTransform = rubberBand === 'right'
    ? 'scaleX(1.02) translateX(1px)'
    : rubberBand === 'left'
      ? 'scaleX(1.02) translateX(-1px)'
      : 'scaleX(1) translateX(0)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56, paddingTop: 4, flexShrink: 0,
      background: 'transparent',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{leftContent}</div>
      <div
        ref={tabContainerRef}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 3, borderRadius: 8,
          background: 'var(--ds-hover-tint)',
          transform: rubberTransform,
          transformOrigin: rubberBand === 'right' ? 'left center' : rubberBand === 'left' ? 'right center' : 'center',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.2, 0.64, 1)',
        }}
      >
        {/* Sliding indicator — the "pill" that glides between tabs */}
        <div style={{
          position: 'absolute',
          top: 3, height: 'calc(100% - 6px)',
          left: indicator.left,
          width: indicator.width,
          borderRadius: 6,
          background: 'var(--ds-border-subtle)',
          transition: isFirstRender ? 'none' : 'left 0.32s cubic-bezier(0.25, 1, 0.5, 1), width 0.32s cubic-bezier(0.25, 1, 0.5, 1)',
          zIndex: 0,
        }} />
        {tabs.map(({ id, label }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              ref={el => { tabRefs.current[id] = el; }}
              onClick={() => onTabClick?.(id)}
              style={{
                position: 'relative', zIndex: 1,
                padding: '5px 16px', fontSize: 12, borderRadius: 6,
                border: 'none', cursor: isActive ? 'default' : 'pointer',
                fontWeight: isActive ? 600 : 500,
                background: 'transparent',
                color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)',
                transition: 'color 0.2s',
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
