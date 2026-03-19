import React, { useMemo } from 'react';

export default function MiniChart({
  data = [],
  color = 'rgba(140,120,200,0.35)',
  fillColor = 'rgba(140,120,200,0.1)',
  height = 36,
  label,
  showGrid = true,
  id
}) {
  const gradientId = `fill-${id || label || 'chart'}`;
  const viewWidth = 140;
  const viewHeight = height;
  const padding = 2;

  const points = useMemo(() => {
    if (!data.length) return '';
    const effectiveHeight = viewHeight - padding * 2;
    const step = viewWidth / Math.max(data.length - 1, 1);
    return data
      .map((val, i) => {
        const x = i * step;
        const y = padding + effectiveHeight * (1 - Math.max(0, Math.min(1, val)));
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, viewWidth, viewHeight]);

  const fillPoints = useMemo(() => {
    if (!points) return '';
    return `${points} ${viewWidth},${viewHeight} 0,${viewHeight}`;
  }, [points, viewWidth, viewHeight]);

  if (!data.length) {
    return (
      <div>
        {label && (
          <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', letterSpacing: '0.3px', marginBottom: 4 }}>
            {label}
          </div>
        )}
        <div style={{ position: 'relative', height }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.025)' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', letterSpacing: '0.3px', marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', height }}>
        {showGrid && (
          <>
            <div style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.02)' }} />
            <div style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.02)' }} />
          </>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.025)' }} />
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <polygon points={fillPoints} fill={`url(#${gradientId})`} />
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
