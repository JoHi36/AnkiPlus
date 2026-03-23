import React, { useState, useEffect, useCallback } from 'react';
import { getRegistry, setToolRegistry } from '@shared/config/subagentRegistry';
import SystemIntelligenceBox from './SystemIntelligenceBox';
import AgentCard from './AgentCard';

export default function AgentStudio({ bridge, onNavigateToSubmenu }) {
  const [agents, setAgents] = useState([]);
  const [agentStates, setAgentStates] = useState({});

  // Read agents from registry on mount + listen for updates
  useEffect(() => {
    const refresh = () => {
      const reg = getRegistry();
      const list = [...reg.values()];
      setAgents(list);
      const states = {};
      list.forEach(a => { states[a.name] = a.enabled; });
      setAgentStates(states);
    };
    refresh();
    window.addEventListener('agentRegistryUpdated', refresh);
    return () => window.removeEventListener('agentRegistryUpdated', refresh);
  }, []);

  // Load tool registry via bridge
  useEffect(() => {
    if (!bridge) return;
    const onToolsLoaded = (e) => {
      const data = e.detail?.data || e.detail;
      if (data && Array.isArray(data)) setToolRegistry(data);
    };
    window.addEventListener('ankiToolRegistryLoaded', onToolsLoaded);
    window.ankiBridge?.addMessage('getToolRegistry', null);
    return () => window.removeEventListener('ankiToolRegistryLoaded', onToolsLoaded);
  }, [bridge]);

  // Load config for agent states
  useEffect(() => {
    if (!bridge) return;
    const onConfig = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) {
        setAgentStates(prev => ({
          ...prev,
          plusi: data.mascot_enabled ?? data.mascotEnabled ?? prev.plusi ?? false,
          research: data.research_enabled ?? data.researchEnabled ?? prev.research ?? true,
          help: data.help_enabled ?? data.helpEnabled ?? prev.help ?? true,
        }));
      }
    };
    window.addEventListener('ankiConfigLoaded', onConfig);
    bridge.getCurrentConfig?.();
    return () => window.removeEventListener('ankiConfigLoaded', onConfig);
  }, [bridge]);

  const handleToggleAgent = useCallback((agentName) => {
    setAgentStates(prev => {
      const next = !prev[agentName];
      if (agentName === 'plusi') bridge?.saveMascotEnabled?.(next);
      else window.ankiBridge?.addMessage('saveSubagentEnabled', { name: agentName, enabled: next });
      return { ...prev, [agentName]: next };
    });
  }, [bridge]);

  const handleOpenSubmenu = useCallback((agent) => {
    const view = agent.submenuComponent || `subMenu:${agent.name}`;
    onNavigateToSubmenu(view);
  }, [onNavigateToSubmenu]);

  const sorted = [...agents].sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px', overflow: 'hidden',
    }}>
      <SystemIntelligenceBox bridge={bridge} />

      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.8px',
        color: 'var(--ds-text-muted)', textTransform: 'uppercase',
        padding: '0 4px', marginBottom: 6,
      }}>
        Agenten
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {sorted.map(agent => (
          <AgentCard
            key={agent.name}
            agent={agent}
            enabled={agent.isDefault || !!agentStates[agent.name]}
            onToggle={() => handleToggleAgent(agent.name)}
            onOpenSubmenu={() => handleOpenSubmenu(agent)}
            bridge={bridge}
          />
        ))}
      </div>
    </div>
  );
}
