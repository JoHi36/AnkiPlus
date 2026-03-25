import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * TermPopup — Unified term detail popup.
 *
 * Two modes:
 *   'bottom-bar' — Renders inline inside GraphBottomBar. No positioning, no backdrop, no close button.
 *   'overlay'    — Fixed-position floating panel near (x, y). Semi-transparent backdrop, close button (X).
 *                  Used in ReviewerView when the user clicks a marked term.
 */
export default function TermPopup({
  term,
  cardCount,
  deckNames = [],
  definition,
  sourceCount,
  generatedBy,
  connectedTerms = [],
  onTermClick,
  onStartStack,
  onClose,
  mode = 'bottom-bar',
  x,
  y,
  error,
  loading,
}) {
  const panelRef = useRef(null);

  // ── Overlay: close on Escape ──────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'overlay' || !onClose) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mode, onClose]);

  // ── Compute clamped overlay position ────────────────────────────────────
  const getOverlayStyle = () => {
    const PANEL_W = 360;
    const PANEL_H = 400;
    const MARGIN = 12;

    let left = (x ?? 0) + MARGIN;
    let top  = (y ?? 0) + MARGIN;

    if (typeof window !== 'undefined') {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (left + PANEL_W > vw - MARGIN) left = vw - PANEL_W - MARGIN;
      if (left < MARGIN) left = MARGIN;
      if (top + PANEL_H > vh - MARGIN) top = vh - PANEL_H - MARGIN;
      if (top < MARGIN) top = MARGIN;
    }

    return {
      position: 'fixed',
      left,
      top,
      width: PANEL_W,
      maxWidth: PANEL_W,
      maxHeight: PANEL_H,
      overflowY: 'auto',
      zIndex: 1000,
      background: 'var(--ds-bg-overlay)',
      border: '1px solid var(--ds-border-medium)',
      borderRadius: 12,
      boxShadow: 'var(--ds-shadow-lg)',
      fontFamily: 'var(--ds-font-sans)',
    };
  };

  // ── Shared panel content ─────────────────────────────────────────────────
  const panelContent = (
    <div style={{ padding: '16px' }}>

      {/* ── Header row: term name + optional close button ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{
          color: 'var(--ds-text-primary)',
          fontWeight: 600,
          fontSize: 16,
          lineHeight: 1.3,
          flex: 1,
          minWidth: 0,
          wordBreak: 'break-word',
        }}>
          {term}
        </span>

        {mode === 'overlay' && onClose && (
          <button
            onClick={onClose}
            aria-label="Schließen"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--ds-text-tertiary)',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
              padding: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--ds-hover-tint)';
              e.currentTarget.style.color = 'var(--ds-text-secondary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--ds-text-tertiary)';
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── Card count + deck names ── */}
      <p style={{
        color: 'var(--ds-text-secondary)',
        fontSize: 12,
        marginBottom: 14,
        lineHeight: 1.4,
      }}>
        {cardCount} {cardCount === 1 ? 'Karte' : 'Karten'}
        {deckNames.length > 0 && (
          <span> · {deckNames.join(', ')}</span>
        )}
      </p>

      {/* ── Definition area ── */}
      <div style={{ marginBottom: 8 }}>
        {loading ? (
          /* Pulsing loading placeholder */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LoadingBar width="100%" />
            <LoadingBar width="88%" />
            <LoadingBar width="72%" />
          </div>
        ) : error ? (
          <p style={{
            color: 'var(--ds-text-tertiary)',
            fontSize: 14,
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}>
            {error}
          </p>
        ) : definition !== null && definition !== undefined ? (
          <p style={{
            color: 'var(--ds-text-primary)',
            fontSize: 14,
            lineHeight: 1.5,
            margin: 0,
          }}>
            {definition}
          </p>
        ) : null}
      </div>

      {/* ── Source attribution ── */}
      {!loading && !error && (definition !== null && definition !== undefined) && (
        <p style={{
          color: 'var(--ds-text-tertiary)',
          fontSize: 11,
          marginBottom: 14,
          lineHeight: 1.4,
        }}>
          {generatedBy === 'research'
            ? 'Aus externer Recherche'
            : `Generiert aus ${sourceCount} ${sourceCount === 1 ? 'Karte' : 'Karten'}`}
        </p>
      )}

      {/* ── Connected terms chips ── */}
      {connectedTerms.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{
            color: 'var(--ds-text-tertiary)',
            fontSize: 11,
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Verbunden
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {connectedTerms.map((t) => (
              <ConnectedChip key={t} label={t} onClick={() => onTermClick?.(t)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Stapel starten button ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => onStartStack?.([])}
          style={{
            background: 'var(--ds-accent)',
            color: 'var(--ds-text-primary)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            transition: 'opacity 0.15s',
            fontFamily: 'var(--ds-font-sans)',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          Stapel starten
        </button>
      </div>
    </div>
  );

  // ── Render: bottom-bar mode ──────────────────────────────────────────────
  if (mode === 'bottom-bar') {
    return (
      <div ref={panelRef} style={{ fontFamily: 'var(--ds-font-sans)' }}>
        {panelContent}
      </div>
    );
  }

  // ── Render: overlay mode ─────────────────────────────────────────────────
  return (
    <>
      {/* Semi-transparent backdrop — closes on click */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 999,
        }}
      />

      {/* Floating panel */}
      <div ref={panelRef} style={getOverlayStyle()}>
        {panelContent}
      </div>
    </>
  );
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

function ConnectedChip({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-block',
        background: 'var(--ds-hover-tint)',
        color: 'var(--ds-text-secondary)',
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 12,
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.15s',
        fontFamily: 'var(--ds-font-sans)',
        lineHeight: 1.6,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-active-tint)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
    >
      {label}
    </button>
  );
}

function LoadingBar({ width }) {
  return (
    <div
      style={{
        width,
        height: 13,
        borderRadius: 6,
        background: 'var(--ds-hover-tint)',
        animation: 'term-popup-pulse 1.4s ease-in-out infinite',
      }}
    />
  );
}
