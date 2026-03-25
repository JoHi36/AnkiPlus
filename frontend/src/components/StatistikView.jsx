import React from 'react';

/**
 * StatistikView — empty canvas placeholder for future statistics.
 */
export default function StatistikView() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--ds-bg-canvas)',
      padding: 40,
    }}>
      <div style={{
        fontSize: 15,
        color: 'var(--ds-text-muted)',
        textAlign: 'center',
      }}>
        Statistik
      </div>
    </div>
  );
}
