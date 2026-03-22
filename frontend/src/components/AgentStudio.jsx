import React, { useState, useEffect, useCallback } from 'react';

function ResearchIcon({ size = 28 }) {
  const c = '#00D084';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="12" x2="12" y2="2"/>
      <path d="M12 12 L16.24 7.76" strokeWidth="2.5"/>
      <circle cx="12" cy="12" r="6" opacity="0.4"/>
      <circle cx="12" cy="12" r="2" fill={c} stroke="none"/>
    </svg>
  );
}

function PlusiIcon({ size = 28 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill="#0a84ff"/>
      <rect x="5" y="35" width="110" height="40" rx="8" fill="#0a84ff"/>
      <rect x="40" y="35" width="40" height="40" fill="#0a84ff"/>
      <ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        cursor: 'pointer', border: 'none', transition: 'background 0.2s',
        background: on ? 'var(--ds-accent, #0a84ff)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

const TOOLS = [
  { key: 'card_search', emoji: '🔍', label: 'Kartensuche', desc: 'Karten aus dem Deck suchen' },
  { key: 'images', emoji: '🖼️', label: 'Bilder', desc: 'Bilder aus Karten und Internet' },
  { key: 'diagrams', emoji: '📊', label: 'Diagramme', desc: 'Mermaid-Diagramme' },
  { key: 'statistics', emoji: '📈', label: 'Statistiken', desc: 'Streak, Heatmap, Deck-Überblick' },
  { key: 'molecules', emoji: '🧬', label: 'Moleküle', desc: 'Molekülstrukturen darstellen', badge: 'Beta' },
];

function SectionHeader({ title, tooltip }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.8px', color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
        marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
      }}
      onMouseEnter={() => tooltip && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      {title}
      {tooltip && (
        <span style={{
          width: 13, height: 13, borderRadius: '50%',
          border: '1px solid var(--ds-text-tertiary, rgba(255,255,255,0.22))',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 700,
          color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
          cursor: 'help',
        }}>?</span>
      )}
      {showTip && tooltip && (
        <>
          <span style={{
            position: 'absolute', left: 12, top: '100%',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderBottom: '5px solid var(--ds-bg-overlay, #3A3A3C)',
            zIndex: 21,
          }} />
          <span style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 5,
            padding: '6px 10px', borderRadius: 6, maxWidth: 260,
            background: 'var(--ds-bg-overlay, #3A3A3C)',
            color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))',
            fontSize: 11, lineHeight: 1.5, whiteSpace: 'normal',
            zIndex: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}>
            {tooltip}
          </span>
        </>
      )}
    </div>
  );
}

