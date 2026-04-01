import React from 'react';

// Grid area: axis labels sit outside, grid border aligns with text edges
const PX = 16, PY = 10, RX = 328, RY = 62;
const CX = PX + RX / 2, CY = PY + RY / 2;

function toSVG(x, y) {
  return { sx: PX + x * RX, sy: PY + (1 - y) * RY };
}

export default function PersonalityGrid({ position = { x: 0.5, y: 0.5 }, trail = [], confident = false }) {
  const { sx, sy } = toSVG(position.x, position.y);
  const trailPts = trail.map(t => toSVG(t.x, t.y));
  const energy = (position.y * 9 + 1).toFixed(1);
  const orient = position.x.toFixed(2);

  // Use currentColor trick: set color via CSS var on parent, SVG inherits
  // Grid lines use explicit colors with fallbacks for both themes
  const lineColor = 'var(--ds-border-medium)';
  const lineMinor = 'var(--ds-border-subtle)';
  const labelColor = 'var(--ds-text-muted)';
  const dotColor = 'currentColor'; // inherits from parent's color

  return (
    <svg viewBox="0 0 360 96" style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="pgTL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pgTR" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ds-green)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--ds-green)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pgBL" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--ds-purple)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--ds-purple)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pgBR" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--ds-yellow)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--ds-yellow)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Quadrant tints */}
      <rect x={PX} y={PY} width={RX/2} height={RY/2} rx="2" fill="url(#pgTL)" />
      <rect x={CX} y={PY} width={RX/2} height={RY/2} rx="2" fill="url(#pgTR)" />
      <rect x={PX} y={CY} width={RX/2} height={RY/2} rx="2" fill="url(#pgBL)" />
      <rect x={CX} y={CY} width={RX/2} height={RY/2} rx="2" fill="url(#pgBR)" />

      {/* Border */}
      <rect x={PX} y={PY} width={RX} height={RY} rx="3" fill="none"
        stroke={lineColor} strokeWidth="0.5" />

      {/* Center cross */}
      <line x1={CX} y1={PY} x2={CX} y2={PY+RY} stroke={lineColor} strokeWidth="0.5" />
      <line x1={PX} y1={CY} x2={PX+RX} y2={CY} stroke={lineColor} strokeWidth="0.5" />

      {/* Minor grid — 8 vertical, 4 horizontal */}
      {[0.125, 0.25, 0.375, 0.625, 0.75, 0.875].map(f => (
        <line key={`v${f}`} x1={PX + RX*f} y1={PY} x2={PX + RX*f} y2={PY+RY}
          stroke={lineMinor} strokeWidth="0.5" />
      ))}
      {[0.25, 0.75].map(f => (
        <line key={`h${f}`} x1={PX} y1={PY + RY*f} x2={PX+RX} y2={PY + RY*f}
          stroke={lineMinor} strokeWidth="0.5" />
      ))}

      {/* Axis labels */}
      <text x={CX} y={PY - 4} textAnchor="middle" fontSize="5" fill={labelColor}
        letterSpacing="1" fontFamily="-apple-system,system-ui">AKTIV</text>
      <text x={CX} y={PY + RY + 10} textAnchor="middle" fontSize="5" fill={labelColor}
        letterSpacing="1" fontFamily="-apple-system,system-ui">REFLEKTIV</text>
      <text x={PX - 5} y={CY} textAnchor="middle" fontSize="5" fill={labelColor}
        letterSpacing="1" fontFamily="-apple-system,system-ui"
        transform={`rotate(-90,${PX - 5},${CY})`}>SACH</text>
      <text x={PX + RX + 5} y={CY} textAnchor="middle" fontSize="5" fill={labelColor}
        letterSpacing="1" fontFamily="-apple-system,system-ui"
        transform={`rotate(90,${PX + RX + 5},${CY})`}>MENSCH</text>

      {/* Trail */}
      {trailPts.length > 1 && (
        <polyline
          points={trailPts.map(p => `${p.sx},${p.sy}`).join(' ')}
          fill="none" stroke="var(--ds-accent)" strokeWidth="0.7"
          opacity="0.2" strokeLinecap="round" />
      )}
      {trailPts.map((p, i) => i > 0 && (
        <circle key={i} cx={p.sx} cy={p.sy} r="1.2"
          fill="var(--ds-accent)"
          opacity={0.1 + (1 - i / trailPts.length) * 0.3} />
      ))}

      {/* Current dot */}
      <circle cx={sx} cy={sy} r="5" fill="none"
        stroke="var(--ds-border-medium)" strokeWidth="0.5" />
      <circle cx={sx} cy={sy} r="2.5"
        fill="var(--ds-text-muted)" opacity={confident ? 0.85 : 0.35} />

      {/* Coordinate label at the dot */}
      <text x={sx + 9} y={sy - 4} fontSize="5.5"
        fill="var(--ds-text-muted)"
        fontFamily="-apple-system,system-ui"
        fontVariantNumeric="tabular-nums">{energy} · {orient}</text>
    </svg>
  );
}
