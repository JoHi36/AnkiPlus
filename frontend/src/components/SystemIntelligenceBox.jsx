import React, { useState } from 'react';

/* ── Keyframe injection for pulse ring animation ── */
const KEYFRAMES = `
@keyframes nodeRing {
  0%, 100% { opacity: 0; transform: scale(1); }
  50%       { opacity: 1; transform: scale(1.3); }
}
`;

function InjectKeyframes() {
  return <style>{KEYFRAMES}</style>;
}

/* ── Concentric-circles node icon ── */
function NodeIcon() {
  return (
    <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
      {/* Pulse ring — absolutely positioned behind the main circle */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '1.5px solid rgba(255,214,10,0.25)',
          animation: 'nodeRing 4s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      {/* Main circle */}
      <div
        style={{
          position: 'relative',
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: '1.5px solid rgba(255,214,10,0.25)',
          background: 'rgba(255,214,10,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFD60A" strokeWidth="1.4">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="7" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="10.5" strokeDasharray="2 4" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}

/* ── PRO badge ── */
function ProBadge() {
  return (
    <span
      style={{
        fontSize: 8,
        fontWeight: 700,
        background: 'rgba(255,214,10,0.15)',
        color: 'rgba(255,214,10,0.8)',
        padding: '1px 5px',
        borderRadius: 3,
        lineHeight: 1,
        letterSpacing: '0.04em',
      }}
    >
      PRO
    </span>
  );
}

/* ── Segmented control button ── */
function SegmentButton({ label, subtitle, isActive, isDeep, onClick }) {
  const activeBackground = isDeep
    ? 'rgba(255,214,10,0.12)'
    : 'rgba(255,255,255,0.08)';
  const activeColor = isDeep ? 'var(--ds-yellow)' : 'var(--ds-text-primary)';

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 8px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        background: isActive ? activeBackground : 'transparent',
        color: isActive ? activeColor : 'var(--ds-text-muted)',
        transition: 'background 0.18s, color 0.18s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {label}
        {isDeep && <ProBadge />}
      </div>
      <div
        style={{
          fontSize: 9,
          opacity: 0.6,
          lineHeight: 1,
          fontWeight: 400,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}

/* ── Main component ── */
export default function SystemIntelligenceBox({ bridge, initialQuality = 'standard' }) {
  const [quality, setQuality] = useState(initialQuality);

  const handleQualityChange = (newQuality) => {
    if (newQuality === quality) return;
    setQuality(newQuality);
    window.ankiBridge?.addMessage('saveSystemQuality', { quality: newQuality });
  };

  return (
    <>
      <InjectKeyframes />
      {/* Outer wrapper — provides golden gradient border via 1px padding */}
      <div
        style={{
          borderRadius: 12,
          padding: 1,
          background: 'linear-gradient(160deg, rgba(255,214,10,0.25), rgba(255,214,10,0.03) 60%, rgba(255,214,10,0.15))',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle glow in top-right corner */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 80,
            height: 60,
            background: 'radial-gradient(ellipse at top right, rgba(255,214,10,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Inner card */}
        <div
          style={{
            borderRadius: 11,
            background: 'rgba(255,214,10,0.015)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NodeIcon />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ds-text-primary)',
                  lineHeight: 1,
                }}
              >
                System-Intelligenz
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--ds-text-muted)',
                  lineHeight: 1,
                }}
              >
                Routing, Analyse &amp; Modellwahl
              </span>
            </div>
          </div>

          {/* Segmented control */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            <SegmentButton
              label="Standard"
              subtitle="Schnell & effizient"
              isActive={quality === 'standard'}
              isDeep={false}
              onClick={() => handleQualityChange('standard')}
            />
            <SegmentButton
              label="Deep"
              subtitle="Tiefere Analyse"
              isActive={quality === 'deep'}
              isDeep={true}
              onClick={() => handleQualityChange('deep')}
            />
          </div>
        </div>
      </div>
    </>
  );
}
