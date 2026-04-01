import React, { useState, useEffect } from 'react';
import SidebarTabBar from './SidebarTabBar';
import SettingsSidebar from './SettingsSidebar';
import PlusiMenu from './PlusiMenu';
import ResearchMenu from './ResearchMenu';
import StandardSubMenu from './StandardSubMenu';
import AgentHeader from './AgentHeader';
import WorkflowList from './WorkflowList';
import { getRegistry } from '@shared/config/subagentRegistry';

/* ── Content animation keyframes injected once ───────────────────────────── */
const STYLE_ID = 'sidebar-shell-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes sidebarContentIn {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

/* ── Derive sidebar-eligible agents from registry ────────────────────────── */
function getSidebarAgents() {
  const reg = getRegistry();
  const eligible = [];

  for (const agent of reg.values()) {
    if (
      agent.submenuComponent ||
      agent.toolsConfigurable ||
      agent.name === 'plusi' ||
      (agent.workflows && agent.workflows.length > 0)
    ) {
      eligible.push(agent);
    }
  }

  // Fixed display order for sidebar tabs
  const ORDER = ['tutor', 'research', 'plusi', 'help'];
  eligible.sort((a, b) => {
    const ai = ORDER.indexOf(a.name);
    const bi = ORDER.indexOf(b.name);
    // Known agents sorted by ORDER, unknown agents appended at end alphabetically
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return (a.label || a.name).localeCompare(b.label || b.name);
  });

  return eligible;
}

