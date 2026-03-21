import React from 'react';

const PAD = 20;
const SIZE_W = 400;
const SIZE_H = 200;
const RANGE_X = 360;
const RANGE_Y = 160;
const CENTER_X = 200;
const CENTER_Y = 100;

function toSVG(x, y) {
  return {
    dotX: PAD + x * RANGE_X,
    dotY: PAD + (1 - y) * RANGE_Y,
  };
}

const QUADRANTS = [
  {
    id: 'forscher',
    cx: '25%',
    cy: '25%',
    color: '#5AC8FA',
  },
  {
    id: 'begleiter',
    cx: '75%',
    cy: '25%',
    color: '#30D158',
  },
  {
    id: 'denker',
    cx: '25%',
    cy: '75%',
    color: '#BF5AF2',
  },
  {
    id: 'vertrauter',
    cx: '75%',
    cy: '75%',
    color: '#FF9F0A',
  },
];

const MINOR_GRID_X = [PAD + RANGE_X * 0.25, PAD + RANGE_X * 0.75];
const MINOR_GRID_Y = [PAD + RANGE_Y * 0.25, PAD + RANGE_Y * 0.75];

export default function PersonalityGrid({ position = { x: 0.5, y: 0.5 }, trail = [], quadrant = '', confident = true }) {
  const { dotX, dotY } = toSVG(position.x, position.y);

  const trailPoints = trail.map(({ x, y }) => toSVG(x, y));
  const polylinePoints = trailPoints.map(p => `${p.dotX},${p.dotY}`).join(' ');

  const svgFont = '-apple-system, system-ui, sans-serif';

  return (
    <div style={{ marginBottom: 0 }}>
      <svg
        viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
        width="100%"
        style={{ display: 'block' }}
        aria-label="Personality grid"
      >
        <defs>
          {QUADRANTS.map(q => (
            <radialGradient
              key={q.id}
              id={`grad-${q.id}`}
              cx={q.cx}
              cy={q.cy}
              r="50%"
              gradientUnits="objectBoundingBox"
            >
              <stop offset="0%" stopColor={q.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={q.color} stopOpacity="0" />
            </radialGradient>
          ))}

          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <style>{`
            @keyframes pg-pulse {
              0%   { r: 10; opacity: 0.35; }
              50%  { r: 20; opacity: 0.08; }
              100% { r: 10; opacity: 0.35; }
            }
            .pg-pulse { animation: pg-pulse 2.2s ease-in-out infinite; }
          `}</style>
        </defs>

        {/* Background */}
        <rect
          x="0" y="0"
          width={SIZE_W} height={SIZE_H}
          rx="8"
          fill="var(--ds-bg-canvas, #1C1C1E)"
        />

        {/* Radial gradient fills per quadrant */}
        {QUADRANTS.map(q => (
          <rect
            key={q.id}
            x="0" y="0"
            width={SIZE_W} height={SIZE_H}
            rx="8"
            fill={`url(#grad-${q.id})`}
          />
        ))}

        {/* Outer border */}
        <rect
          x={PAD} y={PAD}
          width={RANGE_X} height={RANGE_Y}
          rx="4"
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />

        {/* Minor grid lines */}
        {MINOR_GRID_X.map(v => (
          <line key={`minor-x-${v}`} x1={v} y1={PAD} x2={v} y2={PAD + RANGE_Y} stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
        ))}
        {MINOR_GRID_Y.map(v => (
          <line key={`minor-y-${v}`} x1={PAD} y1={v} x2={PAD + RANGE_X} y2={v} stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
        ))}

        {/* Center cross */}
        <line x1={CENTER_X} y1={PAD} x2={CENTER_X} y2={PAD + RANGE_Y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1={PAD} y1={CENTER_Y} x2={PAD + RANGE_X} y2={CENTER_Y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        {/* Tick marks */}
        {MINOR_GRID_X.map(v => (
          <line key={`tick-x-${v}`} x1={v} y1={CENTER_Y - 3} x2={v} y2={CENTER_Y + 3} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        ))}
        {MINOR_GRID_Y.map(v => (
          <line key={`tick-y-${v}`} x1={CENTER_X - 3} y1={v} x2={CENTER_X + 3} y2={v} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        ))}

        {/* Axis labels */}
        <text
          x={CENTER_X} y={PAD - 4}
          textAnchor="middle"
          dominantBaseline="auto"
          fontFamily={svgFont}
          fontSize="8"
          fontWeight="500"
          fill="rgba(255,255,255,0.28)"
          letterSpacing="1"
        >
          AKTIV
        </text>
        <text
          x={CENTER_X} y={PAD + RANGE_Y + 14}
          textAnchor="middle"
          dominantBaseline="hanging"
          fontFamily={svgFont}
          fontSize="8"
          fontWeight="500"
          fill="rgba(255,255,255,0.28)"
          letterSpacing="1"
        >
          REFLEKTIV
        </text>
        <text
          x={PAD - 10}
          y={CENTER_Y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={svgFont}
          fontSize="8"
          fontWeight="500"
          fill="rgba(255,255,255,0.28)"
          letterSpacing="1"
          transform={`rotate(-90, ${PAD - 10}, ${CENTER_Y})`}
        >
          SACH
        </text>
        <text
          x={PAD + RANGE_X + 10}
          y={CENTER_Y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={svgFont}
          fontSize="8"
          fontWeight="500"
          fill="rgba(255,255,255,0.28)"
          letterSpacing="1"
          transform={`rotate(90, ${PAD + RANGE_X + 10}, ${CENTER_Y})`}
        >
          MENSCH
        </text>

        {/* Drift trail */}
        {trailPoints.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
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
        {confident ? (
          <g>
            {/* Dashed crosshairs */}
            <line
              x1={PAD} y1={dotY} x2={PAD + RANGE_X} y2={dotY}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="0.75"
              strokeDasharray="3 3"
            />
            <line
              x1={dotX} y1={PAD} x2={dotX} y2={PAD + RANGE_Y}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="0.75"
              strokeDasharray="3 3"
            />

            {/* Pulse glow ring */}
            <circle
              cx={dotX}
              cy={dotY}
              r="10"
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
              className="pg-pulse"
            />

            {/* White dot with glow */}
            <circle
              cx={dotX}
              cy={dotY}
              r="5"
              fill="white"
              filter="url(#glow)"
            />
          </g>
        ) : (
          <g>
            {/* Reduced opacity dot */}
            <circle
              cx={dotX}
              cy={dotY}
              r="5"
              fill="white"
              opacity="0.35"
            />

            {/* "Noch zu wenig Daten" label */}
            <text
              x={CENTER_X}
              y={CENTER_Y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={svgFont}
              fontSize="10"
              fill="rgba(255,255,255,0.4)"
              fontStyle="italic"
            >
              Noch zu wenig Daten
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