export default function AgentStudio({ bridge, onNavigateToPlusi }) {
  const [tools, setTools] = useState({});
  const [mascotEnabled, setMascotEnabled] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [embedding, setEmbedding] = useState({ embeddedCards: 0, totalCards: 0, isRunning: false });

  // Load config and tools via async message queue
  useEffect(() => {
    if (!bridge) return;

    const onConfigLoaded = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) {
        setTools(data.ai_tools || data.aiTools || {});
        setMascotEnabled(data.mascot_enabled || data.mascotEnabled || false);
        setResearchEnabled(data.research_enabled ?? data.researchEnabled ?? true);
      }
    };
    const onToolsLoaded = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) setTools(data);
    };

    window.addEventListener('ankiConfigLoaded', onConfigLoaded);
    window.addEventListener('ankiAiToolsLoaded', onToolsLoaded);

    // Request config (includes ai_tools now)
    bridge.getCurrentConfig?.();
    bridge.getAITools?.();

    return () => {
      window.removeEventListener('ankiConfigLoaded', onConfigLoaded);
      window.removeEventListener('ankiAiToolsLoaded', onToolsLoaded);
    };
  }, [bridge]);

  // Poll embedding status via async message queue
  useEffect(() => {
    if (!bridge) return;

    const onEmbeddingStatus = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) setEmbedding(data);
    };

    window.addEventListener('ankiEmbeddingStatusLoaded', onEmbeddingStatus);

    // Request immediately and poll every 3s
    window.ankiBridge?.addMessage('getEmbeddingStatus', null);
    const timer = setInterval(() => {
      window.ankiBridge?.addMessage('getEmbeddingStatus', null);
    }, 3000);

    return () => {
      window.removeEventListener('ankiEmbeddingStatusLoaded', onEmbeddingStatus);
      clearInterval(timer);
    };
  }, [bridge]);

  const handleToggleTool = useCallback((key) => {
    setTools(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      if (bridge?.saveAITools) {
        bridge.saveAITools(JSON.stringify(updated));
      }
      return updated;
    });
  }, [bridge]);

  const handleToggleMascot = useCallback(() => {
    setMascotEnabled(prev => {
      const next = !prev;
      if (bridge?.saveMascotEnabled) {
        bridge.saveMascotEnabled(next);
      }
      return next;
    });
  }, [bridge]);

  const handleToggleResearch = useCallback(() => {
    setResearchEnabled(prev => {
      const next = !prev;
      window.ankiBridge?.addMessage('saveSubagentEnabled', { name: 'research', enabled: next });
      return next;
    });
  }, []);

  const embedPct = embedding.totalCards > 0
    ? Math.round((embedding.embeddedCards / embedding.totalCards) * 100)
    : 0;
  const embedDone = embedPct >= 100 && !embedding.isRunning;

  const S = styles;

  return (
    <div style={S.container}>
      <div style={S.header}>Agent Studio</div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Semantische Suche</div>
        <div style={{ ...S.card, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary, rgba(255,255,255,0.22))" strokeWidth={1.8}>
                <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>
                Karten-Embeddings
              </span>
              {(embedding.isRunning || embedDone) && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                  background: embedDone ? 'rgba(34,197,94,0.12)' : 'rgba(10,132,255,0.12)',
                  color: embedDone ? 'rgba(34,197,94,0.8)' : 'rgba(10,132,255,0.7)',
                }}>
                  {embedDone ? 'Fertig' : 'Läuft...'}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))', fontVariantNumeric: 'tabular-nums' }}>
              {embedding.embeddedCards} / {embedding.totalCards}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <div style={{
              width: `${embedPct}%`, height: '100%', borderRadius: 2, transition: 'width 0.6s ease',
              background: embedDone ? '#22c55e' : 'var(--ds-accent, #0a84ff)',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))', marginTop: 10, lineHeight: 1.5 }}>
            Karten werden im Hintergrund indiziert, um semantisch ähnliche Inhalte zu finden.
          </div>
        </div>
      </div>

      <div style={S.section}>
        <SectionHeader
          title="Agent Tools"
          tooltip="Werkzeuge die der Tutor während eines Gesprächs einsetzen kann — Kartensuche, Bilder, Diagramme und mehr. Werden automatisch genutzt wenn der Kontext es erfordert."
        />
        <div style={S.card}>
          {TOOLS.map((tool, i) => (
            <div key={tool.key} style={{
              ...S.toolRow,
              borderBottom: i < TOOLS.length - 1 ? '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))' : 'none',
            }}>
              <span style={{ fontSize: 16, marginRight: 10 }}>{tool.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>
                    {tool.label}
                  </span>
                  {tool.badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                      background: 'rgba(10,132,255,0.12)', color: 'rgba(10,132,255,0.8)',
                    }}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                  {tool.desc}
                </div>
              </div>
              <Toggle on={!!tools[tool.key]} onChange={() => handleToggleTool(tool.key)} />
            </div>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <SectionHeader
          title="Subagenten"
          tooltip="Eigenständige KI-Persönlichkeiten mit eigenem Gedächtnis. Werden automatisch vom Tutor gerufen oder direkt mit @Name angesprochen."
        />
        <div style={S.card}>
          <div style={S.toolRow}>
            <div style={{ marginRight: 10 }}><PlusiIcon size={28} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>Plusi</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(10,132,255,0.12)', color: 'rgba(10,132,255,0.8)' }}>Beta</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                Lern-Begleiter mit Persönlichkeit
              </div>
            </div>
            <Toggle on={mascotEnabled} onChange={handleToggleMascot} />
          </div>
          {mascotEnabled && (
            <>
              <div style={{ height: 1, background: 'var(--ds-border-subtle, rgba(255,255,255,0.06))' }} />
              <div
                onClick={onNavigateToPlusi}
                style={S.subAgentButton}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 12, color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))' }}>Sub-Agent-Menü</span>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary, rgba(255,255,255,0.18))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </>
          )}

        </div>

        <div style={S.card}>
          <div style={S.toolRow}>
            <div style={{ marginRight: 10 }}><ResearchIcon size={28} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>Research Agent</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                Internet-Recherche mit Quellenangaben
              </div>
            </div>
            <Toggle on={researchEnabled} onChange={handleToggleResearch} />
          </div>
          {researchEnabled && (
            <>
              <div style={{ height: 1, background: 'var(--ds-border-subtle, rgba(255,255,255,0.06))' }} />
              <div
                style={S.subAgentButton}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 12, color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))' }}>Sub-Agent-Menü</span>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary, rgba(255,255,255,0.18))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '0 20px 140px', overflowY: 'auto',
  },
  header: {
    fontSize: 16, fontWeight: 600, textAlign: 'center',
    color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
    padding: '20px 0 16px',
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.8px', color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
    marginBottom: 10,
  },
  card: {
    background: 'var(--ds-bg-canvas, rgba(255,255,255,0.03))',
    border: '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))',
    borderRadius: 12, overflow: 'hidden',
  },
  toolRow: {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
  },
  subAgentButton: {
    padding: '14px 16px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    transition: 'background 0.12s',
  },
};
