import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

/**
 * CardPreview — Simple card front + back popup.
 * Design system component. Anki-agnostic — receives pre-rendered HTML strings.
 * Rendered as a portal in document.body to avoid transform-context issues.
 *
 * Props:
 *   front    — HTML string (card front content, from Anki's sanitized rendering pipeline)
 *   back     — HTML string (card back content, from Anki's sanitized rendering pipeline)
 *   deckName — Deck path string ("A::B::C" → rendered as "A → B → C")
 *   onClose  — Called when backdrop clicked or Escape pressed
 *
 * NOTE: dangerouslySetInnerHTML is safe here — content comes from Anki's own rendering
 * pipeline which sanitizes all card HTML before delivery. This is the established pattern
 * in this codebase (see ReviewerView.jsx). The card-content class applies Anki's styling.
 */

// --- Static style constants ---

const BACKDROP_STYLE = {
  position: 'fixed',
  inset: 0,
  zIndex: 99998,
  background: 'var(--ds-scrim, color-mix(in srgb, var(--ds-bg-deep) 50%, transparent))',
};

const PANEL_BASE_STYLE = {
  position: 'fixed',
  zIndex: 99999,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%) scale(0.96)',
  width: '100%',
  maxWidth: 400,
  maxHeight: 500,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--ds-bg-deep)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 12,
  boxShadow: 'var(--ds-shadow-lg)',
  fontFamily: 'var(--ds-font-sans)',
  overflow: 'hidden',
  opacity: 0,
  transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
};

const PANEL_VISIBLE_STYLE = {
  ...PANEL_BASE_STYLE,
  opacity: 1,
  transform: 'translate(-50%, -50%) scale(1)',
};

const HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px 8px',
  borderBottom: '1px solid var(--ds-border-subtle)',
  flexShrink: 0,
};

const BREADCRUMB_STYLE = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  letterSpacing: 0.1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--ds-font-sans)',
};

const CLOSE_BUTTON_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--ds-text-tertiary)',
  cursor: 'pointer',
  flexShrink: 0,
  marginLeft: 8,
  fontFamily: 'var(--ds-font-sans)',
  transition: 'background 0.12s, color 0.12s',
};

const BODY_STYLE = {
  overflowY: 'auto',
  flex: '1 1 auto',
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--ds-border-medium) transparent',
};

const SECTION_STYLE = {
  padding: '12px 14px',
};

const SECTION_LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--ds-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 6,
  fontFamily: 'var(--ds-font-sans)',
};

const DIVIDER_STYLE = {
  height: 1,
  background: 'var(--ds-border-subtle)',
  margin: '0 14px',
  flexShrink: 0,
};

// ---

function formatDeckName(deckName) {
  if (!deckName) return null;
  return deckName.replace(/::/g, ' \u2192 ');
}

export default function CardPreview({ front, back, deckName, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formattedDeck = formatDeckName(deckName);
  const panelStyle = visible ? PANEL_VISIBLE_STYLE : PANEL_BASE_STYLE;

  const portal = (
    <>
      <div style={BACKDROP_STYLE} onClick={onClose} />

      <div style={panelStyle} role="dialog" aria-modal="true">
        {/* Header */}
        <div style={HEADER_STYLE}>
          <span style={BREADCRUMB_STYLE} title={formattedDeck || undefined}>
            {formattedDeck || 'Karte'}
          </span>
          <button
            style={CLOSE_BUTTON_STYLE}
            onClick={onClose}
            aria-label="Schlie\u00dfen"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ds-hover-tint)';
              e.currentTarget.style.color = 'var(--ds-text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--ds-text-tertiary)';
            }}
          >
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M3 3L13 13M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={BODY_STYLE}>
          {/* Front */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_LABEL_STYLE}>Vorderseite</div>
            {/* Card HTML from Anki's sanitized rendering pipeline — safe, established pattern */}
            {/* eslint-disable-next-line react/no-danger */}
            <div className="card-content" dangerouslySetInnerHTML={{ __html: front || '' }} />
          </div>

          {/* Divider */}
          <div style={DIVIDER_STYLE} />

          {/* Back */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_LABEL_STYLE}>R\u00fcckseite</div>
            {/* Card HTML from Anki's sanitized rendering pipeline — safe, established pattern */}
            {/* eslint-disable-next-line react/no-danger */}
            <div className="card-content" dangerouslySetInnerHTML={{ __html: back || '' }} />
          </div>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(portal, document.body);
}
