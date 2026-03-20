import React from 'react';
import InsightBullet from './InsightBullet';
import MiniChart from './MiniChart';

export default function InsightsDashboard({
  insights = { version: 1, insights: [] },
  cardStats = {},
  chartData = { main: [], flip: [], mc: [], text: [] },
  isExtracting = false,
  onCitationClick,
}) {
  const hasInsights = insights.insights?.length > 0;
  const hasStats = (cardStats.reps || 0) > 0;
  const successRate = cardStats.reps
    ? Math.round(((cardStats.reps - (cardStats.lapses || 0)) / cardStats.reps) * 100)
    : 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '28px 24px 140px',
        position: 'relative',
      }}
    >
      {isExtracting && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent, var(--ds-hover-tint), transparent)',
            animation: 'shimmer 2s infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      <div style={{ marginBottom: 36 }}>
        {hasInsights ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--ds-text-muted)', letterSpacing: '0.3px', marginBottom: 20 }}>
              {insights.insights.length} Erkenntnisse gesammelt
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {insights.insights.map((insight, i) => (
                <InsightBullet
                  key={i}
                  text={insight.text}
                  type={insight.type}
                  citations={insight.citations}
                  onCitationClick={onCitationClick}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--ds-text-muted)', lineHeight: 1.5 }}>
            Noch keine Erkenntnisse — starte einen Chat, um Lernpunkte zu sammeln
          </div>
        )}
      </div>

      <div>
        <div
          style={{
            height: 1,
            background: 'var(--ds-border-subtle)',
            marginBottom: 14,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'end', gap: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ds-text-placeholder)' }}>
                {hasStats ? cardStats.reps : '0'}
              </div>
              <div style={{ fontSize: 8, color: 'var(--ds-text-muted)', marginTop: 2 }}>REV</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ds-text-placeholder)' }}>
                {hasStats ? `${successRate}%` : '—'}
              </div>
              <div style={{ fontSize: 8, color: 'var(--ds-text-muted)', marginTop: 2 }}>OK</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ds-text-placeholder)' }}>
                {hasStats ? `${cardStats.interval || 0}d` : '—'}
              </div>
              <div style={{ fontSize: 8, color: 'var(--ds-text-muted)', marginTop: 2 }}>IVL</div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <MiniChart
              data={chartData.main}
              color="rgba(140,120,200,0.35)"
              fillColor="rgba(140,120,200,0.1)"
              height={36}
              id="main"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <MiniChart data={chartData.flip} color="rgba(20,184,166,0.2)" fillColor="rgba(20,184,166,0.1)" height={24} label="FLIP" id="flip" />
          </div>
          <div style={{ flex: 1 }}>
            <MiniChart data={chartData.mc} color="rgba(10,132,255,0.18)" fillColor="rgba(10,132,255,0.1)" height={24} label="MC" id="mc" />
          </div>
          <div style={{ flex: 1 }}>
            <MiniChart data={chartData.text} color="rgba(249,115,22,0.18)" fillColor="rgba(249,115,22,0.1)" height={24} label="TEXT" id="text" />
          </div>
        </div>
      </div>
    </div>
  );
}
