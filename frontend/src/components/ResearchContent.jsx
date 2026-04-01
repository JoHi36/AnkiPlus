import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '@shared/components/CitationRef';

/**
 * ResearchContent — renders Research Agent answer with inline citations + source chips.
 * Uses parseCitations to convert [[WEB:N]] markers to CitationRef components.
 */
export default function ResearchContent({ sources = [], answer = '', error = null }) {
  const citationsArray = useMemo(() => {
    if (!sources) return [];
    return sources.map((src, i) => ({
      type: 'web',
      index: i + 1,
      url: src.url,
      title: src.title,
      domain: src.domain,
    }));
  }, [sources]);

  const segments = useMemo(() => {
    if (!answer) return [];
    return parseCitations(answer, citationsArray);
  }, [answer, citationsArray]);

  if (error) {
    return (
      <div className="agent-cell-content">
        <p style={{ color: 'var(--ds-text-secondary)' }}>{error}</p>
      </div>
    );
  }

  return (
    <>
      {segments.length > 0 && (
        <div className="agent-cell-content">
          {segments.map((seg, i) => {
            if (seg.type === 'citation') {
              return (
                <CitationRef
                  key={i}
                  citation={seg.citation}
                  variant="web"
                />
              );
            }
            return <ReactMarkdown key={i}>{seg.content}</ReactMarkdown>;
          })}
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
