import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MascotCharacter from './MascotCharacter';

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
};

const MOOD_META = {
  happy:     'freut sich',
  empathy:   'fühlt mit',
  excited:   'aufgeregt',
  neutral:   '',
  sleepy:    'müde',
  surprised: 'überrascht',
  blush:     'verlegen',
  thinking:  'grübelt...',
  annoyed:   'genervt',
  curious:   'neugierig',
};

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

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

  const cardStyle = {
    background: `rgba(${rgb}, 0.04)`,
    border: `1px solid rgba(${rgb}, 0.15)`,
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: `0 0 16px rgba(${rgb}, 0.07)`,
    margin: '10px 0 6px',
    transition: 'all 0.3s ease',
    opacity: isFrozen ? 0.55 : 1,
    position: 'relative',
  };

  return (
    <>
      <style>{PLUSI_CSS}</style>
      <div style={cardStyle}>
        {isLoading && <div className="plusi-shimmer" style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(${rgb},0.03) 40%, rgba(${rgb},0.06) 50%, rgba(${rgb},0.03) 60%, transparent 100%)`
        }} />}

        {/* Header: Mascot + Name + Mood */}
        <div className="plusi-header">
          <div className="plusi-mascot">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={24}
              isThinking={isLoading}
              active={false}
            />
          </div>
          <span className="plusi-name" style={{ color: `rgba(${rgb}, 0.7)` }}>
            Plusi
          </span>
          <div style={{ flex: 1 }} />
          {resolvedMeta && (
            <span className="plusi-mood-text" style={{ color: `rgba(${rgb}, 0.4)` }}>
              {resolvedMeta}
            </span>
          )}
          <span
            className="plusi-mood-dot"
            style={{
              background: color,
              boxShadow: `0 0 5px rgba(${rgb}, 0.5)`,
              opacity: resolvedMeta ? 1 : 0.5,
            }}
          />
        </div>

        {/* Body: Text */}
        <div className="plusi-body">
          {isLoading ? (
            <p className="plusi-placeholder">{displayText}</p>
          ) : (
            textParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="plusi-fade" style={{
                  background: `radial-gradient(ellipse at center, rgba(${rgb},0.25) 0%, rgba(${rgb},0.08) 40%, transparent 80%)`
                }} />}
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
                <span className="plusi-level-name" style={{ color: `rgba(${rgb}, 0.5)` }}>
                  {friendship.levelName}
                </span>
                {friendship.delta > 0 && (
                  <span className="plusi-delta" style={{ color: `rgba(${rgb}, 0.6)` }}>
                    ▲ +{friendship.delta}
                  </span>
                )}
                {friendship.delta < 0 && (
                  <span className="plusi-delta" style={{ color: `rgba(${rgb}, 0.55)` }}>
                    ▼ {friendship.delta}
                  </span>
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
                  background: friendship.level >= 4
                    ? `linear-gradient(90deg, rgba(${rgb},0.5), rgba(${rgb},0.7))`
                    : `rgba(${rgb}, 0.5)`,
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
  @import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');

  .plusi-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 11px 7px;
  }

  .plusi-mascot {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    position: relative;
    overflow: visible;
  }
  .plusi-mascot .mascot-shadow { display: none !important; }

  .plusi-name {
    font-size: 11px;
    font-weight: 600;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-mood-text {
    font-size: 9px;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-mood-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .plusi-body {
    padding: 2px 11px 9px;
  }

  .plusi-markdown {
    font-family: 'Varela Round', -apple-system, sans-serif;
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
  }

  .plusi-placeholder {
    font-size: 12px;
    color: rgba(154,154,154,0.35);
    font-style: italic;
    margin: 0;
    font-family: 'Varela Round', -apple-system, sans-serif;
    position: relative;
    z-index: 2;
  }

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
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-delta {
    font-size: 8px;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-points {
    font-size: 8px;
    color: rgba(255,255,255,0.15);
    font-family: 'Varela Round', -apple-system, sans-serif;
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
    transition: width 0.5s ease;
  }

  .plusi-shimmer {
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    animation: plusi-shimmer 2.5s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes plusi-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
`;
