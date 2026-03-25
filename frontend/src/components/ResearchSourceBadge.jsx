import React from 'react';
import perplexityWide from '../assets/perplexity-logo-wide.png';
import pubmedWide from '../assets/pubmed-logo-wide.png';
import wikipediaSmall from '../assets/wikipedia-logo-small.png';

const SOURCES = {
  perplexity: { logo: perplexityWide },
  pubmed: { logo: pubmedWide },
  wikipedia: { logo: wikipediaSmall, showLabel: true },
};

export default function ResearchSourceBadge({ toolUsed }) {
  const key = toolUsed?.split('/')[0] || 'perplexity';
  const source = SOURCES[key] || SOURCES.perplexity;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'var(--ds-bg-canvas)',
      border: '1px solid var(--ds-border-subtle)',
    }}>
      <img
        src={source.logo}
        alt={key}
        style={{ height: 12, objectFit: 'contain' }}
      />
      {source.showLabel && (
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ds-text-secondary)' }}>
          Wikipedia
        </span>
      )}
    </span>
  );
}
