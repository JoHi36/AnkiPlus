import React, { useState, useEffect, useCallback } from 'react';
import { getToolRegistry } from '@shared/config/subagentRegistry';

/* ── iOS-style toggle ────────────────────────────────────────────────────── */
function Toggle({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 34,
        height: 18,
        borderRadius: 9,
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.2s',
        background: on ? 'var(--ds-accent)' : 'var(--ds-bg-overlay)',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: 'var(--ds-shadow-sm)',
        }}
      />
    </button>
  );
}

/* ── Always-on indicator (non-configurable tools) ────────────────────────── */
function AlwaysOnBadge() {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 5,
        background: 'var(--ds-bg-overlay)',
        color: 'var(--ds-text-muted)',
        flexShrink: 0,
      }}
    >
      Immer an
    </span>
  );
}

/* ── StandardSubMenu ─────────────────────────────────────────────────────── */
export default function StandardSubMenu({ agent, bridge, onNavigateBack = null }) {
  const [toolStates, setToolStates] = useState({});

  // Load tool states from bridge on mount
  useEffect(() => {
    if (!bridge) return;

    const onToolsLoaded = (e) => {
      const data = e.detail?.data || e.detail;
      if (data && typeof data === 'object') {
        setToolStates(data);
      }
    };

    window.addEventListener('ankiAiToolsLoaded', onToolsLoaded);
    bridge.getAITools?.();

    return () => {
      window.removeEventListener('ankiAiToolsLoaded', onToolsLoaded);
    };
  }, [bridge]);

  const handleToggle = useCallback((configKey) => {
    setToolStates((prev) => {
      const updated = { ...prev, [configKey]: !prev[configKey] };
      if (bridge?.saveAITools) {
        bridge.saveAITools(JSON.stringify(updated));
      }
      return updated;
    });
  }, [bridge]);

  // Resolve tools from registry — fallback to formatted name if registry empty
  const toolRegistry = getToolRegistry();
  const agentTools = (agent?.tools || []).map((name) => {
    const reg = toolRegistry.get(name);
    return reg || {
      name,
      label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: '',
      configurable: true,
      configKey: name,
      enabled: true,
    };
  });

  const toolsConfigurable = !!agent?.toolsConfigurable;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '0 20px',
        overflowY: 'auto',
        flex: 1,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: '20px 0 16px',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--ds-text-primary)',
          }}
        >
          {agent?.label || agent?.name || 'Agent'}
        </div>
        {agent?.description && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--ds-text-tertiary)',
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {agent.description}
          </div>
        )}
      </div>

      {/* ── Tool list ── */}
      {agentTools.length > 0 && (
        <div>
          {agentTools.map((tool, i) => {
            const isLastTool = i === agentTools.length - 1;
            const showToggle = toolsConfigurable && tool.configurable;
            const isOn = !!toolStates[tool.configKey];

            return (
              <div
                key={tool.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 0',
                  borderBottom: isLastTool
                    ? 'none'
                    : '1px solid var(--ds-border-subtle)',
                }}
              >
                {/* Label + description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--ds-text-secondary)',
                    }}
                  >
                    {tool.label || tool.name}
                  </div>
                  {tool.description && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ds-text-muted)',
                        marginTop: 2,
                        lineHeight: 1.4,
                      }}
                    >
                      {tool.description}
                    </div>
                  )}
                </div>

                {/* Toggle or always-on badge */}
                {showToggle ? (
                  <Toggle
                    on={isOn}
                    onChange={() => handleToggle(tool.configKey)}
                  />
                ) : (
                  <AlwaysOnBadge />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {agentTools.length === 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ds-text-muted)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          Keine Tools konfigurierbar.
        </div>
      )}
    </div>
  );
}
