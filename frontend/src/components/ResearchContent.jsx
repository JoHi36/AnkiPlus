import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import WebCitationBadge from './WebCitationBadge';

/**
 * ResearchContent — renders Research Agent answer with inline citations + source chips.
 * Converts [[WEB:N]] markers to clickable WebCitationBadge components.
 */
export default function ResearchContent({ sources = [], answer = '', error = null }) {
  const rgb = '0, 208, 132';
  const color = '#00D084';

  // Convert [[WEB:N]] markers to markdown links that the renderer can catch
  const processedAnswer = useMemo(() => {
    if (!answer) return '';
    let result = answer.replace(/\[\[WEB:(\d+)\]\]/g, (match, indexStr) => {
      const idx = parseInt(indexStr, 10);
      const source = sources[idx - 1];
      if (source) {
        const url = source.url || '';
        return `[${idx}](webcite:${idx}:${encodeURIComponent(url)})`;
      }
      return `\\[${idx}\\]`; // Fallback: escaped brackets so Markdown doesn't eat them
    });
    return result;
  }, [answer, sources]);

  if (error) {
    return (
      <div className="agent-cell-content">
        <p style={{ color: 'var(--ds-text-secondary)' }}>{error}</p>
      </div>
    );
  }

  // Custom link renderer that catches webcite: links
  const linkRenderer = ({ href, children, ...props }) => {
    if (href && href.startsWith('webcite:')) {
      const parts = href.split(':');
      const webIndex = parseInt(parts[1], 10);
      const webUrl = decodeURIComponent(parts.slice(2).join(':'));
      return <WebCitationBadge index={webIndex} url={webUrl} color={color} />;
    }
    return <a href={href} {...props}>{children}</a>;
  };

  return (
    <>
      {processedAnswer && (
        <div className="agent-cell-content">
          <ReactMarkdown components={{ a: linkRenderer }}>
            {processedAnswer}
          </ReactMarkdown>
        </div>
      )}
      {sources.length > 0 && (
        <div className="agent-cell-footer research-source-strip">
          {sources.map((s, i) => (
            <div
              key={i}
              className="research-source-chip"
              style={{
                background: `rgba(${rgb}, 0.06)`,
                border: `1px solid rgba(${rgb}, 0.10)`,
              }}
              onClick={() => {
                if (window.ankiBridge) {
                  window.ankiBridge.addMessage('openUrl', { url: s.url });
                } else {
                  window.open(s.url, '_blank');
                }
              }}
            >
              <div className="research-source-fav">{s.favicon_letter}</div>
              <div>
                <div className="research-source-title">{s.title}</div>
                <div className="research-source-domain">{s.domain}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
