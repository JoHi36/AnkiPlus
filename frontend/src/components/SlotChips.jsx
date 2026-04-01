import React from 'react';
import SlotChip from './SlotChip';

const CATEGORY_LABELS = {
  trigger: { label: 'Trigger', color: 'var(--ds-yellow)' },
  tool:    { label: 'Tools',   color: 'var(--ds-accent)' },
  output:  { label: 'Output',  color: 'var(--ds-green)'  },
};

export default function SlotChips({ slots, category, onSlotToggle }) {
  const cat = CATEGORY_LABELS[category] || CATEGORY_LABELS.tool;
  if (!slots || slots.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '7px' }}>
      <div style={{
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: cat.color,
        opacity: 0.5,
        minWidth: '46px',
        paddingTop: '4px',
      }}>
        {cat.label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
        {slots.map(slot => (
          <SlotChip
            key={slot.ref}
            label={slot.label || slot.ref}
            mode={slot.mode}
            category={category}
            onToggle={() => onSlotToggle?.(slot.ref, slot.mode === 'off' ? 'on' : 'off')}
          />
        ))}
      </div>
    </div>
  );
}
