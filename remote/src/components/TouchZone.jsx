import React, { useRef, useCallback, useEffect } from 'react';

const ZONE_STYLE = {
  height: 56,
  borderRadius: 14,
  margin: '0 16px 16px 16px',
  position: 'relative',
  overflow: 'hidden',
  touchAction: 'none',
};

const DOT_SPACING = 16;
const MAX_DIST = 120;
const BASE_ALPHA = 0.04;
const MAX_ALPHA = 0.29;

const TouchZone = () => {
  const canvasRef = useRef(null);
  const touchRef = useRef(null);
  const rafRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    const touch = touchRef.current;
    if (!touch) return;

    const tx = touch.x * dpr;
    const ty = touch.y * dpr;
    const maxDistScaled = MAX_DIST * dpr;
    const spacingScaled = DOT_SPACING * dpr;

    for (let x = spacingScaled / 2; x < w; x += spacingScaled) {
      for (let y = spacingScaled / 2; y < h; y += spacingScaled) {
        const dx = tx - x;
        const dy = ty - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let drawX = x;
        let drawY = y;
        let alpha = BASE_ALPHA;

        if (dist < maxDistScaled && dist > 0) {
          const t = 1 - (dist / maxDistScaled);
          const pull = t * t;
          drawX = x + dx * pull * 0.3;
          drawY = y + dy * pull * 0.3;
          alpha = BASE_ALPHA + (MAX_ALPHA - BASE_ALPHA) * pull;
        }

        ctx.beginPath();
        ctx.arc(drawX, drawY, 1.2 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }
    }
  }, []);

  const handleTouch = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    touchRef.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        draw();
        rafRef.current = null;
      });
    }
  }, [draw]);

  const handleEnd = useCallback(() => {
    touchRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div style={ZONE_STYLE}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      />
    </div>
  );
};

export default React.memo(TouchZone);
