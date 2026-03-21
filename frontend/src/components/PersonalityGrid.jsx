import React from 'react';

const PAD_X = 40;
const PAD_Y = 16;
const RANGE_X = 400;
const RANGE_Y = 128;
const SIZE_W = 480;
const SIZE_H = 160;
const CENTER_X = PAD_X + RANGE_X / 2;
const CENTER_Y = PAD_Y + RANGE_Y / 2;

function toSVG(x, y) {
  return {
    dotX: PAD_X + x * RANGE_X,
    dotY: PAD_Y + (1 - y) * RANGE_Y,
  };
}

// 8 vertical lines evenly spaced
const GRID_V = Array.from({ length: 8 }, (_, i) => PAD_X + RANGE_X * ((i + 1) / 9));
// 4 horizontal lines evenly spaced
const GRID_H = Array.from({ length: 4 }, (_, i) => PAD_Y + RANGE_Y * ((i + 1) / 5));

const svgFont = '-apple-system, system-ui, sans-serif';

export default function PersonalityGrid({ position = { x: 0.5, y: 0.5 }, trail = [], quadrant = '', confident = true }) {
  const { dotX, dotY } = toSVG(position.x, position.y);

  const trailPoints = trail.map(({ x, y }) => toSVG(x, y));
  const polylinePoints = trailPoints.map(p => `${p.dotX},${p.dotY}`).join(' ');

  // Coordinate label values
  const energyVal = (position.y * 9 + 1).toFixed(1);
  const orientVal = position.x.toFixed(1);

  return (
    <div>
      <svg
        viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
        width="100%"
        style={{ display: 'block' }}
        aria-label="Personality grid"
      >
        {/* Background */}
        <rect
          x="0" y="0"
          width={SIZE_W} height={SIZE_H}
          fill="var(--ds-bg-canvas, #1C1C1E)"
        />

        {/* Outer border */}
        <rect
          x={PAD_X} y={PAD_Y}
          width={RANGE_X} height={RANGE_Y}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />

        {/* Fine grid lines — vertical */}
        {GRID_V.map(v => (
          <line key={`gv-${v}`} x1={v} y1={PAD_Y} x2={v} y2={PAD_Y + RANGE_Y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        ))}
        {/* Fine grid lines — horizontal */}
        {GRID_H.map(v => (
          <line key={`gh-${v}`} x1={PAD_X} y1={v} x2={PAD_X + RANGE_X} y2={v} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        ))}

        {/* Center cross */}
        <line x1={CENTER_X} y1={PAD_Y} x2={CENTER_X} y2={PAD_Y + RANGE_Y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1={PAD_X} y1={CENTER_Y} x2={PAD_X + RANGE_X} y2={CENTER_Y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

        {/* Y-axis coordinate numbers */}
        <text x={PAD_X - 8} y={PAD_Y} textAnchor="end" dominantBaseline="middle" fontFamily={svgFont} fontSize="7" fill="rgba(255,255,255,0.2)">10</text>
        <text x={PAD_X - 8} y={CENTER_Y} textAnchor="end" dominantBaseline="middle" fontFamily={svgFont} fontSize="7" fill="rgba(255,255,255,0.2)">5</text>
        <text x={PAD_X - 8} y={PAD_Y + RANGE_Y} textAnchor="end" dominantBaseline="middle" fontFamily={svgFont} fontSize="7" fill="rgba(255,255,255,0.2)">0</text>

        {/* X-axis coordinate numbers */}
        <text x={PAD_X} y={PAD_Y + RANGE_Y + 9} textAnchor="middle" dominantBaseline="auto" fontFamily={svgFont} fontSize="7" fill="rgba(255,255,255,0.2)">0.0</text>
        <text x={PAD_X + RANGE_X} y={PAD_Y + RANGE_Y + 9} textAnchor="middle" dominantBaseline="auto" fontFamily={svgFont} fontSize="7" fill="rgba(255,255,255,0.2)">1.0</text>

        {/* Axis labels */}
        <text x={CENTER_X} y={PAD_Y - 4} textAnchor="middle" dominantBaseline="auto" fontFamily={svgFont} fontSize="7" fontWeight="500" fill="rgba(255,255,255,0.28)" letterSpacing="1">AKTIV</text>
        <text x={CENTER_X} y={PAD_Y + RANGE_Y + 10} textAnchor="middle" dominantBaseline="hanging" fontFamily={svgFont} fontSize="7" fontWeight="500" fill="rgba(255,255,255,0.28)" letterSpacing="1">REFLEKTIV</text>
        <text
          x={PAD_X - 14} y={CENTER_Y}
          textAnchor="middle" dominantBaseline="middle"
          fontFamily={svgFont} fontSize="7" fontWeight="500"
          fill="rgba(255,255,255,0.28)" letterSpacing="1"
          transform={`rotate(-90, ${PAD_X - 14}, ${CENTER_Y})`}
        >SACH</text>
        <text
          x={PAD_X + RANGE_X + 14} y={CENTER_Y}
          textAnchor="middle" dominantBaseline="middle"
          fontFamily={svgFont} fontSize="7" fontWeight="500"
          fill="rgba(255,255,255,0.28)" letterSpacing="1"
          transform={`rotate(90, ${PAD_X + RANGE_X + 14}, ${CENTER_Y})`}
        >MENSCH</text>

        {/* Drift trail */}
        {trailPoints.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {trailPoints.map((p, i) => {
          const opacity = 0.08 + (i / Math.max(trailPoints.length - 1, 1)) * 0.3;
          return (
            <circle
              key={`trail-${i}`}
              cx={p.dotX}
              cy={p.dotY}
              r="2.5"
              fill="white"
              opacity={opacity}
            />
          );
        })}

        {/* Current position */}
        <g opacity={confident ? 1 : 0.35}>
          {/* Solid white dot */}
          <circle cx={dotX} cy={dotY} r="4" fill="white" />
          {/* Thin ring */}
          <circle cx={dotX} cy={dotY} r="7" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        </g>

        {/* Coordinate label when confident */}
        {confident && (
          <text
            x={dotX + 10} y={dotY - 6}
            fontFamily={svgFont} fontSize="7"
            fill="rgba(255,255,255,0.45)"
          >
            {energyVal} &middot; {orientVal}
          </text>
        )}
      </svg>
    </div>
  );
}
