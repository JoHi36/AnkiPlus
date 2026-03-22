import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Copy, LogOut, ChevronRight, Sun, Moon, Monitor } from 'lucide-react';

const PLAN_MAP = {
  free:  { name: 'Starter',  price: 'Kostenlos' },
  tier1: { name: 'Student',  price: '4,99€ / Monat' },
  tier2: { name: 'Exam Pro', price: '14,99€ / Monat' },
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

  // Request status from Python on mount
  useEffect(() => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('sidebarGetStatus', null);
    }
  }, []);

  // Listen for messages from Python
  useEffect(() => {
    const handler = (payload) => {
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
        // Set data-theme attribute on the html element
        document.documentElement.setAttribute(
          'data-theme',
          d.theme === 'light' ? 'light' : 'dark'
        );
      }

      if (payload.type === 'themeChanged') {
        const theme = payload.data?.theme;
        if (theme) {
          setStatus(prev => ({ ...prev, theme }));
          document.documentElement.setAttribute(
            'data-theme',
            theme === 'light' ? 'light' : 'dark'
          );
        }
      }

      if (payload.type === 'sidebarLogsCopied') {
        setCopyLabel('Kopiert! ✓');
        setTimeout(() => setCopyLabel(null), 1500);
      }
    };

    // Store previous handler and chain
    const prev = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (prev) prev(payload);
      handler(payload);
    };

    return () => {
      window.ankiReceive = prev;
    };
  }, []);

  const setTheme = useCallback((theme) => {
    setStatus(prev => ({ ...prev, theme }));
    document.documentElement.setAttribute(
      'data-theme',
      theme === 'light' ? 'light' : 'dark'
    );
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('sidebarSetTheme', theme);
    }
  }, []);

  const openNativeSettings = useCallback(() => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('sidebarOpenNativeSettings', null);
    }
  }, []);

  const copyLogs = useCallback(() => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('sidebarCopyLogs', null);
    }
  }, []);

  const handleUpgrade = useCallback(() => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('sidebarOpenUpgrade', null);
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('sidebarLogout', null);
    }
  }, []);

  const tokenPct = status.tokenLimit > 0
    ? Math.round((status.tokenUsed / status.tokenLimit) * 100)
    : 0;

  const tierGradient = {
    free:  'from-[var(--ds-hover-tint)] to-transparent border-[var(--ds-border-subtle)]',
    tier1: 'from-[rgba(10,132,255,0.07)] to-[rgba(10,132,255,0.02)] border-[rgba(10,132,255,0.12)]',
    tier2: 'from-[rgba(168,85,247,0.07)] to-[rgba(168,85,247,0.02)] border-[rgba(168,85,247,0.12)]',
  };

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
      {/* Hide scrollbar */}
      <style>{`
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      {/* Status Card */}
      <div
        className={`rounded-[var(--ds-radius-md)] bg-gradient-to-br ${tierGradient[status.tier] || tierGradient.free} border`}
        style={{ padding: 14, marginBottom: 12 }}
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
          <span style={{ fontSize: 10, color: 'var(--ds-text-tertiary)' }}>{tokenPct}%</span>
          <button
            onClick={handleUpgrade}
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
            {status.tier === 'free' ? 'Upgrade →' : 'Abo verwalten →'}
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
              color: 'rgba(255, 59, 48, 0.6)',
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
