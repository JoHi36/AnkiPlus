import React from 'react';
import SlotChips from './SlotChips';

/* ── iOS-style toggle (green for workflows) ─────────────────────────────── */
function Toggle({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.2s',
        background: on ? 'var(--ds-green)' : 'var(--ds-bg-overlay)',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 17 : 3,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'var(--ds-text-primary)',
          transition: 'left 0.2s',
          boxShadow: 'var(--ds-shadow-sm)',
        }}
      />
    </button>
  );
}

/* ── Chevron icon ────────────────────────────────────────────────────────── */
function Chevron({ expanded }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      style={{
        flexShrink: 0,
        opacity: 0.4,
        transition: 'transform 0.2s',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="var(--ds-text-primary)"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Lock icon ───────────────────────────────────────────────────────────── */
function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" style={{ opacity: 0.35, flexShrink: 0 }}>
      <rect x="2" y="7" width="12" height="8" rx="2" fill="var(--ds-text-muted)" />
      <path
        d="M5 7V5a3 3 0 016 0v2"
        stroke="var(--ds-text-muted)"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Colored dot preview (collapsed) ────────────────────────────────────── */
const DOT_COLORS = {
  trigger: 'var(--ds-yellow)',
  tool:    'var(--ds-accent)',
  output:  'var(--ds-green)',
};

function SlotDots({ workflow }) {
  const dots = [];
  (workflow.triggers || []).forEach((_, i) =>
    dots.push({ key: `t${i}`, color: DOT_COLORS.trigger })
  );
  (workflow.tools || []).forEach((_, i) =>
    dots.push({ key: `w${i}`, color: DOT_COLORS.tool })
  );
  (workflow.outputs || []).forEach((_, i) =>
    dots.push({ key: `o${i}`, color: DOT_COLORS.output })
  );

  if (dots.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {dots.map(dot => (
        <div
          key={dot.key}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: dot.color,
            opacity: 0.7,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

/* ── WorkflowCard ────────────────────────────────────────────────────────── */
function WorkflowCard({
  workflow,
  expanded,
  onToggleExpand,
  onToggleWorkflow,
  onSlotToggle,
}) {
  const isSoon = workflow.status === 'soon';
  const isLocked = workflow.mode === 'locked';
  const isOff = workflow.mode === 'off';
  const isOn = !isOff && !isSoon;
  const canExpand = !isSoon && !isOff;

  const cardOpacity = isSoon ? 0.35 : isOff ? 0.5 : 1;

  const handleCardClick = () => {
    if (canExpand) onToggleExpand?.();
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    if (isLocked || isSoon) return;
    onToggleWorkflow?.(isOn ? 'off' : 'on');
  };

  return (
    <div
      style={{
        borderRadius: '10px',
        background: 'var(--ds-hover-tint)',
        border: '1px solid var(--ds-border-subtle)',
        opacity: cardOpacity,
        transition: 'opacity 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* ── Header row (always visible) ─────────────────────────────────── */}
      <div
        onClick={handleCardClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 11px',
          cursor: canExpand ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Label + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--ds-text-primary)',
              lineHeight: 1.3,
            }}>
              {workflow.label || workflow.name}
            </span>
            {isLocked && <LockIcon />}
            {isSoon && (
              <span style={{
                fontSize: '8px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ds-text-muted)',
                background: 'var(--ds-bg-overlay)',
                borderRadius: '4px',
                padding: '1px 5px',
              }}>
                Soon
              </span>
            )}
          </div>
          {workflow.description && (
            <div style={{
              fontSize: '11px',
              color: 'var(--ds-text-muted)',
              marginTop: '1px',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: expanded ? 'normal' : 'nowrap',
            }}>
              {workflow.description}
            </div>
          )}
        </div>

        {/* Right side: dots preview (collapsed) or toggle (expanded) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {!expanded && !isSoon && (
            <SlotDots workflow={workflow} />
          )}
          {!isSoon && (
            isLocked
              ? <LockIcon />
              : (
                expanded
                  ? <Toggle on={isOn} onChange={handleToggle} />
                  : null
              )
          )}
          {canExpand && <Chevron expanded={expanded} />}
        </div>
      </div>

      {/* ── Expanded slot sections ───────────────────────────────────────── */}
      {expanded && (
        <div style={{
          padding: '0 11px 11px 11px',
          borderTop: '1px solid var(--ds-border-subtle)',
          paddingTop: '10px',
        }}>
          <SlotChips
            category="trigger"
            slots={workflow.triggers || []}
            onSlotToggle={(ref, newMode) => onSlotToggle?.(ref, newMode)}
          />
          <SlotChips
            category="tool"
            slots={workflow.tools || []}
            onSlotToggle={(ref, newMode) => onSlotToggle?.(ref, newMode)}
          />
          <SlotChips
            category="output"
            slots={workflow.outputs || []}
            onSlotToggle={(ref, newMode) => onSlotToggle?.(ref, newMode)}
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(WorkflowCard);
