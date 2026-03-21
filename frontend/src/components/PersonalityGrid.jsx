import React from 'react';

const PAD_X = 40;
const PAD_Y = 10;
const RANGE_X = 420;
const RANGE_Y = 80;
const SIZE_W = 500;
const SIZE_H = 100;
const CENTER_X = PAD_X + RANGE_X / 2;
const CENTER_Y = PAD_Y + RANGE_Y / 2;

function toSVG(x, y) {
  return {
    dotX: PAD_X + x * RANGE_X,
    dotY: PAD_Y + (1 - y) * RANGE_Y,
  };
}

// 4 vertical lines evenly spaced
const GRID_V = Array.from({ length: 4 }, (_, i) => PAD_X + RANGE_X * ((i + 1) / 5));

const svgFont = '-apple-system, system-ui, sans-serif';

export default function PersonalityGrid({ position = { x: 0.5, y: 0.5 }, trail = [], quadrant = '', confident = true }) {
  const { dotX, dotY } = toSVG(position.x, position.y);

  const trailPoints = trail.map(({ x, y }) => toSVG(x, y));
  const polylinePoints = trailPoints.map(p => `${p.dotX},${p.dotY}`).join(' ');

  // Coordinate label values
  const energyVal = (position.y * 9 + 1).toFixed(1);
  const orientVal = position.x.toFixed(1);

  return (
      <svg
        viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
        style={{ width: '100%', display: 'block' }}
        aria-label="Personality grid"
      >
        {/* Outer border */}
        <rect
          x={PAD_X} y={PAD_Y}
          width={RANGE_X} height={RANGE_Y}
          fill="none"
          stroke="var(--ds-border, rgba(255,255,255,0.06))"
          strokeWidth="1"
        />

        {/* Fine grid lines — vertical */}
        {GRID_V.map(v => (
          <line key={`gv-${v}`} x1={v} y1={PAD_Y} x2={v} y2={PAD_Y + RANGE_Y} stroke="var(--ds-border, rgba(255,255,255,0.03))" strokeWidth="1" />
        ))}
        {/* Center horizontal line */}
        <line x1={PAD_X} y1={CENTER_Y} x2={PAD_X + RANGE_X} y2={CENTER_Y} stroke="var(--ds-border, rgba(255,255,255,0.06))" strokeWidth="1" />

        {/* Y-axis coordinate numbers */}
        <text x={PAD_X - 8} y={PAD_Y} textAnchor="end" dominantBaseline="middle" fontFamily={svgFont} fontSize="6" fill="var(--ds-text-quaternary, rgba(255,255,255,0.2))">10</text>
        <text x={PAD_X - 8} y={CENTER_Y} textAnchor="end" dominantBaseline="middle" fontFamily={svgFont} fontSize="6" fill="var(--ds-text-quaternary, rgba(255,255,255,0.2))">5</text>
        <text x={PAD_X - 8} y={PAD_Y + RANGE_Y} textAnchor="end" dominantBaseline="middle" fontFamily={svgFont} fontSize="6" fill="var(--ds-text-quaternary, rgba(255,255,255,0.2))">0</text>

        {/* X-axis coordinate numbers */}
        <text x={PAD_X} y={PAD_Y + RANGE_Y + 8} textAnchor="middle" dominantBaseline="auto" fontFamily={svgFont} fontSize="6" fill="var(--ds-text-quaternary, rgba(255,255,255,0.2))">0.0</text>
        <text x={PAD_X + RANGE_X} y={PAD_Y + RANGE_Y + 8} textAnchor="middle" dominantBaseline="auto" fontFamily={svgFont} fontSize="6" fill="var(--ds-text-quaternary, rgba(255,255,255,0.2))">1.0</text>

        {/* Axis labels */}
        <text x={CENTER_X} y={PAD_Y - 3} textAnchor="middle" dominantBaseline="auto" fontFamily={svgFont} fontSize="6" fontWeight="500" fill="var(--ds-text-quaternary, rgba(255,255,255,0.25))" letterSpacing="1">AKTIV</text>
        <text x={CENTER_X} y={PAD_Y + RANGE_Y + 9} textAnchor="middle" dominantBaseline="hanging" fontFamily={svgFont} fontSize="6" fontWeight="500" fill="var(--ds-text-quaternary, rgba(255,255,255,0.25))" letterSpacing="1">REFLEKTIV</text>
        <text
          x={PAD_X - 14} y={CENTER_Y}
          textAnchor="middle" dominantBaseline="middle"
          fontFamily={svgFont} fontSize="6" fontWeight="500"
          fill="var(--ds-text-quaternary, rgba(255,255,255,0.25))" letterSpacing="1"
          transform={`rotate(-90, ${PAD_X - 14}, ${CENTER_Y})`}
        >SACH</text>
        <text
          x={PAD_X + RANGE_X + 14} y={CENTER_Y}
          textAnchor="middle" dominantBaseline="middle"
          fontFamily={svgFont} fontSize="6" fontWeight="500"
          fill="var(--ds-text-quaternary, rgba(255,255,255,0.25))" letterSpacing="1"
          transform={`rotate(90, ${PAD_X + RANGE_X + 14}, ${CENTER_Y})`}
        >MENSCH</text>

        {/* Drift trail */}
        {trailPoints.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--ds-accent, #0A84FF)"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.4"
          />
        )}
        {trailPoints.map((p, i) => {
          const opacity = 0.15 + (i / Math.max(trailPoints.length - 1, 1)) * 0.5;
          return (
            <circle
              key={`trail-${i}`}
              cx={p.dotX}
              cy={p.dotY}
              r="1.5"
              fill="var(--ds-accent, #0A84FF)"
              opacity={opacity}
            />
          );
        })}

        {/* Current position */}
        <g opacity={confident ? 1 : 0.35}>
          {/* Solid dot */}
          <circle cx={dotX} cy={dotY} r="3" fill="var(--ds-text-primary, #fff)" />
          {/* Thin ring */}
          <circle cx={dotX} cy={dotY} r="5" fill="none" stroke="var(--ds-text-tertiary)" strokeWidth="0.5" />
        </g>

        {/* Coordinate label when confident */}
        {confident && (
          <text
            x={dotX + 8} y={dotY - 5}
            fontFamily={svgFont} fontSize="6"
            fill="var(--ds-text-quaternary)"
          >
            {energyVal} &middot; {orientVal}
          </text>
        )}
      </svg>
  );
}
