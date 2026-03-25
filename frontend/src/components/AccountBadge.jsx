import React from 'react';

export default function AccountBadge({ isPremium = false, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed', bottom: 16, right: 16,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 12px', borderRadius: 8,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-tertiary)', letterSpacing: '-0.2px' }}>
        AnkiPlus
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
        background: isPremium ? 'color-mix(in srgb, var(--ds-accent) 12%, transparent)' : 'var(--ds-border-subtle)',
        color: isPremium ? 'var(--ds-accent)' : 'var(--ds-text-muted)',
      }}>
        {isPremium ? 'Pro' : 'Free'}
      </span>
    </button>
  );
}
