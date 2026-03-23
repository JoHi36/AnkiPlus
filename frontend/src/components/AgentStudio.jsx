import React, { useState, useEffect, useCallback } from 'react';
import { getRegistry } from '@shared/config/subagentRegistry';

/* ── Hardcoded Plusi icon (special mascot -- not an SVG from the registry) ── */
function PlusiIcon({ size = 28, color = '#0a84ff' }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill={color}/>
      <rect x="5" y="35" width="110" height="40" rx="8" fill={color}/>
      <rect x="40" y="35" width="40" height="40" fill={color}/>
      <ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

/* ── Render agent icon from registry iconSvg or fallback ── */
function AgentIcon({ agent, size = 28 }) {
  if (agent.name === 'plusi') {
    return <PlusiIcon size={size} color={agent.color || '#0a84ff'} />;
  }

  if (agent.iconSvg) {
    // Build a safe SVG by parsing and injecting color + size attributes.
    // The iconSvg comes from trusted Python agent definitions (hardcoded constants
    // in ai/agents.py), never from user input.
    const colored = agent.iconSvg
      .replace(/stroke="currentColor"/g, `stroke="${agent.color || 'var(--ds-text-secondary)'}"`)
      .replace(/width="[^"]*"/, `width="${size}"`)
      .replace(/height="[^"]*"/, '');
    const withSize = colored.includes(`width="${size}"`)
      ? colored
      : colored.replace('<svg', `<svg width="${size}" height="${size}"`);
    /* eslint-disable react/no-danger -- iconSvg is a trusted server-side constant */
    return <span dangerouslySetInnerHTML={{ __html: withSize }} />;
    /* eslint-enable react/no-danger */
  }

  // Default fallback: colored circle with first letter
  const letter = (agent.label || agent.name || '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: agent.color ? `${agent.color}22` : 'var(--ds-bg-overlay)',
      color: agent.color || 'var(--ds-text-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 700,
    }}>
      {letter}
    </div>
  );
}

