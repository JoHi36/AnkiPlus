import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Settings, Sparkles, Zap, Crown, GraduationCap,
  CreditCard, Eye, EyeOff, AlertCircle, Loader2, Save, Key,
  ChevronRight, ExternalLink, Check,
  MessageSquare, Image, GitBranch, FlaskConical,
  Sun, Moon, Monitor
} from 'lucide-react';

/**
 * SettingsModal — Unified settings hub
 * Three tabs: Profil · Allgemein · KI
 * Frosted dark glass aesthetic
 */
export default function SettingsModal({ isOpen, onClose, bridge, isReady, showCodeInput = false, onCodeInputClose }) {
  const [activeTab, setActiveTab] = useState('profil');

  // ── Auth / Profile state ──
  const [authToken, setAuthToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState({
    authenticated: false, hasToken: false, backendUrl: '', backendMode: false
  });
  const [quotaStatus, setQuotaStatus] = useState(null);
  const [currentAuthToken, setCurrentAuthToken] = useState('');

  // ── General settings state ──
  const [theme, setTheme] = useState('auto');

  // ── AI settings state ──
  const [responseStyle, setResponseStyle] = useState('balanced');
  const [aiTools, setAiTools] = useState({ images: true, diagrams: true, molecules: false });

  // ── Load config on open ──
  useEffect(() => {
    if (isOpen && bridge && isReady) {
      checkAuthStatus();
      loadAuthToken();
      loadSettings();

      const timeout = setTimeout(() => {
        if (!currentAuthToken || !currentAuthToken.trim()) {
          setCurrentAuthToken('');
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isOpen, bridge, isReady]);

  // If showCodeInput is true, go to profil tab
  useEffect(() => {
    if (showCodeInput && isOpen) setActiveTab('profil');
  }, [showCodeInput, isOpen]);

  const checkAuthStatus = () => {
    if (bridge && bridge.getAuthStatus) {
      try {
        const status = JSON.parse(bridge.getAuthStatus());
        setAuthStatus(status);
      } catch (e) { /* ignore */ }
    }
  };

  const loadAuthToken = () => {
    if (bridge && bridge.getAuthToken) bridge.getAuthToken();
  };

  const loadSettings = () => {
    // Load AI tools
    if (bridge && bridge.getAITools) {
      try {
        const tools = JSON.parse(bridge.getAITools());
        setAiTools(tools);
      } catch (e) { /* ignore */ }
    }
    // Load response style & theme from config
    if (bridge && bridge.getResponseStyle) {
      try {
        const style = bridge.getResponseStyle();
        if (style) setResponseStyle(style);
      } catch (e) { /* ignore */ }
    }
    if (bridge && bridge.getTheme) {
      try {
        const t = bridge.getTheme();
        if (t) setTheme(t);
      } catch (e) { /* ignore */ }
    }
  };

  // ── Auth event handlers ──
  useEffect(() => {
    if (!isOpen) return;

    const handleAuthTokenLoaded = (data) => {
      const token = data?.token || '';
      setCurrentAuthToken(token);
      if (!token || !token.trim()) {
        setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
      }
    };

    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (originalAnkiReceive) originalAnkiReceive(payload);
      if (payload.type === 'authTokenLoaded' && payload.data) {
        handleAuthTokenLoaded(payload.data);
      } else if (payload.type === 'auth_success') {
        checkAuthStatus();
        loadAuthToken();
        setError('');
        setLoading(false);
        setAuthToken('');
      } else if (payload.type === 'auth_error') {
        setError(payload.message || 'Authentifizierung fehlgeschlagen');
        setLoading(false);
      } else if (payload.type === 'auth_logout') {
        setCurrentAuthToken('');
        setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
        setQuotaStatus(null);
      }
    };

    return () => { window.ankiReceive = originalAnkiReceive; };
  }, [isOpen]);

  // ── Fetch quota ──
  useEffect(() => {
    const hasValidToken = currentAuthToken && currentAuthToken.trim() !== '';
    if (!authStatus.authenticated || !authStatus.hasToken || !authStatus.backendUrl || !hasValidToken) {
      setQuotaStatus(null);
      return;
    }

    const fetchQuota = async () => {
      try {
        const response = await fetch(`${authStatus.backendUrl}/user/quota`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAuthToken}` },
        });
        if (response.ok) {
          setQuotaStatus(await response.json());
        } else if (response.status === 401) {
          setQuotaStatus(null);
          setCurrentAuthToken('');
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
          if (bridge && bridge.refreshAuth) bridge.refreshAuth();
        } else {
          setQuotaStatus(null);
        }
      } catch (err) {
        if (!currentAuthToken || !currentAuthToken.trim()) {
          setQuotaStatus(null);
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
        } else {
          setQuotaStatus(null);
        }
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [authStatus.authenticated, authStatus.backendUrl, currentAuthToken, bridge]);

  // ── Handlers ──
  const handleTokenSave = async () => {
    if (!authToken.trim()) { setError('Bitte gib einen Token ein'); return; }
    setLoading(true);
    setError('');
    try {
      if (bridge && bridge.authenticate) bridge.authenticate(authToken.trim(), '');
      else { setError('Bridge nicht verfügbar'); setLoading(false); }
    } catch (err) { setError('Fehler: ' + err.message); setLoading(false); }
  };

  const handleCodeSubmit = async () => {
    if (!code.trim()) { setError('Bitte gib einen Code ein'); return; }
    setError('');
    setMigrationLoading(true);
    try {
      if (bridge && bridge.saveAuthToken) {
        bridge.saveAuthToken(code.trim(), '');
        if (bridge && bridge.getDeviceId) {
          const deviceId = bridge.getDeviceId();
          if (deviceId && authStatus.backendUrl) {
            try {
              await fetch(`${authStatus.backendUrl}/migrate-anonymous`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${code.trim()}` },
                body: JSON.stringify({ deviceId }),
              });
            } catch (e) { /* non-critical */ }
          }
        }
        setTimeout(() => {
          checkAuthStatus();
          loadAuthToken();
          setCode('');
          if (onCodeInputClose) onCodeInputClose();
        }, 500);
      }
    } catch (err) { setError('Fehler: ' + err.message); }
    finally { setMigrationLoading(false); }
  };

  const handleLogout = () => {
    if (bridge && bridge.logout) bridge.logout();
    setCurrentAuthToken('');
    setAuthStatus({ authenticated: false, hasToken: false, backendUrl: authStatus.backendUrl, backendMode: authStatus.backendMode });
    setQuotaStatus(null);
    setAuthToken('');
    setError('');
  };

  const handleManageSubscription = () => {
    const url = 'https://anki-plus.vercel.app/dashboard/subscription';
    if (bridge && bridge.openUrl) bridge.openUrl(url);
    else window.open(url, '_blank');
  };

  const handleResponseStyleChange = (style) => {
    setResponseStyle(style);
    if (bridge && bridge.saveResponseStyle) bridge.saveResponseStyle(style);
  };

  const handleThemeChange = (t) => {
    setTheme(t);
    if (bridge && bridge.saveTheme) bridge.saveTheme(t);
  };

  const handleAiToolToggle = (tool) => {
    const updated = { ...aiTools, [tool]: !aiTools[tool] };
    setAiTools(updated);
    if (bridge && bridge.saveAITools) bridge.saveAITools(JSON.stringify(updated));
  };

  // ── Derived state ──
  const hasValidToken = currentAuthToken && currentAuthToken.trim() !== '';
  const isAuthenticated = hasValidToken && authStatus.authenticated && authStatus.hasToken;

  const getTierInfo = (tier) => {
    switch (tier) {
      case 'tier2': return { name: 'Exam Pro', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', description: 'Maximale Power' };
      case 'tier1': return { name: 'Student', icon: GraduationCap, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', description: 'Für ambitionierte Studenten' };
      default: return { name: 'Starter', icon: Zap, color: 'text-neutral-400', bg: 'bg-base-300/50', border: 'border-base-300', description: 'Kostenloser Einstieg' };
    }
  };

  const tierInfo = quotaStatus ? getTierInfo(quotaStatus.tier) : getTierInfo('free');
  const TierIcon = tierInfo.icon;

  const RESPONSE_STYLES = [
    { key: 'concise', label: 'Präzise', desc: 'Kurz & knapp', icon: '⚡' },
    { key: 'balanced', label: 'Ausgewogen', desc: 'Standard', icon: '⚖️' },
    { key: 'detailed', label: 'Detailliert', desc: 'Ausführlich', icon: '📖' },
    { key: 'friendly', label: 'Freundlich', desc: 'Ermutigend', icon: '😊' },
  ];

  const THEMES = [
    { key: 'auto', label: 'System', icon: Monitor },
    { key: 'dark', label: 'Dunkel', icon: Moon },
    { key: 'light', label: 'Hell', icon: Sun },
  ];

  if (!isOpen) return null;

  const tabs = [
    { key: 'profil', label: 'Profil', icon: User },
    { key: 'allgemein', label: 'Allgemein', icon: Settings },
    { key: 'ki', label: 'KI', icon: Sparkles },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="relative w-full max-w-[480px] overflow-hidden rounded-2xl"
          style={{
            backgroundColor: 'rgba(22,22,22,0.85)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-0">
            <h2 className="text-[15px] font-semibold text-base-content/90 tracking-tight">Einstellungen</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors text-base-content/40 hover:text-base-content/70"
            >
              <X size={15} />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 px-6 pt-4 pb-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-[6px] rounded-lg text-[12px] font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white/[0.08] text-base-content/90 border border-white/[0.06]'
                      : 'text-base-content/35 hover:text-base-content/60 hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Divider ── */}
          <div className="mx-6 mt-3 h-px bg-white/[0.06]" />

          {/* ── Tab Content ── */}
          <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>

            {/* ═══ PROFIL TAB ═══ */}
            {activeTab === 'profil' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {showCodeInput ? (
                  /* Code input mode */
                  <div className="flex flex-col items-center py-6 space-y-5">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(20,184,166,0.1)' }}>
                      <Key className="w-7 h-7 text-teal-400" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <h3 className="text-base font-semibold text-base-content">Code eingeben</h3>
                      <p className="text-xs text-base-content/40 max-w-[280px]">
                        Gib den Code ein, den du auf der Website erhalten hast
                      </p>
                    </div>
                    <div className="w-full space-y-3">
                      <input
                        type="text" value={code} onChange={(e) => setCode(e.target.value)}
                        placeholder="Code eingeben..."
                        className="w-full px-4 py-3 rounded-xl text-sm text-center font-mono tracking-wider focus:outline-none transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(20,184,166,0.4)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                        autoFocus
                      />
                      {error && (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 p-2.5 rounded-lg border border-red-500/10">
                          <AlertCircle size={14} /><span>{error}</span>
                        </div>
                      )}
                      <button onClick={handleCodeSubmit} disabled={migrationLoading || !code.trim()}
                        className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.9), rgba(16,185,129,0.9))', color: '#fff' }}>
                        {migrationLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Verbinden'}
                      </button>
                      <button onClick={() => { setCode(''); setError(''); if (onCodeInputClose) onCodeInputClose(); }}
                        className="w-full py-2 text-xs text-base-content/40 hover:text-base-content/60 transition-colors">
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : !isAuthenticated ? (
                  /* Token input mode */
                  <div className="flex flex-col items-center py-6 space-y-5">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(10,132,255,0.1)' }}>
                      <Sparkles className="w-7 h-7 text-primary" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <h3 className="text-base font-semibold text-base-content">Konto verbinden</h3>
                      <p className="text-xs text-base-content/40 max-w-[280px]">
                        Füge deinen Auth-Token ein, um dein Anki Plugin mit deinem Account zu verbinden
                      </p>
                    </div>
                    <div className="w-full space-y-3">
                      <div className="relative">
                        <input
                          type={showToken ? 'text' : 'password'} value={authToken}
                          onChange={(e) => setAuthToken(e.target.value)}
                          placeholder="Auth-Token einfügen..."
                          className="w-full px-4 pr-10 py-3 rounded-xl text-sm focus:outline-none transition-all"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                          onFocus={(e) => { e.target.style.borderColor = 'rgba(10,132,255,0.4)'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                          autoFocus
                        />
                        <button onClick={() => setShowToken(!showToken)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-base-content/30 hover:text-base-content/60 transition-colors">
                          {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      {error && (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 p-2.5 rounded-lg border border-red-500/10">
                          <AlertCircle size={14} /><span>{error}</span>
                        </div>
                      )}
                      <button onClick={handleTokenSave} disabled={loading || !authToken.trim()}
                        className="w-full py-3 rounded-xl text-sm font-semibold bg-primary text-white transition-all disabled:opacity-40 hover:brightness-110">
                        {loading ? <><Loader2 size={16} className="animate-spin inline mr-2" />Verifiziere...</> : 'Token verifizieren'}
                      </button>
                    </div>
                    <div className="w-full pt-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <p className="text-[11px] text-base-content/30 text-center">Du findest deinen Token auf der Landingpage nach dem Login</p>
                      <button
                        onClick={() => {
                          const url = 'https://anki-plus.vercel.app';
                          if (bridge && bridge.openUrl) bridge.openUrl(url); else window.open(url, '_blank');
                        }}
                        className="w-full py-2 rounded-lg text-xs text-base-content/40 hover:text-base-content/60 transition-colors flex items-center justify-center gap-1.5"
                        style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                        <ExternalLink size={12} /> Zur Landingpage
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Authenticated — Subscription status */
                  <div className="space-y-4">
                    {/* Tier card */}
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2 rounded-lg ${tierInfo.bg} ${tierInfo.color}`}>
                          <TierIcon size={18} strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-base-content">{tierInfo.name}</h3>
                          <p className="text-[11px] text-base-content/40">{tierInfo.description}</p>
                        </div>
                      </div>

                      {quotaStatus && (
                        <div className="space-y-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          {/* Deep Mode */}
                          <QuotaBar label="Deep Mode" icon={Sparkles} used={quotaStatus.deep.used} limit={quotaStatus.deep.limit} />
                          {/* Flash Mode */}
                          <QuotaBar label="Flash Mode" icon={Zap} used={quotaStatus.flash.used} limit={quotaStatus.flash.limit} />
                        </div>
                      )}
                    </div>

                    {/* Manage subscription */}
                    <button onClick={handleManageSubscription}
                      className="w-full px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}>
                      <CreditCard size={16} strokeWidth={1.5} /> Abo verwalten
                    </button>

                    {/* Logout */}
                    <button onClick={handleLogout}
                      className="w-full px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
                      style={{ color: 'rgba(239,68,68,0.6)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.color = 'rgba(239,68,68,0.8)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(239,68,68,0.6)'; }}>
                      Abmelden & neu verbinden
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ═══ ALLGEMEIN TAB ═══ */}
            {activeTab === 'allgemein' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Theme */}
                <SettingsSection title="Erscheinungsbild">
                  <div className="flex gap-2">
                    {THEMES.map(({ key, label, icon: Icon }) => (
                      <button key={key} onClick={() => handleThemeChange(key)}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-medium transition-all ${
                          theme === key
                            ? 'text-base-content/90'
                            : 'text-base-content/30 hover:text-base-content/50'
                        }`}
                        style={{
                          background: theme === key ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: `1px solid ${theme === key ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                        }}>
                        <Icon size={16} strokeWidth={1.5} />
                        {label}
                      </button>
                    ))}
                  </div>
                </SettingsSection>

                {/* Anki native settings link */}
                <SettingsSection title="Erweitert">
                  <button
                    onClick={() => {
                      if (bridge && bridge.openAnkiPreferences) bridge.openAnkiPreferences();
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-base-content/50 hover:text-base-content/70 transition-all"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}>
                    <span>Anki-Einstellungen öffnen</span>
                    <ChevronRight size={14} />
                  </button>
                </SettingsSection>
              </div>
            )}

            {/* ═══ KI TAB ═══ */}
            {activeTab === 'ki' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Response style */}
                <SettingsSection title="Antwortstil">
                  <div className="grid grid-cols-2 gap-2">
                    {RESPONSE_STYLES.map(({ key, label, desc, icon }) => (
                      <button key={key} onClick={() => handleResponseStyleChange(key)}
                        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                          responseStyle === key ? 'text-base-content/90' : 'text-base-content/35 hover:text-base-content/55'
                        }`}
                        style={{
                          background: responseStyle === key ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: `1px solid ${responseStyle === key ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                        }}>
                        <span className="text-sm mt-0.5">{icon}</span>
                        <div>
                          <div className="text-[12px] font-medium">{label}</div>
                          <div className="text-[10px] opacity-50">{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </SettingsSection>

                {/* AI Tools */}
                <SettingsSection title="KI-Werkzeuge">
                  <div className="space-y-1">
                    <ToolToggle label="Bilder generieren" icon={Image} enabled={aiTools.images}
                      onToggle={() => handleAiToolToggle('images')} />
                    <ToolToggle label="Diagramme" icon={GitBranch} enabled={aiTools.diagrams}
                      onToggle={() => handleAiToolToggle('diagrams')} />
                    <ToolToggle label="Moleküle" icon={FlaskConical} enabled={aiTools.molecules}
                      onToggle={() => handleAiToolToggle('molecules')} badge="Beta" />
                  </div>
                </SettingsSection>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}


/* ── Sub-components ── */

function SettingsSection({ title, children }) {
  return (
    <div className="space-y-2.5">
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-base-content/25 px-0.5">{title}</h4>
      {children}
    </div>
  );
}

function QuotaBar({ label, icon: Icon, used, limit }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min(100, (used / limit) * 100);
  const barColor = isUnlimited ? 'rgba(255,255,255,0.1)'
    : pct > 80 ? 'rgba(239,68,68,0.7)'
    : pct > 50 ? 'rgba(251,191,36,0.7)'
    : 'rgba(255,255,255,0.3)';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className="text-base-content/40" />
          <span className="text-[11px] font-medium text-base-content/60">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[12px] font-semibold text-base-content/80">{used}</span>
          <span className="text-[10px] text-base-content/30">/ {isUnlimited ? '∞' : limit}</span>
        </div>
      </div>
      <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${isUnlimited ? 0 : pct}%`, background: barColor }} />
      </div>
    </div>
  );
}

function ToolToggle({ label, icon: Icon, enabled, onToggle, badge }) {
  return (
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
      style={{ background: enabled ? 'rgba(255,255,255,0.03)' : 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = enabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = enabled ? 'rgba(255,255,255,0.03)' : 'transparent'; }}>
      <div className="flex items-center gap-2.5">
        <Icon size={14} className={`transition-colors ${enabled ? 'text-base-content/60' : 'text-base-content/20'}`} strokeWidth={1.5} />
        <span className={`text-[12px] font-medium transition-colors ${enabled ? 'text-base-content/70' : 'text-base-content/30'}`}>
          {label}
        </span>
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-medium"
            style={{ background: 'rgba(251,191,36,0.1)', color: 'rgba(251,191,36,0.6)', border: '1px solid rgba(251,191,36,0.1)' }}>
            {badge}
          </span>
        )}
      </div>
      {/* Toggle switch */}
      <div className={`w-8 h-[18px] rounded-full relative transition-all duration-200 ${enabled ? 'bg-primary/80' : 'bg-white/[0.08]'}`}>
        <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? 'left-[16px]' : 'left-[2px]'}`} />
      </div>
    </button>
  );
}
