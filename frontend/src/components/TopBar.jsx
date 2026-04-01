import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';

// Global: persist last known tab + indicator position across TopBar mounts
// This allows the sliding animation to work even when TopBar remounts
// between React render branches (early returns in App.jsx).
let _lastTab = 'stapel';
let _lastIndicator = null; // { left, width } from last mount

// Static style constants
const ESC_BADGE_STYLE = {
  fontSize: 9, fontWeight: 500,
  background: 'var(--ds-hover-tint)',
  border: '1px solid var(--ds-border-subtle)',
  padding: '2px 7px', borderRadius: 5,
  color: 'var(--ds-text-muted)',
};
const ESC_LABEL_STYLE = { fontSize: 11, color: 'var(--ds-text-muted)' };
const ESC_WRAPPER_STYLE = { display: 'flex', alignItems: 'center', gap: 6 };

/**
 * TopBar — unified top bar for all views.
 * Adapts content based on activeView and ankiState.
 */
export default function TopBar({
  activeView = 'deckBrowser',
  ankiState = 'deckBrowser',
  totalDue = 0,
  deckName = '',
  dueNew = 0,
  dueLearning = 0,
  dueReview = 0,
  onTabClick,
  onSidebarToggle,
  settingsOpen = false,
  canvasMode = false,
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

  // Left content — depends on view and canvasMode
  let leftContent;
  if (canvasMode) {
    leftContent = (
      <div style={ESC_WRAPPER_STYLE}>
        {plusButton}
        <kbd style={ESC_BADGE_STYLE}>ESC</kbd>
        <span style={ESC_LABEL_STYLE}>Verlassen</span>
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

  // Right content — hide stats in canvasMode, keep empty slot for layout balance
  let rightContent;
  if (canvasMode) {
    rightContent = null;
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
  // Animate on mount if the tab changed since last mount (cross-branch navigation)
  const shouldAnimateOnMount = _lastTab !== activeTab && _lastIndicator !== null;
  const [isFirstRender, setIsFirstRender] = useState(!shouldAnimateOnMount);

  // Measure active tab position + persist globally
  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab];
    const container = tabContainerRef.current;
    if (el && container) {
      const tabRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const newIndicator = {
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
      };

      // On mount: if tab changed across branches, start from last known position
      if (shouldAnimateOnMount && _lastIndicator) {
        // Set the OLD position first (no animation), then animate to new
        setIndicator(_lastIndicator);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIndicator(newIndicator);
          });
        });
      } else {
        setIndicator(newIndicator);
      }

      // Persist for next mount
      _lastIndicator = newIndicator;
      _lastTab = activeTab;
    }
    if (!isFirstRender) return;
    const timer = setTimeout(() => setIsFirstRender(false), 50);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Float only on Stapel tab — solid bar elsewhere (Session, Review, etc.)
  const isFloating = activeView === 'deckBrowser';

  return (
    <div style={{
      ...(isFloating
        ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: 'none' }
        : { flexShrink: 0 }
      ),
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: isFloating ? 48 : 56, paddingTop: 4,
      background: 'transparent',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', ...(isFloating && { pointerEvents: 'auto' }) }}>{leftContent}</div>
      <div
        ref={tabContainerRef}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 2,
          padding: 3, borderRadius: 8,
          background: 'var(--ds-hover-tint)',
          ...(isFloating && { pointerEvents: 'auto' }),
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
          transition: isFirstRender ? 'none' : 'left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 0,
        }} />
        {tabs.map(({ id, label }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              id={id === 'session' ? 'topbar-session-tab' : undefined}
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
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', ...(isFloating && { pointerEvents: 'auto' }) }}>{rightContent}</div>
    </div>
  );
}

