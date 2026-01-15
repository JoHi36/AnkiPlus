import React, { useState, useEffect } from 'react';
import { X, Key, Save, AlertCircle, Loader2, Eye, EyeOff, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

/**
 * Settings Dialog Komponente
 * Hochwertiger, professioneller Einstellungsdialog mit Live-Modell-Abruf
 */
export default function SettingsDialog({ isOpen, onClose, onSave, bridge, isReady }) {
  const [apiKey, setApiKey] = useState(''); // Für Backward-Kompatibilität (wird nicht mehr angezeigt)
  const [provider] = useState('google'); // Immer Google
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [loadedModels, setLoadedModels] = useState([]);
  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    hasToken: false,
    backendUrl: '',
    backendMode: false
  });
  const [connecting, setConnecting] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState(null);
  const [loadingQuota, setLoadingQuota] = useState(false);

  // Debug-Log-Funktion (useCallback für Stabilität)
  const addLog = React.useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    console.log(logEntry);
    setDebugLog((prev) => [...prev.slice(-9), logEntry]); // Behalte nur die letzten 10 Einträge
  }, []);

  // Lade aktuelle Einstellungen beim Öffnen
  useEffect(() => {
    if (isOpen) {
      addLog('Dialog geöffnet');
      addLog(`Bridge verfügbar: ${bridge ? 'Ja' : 'Nein'}`);
      addLog(`isReady: ${isReady}`);
      
      // Event-Handler für Config-Laden
      const handleConfigLoaded = (event) => {
        const data = event.detail || event.data;
        addLog(`configLoaded Event erhalten`);
        if (data && data.api_key !== undefined) {
          setApiKey(data.api_key || '');
          addLog(`API-Key geladen: ${data.api_key ? 'Ja' : 'Nein'} (Länge: ${data.api_key?.length || 0})`);
          // Cache für synchrone Aufrufe
          window._cachedConfig = data;
        }
      };
      
      // Event-Handler für Modelle-Laden
      const handleModelsLoaded = (event) => {
        const data = event.detail || event.data;
        addLog(`modelsLoaded Event erhalten`);
        setLoadingModels(false);
        if (data && data.success && data.models) {
          addLog(`✓ ${data.models.length} Modelle geladen`);
          setLoadedModels(data.models);
          // Cache für synchrone Aufrufe
          window._cachedModels = data.models;
          setError('');
        } else if (data && data.error) {
          addLog(`✗ Fehler: ${data.error}`, 'error');
          setError(`API-Fehler: ${data.error}`);
        }
      };
      
      // Registriere globalen ankiReceive Handler
      const originalAnkiReceive = window.ankiReceive;
      window.ankiReceive = (payload) => {
        // Rufe original Handler auf
        if (originalAnkiReceive) {
          originalAnkiReceive(payload);
        }
        // Verarbeite Settings-relevante Events
        if (payload.type === 'configLoaded' && payload.data) {
          handleConfigLoaded({ detail: payload.data });
        } else if (payload.type === 'modelsLoaded' && payload.data) {
          handleModelsLoaded({ detail: payload.data });
        }
      };
      
      // Warte auf Bridge-Initialisierung mit Retry-Mechanismus
      let retryCount = 0;
      const maxRetries = 20; // 2 Sekunden (20 * 100ms)
      
      const checkBridge = () => {
        if (bridge && isReady) {
          addLog(`Bridge-Typ: ${typeof bridge}`);
          
          // Fordere Config an (async über Message-Queue)
          addLog('Fordere Konfiguration an...');
          bridge.getCurrentConfig();
          
          // Prüfe Auth-Status
          checkAuthStatus();
          
        } else if (retryCount < maxRetries) {
          retryCount++;
          addLog(`Warte auf Bridge-Initialisierung... (Versuch ${retryCount}/${maxRetries})`);
          setTimeout(checkBridge, 100);
        } else {
          addLog('⚠ Bridge konnte nicht initialisiert werden nach mehreren Versuchen', 'warn');
        }
      };
      
      // Starte Prüfung
      checkBridge();
      
      // Cleanup
      return () => {
        window.ankiReceive = originalAnkiReceive;
      };
    } else if (!isOpen) {
      // Reset beim Schließen
      setDebugLog([]);
    }
  }, [isOpen, bridge, isReady, addLog]);

  // Lade Modelle live wenn API-Key eingegeben wird (nur zum Testen/Validieren)
  useEffect(() => {
    if (!isOpen) return; // Nur laden wenn Dialog offen ist
    
    // Debounce: Warte kurz bevor Modelle geladen werden
    const timeoutId = setTimeout(() => {
      const hasFetchModels = bridge && isReady && ('fetchModels' in bridge || typeof bridge.fetchModels === 'function');
      if (apiKey.trim() && hasFetchModels) {
        setLoadingModels(true);
        setError('');
        addLog(`Starte Modell-Laden für API-Key (Länge: ${apiKey.trim().length})...`);
        
        // Sende Request - Antwort kommt async über modelsLoaded Event
        addLog('Sende fetchModels Request...');
        bridge.fetchModels(provider, apiKey.trim());
        // Loading-State wird im Event-Handler zurückgesetzt
        
      } else if (!apiKey.trim()) {
        setError('');
        setLoadedModels([]);
      } else if (!bridge || !isReady) {
        addLog('⚠ Bridge nicht verfügbar oder nicht bereit', 'warn');
      }
    }, apiKey.trim() ? 800 : 0); // Längerer Debounce für API-Calls

    return () => clearTimeout(timeoutId);
  }, [apiKey, provider, bridge, isOpen, isReady, addLog]);

  // Auth-Status Handler
  const handleAuthStatusLoaded = (event) => {
    const data = event.detail || event.data;
    if (data && (data.authenticated !== undefined || data.hasToken !== undefined)) {
      setAuthStatus({
        authenticated: data.authenticated || false,
        hasToken: data.hasToken || false,
        backendUrl: data.backendUrl || '',
        backendMode: data.backendMode || false
      });
      addLog(`Auth-Status geladen: ${data.authenticated ? 'Verbunden' : 'Nicht verbunden'}`);
    }
  };

  // Event-Handler für Auth-Events
  useEffect(() => {
    if (isOpen) {
      const originalAnkiReceive = window.ankiReceive;
      window.ankiReceive = (payload) => {
        if (originalAnkiReceive) {
          originalAnkiReceive(payload);
        }
        if (payload.type === 'authStatusLoaded' && payload.data) {
          handleAuthStatusLoaded({ detail: payload.data });
      // Fetch quota when auth status is loaded
      if (payload.data?.authenticated) {
        setTimeout(() => fetchQuotaStatus(), 500);
      }
        } else if (payload.type === 'auth_success') {
          addLog('✓ Authentifizierung erfolgreich', 'success');
          checkAuthStatus();
          // Fetch quota after successful auth
          setTimeout(() => fetchQuotaStatus(), 500);
        } else if (payload.type === 'auth_pending') {
          addLog('🔄 Token erkannt, verbinde...', 'info');
        } else if (payload.type === 'auth_error') {
          addLog(`❌ ${payload.message || 'Authentifizierung fehlgeschlagen'}`, 'error');
          checkAuthStatus();
        } else if (payload.type === 'refreshAuthStatus') {
          checkAuthStatus();
        }
      };
      
      return () => {
        window.ankiReceive = originalAnkiReceive;
      };
    }
  }, [isOpen, addLog]);

  // Höre auf auth Events
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.detail && event.detail.type === 'auth_success') {
        checkAuthStatus();
      } else if (event.detail && event.detail.type === 'refreshAuthStatus') {
        checkAuthStatus();
      }
    };
    
    window.addEventListener('ankiMessage', handleMessage);
    return () => window.removeEventListener('ankiMessage', handleMessage);
  }, []);
  
  const checkAuthStatus = () => {
    if (bridge && isReady && bridge.getAuthStatus) {
      addLog('Prüfe Auth-Status...');
      bridge.getAuthStatus();
    }
  };

  const fetchQuotaStatus = async () => {
    if (!authStatus.authenticated || !authStatus.backendUrl) {
      setQuotaStatus(null);
      return;
    }

    setLoadingQuota(true);
    try {
      // Get auth token from bridge
      const authToken = authStatus.hasToken ? await bridge.getAuthToken?.() : null;
      if (!authToken) {
        addLog('Kein Auth-Token verfügbar für Quota-Abfrage', 'warn');
        setLoadingQuota(false);
        return;
      }

      const response = await fetch(`${authStatus.backendUrl}/api/user/quota`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setQuotaStatus(data);
        addLog(`Quota-Status geladen: ${data.deep.used}/${data.deep.limit === -1 ? '∞' : data.deep.limit} Deep Requests`);
      } else {
        addLog(`Fehler beim Laden der Quota: ${response.status}`, 'error');
        setQuotaStatus(null);
      }
    } catch (error) {
      addLog(`Fehler beim Abrufen der Quota: ${error.message}`, 'error');
      setQuotaStatus(null);
    } finally {
      setLoadingQuota(false);
    }
  };

  const handleConnect = () => {
    setConnecting(true);
    addLog('Öffne Landingpage zum Verbinden...');
    
    // Öffne Landingpage in Browser
    // TODO: Ersetze mit echter Landingpage-URL nach Deployment
    // Für lokale Entwicklung: 'http://localhost:5173'
    // Für Production: 'https://your-landingpage.vercel.app' oder die finale URL
    const landingPageUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:5173' 
      : 'https://your-landingpage.vercel.app'; // TODO: Ersetze mit finaler URL nach Deployment
    
    window.open(landingPageUrl, '_blank');
    
    // Zeige Hinweis für manuelle Token-Übergabe
    addLog('Bitte loggen Sie sich auf der Landingpage ein. Das Plugin wird automatisch verbunden.', 'info');
    setConnecting(false);
  };

  const handleSave = async () => {
    // Im Backend-Modus wird kein API-Key mehr benötigt
    // Auth-Status wird automatisch überprüft
    if (!authStatus.authenticated && !authStatus.backendMode) {
      setError('Bitte verbinden Sie sich zuerst mit Ihrem Account.');
      return;
    }
    
    setLoading(true);
    setError('');
    addLog('Speichere Einstellungen...');
    
    try {
      // Im Backend-Modus: Keine saveSettings mehr nötig (Auth wird separat gehandhabt)
      // Für Backward-Kompatibilität: Falls API-Key vorhanden, speichere ihn
      if (apiKey.trim() && !authStatus.backendMode) {
        const hasSaveSettings = bridge && isReady && ('saveSettings' in bridge || typeof bridge.saveSettings === 'function');
        if (hasSaveSettings) {
          bridge.saveSettings(apiKey.trim(), provider, '');
          addLog('✓ Einstellungen gespeichert', 'success');
        }
      } else {
        addLog('✓ Auth-Status aktualisiert', 'success');
      }
      
      // Callback für UI-Updates
      if (onSave) {
        onSave({ 
          authenticated: authStatus.authenticated,
          backendMode: authStatus.backendMode,
          models: loadedModels.length > 0 ? loadedModels : undefined,
          currentModel: loadedModels.length > 0 ? loadedModels[0].name : undefined
        });
      }
      
      onClose();
    } catch (e) {
      addLog(`✗ Fehler beim Speichern: ${e.message}`, 'error');
      setError('Fehler beim Speichern: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-base-200 border border-base-300 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-300">
          <h2 className="text-xl font-semibold text-base-content">Einstellungen</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-medium">Fehler:</span>
                <span className="ml-1">{error}</span>
              </div>
            </div>
          )}

          {/* Provider Info (nur Google) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-base-content">
              Provider
            </label>
            <div className="w-full px-4 py-2.5 bg-base-300 border border-base-300 rounded-lg text-base-content">
              Google Gemini
            </div>
          </div>

          {/* Auth Status */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-base-content">
              <Key size={16} className="text-base-content/70" />
              Authentifizierung
            </label>
            <div className="w-full px-4 py-3 bg-base-300 border border-base-300 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {authStatus.authenticated ? (
                    <>
                      <CheckCircle size={18} className="text-success" />
                      <span className="text-sm text-base-content">Verbunden</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} className="text-error" />
                      <span className="text-sm text-base-content">Nicht verbunden</span>
                    </>
                  )}
                </div>
                {authStatus.backendUrl && (
                  <span className="text-xs text-base-content/50">
                    {authStatus.backendUrl.replace('https://', '').substring(0, 30)}...
                  </span>
                )}
              </div>
              {!authStatus.authenticated && (
                <p className="text-xs text-base-content/50 mt-2">
                  Bitte verbinden Sie sich mit Ihrem Account, um das Plugin zu nutzen.
                </p>
              )}
            </div>
            {!authStatus.authenticated && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full btn btn-primary gap-2"
              >
                {connecting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verbinde...
                  </>
                ) : (
                  <>
                    <ExternalLink size={16} />
                    Verbinden
                  </>
                )}
              </button>
            )}
          </div>

          {/* Quota Status Section */}
          {authStatus.authenticated && (
            <div className="form-control">
              <label className="label">
                <span className="label-text text-base-content font-semibold">Nutzungslimit</span>
              </label>
              <div className="px-4 py-3 bg-base-300 border border-base-300 rounded-lg">
                {loadingQuota ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-base-content/50" />
                    <span className="text-sm text-base-content/70">Lade Quota-Status...</span>
                  </div>
                ) : quotaStatus ? (
                  <div className="space-y-3">
                    {/* Deep Requests */}
                    {quotaStatus.deep.limit !== -1 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-base-content">Deep Requests</span>
                          <span className={`text-sm font-medium ${
                            quotaStatus.deep.remaining === 0 ? 'text-error' : 
                            quotaStatus.deep.remaining <= quotaStatus.deep.limit * 0.2 ? 'text-warning' : 
                            'text-success'
                          }`}>
                            {quotaStatus.deep.used}/{quotaStatus.deep.limit}
                          </span>
                        </div>
                        <div className="w-full bg-base-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              quotaStatus.deep.remaining === 0 ? 'bg-error' : 
                              quotaStatus.deep.remaining <= quotaStatus.deep.limit * 0.2 ? 'bg-warning' : 
                              'bg-success'
                            }`}
                            style={{ width: `${Math.min(100, (quotaStatus.deep.used / quotaStatus.deep.limit) * 100)}%` }}
                          />
                        </div>
                        {quotaStatus.deep.remaining === 0 && (
                          <div className="mt-2 p-2 bg-error/10 border border-error/20 rounded text-xs text-error">
                            <p className="mb-2">Tageslimit erreicht. Upgrade für mehr Requests?</p>
                            <button
                              onClick={handleConnect}
                              className="w-full btn btn-sm btn-error gap-2"
                            >
                              <ExternalLink size={14} />
                              Jetzt upgraden
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Flash Requests - nur anzeigen wenn limitiert */}
                    {quotaStatus.flash.limit !== -1 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-base-content">Flash Requests</span>
                          <span className="text-sm font-medium text-base-content/70">
                            {quotaStatus.flash.used}/{quotaStatus.flash.limit === -1 ? '∞' : quotaStatus.flash.limit}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-base-content/50 mt-2">
                      Reset: {new Date(quotaStatus.resetAt).toLocaleString('de-DE')}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-base-content/50">
                    Quota-Status nicht verfügbar
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 text-center">
             <p className="text-[10px] uppercase tracking-widest text-base-content/20 font-medium">
                Made by Johannes Jens Hinkel
             </p>
          </div>

          {/* Status & Debug Info */}
          {apiKey.trim() && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-base-content">
                Status
                {loadingModels && <Loader2 size={14} className="animate-spin" />}
              </div>
              <div className="px-4 py-2.5 bg-base-300 border border-base-300 rounded-lg text-sm">
                {loadingModels ? (
                  <span className="text-base-content/70">Lade Modelle...</span>
                ) : error ? (
                  <span className="text-error">Fehler: {error}</span>
                ) : (
                  <span className="text-success">✓ API-Key konfiguriert</span>
                )}
              </div>
              
              {/* Debug Log */}
              {debugLog.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-base-content/50 cursor-pointer hover:text-base-content/70">
                    Debug-Log anzeigen ({debugLog.length} Einträge)
                  </summary>
                  <div className="mt-2 p-3 bg-base-300/50 border border-base-300 rounded-lg text-xs font-mono max-h-40 overflow-y-auto">
                    {debugLog.map((log, i) => (
                      <div key={i} className="mb-1 text-base-content/70">
                        {log}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-base-300 bg-base-300/30">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-base-content/70 hover:text-base-content transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="btn btn-primary gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {loading ? 'Speichere...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
