import React from 'react';

// ─── Static style constants ───────────────────────────────────────────────────

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
  color: 'var(--ds-text-primary)',
  letterSpacing: -1,
  lineHeight: 1,
};

const PACE_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ds-accent)',
  marginTop: 2,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function pctToY(pct, height = 120, padding = 10) {
  return height - padding - (pct / 100) * (height - padding * 2);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrajectoryChart({
  currentPct = 42,
  avgPerDay = 18,
  dailyPflege = 94,
  dailyTotal = 120,
  pacePerDay = 0.3,
  goals = [],
}) {
  const VB_W = 800;
  const VB_H = 160;
  const CHART_H = 120;
  const CHART_Y = 12;
  const CHART_LEFT = 8;
  const CHART_RIGHT = VB_W - 8;
  const CHART_W = CHART_RIGHT - CHART_LEFT;

  // 90 days history, today at 60% across, 90 days future
  const TOTAL_DAYS = 180;
  const TODAY_IDX = 90;
  const todayX = CHART_LEFT + (TODAY_IDX / TOTAL_DAYS) * CHART_W;

  // Past trajectory: simple rising curve from ~(currentPct - 30) to currentPct
  const startPct = Math.max(0, currentPct - pacePerDay * TODAY_IDX);
  const pastPoints = Array.from({ length: 8 }, (_, i) => {
    const frac = i / 7;
    const pct = startPct + (currentPct - startPct) * frac;
    return {
      x: CHART_LEFT + frac * TODAY_IDX * (CHART_W / TOTAL_DAYS),
      y: CHART_Y + pctToY(pct, CHART_H),
    };
  });

  // Future projection
  const futureDays = TOTAL_DAYS - TODAY_IDX;
  const endPct = Math.min(100, currentPct + pacePerDay * futureDays);
  const futurePoints = Array.from({ length: 6 }, (_, i) => {
    const frac = i / 5;
    const pct = currentPct + (endPct - currentPct) * frac;
    return {
      x: todayX + frac * futureDays * (CHART_W / TOTAL_DAYS),
      y: CHART_Y + pctToY(pct, CHART_H),
    };
  });

  const pastPath = buildCurve(pastPoints);
  const futurePath = buildCurve(futurePoints);
  const todayY = CHART_Y + pctToY(currentPct, CHART_H);

  // Month labels: 6 evenly spaced across the SVG
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const now = new Date();
  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 2 + i);
    return {
      label: months[d.getMonth()],
      x: CHART_LEFT + ((i / 5) * CHART_W),
    };
  });

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={LABEL_STYLE}>Fortschritt</div>
        <div style={{ textAlign: 'right' }}>
          <div style={BIG_PCT_STYLE}>{currentPct}%</div>
          <div style={PACE_STYLE}>+{pacePerDay.toFixed(1)}% / Tag</div>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={SVG_WRAPPER_STYLE}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: 80 }}
        >
          <defs>
            <linearGradient id="trajectoryFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines at 25%, 50%, 75% */}
          {[25, 50, 75].map(pct => (
            <line
              key={pct}
              x1={CHART_LEFT}
              y1={CHART_Y + pctToY(pct, CHART_H)}
              x2={CHART_RIGHT}
              y2={CHART_Y + pctToY(pct, CHART_H)}
              stroke="var(--ds-border-subtle)"
              strokeWidth="0.8"
            />
          ))}

          {/* Area fill under past line */}
          <path
            d={`${pastPath} L ${pastPoints[pastPoints.length - 1].x} ${CHART_Y + CHART_H} L ${CHART_LEFT} ${CHART_Y + CHART_H} Z`}
            fill="url(#trajectoryFade)"
          />

          {/* Past trajectory — solid */}
          <path
            d={pastPath}
            fill="none"
            stroke="var(--ds-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Future projection — dashed */}
          <path
            d={futurePath}
            fill="none"
            stroke="var(--ds-accent)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.55"
          />

          {/* Today vertical dashed line */}
          <line
            x1={todayX}
            y1={CHART_Y}
            x2={todayX}
            y2={CHART_Y + CHART_H}
            stroke="var(--ds-border-medium)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Today dot */}
          <circle
            cx={todayX}
            cy={todayY}
            r="4"
            fill="var(--ds-accent)"
          />
          <circle
            cx={todayX}
            cy={todayY}
            r="8"
            fill="var(--ds-accent)"
            opacity="0.2"
          />

          {/* Goal markers on future line */}
          {(goals || []).map((g, i) => {
            const gFrac = Math.max(0, Math.min(1, (g.pct - currentPct) / Math.max(1, endPct - currentPct)));
            const gPoint = futurePoints[Math.min(futurePoints.length - 1, Math.round(gFrac * (futurePoints.length - 1)))];
            if (!gPoint) return null;
            return (
              <g key={i}>
                <rect
                  x={gPoint.x - 20}
                  y={gPoint.y - 18}
                  width={40}
                  height={14}
                  rx={7}
                  fill="var(--ds-green)"
                  opacity="0.85"
                />
                <text
                  x={gPoint.x}
                  y={gPoint.y - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--ds-bg-deep)"
                  fontWeight="600"
                >
                  {g.label}
                </text>
              </g>
            );
          })}

          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={m.x}
              y={CHART_Y + CHART_H + 14}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ds-text-muted)"
            >
              {m.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Footer */}
      <div style={FOOTER_STYLE}>
        {avgPerDay} neue Karten / Tag Wachstum · {dailyPflege} Pflege-Reviews · {dailyTotal} Karten gesamt
      </div>
    </div>
  );
}
