import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils/deepLink';
import { CheckCircle2, Copy, Loader2, AlertCircle } from 'lucide-react';

export function AuthCallbackPage() {
  const { user, getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateToken = async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      // Prüfe ob User gerade erst registriert wurde (nur beim ersten Mal zeigen)
      // Wenn creationTime === lastSignInTime, ist es eine neue Registrierung
      const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
      
      if (!isNewUser) {
        // User hat sich bereits vorher eingeloggt - direkt zum Dashboard
        navigate('/dashboard');
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
        setLoading(false);
      } catch (err: any) {
        setError('Fehler beim Generieren des Tokens: ' + err.message);
        setLoading(false);
      }
    };

    generateToken();
  }, [user, getAuthToken, navigate]);

  const handleCopyToken = async () => {
    if (idToken) {
      const success = await copyToClipboard(idToken);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
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
          </div>

          {/* Token Section */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-neutral-300">
                Auth-Token
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={idToken || ''}
                  readOnly
                  className="flex-1 px-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white text-xs font-mono"
                />
                <button
                  onClick={handleCopyToken}
                  className={`px-4 py-3 border rounded-lg transition-colors ${
                    copied
                      ? 'bg-green-500/10 border-green-500/20 text-green-400'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                  title="Token kopieren"
                >
                  {copied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              {copied && (
                <p className="mt-2 text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Token kopiert! Füge ihn jetzt in Anki ein.
                </p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-teal-500/10 border border-teal-500/20 rounded-lg">
            <p className="text-sm text-teal-300 mb-3 font-medium">So verbindest du das Plugin:</p>
            <ol className="text-xs text-neutral-400 space-y-2 list-decimal list-inside">
              <li>
                <strong>Kopiere den Token</strong> (Button oben) oder markiere ihn und kopiere ihn manuell
              </li>
              <li>
                <strong>Öffne Anki</strong> und das Chatbot-Panel (Cmd+I / Ctrl+I)
              </li>
              <li>
                <strong>Klicke auf "Profil"</strong> (oben rechts im Header)
              </li>
              <li>
                <strong>Füge den Token ein</strong> und klicke auf "Speichern"
              </li>
              <li>
                <strong>Prüfe den Status:</strong> Du solltest "✅ Verbunden" sehen
              </li>
            </ol>
          </div>

          {/* Visual Guide */}
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-400 mb-2 font-medium">
              💡 <strong>Wo finde ich den Profil-Button?</strong>
            </p>
            <p className="text-xs text-neutral-400">
              Öffne das Chatbot-Panel in Anki. Oben rechts im Header siehst du einen <span className="font-mono bg-blue-500/20 px-1 rounded">Profil</span> Button. 
              Klicke darauf, um den Token einzufügen.
            </p>
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
