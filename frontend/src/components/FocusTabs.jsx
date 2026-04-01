import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';

export default function FocusTabs({ focuses, activeFocusId, onSelect, onAdd }) {
  const daysUntil = (deadline) => {
    if (!deadline) return '?';
    const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  return (
    <div style={BAR_STYLE}>
      {focuses.map(f => {
        const isActive = f.id === activeFocusId;
        const color = getFocusColor(f.colorIndex);
        const days = daysUntil(f.deadline);
        return (
          <button
            key={f.id}
            onClick={() => onSelect(isActive ? null : f.id)}
            style={{
              ...TAB_STYLE,
              borderColor: isActive ? color : 'transparent',
              background: isActive ? getFocusColor(f.colorIndex, 0.08) : 'transparent',
            }}
          >
            <span style={{ ...DOT_STYLE, background: color }} />
            <span style={NAME_STYLE}>
              {(f.deckNames || []).join(', ') || 'Fokus'}
            </span>
            <span style={DAYS_STYLE}>{days}d</span>
          </button>
        );
      })}
      <button onClick={onAdd} style={ADD_STYLE}>+</button>
    </div>
  );
}

const BAR_STYLE = {
  display: 'flex', gap: 6, alignItems: 'center',
  overflowX: 'auto', scrollbarWidth: 'none', padding: '0 0 4px',
};
const TAB_STYLE = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 10,
  border: '1.5px solid transparent', background: 'transparent',
  cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, color: 'var(--ds-text-secondary)',
  transition: 'all 0.15s', whiteSpace: 'nowrap',
};
const DOT_STYLE = { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 };
const NAME_STYLE = { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' };
const DAYS_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)', fontVariantNumeric: 'tabular-nums' };
const ADD_STYLE = {
  width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--ds-border-subtle)',
  background: 'transparent', color: 'var(--ds-text-muted)',
  cursor: 'pointer', fontSize: 16, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
