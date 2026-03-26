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
        color: 'var(--ds-text-muted)',
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

const TAG_CONFIG = {
  gemerkt:     { color: 'var(--ds-green)',  bg: 'var(--ds-green-10)',  tip: 'Während eines Gesprächs entstanden' },
  reflektiert: { color: 'var(--ds-purple)', bg: 'color-mix(in srgb, var(--ds-purple) 10%, transparent)', tip: 'Plusi war allein aktiv und hat selbstständig nachgedacht' },
  entdeckt:    { color: 'var(--ds-yellow)', bg: 'var(--ds-yellow-10)', tip: 'Plusi hat eigenständig Karten durchsucht und Verbindungen gefunden' },
  forscht:     { color: 'var(--ds-yellow)', bg: 'var(--ds-yellow-10)', tip: 'Plusi hat eigenständig Karten durchsucht und Verbindungen gefunden' },
  'geträumt':  { color: 'var(--ds-accent)', bg: 'var(--ds-accent-10)', tip: 'Plusi hat im Schlaf geträumt — automatisch, ohne gesteuert zu werden' },
};

function CategoryTag({ category }) {
  const [showTip, setShowTip] = React.useState(false);
  const cfg = TAG_CONFIG[category] || { color: 'var(--ds-text-muted)', bg: 'var(--ds-hover-tint)', tip: '' };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <span style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '1px 5px 1px 5px',
        borderRadius: 3,
        color: cfg.color,
        background: cfg.bg,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        cursor: cfg.tip ? 'help' : 'default',
      }}>
        {category}
        {cfg.tip && (
          <span style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: `1px solid ${cfg.color}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 6,
            fontWeight: 700,
            opacity: 0.6,
            flexShrink: 0,
          }}>
            ?
          </span>
        )}
      </span>
      {showTip && cfg.tip && (
        <>
          {/* Arrow */}
          <span style={{
            position: 'absolute',
            left: 12,
            top: '100%',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderBottom: '5px solid var(--ds-bg-overlay)',
            zIndex: 21,
          }} />
          {/* Tooltip */}
          <span style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: 5,
            padding: '5px 10px',
            borderRadius: 6,
            background: 'var(--ds-bg-overlay)',
            color: 'var(--ds-text-secondary)',
            fontSize: 10,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            zIndex: 20,
            boxShadow: 'var(--ds-shadow-sm)',
            pointerEvents: 'none',
          }}>
            {cfg.tip}
          </span>
        </>
      )}
    </span>
  );
}

function DiaryEntry({ entry }) {
  const timeStr = formatTime(entry.timestamp);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Time + Category Tag */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--ds-text-quaternary)',
          fontVariantNumeric: 'tabular-nums',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {timeStr}
        {entry.category && <CategoryTag category={entry.category} />}
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
                color: 'var(--ds-text-tertiary)',
                background: 'var(--ds-bg-overlay)',
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
              color: 'var(--ds-text-secondary)',
              borderBottom: '1px solid var(--ds-border)',
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
