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

/* ── AgentIcon (mirrors AgentCard.jsx pattern) ────────────────────────────── */
function AgentIcon({ agent, size = 20, color }) {
  if (agent.name === 'plusi') {
    return <PlusiSvg size={size} color={color} />;
  }
  if (agent.iconSvg) {
    // iconSvg comes from the trusted Python agent registry — not user input.
    let svg = agent.iconSvg
      .replace(/stroke="currentColor"/g, `stroke="${color}"`)
      .replace(/fill="currentColor"/g, `fill="${color}"`);
    // Ensure width and height are set
    svg = svg.replace(/width="[^"]*"/, `width="${size}"`);
    svg = svg.replace(/height="[^"]*"/, `height="${size}"`);
    // If no width/height existed, inject them
    if (!svg.includes(`width="${size}"`)) {
      svg = svg.replace('<svg', `<svg width="${size}" height="${size}"`);
    }
    // nosec: SVG source is the internal Python agent registry, not user content
    return <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: svg }} />; // nosec
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

  /* Pill background: settings → hover-tint, agent → agent color + '18' hex opacity */
  function pillBg(tabId) {
    if (tabId === '__settings__') return 'var(--ds-hover-tint)';
    const agent = agents.find(a => a.name === tabId);
    const hex   = agent?.color || '#888888';
    // Append '18' (≈ 9% opacity in 8-digit hex notation)
    return `${hex.startsWith('#') ? hex : '#' + hex}18`;
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
