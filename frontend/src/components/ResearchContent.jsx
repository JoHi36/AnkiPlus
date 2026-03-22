import React from 'react';
import ReactMarkdown from 'react-markdown';

export default function ResearchContent({ sources = [], answer = '', error = null }) {
  const rgb = '0, 208, 132';

  if (error) {
    return (
      <div className="agent-cell-content">
        <p style={{ color: 'var(--ds-text-secondary)' }}>{error}</p>
      </div>
    );
  }

  return (
    <>
      {answer && (
        <div className="agent-cell-content">
          <ReactMarkdown>{answer}</ReactMarkdown>
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
