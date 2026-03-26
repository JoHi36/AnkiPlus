import React from 'react';

/**
 * PlusLoader — Animated plus-shape loading indicator.
 * Two glowing "snakes" trace the outline of a rounded plus symbol.
 * Extracted from the Invisible Addiction hero in ComponentViewer.
 *
 * Props:
 *   size: number (px, default 120)
 *   speed: number (seconds per revolution, default 6)
 */
export default function PlusLoader({ size = 120, speed = 6 }) {
  const r = 0.5;
  const d = [
    `M 4.5,0 L 5.5,0`,
    `A ${r},${r} 0 0 1 6,0.5  L 6,3.5`,
    `A ${r},${r} 0 0 0 6.5,4  L 9.5,4`,
    `A ${r},${r} 0 0 1 10,4.5  L 10,5.5`,
    `A ${r},${r} 0 0 1 9.5,6  L 6.5,6`,
    `A ${r},${r} 0 0 0 6,6.5  L 6,9.5`,
    `A ${r},${r} 0 0 1 5.5,10  L 4.5,10`,
    `A ${r},${r} 0 0 1 4,9.5  L 4,6.5`,
    `A ${r},${r} 0 0 0 3.5,6  L 0.5,6`,
    `A ${r},${r} 0 0 1 0,5.5  L 0,4.5`,
    `A ${r},${r} 0 0 1 0.5,4  L 3.5,4`,
    `A ${r},${r} 0 0 0 4,3.5  L 4,0.5`,
    `A ${r},${r} 0 0 1 4.5,0 Z`,
  ].join(' ');

  const perim = 37.4;
  const seg = 6;
  const dash = `${seg} ${perim - seg}`;
  const half = perim / 2;
  const dur = `${speed}s`;

  return (
    <svg
      viewBox="-1 -1 12 12"
      fill="none"
      style={{ width: size, height: size }}
    >
      <defs>
        <filter id="plus-loader-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.2" />
        </filter>
      </defs>

      {/* Snake 1 — wide glow */}
      <path
        d={d}
        stroke="var(--ds-accent)"
        strokeWidth="0.2"
        strokeDasharray={dash}
        strokeLinecap="round"
        opacity="0.25"
        filter="url(#plus-loader-glow)"
      >
        <animate attributeName="stroke-dashoffset" values={`0;${-perim}`} dur={dur} repeatCount="indefinite" />
      </path>
      {/* Snake 1 — sharp core */}
      <path
        d={d}
        stroke="var(--ds-accent)"
        strokeWidth="0.06"
        strokeDasharray={dash}
        strokeLinecap="round"
        opacity="0.6"
      >
        <animate attributeName="stroke-dashoffset" values={`0;${-perim}`} dur={dur} repeatCount="indefinite" />
      </path>

      {/* Snake 2 — offset half, wide glow */}
      <path
        d={d}
        stroke="var(--ds-accent)"
        strokeWidth="0.2"
        strokeDasharray={dash}
        strokeLinecap="round"
        opacity="0.25"
        filter="url(#plus-loader-glow)"
      >
        <animate attributeName="stroke-dashoffset" values={`${-half};${-half - perim}`} dur={dur} repeatCount="indefinite" />
      </path>
      {/* Snake 2 — sharp core */}
      <path
        d={d}
        stroke="var(--ds-accent)"
        strokeWidth="0.06"
        strokeDasharray={dash}
        strokeLinecap="round"
        opacity="0.6"
      >
        <animate attributeName="stroke-dashoffset" values={`${-half};${-half - perim}`} dur={dur} repeatCount="indefinite" />
      </path>
    </svg>
  );
}
