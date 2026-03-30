import React from 'react';

const SEPARATOR_STYLE = {
  height: 1,
  background: 'linear-gradient(90deg, transparent 0%, var(--ds-hover-tint) 20%, var(--ds-hover-tint) 80%, transparent 100%)',
  margin: '8px 0 24px',
};

export default function FadeSeparator() {
  return <div style={SEPARATOR_STYLE} />;
}
