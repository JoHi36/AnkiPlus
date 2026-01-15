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
        
        // Kopiere Token automatisch ins Clipboard (primäre Methode)
        // Plugin überwacht Clipboard automatisch und erkennt Token
        const tryAutoConnect = async () => {
          setConnecting(true);
          
          // Kopiere Token ins Clipboard
          const copied = await copyToClipboard(token);
          if (copied) {
            console.log('✅ Token ins Clipboard kopiert! Plugin erkennt ihn automatisch.');
            setPluginConnected(true); // Optimistisch - Plugin prüft alle 1 Sekunde
            // Zeige Hinweis
            setTimeout(() => {
              setConnecting(false);
            }, 2000);
          } else {
            console.log('⚠️ Fehler beim Kopieren ins Clipboard');
            // Fallback: Token-Datei erstellen
            await writeTokenToFile(token);
            setConnecting(false);
          }
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
                    Token wird ins Clipboard kopiert...
                  </p>
                </div>
              </div>
            )}
            {pluginConnected && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-green-400 text-sm font-medium mb-2">
                  ✅ Token ins Clipboard kopiert!
                </p>
                <p className="text-green-300 text-xs mb-2">
                  Das Plugin erkennt den Token automatisch innerhalb von 1 Sekunde.
                </p>
                <div className="mt-3 p-2 bg-green-500/5 border border-green-500/10 rounded text-xs">
                  <p className="text-green-400 font-medium mb-1">📍 Wo sehe ich den Status?</p>
                  <ol className="text-green-300 space-y-1 ml-4 list-decimal">
                    <li>Öffne das Chatbot-Panel in Anki (Cmd+I / Ctrl+I)</li>
                    <li>Oben rechts siehst du einen Badge: <span className="font-mono bg-green-500/20 px-1 rounded">✓ Verbunden</span> oder <span className="font-mono bg-red-500/20 px-1 rounded">✗ Nicht verbunden</span></li>
                    <li>Alternativ: Öffne die Einstellungen (Zahnrad-Icon) → "Authentifizierung"</li>
                  </ol>
                </div>
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
              <div className="text-xs text-green-400">
                <p className="mb-2">
                  ✅ Token wurde automatisch ins Clipboard kopiert!
                </p>
                <p className="mb-2">
                  Das Plugin erkennt den Token automatisch innerhalb von 1 Sekunde.
                </p>
                <div className="mt-2 p-2 bg-green-500/5 border border-green-500/10 rounded">
                  <p className="text-green-300 font-medium mb-1">📍 Status prüfen:</p>
                  <p className="text-green-200 text-[11px]">
                    Öffne das Chatbot-Panel (Cmd+I) → Oben rechts siehst du <span className="font-mono bg-green-500/20 px-1 rounded">✓ Verbunden</span>
                  </p>
                </div>
              </div>
            ) : (
              <ol className="text-xs text-neutral-400 space-y-2 list-decimal list-inside">
                <li>
                  <strong>Automatisch (empfohlen):</strong> Der Token wird automatisch ins Clipboard kopiert.
                  <span className="block mt-1 text-green-400">
                    ✅ Das Plugin überwacht das Clipboard automatisch und verbindet sich selbst!
                  </span>
                </li>
                <li>
                  <strong>Falls das nicht funktioniert:</strong> Stelle sicher, dass Anki läuft und das Plugin aktiviert ist.
                </li>
                <li>
                  <strong>Fallback:</strong> Eine Token-Datei wurde heruntergeladen. Kopiere sie ins Addon-Verzeichnis falls nötig.
                </li>
              </ol>
            )}
          </div>
          
          {/* Clipboard Info */}
          {!pluginConnected && (
            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-400 mb-2">
                💡 <strong>Wie es funktioniert:</strong>
              </p>
              <p className="text-xs text-neutral-400">
                Der Token wird automatisch ins Clipboard kopiert. Das Plugin überwacht das Clipboard 
                kontinuierlich und erkennt Firebase-Tokens automatisch. Innerhalb von 1 Sekunde nach dem 
                Kopieren sollte die Verbindung hergestellt sein.
              </p>
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

