import React, { useState } from 'react';
import AgentWidgetSlot from './AgentWidgetSlot';
import { getToolRegistry } from '@shared/config/subagentRegistry';

/* ── Plusi inline SVG mascot ─────────────────────────────────────────────── */
function PlusiSvg({ size = 18, color = '#AF52DE' }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill={color} />
      <rect x="5" y="35" width="110" height="40" rx="8" fill={color} />
      <rect x="40" y="35" width="40" height="40" fill={color} />
      <ellipse cx="48" cy="49" rx="7" ry="8" fill="white" />
      <ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a" />
      <ellipse cx="72" cy="49" rx="7" ry="8" fill="white" />
      <ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a" />
      <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ── AgentIcon ────────────────────────────────────────────────────────────── */
function AgentIcon({ agent, size = 18 }) {
  if (agent.name === 'plusi') {
    return <PlusiSvg size={size} color={agent.color || '#AF52DE'} />;
  }
  if (agent.iconSvg) {
    const colored = agent.iconSvg
      .replace(/stroke="currentColor"/g, `stroke="${agent.color || 'var(--ds-text-secondary)'}"`)
      .replace(/width="[^"]*"/, `width="${size}"`)
      .replace(/height="[^"]*"/, '');
    const withSize = colored.includes(`width="${size}"`)
      ? colored
      : colored.replace('<svg', `<svg width="${size}" height="${size}"`);
    return <span dangerouslySetInnerHTML={{ __html: withSize }} />;
  }
  const letter = (agent.label || agent.name || '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: agent.color ? `${agent.color}22` : 'var(--ds-bg-overlay)',
      color: agent.color || 'var(--ds-text-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45), fontWeight: 700, flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

/* ── Toggle ───────────────────────────────────────────────────────────────── */
function Toggle({ on, onChange, locked = false }) {
  return (
    <button
      onClick={locked ? undefined : onChange}
      style={{
        width: 34, height: 18, borderRadius: 9,
        position: 'relative', border: 'none',
        cursor: locked ? 'default' : 'pointer',
        transition: 'background 0.2s',
        background: on ? 'var(--ds-accent)' : 'var(--ds-hover-tint)',
        opacity: locked ? 0.6 : 1,
        flexShrink: 0, padding: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

/* ── Collapsible tool section ─────────────────────────────────────────────── */
function ToolSection({ toolNames }) {
  const [expanded, setExpanded] = useState(false);

  if (!toolNames || toolNames.length === 0) return null;

  const toolRegistry = getToolRegistry();
  const tools = toolNames.map(name => {
    const reg = toolRegistry.get(name);
    return reg || {
      name,
      label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      enabled: true,
    };
  });

  const activeCount = tools.filter(t => t.enabled).length;
  const totalCount = tools.length;

  return (
    <div style={{ padding: '0 16px 6px' }}>
      {/* Summary row — clickable */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', padding: '4px 0',
        }}
      >
        <span style={{
          fontSize: 10, color: 'var(--ds-text-muted)',
        }}>
          {activeCount} von {totalCount} Tools aktiv
        </span>
        <svg
          width={10} height={10} viewBox="0 0 24 24" fill="none"
          stroke="var(--ds-text-muted)" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded chip list */}
      {expanded && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4,
          paddingTop: 4, paddingBottom: 2,
        }}>
          {tools.map(tool => (
            <span
              key={tool.name}
              style={{
                fontSize: 9,
                fontFamily: 'var(--ds-font-mono)',
                padding: '2px 7px',
                borderRadius: 5,
                background: tool.enabled ? 'var(--ds-bg-overlay)' : 'var(--ds-bg-canvas)',
                color: tool.enabled ? 'var(--ds-text-secondary)' : 'var(--ds-text-muted)',
              }}
            >
              {tool.label || tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sub-menu link row ────────────────────────────────────────────────────── */
function SubMenuLink({ agent, onOpenSubmenu }) {
  const label = agent.submenuLabel || 'Sub-Agent-Men\u00FC';
  return (
    <div
      onClick={onOpenSubmenu}
      style={{
        borderTop: '1px solid var(--ds-border-subtle)',
        padding: '7px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        fontSize: 11, fontWeight: 500,
        color: agent.color ? `${agent.color}80` : 'var(--ds-text-muted)',
      }}>
        {label}
      </span>
      <svg
        width={12} height={12} viewBox="0 0 24 24" fill="none"
        stroke="var(--ds-text-muted)" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}

/* ── AgentCard ────────────────────────────────────────────────────────────── */
export default function AgentCard({ agent, enabled, onToggle, onOpenSubmenu, bridge }) {
  const hasWidget = !!agent.widgetType;
  const hasTools = agent.tools && agent.tools.length > 0;
  const hasSubmenu = !!onOpenSubmenu && (agent.submenuComponent || agent.submenuLabel);

  return (
    <div style={{
      background: 'var(--ds-bg-canvas)',
      border: '1px solid var(--ds-border-subtle)',
      borderRadius: 12,
      overflow: 'hidden',
      opacity: enabled ? 1 : 0.4,
      transition: 'opacity 0.2s',
    }}>
      {/* ── Header row ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px',
        gap: 8,
      }}>
        <div style={{ flexShrink: 0 }}>
          <AgentIcon agent={agent} size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: 'var(--ds-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {agent.label || agent.name}
          </span>
          {agent.isDefault && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: 'var(--ds-bg-overlay)', color: 'var(--ds-text-muted)',
              flexShrink: 0,
            }}>
              Standard
            </span>
          )}
        </div>
        <Toggle on={enabled} onChange={onToggle} locked={agent.isDefault} />
      </div>

      {/* ── Body (only when enabled) ── */}
      {enabled && (hasWidget || hasTools || hasSubmenu) && (
        <>
          {/* Widget slot — tight to header (no extra padding) */}
          {hasWidget && (
            <div style={{ marginTop: -4 }}>
              <AgentWidgetSlot
                widgetType={agent.widgetType}
                bridge={bridge}
                agentColor={agent.color}
              />
            </div>
          )}

          {/* Collapsible tools */}
          {hasTools && <ToolSection toolNames={agent.tools} />}

          {/* Sub-menu link */}
          {hasSubmenu && <SubMenuLink agent={agent} onOpenSubmenu={onOpenSubmenu} />}
        </>
      )}
    </div>
  );
}
