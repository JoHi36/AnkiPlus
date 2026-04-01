import React from 'react';

/* ── Power icon SVG ──────────────────────────────────────────────────────── */
function PowerIcon({ color, opacity }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      style={{ opacity, flexShrink: 0, transition: 'stroke 0.3s ease, opacity 0.3s ease' }}
    >
      <path d="M12 2v6" />
      <path d="M16.24 7.76a6 6 0 1 1-8.49 0" />
    </svg>
  );
}

/* ── Lock icon SVG (for default/locked agents) ──────────────────────────── */
function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ds-text-muted)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.5 }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* ── AgentHeader ─────────────────────────────────────────────────────────── */
/**
 * Unified header for all agent tabs in the sidebar.
 * The entire header area is clickable to toggle the agent on/off.
 *
 * Props:
 *   agent   — { name, label, color, description, isDefault? }
 *   enabled — boolean
 *   onToggle — () => void  (disabled/no-op when agent.isDefault)
 */
export default function AgentHeader({ agent, enabled, onToggle }) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const isDefault = agent?.isDefault;

  // Derive colors based on enabled state
  const agentColor = agent?.color || 'var(--ds-accent)';

  const nameFontColor = enabled
    ? 'var(--ds-text-primary)'
    : 'var(--ds-text-muted)';

  // Badge: colored when on, dimmed when off
  const badgeBg = enabled
    ? agentColor + '1A'   // hex color + 10% opacity via hex alpha
    : 'var(--ds-hover-tint)';
  const badgeTextColor = enabled
    ? agentColor
    : 'var(--ds-text-muted)';

  // Description: tertiary when on, very dim when off
  const descColor = enabled
    ? 'var(--ds-text-tertiary)'
    : 'var(--ds-text-muted)';

  // Power icon
  const iconColor = enabled ? agentColor : 'var(--ds-text-muted)';
  const iconOpacity = enabled ? 1 : 0.4;

  // Background feedback on hover/press (only when interactive)
  let bgColor = 'transparent';
  if (!isDefault) {
    if (pressed) bgColor = 'var(--ds-active-tint)';
    else if (hovered) bgColor = 'var(--ds-hover-tint)';
  }

  function handleClick() {
    if (!isDefault && onToggle) onToggle();
  }

  return (
    <div
      role={isDefault ? undefined : 'button'}
      tabIndex={isDefault ? undefined : 0}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => { if (!isDefault) setPressed(true); }}
      onMouseUp={() => setPressed(false)}
      onKeyDown={(e) => { if (!isDefault && (e.key === 'Enter' || e.key === ' ')) handleClick(); }}
      style={{
        padding: '16px 14px 12px',
        cursor: isDefault ? 'default' : 'pointer',
        background: bgColor,
        transition: 'background 0.15s ease',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* ── Row 1: Name + Badge + Power icon ─────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '4px',
        }}
      >
        {/* Agent name */}
        <span
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: nameFontColor,
            lineHeight: 1,
            transition: 'color 0.3s ease',
          }}
        >
          {agent?.label || agent?.name || 'Agent'}
        </span>

        {/* "Agent" badge */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '2px 6px',
            borderRadius: '4px',
            background: badgeBg,
            color: badgeTextColor,
            lineHeight: 1.4,
            transition: 'background 0.3s ease, color 0.3s ease',
          }}
        >
          Agent
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Power icon or Lock icon */}
        {isDefault
          ? <LockIcon />
          : <PowerIcon color={iconColor} opacity={iconOpacity} />
        }
      </div>

      {/* ── Row 2: Description ────────────────────────────────────────────── */}
      {agent?.description && (
        <div
          style={{
            fontSize: '11px',
            color: descColor,
            lineHeight: 1.4,
            transition: 'color 0.3s ease',
          }}
        >
          {agent.description}
        </div>
      )}
    </div>
  );
}
