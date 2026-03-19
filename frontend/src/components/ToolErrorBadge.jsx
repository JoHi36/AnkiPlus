import React from 'react';

export default function ToolErrorBadge({ toolName, error }) {
  return (
    <div style={{
      background: 'rgba(255,69,58,0.05)',
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
        color: 'rgba(255,69,58,0.8)',
        fontWeight: 500,
      }}>{error || `${toolName} fehlgeschlagen`}</span>
    </div>
  );
}
