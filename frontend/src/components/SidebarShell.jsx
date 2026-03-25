import React, { useState, useEffect } from 'react';
import SidebarTabBar from './SidebarTabBar';
import SettingsSidebar from './SettingsSidebar';
import PlusiMenu from './PlusiMenu';
import ResearchMenu from './ResearchMenu';
import StandardSubMenu from './StandardSubMenu';
import AgentHeader from './AgentHeader';
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
      agent.name === 'plusi'
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
  if (activeTab === '__settings__') {
    return <SettingsSidebar bridge={bridge} />;
  }

  const agent = agents.find(a => a.name === activeTab);

  if (!agent) {
    return null;
  }

  let content;
  if (agent.name === 'plusi') {
    content = <PlusiMenu bridge={bridge} agent={agent} />;
  } else if (agent.submenuComponent === 'researchMenu') {
    content = <ResearchMenu bridge={bridge} agent={agent} />;
  } else {
    content = <StandardSubMenu bridge={bridge} agent={agent} />;
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: enabled ? 1 : 0.25,
        pointerEvents: enabled ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
      }}
    >
      {content}
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
