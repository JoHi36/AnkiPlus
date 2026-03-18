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
        {/* Header */}
        <div className="plusi-widget-header">
          <div className="plusi-widget-avatar">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={48}
              isThinking={isLoading}
              {...(isFrozen ? {} : {})}
            />
          </div>
          <div className="plusi-widget-meta">
            <span className="plusi-widget-name">Plusi</span>
            {displayMeta && (
              <>
                <span
                  className="plusi-widget-dot"
                  style={{ background: dotColor }}
                />
                <span className="plusi-widget-meta-text">{displayMeta}</span>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="plusi-widget-content">
          {isLoading ? (
            <div className="plusi-widget-skeleton">
              <div className="plusi-widget-shimmer" />
              <p className="plusi-widget-placeholder">{displayText}</p>
            </div>
          ) : (
            displayText.split('\n').map((line, i) => (
              <p key={i} className="plusi-widget-text">{line}</p>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const PLUSI_CSS = `
  .plusi-widget {
    border-left: 3px solid #007AFF;
    background: rgba(0,122,255,.04);
    padding: 12px 14px;
    margin: 8px 0;
    transition: opacity 0.3s ease;
  }

  .plusi-widget-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .plusi-widget-avatar {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .plusi-widget-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .plusi-widget-name {
    font-weight: 600;
    font-size: 13px;
    color: #e2e8f0;
    letter-spacing: -0.01em;
  }

  .plusi-widget-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .plusi-widget-meta-text {
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
  }

  .plusi-widget-content {
    padding-left: 58px;
    position: relative;
  }

  .plusi-widget-text {
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.5;
    margin: 0 0 4px 0;
  }

  .plusi-widget-text:last-child {
    margin-bottom: 0;
  }

  .plusi-widget-skeleton {
    position: relative;
    overflow: hidden;
    min-height: 24px;
    border-radius: 4px;
  }

  .plusi-widget-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0,122,255,.08) 40%,
      rgba(0,122,255,.14) 50%,
      rgba(0,122,255,.08) 60%,
      transparent 100%
    );
    animation: plusi-shimmer 1.8s ease-in-out infinite;
  }

  @keyframes plusi-shimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  .plusi-widget-placeholder {
    font-size: 13px;
    color: #64748b;
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 1;
  }
`;
