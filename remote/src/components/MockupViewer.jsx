import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Interactive mockup viewer for brainstorming dock layouts.
 * Accessible via ?mockup on the PWA URL.
 */

const BG = {
  minHeight: '100dvh',
  background: '#0A0A0C',
  color: 'rgba(255,255,255,0.92)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif',
  overflowX: 'hidden',
};

const HEADER = {
  padding: '20px 20px 12px',
  textAlign: 'center',
};

const TITLE = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  marginBottom: 4,
};

const SUBTITLE = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.4)',
  lineHeight: 1.4,
};

const PHONE_FRAME = {
  width: '100%',
  maxWidth: 320,
  aspectRatio: '9/19.5',
  borderRadius: 40,
  border: '3px solid rgba(255,255,255,0.1)',
  position: 'relative',
  overflow: 'hidden',
  margin: '0 auto',
};

const FROSTED = {
  background: 'linear-gradient(165deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 100%), rgba(28,28,30,0.82)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.28), inset 1px 0 0 0 rgba(255,255,255,0.12), 0 4px 24px rgba(0,0,0,0.25)',
};

const BTN_STYLE = {
  flex: 1,
  height: 48,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  cursor: 'default',
};

const BTN_LABEL = {
  fontSize: 13,
  fontWeight: 500,
  color: 'rgba(255,255,255,0.55)',
};

const BTN_KBD = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.25)',
  fontFamily: 'SF Mono, monospace',
};

const STATUS_VALUE = {
  fontSize: 28,
  fontWeight: 700,
  fontFamily: 'SF Mono, ui-monospace, monospace',
  color: 'rgba(48,209,88,0.9)',
};

const STATUS_LABEL = {
  fontSize: 12,
  color: 'rgba(48,209,88,0.6)',
  marginTop: 2,
};

const DECK_LABEL = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.3)',
  textAlign: 'center',
  letterSpacing: '0.02em',
};

const PROGRESS_TRACK = {
  height: 2,
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 1,
  overflow: 'hidden',
  marginTop: 8,
};

const PROGRESS_FILL = {
  width: '35%',
  height: '100%',
  background: 'rgba(10,132,255,0.6)',
  borderRadius: 1,
};

/* ── Shared status + buttons block ── */
function StatusDisplay() {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={STATUS_VALUE}>73%</div>
      <div style={STATUS_LABEL}>Good</div>
    </div>
  );
}

function TwoButtons() {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={BTN_STYLE}>
        <span style={BTN_LABEL}>Weiter</span>
        <span style={BTN_KBD}>SPACE</span>
      </div>
      <div style={BTN_STYLE}>
        <span style={BTN_LABEL}>Nachfragen</span>
        <span style={BTN_KBD}>↵</span>
      </div>
    </div>
  );
}

function DeckProgress() {
  return (
    <div>
      <div style={DECK_LABEL}>Neuroanatomie</div>
      <div style={PROGRESS_TRACK}>
        <div style={PROGRESS_FILL} />
      </div>
    </div>
  );
}

/* ── Option A: Dock unten ── */
function LayoutA() {
  return (
    <div style={{ ...PHONE_FRAME, background: 'rgba(0,0,0,0.4)' }}>
      <div style={{
        position: 'absolute', bottom: 16, left: 16, right: 16,
        borderRadius: 20, padding: '20px 16px 14px',
        ...FROSTED,
      }}>
        <div style={{ marginBottom: 14 }}><StatusDisplay /></div>
        <TwoButtons />
      </div>
    </div>
  );
}

/* ── Option B: Dock zentriert ── */
function LayoutB() {
  return (
    <div style={{
      ...PHONE_FRAME, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        margin: '0 20px', width: '100%',
        borderRadius: 20, padding: '20px 16px 14px',
        ...FROSTED,
      }}>
        <div style={{ marginBottom: 14 }}><StatusDisplay /></div>
        <TwoButtons />
      </div>
    </div>
  );
}

/* ── Option C: Fullscreen Dock ── */
function LayoutC() {
  return (
    <div style={{
      ...PHONE_FRAME,
      ...FROSTED,
      borderRadius: 40,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '28px 20px 20px',
    }}>
      <DeckProgress />
      <StatusDisplay />
      <TwoButtons />
    </div>
  );
}

/* ── Selector ── */
const OPTIONS = [
  { key: 'a', label: 'Dock unten', desc: 'Kompakt am Rand, Rest schwarz', Component: LayoutA },
  { key: 'b', label: 'Dock zentriert', desc: 'Schwebendes Element mittig', Component: LayoutB },
  { key: 'c', label: 'Fullscreen Dock', desc: 'Das ganze Handy IST das Dock', Component: LayoutC },
];

const SELECTOR_ROW = {
  display: 'flex',
  gap: 6,
  padding: '0 20px 16px',
  justifyContent: 'center',
};

const SELECTOR_BTN = (active) => ({
  padding: '8px 14px',
  borderRadius: 20,
  border: `1px solid ${active ? 'rgba(10,132,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
  background: active ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.04)',
  color: active ? 'rgba(10,132,255,1)' : 'rgba(255,255,255,0.5)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
});

const OPTION_DESC = {
  textAlign: 'center',
  fontSize: 12,
  color: 'rgba(255,255,255,0.35)',
  padding: '0 20px 20px',
};

export default function MockupViewer() {
  const [selected, setSelected] = useState('c');
  const option = OPTIONS.find(o => o.key === selected);

  return (
    <div style={BG}>
      <div style={HEADER}>
        <div style={TITLE}>Remote Dock</div>
        <div style={SUBTITLE}>Wähle eine Layout-Grundform</div>
      </div>

      <div style={SELECTOR_ROW}>
        {OPTIONS.map(o => (
          <button
            key={o.key}
            style={SELECTOR_BTN(selected === o.key)}
            onClick={() => setSelected(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px 12px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
          >
            <option.Component />
          </motion.div>
        </AnimatePresence>
      </div>

      <div style={OPTION_DESC}>{option.desc}</div>
    </div>
  );
}
