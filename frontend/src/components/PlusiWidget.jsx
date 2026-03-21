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

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

function PlusiIcon({ mood = 'neutral', size = 24 }) {
  const iconRef = React.useRef(null);

  React.useEffect(() => {
    const el = iconRef.current;
    if (!el || typeof window.createPlusi !== 'function') return;
    // Clear any previous render
    while (el.firstChild) el.removeChild(el.firstChild);
    window.createPlusi(el, { mood, size, animated: false });
  }, [mood, size]);

  return <div ref={iconRef} style={{ width: size, height: size, display: 'inline-block', flexShrink: 0 }} />;
}

export default function PlusiWidget({
  mood = 'neutral',
  text = '',
  metaText = '',
  friendship = null,
  isLoading = false,
  isFrozen = false,
  messageId = null,
}) {
  const color = (typeof window.getPlusiColor === 'function')
    ? window.getPlusiColor(mood)
    : '#0a84ff';
  const resolvedMeta = isLoading ? 'denkt nach...' : metaText || MOOD_LABELS[mood] || '';
  const displayText = isLoading ? 'hmm, moment mal...' : text;
  const textParts = displayText.split('\n---\n');
  const rgb = hexToRgb(color);

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
        {showHeart && <div className="plusi-heart-burst">❤️</div>}
        {liked && <div className="plusi-heart-badge">❤️</div>}

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
        <div className="plusi-body" onClick={handleDoubleTap}>
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
    background: radial-gradient(ellipse at center, rgba(var(--plusi-rgb),0.25) 0%, rgba(var(--plusi-rgb),0.08) 40%, transparent 80%);
  }

  .plusi-placeholder {
    font-size: 12px;
    color: var(--ds-text-placeholder);
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 2;
  }

  /* ── Footer ── */
  .plusi-footer {
    padding: 6px 11px 7px;
    background: var(--ds-hover-tint);
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
    color: rgba(var(--plusi-rgb), 0.5);
  }

  .plusi-delta {
    font-size: 8px;
  }
  .plusi-delta-up { color: rgba(var(--plusi-rgb), 0.6); }
  .plusi-delta-down { color: rgba(var(--plusi-rgb), 0.55); }

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
