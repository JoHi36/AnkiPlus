import React, { useState } from 'react';

export default function CompactWidget({ reason, onConfirm, onDismiss }) {
  const [state, setState] = useState('idle'); // 'idle' | 'confirmed' | 'dismissed'

  if (state === 'dismissed') return null;

  const handleConfirm = () => {
    setState('confirmed');
    onConfirm?.();
  };

  const handleDismiss = () => {
    setState('dismissed');
    onDismiss?.();
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      marginTop: 8,
      borderRadius: 12,
      background: 'var(--ds-bg-frosted)',
      border: '1px solid var(--ds-border-subtle)',
    }}>
      <span style={{
        fontSize: 13,
        color: 'var(--ds-text-secondary)',
        flex: 1,
      }}>
{reason || 'Erkenntnisse zusammenfassen?'}
      </span>

      {state === 'idle' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleConfirm}
            style={{
              padding: '5px 14px',
              borderRadius: 8,
              background: 'var(--ds-hover-tint)',
              color: 'var(--ds-accent)',
              fontSize: 12,
              fontWeight: 500,
              border: '1px solid var(--ds-border-subtle)',
              cursor: 'pointer',
            }}
          >
            Zusammenfassen
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '5px 10px',
              background: 'transparent',
              color: 'var(--ds-text-muted)',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Nein danke
          </button>
        </div>
      )}

      {state === 'confirmed' && (
        <span style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>
          Wird zusammengefasst...
        </span>
      )}
    </div>
  );
}
