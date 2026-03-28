import React from 'react';

/**
 * CitationRef — Unified inline citation badge.
 * Part of the design system. Used everywhere citations appear:
 * chat messages, term popups, search sidebar, research content.
 *
 * Two variants:
 *   'card' (blue)  — references an Anki card [1], [2]
 *   'web'  (green) — references a web source [1], [2]
 *
 * Props:
 *   index     — The citation number (displayed inside the badge)
 *   variant   — 'card' | 'web' (default: 'card')
 *   onClick   — Click handler (e.g. open card preview or URL)
 *   title     — Tooltip text (e.g. card question or URL)
 *   size      — 'sm' (14px, for inline text) | 'md' (18px, for standalone) (default: 'sm')
 */

const VARIANTS = {
  card: {
    bg: 'var(--ds-accent-10)',
    color: 'var(--ds-accent)',
    hoverBg: 'var(--ds-accent-20)',
  },
  web: {
    bg: 'var(--ds-green-10, color-mix(in srgb, var(--ds-green) 10%, transparent))',
    color: 'var(--ds-green)',
    hoverBg: 'var(--ds-green-20, color-mix(in srgb, var(--ds-green) 20%, transparent))',
  },
};

const SIZES = {
  sm: { width: 16, height: 16, fontSize: 9, radius: 4 },
  md: { width: 20, height: 20, fontSize: 10, radius: 5 },
};

export default function CitationRef({
  index,
  variant = 'card',
  onClick,
  title,
  size = 'sm',
}) {
  const v = VARIANTS[variant] || VARIANTS.card;
  const s = SIZES[size] || SIZES.sm;

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      title={title}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: s.width,
        height: s.height,
        borderRadius: s.radius,
        background: v.bg,
        color: v.color,
        fontSize: s.fontSize,
        fontWeight: 700,
        fontFamily: 'var(--ds-font-sans)',
        cursor: onClick ? 'pointer' : 'default',
        verticalAlign: 'super',
        margin: '0 1px',
        lineHeight: 1,
        userSelect: 'none',
        transition: 'background 0.12s',
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.background = v.hoverBg; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.background = v.bg; } : undefined}
    >
      {index}
    </span>
  );
}
