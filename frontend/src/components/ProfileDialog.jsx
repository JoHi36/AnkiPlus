import React, { useState, useEffect } from 'react';
import { X, User, Save, AlertCircle, Loader2, Eye, EyeOff, CheckCircle, XCircle, ExternalLink, Zap, GraduationCap, Crown, CreditCard } from 'lucide-react';

/**
 * Profile Dialog Komponente
 * Verwaltet Auth-Token und Profil-Einstellungen
 */
export default function ProfileDialog({ isOpen, onClose, bridge, isReady }) {
  const [authToken, setAuthToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    hasToken: false,
    backendUrl: '',
    backendMode: false
  });
  const [quotaStatus, setQuotaStatus] = useState(null);

  // Lade Auth-Status beim Öffnen
  useEffect(() => {
    if (isOpen && bridge && isReady) {
      checkAuthStatus();
    }
  }, [isOpen, bridge, isReady]);

  const checkAuthStatus = () => {
    if (bridge && bridge.getAuthStatus) {
      const statusStr = bridge.getAuthStatus();
      if (statusStr) {
        try {
          const status = JSON.parse(statusStr);
          setAuthStatus(status);
        } catch (e) {
          console.error('Fehler beim Parsen des Auth-Status:', e);
        }
      }
    }
  };

  // Event-Handler für Auth-Status
  useEffect(() => {
    if (!isOpen) return;

    const handleAuthStatusLoaded = (event) => {
      const data = event.detail || event.data;
      if (data && (data.authenticated !== undefined || data.hasToken !== undefined)) {
        setAuthStatus({
          authenticated: data.authenticated || false,
          hasToken: data.hasToken || false,
          backendUrl: data.backendUrl || '',
          backendMode: data.backendMode || false
        });
      }
    };

    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (originalAnkiReceive) {
        originalAnkiReceive(payload);
      }
      if (payload.type === 'authStatusLoaded' && payload.data) {
        handleAuthStatusLoaded({ detail: payload.data });
      } else if (payload.type === 'auth_success') {
        checkAuthStatus();
        setError('');
        setLoading(false);
      } else if (payload.type === 'auth_error') {
        setError(payload.message || 'Authentifizierung fehlgeschlagen');
        setLoading(false);
      }
    };

    return () => {
      window.ankiReceive = originalAnkiReceive;
    };
  }, [isOpen]);

  // Fetch quota status
  useEffect(() => {
    if (!authStatus.authenticated || !authStatus.backendUrl || !bridge) {
      setQuotaStatus(null);
      return;
    }

    const fetchQuota = async () => {
      try {
        const response = await fetch(`${authStatus.backendUrl}/user/quota`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setQuotaStatus(data);
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [authStatus.authenticated, authStatus.backendUrl, bridge]);

  const handleSave = async () => {
    if (!authToken.trim()) {
      setError('Bitte gib einen Token ein');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (bridge && bridge.authenticate) {
        bridge.authenticate(authToken.trim(), '');
      } else {
        setError('Bridge nicht verfügbar');
        setLoading(false);
      }
    } catch (err) {
      setError('Fehler beim Speichern: ' + err.message);
      setLoading(false);
    }
  };

  const handleManageSubscription = () => {
    // Öffne Landingpage/Subscription
    window.open('https://anki-plus.vercel.app/subscription', '_blank');
  };

  const getTierInfo = (tier) => {
    switch (tier) {
      case 'tier2':
        return { name: 'Exam Pro', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
      case 'tier1':
        return { name: 'Student', icon: GraduationCap, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' };
      default:
        return { name: 'Starter', icon: Zap, color: 'text-neutral-400', bg: 'bg-base-300/50', border: 'border-base-300' };
    }
  };

  if (!isOpen) return null;

  const tierInfo = quotaStatus ? getTierInfo(quotaStatus.tier) : getTierInfo('free');
  const TierIcon = tierInfo.icon;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md border border-base-content/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-base-content/5 bg-base-200/30">
          <h2 className="text-lg font-semibold text-base-content">Dein Profil</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-base-300/50 rounded-lg transition-colors text-base-content/60 hover:text-base-content"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          {/* Auth Status & Plan Card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">Aktueller Status</label>
              {authStatus.authenticated ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Verbunden
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-error bg-error/10 px-2 py-0.5 rounded-full border border-error/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-error" />
                  Getrennt
                </span>
              )}
            </div>

            {quotaStatus && (
              <div className={`p-5 rounded-xl border ${tierInfo.bg} ${tierInfo.border} relative overflow-hidden group`}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TierIcon size={80} strokeWidth={1} />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-lg bg-base-100/10 backdrop-blur-sm border border-white/10 ${tierInfo.color}`}>
                      <TierIcon size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-base-content">{tierInfo.name} Plan</h3>
                      <p className="text-xs text-base-content/60">
                        {quotaStatus.tier === 'tier2' ? 'Maximale Power' : quotaStatus.tier === 'tier1' ? 'Für Studenten' : 'Kostenloser Einstieg'}
                      </p>
                    </div>
                  </div>

                  {/* Usage Bars */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-base-content/70 font-medium">Deep Mode</span>
                        <span className="text-base-content font-bold">
                          {quotaStatus.deep.used} / {quotaStatus.deep.limit === -1 ? '∞' : quotaStatus.deep.limit}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-base-100/20 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${tierInfo.color.replace('text-', 'bg-')}`}
                          style={{ width: `${quotaStatus.deep.limit === -1 ? 0 : Math.min(100, (quotaStatus.deep.used / quotaStatus.deep.limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-base-content/70 font-medium">Flash Mode</span>
                        <span className="text-base-content font-bold">
                          {quotaStatus.flash.used} / {quotaStatus.flash.limit === -1 ? '∞' : quotaStatus.flash.limit}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-base-100/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-base-content/30 rounded-full transition-all duration-500"
                          style={{ width: `${quotaStatus.flash.limit === -1 ? 0 : Math.min(100, (quotaStatus.flash.used / quotaStatus.flash.limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleManageSubscription}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-base-200/50 hover:bg-base-200 border border-transparent hover:border-base-content/10 transition-all gap-2 group"
            >
              <CreditCard size={20} className="text-base-content/70 group-hover:text-primary transition-colors" />
              <span className="text-xs font-medium text-base-content/80">Abo verwalten</span>
            </button>
            <button
              onClick={() => window.open('https://anki-plus.vercel.app', '_blank')}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-base-200/50 hover:bg-base-200 border border-transparent hover:border-base-content/10 transition-all gap-2 group"
            >
              <ExternalLink size={20} className="text-base-content/70 group-hover:text-primary transition-colors" />
              <span className="text-xs font-medium text-base-content/80">Website öffnen</span>
            </button>
          </div>

          {/* Token Input (Collapsible or Bottom) */}
          <div className="pt-2 border-t border-base-content/5">
             <label className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3 block">Authentifizierung</label>
            
             <div className="space-y-3">
              <div className="relative group">
                <input
                  type={showToken ? "text" : "password"}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Auth-Token einfügen..."
                  className="w-full pl-4 pr-10 py-3 bg-base-200/50 border border-base-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-base-content/30"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-base-content/40 hover:text-base-content/70 transition-colors"
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-error bg-error/5 p-2 rounded-lg border border-error/10">
                  <AlertCircle size={12} />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={loading || !authToken.trim()}
                className="w-full btn btn-primary btn-sm h-10 gap-2 font-medium rounded-xl shadow-lg shadow-primary/20"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Speichere...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Token speichern
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}