import React from 'react';

const CATEGORY_STYLES = {
  trigger: { color: 'var(--ds-yellow)', bg: 'var(--ds-yellow-10)' },
  tool:    { color: 'var(--ds-accent)', bg: 'var(--ds-accent-10)' },
  output:  { color: 'var(--ds-green)',  bg: 'var(--ds-green-10)'  },
};

const LockIcon = ({ color }) => (
  <svg width="7" height="7" viewBox="0 0 16 16" style={{ opacity: 0.35, flexShrink: 0 }}>
    <rect x="2" y="7" width="12" height="8" rx="2" fill={color} />
    <path d="M5 7V5a3 3 0 016 0v2" stroke={color} fill="none" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function SlotChip({ label, mode, category, onToggle }) {
  const styles = CATEGORY_STYLES[category] || CATEGORY_STYLES.tool;
  const isOff = mode === 'off';
  const isLocked = mode === 'locked';
  const canToggle = !isLocked && typeof onToggle === 'function';

  return (
    <button
      onClick={canToggle ? onToggle : undefined}
      disabled={isLocked}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: isOff ? 'transparent' : styles.bg,
        border: isOff ? `1px solid ${styles.bg}` : `1px solid transparent`,
        borderRadius: '6px',
        padding: '3px 8px',
        fontSize: '10px',
        color: styles.color,
        opacity: isOff ? 0.35 : 1,
        textDecoration: isOff ? 'line-through' : 'none',
        cursor: canToggle ? 'pointer' : 'default',
        transition: 'opacity 0.15s, background 0.15s',
      }}
    >
      <span>{label}</span>
      {isLocked && <LockIcon color={styles.color} />}
    </button>
  );
}
