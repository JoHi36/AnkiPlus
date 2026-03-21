import React from 'react';

const PX = 24, PY = 8, RX = 312, RY = 72;
const CX = PX + RX / 2, CY = PY + RY / 2;

function toSVG(x, y) {
  return { sx: PX + x * RX, sy: PY + (1 - y) * RY };
}

export default function PersonalityGrid({ position = { x: 0.5, y: 0.5 }, trail = [], confident = false }) {
  const { sx, sy } = toSVG(position.x, position.y);
  const trailPts = trail.map(t => toSVG(t.x, t.y));
  const energy = (position.y * 9 + 1).toFixed(1);
  const orient = position.x.toFixed(2);

  return (
    <svg viewBox="0 0 360 90" style={{ width: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="pgTL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5AC8FA" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#5AC8FA" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pgTR" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#30D158" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#30D158" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pgBL" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#BF5AF2" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#BF5AF2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pgBR" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FF9F0A" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#FF9F0A" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Quadrant tints */}
      <rect x={PX} y={PY} width={RX/2} height={RY/2} rx="2" fill="url(#pgTL)" />
      <rect x={CX} y={PY} width={RX/2} height={RY/2} rx="2" fill="url(#pgTR)" />
      <rect x={PX} y={CY} width={RX/2} height={RY/2} rx="2" fill="url(#pgBL)" />
      <rect x={CX} y={CY} width={RX/2} height={RY/2} rx="2" fill="url(#pgBR)" />

      {/* Border + center cross */}
      <rect x={PX} y={PY} width={RX} height={RY} rx="3" fill="none"
        stroke="var(--ds-border)" strokeWidth="0.5" />
      <line x1={CX} y1={PY} x2={CX} y2={PY+RY}
        stroke="var(--ds-border)" strokeWidth="0.5" />
      <line x1={PX} y1={CY} x2={PX+RX} y2={CY}
        stroke="var(--ds-border)" strokeWidth="0.5" />

      {/* Minor grid */}
      {[PX + RX*0.25, PX + RX*0.75].map(v => (
        <line key={`v${v}`} x1={v} y1={PY} x2={v} y2={PY+RY}
          stroke="var(--ds-border)" strokeWidth="0.5" opacity="0.4" />
      ))}
      {[PY + RY*0.25, PY + RY*0.75].map(v => (
        <line key={`h${v}`} x1={PX} y1={v} x2={PX+RX} y2={v}
          stroke="var(--ds-border)" strokeWidth="0.5" opacity="0.4" />
      ))}

      {/* Axis labels */}
      <text x={CX} y={PY-1} textAnchor="middle" fontSize="5" fill="var(--ds-text-quaternary)"
        letterSpacing="0.8" fontFamily="-apple-system,system-ui">AKTIV</text>
      <text x={CX} y={PY+RY+7} textAnchor="middle" fontSize="5" fill="var(--ds-text-quaternary)"
        letterSpacing="0.8" fontFamily="-apple-system,system-ui">REFLEKTIV</text>
      <text x={PX-4} y={CY} textAnchor="middle" fontSize="5" fill="var(--ds-text-quaternary)"
        letterSpacing="0.8" fontFamily="-apple-system,system-ui" transform={`rotate(-90,${PX-4},${CY})`}>SACH</text>
      <text x={PX+RX+4} y={CY} textAnchor="middle" fontSize="5" fill="var(--ds-text-quaternary)"
        letterSpacing="0.8" fontFamily="-apple-system,system-ui" transform={`rotate(90,${PX+RX+4},${CY})`}>MENSCH</text>

      {/* Trail */}
      {trailPts.length > 1 && (
        <polyline
          points={trailPts.map(p => `${p.sx},${p.sy}`).join(' ')}
          fill="none" stroke="var(--ds-accent, #0A84FF)" strokeWidth="0.7"
          opacity="0.18" strokeLinecap="round" />
      )}
      {trailPts.map((p, i) => i > 0 && (
        <circle key={i} cx={p.sx} cy={p.sy} r="1.2"
          fill="var(--ds-accent, #0A84FF)"
          opacity={0.08 + (1 - i / trailPts.length) * 0.25} />
      ))}

      {/* Current dot */}
      <circle cx={sx} cy={sy} r="5" fill="none"
        stroke="var(--ds-text-tertiary)" strokeWidth="0.5" />
      <circle cx={sx} cy={sy} r="2.5"
        fill="var(--ds-text-primary)" opacity={confident ? 0.85 : 0.35} />

      {/* Coordinate label */}
      {confident && (
        <text x={sx + 8} y={sy - 1} fontSize="6.5"
          fill="var(--ds-text-quaternary)"
          fontFamily="-apple-system,system-ui">{energy} · {orient}</text>
      )}
    </svg>
  );
}
