import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@shared/plusi-renderer.js';

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
};

/**
 * PlusiContent — body content for Plusi agent, rendered inside AgenticCell.
 * Handles: markdown text, friendship footer, double-tap like.
 */
export default function PlusiContent({
  mood = 'neutral',
  text = '',
  friendship = null,
  isFrozen = false,
  isLoading = false,
}) {
  const color = (typeof window.getPlusiColor === 'function')
    ? window.getPlusiColor(mood)
    : '#0a84ff';

  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  };
  const rgb = hexToRgb(color);

  const displayText = isLoading ? 'hmm, moment mal...' : text;
  const textParts = displayText.split('\n---\n');

  // Double-tap like
  const [liked, setLiked] = React.useState(false);
  const [showHeart, setShowHeart] = React.useState(false);
  const lastTapRef = React.useRef(0);

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      if (!liked && !isFrozen) {
        setLiked(true);
        setShowHeart(true);
        if (window.ankiBridge) {
          window.ankiBridge.addMessage('plusiLike', {});
        }
        setTimeout(() => setShowHeart(false), 800);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <>
      <style>{PLUSI_CONTENT_CSS}</style>

      {showHeart && <div className="plusi-heart-burst">❤️</div>}
      {liked && <div className="plusi-heart-badge">❤️</div>}

      {/* Body text */}
      <div className="plusi-body" onClick={handleDoubleTap} style={{ opacity: isFrozen ? 0.55 : 1 }}>
        {isLoading ? (
          <p className="plusi-placeholder">{displayText}</p>
        ) : (
          textParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="plusi-fade" style={{ background: `radial-gradient(ellipse at center, rgba(${rgb},0.25) 0%, rgba(${rgb},0.08) 40%, transparent 80%)` }} />}
              <div className="plusi-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.trim()}
                </ReactMarkdown>
              </div>
            </React.Fragment>
          ))
        )}
      </div>

      {/* Friendship footer */}
      {friendship && (
        <div className="plusi-footer">
          <div className="plusi-footer-row">
            <div className="plusi-footer-left">
              <span className="plusi-level-name" style={{ color: `rgba(${rgb}, 0.5)` }}>{friendship.levelName}</span>
              {friendship.delta > 0 && (
                <span className="plusi-delta" style={{ color: `rgba(${rgb}, 0.6)` }}>▲ +{friendship.delta}</span>
              )}
              {friendship.delta < 0 && (
                <span className="plusi-delta" style={{ color: `rgba(${rgb}, 0.55)` }}>▼ {friendship.delta}</span>
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
                background: `rgba(${rgb}, 0.5)`,
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** Mood label for AgenticCell headerMeta */
export function PlusiMoodMeta({ mood, color }) {
  const label = MOOD_LABELS[mood] || '';
  return label ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 11, color: `${color}99` }}>{label}</span>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
        background: color,
        boxShadow: `0 0 5px ${color}80`,
      }} />
    </span>
  ) : null;
}

const PLUSI_CONTENT_CSS = `
  .plusi-body {
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-markdown {
    color: var(--ds-text-primary);
  }
  .plusi-markdown p {
    font-size: 14px;
    line-height: 1.65;
    margin: 0 0 0.5em;
  }
  .plusi-markdown p:last-child { margin-bottom: 0; }
  .plusi-markdown strong { color: var(--ds-text-primary); font-weight: 600; }
  .plusi-markdown em { color: var(--ds-text-secondary); }
  .plusi-markdown code {
    background: var(--ds-hover-tint);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .plusi-markdown a { color: var(--ds-accent); opacity: 0.8; text-decoration: none; }

  .plusi-fade {
    height: 1px;
    margin: 8px 0;
  }

  .plusi-placeholder {
    font-size: 12px;
    color: var(--ds-text-placeholder);
    font-style: italic;
    margin: 0;
  }

  /* ── Footer ── */
  .plusi-footer {
    padding: 6px 0 0;
    margin-top: 8px;
    border-top: 1px solid var(--ds-hover-tint);
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
  }

  .plusi-delta {
    font-size: 8px;
  }

  .plusi-points {
    font-size: 8px;
    color: var(--ds-text-muted);
  }

  .plusi-bar-bg {
    height: 2px;
    background: var(--ds-border-subtle);
    border-radius: 1px;
    overflow: hidden;
  }

  .plusi-bar-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.5s ease;
  }

  /* ── Heart Like ── */
  .plusi-heart-burst {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    font-size: 32px;
    animation: plusi-heart-pop 0.6s ease-out forwards;
    pointer-events: none;
    z-index: 10;
  }
  @keyframes plusi-heart-pop {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
    50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
  }
  .plusi-heart-badge {
    position: absolute;
    bottom: 6px;
    right: 8px;
    font-size: 10px;
    opacity: 0.6;
  }
`;
