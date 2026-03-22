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
      padding: '8px 0',
      marginTop: 6,
    }}>
      {state === 'idle' && (
        <>
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
            Erkenntnisse extrahieren
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
        </>
      )}

      {state === 'confirmed' && (
        <span style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>
          Wird zusammengefasst...
        </span>
      )}
    </div>
  );
}
