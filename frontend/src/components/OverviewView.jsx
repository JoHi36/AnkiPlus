import React from 'react';

/**
 * OverviewView — study overview screen shown when a deck is selected.
 * Port of _overview_html() from ui/custom_screens.py.
 *
 * Props:
 *   data       — { deckId, deckName, dueNew, dueLearning, dueReview }
 *   onStudy    — called when "Jetzt lernen" is clicked
 *   onBack     — called when "Zurück" is clicked
 *   onOptions  — called when "Optionen" is clicked
 */
export default function OverviewView({ data, onStudy, onBack, onOptions }) {
  const deckName = data?.deckName || '';
  const dueNew = data?.dueNew || 0;
  const dueLearning = data?.dueLearning || 0;
  const dueReview = data?.dueReview || 0;
  const total = dueNew + dueLearning + dueReview;

  const parts = deckName.split('::');
  const displayName = parts[parts.length - 1];
  const pathParts = parts.length > 1 ? parts.slice(0, -1) : [];
  const pathStr = pathParts.join(' :: ');

  const hasDue = total > 0;

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 28px',
      minHeight: 0,
    }}>
      {/* Deck path breadcrumb */}
      {pathStr && (
        <div style={{
          fontSize: '11px',
          color: 'var(--ds-text-tertiary)',
          marginBottom: '8px',
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}>
          {pathStr}
        </div>
      )}

      {/* Deck name */}
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        color: 'var(--ds-text-primary)',
        letterSpacing: '-0.5px',
        marginBottom: '28px',
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        {displayName}
      </div>

      {/* Due pills */}
      <div style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '36px',
      }}>
        <Pill count={dueNew} label="Neu" color="var(--ds-stat-new)" />
        <Pill count={dueLearning} label="Lernen" color="var(--ds-stat-learning)" />
        <Pill count={dueReview} label="Wieder" color="var(--ds-stat-review)" />
      </div>

      {/* Study button */}
      {hasDue ? (
        <button
          onClick={onStudy}
          style={{
            background: 'var(--ds-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            padding: '14px 48px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginBottom: '24px',
            letterSpacing: '-0.1px',
            transition: 'opacity 0.12s, transform 0.08s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          Jetzt lernen
        </button>
      ) : (
        <div style={{
          background: 'var(--ds-bg-overlay)',
          color: 'var(--ds-text-muted)',
          border: '1px solid var(--ds-border-subtle)',
          borderRadius: '12px',
          padding: '14px 48px',
          fontSize: '15px',
          fontWeight: 600,
          fontFamily: 'inherit',
          marginBottom: '24px',
          letterSpacing: '-0.1px',
        }}>
          Keine Karten fallig
        </div>
      )}

      {/* Bottom actions */}
      <div style={{ display: 'flex', gap: '24px' }}>
        <ActionLink onClick={onBack}>
          ← Zurück
        </ActionLink>
        <ActionLink onClick={onOptions}>
          Optionen
        </ActionLink>
      </div>
    </div>
  );
}

function Pill({ count, label, color }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      padding: '14px 22px',
      borderRadius: '16px',
      background: 'var(--ds-bg-overlay)',
      border: '1px solid var(--ds-border-subtle)',
      minWidth: '80px',
    }}>
      <span style={{
        fontSize: '26px',
        fontWeight: 700,
        letterSpacing: '-0.5px',
        fontVariantNumeric: 'tabular-nums',
        color,
      }}>
        {count}
      </span>
      <span style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color,
      }}>
        {label}
      </span>
    </div>
  );
}

function ActionLink({ onClick, children }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        color: hovered ? 'var(--ds-text-secondary)' : 'var(--ds-text-muted)',
        fontSize: '13px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        padding: '4px 2px',
        transition: 'color 0.1s',
      }}
    >
      {children}
    </button>
  );
}
