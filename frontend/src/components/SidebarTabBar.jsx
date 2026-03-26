import React, { useRef, useState, useLayoutEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';

/* ── Plusi inline SVG (cross shape, no face — icon strip variant) ─────────── */
function PlusiSvg({ size = 20, color }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="40" y="5"  width="40" height="110" rx="8" fill={color} />
      <rect x="5"  y="35" width="110" height="40"  rx="8" fill={color} />
      <rect x="40" y="35" width="40"  height="40"  rx="8" fill={color} />
    </svg>
  );
}

/* ── Known agent icons as React SVGs ──────────────────────────────────────── */
const AGENT_ICONS = {
  tutor: ({ size, color }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L2 9l10 6 10-6-10-6z" />
      <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
      <path d="M20 9v7" />
    </svg>
  ),
  research: ({ size, color }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M11 3a15 15 0 0 1 4 8 15 15 0 0 1-4 8" />
      <path d="M11 3a15 15 0 0 0-4 8 15 15 0 0 0 4 8" />
      <path d="M3 11h16" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
    </svg>
  ),
  help: ({ size, color }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r="0.5" fill={color} stroke="none" />
    </svg>
  ),
};

/* ── AgentIcon ────────────────────────────────────────────────────────────── */
function AgentIcon({ agent, size = 16, color }) {
  if (agent.name === 'plusi') {
    return <PlusiSvg size={size} color={color} />;
  }
  const KnownIcon = AGENT_ICONS[agent.name];
  if (KnownIcon) {
    return <KnownIcon size={size} color={color} />;
  }
  // Fallback: single letter avatar
  const letter = (agent.label || agent.name || '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}22`,
      color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45), fontWeight: 700, flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

/* ── SidebarTabBar ────────────────────────────────────────────────────────── */
/**
 * Vertical 44px icon strip that sits on the left edge of the settings sidebar.
 *
 * Props:
 *   activeTab    — '__settings__' | agent.name
 *   onTabChange  — (tabId: string) => void
 *   agents       — Array<{ name, label, color, iconSvg, iconType }>
 */
export default function SidebarTabBar({ activeTab, onTabChange, agents = [] }) {
  const stripRef = useRef(null);
  const tabRefs  = useRef({});
  const [pill, setPill]       = useState({ top: 0, height: 0 });
  const [isFirst, setIsFirst] = useState(true);
  const [pressed, setPressed] = useState(null);   // tabId being pressed

  /* Compute pill position whenever activeTab or agent list changes */
  useLayoutEffect(() => {
    const el        = tabRefs.current[activeTab];
    const container = stripRef.current;
    if (!el || !container) return;

    const eRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    setPill({ top: eRect.top - cRect.top, height: eRect.height });

    // After first measurement, enable the slide transition
    if (isFirst) setIsFirst(false);
  }, [activeTab, agents]);

  /* Pill background: settings → hover-tint, agent → color-mix tint */
  function pillBg(tabId) {
    if (tabId === '__settings__') return 'var(--ds-hover-tint)';
    const agent = agents.find(a => a.name === tabId);
    const c = agent?.color || 'var(--ds-text-tertiary)';
    // Use color-mix for transparent tint — works with both hex and CSS vars
    return `color-mix(in srgb, ${c} 10%, transparent)`;
  }

  const settingsId = '__settings__';

  return (
    <div
      ref={stripRef}
      style={{
        width: 'var(--ds-sidebar-tab-width)',     /* 44px token */
        minWidth: 'var(--ds-sidebar-tab-width)',
        background: 'var(--ds-bg-deep)',
        borderRight: '1px solid var(--ds-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 6,
        position: 'relative',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* ── Animated background pill ────────────────────────────────────────── */}
      {pill.height > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            top: pill.top,
            height: pill.height,
            borderRadius: 8,
            background: pillBg(activeTab),
            transition: isFirst
              ? 'none'
              : 'top 0.4s cubic-bezier(0.25, 1, 0.5, 1), background 0.4s ease',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* ── Settings tab ────────────────────────────────────────────────────── */}
      <TabButton
        id={settingsId}
        active={activeTab === settingsId}
        pressed={pressed === settingsId}
        tabRefs={tabRefs}
        onTabChange={onTabChange}
        setPressed={setPressed}
        title="Einstellungen"
      >
        <SlidersHorizontal
          size={17}
          color={activeTab === settingsId
            ? 'var(--ds-text-secondary)'
            : 'var(--ds-text-muted)'}
          strokeWidth={2}
        />
      </TabButton>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      {agents.length > 0 && (
        <div style={{
          width: 20,
          height: 1,
          background: 'var(--ds-border-subtle)',
          margin: '4px 0',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }} />
      )}

      {/* ── Agent tabs ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {agents.map(agent => {
        const isActive   = activeTab === agent.name;
        const agentColor = agent.color || 'var(--ds-text-secondary)';
        const iconColor  = isActive ? agentColor : 'var(--ds-text-muted)';

        return (
          <TabButton
            key={agent.name}
            id={agent.name}
            active={isActive}
            pressed={pressed === agent.name}
            tabRefs={tabRefs}
            onTabChange={onTabChange}
            setPressed={setPressed}
            title={agent.label || agent.name}
          >
            <AgentIcon agent={agent} size={20} color={iconColor} />
          </TabButton>
        );
      })}
      </div>
    </div>
  );
}

/* ── Shared tab button wrapper ────────────────────────────────────────────── */
function TabButton({ id, active, pressed, tabRefs, onTabChange, setPressed, title, children }) {
  return (
    <button
      ref={el => { tabRefs.current[id] = el; }}
      onClick={() => onTabChange(id)}
      onMouseDown={() => setPressed(id)}
      onMouseUp={() => setPressed(null)}
      onMouseLeave={() => setPressed(null)}
      title={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        transition: 'transform 0.12s ease',
        padding: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  );
}
