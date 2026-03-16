import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Loader2, Eye, EyeOff, Zap, GraduationCap, Crown, CreditCard, Sparkles, Key } from 'lucide-react';

/**
 * Profile Dialog Komponente
 * Zwei Modi:
 * 1. Nicht authentifiziert: Nur Token-Eingabe (zentriert, im Mittelpunkt)
 * 2. Authentifiziert: Abo-Status + "Abo verwalten" Button
 */
export default function ProfileDialog({ isOpen, onClose, bridge, isReady, showCodeInput = false, onCodeInputClose }) {
  const [authToken, setAuthToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);
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
      
      // Fallback: Wenn nach 500ms kein Token geladen wurde, setze auf leer
      const timeout = setTimeout(() => {
        if (!currentAuthToken || !currentAuthToken.trim()) {
          console.log('ProfileDialog: Token-Timeout - kein Token nach 500ms, setze auf nicht authentifiziert');
          setCurrentAuthToken('');
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
        }
      }, 500);
      
      return () => clearTimeout(timeout);
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
      if (data) {
        // Setze Token auch wenn leer (um State zu aktualisieren)
        const token = data.token || '';
        setCurrentAuthToken(token);
        
        // Wenn Token leer ist, setze auch authStatus auf nicht authentifiziert
        if (!token || !token.trim()) {
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
        }
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
        if (payload.data) {
          const token = payload.data.token || '';
          setCurrentAuthToken(token);
          // Wenn Token leer ist, setze auch authStatus auf nicht authentifiziert
          if (!token || !token.trim()) {
            setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
          }
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

  // Fetch quota status (nur wenn wirklich authentifiziert)
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
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentAuthToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setQuotaStatus(data);
        } else if (response.status === 401) {
          // Token expired or invalid - clear everything and show "not connected"
          setQuotaStatus(null);
          setCurrentAuthToken(''); // Clear token
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
          if (bridge && bridge.refreshAuth) {
            bridge.refreshAuth();
          }
        } else {
          // Other error - clear quota status
          setQuotaStatus(null);
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
        // Bei "Failed to fetch" (CORS/Netzwerk) oder anderen Fehlern:
        // Wenn kein Token vorhanden ist, zeigen wir "nicht verbunden"
        if (!currentAuthToken || !currentAuthToken.trim()) {
          // Kein Token = definitiv nicht verbunden
          setQuotaStatus(null);
          setAuthStatus(prev => ({ ...prev, authenticated: false, hasToken: false }));
        } else {
          // Token vorhanden, aber Fetch fehlgeschlagen - könnte temporärer Fehler sein
          // Behalte den Status, aber zeige keine Quota-Daten
          setQuotaStatus(null);
        }
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
    // Öffne Landingpage Dashboard - verwende bridge.openUrl falls verfügbar, sonst window.open
    const url = 'https://anki-plus.vercel.app/dashboard/subscription';
    if (bridge && bridge.openUrl) {
      bridge.openUrl(url);
    } else {
      // Fallback für QWebEngine
      window.open(url, '_blank');
      // Zusätzlicher Fallback: Versuche direkt zu navigieren
      if (window.location) {
        try {
          window.location.href = url;
        } catch (e) {
          console.error('Could not open URL:', e);
        }
      }
    }
  };

  const handleCodeSubmit = async () => {
    if (!code.trim()) {
      setError('Bitte gib einen Code ein');
      return;
    }

    setError('');
    setMigrationLoading(true);

    try {
      // Code wird als Token behandelt (später durch echte Code-Verifizierung ersetzen)
      if (bridge && bridge.saveAuthToken) {
        bridge.saveAuthToken(code.trim(), ''); // Code als Token (temporär)
        
        // Migration durchführen
        if (bridge && bridge.getDeviceId) {
          const deviceId = bridge.getDeviceId();
          if (deviceId && authStatus.backendUrl) {
            try {
              const migrationResponse = await fetch(`${authStatus.backendUrl}/migrate-anonymous`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${code.trim()}`,
                },
                body: JSON.stringify({ deviceId }),
              });

              if (migrationResponse.ok) {
                console.log('Migration erfolgreich');
              }
            } catch (migrationError) {
              console.error('Migration error:', migrationError);
              // Migration-Fehler nicht kritisch - User ist trotzdem verbunden
            }
          }
        }
        
        // Status aktualisieren
        setTimeout(() => {
          checkAuthStatus();
          loadAuthToken();
          setCode('');
          if (onCodeInputClose) onCodeInputClose();
        }, 500);
      }
    } catch (err) {
      setError('Fehler beim Verbinden: ' + err.message);
    } finally {
      setMigrationLoading(false);
    }
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

  // Prüfe ob wirklich authentifiziert:
  // - currentAuthToken muss vorhanden und nicht leer sein (höchste Priorität)
  // - authStatus.authenticated muss true sein
  // - authStatus.hasToken muss true sein (Token vorhanden)
  const hasValidToken = currentAuthToken && currentAuthToken.trim() !== '';
  
  // Wenn kein Token vorhanden ist, ist der User definitiv nicht authentifiziert
  // unabhängig von authStatus.authenticated (kann veraltet sein)
  // WICHTIG: hasValidToken hat höchste Priorität - wenn leer, dann nicht authentifiziert
  const isAuthenticated = hasValidToken && authStatus.authenticated && authStatus.hasToken;
  
  // Debug: Log State für Troubleshooting
  if (isOpen) {
    console.log('🔍 ProfileDialog State:', {
      hasValidToken,
      authenticated: authStatus.authenticated,
      hasToken: authStatus.hasToken,
      isAuthenticated,
      currentAuthTokenLength: currentAuthToken?.length || 0,
      quotaStatus: !!quotaStatus,
      backendUrl: authStatus.backendUrl
    });
  }
  
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
          {showCodeInput ? (
            /* MODUS 1.5: Code-Eingabe für Migration */
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-teal-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key className="w-8 h-8 text-teal-400" />
                </div>
                <h3 className="text-xl font-bold text-base-content">Code eingeben</h3>
                <p className="text-sm text-base-content/60 max-w-sm">
                  Gib den Code ein, den du auf der Website erhalten hast, um dein Konto zu verbinden
                </p>
              </div>

              <div className="w-full space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Code eingeben..."
                    className="w-full pl-4 pr-4 py-4 bg-base-200/50 border-2 border-base-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all placeholder:text-base-content/30 text-center font-mono tracking-wider"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-error bg-error/5 p-3 rounded-lg border border-error/10">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleCodeSubmit}
                  disabled={migrationLoading || !code.trim()}
                  className="w-full btn btn-primary btn-lg gap-2 font-semibold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {migrationLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Verbinde...
                    </>
                  ) : (
                    <>
                      <Key size={18} />
                      Verbinden
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => {
                    setCode('');
                    setError('');
                    if (onCodeInputClose) onCodeInputClose();
                  }}
                  className="w-full btn btn-ghost btn-sm text-base-content/60 hover:text-base-content"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : !isAuthenticated ? (
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

              <div className="text-center text-xs text-base-content/50 pt-4 border-t border-base-content/5 space-y-3">
                <p>Du findest deinen Token auf der Landingpage nach dem Login</p>
                <button
                  onClick={() => {
                    const url = 'https://anki-plus.vercel.app';
                    if (bridge && bridge.openUrl) {
                      bridge.openUrl(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="w-full btn btn-outline btn-sm gap-2 text-xs"
                >
                  <Sparkles size={14} />
                  Zur Landingpage gehen
                </button>
              </div>
            </div>
          ) : (
            /* MODUS 2: Authentifiziert - Abo-Status + Abo verwalten */
            <div className="space-y-5">
              {/* Abo-Status Card */}
              <div className={`p-5 rounded-xl border ${tierInfo.border} bg-base-200/30 backdrop-blur-sm`}>
                <div className="flex items-start gap-3 mb-5">
                  <div className={`p-2.5 rounded-lg bg-base-100/50 border border-base-content/10 ${tierInfo.color}`}>
                    <TierIcon size={20} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg text-base-content mb-0.5 leading-tight">{tierInfo.name}</h3>
                    <p className="text-xs text-base-content/60">{tierInfo.description}</p>
                  </div>
                </div>

                  {quotaStatus ? (
                    <div className="space-y-3 pt-4 border-t border-base-content/10">
                      {/* Deep Mode Usage */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Sparkles size={14} className="text-base-content/60" />
                            <span className="text-xs font-medium text-base-content/80">Deep Mode</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-semibold text-base-content">
                              {quotaStatus.deep.used}
                            </span>
                            <span className="text-xs text-base-content/40">/</span>
                            <span className="text-xs text-base-content/60 font-medium">
                              {quotaStatus.deep.limit === -1 ? '∞' : quotaStatus.deep.limit}
                            </span>
                            {quotaStatus.deep.limit !== -1 && (
                              <span className="text-xs text-base-content/40 ml-1">
                                ({Math.round((quotaStatus.deep.used / quotaStatus.deep.limit) * 100)}%)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-base-100/50 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              quotaStatus.deep.limit === -1 
                                ? 'bg-base-content/20' 
                                : (quotaStatus.deep.used / quotaStatus.deep.limit) > 0.8
                                  ? 'bg-red-500/70'
                                  : (quotaStatus.deep.used / quotaStatus.deep.limit) > 0.5
                                    ? 'bg-yellow-500/70'
                                    : 'bg-base-content/40'
                            }`}
                            style={{ 
                              width: `${quotaStatus.deep.limit === -1 ? 0 : Math.min(100, (quotaStatus.deep.used / quotaStatus.deep.limit) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                      
                      {/* Flash Mode Usage */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Zap size={14} className="text-base-content/60" />
                            <span className="text-xs font-medium text-base-content/80">Flash Mode</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-semibold text-base-content">
                              {quotaStatus.flash.used}
                            </span>
                            <span className="text-xs text-base-content/40">/</span>
                            <span className="text-xs text-base-content/60 font-medium">
                              {quotaStatus.flash.limit === -1 ? '∞' : quotaStatus.flash.limit}
                            </span>
                            {quotaStatus.flash.limit !== -1 && (
                              <span className="text-xs text-base-content/40 ml-1">
                                ({Math.round((quotaStatus.flash.used / quotaStatus.flash.limit) * 100)}%)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-base-100/50 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              quotaStatus.flash.limit === -1 
                                ? 'bg-base-content/20' 
                                : (quotaStatus.flash.used / quotaStatus.flash.limit) > 0.8
                                  ? 'bg-red-500/70'
                                  : (quotaStatus.flash.used / quotaStatus.flash.limit) > 0.5
                                    ? 'bg-yellow-500/70'
                                    : 'bg-base-content/40'
                            }`}
                            style={{ 
                              width: `${quotaStatus.flash.limit === -1 ? 0 : Math.min(100, (quotaStatus.flash.used / quotaStatus.flash.limit) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : isAuthenticated ? (
                    <div className="pt-4 border-t border-base-content/10">
                      <p className="text-xs text-base-content/50 text-center">Lade Nutzungsdaten...</p>
                    </div>
                  ) : null}
              </div>

              {/* Action Button */}
              <button
                onClick={handleManageSubscription}
                className="w-full px-4 py-3 rounded-xl border border-base-content/20 bg-base-200/30 hover:bg-base-200/50 text-base-content/80 hover:text-base-content transition-all font-medium text-sm flex items-center justify-center gap-2"
              >
                <CreditCard size={18} strokeWidth={1.5} />
                Abo verwalten
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
