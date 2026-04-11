import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Copy, LogOut, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';
import { bridgeAction } from '../actions';

const PLAN_MAP = {
  free:  { name: 'Free',  price: 'Kostenlos' },
  tier1: { name: 'Pro',   price: '4,99€ / Monat' },
  tier2: { name: 'Max',   price: '14,99€ / Monat' },
};

const SHORTCUTS = [
  { label: 'Chat fokussieren', keys: ['⌘K'] },
  { label: 'Menü öffnen',     keys: ['⌘I'] },
  { label: 'Weiter / Zurück', keys: ['Space'] },
  { label: 'Ausführen / Vertiefen', keys: ['Enter'] },
  { label: 'Zwischen Karten', keys: ['←', '→'] },
];

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark',   label: 'Dunkel', icon: Moon },
  { value: 'light',  label: 'Hell',   icon: Sun },
];

// ---------------------------------------------------------------------------
// RemoteSection
// ---------------------------------------------------------------------------

const REMOTE_BTN_STYLE = {
  width: '100%',
  padding: 'var(--ds-space-md) var(--ds-space-lg)',
  borderRadius: 'var(--ds-radius-sm)',
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-bg-canvas)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--ds-space-sm)',
  cursor: 'default',
  fontFamily: 'inherit',
};

const COMING_SOON_STYLE = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--ds-accent)',
  background: 'var(--ds-accent-10)',
  padding: '2px 6px',
  borderRadius: 'var(--ds-radius-sm)',
  marginLeft: 'auto',
};

