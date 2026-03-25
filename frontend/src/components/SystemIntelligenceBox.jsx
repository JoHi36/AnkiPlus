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
          border: '1.5px solid color-mix(in srgb, var(--ds-yellow) 25%, transparent)',
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
          border: '1.5px solid color-mix(in srgb, var(--ds-yellow) 25%, transparent)',
          background: 'var(--ds-yellow-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--ds-yellow)" strokeWidth="1.4">
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
        background: 'var(--ds-yellow-10)',
        color: 'color-mix(in srgb, var(--ds-yellow) 80%, transparent)',
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
    ? 'color-mix(in srgb, var(--ds-yellow) 12%, transparent)'
    : 'var(--ds-border-subtle)';
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
          background: 'linear-gradient(160deg, color-mix(in srgb, var(--ds-yellow) 25%, transparent), var(--ds-yellow-5) 60%, var(--ds-yellow-10))',
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
            background: 'radial-gradient(ellipse at top right, var(--ds-yellow-10) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Inner card */}
        <div
          style={{
            borderRadius: 11,
            background: 'var(--ds-yellow-5)',
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
              background: 'var(--ds-hover-tint)',
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
