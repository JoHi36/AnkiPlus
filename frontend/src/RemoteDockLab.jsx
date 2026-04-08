import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * RemoteDockLab — Interactive mockup for the mobile Remote Dock.
 * Access via: npm run dev → localhost:3000?view=remote-dock
 *
 * Uses the full design system (var(--ds-*) tokens).
 * Renders at mobile viewport — open in phone or use DevTools responsive mode.
 */

/* ── Shared sub-components ── */

function DeckProgress() {
  return (
    <div>
      <div style={{
        fontSize: 'var(--ds-text-xs)', color: 'var(--ds-text-tertiary)',
        textAlign: 'center', letterSpacing: '0.02em',
      }}>
        Neuroanatomie
      </div>
      <div style={{
        height: 2, background: 'var(--ds-border-subtle)',
        borderRadius: 1, overflow: 'hidden', marginTop: 8,
      }}>
        <div style={{
          width: '35%', height: '100%',
          background: 'var(--ds-accent)', opacity: 0.6,
          borderRadius: 1,
        }} />
      </div>
    </div>
  );
}

function StatusDisplay({ variant }) {
  if (variant === 'timer') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 32, fontWeight: 700,
          fontFamily: 'var(--ds-font-mono)',
          color: 'var(--ds-green)',
        }}>6s</div>
        <div style={{
          fontSize: 'var(--ds-text-sm)', color: 'var(--ds-green)',
          opacity: 0.7, marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 10 }}>→</span>
          Good
        </div>
      </div>
    );
  }

  if (variant === 'score') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          height: 3, background: 'var(--ds-border-subtle)',
          borderRadius: 2, overflow: 'hidden', marginBottom: 10,
          margin: '0 20px 10px',
        }}>
          <div style={{
            width: '73%', height: '100%',
            background: 'var(--ds-green)', borderRadius: 2,
            transition: 'width 0.8s ease',
          }} />
        </div>
        <div style={{
          fontSize: 32, fontWeight: 700,
          fontFamily: 'var(--ds-font-mono)',
          color: 'var(--ds-green)',
        }}>73%</div>
        <div style={{
          fontSize: 'var(--ds-text-sm)', color: 'var(--ds-green)',
          opacity: 0.7, marginTop: 2,
        }}>Good</div>
      </div>
    );
  }

  if (variant === 'stars') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              fontSize: 28, lineHeight: 1,
              color: i < 2 ? 'var(--ds-text-primary)' : 'var(--ds-border-medium)',
              transition: 'color 0.3s',
            }}>{'\u2605'}</span>
          ))}
        </div>
        <div style={{
          fontSize: 'var(--ds-text-sm)', color: 'var(--ds-yellow)',
          opacity: 0.7, marginTop: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 10 }}>→</span>
          Hard
        </div>
      </div>
    );
  }

  // Default: question state — large "flip" indicator
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 14, fontWeight: 500,
        color: 'var(--ds-text-tertiary)',
        letterSpacing: '0.01em',
      }}>Karte bereit</div>
    </div>
  );
}

