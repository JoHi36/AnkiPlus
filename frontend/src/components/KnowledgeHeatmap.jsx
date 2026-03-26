import React, { useRef, useEffect, useState, useCallback } from 'react';

// ─── Treemap layout ──────────────────────────────────────────────────────────

function splitLayout(items, x, y, w, h, result) {
  if (!items.length) return;
  if (items.length === 1) {
    result.push({ x, y, w, h, ...items[0] });
    return;
  }
  var vertical = w >= h;
  var total = items.reduce((s, i) => s + i.area, 0);
  var cumArea = 0, bestIdx = 0, bestRatio = Infinity;
  for (var i = 0; i < items.length - 1; i++) {
    cumArea += items[i].area;
    var frac = cumArea / total;
    var r1, r2;
    if (vertical) {
      r1 = Math.max(frac * w / h, h / (frac * w));
      r2 = Math.max((1 - frac) * w / h, h / ((1 - frac) * w));
    } else {
      r1 = Math.max(w / (frac * h), frac * h / w);
      r2 = Math.max(w / ((1 - frac) * h), (1 - frac) * h / w);
    }
    var maxRatio = Math.max(r1, r2);
    if (maxRatio < bestRatio) { bestRatio = maxRatio; bestIdx = i; }
  }
  var left = items.slice(0, bestIdx + 1), right = items.slice(bestIdx + 1);
  var leftFrac = left.reduce((s, i) => s + i.area, 0) / total;
  if (vertical) {
    splitLayout(left, x, y, leftFrac * w, h, result);
    splitLayout(right, x + leftFrac * w, y, (1 - leftFrac) * w, h, result);
  } else {
    splitLayout(left, x, y, w, leftFrac * h, result);
    splitLayout(right, x, y + leftFrac * h, w, (1 - leftFrac) * h, result);
  }
}

function squarify(items, x, y, w, h) {
  var result = [];
  if (!items.length) return result;
  var total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return result;
  var area = w * h;
  var normalized = items.map(i => ({ ...i, area: (i.value / total) * area }));
  splitLayout(normalized, x, y, w, h, result);
  return result;
}

// ─── Color by strength ───────────────────────────────────────────────────────

function strengthColor(s) {
  if (s < 0.15) return 'rgba(155,35,38,0.72)';
  if (s < 0.30) return 'rgba(170,55,42,0.62)';
  if (s < 0.45) return 'rgba(175,105,38,0.52)';
  if (s < 0.60) return 'rgba(155,145,42,0.45)';
  if (s < 0.75) return 'rgba(75,150,65,0.40)';
  if (s < 0.85) return 'rgba(42,145,85,0.38)';
  return 'rgba(35,135,90,0.35)';
}

// ─── Flatten deck tree ───────────────────────────────────────────────────────

