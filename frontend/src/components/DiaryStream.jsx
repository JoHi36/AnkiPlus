import React from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const GERMAN_MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDayKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - entryDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  return `${d.getDate()}. ${GERMAN_MONTHS[d.getMonth()]}`;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Render entry text, replacing {{CIPHER}} placeholders with blurred spans.
 * cipher_parts provides the actual text content shown blurred.
 */
const BRAILLE_CHARS = '⠿⠾⠽⠻⠷⠯⠟⠾⠼⠺⠹⠳⠧';

function CipherSpan({ length }) {
  const [text, setText] = React.useState(() => {
    let s = '';
    for (let i = 0; i < length; i++) s += BRAILLE_CHARS[Math.floor(Math.random() * BRAILLE_CHARS.length)];
    return s;
  });

  React.useEffect(() => {
    const id = setInterval(() => {
      setText(prev => {
        const arr = prev.split('');
        for (let i = 0; i < 3; i++) {
          const pos = Math.floor(Math.random() * arr.length);
          arr[pos] = BRAILLE_CHARS[Math.floor(Math.random() * BRAILLE_CHARS.length)];
        }
        return arr.join('');
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      style={{
        display: 'inline',
        color: 'rgba(255,255,255,0.08)',
        fontSize: 14,
        wordBreak: 'break-all',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'default',
      }}
      title="[verschlüsselt]"
    >
      {text}
    </span>
  );
}

function renderEntryText(text, cipherParts = []) {
  if (!text) return null;

  const CIPHER_PLACEHOLDER = '{{CIPHER}}';
  if (!text.includes(CIPHER_PLACEHOLDER)) {
    return <span>{text}</span>;
  }

  const segments = text.split(CIPHER_PLACEHOLDER);
  const nodes = [];

  segments.forEach((segment, idx) => {
    if (segment) {
      nodes.push(<span key={`t-${idx}`}>{segment}</span>);
    }
    if (idx < segments.length - 1) {
      const cipherLen = cipherParts[idx] ? cipherParts[idx].length : 12;
      nodes.push(<CipherSpan key={`c-${idx}`} length={cipherLen} />);
    }
  });

  return <>{nodes}</>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiaryEntry({ entry }) {
  const timeStr = formatTime(entry.timestamp);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Time + Category Tag */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--ds-text-quaternary, rgba(255,255,255,0.25))',
          fontVariantNumeric: 'tabular-nums',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {timeStr}
        {entry.category && (() => {
          const TAG_CONFIG = {
            gemerkt:     { color: '#6ee7b7', bg: 'rgba(52,211,153,0.08)',  tip: 'Aus dem Chat entstanden' },
            reflektiert: { color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', tip: 'Plusi hat eigenständig nachgedacht' },
            entdeckt:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  tip: 'Plusi hat Karten durchsucht' },
            forscht:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  tip: 'Plusi hat Karten durchsucht' },
            'geträumt':  { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', tip: 'Plusi hat im Schlaf geträumt' },
          };
          const cfg = TAG_CONFIG[entry.category] || { color: 'var(--ds-text-muted)', bg: 'var(--ds-hover-tint)', tip: '' };
          return (
            <span
              title={cfg.tip}
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '1px 5px',
                borderRadius: 3,
                color: cfg.color,
                background: cfg.bg,
                cursor: cfg.tip ? 'help' : 'default',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              {entry.category}
              {cfg.tip && (
                <span style={{ fontSize: 7, opacity: 0.5 }}>?</span>
              )}
            </span>
          );
        })()}
      </div>

      {/* Entry text */}
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--ds-text-primary)',
        }}
      >
        {renderEntryText(entry.entry_text, entry.cipher_parts)}
      </p>

      {/* Discoveries */}
      {entry.discoveries && entry.discoveries.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            marginTop: 8,
          }}
        >
          {entry.discoveries.map((disc, idx) => (
            <span
              key={idx}
              style={{
                fontSize: 10,
                color: 'var(--ds-text-tertiary, rgba(255,255,255,0.35))',
                background: 'var(--ds-bg-overlay, rgba(255,255,255,0.06))',
                borderRadius: 6,
                padding: '2px 7px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {typeof disc === 'string'
                ? disc
                : disc.connection || disc.why || JSON.stringify(disc)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiaryStream({ entries = [], dayRefs }) {
  if (!entries || entries.length === 0) {
    return null;
  }

  // ── Group entries by day ───────────────────────────────────────────────────
  const groups = [];
  const keyToIndex = {};

  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  for (const entry of sorted) {
    const key = getDayKey(entry.timestamp);
    if (keyToIndex[key] == null) {
      keyToIndex[key] = groups.length;
      groups.push({ key, dayLabel: formatDayLabel(entry.timestamp), entries: [] });
    }
    groups[keyToIndex[key]].entries.push(entry);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {groups.map((group, groupIdx) => (
        <div
          key={group.key}
          ref={dayRefs ? (el) => { dayRefs.current[groupIdx] = el; } : undefined}
          style={{
            marginTop: groupIdx === 0 ? 0 : 28,
          }}
        >
          {/* Day label */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--ds-text-secondary, rgba(255,255,255,0.55))',
              borderBottom: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
              paddingBottom: 6,
              marginBottom: 12,
            }}
          >
            {group.dayLabel}
          </div>

          {/* Entries for this day */}
          {group.entries.map((entry) => (
            <DiaryEntry key={entry.id} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  );
}
