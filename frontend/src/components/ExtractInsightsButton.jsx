import React, { useState, useEffect } from 'react';

const KEYFRAMES = `
@keyframes ei-sparkle-float {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  15% { transform: scale(1) rotate(45deg); opacity: 1; }
  50% { transform: scale(0.8) rotate(90deg); opacity: 0.6; }
  100% { transform: scale(0) rotate(180deg); opacity: 0; }
}
@keyframes ei-shimmer-sweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes ei-scan {
  0% { left: -40%; }
  100% { left: 100%; }
}
@keyframes ei-star-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
@keyframes ei-glow-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
`;

function SparklesIcon({ color = 'rgba(232,232,232,0.15)', size = 12, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}

export default function ExtractInsightsButton({ onExtract, messageCount = 0 }) {
  const [state, setState] = useState('idle');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ei-keyframes')) {
      const s = document.createElement('style');
      s.id = 'ei-keyframes';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
    }
  }, []);

  if (messageCount < 3 || state === 'done') return null;

  const handleClick = () => {
    if (state === 'extracting') return;
    setState('extracting');
    onExtract?.(() => setState('done'));
  };

  const isExtracting = state === 'extracting';
  const iconColor = isExtracting || isHovered
    ? 'rgba(10,132,255,0.45)'
    : 'rgba(232,232,232,0.15)';
  const textColor = isExtracting || isHovered
    ? 'rgba(10,132,255,0.4)'
    : 'rgba(232,232,232,0.15)';

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => { if (state === 'idle') setIsHovered(true); }}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, padding: '12px 0', cursor: isExtracting ? 'default' : 'pointer',
        position: 'relative',
      }}
    >
      {isHovered && !isExtracting && (
        <div style={{
          position: 'absolute', width: 140, height: 20,
          background: 'radial-gradient(ellipse, rgba(10,132,255,0.1), transparent)',
          borderRadius: '50%', animation: 'ei-glow-pulse 2.5s ease-in-out infinite',
          pointerEvents: 'none', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        }} />
      )}

      {isExtracting && (
        <div style={{
          position: 'relative', width: 180, height: 3, borderRadius: 2,
          overflow: 'hidden', background: 'rgba(255,255,255,0.03)',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.12), rgba(168,85,247,0.18), rgba(10,132,255,0.12), transparent)',
            backgroundSize: '200% 100%', animation: 'ei-shimmer-sweep 2s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', top: 0, height: '100%', width: '35%',
            background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.35), transparent)',
            animation: 'ei-scan 1.5s ease-in-out infinite', borderRadius: 2,
          }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
        <SparklesIcon
          color={iconColor}
          style={isExtracting ? { animation: 'ei-star-pulse 2s ease-in-out infinite' } : {}}
        />
        <span style={{ fontSize: 11, color: textColor }}>
          {isExtracting ? 'Extrahiere Erkenntnisse...' : 'Erkenntnisse extrahieren'}
        </span>
      </div>

      {(isHovered || isExtracting) && (
        <div style={{ position: 'absolute', width: 200, height: 30, top: -5, pointerEvents: 'none' }}>
          {[18, 38, 58, 75].map((left, i) => (
            <div key={i} style={{
              width: 2, height: 2, borderRadius: '50%',
              background: i % 2 === 0 ? 'rgba(10,132,255,0.6)' : 'rgba(255,255,255,0.3)',
              position: 'absolute', left: `${left}%`,
              animation: `ei-sparkle-float ${1.4 + i * 0.2}s ease-in-out ${i * 0.3}s infinite`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
