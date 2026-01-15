import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { Loader2, Mail, Lock, AlertCircle, Check } from 'lucide-react';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein.');
      setLoading(false);
      return;
    }

    if (!acceptedTerms) {
      setError('Bitte akzeptiere die Nutzungsbedingungen.');
      setLoading(false);
      return;
    }

    try {
      await register(email, password);
      // Redirect to auth callback to generate deep link
      navigate('/auth/callback');
    } catch (err: any) {
      setError(err.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = () => {
    navigate('/auth/callback');
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* --- LAYER 1: Grid Pattern --- */}
      <div className="fixed inset-0 z-0 pointer-events-none h-screen">
        <div 
          className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px]"
          style={{
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)'
          }}
        />
      </div>

      {/* --- LAYER 2: High-End Atmosphere --- */}
      <div className="fixed top-[-20%] left-1/2 -translate-x-1/2 w-[100vw] h-[800px] bg-teal-500/15 rounded-full blur-[120px] pointer-events-none z-0 mix-blend-screen opacity-60" />
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Logo in Header */}
      <header className="absolute top-0 w-full z-50 p-4 sm:p-6 md:px-8">
        <div className="max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 font-bold text-lg sm:text-xl tracking-tight cursor-pointer group">
            <img 
              src="/anki-logo.png" 
              alt="ANKI+" 
              className="h-8 sm:h-9 w-auto object-contain"
            />
          </Link>
        </div>
      </header>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">Account erstellen</h1>
            <p className="text-neutral-400 text-sm">Starte deine Lernreise mit ANKI+</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

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

          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-4">
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
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 transition-colors"
                  placeholder="Mindestens 6 Zeichen"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium mb-2 text-neutral-300">
                Passwort bestätigen
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-[#111] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 transition-colors"
                  placeholder="Passwort wiederholen"
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                id="terms"
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
                className="mt-1 w-4 h-4 rounded border-white/10 bg-[#111] text-teal-500 focus:ring-teal-500 focus:ring-offset-0"
              />
              <label htmlFor="terms" className="text-sm text-neutral-400">
                Ich akzeptiere die{' '}
                <Link to="/terms" className="text-teal-400 hover:text-teal-300 transition-colors">
                  Nutzungsbedingungen
                </Link>{' '}
                und die{' '}
                <Link to="/privacy" className="text-teal-400 hover:text-teal-300 transition-colors">
                  Datenschutzerklärung
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Wird registriert...
                </>
              ) : (
                'Account erstellen'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center text-sm text-neutral-400">
            Bereits ein Account?{' '}
            <Link to="/login" className="text-teal-400 hover:text-teal-300 transition-colors font-medium">
              Jetzt anmelden
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}


