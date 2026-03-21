import React from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  reflektiert: '#0A84FF',
  forscht:     '#5AC8FA',
  gemerkt:     '#30D158',
};

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

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#8E8E93';
}

/**
 * Render entry text, replacing {{CIPHER}} placeholders with blurred spans.
 * cipher_parts provides the actual text content shown blurred.
 */
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
      const cipherContent = cipherParts[idx] || 'verschlüsselt';
      nodes.push(
        <span
          key={`c-${idx}`}
          style={{
            display: 'inline',
            filter: 'blur(4px)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          title="[verschlüsselt]"
        >
          {cipherContent}
        </span>
      );
    }
  });

  return <>{nodes}</>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiaryEntry({ entry }) {
  const categoryColor = getCategoryColor(entry.category);
  const timeStr = formatTime(entry.timestamp);
  const categoryLabel = (entry.category || 'notiz').toLowerCase();

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 12,
      }}
    >
      {/* Left color border */}
      <div
        style={{
          width: 1.5,
          borderRadius: 2,
          flexShrink: 0,
          alignSelf: 'stretch',
          background: categoryColor,
          opacity: 0.75,
        }}
      />

      {/* Entry body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 5,
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--ds-text-quaternary, rgba(255,255,255,0.25))',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {timeStr}
          </span>

          <span style={{ color: 'var(--ds-text-quaternary, rgba(255,255,255,0.2))', fontSize: 11 }}>·</span>

          <span
            style={{
              fontSize: 11,
              color: 'var(--ds-text-tertiary, rgba(255,255,255,0.35))',
            }}
          >
            {categoryLabel}
          </span>
        </div>

        {/* Entry text */}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.55,
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
                  fontSize: 11,
                  color: 'var(--ds-accent, #0A84FF)',
                  background: 'rgba(10,132,255,0.12)',
                  borderRadius: 6,
                  padding: '2px 7px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span>{disc}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DiaryStream({ entries = [] }) {
  // ── Empty state ────────────────────────────────────────────────────────────
  if (!entries || entries.length === 0) {
    return (
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
            textAlign: 'center',
            padding: '20px 0',
          }}
        >
          Plusi hat noch keine Tagebucheinträge geschrieben.
        </p>
      </div>
    );
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
          style={
            groupIdx === 0
              ? {}
              : {
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
                }
          }
        >
          {/* Day label */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ds-text-tertiary, rgba(255,255,255,0.28))',
              marginBottom: 10,
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
