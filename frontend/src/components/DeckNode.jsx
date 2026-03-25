import React, { useState } from 'react';

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      style={{
        transition: 'transform 0.18s',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        display: 'block',
      }}
    >
      <path
        d="M3 2L7 5L3 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatsInline({ dueNew, dueLearn, dueReview }) {
  const parts = [];

  if (dueNew) {
    parts.push(
      <span
        key="new"
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--ds-stat-new)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {dueNew}
      </span>
    );
  }

  if (dueLearn) {
    parts.push(
      <span
        key="learn"
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--ds-stat-learning)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {dueLearn}
      </span>
    );
  }

  if (dueReview) {
    parts.push(
      <span
        key="review"
        style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--ds-stat-review)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {dueReview}
      </span>
    );
  }

  if (parts.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      {parts}
    </div>
  );
}

export function DeckNode({ node, depth = 0, isExpanded, onToggle, onStudy, onSelect, index = 0 }) {
  const { id, display, dueNew, dueLearn, dueReview, children } = node;
  const hasChildren = Array.isArray(children) && children.length > 0;
  const expanded = isExpanded(id);

  const [nameHovered, setNameHovered] = useState(false);
  const [rowHovered, setRowHovered] = useState(false);

  const handleRowClick = () => {
    if (hasChildren) {
      onToggle(id);
    } else {
      onSelect(id);
    }
  };

  const handleNameClick = (e) => {
    if (hasChildren) {
      e.stopPropagation();
      onSelect(id);
    }
  };

  const animationDelay = `${index * 0.04}s`;

  if (depth === 0) {
    // Top-level card
    return (
      <div
        style={{
          marginBottom: '14px',
          borderRadius: '14px',
          overflow: 'hidden',
          background: 'var(--ds-bg-canvas)',
          border: '1px solid var(--ds-border-subtle)',
          animationDelay,
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 14px',
            cursor: 'pointer',
            userSelect: 'none',
            background: rowHovered ? 'var(--ds-hover-tint)' : 'transparent',
            transition: 'background 0.12s',
          }}
          onMouseEnter={() => setRowHovered(true)}
          onMouseLeave={() => setRowHovered(false)}
          onClick={handleRowClick}
        >
          {hasChildren ? (
            <span
              style={{
                flexShrink: 0,
                width: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ds-text-muted)',
              }}
            >
              <ChevronIcon expanded={expanded} />
            </span>
          ) : null}

          <span
            style={{
              flex: 1,
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '-0.15px',
              color: nameHovered ? 'var(--ds-text-primary)' : 'var(--ds-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              cursor: 'pointer',
              transition: 'color 0.12s',
              opacity: nameHovered ? 1 : undefined,
              filter: nameHovered ? 'brightness(1.3)' : undefined,
            }}
            onMouseEnter={() => setNameHovered(true)}
            onMouseLeave={() => setNameHovered(false)}
            onClick={handleNameClick}
          >
            {display}
          </span>

          <StatsInline dueNew={dueNew} dueLearn={dueLearn} dueReview={dueReview} />
        </div>

        {/* Children section */}
        {hasChildren && expanded && (
          <div style={{ borderTop: '1px solid var(--ds-border-subtle)' }}>
            {children.map((child, i) => (
              <DeckNode
                key={child.id}
                node={child}
                depth={1}
                isExpanded={isExpanded}
                onToggle={onToggle}
                onStudy={onStudy}
                onSelect={onSelect}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Child row (depth > 0)
  const paddingLeft = 14 + depth * 18;
  const textColor = depth === 1 ? 'var(--ds-text-secondary)' : 'var(--ds-text-tertiary)';
  const textSize = depth === 1 ? '13px' : '12px';
  const textWeight = depth === 1 ? '500' : '400';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '12px',
          cursor: 'pointer',
          userSelect: 'none',
          minHeight: '36px',
          borderBottom: '1px solid var(--ds-border-subtle)',
          background: rowHovered ? 'var(--ds-hover-tint)' : 'transparent',
          transition: 'background 0.12s',
        }}
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => setRowHovered(false)}
        onClick={handleRowClick}
      >
        {hasChildren ? (
          <span
            style={{
              flexShrink: 0,
              width: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ds-text-muted)',
              transition: 'transform 0.18s',
            }}
          >
            <ChevronIcon expanded={expanded} />
          </span>
        ) : (
          <span style={{ flexShrink: 0, width: '16px' }} />
        )}

        {hasChildren ? (
          <span
            style={{
              flex: 1,
              fontSize: textSize,
              fontWeight: textWeight,
              color: nameHovered ? 'var(--ds-text-primary)' : textColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              cursor: 'pointer',
              transition: 'color 0.12s',
            }}
            onMouseEnter={() => setNameHovered(true)}
            onMouseLeave={() => setNameHovered(false)}
            onClick={handleNameClick}
          >
            {display}
          </span>
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: textSize,
              fontWeight: textWeight,
              color: nameHovered ? 'var(--ds-accent)' : textColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              cursor: 'pointer',
              transition: 'color 0.12s',
            }}
            onMouseEnter={() => setNameHovered(true)}
            onMouseLeave={() => setNameHovered(false)}
          >
            {display}
          </span>
        )}

        <StatsInline dueNew={dueNew} dueLearn={dueLearn} dueReview={dueReview} />
      </div>

      {/* Recursive children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child, i) => (
            <DeckNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isExpanded={isExpanded}
              onToggle={onToggle}
              onStudy={onStudy}
              onSelect={onSelect}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
