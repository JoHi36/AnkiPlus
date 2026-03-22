import React from 'react';

/**
 * OverlayHeader — pixel-identical replica of custom_screens _top_bar().
 * Matches: height 56px, padding 0 20px, tabs centered, info left/right.
 *
 * When chatOpen=false, shows Stapel header (Heute: X Karten, Neu/Fällig/Wieder).
 * When chatOpen=true, shows Chat header (N Nachrichten, HoldToReset).
 */
export default function OverlayHeader({
  chatOpen = false,
  messageCount = 0,
  totalDue = 0,
  dueNew = 0,
  dueLearning = 0,
  dueReview = 0,
  onTabClick,
  onSidebarToggle,
  holdToResetProps = {},
}) {
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

  const leftContent = chatOpen ? (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {plusButton}
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
        {messageCount} {messageCount === 1 ? 'Nachricht' : 'Nachrichten'}
      </span>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {plusButton}
      {totalDue > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
          Heute: {totalDue} Karten
        </span>
      )}
    </div>
  );

  const rightContent = chatOpen ? (
    <HoldToResetIndicator {...holdToResetProps} />
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {[
        { color: 'var(--ds-stat-new)', label: 'Neu' },
        { color: 'var(--ds-stat-learning)', label: 'Fällig' },
        { color: 'var(--ds-stat-review)', label: 'Wieder' },
      ].map(({ color, label }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 10, fontWeight: 500, color }}>{label}</span>
        </span>
      ))}
    </div>
  );

  const tabs = ['Stapel', 'Session', 'Statistik'];
  const tabBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 8,
      background: 'var(--ds-hover-tint)',
    }}>
      {tabs.map(tab => {
        const isActive = tab === 'Stapel';
        return (
          <button
            key={tab}
            onClick={() => onTabClick?.(tab.toLowerCase())}
            style={{
              padding: '5px 16px', fontSize: 12, borderRadius: 6,
              border: 'none', cursor: isActive ? 'default' : 'pointer',
              fontWeight: isActive ? 600 : 500,
              background: isActive ? 'var(--ds-border-subtle)' : 'transparent',
              color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)',
              transition: 'background 0.15s, color 0.15s',
              fontFamily: 'inherit',
              lineHeight: 1,
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56, paddingTop: 4, flexShrink: 0,
      background: 'transparent',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{leftContent}</div>
      {tabBar}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{rightContent}</div>
    </div>
  );
}

function HoldToResetIndicator({ progress = 0, isHolding = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
        opacity: isHolding ? 1 : 0.6, transition: 'opacity 0.15s',
      }}>
        Zurücksetzen
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
