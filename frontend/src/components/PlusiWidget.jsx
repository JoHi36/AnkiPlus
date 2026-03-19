import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MOOD_COLORS = {
  happy:     '#34d399',
  empathy:   '#818cf8',
  excited:   '#a78bfa',
  neutral:   '#0a84ff',
  sleepy:    '#6b7280',
  surprised: '#f59e0b',
  blush:     '#f87171',
  thinking:  '#0a84ff',
  annoyed:   '#f87171',
  curious:   '#f59e0b',
  reading:   '#0a84ff',
};

const MOOD_META = {
  happy:     'freut sich',
  empathy:   'fühlt mit',
  excited:   'aufgeregt',
  neutral:   'chillt',
  sleepy:    'müde',
  surprised: 'überrascht',
  blush:     'verlegen',
  thinking:  'grübelt...',
  annoyed:   'genervt',
  curious:   'neugierig',
  reading:   'stöbert...',
};

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

// Static SVG mascot — mood expressions without animation
const MOOD_FACES = {
  neutral: {
    eyes: <><ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/></>,
    mouth: <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round"/>,
  },
  happy: {
    eyes: <><ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><rect x="41" y="41" width="14" height="4" fill="#0a84ff"/><ellipse cx="49" cy="51" rx="4" ry="3.5" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><rect x="65" y="41" width="14" height="4" fill="#0a84ff"/><ellipse cx="71" cy="51" rx="4" ry="3.5" fill="#1a1a1a"/></>,
    mouth: <path d="M 46 66 Q 60 78 74 66" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round"/>,
  },
  annoyed: {
    eyes: <><ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><rect x="41" y="41" width="14" height="7" fill="#0a84ff"/><ellipse cx="49" cy="52" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><rect x="65" y="41" width="14" height="7" fill="#0a84ff"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/></>,
    mouth: <line x1="50" y1="70" x2="70" y2="70" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/>,
  },
  curious: {
    eyes: <><ellipse cx="48" cy="48" rx="7" ry="9" fill="white"/><ellipse cx="49" cy="49" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="72" cy="50" rx="7" ry="7" fill="white"/><rect x="65" y="43" width="14" height="5" fill="#0a84ff"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/></>,
    mouth: <path d="M 50 68 Q 56 68 60 66 Q 64 64 68 66" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>,
  },
  excited: {
    eyes: <><ellipse cx="48" cy="47" rx="8" ry="10" fill="white"/><ellipse cx="49" cy="48" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="72" cy="47" rx="8" ry="10" fill="white"/><ellipse cx="71" cy="48" rx="5" ry="5" fill="#1a1a1a"/></>,
    mouth: <ellipse cx="60" cy="70" rx="7" ry="6" fill="#1a1a1a"/>,
  },
  sleepy: {
    eyes: <><ellipse cx="48" cy="52" rx="7" ry="3" fill="white"/><ellipse cx="72" cy="52" rx="7" ry="3" fill="white"/></>,
    mouth: <line x1="54" y1="70" x2="66" y2="71" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round"/>,
  },
  surprised: {
    eyes: <><ellipse cx="48" cy="46" rx="8" ry="10" fill="white"/><ellipse cx="49" cy="47" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="72" cy="46" rx="8" ry="10" fill="white"/><ellipse cx="71" cy="47" rx="5" ry="5" fill="#1a1a1a"/></>,
    mouth: <ellipse cx="60" cy="70" rx="5" ry="4" fill="#1a1a1a"/>,
  },
  blush: {
    eyes: <><ellipse cx="48" cy="49" rx="7" ry="7" fill="white"/><rect x="41" y="42" width="14" height="4" fill="#0a84ff"/><ellipse cx="49" cy="51" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="7" fill="white"/><rect x="65" y="42" width="14" height="4" fill="#0a84ff"/><ellipse cx="71" cy="51" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="38" cy="60" rx="6" ry="3" fill="rgba(248,113,113,0.3)"/><ellipse cx="82" cy="60" rx="6" ry="3" fill="rgba(248,113,113,0.3)"/></>,
    mouth: <path d="M 52 68 Q 54 66 57 68 Q 60 70 63 68 Q 66 66 68 68" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round"/>,
  },
  empathy: {
    eyes: <><ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><rect x="41" y="41" width="14" height="3" fill="#0a84ff"/><ellipse cx="49" cy="52" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><rect x="65" y="41" width="14" height="3" fill="#0a84ff"/><ellipse cx="71" cy="52" rx="4" ry="4" fill="#1a1a1a"/></>,
    mouth: <path d="M 50 70 Q 60 66 70 70" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>,
  },
  thinking: {
    eyes: <><ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="51" cy="47" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="75" cy="47" rx="4" ry="4" fill="#1a1a1a"/></>,
    mouth: <path d="M 50 69 Q 60 72 70 69" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round"/>,
  },
  reading: {
    eyes: <><ellipse cx="48" cy="51" rx="7" ry="6" fill="white"/><rect x="41" y="43" width="14" height="5" fill="#0a84ff"/><ellipse cx="49" cy="53" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="72" cy="51" rx="7" ry="6" fill="white"/><rect x="65" y="43" width="14" height="5" fill="#0a84ff"/><ellipse cx="71" cy="53" rx="4" ry="3" fill="#1a1a1a"/></>,
    mouth: <path d="M 52 68 Q 60 71 68 68" stroke="#1a1a1a" strokeWidth="2" fill="none" strokeLinecap="round"/>,
  },
};

