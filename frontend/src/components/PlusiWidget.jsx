import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MascotCharacter from './MascotCharacter';

const MOOD_DOT_COLORS = {
  happy: '#34d399',
  empathy: '#818cf8',
  excited: '#a78bfa',
  neutral: '#0a84ff',
  sleepy: '#6b7280',
  surprised: '#f59e0b',
  blush: '#f87171',
  thinking: '#0a84ff',
};

const MOOD_META = {
  happy: 'freut sich',
  empathy: 'fühlt mit',
  excited: 'aufgeregt',
  neutral: '',
  sleepy: 'müde',
  surprised: 'überrascht',
  blush: 'verlegen',
  thinking: 'grübelt...',
};

export default function PlusiWidget({ mood = 'neutral', text = '', metaText = '', isLoading = false, isFrozen = false }) {
  const dotColor = MOOD_DOT_COLORS[mood] || MOOD_DOT_COLORS.neutral;
  const resolvedMeta = isLoading ? 'denkt nach...'
    : metaText || MOOD_META[mood] || '';
  const displayText = isLoading ? 'hmm, moment mal...' : text;

  // Split text by fade divider marker if multi-action
  const textParts = displayText.split('\n---\n');

  return (
    <>
      <style>{PLUSI_CSS}</style>
      <div
        className="plusi-w"
        style={isFrozen ? { opacity: 0.55 } : undefined}
      >
        {isLoading && <div className="plusi-w-shimmer" />}

        {/* Header */}
        <div className="plusi-w-header">
          <div className="plusi-w-char">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={48}
              isThinking={isLoading}
              active={false}
            />
          </div>
          <span className="plusi-w-name">Plusi</span>
          <div className="plusi-w-spacer" />
          {resolvedMeta && (
            <div className="plusi-w-mood">
              <span className="plusi-w-mood-text">{resolvedMeta}</span>
              <span
                className="plusi-w-mood-dot"
                style={{ background: dotColor, boxShadow: `0 0 3px ${dotColor}4D` }}
              />
            </div>
          )}
          {!resolvedMeta && (
            <span
              className="plusi-w-mood-dot"
              style={{ background: dotColor, opacity: 0.4 }}
            />
          )}
        </div>

        {/* Content */}
        <div className="plusi-w-content">
          {isLoading ? (
            <p className="plusi-w-placeholder">{displayText}</p>
          ) : (
            textParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="plusi-w-fade" />}
                <div className="plusi-w-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.trim()}
                  </ReactMarkdown>
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const PLUSI_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .plusi-w {
    margin: 10px 0 6px;
    background: rgba(10,132,255,.04);
    overflow: hidden;
    transition: opacity 0.3s ease;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    position: relative;
  }

  .plusi-w-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 5px;
    background: rgba(10,132,255,.06);
  }

  .plusi-w-char {
    flex-shrink: 0;
    width: 48px;
    height: 52px;
    position: relative;
    overflow: visible;
  }
  .plusi-w-char .mascot-shadow { display: none !important; }

  .plusi-w-name {
    font-size: 12px;
    font-weight: 600;
    color: rgba(10,132,255,.55);
    letter-spacing: 0.02em;
  }

  .plusi-w-spacer { flex: 1; }

  .plusi-w-mood {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .plusi-w-mood-text {
    font-size: 10px;
    color: rgba(154,154,154,.45);
  }

  .plusi-w-mood-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .plusi-w-content {
    padding: 7px 12px 9px;
  }

  .plusi-w-markdown {
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    color: rgba(232,232,232,.72);
  }
  .plusi-w-markdown p {
    font-size: 13px;
    line-height: 1.6;
    margin: 0 0 0.5em;
  }
  .plusi-w-markdown p:last-child { margin-bottom: 0; }
  .plusi-w-markdown strong { color: rgba(232,232,232,.9); font-weight: 600; }
  .plusi-w-markdown em { color: rgba(180,210,255,.7); }
  .plusi-w-markdown code {
    background: rgba(0,0,0,.25);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .plusi-w-markdown a { color: rgba(10,132,255,.8); text-decoration: none; }

  .plusi-w-fade {
    height: 1px;
    margin: 8px 0;
    background: radial-gradient(
      ellipse at center,
      rgba(10,132,255,.25) 0%,
      rgba(10,132,255,.08) 40%,
      transparent 80%
    );
  }

  .plusi-w-shimmer {
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(10,132,255,.03) 40%,
      rgba(10,132,255,.06) 50%,
      rgba(10,132,255,.03) 60%,
      transparent 100%);
    animation: plusi-shimmer 2.5s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes plusi-shimmer { 0% { left: -100%; } 100% { left: 100%; } }

  .plusi-w-placeholder {
    font-size: 12px;
    color: rgba(154,154,154,.35);
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 2;
  }
`;
