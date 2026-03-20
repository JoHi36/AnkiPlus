import React from 'react';

export default function ToolErrorBadge({ toolName, error }) {
  return (
    <div style={{
      background: 'var(--ds-red-tint)',
      border: '1px solid rgba(255,69,58,0.15)',
      borderRadius: 12,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 14 }}>⚠</span>
      <span style={{
        fontSize: 12,
        color: 'var(--ds-red)',
        fontWeight: 500,
      }}>{error || `${toolName} fehlgeschlagen`}</span>
    </div>
  );
}
