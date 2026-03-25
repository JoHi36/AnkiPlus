import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import WebCitationBadge from './WebCitationBadge';

/**
 * ResearchContent — renders Research Agent answer with inline citations + source chips.
 * Converts [[WEB:N]] markers to markdown links with webcite: protocol,
 * rendered as clickable WebCitationBadge components via custom link renderer.
 */
export default function ResearchContent({ sources = [], answer = '', error = null }) {
  const color = 'var(--ds-green)';

  // Convert [[WEB:N]] markers to markdown links with webcite: protocol
  const processedAnswer = useMemo(() => {
    if (!answer) return '';
    return answer.replace(/\[\[WEB:(\d+)\]\]/g, (_, indexStr) => {
      const idx = parseInt(indexStr, 10);
      const source = sources[idx - 1];
      if (source) {
        const url = source.url || '';
        return `[${idx}](webcite:${idx}:${encodeURIComponent(url)})`;
      }
      return `[${idx}]`;
    });
  }, [answer, sources]);

  // Allow webcite: protocol through react-markdown's URL sanitization
  const urlTransform = (url) => {
    if (url.startsWith('webcite:')) return url;
    // Default: return as-is (react-markdown v10 default behavior)
    return url;
  };

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

  if (error) {
    return (
      <div className="agent-cell-content">
        <p style={{ color: 'var(--ds-text-secondary)' }}>{error}</p>
      </div>
    );
  }

  return (
    <>
      {processedAnswer && (
        <div className="agent-cell-content">
          <ReactMarkdown
            urlTransform={urlTransform}
            components={{ a: linkRenderer }}
          >
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
                background: 'var(--ds-green-5)',
                border: '1px solid var(--ds-green-10)',
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
