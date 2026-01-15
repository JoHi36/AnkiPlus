import React, { useState, useEffect } from 'react';
import { X, User, Save, AlertCircle, Loader2, Eye, EyeOff, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

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
      console.log('ProfileDialog: ankiReceive Event:', payload.type, payload);
      if (payload.type === 'authStatusLoaded' && payload.data) {
        handleAuthStatusLoaded({ detail: payload.data });
      } else if (payload.type === 'auth_success') {
        console.log('ProfileDialog: auth_success Event erhalten');
        checkAuthStatus();
        setError('');
        setLoading(false);
      } else if (payload.type === 'auth_error') {
        console.log('ProfileDialog: auth_error Event erhalten:', payload.message);
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
        // Backend-URL ist die Cloud Function Base-URL, Express-Routen beginnen mit /api
        const response = await fetch(`${authStatus.backendUrl}/api/user/quota`, {
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
      // Validiere Token durch Authentifizierung
      if (bridge && bridge.authenticate) {
        bridge.authenticate(authToken.trim(), '');
        // Feedback kommt über auth_success/auth_error Events
      } else {
        setError('Bridge nicht verfügbar');
        setLoading(false);
      }
    } catch (err) {
      setError('Fehler beim Speichern: ' + err.message);
      setLoading(false);
    }
  };

  const handleConnect = () => {
    window.open('https://anki-plus.vercel.app/login', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md border border-base-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-base-300">
          <div className="flex items-center gap-3">
            <User size={24} className="text-primary" />
            <h2 className="text-xl font-semibold text-base-content">Profil</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-base-300 rounded-lg transition-colors"
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

          {/* Auth Status */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-base-content">
              <User size={16} className="text-base-content/70" />
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
              </div>
            </div>
          </div>

          {/* Quota Status */}
          {quotaStatus && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-base-content">Nutzung</label>
              <div className="w-full px-4 py-3 bg-base-300 border border-base-300 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-base-content/70">Flash Requests:</span>
                  <span className="text-base-content">
                    {quotaStatus.flash?.used || 0} / {quotaStatus.flash?.limit === -1 ? '∞' : quotaStatus.flash?.limit || 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-base-content/70">Deep Requests:</span>
                  <span className="text-base-content">
                    {quotaStatus.deep?.used || 0} / {quotaStatus.deep?.limit === -1 ? '∞' : quotaStatus.deep?.limit || 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Auth Token Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-base-content">
              Auth-Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Füge hier deinen Token ein..."
                className="w-full px-4 py-3 pr-12 bg-base-300 border border-base-300 rounded-lg text-base-content placeholder-base-content/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-base-200 rounded"
              >
                {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-base-content/50">
              Kopiere den Token von der Landingpage und füge ihn hier ein.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConnect}
              className="flex-1 btn btn-outline gap-2"
            >
              <ExternalLink size={16} />
              Zur Landingpage
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !authToken.trim()}
              className="flex-1 btn btn-primary gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Speichere...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Speichern
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

