import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Copy, LogOut, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
// Module-level style constants
// ---------------------------------------------------------------------------

const QR_CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--ds-space-md)',
  padding: 'var(--ds-space-lg)',
  background: 'var(--ds-bg-canvas)',
  borderRadius: 'var(--ds-radius-lg)',
  border: '1px solid var(--ds-border)',
};

const QR_IMG_STYLE = {
  width: 200,
  height: 200,
  borderRadius: 'var(--ds-radius-md)',
};

const STATUS_DOT_STYLE = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
  marginRight: 'var(--ds-space-xs)',
};

// ---------------------------------------------------------------------------
// RemoteSection
// ---------------------------------------------------------------------------

function RemoteSection() {
  const [pairUrl, setPairUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);

  // Listen for QR data and status via CustomEvent dispatched by App.jsx
  useEffect(() => {
    const handler = (e) => {
      const payload = e?.detail;
      if (!payload || !payload.type) return;

      if (payload.type === 'sidebarRemoteQR') {
        setLoading(false);
        const d = payload.data || {};
        if (d.error) {
          console.error('Remote QR error:', d.error);
          return;
        }
        if (d.pair_url) setPairUrl(d.pair_url);
      }
      if (payload.type === 'sidebarRemoteStatus') {
        const d = payload.data || {};
        if (d.connected) setConnected(true);
        if (d.peer_connected) setPeerConnected(true);
      }
    };
    window.addEventListener('ankiReceive', handler);
    // Check status on mount — relay may already be connected from auto-reconnect
    bridgeAction('sidebarGetRemoteStatus');
    return () => window.removeEventListener('ankiReceive', handler);
  }, []);

  const generateQR = useCallback(() => {
    setLoading(true);
    bridgeAction('sidebarGetRemoteQR');
    // Also poll status immediately — pair_code may already exist from startup
    bridgeAction('sidebarGetRemoteStatus');
  }, []);

  return (
    <div style={{ marginTop: 'var(--ds-space-lg)' }}>
      <h3 style={{ fontSize: 'var(--ds-text-md)', fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 'var(--ds-space-sm)' }}>
        Remote
      </h3>

      {peerConnected ? (
        <div style={QR_CONTAINER_STYLE}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ ...STATUS_DOT_STYLE, background: 'var(--ds-green)' }} />
            <span style={{ fontSize: 'var(--ds-text-md)', color: 'var(--ds-green)' }}>Verbunden</span>
          </div>
        </div>
      ) : connected ? (
        <div style={QR_CONTAINER_STYLE}>
          <p style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-secondary)', textAlign: 'center' }}>
            Relay verbunden — öffne die PWA auf deinem Handy
          </p>
        </div>
      ) : pairUrl ? (
        <div style={QR_CONTAINER_STYLE}>
          <QRCodeSVG
            value={pairUrl}
            size={180}
            bgColor="transparent"
            fgColor="currentColor"
            level="M"
          />
          <p style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-tertiary)', textAlign: 'center' }}>
            Scanne mit deinem Handy
          </p>
        </div>
      ) : (
        <button
          onClick={generateQR}
          disabled={loading}
          style={{
            width: '100%',
            padding: 'var(--ds-space-md)',
            borderRadius: 'var(--ds-radius-lg)',
            border: '1px solid var(--ds-border)',
            background: 'var(--ds-bg-canvas)',
            color: 'var(--ds-text-primary)',
            fontSize: 'var(--ds-text-sm)',
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Verbindung wird hergestellt...' : 'Remote verbinden'}
        </button>
      )}
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
  const [copyLabel, setCopyLabel] = useState(null); // null = default, string = temporary
  const [indexing, setIndexing] = useState(null); // { embeddings: {total, done}, kgTerms: {total, done, totalTerms} }

  // Request status from Python on mount
  useEffect(() => {
    bridgeAction('sidebarGetStatus');
    bridgeAction('sidebarGetIndexingStatus');
    // Poll indexing status every 10s (background thread updates DB)
    const interval = setInterval(() => bridgeAction('sidebarGetIndexingStatus'), 10000);
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
              color: 'var(--ds-accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {!status.isAuthenticated
              ? 'Verbinden →'
              : status.tier === 'free' ? 'Upgrade →' : 'Abo verwalten →'}
          </button>
        </div>
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

      {/* Indexing Status Gauge */}
      {indexing && <IndexingGauge data={indexing} />}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--ds-border-subtle)', margin: '12px 0' }} />

      {/* Action Rows */}
      <div>
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

      {/* Remote Section */}
      <div style={{ height: 1, background: 'var(--ds-border-subtle)', margin: '12px 0' }} />
      <RemoteSection />

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
