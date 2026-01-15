import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Loader2, Eye, EyeOff, Zap, GraduationCap, Crown, CreditCard, Sparkles } from 'lucide-react';

/**
 * Profile Dialog Komponente
 * Zwei Modi:
 * 1. Nicht authentifiziert: Nur Token-Eingabe (zentriert, im Mittelpunkt)
 * 2. Authentifiziert: Abo-Status + "Abo verwalten" Button
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
  const [currentAuthToken, setCurrentAuthToken] = useState('');

  // Lade Auth-Status beim Öffnen
  useEffect(() => {
    if (isOpen && bridge && isReady) {
      checkAuthStatus();
      loadAuthToken();
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

  const loadAuthToken = () => {
    if (bridge && bridge.getAuthToken) {
      // Request token via bridge message
      bridge.getAuthToken();
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

    const handleAuthTokenLoaded = (event) => {
      const data = event.detail || event.data;
      if (data && data.token) {
        setCurrentAuthToken(data.token);
      }
    };

    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (originalAnkiReceive) {
        originalAnkiReceive(payload);
      }
      if (payload.type === 'authStatusLoaded' && payload.data) {
        handleAuthStatusLoaded({ detail: payload.data });
      } else if (payload.type === 'authTokenLoaded' && payload.data) {
        handleAuthTokenLoaded({ detail: payload.data });
      } else if (payload.type === 'authTokenLoaded') {
        // Handle direct payload format
        if (payload.data && payload.data.token) {
          setCurrentAuthToken(payload.data.token);
        }
      } else if (payload.type === 'auth_success') {
        checkAuthStatus();
        loadAuthToken();
        setError('');
        setLoading(false);
        setAuthToken(''); // Clear input after success
      } else if (payload.type === 'auth_error') {
        setError(payload.message || 'Authentifizierung fehlgeschlagen');
        setLoading(false);
      }
    };

    return () => {
      window.ankiReceive = originalAnkiReceive;
    };
  }, [isOpen]);

  // Fetch quota status (nur wenn authentifiziert)
  useEffect(() => {
    if (!authStatus.authenticated || !authStatus.backendUrl || !currentAuthToken) {
      setQuotaStatus(null);
      return;
    }

    const fetchQuota = async () => {
      try {
        const response = await fetch(`${authStatus.backendUrl}/user/quota`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentAuthToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setQuotaStatus(data);
        } else if (response.status === 401) {
          // Token expired, try to refresh
          if (bridge && bridge.refreshAuth) {
            bridge.refreshAuth();
            // Will retry after refresh
          }
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [authStatus.authenticated, authStatus.backendUrl, currentAuthToken, bridge]);

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
    // Öffne Landingpage Subscription-Seite
    window.open('https://anki-plus.vercel.app/dashboard/subscription', '_blank');
  };

  const getTierInfo = (tier) => {
    switch (tier) {
      case 'tier2':
        return { 
          name: 'Exam Pro', 
          icon: Crown, 
          color: 'text-purple-400', 
          bg: 'bg-purple-500/10', 
          border: 'border-purple-500/20',
          gradient: 'from-purple-500/20 to-purple-600/10',
          description: 'Maximale Power'
        };
      case 'tier1':
        return { 
          name: 'Student', 
          icon: GraduationCap, 
          color: 'text-teal-400', 
          bg: 'bg-teal-500/10', 
          border: 'border-teal-500/20',
          gradient: 'from-teal-500/20 to-teal-600/10',
          description: 'Für Studenten'
        };
      default:
        return { 
          name: 'Starter', 
          icon: Zap, 
          color: 'text-neutral-400', 
          bg: 'bg-base-300/50', 
          border: 'border-base-300',
          gradient: 'from-neutral-500/20 to-neutral-600/10',
          description: 'Kostenloser Einstieg'
        };
    }
  };

  if (!isOpen) return null;

  const isAuthenticated = authStatus.authenticated;
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

        <div className="overflow-y-auto p-5">
          {!isAuthenticated ? (
            /* MODUS 1: Nicht authentifiziert - Nur Token-Eingabe */
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-base-content">Verbinde dein Konto</h3>
                <p className="text-sm text-base-content/60 max-w-sm">
                  Füge deinen Auth-Token ein, um dein Anki Plugin mit deinem Account zu verbinden
                </p>
              </div>

              <div className="w-full space-y-4">
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Auth-Token einfügen..."
                    className="w-full pl-4 pr-10 py-4 bg-base-200/50 border-2 border-base-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-base-content/30"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-base-content/40 hover:text-base-content/70 transition-colors rounded-lg hover:bg-base-200/50"
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-error bg-error/5 p-3 rounded-lg border border-error/10">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={loading || !authToken.trim()}
                  className="w-full btn btn-primary btn-lg gap-2 font-semibold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Verifiziere...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Token verifizieren
                    </>
                  )}
                </button>
              </div>

              <div className="text-center text-xs text-base-content/50 pt-4 border-t border-base-content/5">
                <p>Du findest deinen Token auf der Landingpage nach dem Login</p>
              </div>
            </div>
          ) : (
            /* MODUS 2: Authentifiziert - Abo-Status + Abo verwalten */
            <div className="space-y-5">
              {/* Abo-Status Card */}
              <div className={`p-6 rounded-2xl border ${tierInfo.border} relative overflow-hidden group bg-gradient-to-br ${tierInfo.bg} backdrop-blur-sm`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${tierInfo.gradient} opacity-30`} />
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 group-hover:opacity-10 transition-opacity">
                  <TierIcon size={128} strokeWidth={1} className="absolute -top-8 -right-8" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`p-3.5 rounded-xl bg-base-100/40 backdrop-blur-sm border border-white/20 shadow-lg ${tierInfo.color}`}>
                      <TierIcon size={28} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-2xl text-base-content mb-1.5 leading-tight">{tierInfo.name}</h3>
                      <p className="text-sm text-base-content/70 font-medium">{tierInfo.description}</p>
                    </div>
                  </div>

                  {quotaStatus && (
                    <div className="space-y-4 pt-4 border-t border-white/10">
                      {/* Deep Mode Usage */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-teal-400" />
                            <span className="text-sm font-semibold text-base-content/90">Deep Mode</span>
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-bold text-base-content">
                              {quotaStatus.deep.used}
                            </span>
                            <span className="text-xs text-base-content/50 font-medium">/</span>
                            <span className="text-sm text-base-content/70 font-semibold">
                              {quotaStatus.deep.limit === -1 ? '∞' : quotaStatus.deep.limit}
                            </span>
                            {quotaStatus.deep.limit !== -1 && (
                              <span className="text-xs text-base-content/50 ml-1.5">
                                ({Math.round((quotaStatus.deep.used / quotaStatus.deep.limit) * 100)}%)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2.5 w-full bg-base-100/40 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              quotaStatus.deep.limit === -1 
                                ? 'bg-teal-500/30' 
                                : (quotaStatus.deep.used / quotaStatus.deep.limit) > 0.8
                                  ? 'bg-red-500'
                                  : (quotaStatus.deep.used / quotaStatus.deep.limit) > 0.5
                                    ? 'bg-yellow-500'
                                    : 'bg-teal-500'
                            } shadow-sm`}
                            style={{ 
                              width: `${quotaStatus.deep.limit === -1 ? 0 : Math.min(100, (quotaStatus.deep.used / quotaStatus.deep.limit) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                      
                      {/* Flash Mode Usage */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Zap size={16} className="text-yellow-400" />
                            <span className="text-sm font-semibold text-base-content/90">Flash Mode</span>
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-bold text-base-content">
                              {quotaStatus.flash.used}
                            </span>
                            <span className="text-xs text-base-content/50 font-medium">/</span>
                            <span className="text-sm text-base-content/70 font-semibold">
                              {quotaStatus.flash.limit === -1 ? '∞' : quotaStatus.flash.limit}
                            </span>
                            {quotaStatus.flash.limit !== -1 && (
                              <span className="text-xs text-base-content/50 ml-1.5">
                                ({Math.round((quotaStatus.flash.used / quotaStatus.flash.limit) * 100)}%)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2.5 w-full bg-base-100/40 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              quotaStatus.flash.limit === -1 
                                ? 'bg-yellow-500/30' 
                                : (quotaStatus.flash.used / quotaStatus.flash.limit) > 0.8
                                  ? 'bg-red-500'
                                  : (quotaStatus.flash.used / quotaStatus.flash.limit) > 0.5
                                    ? 'bg-yellow-500'
                                    : 'bg-yellow-400'
                            } shadow-sm`}
                            style={{ 
                              width: `${quotaStatus.flash.limit === -1 ? 0 : Math.min(100, (quotaStatus.flash.used / quotaStatus.flash.limit) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleManageSubscription}
                  className="w-full btn btn-primary btn-lg gap-3 font-semibold rounded-xl shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <CreditCard size={20} strokeWidth={2} />
                  Abo verwalten
                </button>
                
                <button
                  onClick={() => window.open('https://anki-plus.vercel.app', '_blank')}
                  className="w-full btn btn-ghost btn-md gap-2 font-medium rounded-xl border border-base-content/10 hover:border-base-content/20 hover:bg-base-200/50 transition-all"
                >
                  <Sparkles size={16} />
                  Website öffnen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
