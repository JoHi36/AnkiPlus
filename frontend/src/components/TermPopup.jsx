import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '@shared/components/CitationRef';
import CitationPreview from './CitationPreview';

/**
 * TermPopup — Agentic term definition popup.
 * Rendered as portal in document.body to avoid transform-context issues.
 * Arrow is integrated into the panel shape via overlapping border trick.
 */

const PANEL_W = 320;
const ARROW_H = 8;
const EDGE_PAD = 10;

export default function TermPopup({
  term, cardCount, definition, sourceCount, generatedBy,
  connectedTerms = [], cardRefs, onTermClick, onClose,
  mode = 'overlay', x, y, error, loading,
}) {
  const panelRef = useRef(null);
  const [animIn, setAnimIn] = useState(false);
  const [previewCardId, setPreviewCardId] = useState(null);

  useEffect(() => { requestAnimationFrame(() => setAnimIn(true)); }, [term]);

  useEffect(() => {
    if (mode !== 'overlay' || !onClose) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [mode, onClose]);

  const pos = useMemo(() => {
    const vw = window.innerWidth || 1200;
    let left = (x || 0) - PANEL_W / 2;
    if (left + PANEL_W > vw - EDGE_PAD) left = vw - PANEL_W - EDGE_PAD;
    if (left < EDGE_PAD) left = EDGE_PAD;
    const top = (y || 0) + ARROW_H;
    const arrowLeft = Math.max(16, Math.min(PANEL_W - 16, (x || 0) - left));
    return { left, top, arrowLeft };
  }, [x, y]);

  const citationsArray = useMemo(() => {
    if (!cardRefs) return [];
    if (Array.isArray(cardRefs)) return cardRefs;
    return Object.entries(cardRefs).map(([key, ref]) => ({
      type: 'card',
      index: parseInt(key, 10),
      cardId: parseInt(ref.id || key, 10),
      noteId: parseInt(ref.id || key, 10),
      front: ref.question || '',
    }));
  }, [cardRefs]);

  // Expand [2, 3] → [2] [3]
  const cleanDef = useMemo(() => {
    if (!definition) return '';
    return definition.replace(/\[(\d+(?:,\s*\d+)+)\]/g, (_, nums) =>
      nums.split(',').map(n => `[${n.trim()}]`).join(' ')
    );
  }, [definition]);

  const renderDef = useCallback(() => {
    if (!cleanDef) return null;
    const segments = parseCitations(cleanDef, citationsArray);
    return segments.map((seg, i) => {
      if (seg.type === 'citation') {
        return (
          <CitationRef
            key={i}
            index={seg.citation.index}
            variant="card"
            onClick={() => {
              if (seg.citation.cardId) setPreviewCardId(seg.citation.cardId);
            }}
            title={seg.citation.front || `Karte ${seg.citation.index}`}
          />
        );
      }
      if (!seg.content.trim()) return null;
      return (
        <ReactMarkdown key={i}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <>{children}</>,
            strong: ({ children }) => (
              <strong style={{ color: 'var(--ds-text-primary)', fontWeight: 600 }}>
                {children}
              </strong>
            ),
          }}
        >{seg.content}</ReactMarkdown>
      );
    });
  }, [cleanDef, citationsArray]);

  const steps = useMemo(() => {
    if (loading) return [
      { label: 'Karten durchsuchen', s: 'active' },
      { label: 'Definition ableiten', s: 'pending' },
    ];
    if (error) return [
      { label: 'Karten durchsucht', s: 'done' },
      { label: 'Nicht ableitbar', s: 'error' },
    ];
    if (definition) return [
      { label: `${sourceCount || 0} Karten`, s: 'done' },
      { label: generatedBy === 'research' ? 'Research' : 'Tutor', s: 'done' },
    ];
    return [];
  }, [loading, error, definition, sourceCount, generatedBy]);

  const StepIcon = ({ s }) => {
    if (s === 'active') return <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ds-accent)', animation: 'tp-pulse 1.2s ease-in-out infinite', flexShrink: 0 }} />;
    if (s === 'done') return <svg width={9} height={9} viewBox="0 0 16 16" fill="none" stroke="var(--ds-green)" strokeWidth={2.5} strokeLinecap="round"><path d="M3 8.5L6.5 12L13 4" /></svg>;
    if (s === 'error') return <svg width={9} height={9} viewBox="0 0 16 16" fill="none" stroke="var(--ds-red)" strokeWidth={2.5} strokeLinecap="round"><path d="M4 4L12 12M12 4L4 12" /></svg>;
    return null;
  };

  if (mode === 'bottom-bar') return (
    <div style={{ padding: '12px 14px', fontFamily: 'var(--ds-font-sans)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 8 }}>{term}</div>
      {definition && <div style={{ fontSize: 13, color: 'var(--ds-text-secondary)', lineHeight: 1.6 }}>{renderDef()}</div>}
    </div>
  );

  // Overlay: render as portal in document.body (avoids transform-context issues)
  const overlay = (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99998 }} />

      {/* Panel with integrated arrow */}
      <div ref={panelRef} style={{
        position: 'fixed', zIndex: 99999,
        left: pos.left, top: pos.top,
        width: PANEL_W,
        opacity: animIn ? 1 : 0,
        transform: animIn ? 'translateY(0)' : 'translateY(-4px)',
        transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
      }}>
        {/* Arrow — same bg as panel, overlaps top border for seamless look */}
        <div style={{
          position: 'absolute',
          top: -ARROW_H + 1,
          left: pos.arrowLeft - ARROW_H,
          width: 0, height: 0,
          borderLeft: `${ARROW_H}px solid transparent`,
          borderRight: `${ARROW_H}px solid transparent`,
          borderBottom: `${ARROW_H}px solid var(--ds-bg-deep)`,
          zIndex: 2,
        }} />
        {/* Arrow border (slightly larger, behind the fill arrow) */}
        <div style={{
          position: 'absolute',
          top: -ARROW_H - 0.5,
          left: pos.arrowLeft - ARROW_H - 0.5,
          width: 0, height: 0,
          borderLeft: `${ARROW_H + 0.5}px solid transparent`,
          borderRight: `${ARROW_H + 0.5}px solid transparent`,
          borderBottom: `${ARROW_H + 0.5}px solid var(--ds-border-subtle)`,
          zIndex: 1,
        }} />
        {/* Bridge — covers the panel top border under the arrow for seamless connection */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: pos.arrowLeft - ARROW_H + 1,
          width: (ARROW_H - 1) * 2,
          height: 2,
          background: 'var(--ds-bg-deep)',
          zIndex: 3,
        }} />

        {/* Panel body */}
        <div style={{
          position: 'relative', zIndex: 2,
          maxHeight: 360, overflowY: 'auto',
          background: 'var(--ds-bg-deep)',
          border: '1px solid var(--ds-border-subtle)',
          borderRadius: 10,
          boxShadow: 'var(--ds-shadow-lg)',
          scrollbarWidth: 'none',
          fontFamily: 'var(--ds-font-sans)',
        }}>
          <div style={{ padding: '12px 14px' }}>

            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-text-primary)', lineHeight: 1.3, marginBottom: 4 }}>
              {term}
            </div>

            {steps.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, fontSize: 10 }}>
                {steps.map((step, i) => (
                  <React.Fragment key={i}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      color: step.s === 'active' ? 'var(--ds-accent)' : step.s === 'error' ? 'var(--ds-red)' : 'var(--ds-text-tertiary)',
                    }}>
                      <StepIcon s={step.s} />
                      {step.label}
                    </span>
                    {i < steps.length - 1 && <span style={{ margin: '0 4px', color: 'var(--ds-border-medium)', fontSize: 9 }}>→</span>}
                  </React.Fragment>
                ))}
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[100, 92, 78].map((w, i) => (
                  <div key={i} style={{ width: `${w}%`, height: 11, borderRadius: 5, background: 'var(--ds-hover-tint)', animation: `tp-pulse 1.4s ease-in-out ${i * 0.1}s infinite` }} />
                ))}
              </div>
            ) : error ? (
              <div style={{ fontSize: 13, color: 'var(--ds-text-tertiary)', fontStyle: 'italic', lineHeight: 1.5 }}>{error}</div>
            ) : definition ? (
              <div style={{ fontSize: 13, color: 'var(--ds-text-secondary)', lineHeight: 1.6 }}>{renderDef()}</div>
            ) : null}

            {connectedTerms.length > 0 && !loading && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--ds-border-subtle)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {connectedTerms.slice(0, 6).map(t => (
                    <button key={t} onClick={(e) => { e.stopPropagation(); onTermClick?.(t); }}
                      style={{
                        background: 'var(--ds-hover-tint)', color: 'var(--ds-text-muted)',
                        borderRadius: 5, padding: '2px 8px', fontSize: 11,
                        border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--ds-font-sans)', lineHeight: 1.6,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--ds-active-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--ds-hover-tint)'}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewCardId && (
        <CitationPreview
          cardId={previewCardId}
          onClose={() => setPreviewCardId(null)}
        />
      )}

      <style>{`@keyframes tp-pulse { 0%,100% { opacity:.4 } 50% { opacity:1 } }`}</style>
    </>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