function RemoteSection() {
  return (
    <div style={{ marginTop: 'var(--ds-space-lg)' }}>
      <div style={REMOTE_BTN_STYLE}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
          <polyline points="17 2 12 7 7 2" />
        </svg>
        <span style={{ fontSize: 'var(--ds-text-sm)', fontWeight: 500, color: 'var(--ds-text-primary)' }}>Remote</span>
        <span style={COMING_SOON_STYLE}>Coming Soon</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function SettingsSidebar() {
  const [status, setStatus] = useState({
    tier: 'free',
    theme: 'dark',
    planName: 'Starter',
    price: 'Kostenlos',
    isAuthenticated: false,
    tokenUsed: 0,
    tokenLimit: 0,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [copyLabel, setCopyLabel] = useState(null); // null = default, string = temporary
  const [indexing, setIndexing] = useState(null);
  const [kgMetrics, setKgMetrics] = useState(null); // { backend, totalCards, reviewedCards, avgEase, avgInterval }

  // Request status from Python on mount
  useEffect(() => {
    bridgeAction('sidebarGetStatus');
    bridgeAction('sidebarGetIndexingStatus');
    bridgeAction('sidebarGetKgMetrics');
    const interval = setInterval(() => {
      bridgeAction('sidebarGetIndexingStatus');
      bridgeAction('sidebarGetKgMetrics');
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Ensure window.ankiReceive exists (sidebar may render without AppInner)
  useEffect(() => {
    if (!window.ankiReceive) {
      window.ankiReceive = (payload) => {
        window.dispatchEvent(new CustomEvent('ankiReceive', { detail: payload }));
      };
    }
  }, []);

  // Listen for messages from Python via ankiReceive (safe — doesn't override the handler)
  useEffect(() => {
    const handler = (e) => {
      const payload = e.detail;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'sidebarStatus') {
        const d = payload.data || {};
        const plan = PLAN_MAP[d.tier] || PLAN_MAP.free;
        setStatus({
          tier: d.tier || 'free',
          theme: d.theme || 'dark',
          planName: plan.name,
          price: plan.price,
          isAuthenticated: !!d.isAuthenticated,
          tokenUsed: d.tokenUsed || 0,
          tokenLimit: d.tokenLimit || 0,
        });
        setStatusLoaded(true);
        document.documentElement.setAttribute('data-theme', d.theme === 'light' ? 'light' : 'dark');
      }
      if (payload.type === 'themeChanged') {
        const theme = payload.data?.theme;
        if (theme) {
          setStatus(prev => ({ ...prev, theme }));
          document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
        }
      }
      if (payload.type === 'indexingStatus') {
        setIndexing(payload.data);
      }
      if (payload.type === 'kgMetrics') {
        setKgMetrics(payload.data);
      }
      if (payload.type === 'sidebarLogsCopied') {
        setCopyLabel('Kopiert ✓');
        setTimeout(() => setCopyLabel(null), 2000);
      }
    };
    window.addEventListener('ankiReceive', handler);
    return () => window.removeEventListener('ankiReceive', handler);
  }, []);

  const setTheme = useCallback((theme) => {
    setStatus(prev => ({ ...prev, theme }));
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    bridgeAction('sidebarSetTheme', theme);
  }, []);

  const openNativeSettings = useCallback(() => bridgeAction('sidebarOpenNativeSettings'), []);
  const copyLogs = useCallback(() => bridgeAction('sidebarCopyLogs'), []);
  const handleUpgrade = useCallback(() => bridgeAction('sidebarOpenUpgrade'), []);
  const handleConnect = useCallback(() => bridgeAction('sidebarConnect'), []);
  const handleLogout = useCallback(() => bridgeAction('sidebarLogout'), []);

  const tokenPct = status.tokenLimit > 0
    ? Math.round((status.tokenUsed / status.tokenLimit) * 100)
    : 0;

  const isPaid = status.tier !== 'free';

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden select-none"
      style={{
        background: 'var(--ds-bg-deep)',
        fontFamily: 'var(--ds-font-sans)',
        WebkitFontSmoothing: 'antialiased',
        color: 'var(--ds-text-primary)',
        padding: '16px 14px',
      }}
    >
      {/* Hide scrollbar + plan card gradient border */}
      <style>{`
        ::-webkit-scrollbar { width: 0; }
        .plan-card-paid {
          position: relative;
        }
        .plan-card-paid::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(
            160deg,
            color-mix(in srgb, var(--ds-accent) 50%, transparent) 0%,
            color-mix(in srgb, var(--ds-accent) 10%, transparent) 40%,
            color-mix(in srgb, var(--ds-accent) 25%, transparent) 100%
          );
          -webkit-mask: linear-gradient(white 0 0) content-box, linear-gradient(white 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      {/* Status Card */}
      <div
        className={isPaid ? 'plan-card-paid' : ''}
        style={{
          padding: 14,
          marginBottom: 12,
          borderRadius: 'var(--ds-radius-md)',
          background: isPaid
            ? 'linear-gradient(135deg, var(--ds-accent-10) 0%, var(--ds-accent-5, var(--ds-active-tint)) 100%)'
            : 'var(--ds-hover-tint)',
          border: isPaid ? 'none' : '1px solid var(--ds-border-subtle)',
          boxShadow: isPaid
            ? 'var(--ds-shadow-sm)'
            : 'none',
        }}
      >
        {!statusLoaded ? (
          <SettingsCardSkeleton />
        ) : (
          <>
            <div
              className="uppercase font-semibold tracking-wide"
              style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--ds-text-tertiary)', marginBottom: 4 }}
            >
              DEIN PLAN
            </div>
            <div className="flex justify-between items-baseline" style={{ marginBottom: 10 }}>
              <span className="font-bold" style={{ fontSize: 18, color: 'var(--ds-text-primary)' }}>
                {status.planName}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>
                {status.price}
              </span>
            </div>

            {/* Token bar */}
            <div
              className="w-full rounded-sm overflow-hidden"
              style={{ height: 3, background: 'var(--ds-border-subtle)', marginBottom: 6 }}
            >
              <div
                className="h-full rounded-sm transition-all duration-400"
                style={{ width: `${tokenPct}%`, background: 'var(--ds-accent)' }}
              />
            </div>

            <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--ds-text-tertiary)' }}>
                {status.isAuthenticated
                  ? (status.tokenLimit > 0 ? `${tokenPct}%` : 'Verbunden')
                  : 'Nicht verbunden'}
              </span>
              <button
                onClick={status.isAuthenticated ? handleUpgrade : handleConnect}
                className="font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontSize: 11,
                  color: '#fff',
                  background: 'var(--ds-accent)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  borderRadius: 'var(--ds-radius-sm)',
                  fontFamily: 'inherit',
                }}
              >
                {!status.isAuthenticated
                  ? 'Verbinden'
                  : status.tier === 'free' ? 'Upgrade' : 'Verwalten'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Theme Toggle */}
      <div
        className="uppercase font-semibold tracking-wide"
        style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ds-text-muted)', marginBottom: 8 }}
      >
        Erscheinungsbild
      </div>
      <div
        className="flex rounded-[var(--ds-radius-sm)]"
        style={{ background: 'var(--ds-hover-tint)', padding: 3 }}
      >
        {THEME_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className="flex-1 text-center transition-all duration-200"
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '6px 0',
              borderRadius: 'var(--ds-radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: status.theme === opt.value ? 'var(--ds-active-tint)' : 'transparent',
              color: status.theme === opt.value ? 'var(--ds-text-primary)' : 'var(--ds-text-tertiary)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--ds-border-subtle)', margin: '12px 0' }} />

      {/* KG Metrics (neo4j) or Indexing Gauge (sqlite fallback) */}
      {kgMetrics?.backend === 'neo4j' ? (
        <KgMetrics data={kgMetrics} />
      ) : indexing ? (
        <IndexingGauge data={indexing} />
      ) : (
        <MetricsSkeleton />
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--ds-border-subtle)', margin: '12px 0' }} />

      {/* Action Rows */}
      <div>
        <ActionRow
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" /></svg>}
          label="Remote"
          sub="Coming Soon"
        />
        <ActionRow icon={<Settings size={16} />} label="Anki-Einstellungen" onClick={openNativeSettings} chevron />
        <ActionRow
          icon={<Copy size={16} />}
          label={copyLabel || 'Logs kopieren'}
          sub={copyLabel ? null : 'Debug-Info'}
          onClick={copyLogs}
          last
        />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--ds-border-subtle)', margin: '12px 0' }} />

      {/* Shortcuts */}
      <div>
        <div
          className="uppercase"
          style={{
            fontSize: 9,
            letterSpacing: '0.06em',
            color: 'var(--ds-text-muted)',
            fontWeight: 400,
            marginBottom: 8,
          }}
        >
          Tastenkürzel
        </div>
        <div className="flex flex-col" style={{ gap: 7 }}>
          {SHORTCUTS.map(sc => (
            <div key={sc.label} className="flex justify-between items-center">
              <span style={{ fontSize: 10, color: 'var(--ds-text-muted)' }}>{sc.label}</span>
              <div className="flex" style={{ gap: 3 }}>
                {sc.keys.map(k => (
                  <kbd
                    key={k}
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--ds-font-mono)',
                      color: 'var(--ds-text-tertiary)',
                      background: 'var(--ds-hover-tint)',
                      padding: '3px 8px',
                      borderRadius: 5,
                      border: '1px solid var(--ds-border-subtle)',
                      lineHeight: 1,
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Remote Section moved to Action Rows above */}

      {/* Divider + Logout */}
      {status.isAuthenticated && (
        <>
          <div style={{ height: 1, background: 'var(--ds-border-subtle)', margin: '12px 0' }} />
          <button
            onClick={handleLogout}
            className="w-full text-center transition-all duration-150 hover:bg-[var(--ds-red-tint)]"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--ds-red)',
              padding: '10px 0',
              borderRadius: 'var(--ds-radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: 'transparent',
            }}
          >
            Abmelden
          </button>
        </>
      )}
    </div>
  );
}

/* ─── KG Metrics (Neo4j) ─── */

const KG_RING_SIZE = 64;
const KG_RING_CENTER = KG_RING_SIZE / 2;
const KG_RING_R = 26;
const KG_RING_STROKE = 4;
const KG_RING_CIRC = 2 * Math.PI * KG_RING_R;

const KG_LABEL_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)', fontWeight: 500,
};
const KG_VALUE_STYLE = {
  fontSize: 13, color: 'var(--ds-text-primary)', fontWeight: 600,
  fontFamily: 'var(--ds-font-mono, monospace)',
};
const KG_DOT_STYLE = (color) => ({
  width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
});
const KG_ROW_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '4px 0',
};

function KgMetrics({ data }) {
  const total = data?.totalCards || 0;
  const reviewed = data?.reviewedCards || 0;
  const avgEase = data?.avgEase || 0;
  const avgInterval = data?.avgInterval || 0;

  const pct = total > 0 ? Math.min(1, reviewed / total) : 0;
  const offset = KG_RING_CIRC * (1 - pct);
  const fmt = (n) => n.toLocaleString('de-DE');

  // Ease color: 1.0=red, 2.5=yellow, 4.0=green
  const easeColor = avgEase <= 1.5 ? 'var(--ds-red)'
    : avgEase <= 2.5 ? 'var(--ds-yellow)'
    : 'var(--ds-green)';

  return (
    <div>
      <div
        className="uppercase font-semibold tracking-wide"
        style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ds-text-muted)', marginBottom: 12 }}
      >
        Knowledge Graph
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Ring chart */}
        <svg
          width={KG_RING_SIZE}
          height={KG_RING_SIZE}
          viewBox={`0 0 ${KG_RING_SIZE} ${KG_RING_SIZE}`}
          style={{ flexShrink: 0 }}
        >
          <circle cx={KG_RING_CENTER} cy={KG_RING_CENTER} r={KG_RING_R}
            fill="none" stroke="var(--ds-border-subtle)" strokeWidth={KG_RING_STROKE}
            opacity={0.4}
          />
          <circle cx={KG_RING_CENTER} cy={KG_RING_CENTER} r={KG_RING_R}
            fill="none" stroke="var(--ds-green)" strokeWidth={KG_RING_STROKE}
            strokeDasharray={KG_RING_CIRC}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${KG_RING_CENTER} ${KG_RING_CENTER})`}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
          <text x={KG_RING_CENTER} y={KG_RING_CENTER + 1} textAnchor="middle"
            dominantBaseline="central"
            fill="var(--ds-text-primary)" fontSize="14" fontWeight="700"
            fontFamily="var(--ds-font-mono, monospace)"
          >
            {Math.round(pct * 100)}%
          </text>
        </svg>

        {/* Stats */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={KG_ROW_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={KG_DOT_STYLE('var(--ds-accent)')} />
              <span style={KG_LABEL_STYLE}>Cards</span>
            </div>
            <span style={KG_VALUE_STYLE}>{fmt(total)}</span>
          </div>

          <div style={KG_ROW_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={KG_DOT_STYLE('var(--ds-green)')} />
              <span style={KG_LABEL_STYLE}>Reviewed</span>
            </div>
            <span style={KG_VALUE_STYLE}>{fmt(reviewed)}</span>
          </div>

          <div style={KG_ROW_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={KG_DOT_STYLE(easeColor)} />
              <span style={KG_LABEL_STYLE}>Avg. Ease</span>
            </div>
            <span style={KG_VALUE_STYLE}>{avgEase.toFixed(1)}</span>
          </div>

          <div style={KG_ROW_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={KG_DOT_STYLE('var(--ds-purple)')} />
              <span style={KG_LABEL_STYLE}>Avg. Interval</span>
            </div>
            <span style={KG_VALUE_STYLE}>{avgInterval}d</span>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Dual Arc Gauge ─── */

const ARC_SIZE = 120;
const ARC_CENTER = ARC_SIZE / 2;
const R_OUTER = 48;
const R_INNER = 36;
const STROKE_W = 5;
const CIRC_OUTER = 2 * Math.PI * R_OUTER;
const CIRC_INNER = 2 * Math.PI * R_INNER;

const INFO_TEXT = 'Einmaliger Prozess beim ersten Start. Embeddings ermöglichen semantische Suche, der Knowledge Graph verknüpft Fachbegriffe deiner Karten. Wird bei neuen Karten automatisch aktualisiert. Kostet einmalig wenige Cent an Tokens.';

function IndexingGauge({ data }) {
  const emb = data?.embeddings || { total: 0, done: 0 };
  const kg = data?.kgTerms || { total: 0, done: 0, totalTerms: 0 };
  const kgEmb = data?.kgTermEmbeddings || { total: 0, done: 0 };
  const [showInfo, setShowInfo] = useState(false);

  const embPct = emb.total > 0 ? Math.min(1, emb.done / emb.total) : 0;
  const kgPct = kg.total > 0 ? Math.min(1, kg.done / kg.total) : 0;
  const isActive = (embPct < 1 || kgPct < 1) && emb.total > 0;

  const embOffset = CIRC_OUTER * (1 - embPct);
  const kgOffset = CIRC_INNER * (1 - kgPct);

  const fmt = (n) => n.toLocaleString('de-DE');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div
          className="uppercase font-semibold tracking-wide"
          style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--ds-text-muted)' }}
        >
          Indexierung
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '1px solid var(--ds-border-medium)',
            background: showInfo ? 'var(--ds-active-tint)' : 'transparent',
            color: 'var(--ds-text-muted)', fontSize: 9, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0,
          }}
        >?</button>
      </div>

      {showInfo && (
        <div style={{
          fontSize: 10, lineHeight: 1.5,
          color: 'var(--ds-text-tertiary)',
          padding: '8px 10px', marginBottom: 10,
          background: 'var(--ds-hover-tint)',
          borderRadius: 8,
          border: '1px solid var(--ds-border-subtle)',
        }}>
          {INFO_TEXT}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* SVG Gauge */}
        <svg
          width={ARC_SIZE}
          height={ARC_SIZE}
          viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`}
          style={{ flexShrink: 0 }}
        >
          {/* Background tracks */}
          <circle cx={ARC_CENTER} cy={ARC_CENTER} r={R_OUTER}
            fill="none" stroke="var(--ds-border-subtle)" strokeWidth={STROKE_W}
            opacity={0.4}
          />
          <circle cx={ARC_CENTER} cy={ARC_CENTER} r={R_INNER}
            fill="none" stroke="var(--ds-border-subtle)" strokeWidth={STROKE_W}
            opacity={0.4}
          />

          {/* Progress arcs — no glow, clean */}
          <circle cx={ARC_CENTER} cy={ARC_CENTER} r={R_OUTER}
            fill="none" stroke="var(--ds-accent)" strokeWidth={STROKE_W}
            strokeDasharray={CIRC_OUTER}
            strokeDashoffset={embOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${ARC_CENTER} ${ARC_CENTER})`}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
          <circle cx={ARC_CENTER} cy={ARC_CENTER} r={R_INNER}
            fill="none" stroke="#30D158" strokeWidth={STROKE_W}
            strokeDasharray={CIRC_INNER}
            strokeDashoffset={kgOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${ARC_CENTER} ${ARC_CENTER})`}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />

          {/* Center text */}
          <text x={ARC_CENTER} y={ARC_CENTER - 6} textAnchor="middle"
            fill="var(--ds-text-primary)" fontSize="18" fontWeight="700"
            fontFamily="var(--ds-font-mono, 'SF Mono', monospace)"
          >
            {Math.round(((embPct + kgPct) / 2) * 100)}%
          </text>
          <text x={ARC_CENTER} y={ARC_CENTER + 10} textAnchor="middle"
            fill="var(--ds-text-muted)" fontSize="8" fontWeight="500"
            letterSpacing="0.05em"
          >
            {isActive ? 'INDEXING' : 'SYNCED'}
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--ds-accent)', flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
                Embeddings
              </span>
            </div>
            <span style={{
              fontSize: 11, color: 'var(--ds-text-muted)',
              fontFamily: 'var(--ds-font-mono, monospace)',
            }}>
              {fmt(emb.done)} / {fmt(emb.total)}
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#30D158', flexShrink: 0,
              }} />
              <span style={{ fontSize: 10, color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
                Knowledge Graph
              </span>
            </div>
            <span style={{
              fontSize: 11, color: 'var(--ds-text-muted)',
              fontFamily: 'var(--ds-font-mono, monospace)',
            }}>
              {fmt(kg.done)} / {fmt(kg.total)}
            </span>
            {kg.totalTerms > 0 && (
              <span style={{
                fontSize: 11, color: 'var(--ds-text-muted)',
                fontFamily: 'var(--ds-font-mono, monospace)',
                marginLeft: 6,
              }}>
                · {fmt(kg.totalTerms)} Begriffe
              </span>
            )}
          </div>

          {kgEmb.total > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--ds-yellow)', flexShrink: 0,
                }} />
                <span style={{ fontSize: 10, color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
                  Begriffe Embedded
                </span>
              </div>
              <span style={{
                fontSize: 11, color: 'var(--ds-text-muted)',
                fontFamily: 'var(--ds-font-mono, monospace)',
              }}>
                {fmt(kgEmb.done)} / {fmt(kgEmb.total)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ─── Skeleton Components ─── */

const SKELETON_SHIMMER = `
@keyframes settingsShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

const SKEL_BAR_STYLE = {
  borderRadius: 4,
  background: 'linear-gradient(90deg, var(--ds-border-subtle) 25%, var(--ds-hover-tint) 50%, var(--ds-border-subtle) 75%)',
  backgroundSize: '200% 100%',
  animation: 'settingsShimmer 1.8s ease-in-out infinite',
};

function SettingsCardSkeleton() {
  return (
    <>
      <style>{SKELETON_SHIMMER}</style>
      {/* Plan label */}
      <div style={{ ...SKEL_BAR_STYLE, width: 60, height: 8, marginBottom: 10 }} />
      {/* Plan name + price row */}
      <div className="flex justify-between items-baseline" style={{ marginBottom: 12 }}>
        <div style={{ ...SKEL_BAR_STYLE, width: 50, height: 16 }} />
        <div style={{ ...SKEL_BAR_STYLE, width: 80, height: 10 }} />
      </div>
      {/* Token bar */}
      <div style={{ ...SKEL_BAR_STYLE, width: '100%', height: 3, marginBottom: 8 }} />
      {/* Status + button row */}
      <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
        <div style={{ ...SKEL_BAR_STYLE, width: 70, height: 9 }} />
        <div style={{ ...SKEL_BAR_STYLE, width: 64, height: 24, borderRadius: 'var(--ds-radius-sm)' }} />
      </div>
    </>
  );
}

function MetricsSkeleton() {
  return (
    <div>
      <style>{SKELETON_SHIMMER}</style>
      {/* Section label */}
      <div style={{ ...SKEL_BAR_STYLE, width: 80, height: 8, marginBottom: 14 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Ring placeholder */}
        <div style={{ ...SKEL_BAR_STYLE, width: 64, height: 64, borderRadius: '50%', flexShrink: 0 }} />
        {/* Stats rows */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ ...SKEL_BAR_STYLE, width: 50, height: 10 }} />
            <div style={{ ...SKEL_BAR_STYLE, width: 36, height: 10 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ ...SKEL_BAR_STYLE, width: 60, height: 10 }} />
            <div style={{ ...SKEL_BAR_STYLE, width: 30, height: 10 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ ...SKEL_BAR_STYLE, width: 55, height: 10 }} />
            <div style={{ ...SKEL_BAR_STYLE, width: 24, height: 10 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reusable action row */
function ActionRow({ icon, label, sub, onClick, chevron, last }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center cursor-pointer transition-colors duration-150 hover:bg-[var(--ds-hover-tint)]"
      style={{ padding: '8px 6px', borderRadius: 'var(--ds-radius-sm)', marginBottom: last ? 0 : 4 }}
    >
      <div
        className="flex-shrink-0"
        style={{ width: 16, height: 16, marginRight: 10, color: 'var(--ds-text-tertiary)' }}
      >
        {icon}
      </div>
      <span className="flex-1" style={{ fontSize: 13, color: 'var(--ds-text-secondary)' }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: 'var(--ds-text-muted)', marginRight: chevron ? 6 : 0 }}>
          {sub}
        </span>
      )}
      {chevron && (
        <ChevronRight size={14} style={{ color: 'var(--ds-text-muted)' }} />
      )}
    </div>
  );
}
