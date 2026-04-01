import React, { useEffect, useState } from 'react';

const SPARK_COUNT = 12;

const TRAJECTORIES = [
  { dx: -45, dy: -28 }, { dx: 48, dy: -24 }, { dx: -30, dy: -40 },
  { dx: 32, dy: -38 }, { dx: -55, dy: -10 }, { dx: 58, dy: -8 },
  { dx: -18, dy: -48 }, { dx: 20, dy: -45 }, { dx: -40, dy: 12 },
  { dx: 42, dy: 10 },  { dx: -8, dy: -52 },  { dx: 5, dy: 18 },
];

const SIZES = [5, 4, 4, 5, 3.5, 3.5, 4, 4, 3, 3, 3.5, 3];
const DURATIONS = [450, 420, 400, 470, 400, 440, 380, 430, 360, 450, 400, 420];
const DELAYS = [20, 20, 30, 20, 30, 20, 30, 20, 40, 30, 20, 30];

const BURST_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  transform: 'translateX(-50%)',
  zIndex: 15,
  pointerEvents: 'none',
};

const GLOW_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  transform: 'translate(-50%, -50%)',
  width: 120,
  height: 60,
  borderRadius: '50%',
  background: 'radial-gradient(ellipse, rgba(10,132,255,0.25) 0%, transparent 70%)',
  pointerEvents: 'none',
  zIndex: 13,
};

interface SparkBurstProps {
  active: boolean;
}

export default function SparkBurst({ active }: SparkBurstProps) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (active) setKey(k => k + 1);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div style={GLOW_STYLE} key={`glow-${key}`} className="spark-glow" />
      <div style={BURST_STYLE} key={`burst-${key}`}>
        {TRAJECTORIES.map((t, i) => {
          const size = SIZES[i];
          const isLight = i % 3 === 2;
          const color = isLight ? 'rgba(100,170,255,0.9)' : 'rgba(10,132,255,1)';
          const shadow = isLight
            ? '0 0 4px 1px rgba(100,170,255,0.4)'
            : '0 0 6px 2px rgba(10,132,255,0.5)';
          return (
            <div
              key={i}
              className="spark-particle"
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: '50%',
                background: color,
                boxShadow: shadow,
                opacity: 0,
                '--spark-dx': `${t.dx}px`,
                '--spark-dy': `${t.dy}px`,
                '--spark-dur': `${DURATIONS[i]}ms`,
                '--spark-delay': `${DELAYS[i]}ms`,
                animation: `sparkFly var(--spark-dur) cubic-bezier(0.2,0,0,1) var(--spark-delay) forwards`,
              } as React.CSSProperties}
            />
          );
        })}
      </div>
      <style>{`
        @keyframes sparkFly {
          0%   { opacity: 0; transform: translate(0, 0) scale(1); }
          10%  { opacity: 1; }
          50%  { opacity: 0.5; transform: translate(calc(var(--spark-dx) * 0.6), calc(var(--spark-dy) * 0.6)) scale(0.5); }
          100% { opacity: 0; transform: translate(var(--spark-dx), var(--spark-dy)) scale(0.1); }
        }
        @keyframes sparkGlowFlash {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          35%  { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
          60%  { opacity: 0.3; transform: translate(-50%, -50%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
        }
        .spark-glow {
          animation: sparkGlowFlash 0.4s ease-out 0.02s forwards;
        }
      `}</style>
    </>
  );
}
