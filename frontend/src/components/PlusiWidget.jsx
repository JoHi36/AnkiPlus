import React from 'react';
import MascotCharacter from './MascotCharacter';

const MOOD_DOT_COLORS = {
  happy: '#34d399',
  empathy: '#818cf8',
  excited: '#a78bfa',
  neutral: '#007AFF',
  sleepy: '#6b7280',
  surprised: '#f59e0b',
  blush: '#f87171',
  thinking: '#007AFF',
};

export default function PlusiWidget({ mood = 'neutral', text = '', metaText = '', isLoading = false, isFrozen = false }) {
  const dotColor = MOOD_DOT_COLORS[mood] || MOOD_DOT_COLORS.neutral;
  const displayMeta = isLoading ? 'denkt nach...' : metaText;
  const displayText = isLoading ? 'hmm, moment mal...' : text;

  return (
    <>
      <style>{PLUSI_CSS}</style>
      <div
        className="plusi-widget"
        style={isFrozen ? { opacity: 0.65 } : undefined}
      >
        {/* Header row */}
        <div className="plusi-w-header">
          {/* Plusi character — clipped container to prevent shadow/animation overflow */}
          <div className="plusi-w-avatar">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={48}
              isThinking={isLoading}
              active={false}
            />
          </div>

          {/* Name + mood info */}
          <div className="plusi-w-info">
            <div className="plusi-w-name">Plusi</div>
            {displayMeta && (
              <div className="plusi-w-meta">
                <span
                  className="plusi-w-dot"
                  style={{ background: dotColor, boxShadow: `0 0 4px ${dotColor}66` }}
                />
                <span className="plusi-w-meta-text">{displayMeta}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="plusi-w-content">
          {isLoading ? (
            <div className="plusi-w-skeleton">
              <div className="plusi-w-shimmer" />
              <p className="plusi-w-placeholder">{displayText}</p>
            </div>
          ) : (
            displayText.split('\n').filter(l => l.trim()).map((line, i) => (
              <p key={i} className="plusi-w-text">{line}</p>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const PLUSI_CSS = `
  /* ── Plusi Widget — markdown blockquote style ── */
  .plusi-widget {
    border-left: 3px solid #007AFF;
    background: rgba(0,122,255,.04);
    margin: 10px 0 14px;
    overflow: hidden;
    transition: opacity 0.3s ease;
  }

  /* Header row */
  .plusi-w-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px 10px;
    border-bottom: 1px solid rgba(0,122,255,.08);
  }

  /* Avatar container — clips the MascotCharacter shadow and float animation */
  .plusi-w-avatar {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    overflow: hidden;
    position: relative;
  }

  /* Hide the mascot shadow inside PlusiWidget */
  .plusi-w-avatar .mascot-shadow {
    display: none !important;
  }

  /* Name + meta */
  .plusi-w-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .plusi-w-name {
    font-size: 13px;
    font-weight: 700;
    color: rgba(0,140,255,.8);
    letter-spacing: 0.02em;
  }

  .plusi-w-meta {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .plusi-w-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .plusi-w-meta-text {
    font-size: 10.5px;
    color: rgba(120,175,255,.4);
  }

  /* Content area */
  .plusi-w-content {
    padding: 12px 16px 14px;
    font-size: 13px;
    line-height: 1.65;
    color: rgba(210,225,250,.85);
  }

  .plusi-w-text {
    margin: 0 0 8px;
  }

  .plusi-w-text:last-child {
    margin-bottom: 0;
  }

  /* Skeleton loading */
  .plusi-w-skeleton {
    position: relative;
    overflow: hidden;
    min-height: 24px;
  }

  .plusi-w-shimmer {
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(0,122,255,.05) 40%,
      rgba(0,122,255,.1) 50%,
      rgba(0,122,255,.05) 60%,
      transparent 100%);
    animation: plusi-shimmer 2.5s ease-in-out infinite;
  }

  @keyframes plusi-shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  .plusi-w-placeholder {
    font-size: 12px;
    color: rgba(100,160,255,.35);
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 1;
  }
`;
