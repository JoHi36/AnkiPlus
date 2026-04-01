import React, { useState, useEffect, useRef } from 'react';
import DiaryStream from './DiaryStream';

const MOOD_LABELS = {
  happy:      'freut sich',
  empathy:    'fühlt mit',
  excited:    'aufgeregt',
  neutral:    'chillt',
  sleepy:     'müde',
  surprised:  'überrascht',
  flustered:  'erwischt',
  thinking:   'grübelt...',
  annoyed:    'genervt',
  curious:    'neugierig',
  reading:    'stöbert...',
  proud:      'stolz',
  sleeping:   'schläft...',
  reflecting: 'reflektiert...',
  frustrated: 'frustriert',
  worried:    'besorgt',
  jealous:    'eifersüchtig',
};

const HEADER_STYLE = {
  flexShrink: 0,
  zIndex: 10,
  background: 'var(--ds-bg-deep)',
  padding: '12px 20px 8px',
};

const BUDGET_BAR_STYLE = {
  background: 'var(--ds-bg-frosted)',
  borderRadius: 10,
  padding: '10px 14px',
  marginBottom: 8,
  border: '1px solid var(--ds-border-subtle)',
};

const BUDGET_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 6,
};

const BUDGET_LABEL_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const BUDGET_VALUE_STYLE = {
  fontSize: 11,
  color: 'var(--ds-text-secondary)',
};

const BUDGET_TRACK_STYLE = {
  height: 3,
  background: 'var(--ds-border-subtle)',
  borderRadius: 2,
  overflow: 'hidden',
};

const SUBS_SECTION_STYLE = {
  marginBottom: 8,
};

const SUBS_LABEL_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

const SUB_ITEM_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 0',
  borderBottom: '1px solid var(--ds-border-subtle)',
};

const SUB_DOT_STYLE = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'var(--ds-accent)',
};

const SUB_NAME_STYLE = {
  fontSize: 11,
  color: 'var(--ds-text-secondary)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const SUB_EVENT_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
};

const SCROLL_AREA_STYLE = {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
};

const FADE_OVERLAY_STYLE = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 32,
  zIndex: 5,
  pointerEvents: 'none',
  background: 'linear-gradient(to bottom, var(--ds-bg-deep) 0%, transparent 100%)',
};

const SCROLL_INNER_STYLE = {
  height: '100%',
  overflowY: 'auto',
  padding: '24px 20px 140px',
};

const RESET_CONTAINER_STYLE = {
  marginTop: 40,
  paddingBottom: 20,
  textAlign: 'center',
};

const RESET_BTN_BASE = {
  background: 'none',
  border: 'none',
  color: 'var(--ds-text-muted)',
  fontSize: 11,
  cursor: 'pointer',
  padding: '6px 12px',
  transition: 'color 0.2s',
};

const CONFIRM_BOX_STYLE = {
  background: 'var(--ds-bg-overlay)',
  borderRadius: 10,
  padding: '14px 16px',
  maxWidth: 280,
  margin: '0 auto',
};

const CONFIRM_TEXT_STYLE = {
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
  margin: '0 0 12px',
  lineHeight: 1.5,
};

const CONFIRM_BTNS_STYLE = {
  display: 'flex',
  gap: 8,
  justifyContent: 'center',
};

const BTN_CANCEL_STYLE = {
  background: 'var(--ds-hover-tint)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 6,
  color: 'var(--ds-text-secondary)',
  fontSize: 11,
  padding: '5px 14px',
  cursor: 'pointer',
};

const BTN_RESET_STYLE = {
  background: 'var(--ds-red-10)',
  border: '1px solid var(--ds-red-20)',
  borderRadius: 6,
  color: 'var(--ds-red)',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 14px',
  cursor: 'pointer',
};

export default function PlusiMenu({ agent, bridge, onNavigateBack }) {
  const [data, setData] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    window.ankiBridge?.addMessage('getPlusiMenuData', null);
  }, []);

  useEffect(() => {
    function handleData(e) { setData(e.detail); }
    window.addEventListener('ankiPlusiMenuDataLoaded', handleData);
    return () => window.removeEventListener('ankiPlusiMenuDataLoaded', handleData);
  }, []);

  const diary = data?.diary || [];
  const subscriptions = data?.subscriptions || [];
  const budget = data?.budget || { used: 0, cap: 20, remaining: 20 };

  const budgetPct = budget.cap > 0
    ? Math.min(100, Math.round((budget.used / budget.cap) * 100))
    : 0;

  const handleReset = () => {
    window.ankiBridge?.addMessage('resetPlusi', null);
    setShowResetConfirm(false);
    setData(null);
    setTimeout(() => {
      window.ankiBridge?.addMessage('getPlusiMenuData', null);
    }, 500);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Fixed header — budget bar + subscriptions */}
      <div style={HEADER_STYLE}>
        {/* Budget bar */}
        <div style={BUDGET_BAR_STYLE}>
          <div style={BUDGET_ROW_STYLE}>
            <span style={BUDGET_LABEL_STYLE}>Plusi Budget</span>
            <span style={BUDGET_VALUE_STYLE}>{budget.used} / {budget.cap}</span>
          </div>
          <div style={BUDGET_TRACK_STYLE}>
            <div style={{
              height: '100%',
              borderRadius: 2,
              background: budgetPct >= 90
                ? 'var(--ds-red)'
                : budgetPct >= 70
                  ? 'var(--ds-yellow)'
                  : 'var(--ds-accent)',
              width: `${budgetPct}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Subscriptions */}
        {subscriptions.length > 0 && (
          <div style={SUBS_SECTION_STYLE}>
            <div style={SUBS_LABEL_STYLE}>Aktive Trigger</div>
            {subscriptions.map((sub, i) => (
              <div key={i} style={SUB_ITEM_STYLE}>
                <div style={SUB_DOT_STYLE} />
                <span style={SUB_NAME_STYLE}>{sub.name || sub.event}</span>
                <span style={SUB_EVENT_STYLE}>{sub.event}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable diary area */}
      <div style={SCROLL_AREA_STYLE}>
        <div style={FADE_OVERLAY_STYLE} />
        <div
          ref={scrollRef}
          className="scrollbar-hide"
          style={SCROLL_INNER_STYLE}
        >
          <DiaryStream entries={diary} />

          {/* Reset option at bottom */}
          <div style={RESET_CONTAINER_STYLE}>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                style={RESET_BTN_BASE}
                onMouseEnter={e => { e.target.style.color = 'var(--ds-red)'; }}
                onMouseLeave={e => { e.target.style.color = 'var(--ds-text-muted)'; }}
              >
                Plusi zurücksetzen
              </button>
            ) : (
              <div style={CONFIRM_BOX_STYLE}>
                <p style={CONFIRM_TEXT_STYLE}>
                  Plusis Erinnerungen, Tagebuch und Persönlichkeit werden gelöscht. Das kann nicht rückgängig gemacht werden.
                </p>
                <div style={CONFIRM_BTNS_STYLE}>
                  <button onClick={() => setShowResetConfirm(false)} style={BTN_CANCEL_STYLE}>
                    Abbrechen
                  </button>
                  <button onClick={handleReset} style={BTN_RESET_STYLE}>
                    Zurücksetzen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
