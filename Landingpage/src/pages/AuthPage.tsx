import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { PageNav } from '../components/PageNav';
import { Loader2, AlertCircle } from 'lucide-react';

type AuthTab = 'login' | 'register';

export function AuthPage() {
  const { login, register: registerUser, resetPassword, firebaseConfigured } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkCode = searchParams.get('link');

  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password reset state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const callbackUrl = linkCode ? `/auth/callback?link=${linkCode}` : '/auth/callback';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(callbackUrl);
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }
    if (!acceptTerms) {
      setError('Bitte akzeptiere die Nutzungsbedingungen');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await registerUser(email, password);
      navigate(callbackUrl);
    } catch (err: any) {
      setError(err.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError(null);
    try {
      await resetPassword(resetEmail);
      setResetSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Passwort-Reset fehlgeschlagen');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSuccess = () => navigate(callbackUrl);

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setError(null);
    setShowReset(false);
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92] flex flex-col items-center justify-center p-6" style={{ animation: 'fadeIn 300ms ease' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

      {/* Top nav — absolute positioned */}
      <div className="absolute top-6 left-6 right-6 max-w-7xl mx-auto">
        <PageNav rightContent={
          <Link to="/" className="text-[13px] text-white/[0.35] font-light hover:text-white/[0.55] transition-colors">
            Startseite
          </Link>
        } />
      </div>

      <div className="w-full max-w-[380px]">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.03em] mb-1.5">Willkommen.</h1>
          <p className="text-[13px] text-white/[0.35] font-light">
            Melde dich an oder erstelle einen Account.
          </p>
        </div>

        {/* Tab Switch */}
        <div className="flex bg-white/[0.04] rounded-[10px] p-[3px] mb-7">
          {(['login', 'register'] as AuthTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`flex-1 py-2.5 text-[13px] font-medium rounded-[8px] transition-all ${
                activeTab === tab
                  ? 'bg-white/[0.08] text-white/[0.92]'
                  : 'text-white/[0.35] hover:text-white/[0.55]'
              }`}
            >
              {tab === 'login' ? 'Anmelden' : 'Registrieren'}
            </button>
          ))}
        </div>

        {/* Firebase warning */}
        {!firebaseConfigured && (
          <div className="mb-5 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-[10px] flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-400/80">Firebase Auth nicht konfiguriert.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-[10px] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}

        {/* Reset success */}
        {resetSuccess && (
          <div className="mb-5 p-3.5 bg-green-500/10 border border-green-500/20 rounded-[10px]">
            <p className="text-[12px] text-green-400">Reset-Link wurde gesendet. Prüfe dein Postfach.</p>
          </div>
        )}

        {showReset ? (
          <>
            <form onSubmit={handleReset} className="space-y-3.5">
              <div>
                <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">E-Mail</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  placeholder="deine@email.com"
                />
              </div>
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-2.5 rounded-[10px] bg-[#0a84ff] text-white text-[13px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird gesendet...</> : 'Reset-Link senden'}
              </button>
            </form>
            <button
              onClick={() => { setShowReset(false); setResetSuccess(false); }}
              className="mt-4 w-full py-2 text-[12px] text-white/[0.35] hover:text-white/[0.55] transition-colors"
            >
              Zurück
            </button>
          </>
        ) : (
          <>
            <GoogleSignInButton onSuccess={handleGoogleSuccess} className="mb-5" />

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[11px] text-white/[0.2] font-light">oder</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  placeholder="deine@email.com"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {activeTab === 'register' && (
                <>
                  <div>
                    <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">Passwort bestätigen</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 accent-[#0a84ff]"
                    />
                    <span className="text-[12px] text-white/[0.35] font-light leading-relaxed">
                      Ich akzeptiere die <a href="/terms" className="text-white/[0.5] underline underline-offset-2 decoration-white/[0.15]">Nutzungsbedingungen</a> und <a href="/privacy" className="text-white/[0.5] underline underline-offset-2 decoration-white/[0.15]">Datenschutzrichtlinie</a>
                    </span>
                  </label>
                </>
              )}

              {activeTab === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    className="text-[12px] text-[#0a84ff] hover:brightness-110 transition-all"
                  >
                    Passwort vergessen?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-[10px] bg-[#0a84ff] text-white text-[13px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {activeTab === 'login' ? 'Wird angemeldet...' : 'Wird registriert...'}</>
                ) : (
                  activeTab === 'login' ? 'Anmelden' : 'Registrieren'
                )}
              </button>
            </form>

            <p className="text-center text-[12px] text-white/[0.2] font-light mt-4">
              {activeTab === 'login'
                ? <>Mit der Anmeldung akzeptierst du die <a href="/terms" className="text-white/[0.35] underline underline-offset-2 decoration-white/[0.1]">Nutzungsbedingungen</a></>
                : null
              }
            </p>
          </>
        )}
      </div>
    </div>
  );
}