function TwoButtons({ left, right }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <motion.div
        whileTap={{ scale: 0.96 }}
        style={{
          flex: 1, height: 52, borderRadius: 'var(--ds-radius-md)',
          background: 'var(--ds-hover-tint)',
          border: '1px solid var(--ds-border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          fontSize: 'var(--ds-text-sm)', fontWeight: 500,
          color: 'var(--ds-text-secondary)',
        }}>{left.label}</span>
        <span style={{
          fontSize: 10, color: 'var(--ds-text-muted)',
          fontFamily: 'var(--ds-font-mono)',
        }}>{left.shortcut}</span>
      </motion.div>
      <motion.div
        whileTap={{ scale: 0.96 }}
        style={{
          flex: 1, height: 52, borderRadius: 'var(--ds-radius-md)',
          background: 'var(--ds-hover-tint)',
          border: '1px solid var(--ds-border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{
          fontSize: 'var(--ds-text-sm)', fontWeight: 500,
          color: 'var(--ds-text-secondary)',
        }}>{right.label}</span>
        <span style={{
          fontSize: 10, color: 'var(--ds-text-muted)',
          fontFamily: 'var(--ds-font-mono)',
        }}>{right.shortcut}</span>
      </motion.div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   LAYOUT VARIANTS
   ═══════════════════════════════════════════════════════ */

function LayoutA({ status, buttons }) {
  return (
    <div style={{
      height: '100%', position: 'relative',
      background: 'var(--ds-bg-deep)',
    }}>
      <div className="ds-frosted" style={{
        position: 'absolute', bottom: 20, left: 16, right: 16,
        borderRadius: 'var(--ds-radius-lg)',
        padding: '24px 16px 16px',
      }}>
        <div style={{ marginBottom: 16 }}><StatusDisplay variant={status} /></div>
        <TwoButtons left={buttons.left} right={buttons.right} />
      </div>
    </div>
  );
}

function LayoutB({ status, buttons }) {
  return (
    <div style={{
      height: '100%',
      background: 'var(--ds-bg-deep)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
    }}>
      <div className="ds-frosted" style={{
        width: '100%',
        borderRadius: 'var(--ds-radius-lg)',
        padding: '24px 16px 16px',
      }}>
        <div style={{ marginBottom: 16 }}><StatusDisplay variant={status} /></div>
        <TwoButtons left={buttons.left} right={buttons.right} />
      </div>
    </div>
  );
}

function LayoutC({ status, buttons }) {
  return (
    <div className="ds-frosted" style={{
      height: '100%',
      borderRadius: 0,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '52px 20px 28px',
    }}>
      <DeckProgress />
      <StatusDisplay variant={status} />
      <TwoButtons left={buttons.left} right={buttons.right} />
    </div>
  );
}


/* ═══════════════════════════════════════════════════════
   MAIN LAB
   ═══════════════════════════════════════════════════════ */

const LAYOUTS = [
  { key: 'a', label: 'Unten', Component: LayoutA },
  { key: 'b', label: 'Mitte', Component: LayoutB },
  { key: 'c', label: 'Fullscreen', Component: LayoutC },
];

const STATES = [
  { key: 'question', label: 'Frage', status: 'question', left: { label: 'Antwort', shortcut: 'SPACE' }, right: { label: 'MC', shortcut: '↵' } },
  { key: 'timer', label: 'Timer', status: 'timer', left: { label: 'Weiter', shortcut: 'SPACE' }, right: { label: 'Nachfragen', shortcut: '↵' } },
  { key: 'score', label: 'Score', status: 'score', left: { label: 'Weiter', shortcut: 'SPACE' }, right: { label: 'Nachfragen', shortcut: '↵' } },
  { key: 'stars', label: 'Sterne', status: 'stars', left: { label: 'Weiter', shortcut: 'SPACE' }, right: { label: 'Nachfragen', shortcut: '↵' } },
];

const PILL_ROW = {
  display: 'flex', gap: 6,
  justifyContent: 'center',
  flexWrap: 'wrap',
};

const PILL = (active) => ({
  padding: '6px 12px',
  borderRadius: 'var(--ds-radius-full)',
  border: `1px solid ${active ? 'var(--ds-accent)' : 'var(--ds-border)'}`,
  background: active ? 'var(--ds-accent-10)' : 'transparent',
  color: active ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
});

export default function RemoteDockLab() {
  const [layout, setLayout] = useState('c');
  const [stateKey, setStateKey] = useState('timer');

  const layoutObj = LAYOUTS.find(l => l.key === layout);
  const stateObj = STATES.find(s => s.key === stateKey);

  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') || 'dark'
  );
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  }, [theme]);

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--ds-bg-deep)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Controls bar */}
      <div style={{
        padding: '16px 16px 12px',
        background: 'var(--ds-bg-canvas)',
        borderBottom: '1px solid var(--ds-border-subtle)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: 'var(--ds-text-primary)',
            letterSpacing: '-0.02em',
          }}>Remote Dock</div>
          <button onClick={toggleTheme} style={{
            background: 'var(--ds-hover-tint)', border: '1px solid var(--ds-border)',
            borderRadius: 'var(--ds-radius-sm)', padding: '4px 10px',
            fontSize: 11, color: 'var(--ds-text-secondary)', cursor: 'pointer',
          }}>{theme === 'dark' ? '☀' : '☾'} Theme</button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 10, color: 'var(--ds-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
          }}>Layout</div>
          <div style={PILL_ROW}>
            {LAYOUTS.map(l => (
              <button key={l.key} style={PILL(layout === l.key)} onClick={() => setLayout(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{
            fontSize: 10, color: 'var(--ds-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
          }}>State</div>
          <div style={PILL_ROW}>
            {STATES.map(s => (
              <button key={s.key} style={PILL(stateKey === s.key)} onClick={() => setStateKey(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Phone preview */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${layout}-${stateKey}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <layoutObj.Component
              status={stateObj.status}
              buttons={{ left: stateObj.left, right: stateObj.right }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
