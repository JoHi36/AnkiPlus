import React from 'react';

const LINE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  marginBottom: 8,
};

const NAME_STYLE = {
  fontWeight: 600,
  color: 'var(--ds-text-secondary)',
};

const SEP_STYLE = {
  opacity: 0.3,
};

const DOTS_STYLE = {
  display: 'flex',
  gap: 2,
  alignItems: 'center',
};

const DOT_STYLE = {
  width: 4,
  height: 4,
  borderRadius: '50%',
};

export default function ActivityLine({ agentName, cardCount, stepCount, citedCount, cardSourceCount }) {
  const webCount = citedCount - (cardSourceCount || 0);
  const hasSources = citedCount > 0;
  const hasAction = cardCount > 0;

  const dots = hasSources ? [
    ...Array(Math.min(cardSourceCount || 0, 6)).fill('card'),
    ...Array(Math.min(Math.max(webCount, 0), 4)).fill('web'),
  ] : [];

  return (
    <div style={LINE_STYLE}>
      <span style={NAME_STYLE}>{agentName || 'tutor'}</span>

      {hasAction && (
        <>
          <span style={SEP_STYLE}>·</span>
          <span>durchsuchte {cardCount.toLocaleString('de-DE')} Karten</span>
        </>
      )}

      {stepCount > 3 && (
        <>
          <span style={SEP_STYLE}>·</span>
          <span>{stepCount} Schritte</span>
        </>
      )}

      {hasSources && (
        <>
          <span style={SEP_STYLE}>·</span>
          <div style={DOTS_STYLE}>
            {dots.map((type, i) => (
              <div
                key={i}
                style={{
                  ...DOT_STYLE,
                  background: type === 'card'
                    ? 'color-mix(in srgb, var(--ds-accent) 50%, transparent)'
                    : 'color-mix(in srgb, var(--ds-green) 50%, transparent)',
                }}
              />
            ))}
          </div>
          <span>{citedCount} Quelle{citedCount !== 1 ? 'n' : ''}</span>
        </>
      )}

      {!hasAction && !hasSources && (
        <>
          <span style={SEP_STYLE}>·</span>
          <span>direkte Antwort</span>
        </>
      )}
    </div>
  );
}
