import React, { useState, useEffect } from 'react';
import SidebarTabBar from './SidebarTabBar';
import SettingsSidebar from './SettingsSidebar';
import PlusiMenu from './PlusiMenu';
import ResearchMenu from './ResearchMenu';
import StandardSubMenu from './StandardSubMenu';
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

  // Sort: default agents first, then alphabetical by label
  eligible.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return (a.label || a.name).localeCompare(b.label || b.name);
  });

  return eligible;
}

/* ── Content router ──────────────────────────────────────────────────────── */
function ContentPanel({ activeTab, agents, bridge }) {
  if (activeTab === '__settings__') {
    return <SettingsSidebar bridge={bridge} />;
  }

  const agent = agents.find(a => a.name === activeTab);

  if (!agent) {
    return null;
  }

  if (agent.name === 'plusi') {
    return <PlusiMenu bridge={bridge} agent={agent} />;
  }

  if (agent.submenuComponent === 'researchMenu') {
    return <ResearchMenu bridge={bridge} agent={agent} />;
  }

  return <StandardSubMenu bridge={bridge} agent={agent} />;
}

/* ── SidebarShell ─────────────────────────────────────────────────────────── */
/**
 * Wraps the vertical tab bar + content area for the settings sidebar.
 * Manages activeTab state and routes to the correct content panel.
 *
 * Props:
 *   bridge — WebBridge proxy (passed down to all content panels)
 */
export default function SidebarShell({ bridge }) {
  const [activeTab, setActiveTab] = useState('__settings__');
  const [agents, setAgents] = useState(() => getSidebarAgents());

  /* Re-derive agent list when registry updates */
  useEffect(() => {
    const onRegistryUpdated = () => {
      setAgents(getSidebarAgents());
    };

    window.addEventListener('agentRegistryUpdated', onRegistryUpdated);
    return () => {
      window.removeEventListener('agentRegistryUpdated', onRegistryUpdated);
    };
  }, []);

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
        onTabChange={setActiveTab}
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
          <ContentPanel
            activeTab={activeTab}
            agents={agents}
            bridge={bridge}
          />
        </div>
      </div>
    </div>
  );
}
