import React, { useEffect, useRef } from 'react';

export default function PlusiDock({ onClick }) {
  const containerRef = useRef(null);

  useEffect(() => {
    // Load the shared Plusi SVG renderer if available
    if (containerRef.current && window.renderPlusiSVG) {
      try {
        window.renderPlusiSVG(containerRef.current, { mood: 'neutral', size: 48 });
      } catch (e) {
      }
    }
  }, []);

  return (
    <button
      ref={containerRef}
      onClick={onClick}
      style={{
        position: 'fixed', bottom: 16, left: 16,
        width: 48, height: 48,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    />
  );
}
