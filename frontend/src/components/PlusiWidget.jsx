import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
          <div className="plusi-w-avatar">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={48}
              isThinking={isLoading}
              active={false}
            />
          </div>

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

        {/* Content area — same markdown rendering as chat messages */}
        <div className="plusi-w-content">
          {isLoading ? (
            <div className="plusi-w-skeleton">
              <div className="plusi-w-shimmer" />
              <p className="plusi-w-placeholder">{displayText}</p>
            </div>
          ) : (
            <div className="plusi-w-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayText}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const PLUSI_CSS = `
  /* ── Google Font: Space Grotesk — Plusi's unique font ── */
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

  /* ── Plusi Widget — markdown blockquote style ── */
  .plusi-widget {
    border-left: 3px solid #007AFF;
    background: rgba(0,122,255,.04);
    margin: 10px 0 14px;
    overflow: hidden;
    transition: opacity 0.3s ease;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
  }

  /* Header row */
  .plusi-w-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px 10px;
    border-bottom: 1px solid rgba(0,122,255,.08);
  }

  .plusi-w-avatar {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    overflow: hidden;
    position: relative;
  }

  .plusi-w-avatar .mascot-shadow {
    display: none !important;
  }

  .plusi-w-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .plusi-w-name {
    font-size: 14px;
    font-weight: 600;
    color: rgba(0,140,255,.8);
    letter-spacing: 0.01em;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
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
    font-size: 11px;
    color: rgba(120,175,255,.4);
  }

  /* Content area — matches chat message text styling */
  .plusi-w-content {
    padding: 12px 16px 14px;
  }

  /* Markdown rendering — same sizes as chat */
  .plusi-w-markdown {
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    color: rgba(210,225,250,.88);
  }

  .plusi-w-markdown p {
    font-size: inherit;
    line-height: 1.75;
    margin: 0 0 0.75em;
  }

  .plusi-w-markdown p:last-child {
    margin-bottom: 0;
  }

  .plusi-w-markdown strong {
    color: rgba(225,238,255,.95);
    font-weight: 600;
  }

  .plusi-w-markdown em {
    color: rgba(180,210,255,.7);
  }

  .plusi-w-markdown ul, .plusi-w-markdown ol {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .plusi-w-markdown li {
    margin-bottom: 0.3em;
    line-height: 1.65;
  }

  .plusi-w-markdown code {
    background: rgba(0,0,0,.25);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .plusi-w-markdown a {
    color: rgba(0,150,255,.8);
    text-decoration: none;
  }

  .plusi-w-markdown blockquote {
    border-left: 2px solid rgba(0,122,255,.2);
    padding-left: 12px;
    margin: 0.5em 0;
    color: rgba(180,210,255,.6);
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
    font-size: 13px;
    color: rgba(100,160,255,.35);
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 1;
  }
`;