/* ── Content router ──────────────────────────────────────────────────────── */
function ContentPanel({ activeTab, agents, bridge, enabled }) {
  const [innerTab, setInnerTab] = useState('insights');

  // Reset inner tab when outer tab changes
  useEffect(() => {
    setInnerTab('insights');
  }, [activeTab]);

  if (activeTab === '__settings__') {
    return <SettingsSidebar bridge={bridge} />;
  }

  const agent = agents.find(a => a.name === activeTab);
  if (!agent) return null;

  // Determine if this agent has a "Speziell" (special) tab
  const hasSpecialTab = agent.name === 'plusi' || agent.submenuComponent === 'researchMenu';
  const hasWorkflows = agent.workflows && agent.workflows.length > 0;

  // Speziell tab labels
  const specialLabel = agent.name === 'plusi' ? 'Persönlichkeit' : 'Quellen';

  // Render special content
  const getSpecialContent = () => {
    if (agent.name === 'plusi') return <PlusiMenu bridge={bridge} agent={agent} />;
    if (agent.submenuComponent === 'researchMenu') return <ResearchMenu bridge={bridge} agent={agent} />;
    return null;
  };

  // If agent has BOTH special tab AND workflows → show inner tab bar
  if (hasSpecialTab && hasWorkflows) {
    return (
      <div style={{
        flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        opacity: enabled ? 1 : 0.25, pointerEvents: enabled ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
      }}>
        {/* Inner segmented control */}
        <div style={{
          display: 'flex', gap: 0, margin: '0 12px 12px',
          background: 'var(--ds-hover-tint)', borderRadius: '10px',
          padding: '3px', border: '1px solid var(--ds-border-subtle)',
        }}>
          <button
            onClick={() => setInnerTab('special')}
            style={{
              flex: 1, textAlign: 'center', padding: '7px 0', fontSize: '12px',
              borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: innerTab === 'special' ? `${agent.color}18` : 'transparent',
              color: innerTab === 'special' ? agent.color : 'var(--ds-text-muted)',
              fontWeight: innerTab === 'special' ? 600 : 400,
              transition: 'all 0.2s ease',
            }}
          >
            {specialLabel}
          </button>
          <button
            onClick={() => setInnerTab('insights')}
            style={{
              flex: 1, textAlign: 'center', padding: '7px 0', fontSize: '12px',
              borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: innerTab === 'insights' ? `${agent.color}18` : 'transparent',
              color: innerTab === 'insights' ? agent.color : 'var(--ds-text-muted)',
              fontWeight: innerTab === 'insights' ? 600 : 400,
              transition: 'all 0.2s ease',
            }}
          >
            Deep Insights
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {innerTab === 'special' ? getSpecialContent() : (
            <div style={{ padding: '0 12px' }}>
              <WorkflowList agent={agent} bridge={bridge} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Agents with workflows but NO special tab → show WorkflowList directly
  if (hasWorkflows) {
    return (
      <div style={{
        flex: 1, overflow: 'auto',
        opacity: enabled ? 1 : 0.25, pointerEvents: enabled ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
        padding: '0 12px',
      }}>
        <WorkflowList agent={agent} bridge={bridge} />
      </div>
    );
  }

  // Fallback: legacy StandardSubMenu (for agents without workflows yet)
  return (
    <div style={{
      flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      opacity: enabled ? 1 : 0.25, pointerEvents: enabled ? 'auto' : 'none',
      transition: 'opacity 0.3s ease',
    }}>
      <StandardSubMenu bridge={bridge} agent={agent} />
    </div>
  );
}

/* ── Config key → agent name mapping ────────────────────────────────────── */
const CONFIG_KEY_MAP = {
  mascot_enabled: 'plusi',
  research_enabled: 'research',
  help_enabled: 'help',
  tutor_enabled: 'tutor',
};

/* ── SidebarShell ─────────────────────────────────────────────────────────── */
/**
 * Wraps the vertical tab bar + content area for the settings sidebar.
 * Manages activeTab state and routes to the correct content panel.
 *
 * Props:
 *   bridge — WebBridge proxy (passed down to all content panels)
 */
export default function SidebarShell({ bridge }) {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('ankiplus-sidebar-tab') || '__settings__'; }
    catch { return '__settings__'; }
  });

  // Persist active tab across view switches
  function handleTabChange(tab) {
    setActiveTab(tab);
    try { localStorage.setItem('ankiplus-sidebar-tab', tab); } catch {}
  }
  const [agents, setAgents] = useState(() => getSidebarAgents());

  // enabledStates: { [agentName]: boolean }
  // Default: all enabled until config arrives
  const [enabledStates, setEnabledStates] = useState(() => {
    const initial = {};
    getSidebarAgents().forEach(a => { initial[a.name] = true; });
    return initial;
  });

  /* Re-derive agent list when registry updates */
  useEffect(() => {
    const onRegistryUpdated = () => {
      const updated = getSidebarAgents();
      setAgents(updated);
      setEnabledStates(prev => {
        const next = { ...prev };
        updated.forEach(a => {
          if (!(a.name in next)) next[a.name] = true;
        });
        return next;
      });
    };

    window.addEventListener('agentRegistryUpdated', onRegistryUpdated);
    return () => {
      window.removeEventListener('agentRegistryUpdated', onRegistryUpdated);
    };
  }, []);

  /* Load initial enabled states from config */
  useEffect(() => {
    const onConfigLoaded = (e) => {
      const config = e.detail || {};
      setEnabledStates(prev => {
        const next = { ...prev };
        for (const [configKey, agentName] of Object.entries(CONFIG_KEY_MAP)) {
          if (configKey in config) {
            next[agentName] = Boolean(config[configKey]);
          }
        }
        return next;
      });
    };

    window.addEventListener('ankiConfigLoaded', onConfigLoaded);

    // Request config on mount
    window.ankiBridge?.addMessage('getCurrentConfig', null);

    return () => {
      window.removeEventListener('ankiConfigLoaded', onConfigLoaded);
    };
  }, []);

  /* Toggle handler — saves to backend */
  function handleToggle(agentName) {
    const agent = agents.find(a => a.name === agentName);
    if (!agent || agent.isDefault) return;

    const newEnabled = !enabledStates[agentName];

    setEnabledStates(prev => ({ ...prev, [agentName]: newEnabled }));

    if (agentName === 'plusi') {
      window.ankiBridge?.addMessage('saveMascotEnabled', { enabled: newEnabled });
    } else {
      window.ankiBridge?.addMessage('saveSubagentEnabled', { name: agentName, enabled: newEnabled });
    }
  }

  const currentAgent = activeTab !== '__settings__'
    ? agents.find(a => a.name === activeTab)
    : null;
  const isEnabled = currentAgent
    ? (currentAgent.isDefault ? true : (enabledStates[activeTab] ?? true))
    : true;

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ── Vertical icon tab strip ─────────────────────────────────────────── */}
      <SidebarTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        agents={agents}
      />

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--ds-bg-deep)',
          overflow: 'hidden',
        }}
      >
        {/* key forces remount on tab change → triggers entry animation */}
        <div
          key={activeTab}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'sidebarContentIn 300ms cubic-bezier(0.25, 1, 0.5, 1) both',
          }}
        >
          {/* AgentHeader — shown for all agent tabs (not __settings__) */}
          {currentAgent && (
            <AgentHeader
              agent={currentAgent}
              enabled={isEnabled}
              onToggle={() => handleToggle(activeTab)}
            />
          )}

          <ContentPanel
            activeTab={activeTab}
            agents={agents}
            bridge={bridge}
            enabled={isEnabled}
          />
        </div>
      </div>
    </div>
  );
}
