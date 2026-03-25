import { useRef, useCallback, useState } from 'react';

const STORAGE_KEY = 'ankiplus-sidebar-width';
const DEFAULT_WIDTH = 568;
const MIN_WIDTH = 400;
const MAX_WIDTH_RATIO = 0.5; // 50% of window

/**
 * ResizeHandle — butter-smooth drag-to-resize for the sidebar.
 *
 * Technique: mutate CSS custom property directly on documentElement
 * during pointermove. Zero React state updates during drag = zero
 * batching delay. The browser reflows immediately.
 *
 * During drag, a body class 'sidebar-resizing' disables CSS transitions
 * on the sidebar and dock so they follow the pointer instantly.
 */
export function loadPersistedWidth() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (w >= MIN_WIDTH && w <= window.innerWidth * MAX_WIDTH_RATIO) {
        return w;
      }
    }
  } catch { /* private browsing */ }
  return null;
}

export function applyWidth(width) {
  document.documentElement.style.setProperty('--ds-sidebar-width', width + 'px');
}

export default function ResizeHandle() {
  const draggingRef = useRef(false);
  const [visualState, setVisualState] = useState('idle'); // 'idle' | 'hover' | 'drag'
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setVisualState('drag');

    // Disable transitions during drag for instant response
    document.body.classList.add('sidebar-resizing');

    startXRef.current = e.clientX;
    const current = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ds-sidebar-width')
    ) || DEFAULT_WIDTH;
    startWidthRef.current = current;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const delta = startXRef.current - e.clientX; // left = wider
    const maxW = Math.floor(window.innerWidth * MAX_WIDTH_RATIO);
    const newWidth = Math.max(MIN_WIDTH, Math.min(maxW, startWidthRef.current + delta));
    applyWidth(newWidth);
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!draggingRef.current) return;
    try { e.target.releasePointerCapture(e.pointerId); } catch { /* */ }
    draggingRef.current = false;
    setVisualState('idle');

    // Re-enable transitions
    document.body.classList.remove('sidebar-resizing');

    // Persist
    const finalWidth = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ds-sidebar-width')
    ) || DEFAULT_WIDTH;
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(finalWidth)));
    } catch { /* private browsing */ }
  }, []);

  const handleDoubleClick = useCallback(() => {
    applyWidth(DEFAULT_WIDTH);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  }, []);

  const showLine = visualState !== 'idle';
  const isDrag = visualState === 'drag';

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => { if (!draggingRef.current) setVisualState('hover'); }}
      onMouseLeave={() => { if (!draggingRef.current) setVisualState('idle'); }}
      style={{
        position: 'absolute',
        left: -4,
        top: 0,
        bottom: 0,
        width: 8,
        cursor: 'col-resize',
        zIndex: 60,
        touchAction: 'none',
      }}
    >
      {/* Visual indicator line */}
      <div
        style={{
          position: 'absolute',
          right: 3,
          top: 0,
          bottom: 0,
          width: isDrag ? 2 : 1,
          background: 'var(--ds-text-tertiary)',
          opacity: showLine ? (isDrag ? 0.5 : 0.2) : 0,
          transition: isDrag ? 'none' : 'opacity 0.15s ease, width 0.1s ease',
          borderRadius: 1,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
