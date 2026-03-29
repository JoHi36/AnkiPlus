import React, { useState, useCallback, useRef, useEffect } from 'react';
import useTrajectoryModel, { RANGE_PRESETS } from '../hooks/useTrajectoryModel';

const CONTAINER_STYLE = {};

const HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 14,
};

const LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0.3,
  color: 'var(--ds-text-tertiary)',
};

const BIG_PCT_STYLE = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: -1,
  lineHeight: 1,
  transition: 'color 0.15s',
};

const PACE_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  marginTop: 2,
  transition: 'all 0.15s',
};

const FOOTER_STYLE = {
  marginTop: 10,
  fontSize: 11,
  color: 'var(--ds-text-muted)',
};

const SVG_WRAPPER_STYLE = {
  width: '100%',
  overflow: 'hidden',
  position: 'relative',
};

const RANGE_ROW_STYLE = {
  display: 'flex',
  gap: 2,
};

const RANGE_PILL_STYLE = {
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 500,
  fontFamily: 'inherit',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--ds-text-muted)',
  cursor: 'pointer',
  transition: 'all 0.15s',
  letterSpacing: 0.5,
};

const RANGE_PILL_ACTIVE_STYLE = {
  ...RANGE_PILL_STYLE,
  background: 'var(--ds-hover-tint)',
  color: 'var(--ds-text-secondary)',
};

const DYNAMIK_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  marginTop: 3,
  justifyContent: 'flex-end',
};

const DYNAMIK_LABEL_STYLE = {
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: 0.5,
  color: 'var(--ds-text-muted)',
};

const DYNAMIK_DOTS_STYLE = {
  display: 'flex',
  gap: 2,
};

const DYNAMIK_DOT = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: 'var(--ds-accent)',
  transition: 'opacity 0.3s',
};

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// ─── Today Burst (CSS-only, no SVG animate) ─────────────────────────────────

const RING_STYLE = {
  position: 'absolute',
  borderRadius: '50%',
  border: '1.5px solid var(--ds-accent)',
  pointerEvents: 'none',
  animation: 'burst-ring 0.9s ease-out forwards',
};

const PARTICLE_BASE = {
  position: 'absolute',
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: 'var(--ds-accent)',
  pointerEvents: 'none',
};

const PARTICLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('burst-keyframes')) {
  const style = document.createElement('style');
  style.id = 'burst-keyframes';
  style.textContent = `
    @keyframes burst-ring {
      0% { width: 0; height: 0; opacity: 0.5; }
      100% { width: 32px; height: 32px; opacity: 0; }
    }
    @keyframes burst-particle {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
      100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function TodayBurst({ todayX, todayY, viewBox }) {
  // Convert SVG coords to percentage position within the wrapper
  const leftPct = (todayX / viewBox.w) * 100;
  const topPct = (todayY / viewBox.h) * 100;

  return (
    <>
      {/* Expanding ring */}
      <div style={{
        ...RING_STYLE,
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, -50%)',
      }} />
      {/* Particles */}
      {PARTICLE_ANGLES.map((angle, i) => {
        const rad = angle * Math.PI / 180;
        const dist = 14;
        return (
          <div key={i} style={{
            ...PARTICLE_BASE,
            left: `${leftPct}%`,
            top: `${topPct}%`,
            '--dx': `${Math.cos(rad) * dist}px`,
            '--dy': `${Math.sin(rad) * dist}px`,
            animation: `burst-particle 0.7s ease-out ${i * 0.02}s forwards`,
          }} />
        );
      })}
    </>
  );
}

function buildCurve(points) {
  if (points.length < 2) return '';
  const d = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d.push(`C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`);
  }
  return d.join(' ');
}

function buildClosedArea(curvePoints, baseY) {
  const curve = buildCurve(curvePoints);
  if (!curve || curvePoints.length < 2) return '';
  const last = curvePoints[curvePoints.length - 1];
  const first = curvePoints[0];
  return `${curve} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

function buildBandPath(upper, lower) {
  if (upper.length < 2 || lower.length < 2) return '';
  const fwd = buildCurve(upper);
  const rev = [...lower].reverse();
  const back = rev.map((p, i) => {
    if (i === 0) return `L ${p.x} ${p.y}`;
    const prev = rev[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
  }).join(' ');
  return `${fwd} ${back} Z`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function formatFutureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export default function TrajectoryChart({
  days = [],
  currentPct = 0,
  totalCards = 0,
  matureCards = 0,
  youngCards = 0,
  avgNew7d = 0,
}) {
  const [range, setRange] = useState('M');
  const model = useTrajectoryModel({ days, currentPct, totalCards, range });
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [burstPhase, setBurstPhase] = useState('idle'); // 'idle' | 'burst' | 'done'

  // Trigger burst on mount with delay
  useEffect(() => {
    const t1 = setTimeout(() => setBurstPhase('burst'), 500);
    const t2 = setTimeout(() => setBurstPhase('done'), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const { viewBox, chartArea, todayX, todayY, pastCurve, pastLookup, predictionLine, predLookup, upperBand, lowerBand, pacePerDay, yMin, yMax, dynamik, predictionOpacity } = model;

  const handleMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * viewBox.w;

    if (svgX < chartArea.left || svgX > chartArea.right) {
      setHover(null);
      return;
    }

    const isFuture = svgX > todayX;

    if (!isFuture) {
      let closest = pastLookup[0];
      let minDist = Infinity;
      for (const pt of pastLookup) {
        const dist = Math.abs(pt.x - svgX);
        if (dist < minDist) { minDist = dist; closest = pt; }
      }
      if (closest) {
        setHover({ x: closest.x, y: closest.y, pct: closest.pct, date: formatDate(closest.date), isFuture: false });
      }
    } else {
      let closest = predLookup[0];
      let minDist = Infinity;
      for (const pt of predLookup) {
        const dist = Math.abs(pt.x - svgX);
        if (dist < minDist) { minDist = dist; closest = pt; }
      }
      if (closest) {
        setHover({ x: closest.x, y: closest.y, pct: closest.pct, date: formatFutureDate(closest.dayOffset), isFuture: true });
      }
    }
  }, [pastLookup, predLookup, viewBox.w, chartArea, todayX]);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const pastPath = buildCurve(pastCurve);
  const pastArea = buildClosedArea(pastCurve, chartArea.bottom);
  const outerBandPath = buildBandPath(upperBand, lowerBand);
  const innerUpper = upperBand.map((p, i) => ({
    x: p.x,
    y: p.y + (lowerBand[i].y - p.y) * 0.2,
  }));
  const innerLower = lowerBand.map((p, i) => ({
    x: p.x,
    y: p.y - (lowerBand[i].y - upperBand[i].y) * 0.2,
  }));
  const innerBandPath = buildBandPath(innerUpper, innerLower);
  const predictionPath = buildCurve(predictionLine);

  const now = new Date();
  const preset = RANGE_PRESETS[range] || RANGE_PRESETS.M;
  const totalRangeDays = preset.pastDays + preset.futureDays;

  // Generate smart axis labels based on range
  const axisLabels = (() => {
    const chartW = chartArea.right - chartArea.left;
    if (range === 'W') {
      const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (preset.pastDays - 1) + i);
        return { label: dayNames[d.getDay()], x: chartArea.left + (i / (totalRangeDays - 1)) * chartW };
      });
    } else if (range === 'M') {
      const count = 5;
      return Array.from({ length: count }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - preset.pastDays + Math.round(i * totalRangeDays / (count - 1)));
        return { label: `${d.getDate()}. ${MONTHS[d.getMonth()]}`, x: chartArea.left + (i / (count - 1)) * chartW };
      });
    } else {
      // Year: evenly space actual months across the range
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - preset.pastDays);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + preset.futureDays);
      const labels = [];
      const d = new Date(startDate);
      d.setDate(1);
      d.setMonth(d.getMonth() + 1); // start from first full month
      while (d <= endDate) {
        const dayOffset = (d - startDate) / (1000 * 60 * 60 * 24);
        const frac = dayOffset / totalRangeDays;
        if (frac >= 0 && frac <= 1) {
          labels.push({ label: MONTHS[d.getMonth()], x: chartArea.left + frac * chartW });
        }
        d.setMonth(d.getMonth() + 1);
      }
      return labels;
    }
  })();

  const displayPct = hover ? hover.pct.toFixed(1) : currentPct;
  const displayPctColor = hover
    ? (hover.isFuture ? 'var(--ds-accent)' : 'var(--ds-text-primary)')
    : 'var(--ds-text-primary)';
  const displaySub = hover
    ? (hover.date + (hover.isFuture ? ' (Prognose)' : ''))
    : `+${pacePerDay.toFixed(1)}% / Tag`;
  const displaySubColor = hover
    ? (hover.isFuture ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)')
    : 'var(--ds-accent)';

  // Dynamik dots: 5 dots, filled based on dynamik score
  const filledDots = Math.round(dynamik * 5);
  const dynamikLabel = dynamik >= 0.7 ? 'stark' : dynamik >= 0.4 ? 'stabil' : 'niedrig';

  // Dynamic grid lines based on visible Y range
  const gridPcts = (() => {
    const range = yMax - yMin;
    const step = range > 30 ? 10 : range > 10 ? 5 : range > 4 ? 2 : 1;
    const lines = [];
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v < yMax; v += step) {
      if (v > yMin && v < yMax) lines.push(v);
    }
    return lines;
  })();

  return (
    <div style={CONTAINER_STYLE}>
      <div style={HEADER_STYLE}>
        <div>
          <div style={LABEL_STYLE}>Fortschritt</div>
          <div style={RANGE_ROW_STYLE}>
            {Object.keys(RANGE_PRESETS).map(key => (
              <button
                key={key}
                style={range === key ? RANGE_PILL_ACTIVE_STYLE : RANGE_PILL_STYLE}
                onClick={() => { setRange(key); setHover(null); }}
              >
                {RANGE_PRESETS[key].label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...BIG_PCT_STYLE, color: displayPctColor }}>{displayPct}%</div>
          <div style={{ ...PACE_STYLE, color: displaySubColor }}>{displaySub}</div>
          <div style={{ ...DYNAMIK_ROW_STYLE, visibility: hover ? 'hidden' : 'visible' }}>
            <span style={DYNAMIK_LABEL_STYLE}>Dynamik</span>
            <span style={DYNAMIK_DOTS_STYLE}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{
                  ...DYNAMIK_DOT,
                  opacity: i < filledDots ? (0.4 + dynamik * 0.6) : 0.15,
                }} />
              ))}
            </span>
          </div>
        </div>
      </div>

      <div style={SVG_WRAPPER_STYLE}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block', width: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="trajectoryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="predictionStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity={predictionOpacity} />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity={predictionOpacity * 0.15} />
            </linearGradient>
          </defs>

          {gridPcts.map(pct => {
            const y = chartArea.top + chartArea.h - ((pct - yMin) / (yMax - yMin)) * chartArea.h;
            return (
              <g key={pct}>
                <line x1={chartArea.left} y1={y} x2={chartArea.right} y2={y} stroke="var(--ds-border-subtle)" strokeWidth="0.8" />
                <text x={chartArea.right + 6} y={y + 3} fontSize="9" fill="var(--ds-text-muted)">{pct}%</text>
              </g>
            );
          })}

          {pastArea && <path d={pastArea} fill="url(#trajectoryFill)" />}
          {outerBandPath && <path d={outerBandPath} fill="var(--ds-accent)" opacity="0.04" />}
          {innerBandPath && <path d={innerBandPath} fill="var(--ds-accent)" opacity="0.04" />}
          {pastPath && <path d={pastPath} fill="none" stroke="var(--ds-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}

          {predictionPath && (
            <path d={predictionPath} fill="none" stroke="url(#predictionStroke)" strokeWidth="1.3" strokeDasharray="5 3" strokeLinecap="round">
              <animate attributeName="opacity" values={`${predictionOpacity * 0.5};${predictionOpacity};${predictionOpacity * 0.5}`} dur="3s" repeatCount="indefinite" />
            </path>
          )}

          <line x1={todayX} y1={chartArea.top} x2={todayX} y2={chartArea.bottom} stroke="var(--ds-border-medium)" strokeWidth="0.5" strokeDasharray="2 2" />
          {/* Today dot OR hover dot — never both */}
          {hover ? (
            <>
              <line x1={hover.x} y1={chartArea.top} x2={hover.x} y2={chartArea.bottom} stroke="var(--ds-text-tertiary)" strokeWidth="0.5" opacity="0.3" />
              <circle cx={hover.x} cy={hover.y} r="8" fill="var(--ds-accent)" opacity="0.12" />
              <circle cx={hover.x} cy={hover.y} r="3.5" fill="var(--ds-accent)" />
            </>
          ) : (
            <>
              <circle cx={todayX} cy={todayY} r="8" fill="var(--ds-accent)" opacity="0.12" />
              <circle cx={todayX} cy={todayY} r="3" fill="var(--ds-accent)" />
            </>
          )}

          {axisLabels.map((m, i) => (
            <text key={i} x={m.x} y={viewBox.h - 4} textAnchor="middle" fontSize="10" fill="var(--ds-text-muted)">{m.label}</text>
          ))}
        </svg>
        {/* CSS burst overlay — positioned over today dot */}
        {burstPhase === 'burst' && !hover && (
          <TodayBurst todayX={todayX} todayY={todayY} viewBox={viewBox} />
        )}
      </div>

      <div style={FOOTER_STYLE}>
        {avgNew7d} neue Karten / Tag · {matureCards + youngCards} gelernt · {totalCards} gesamt
      </div>
    </div>
  );
}
