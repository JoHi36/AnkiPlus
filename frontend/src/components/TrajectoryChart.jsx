import React, { useState, useCallback, useRef } from 'react';
import useTrajectoryModel from '../hooks/useTrajectoryModel';

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
};

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

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
  const model = useTrajectoryModel({ days, currentPct, totalCards });
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const { viewBox, chartArea, todayX, todayY, pastCurve, predictionLine, upperBand, lowerBand, pacePerDay } = model;

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
      let closest = pastCurve[0];
      let minDist = Infinity;
      for (const pt of pastCurve) {
        const dist = Math.abs(pt.x - svgX);
        if (dist < minDist) { minDist = dist; closest = pt; }
      }
      if (closest) {
        setHover({ x: closest.x, y: closest.y, pct: closest.pct, date: formatDate(closest.date), isFuture: false });
      }
    } else {
      let closest = predictionLine[0];
      let minDist = Infinity;
      for (let i = 0; i < predictionLine.length; i++) {
        const pt = predictionLine[i];
        const dist = Math.abs(pt.x - svgX);
        if (dist < minDist) { minDist = dist; closest = { ...pt, dayOffset: i + 1 }; }
      }
      if (closest) {
        setHover({ x: closest.x, y: closest.y, pct: closest.pct, date: formatFutureDate(closest.dayOffset), isFuture: true });
      }
    }
  }, [pastCurve, predictionLine, viewBox.w, chartArea, todayX]);

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
  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 2 + i);
    return { label: MONTHS[d.getMonth()], x: chartArea.left + ((i / 5) * (chartArea.right - chartArea.left)) };
  });

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

  const gridPcts = [25, 50, 75];

  return (
    <div style={CONTAINER_STYLE}>
      <div style={HEADER_STYLE}>
        <div style={LABEL_STYLE}>Fortschritt</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...BIG_PCT_STYLE, color: displayPctColor }}>{displayPct}%</div>
          <div style={{ ...PACE_STYLE, color: displaySubColor }}>{displaySub}</div>
        </div>
      </div>

      <div style={SVG_WRAPPER_STYLE}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: 80 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="trajectoryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="predictionStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {gridPcts.map(pct => {
            const y = chartArea.top + chartArea.h - (pct / 100) * chartArea.h;
            return <line key={pct} x1={chartArea.left} y1={y} x2={chartArea.right} y2={y} stroke="var(--ds-border-subtle)" strokeWidth="0.8" />;
          })}

          {pastArea && <path d={pastArea} fill="url(#trajectoryFill)" />}
          {outerBandPath && <path d={outerBandPath} fill="var(--ds-accent)" opacity="0.04" />}
          {innerBandPath && <path d={innerBandPath} fill="var(--ds-accent)" opacity="0.04" />}
          {pastPath && <path d={pastPath} fill="none" stroke="var(--ds-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}

          {predictionPath && (
            <path d={predictionPath} fill="none" stroke="url(#predictionStroke)" strokeWidth="1.3" strokeDasharray="5 3" strokeLinecap="round">
              <animate attributeName="opacity" values="0.35;0.65;0.35" dur="3s" repeatCount="indefinite" />
            </path>
          )}

          <line x1={todayX} y1={chartArea.top} x2={todayX} y2={chartArea.bottom} stroke="var(--ds-border-medium)" strokeWidth="0.5" strokeDasharray="2 2" />
          <circle cx={todayX} cy={todayY} r="8" fill="var(--ds-accent)" opacity="0.12" />
          <circle cx={todayX} cy={todayY} r="3" fill="var(--ds-accent)" />

          {hover && (
            <>
              <line x1={hover.x} y1={chartArea.top} x2={hover.x} y2={chartArea.bottom} stroke="var(--ds-text-tertiary)" strokeWidth="0.5" opacity="0.3" />
              <circle cx={hover.x} cy={hover.y} r="4" fill="var(--ds-accent)" />
            </>
          )}

          {monthLabels.map((m, i) => (
            <text key={i} x={m.x} y={viewBox.h - 4} textAnchor="middle" fontSize="10" fill="var(--ds-text-muted)">{m.label}</text>
          ))}
        </svg>
      </div>

      <div style={FOOTER_STYLE}>
        {avgNew7d} neue Karten / Tag · {matureCards + youngCards} gelernt · {totalCards} gesamt
      </div>
    </div>
  );
}