function PlusiIcon({ mood = 'neutral', size = 24 }) {
  const face = MOOD_FACES[mood] || MOOD_FACES.neutral;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill="#0a84ff"/>
      <rect x="5" y="35" width="110" height="40" rx="8" fill="#0a84ff"/>
      <rect x="40" y="35" width="40" height="40" fill="#0a84ff"/>
      {face.eyes}
      {face.mouth}
    </svg>
  );
}

export default function PlusiWidget({
  mood = 'neutral',
  text = '',
  metaText = '',
  friendship = null,
  isLoading = false,
  isFrozen = false,
}) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  const resolvedMeta = isLoading ? 'denkt nach...' : metaText || MOOD_META[mood] || '';
  const displayText = isLoading ? 'hmm, moment mal...' : text;
  const textParts = displayText.split('\n---\n');
  const rgb = hexToRgb(color);

  return (
    <>
      <style>{PLUSI_CSS}</style>
      <div
        className="plusi-card"
        style={{
          '--plusi-rgb': rgb,
          '--plusi-color': color,
          opacity: isFrozen ? 0.55 : 1,
        }}
      >
        {isLoading && <div className="plusi-shimmer" />}

        {/* Top row: Mascot + Name + Mood */}
        <div className="plusi-top">
          <PlusiIcon mood={isLoading ? 'thinking' : mood} size={24} />
          <span className="plusi-name">Plusi</span>
          <div style={{ flex: 1 }} />
          {resolvedMeta && (
            <span className="plusi-mood-text">{resolvedMeta}</span>
          )}
          <span
            className="plusi-mood-dot"
            style={{ opacity: resolvedMeta ? 1 : 0.5 }}
          />
        </div>

        {/* Body: Text */}
        <div className="plusi-body">
          {isLoading ? (
            <p className="plusi-placeholder">{displayText}</p>
          ) : (
            textParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="plusi-fade" />}
                <div className="plusi-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.trim()}
                  </ReactMarkdown>
                </div>
              </React.Fragment>
            ))
          )}
        </div>

        {/* Footer: Friendship Bar */}
        {friendship && (
          <div className="plusi-footer">
            <div className="plusi-footer-row">
              <div className="plusi-footer-left">
                <span className="plusi-level-name">{friendship.levelName}</span>
                {friendship.delta > 0 && (
                  <span className="plusi-delta plusi-delta-up">▲ +{friendship.delta}</span>
                )}
                {friendship.delta < 0 && (
                  <span className="plusi-delta plusi-delta-down">▼ {friendship.delta}</span>
                )}
              </div>
              <span className="plusi-points">
                {friendship.level >= 4 ? '★ Max' : `${friendship.points} / ${friendship.maxPoints}`}
              </span>
            </div>
            <div className="plusi-bar-bg">
              <div
                className="plusi-bar-fill"
                style={{
                  width: friendship.level >= 4
                    ? '100%'
                    : `${Math.min(100, (friendship.points / friendship.maxPoints) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const PLUSI_CSS = `
  .plusi-card {
    margin: 10px 0 6px;
    background: rgba(var(--plusi-rgb), 0.04);
    border: 1px solid rgba(var(--plusi-rgb), 0.15);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 0 16px rgba(var(--plusi-rgb), 0.07);
    transition: all 0.3s ease;
    position: relative;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  /* ── Top row (renamed from header to avoid index.css override) ── */
  .plusi-top {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 11px 7px;
  }

  .plusi-name {
    font-size: 11px;
    font-weight: 600;
    color: rgba(var(--plusi-rgb), 0.7);
  }

  .plusi-mood-text {
    font-size: 9px;
    color: rgba(var(--plusi-rgb), 0.4);
  }

  .plusi-mood-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--plusi-color);
    box-shadow: 0 0 5px rgba(var(--plusi-rgb), 0.5);
  }

  /* ── Body ── */
  .plusi-body {
    padding: 2px 11px 10px;
  }

  .plusi-markdown {
    color: rgba(232,232,232,0.72);
  }
  .plusi-markdown p {
    font-size: 14px;
    line-height: 1.65;
    margin: 0 0 0.5em;
  }
  .plusi-markdown p:last-child { margin-bottom: 0; }
  .plusi-markdown strong { color: rgba(232,232,232,0.9); font-weight: 600; }
  .plusi-markdown em { color: rgba(180,210,255,0.7); }
  .plusi-markdown code {
    background: rgba(0,0,0,0.25);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .plusi-markdown a { color: rgba(10,132,255,0.8); text-decoration: none; }

  .plusi-fade {
    height: 1px;
    margin: 8px 0;
    background: radial-gradient(ellipse at center, rgba(var(--plusi-rgb),0.25) 0%, rgba(var(--plusi-rgb),0.08) 40%, transparent 80%);
  }

  .plusi-placeholder {
    font-size: 12px;
    color: rgba(154,154,154,0.35);
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 2;
  }

  /* ── Footer ── */
  .plusi-footer {
    padding: 6px 11px 7px;
    background: rgba(0,0,0,0.15);
    border-top: 1px solid rgba(255,255,255,0.04);
  }

  .plusi-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .plusi-footer-left {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .plusi-level-name {
    font-size: 9px;
    color: rgba(var(--plusi-rgb), 0.5);
  }

  .plusi-delta {
    font-size: 8px;
  }
  .plusi-delta-up { color: rgba(var(--plusi-rgb), 0.6); }
  .plusi-delta-down { color: rgba(var(--plusi-rgb), 0.55); }

  .plusi-points {
    font-size: 8px;
    color: rgba(255,255,255,0.15);
  }

  .plusi-bar-bg {
    height: 2px;
    background: rgba(255,255,255,0.06);
    border-radius: 1px;
    overflow: hidden;
  }

  .plusi-bar-fill {
    height: 100%;
    border-radius: 1px;
    background: rgba(var(--plusi-rgb), 0.5);
    transition: width 0.5s ease;
  }

  /* ── Shimmer ── */
  .plusi-shimmer {
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(var(--plusi-rgb),0.03) 40%, rgba(var(--plusi-rgb),0.06) 50%, rgba(var(--plusi-rgb),0.03) 60%, transparent 100%);
    animation: plusi-shimmer 2.5s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes plusi-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
`;
