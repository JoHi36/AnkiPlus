import React from 'react';

export default function PlusiMenu() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px 140px', overflowY: 'auto',
    }}>
      <div style={{
        fontSize: 16, fontWeight: 600, textAlign: 'center',
        color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
        padding: '20px 0 16px',
      }}>
        Plusi
      </div>
      <div style={{
        fontSize: 13, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
        textAlign: 'center', padding: '40px 0',
      }}>
        Plusi-Menü wird in einem zukünftigen Update verfügbar sein.
      </div>
    </div>
  );
}