/* ── Toggle switch ── */
function Toggle({ on, onChange, disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        cursor: disabled ? 'default' : 'pointer', border: 'none', transition: 'background 0.2s',
        background: on ? 'var(--ds-accent, #0a84ff)' : 'rgba(255,255,255,0.08)',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
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

/* ── Tool arrays for the Tutor tools section ── */
const LEARNING_TOOLS = [
  { key: 'card_search', emoji: '\u{1F50D}', label: 'Kartensuche', desc: 'Karten aus dem Deck suchen' },
  { key: 'statistics', emoji: '\u{1F4C8}', label: 'Statistiken', desc: 'Streak, Heatmap, Deck-\u00DCberblick' },
  { key: 'compact', emoji: '\u2726', label: 'Zusammenfassen', desc: 'Chat-Erkenntnisse extrahieren' },
];

const CONTENT_TOOLS = [
  { key: 'images', emoji: '\u{1F5BC}\uFE0F', label: 'Bilder', desc: 'Bilder aus Karten und Internet' },
  { key: 'diagrams', emoji: '\u{1F4CA}', label: 'Diagramme', desc: 'Mermaid-Diagramme' },
  { key: 'molecules', emoji: '\u{1F9EC}', label: 'Molek\u00FCle', desc: 'Molek\u00FClstrukturen darstellen', badge: 'Beta' },
];

/* ── Section header with optional tooltip ── */
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

/* ── Format tool name for display: "search_pubmed" -> "Search Pubmed" ── */
function formatToolName(name) {
  return name
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/* ── Inline tool list shown under an agent when expanded ── */
function AgentToolList({ tools, agentColor }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div style={{ padding: '6px 16px 10px 54px' }}>
      {tools.map((toolName) => (
        <div key={toolName} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 0',
        }}>
          <div style={{
            width: 4, height: 4, borderRadius: 2,
            background: agentColor && agentColor !== 'transparent'
              ? agentColor
              : 'var(--ds-text-tertiary)',
            opacity: 0.5, flexShrink: 0,
          }} />
          <span style={{
            fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.35))',
            fontFamily: 'var(--ds-font-mono, monospace)',
          }}>
            {formatToolName(toolName)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Map of agent names to sub-menu navigation keys ── */
const AGENT_SUBMENU_MAP = {
  plusi: 'plusiMenu',
  research: 'researchMenu',
};

export default function AgentStudio({ bridge, onNavigateToPlusi, onNavigateToResearch }) {
  const [tools, setTools] = useState({});
  const [agentStates, setAgentStates] = useState({}); // { agentName: enabled }
  const [expandedAgents, setExpandedAgents] = useState({}); // { agentName: true }
  const [embedding, setEmbedding] = useState({ embeddedCards: 0, totalCards: 0, isRunning: false });
  const [agents, setAgents] = useState([]);

  // Read agents from registry whenever it updates
  useEffect(() => {
    const refreshAgents = () => {
      const reg = getRegistry();
      const list = [...reg.values()];
      setAgents(list);
      // Initialize agent enabled states from registry data
      const states = {};
      list.forEach(a => {
        states[a.name] = a.enabled ?? a.isDefault;
      });
      setAgentStates(states);
    };

    refreshAgents();

    // Listen for registry updates (pushed from Python)
    const onRegistryUpdate = () => refreshAgents();
    window.addEventListener('agentRegistryUpdated', onRegistryUpdate);
    return () => window.removeEventListener('agentRegistryUpdated', onRegistryUpdate);
  }, []);

  // Load config and tools via async message queue
  useEffect(() => {
    if (!bridge) return;

    const onConfigLoaded = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) {
        setTools(data.ai_tools || data.aiTools || {});
        // Sync agent states from config keys
        setAgentStates(prev => ({
          ...prev,
          plusi: data.mascot_enabled ?? data.mascotEnabled ?? prev.plusi ?? false,
          research: data.research_enabled ?? data.researchEnabled ?? prev.research ?? true,
          help: data.help_enabled ?? data.helpEnabled ?? prev.help ?? true,
        }));
      }
    };
    const onToolsLoaded = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) setTools(data);
    };

    window.addEventListener('ankiConfigLoaded', onConfigLoaded);
    window.addEventListener('ankiAiToolsLoaded', onToolsLoaded);

    bridge.getCurrentConfig?.();
    bridge.getAITools?.();

    return () => {
      window.removeEventListener('ankiConfigLoaded', onConfigLoaded);
      window.removeEventListener('ankiAiToolsLoaded', onToolsLoaded);
    };
  }, [bridge]);

  // Poll embedding status
  useEffect(() => {
    if (!bridge) return;

    const onEmbeddingStatus = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) setEmbedding(data);
    };

    window.addEventListener('ankiEmbeddingStatusLoaded', onEmbeddingStatus);

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

  const handleToggleAgent = useCallback((agentName) => {
    setAgentStates(prev => {
      const next = !prev[agentName];
      // Use the generic saveSubagentEnabled for all agents
      // Special case: Plusi uses saveMascotEnabled for backward compat
      if (agentName === 'plusi') {
        bridge?.saveMascotEnabled?.(next);
      } else {
        window.ankiBridge?.addMessage('saveSubagentEnabled', { name: agentName, enabled: next });
      }
      return { ...prev, [agentName]: next };
    });
  }, [bridge]);

  const toggleExpanded = useCallback((agentName) => {
    setExpandedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
  }, []);

  // Navigation handlers per agent
  const navigateToSubmenu = useCallback((agentName) => {
    if (agentName === 'plusi' && onNavigateToPlusi) onNavigateToPlusi();
    else if (agentName === 'research' && onNavigateToResearch) onNavigateToResearch();
  }, [onNavigateToPlusi, onNavigateToResearch]);

  const embedPct = embedding.totalCards > 0
    ? Math.round((embedding.embeddedCards / embedding.totalCards) * 100)
    : 0;
  const embedDone = embedPct >= 100 && !embedding.isRunning;

  // Separate default agent (Tutor) from subagents
  const defaultAgent = agents.find(a => a.isDefault);
  const subagents = agents.filter(a => !a.isDefault);

  const S = styles;

  return (
    <div style={S.container}>
      <div style={S.header}>Agent Studio</div>

      {/* ── Semantische Suche ── */}
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
                  {embedDone ? 'Fertig' : 'L\u00E4uft...'}
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
            Karten werden im Hintergrund indiziert, um semantisch \u00E4hnliche Inhalte zu finden.
          </div>
        </div>
      </div>

      {/* ── Lerntools (Tutor tools) ── */}
      <div style={S.section}>
        <SectionHeader
          title="Lerntools"
          tooltip="Werkzeuge f\u00FCr Kartensuche, Lernstatistiken und Chat-Zusammenfassung. Unterst\u00FCtzen dich beim aktiven Lernen."
        />
        <div style={S.card}>
          {LEARNING_TOOLS.map((tool, i) => (
            <div key={tool.key} style={{
              ...S.toolRow,
              borderBottom: i < LEARNING_TOOLS.length - 1 ? '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))' : 'none',
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

      {/* ── Inhalte (Content tools) ── */}
      <div style={S.section}>
        <SectionHeader
          title="Inhalte"
          tooltip="Werkzeuge f\u00FCr visuelle Inhalte \u2014 Bilder, Diagramme und Molek\u00FClstrukturen. Werden automatisch in Antworten eingebettet."
        />
        <div style={S.card}>
          {CONTENT_TOOLS.map((tool, i) => (
            <div key={tool.key} style={{
              ...S.toolRow,
              borderBottom: i < CONTENT_TOOLS.length - 1 ? '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))' : 'none',
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

      {/* ── Agenten (All agents from registry) ── */}
      <div style={S.section}>
        <SectionHeader
          title="Agenten"
          tooltip="KI-Agenten mit eigenen F\u00E4higkeiten. Der Tutor ist immer aktiv, Subagenten k\u00F6nnen einzeln aktiviert werden. Werden automatisch vom Tutor gerufen oder direkt mit @Name angesprochen."
        />

        {/* Default agent (Tutor) -- always on, shown first */}
        {defaultAgent && (
          <div style={S.card}>
            <div
              style={{ ...S.toolRow, cursor: 'pointer' }}
              onClick={() => toggleExpanded(defaultAgent.name)}
            >
              <div style={{ marginRight: 10 }}>
                <AgentIcon agent={defaultAgent} size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>
                    {defaultAgent.label}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                    background: 'var(--ds-bg-overlay, rgba(255,255,255,0.06))',
                    color: 'var(--ds-text-tertiary, rgba(255,255,255,0.35))',
                  }}>
                    Standard
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                  {defaultAgent.description}
                </div>
              </div>
              <Toggle on={true} disabled={true} />
            </div>
            {/* Expand/collapse tool list */}
            {expandedAgents[defaultAgent.name] && defaultAgent.tools?.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--ds-border-subtle, rgba(255,255,255,0.06))' }} />
                <AgentToolList tools={defaultAgent.tools} agentColor={defaultAgent.color} />
              </>
            )}
            {defaultAgent.tools?.length > 0 && (
              <div
                style={{
                  ...S.expandButton,
                  borderTop: expandedAgents[defaultAgent.name] ? 'none' : '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))',
                }}
                onClick={() => toggleExpanded(defaultAgent.name)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))' }}>
                  {expandedAgents[defaultAgent.name] ? 'Weniger' : `${defaultAgent.tools.length} Tools`}
                </span>
                <svg
                  width={12} height={12} viewBox="0 0 24 24" fill="none"
                  stroke="var(--ds-text-tertiary, rgba(255,255,255,0.18))"
                  strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    transition: 'transform 0.2s',
                    transform: expandedAgents[defaultAgent.name] ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Non-default agents -- toggleable */}
        {subagents.map((agent) => {
          const isEnabled = !!agentStates[agent.name];
          const hasSubmenu = AGENT_SUBMENU_MAP[agent.name];
          const isExpanded = expandedAgents[agent.name];

          return (
            <div key={agent.name} style={{ ...S.card, marginTop: 10 }}>
              <div style={S.toolRow}>
                <div style={{ marginRight: 10 }}>
                  <AgentIcon agent={agent} size={28} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      color: isEnabled
                        ? 'var(--ds-text-secondary, rgba(255,255,255,0.7))'
                        : 'var(--ds-text-tertiary, rgba(255,255,255,0.35))',
                    }}>
                      {agent.label}
                    </span>
                    {agent.color && agent.color !== 'transparent' && (
                      <div style={{
                        width: 6, height: 6, borderRadius: 3,
                        background: agent.color, flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                    {agent.description}
                  </div>
                </div>
                <Toggle on={isEnabled} onChange={() => handleToggleAgent(agent.name)} />
              </div>

              {/* Show tools + submenu link when enabled */}
              {isEnabled && (
                <>
                  {/* Tool list (expandable) */}
                  {agent.tools?.length > 0 && (
                    <>
                      <div style={{ height: 1, background: 'var(--ds-border-subtle, rgba(255,255,255,0.06))' }} />
                      {isExpanded && (
                        <AgentToolList tools={agent.tools} agentColor={agent.color} />
                      )}
                      <div
                        style={{
                          ...S.expandButton,
                          borderTop: isExpanded ? 'none' : undefined,
                        }}
                        onClick={() => toggleExpanded(agent.name)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))' }}>
                          {isExpanded ? 'Weniger' : `${agent.tools.length} Tools`}
                        </span>
                        <svg
                          width={12} height={12} viewBox="0 0 24 24" fill="none"
                          stroke="var(--ds-text-tertiary, rgba(255,255,255,0.18))"
                          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                          style={{
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </>
                  )}

                  {/* Submenu link (only for agents that have a dedicated submenu) */}
                  {hasSubmenu && (
                    <>
                      <div style={{ height: 1, background: 'var(--ds-border-subtle, rgba(255,255,255,0.06))' }} />
                      <div
                        onClick={() => navigateToSubmenu(agent.name)}
                        style={S.subAgentButton}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ fontSize: 12, color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))' }}>
                          Sub-Agent-Menü
                        </span>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary, rgba(255,255,255,0.18))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
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
  expandButton: {
    padding: '8px 16px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    transition: 'background 0.12s',
  },
};
