import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const { login, resetPassword, firebaseConfigured } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      // Redirect to auth callback to generate deep link
      navigate('/auth/callback');
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
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

  const handleGoogleSuccess = () => {
    navigate('/auth/callback');
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center p-6 relative">
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-teal-900/10 blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-3 font-bold text-xl tracking-tight mb-6">
              <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20">
                <span className="text-teal-400">A+</span>
              </div>
              <span className="text-white">ANKI+</span>
            </Link>
            <h1 className="text-2xl font-bold mb-2">Willkommen zurück</h1>
            <p className="text-neutral-400 text-sm">Melde dich an, um fortzufahren</p>
          </div>

          {/* Firebase Not Configured Warning */}
          {!firebaseConfigured && (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-400 font-medium mb-1">
                  Firebase Auth is not configured
                </p>
                <p className="text-xs text-yellow-400/80">
                  Please configure Firebase API keys in your environment variables. See SETUP.md for instructions.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Reset Password Success */}
          {resetSuccess && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-sm text-green-400">
                Passwort-Reset-E-Mail wurde gesendet. Bitte überprüfe dein Postfach.
              </p>
            </div>
          )}

          {!showResetPassword ? (
            <>
              {/* Google Sign-In */}
              <GoogleSignInButton onSuccess={handleGoogleSuccess} className="mb-6" />

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-[#0A0A0A] text-neutral-500">oder</span>
                </div>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2 text-neutral-300">
                    E-Mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="deine@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2 text-neutral-300">
                    Passwort
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="text-sm text-teal-400 hover:text-teal-300 transition-colors"
                  >
                    Passwort vergessen?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Wird angemeldet...
                    </>
                  ) : (
                    'Anmelden'
                  )}
                </button>
              </form>

              {/* Register Link */}
              <div className="mt-6 text-center text-sm text-neutral-400">
                Noch kein Account?{' '}
                <Link to="/register" className="text-teal-400 hover:text-teal-300 transition-colors font-medium">
                  Jetzt registrieren
                </Link>
              </div>
            </>
          ) : (
            <>
              {/* Reset Password Form */}
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium mb-2 text-neutral-300">
                    E-Mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 transition-colors"
                      placeholder="deine@email.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resetLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    'Reset-Link senden'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(false);
                  setResetEmail('');
                  setResetSuccess(false);
                }}
                className="mt-4 w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Zurück zum Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

