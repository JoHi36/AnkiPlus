import React from 'react';

const SOURCES = {
  perplexity: {
    label: 'Perplexity',
    color: '#20B8CD',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M12 2v20M4 7l8 5 8-5M4 17l8-5 8 5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  pubmed: {
    label: 'PubMed',
    color: '#326599',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 8h3c1.5 0 2.5 1 2.5 2.5S12.5 13 11 13H8V8z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="8" y1="13" x2="8" y2="17" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  wikipedia: {
    label: 'Wikipedia',
    color: null, // uses ds-text-secondary
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M3 4l4.5 16h1L12 10l3.5 10h1L21 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
};

export default function ResearchSourceBadge({ toolUsed }) {
  // Normalize: 'perplexity/sonar' → 'perplexity'
  const key = toolUsed?.split('/')[0] || 'perplexity';
  const source = SOURCES[key] || SOURCES.perplexity;

  const textColor = source.color || 'var(--ds-text-secondary)';

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      color: textColor,
      fontSize: 11,
      fontWeight: 500,
    }}>
      {source.icon}
      {source.label}
    </span>
  );
}
