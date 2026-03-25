import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sendTokenToPlugin, checkPluginServer, copyToClipboard } from '../utils/deepLink';
import { CheckCircle2, Copy, Loader2, AlertCircle, ExternalLink } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';

type TransferStatus = 'checking' | 'sending' | 'success' | 'manual';

export function AuthCallbackPage() {
  const { user, getAuthToken, getRefreshToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<TransferStatus>('checking');
  const [transferError, setTransferError] = useState<string | null>(null);

  // Get link code from URL params (set by Anki addon)
  const linkCode = searchParams.get('link');

  useEffect(() => {
    const connectPlugin = async () => {
      if (!user) {
        // Preserve link param through login redirect
        const loginUrl = linkCode ? `/login?link=${linkCode}` : '/login';
        navigate(loginUrl);
        return;
      }

      try {
        const token = await getAuthToken();
        if (!token) {
          setError('Token-Generierung fehlgeschlagen');
          setLoading(false);
          return;
        }

        setIdToken(token);
        const refreshToken = getRefreshToken() || '';

        // Primary method: Link-Code flow (HTTPS→HTTPS, no Mixed Content)
        if (linkCode) {
          setTransferStatus('sending');
          try {
            const response = await fetch(`${BACKEND_URL}/auth/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: linkCode,
                idToken: token,
                refreshToken,
              }),
            });

            if (response.ok) {
              setTransferStatus('success');
              setLoading(false);
              return;
            }
            // Backend error — fall through to legacy methods
            setTransferError('Backend-Verbindung fehlgeschlagen');
          } catch {
            setTransferError('Netzwerkfehler');
          }
        }

        // Legacy fallback: Direct HTTP POST to local auth server
        setTransferStatus('checking');
        const serverAvailable = await checkPluginServer();

        if (serverAvailable) {
          setTransferStatus('sending');
          const result = await sendTokenToPlugin(token, refreshToken);

          if (result.success) {
            setTransferStatus('success');
            setLoading(false);
            return;
          }
          setTransferError(result.error || 'Transfer fehlgeschlagen');
        }

        // All automatic methods failed — show manual fallback
        setTransferStatus('manual');
        setLoading(false);
      } catch (err: any) {
        setError('Fehler: ' + err.message);
        setLoading(false);
      }
    };

    connectPlugin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, linkCode]);

  const handleCopyToken = async () => {
    if (idToken) {
      const refreshToken = getRefreshToken() || '';
      const tokenPayload = JSON.stringify({
        token: idToken,
        refreshToken: refreshToken,
      });
      const success = await copyToClipboard(tokenPayload);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    }
  };

  const handleRetryTransfer = async () => {
    if (!idToken) return;
    setTransferStatus('sending');
    setTransferError(null);
    const refreshToken = getRefreshToken() || '';

    // Try link-code first if available
    if (linkCode) {
      try {
        const response = await fetch(`${BACKEND_URL}/auth/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: linkCode,
            idToken: idToken,
            refreshToken,
          }),
        });
        if (response.ok) {
          setTransferStatus('success');
          return;
        }
      } catch { /* fall through */ }
    }

    // Legacy fallback
    const result = await sendTokenToPlugin(idToken, refreshToken);
    if (result.success) {
      setTransferStatus('success');
    } else {
      setTransferError(result.error || 'Transfer fehlgeschlagen');
      setTransferStatus('manual');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#0a84ff] mx-auto mb-4" />
          <p className="text-neutral-400">
            {transferStatus === 'checking' && 'Suche Anki Plugin...'}
            {transferStatus === 'sending' && 'Verbinde mit Anki...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#141414] border border-red-500/20 rounded-2xl p-8">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-bold mb-2">Fehler</h2>
              <p className="text-red-400">{error}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white font-semibold rounded-lg transition-colors"
          >
            Zurück zum Login
          </button>
        </div>
      </div>
    );
  }

  // Success — auto-connected
  if (transferStatus === 'success') {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white flex items-center justify-center p-6 relative">
        <div className="w-full max-w-md relative z-10">
          <div className="bg-[#141414] border border-green-500/20 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Verbunden!</h2>
            <p className="text-neutral-400 text-sm mb-6">
              Dein Anki Plugin wurde automatisch mit deinem Account verbunden.
              {linkCode && ' Du kannst dieses Fenster schließen und zu Anki zurückkehren.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/account')}
                className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 py-3 bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white font-semibold rounded-lg transition-colors"
              >
                Startseite
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Manual fallback — all automatic methods failed
  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white flex items-center justify-center p-6 relative">
      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#141414] border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <ExternalLink className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Manuell verbinden</h2>
            <p className="text-neutral-400 text-sm">
              {transferError
                ? 'Automatische Verbindung fehlgeschlagen. Kopiere den Schlüssel manuell.'
                : 'Anki Plugin nicht erreichbar. Stelle sicher, dass Anki läuft.'}
            </p>
          </div>

          {/* Retry Button */}
          <button
            onClick={handleRetryTransfer}
            className="w-full py-3 mb-4 bg-[#0a84ff]/10 border border-[#0a84ff]/20 text-[#0a84ff] font-medium rounded-lg hover:bg-[#0a84ff]/20 transition-colors text-sm"
          >
            Erneut automatisch verbinden
          </button>

          {/* Token Section */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-neutral-300">
                Verbindungsschlüssel
              </label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-neutral-500 text-xs font-mono truncate">
                  {idToken ? `${idToken.slice(0, 20)}...` : ''}
                </div>
                <button
                  onClick={handleCopyToken}
                  className={`px-4 py-3 border rounded-lg transition-colors ${
                    copied
                      ? 'bg-green-500/10 border-green-500/20 text-green-400'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                  title="Schlüssel kopieren"
                >
                  {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              {copied && (
                <p className="mt-2 text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Kopiert! Füge den Schlüssel in Anki ein.
                </p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-[#0a84ff]/10 border border-[#0a84ff]/20 rounded-lg">
            <p className="text-sm text-[#0a84ff] mb-3 font-medium">So verbindest du manuell:</p>
            <ol className="text-xs text-neutral-400 space-y-2 list-decimal list-inside">
              <li><strong>Kopiere den Schlüssel</strong> oben</li>
              <li><strong>Öffne Anki</strong> und das Chat-Panel (Cmd+I / Ctrl+I)</li>
              <li><strong>Klicke auf dein Profil</strong> (oben rechts)</li>
              <li><strong>Füge den Schlüssel ein</strong> und klicke &quot;Verifizieren&quot;</li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/account')}
              className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-colors"
            >
              Dashboard
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white font-semibold rounded-lg transition-colors"
            >
              Startseite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