function flattenLevel(roots) {
  return roots.map(deck => {
    var strength = (deck.mature || 0) / Math.max(1, deck.total || 1);
    var hasChildren = deck.children && deck.children.length > 0;
    return {
      id: deck.id,
      name: deck.display || deck.name,
      cards: deck.total || 0,
      strength: strength,
      hasChildren: hasChildren,
      children: deck.children || [],
      dueNew: deck.dueNew || 0,
      dueLearn: deck.dueLearn || 0,
      dueReview: deck.dueReview || 0,
    };
  }).filter(d => d.cards > 0);
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function KnowledgeHeatmap({ deckData, onStartStack }) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // currentPath: array of { name, roots } for breadcrumb nav
  const [currentPath, setCurrentPath] = useState([]);
  const [currentRoots, setCurrentRoots] = useState([]);

  const [selectedDeck, setSelectedDeck] = useState(null);

  // Animation state: 'idle' | 'morphOut' | 'morphIn'
  const [animState, setAnimState] = useState('idle');
  const [morphTarget, setMorphTarget] = useState(null); // cell layout rect for the morphing cell
  const [cells, setCells] = useState([]); // computed layout items
  const [pendingRoots, setPendingRoots] = useState(null);

  // double-tap detection
  const lastTapRef = useRef({ name: null, time: 0 });

  // ── Resize observer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ w: width, h: height });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Init roots from deckData ─────────────────────────────────────────────

  useEffect(() => {
    if (deckData?.roots) {
      setCurrentRoots(deckData.roots);
      setCurrentPath([]);
      setSelectedDeck(null);
    }
  }, [deckData]);

  // ── Compute cells when roots or size changes ─────────────────────────────

  useEffect(() => {
    if (!containerSize.w || !containerSize.h) return;
    const items = flattenLevel(currentRoots);
    // Sort ascending by strength (weakest top-left)
    items.sort((a, b) => a.strength - b.strength);
    const mapped = items.map(d => ({ ...d, value: d.cards }));
    const layout = squarify(mapped, 0, 0, containerSize.w, containerSize.h);
    setCells(layout);
  }, [currentRoots, containerSize]);

  // ── Click handler ────────────────────────────────────────────────────────

  const handleCellClick = useCallback((cell) => {
    const now = Date.now();
    const last = lastTapRef.current;

    if (last.name === cell.name && now - last.time < 400 && cell.hasChildren) {
      // Double-click → drill down with morph animation
      lastTapRef.current = { name: null, time: 0 };
      setSelectedDeck(null);

      // Find cell rect for morph
      const cellRect = cells.find(c => c.id === cell.id);
      setMorphTarget(cellRect);
      setAnimState('morphOut');
      setPendingRoots(cell.children);

      setCurrentPath(prev => [...prev, { name: cell.name, roots: currentRoots }]);
    } else {
      lastTapRef.current = { name: cell.name, time: now };
      setSelectedDeck(prev => prev?.id === cell.id ? null : cell);
    }
  }, [cells, currentRoots]);

  // ── Morph animation timing ───────────────────────────────────────────────

  useEffect(() => {
    if (animState !== 'morphOut') return;

    const t = setTimeout(() => {
      if (pendingRoots) {
        setCurrentRoots(pendingRoots);
      }
      setMorphTarget(null);
      setAnimState('morphIn');
    }, 500);

    return () => clearTimeout(t);
  }, [animState, pendingRoots]);

  useEffect(() => {
    if (animState !== 'morphIn') return;
    const t = setTimeout(() => setAnimState('idle'), 600);
    return () => clearTimeout(t);
  }, [animState]);

  // ── Breadcrumb navigation ────────────────────────────────────────────────

  const navigateTo = useCallback((idx) => {
    if (idx < 0) {
      // Go to root
      if (deckData?.roots) setCurrentRoots(deckData.roots);
      setCurrentPath([]);
    } else {
      const entry = currentPath[idx];
      setCurrentRoots(entry.roots);
      setCurrentPath(prev => prev.slice(0, idx));
    }
    setSelectedDeck(null);
    setAnimState('idle');
  }, [currentPath, deckData]);

  // ── Render ───────────────────────────────────────────────────────────────

  const hasDue = selectedDeck && (selectedDeck.dueNew + selectedDeck.dueLearn + selectedDeck.dueReview) > 0;
  const isWeak = selectedDeck && selectedDeck.strength < 0.5;

  return (
    <div style={{ width: '100%', maxWidth: 740, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Breadcrumb */}
      {currentPath.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--ds-text-secondary)',
        }}>
          <button
            onClick={() => navigateTo(-1)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--ds-accent)', fontSize: 12, fontFamily: 'inherit',
            }}
          >
            Alle Stapel
          </button>
          {currentPath.map((entry, idx) => (
            <React.Fragment key={idx}>
              <span style={{ color: 'var(--ds-text-tertiary)', opacity: 0.5 }}>/</span>
              <button
                onClick={() => navigateTo(idx)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: idx === currentPath.length - 1 ? 'var(--ds-text-primary)' : 'var(--ds-accent)',
                  fontSize: 12, fontFamily: 'inherit', fontWeight: idx === currentPath.length - 1 ? 600 : 400,
                }}
              >
                {entry.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Treemap container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          aspectRatio: '16/9',
          position: 'relative',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--ds-bg-deep)',
        }}
      >
        {cells.map((cell, i) => {
          const isMorphTarget = animState !== 'idle' && morphTarget?.id === cell.id;
          const isOther = animState === 'morphOut' && morphTarget && morphTarget.id !== cell.id;
          const isNew = animState === 'morphIn';

          let cellStyle = {
            position: 'absolute',
            left: cell.x,
            top: cell.y,
            width: cell.w,
            height: cell.h,
            boxSizing: 'border-box',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '12px 14px',
            backgroundColor: strengthColor(cell.strength),
            border: '1px solid rgba(0,0,0,0.18)',
            transition: [
              'left 0.55s cubic-bezier(0.4,0,0.15,1)',
              'top 0.55s cubic-bezier(0.4,0,0.15,1)',
              'width 0.55s cubic-bezier(0.4,0,0.15,1)',
              'height 0.55s cubic-bezier(0.4,0,0.15,1)',
              'opacity 0.3s ease',
              'background-color 0.55s ease',
            ].join(', '),
            outline: selectedDeck?.id === cell.id ? '2px solid rgba(255,255,255,0.35)' : 'none',
            outlineOffset: -2,
          };

          if (isMorphTarget && animState === 'morphOut') {
            cellStyle = {
              ...cellStyle,
              left: 0, top: 0, width: containerSize.w, height: containerSize.h,
              backgroundColor: 'rgba(10,10,12,1)',
              zIndex: 20,
            };
          } else if (isOther) {
            cellStyle = { ...cellStyle, opacity: 0, pointerEvents: 'none' };
          } else if (isNew) {
            // morphIn: cells start center and expand to place
            // (just let the transition handle it since we set positions immediately after morph)
          }

          const textVisible = !(isMorphTarget && animState === 'morphOut');
          const pct = Math.round(cell.strength * 100);
          const showPct = cell.w > 80 && cell.h > 60;
          const showMeta = cell.w > 100 && cell.h > 70;

          return (
            <div
              key={cell.id}
              style={cellStyle}
              onClick={() => handleCellClick(cell)}
            >
              {textVisible && (
                <>
                  {showPct && (
                    <div style={{
                      fontSize: 22, fontWeight: 200,
                      color: 'rgba(255,255,255,0.55)',
                      lineHeight: 1,
                      marginBottom: 4,
                      transition: 'opacity 0.2s',
                    }}>
                      {pct}%
                    </div>
                  )}
                  <div style={{
                    fontSize: Math.max(10, Math.min(13, cell.w / 12)),
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.9)',
                    lineHeight: 1.2,
                    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    transition: 'opacity 0.2s',
                  }}>
                    {cell.name}
                    {cell.hasChildren && (
                      <span style={{ opacity: 0.5, fontWeight: 400, fontSize: '0.85em' }}> ›</span>
                    )}
                  </div>
                  {showMeta && (
                    <div style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.4)',
                      marginTop: 3,
                      transition: 'opacity 0.2s',
                    }}>
                      {cell.cards} Karten
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Morphin overlay: empty cells spawn from center */}
        {animState === 'morphIn' && cells.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ds-text-tertiary)', fontSize: 13,
          }}>
            Keine Unterstapel
          </div>
        )}
      </div>

      {/* Bottom bar — appears when a deck is selected */}
      {selectedDeck && (
        <div
          className="ds-frosted"
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid var(--ds-border-subtle)',
            boxShadow: 'var(--ds-shadow-md)',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 14, fontWeight: 600,
              color: 'var(--ds-text-primary)',
            }}>
              {selectedDeck.name}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--ds-text-secondary)', marginTop: 2,
            }}>
              {selectedDeck.cards} Karten &middot; {Math.round(selectedDeck.strength * 100)}% gelernt
              {(selectedDeck.dueNew + selectedDeck.dueLearn + selectedDeck.dueReview) > 0 && (
                <span style={{ color: 'var(--ds-yellow)', marginLeft: 8 }}>
                  {selectedDeck.dueNew + selectedDeck.dueLearn + selectedDeck.dueReview} fällig
                </span>
              )}
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={() => {
              if (onStartStack) onStartStack(selectedDeck.id);
            }}
            style={{
              background: isWeak ? 'var(--ds-red)' : 'var(--ds-accent)',
              color: 'rgba(255,255,255,0.95)',
              border: 'none', borderRadius: 10,
              padding: '9px 18px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {isWeak ? 'Schwächen lernen' : 'Stapel starten'}
          </button>
        </div>
      )}

      {/* Legend row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        justifyContent: 'center',
        paddingTop: 2,
      }}>
        {[
          { label: 'Schwach', color: 'rgba(155,35,38,0.8)' },
          { label: 'Mittel', color: 'rgba(175,105,38,0.7)' },
          { label: 'Stark', color: 'rgba(35,135,90,0.6)' },
        ].map(({ label, color }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: 'var(--ds-text-tertiary)',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 3,
              background: color, flexShrink: 0,
            }} />
            {label}
          </div>
        ))}
        <div style={{
          fontSize: 11, color: 'var(--ds-text-tertiary)',
          marginLeft: 8, opacity: 0.6,
        }}>
          Doppelklick zum Reinzoomen
        </div>
      </div>
    </div>
  );
}
