import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { generateDeepLink, openDeepLink, copyToClipboard, writeTokenToFile, sendTokenToPlugin, checkPluginServer } from '../utils/deepLink';
import { CheckCircle2, Copy, ExternalLink, Loader2, AlertCircle, Download } from 'lucide-react';

export function AuthCallbackPage() {
  const { user, getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [idToken, setIdToken] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pluginConnected, setPluginConnected] = useState(false);
  const [pluginServerAvailable, setPluginServerAvailable] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const generateTokens = async () => {
      if (!user) {
        navigate('/login');
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
        
        // Generate deep link as fallback
        const link = generateDeepLink(token);
        setDeepLink(link);
        
        // Versuche automatische Verbindung via HTTP POST (primäre Methode)
        const tryAutoConnect = async () => {
          setConnecting(true);
          
          // Versuche direkt Token zu senden (ohne vorherigen Health-Check)
          // Health-Check kann wegen Mixed Content (HTTPS -> HTTP) fehlschlagen,
          // aber der POST-Request könnte trotzdem funktionieren
          const result = await sendTokenToPlugin(token);
          
          if (result.success) {
            setPluginConnected(true);
            setPluginServerAvailable(true);
            console.log('✅ Token erfolgreich an Plugin gesendet!');
          } else {
            // Prüfe ob Server erreichbar ist (für bessere Fehlermeldung)
            const serverAvailable = await checkPluginServer();
            setPluginServerAvailable(serverAvailable);
            
            console.log('⚠️ HTTP-Verbindung fehlgeschlagen:', result.error);
            
            // Fallback: Token-Datei erstellen
            await writeTokenToFile(token);
          }
          
          setConnecting(false);
        };
        
        // Starte automatische Verbindung
        tryAutoConnect();
        
        setLoading(false);
      } catch (err: any) {
        setError('Fehler beim Generieren der Tokens: ' + err.message);
        setLoading(false);
      }
    };

    generateTokens();
  }, [user, getAuthToken, navigate]);

  const handleCopyToken = async () => {
    if (idToken) {
      const success = await copyToClipboard(idToken);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleCopyDeepLink = async () => {
    if (deepLink) {
      const success = await copyToClipboard(deepLink);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
          <p className="text-neutral-400">Generiere Authentifizierungs-Token...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#0A0A0A] border border-red-500/20 rounded-2xl p-8">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-bold mb-2">Fehler</h2>
              <p className="text-red-400">{error}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors"
          >
            Zurück zum Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center p-6 relative">
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-teal-900/10 blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Success Icon */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Erfolgreich angemeldet!</h2>
            <p className="text-neutral-400 text-sm">
              Verbinde jetzt dein Anki Plugin mit deinem Account
            </p>
            {connecting && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <p className="text-blue-400 text-sm font-medium">
                    Verbinde mit Plugin...
                  </p>
                </div>
              </div>
            )}
            {pluginConnected && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-green-400 text-sm font-medium">
                  ✅ Plugin erfolgreich verbunden!
                </p>
              </div>
            )}
            {pluginServerAvailable === false && !pluginConnected && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-yellow-400 text-sm font-medium mb-2">
                  ⚠️ Anki ist nicht erreichbar
                </p>
                <p className="text-yellow-300 text-xs">
                  Stelle sicher, dass:
                </p>
                <ul className="text-yellow-300 text-xs mt-1 ml-4 list-disc">
                  <li>Anki geöffnet ist</li>
                  <li>Das Plugin aktiviert ist (Tools → Add-ons → ankibot)</li>
                </ul>
                <p className="text-neutral-400 text-xs mt-2">
                  Eine Token-Datei wurde als Fallback heruntergeladen. Du kannst sie später verwenden, wenn Anki läuft.
                </p>
              </div>
            )}
          </div>

          {/* Deep Link Section */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-neutral-300">
                Deep Link (automatisch öffnen)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deepLink || ''}
                  readOnly
                  className="flex-1 px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white text-sm font-mono"
                />
                <button
                  onClick={handleCopyDeepLink}
                  className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  title="Deep Link kopieren"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button
                  onClick={() => deepLink && openDeepLink(deepLink)}
                  className="px-4 py-3 bg-teal-500 hover:bg-teal-400 text-black rounded-lg transition-colors"
                  title="Deep Link öffnen"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
              </div>
              {copied && (
                <p className="mt-2 text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Kopiert!
                </p>
              )}
            </div>

            {/* Token Section (Fallback) */}
            <div>
              <label className="block text-sm font-medium mb-2 text-neutral-300">
                Token (manuell kopieren)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={idToken || ''}
                  readOnly
                  className="flex-1 px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white text-xs font-mono truncate"
                />
                <button
                  onClick={handleCopyToken}
                  className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  title="Token kopieren"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Falls der Deep Link nicht funktioniert, kopiere diesen Token und füge ihn manuell im Plugin ein.
              </p>
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-teal-500/10 border border-teal-500/20 rounded-lg">
            <p className="text-sm text-teal-300 mb-2 font-medium">So verbindest du das Plugin:</p>
            {pluginConnected ? (
              <p className="text-xs text-green-400">
                ✅ Die Verbindung wurde automatisch hergestellt! Du kannst jetzt das Plugin verwenden.
                <span className="block mt-2">
                  Prüfe in Anki, ob oben rechts "Verbunden" steht.
                </span>
              </p>
            ) : (
              <ol className="text-xs text-neutral-400 space-y-2 list-decimal list-inside">
                <li>
                  <strong>Automatisch (empfohlen):</strong> Das Plugin versucht sich automatisch zu verbinden.
                  <span className="block mt-1 text-yellow-400">
                    ⚠️ Stelle sicher, dass Anki läuft und das Plugin aktiviert ist.
                  </span>
                </li>
                <li>
                  <strong>Fallback:</strong> Falls die automatische Verbindung nicht funktioniert, 
                  wurde eine Token-Datei heruntergeladen. Kopiere sie ins Addon-Verzeichnis.
                </li>
                <li>
                  <strong>Manuell:</strong> Alternativ kannst du den Token kopieren und in die Plugin-Einstellungen einfügen.
                </li>
              </ol>
            )}
          </div>
          
          {/* Fallback Info */}
          {pluginServerAvailable === false && !pluginConnected && (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-xs text-yellow-400 mb-2 font-medium">
                ⚠️ Anki ist nicht erreichbar
              </p>
              <p className="text-xs text-neutral-400 mb-2">
                Die automatische Verbindung konnte nicht hergestellt werden. Bitte:
              </p>
              <ol className="text-xs text-neutral-400 space-y-1 ml-4 list-decimal">
                <li>Öffne Anki</li>
                <li>Stelle sicher, dass das Plugin aktiviert ist</li>
                <li>Lade diese Seite neu oder kopiere die Token-Datei ins Addon-Verzeichnis</li>
              </ol>
              <p className="text-xs text-neutral-500 mt-3">
                Eine Token-Datei wurde als Fallback heruntergeladen. Pfad:
              </p>
              <code className="block mt-1 px-2 py-1 bg-black/20 rounded text-[10px] font-mono break-all">
                ~/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.anki-auth-token
              </code>
            </div>
          )}
          
          {/* File Download Button */}
          <div className="mb-6">
            <button
              onClick={async () => {
                if (idToken) {
                  const result = await writeTokenToFile(idToken);
                  if (result.success) {
                    setTokenFileCreated(true);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }
              }}
              className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Token-Datei erneut herunterladen
            </button>
            {copied && (
              <p className="mt-2 text-sm text-green-400 flex items-center gap-2 justify-center">
                <CheckCircle2 className="w-4 h-4" />
                Datei heruntergeladen!
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleGoToDashboard}
              className="flex-1 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-lg hover:bg-white/10 transition-colors"
            >
              Zum Dashboard
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors"
            >
              Zur Startseite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

