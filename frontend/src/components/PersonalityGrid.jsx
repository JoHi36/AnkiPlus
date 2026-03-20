import React from 'react';

const PAD = 12;
const RANGE = 276;
const SIZE = 300;

function toSVG(x, y) {
  return {
    dotX: PAD + x * RANGE,
    dotY: PAD + (1 - y) * RANGE,
  };
}

const QUADRANTS = [
  {
    id: 'forscher',
    name: 'Forscher',
    desc: 'Neugierig · Analytisch',
    cx: '25%',
    cy: '25%',
    color: '#5AC8FA',
    labelX: SIZE * 0.25,
    labelY: SIZE * 0.25,
  },
  {
    id: 'begleiter',
    name: 'Begleiter',
    desc: 'Warm · Engagiert',
    cx: '75%',
    cy: '25%',
    color: '#30D158',
    labelX: SIZE * 0.75,
    labelY: SIZE * 0.25,
  },
  {
    id: 'denker',
    name: 'Denker',
    desc: 'Tiefgründig · Ruhig',
    cx: '25%',
    cy: '75%',
    color: '#BF5AF2',
    labelX: SIZE * 0.25,
    labelY: SIZE * 0.75,
  },
  {
    id: 'vertrauter',
    name: 'Vertrauter',
    desc: 'Verlässlich · Nah',
    cx: '75%',
    cy: '75%',
    color: '#FF9F0A',
    labelX: SIZE * 0.75,
    labelY: SIZE * 0.75,
  },
];

const MINOR_GRID = [81, 219];
const CENTER = SIZE / 2;

export default function PersonalityGrid({ position = { x: 0.5, y: 0.5 }, trail = [], quadrant = '', confident = true }) {
  const { dotX, dotY } = toSVG(position.x, position.y);

  const trailPoints = trail.map(({ x, y }) => toSVG(x, y));
  const polylinePoints = trailPoints.map(p => `${p.dotX},${p.dotY}`).join(' ');

  const svgFont = '-apple-system, system-ui, sans-serif';

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ds-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        Persönlichkeit
      </div>

      <div
        style={{
          background: 'var(--ds-bg-canvas)',
          borderRadius: 16,
          padding: 20,
          border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
        }}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
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
            width={SIZE} height={SIZE}
            rx="8"
            fill="var(--ds-bg-canvas, #1C1C1E)"
          />

          {/* Radial gradient fills per quadrant */}
          {QUADRANTS.map(q => (
            <rect
              key={q.id}
              x="0" y="0"
              width={SIZE} height={SIZE}
              rx="8"
              fill={`url(#grad-${q.id})`}
            />
          ))}

          {/* Outer border */}
          <rect
            x={PAD} y={PAD}
            width={RANGE} height={RANGE}
            rx="4"
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />

          {/* Minor grid lines */}
          {MINOR_GRID.map(v => (
            <React.Fragment key={`minor-${v}`}>
              <line x1={v} y1={PAD} x2={v} y2={PAD + RANGE} stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
              <line x1={PAD} y1={v} x2={PAD + RANGE} y2={v} stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
            </React.Fragment>
          ))}

          {/* Center cross */}
          <line x1={CENTER} y1={PAD} x2={CENTER} y2={PAD + RANGE} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1={PAD} y1={CENTER} x2={PAD + RANGE} y2={CENTER} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

          {/* Tick marks */}
          {MINOR_GRID.map(v => (
            <React.Fragment key={`tick-${v}`}>
              {/* Vertical axis ticks */}
              <line x1={CENTER - 3} y1={v} x2={CENTER + 3} y2={v} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
              {/* Horizontal axis ticks */}
              <line x1={v} y1={CENTER - 3} x2={v} y2={CENTER + 3} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            </React.Fragment>
          ))}

          {/* Quadrant labels */}
          {QUADRANTS.map(q => (
            <g key={`label-${q.id}`} opacity="0.28">
              <text
                x={q.labelX}
                y={q.labelY - 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={svgFont}
                fontSize="10"
                fontWeight="600"
                fill="white"
                letterSpacing="0.5"
              >
                {q.name.toUpperCase()}
              </text>
              <text
                x={q.labelX}
                y={q.labelY + 9}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={svgFont}
                fontSize="8.5"
                fill="white"
                opacity="0.7"
              >
                {q.desc}
              </text>
            </g>
          ))}

          {/* Axis labels */}
          <text
            x={CENTER} y={PAD - 1}
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
            x={CENTER} y={PAD + RANGE + 9}
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
            x={PAD - 2}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={svgFont}
            fontSize="8"
            fontWeight="500"
            fill="rgba(255,255,255,0.28)"
            letterSpacing="1"
            transform={`rotate(-90, ${PAD - 2}, ${CENTER})`}
          >
            SACH
          </text>
          <text
            x={PAD + RANGE + 2}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={svgFont}
            fontSize="8"
            fontWeight="500"
            fill="rgba(255,255,255,0.28)"
            letterSpacing="1"
            transform={`rotate(90, ${PAD + RANGE + 2}, ${CENTER})`}
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
                x1={PAD} y1={dotY} x2={PAD + RANGE} y2={dotY}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="0.75"
                strokeDasharray="3 3"
              />
              <line
                x1={dotX} y1={PAD} x2={dotX} y2={PAD + RANGE}
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
                x={CENTER}
                y={CENTER}
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
    </div>
  );
}
