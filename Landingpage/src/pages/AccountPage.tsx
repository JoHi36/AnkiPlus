import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { useUnifiedQuota } from '../hooks/useUnifiedQuota';
import { useUsageHistory } from '../hooks/useUsageHistory';
import { PageNav } from '../components/PageNav';
import { PageFooter } from '../components/PageFooter';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { TokenUsageBar } from '../components/TokenUsageBar';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { Button } from '@shared/components/Button';
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { auth } from '../lib/firebase';

const TIER_DISPLAY: Record<string, { name: string; price: string }> = {
  free:  { name: 'Starter',  price: 'Kostenlos' },
  tier1: { name: 'Student',  price: '4,99 € / Monat' },
  tier2: { name: 'Exam Pro', price: '14,99 € / Monat' },
};

const API_URL = import.meta.env.VITE_BACKEND_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';

export function AccountPage() {
  const { user, logout, getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const { quota } = useUnifiedQuota();
  const { history } = useUsageHistory();

  // Inline edit states
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Stripe
  const [portalLoading, setPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const isGoogleAccount = user?.providerData?.some(p => p.providerId === 'google.com') ?? false;

  // Fetch user document
  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setNewEmail(user.email || '');
        setLoading(false);
      });
    }
  }, [user]);

  // Handle Stripe success/cancel params
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    if (success) {
      setShowSuccess(true);
      if (user) setTimeout(() => getUserDocument(user.uid).then(setUserDoc), 2000);
      setTimeout(() => { setSearchParams({}, { replace: true }); setShowSuccess(false); }, 5000);
    }
    if (canceled) {
      setShowCancel(true);
      setTimeout(() => { setSearchParams({}, { replace: true }); setShowCancel(false); }, 5000);
    }
  }, [searchParams, user, setSearchParams]);

  // --- Handlers ---
  const handleLogout = async () => { await logout(); navigate('/'); };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`${API_URL}/stripe/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Portal failed');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { setMessage({ type: 'error', text: 'Fehler beim Öffnen der Abo-Verwaltung.' }); }
    finally { setPortalLoading(false); }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth || newEmail === user.email) return;
    setSavingEmail(true); setMessage(null);
    try {
      await updateEmail(user, newEmail);
      setMessage({ type: 'success', text: 'E-Mail aktualisiert.' });
      setEditingEmail(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.code === 'auth/requires-recent-login' ? 'Bitte melde dich erneut an.' : err.message });
    } finally { setSavingEmail(false); }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth) return;
    if (newPassword !== confirmPassword) { setMessage({ type: 'error', text: 'Passwörter stimmen nicht überein.' }); return; }
    if (newPassword.length < 6) { setMessage({ type: 'error', text: 'Mindestens 6 Zeichen.' }); return; }
    setSavingPassword(true); setMessage(null);
    try {
      const cred = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setMessage({ type: 'success', text: 'Passwort aktualisiert.' });
      setEditingPassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.code === 'auth/wrong-password' ? 'Aktuelles Passwort ist falsch.' : err.message });
    } finally { setSavingPassword(false); }
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth) return;
    try {
      await deleteUser(user);
      await logout();
      navigate('/');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.code === 'auth/requires-recent-login' ? 'Bitte melde dich erneut an.' : err.message });
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#0a84ff]" />
      </div>
    );
  }

  // --- Derived values ---
  const tier = userDoc?.tier || 'free';
  const display = TIER_DISPLAY[tier] || TIER_DISPLAY.free;
  const isCancelled = userDoc?.subscriptionCancelAtPeriodEnd === true;
  const periodEnd = userDoc?.subscriptionCurrentPeriodEnd
    ? new Date(userDoc.subscriptionCurrentPeriodEnd.seconds * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : null;

  const heroGradient = isCancelled
    ? 'from-amber-500/[0.08] to-amber-500/[0.02]'
    : 'from-[#0a84ff]/[0.08] to-[#0a84ff]/[0.02]';
  const heroBorder = isCancelled ? 'border-amber-500/[0.12]' : 'border-[#0a84ff]/[0.12]';

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92]" style={{ animation: 'fadeIn 300ms ease' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

      {/* Toast notifications for Stripe */}
      {(showSuccess || showCancel) && (
        <div className="fixed top-6 right-6 z-50 max-w-sm">
          {showSuccess && (
            <div className="bg-[#141414] border border-green-500/20 rounded-xl p-4 flex items-start gap-3 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
              <div className="flex-1"><p className="text-[13px] font-medium">Zahlung erfolgreich!</p><p className="text-[11px] text-white/[0.35]">Dein Abo ist jetzt aktiv.</p></div>
              <button onClick={() => setShowSuccess(false)} className="text-white/[0.2]"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {showCancel && (
            <div className="bg-[#141414] border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="flex-1"><p className="text-[13px] font-medium">Zahlung abgebrochen.</p><p className="text-[11px] text-white/[0.35]">Es wurde nichts abgebucht.</p></div>
              <button onClick={() => setShowCancel(false)} className="text-white/[0.2]"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      )}

      <div className="max-w-[800px] mx-auto px-6 md:px-10 py-8">
        {/* Nav */}
        <PageNav rightContent={
          <div className="flex items-center gap-4">
            <Link to="/" className="text-[13px] text-white/[0.35] font-light hover:text-white/[0.55] transition-colors">Startseite</Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>Abmelden</Button>
          </div>
        } />

        {/* Message */}
        {message && (
          <div className={`mb-6 p-3.5 rounded-[10px] flex items-start gap-2.5 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />}
            <span className="text-[12px] flex-1" style={{ color: message.type === 'success' ? 'rgb(74,222,128)' : 'rgb(248,113,113)' }}>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-white/[0.2]"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* HERO CARD */}
        <div className={`bg-gradient-to-br ${heroGradient} border ${heroBorder} rounded-2xl p-8 md:p-9 relative overflow-hidden`}>
          <div className={`absolute -top-10 -right-10 w-[200px] h-[200px] rounded-full pointer-events-none ${isCancelled ? 'bg-amber-500/[0.08]' : 'bg-[#0a84ff]/[0.08]'}`} style={{ filter: 'blur(60px)' }} />

          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-white/[0.35] font-light mb-1.5">Dein Plan</div>
                <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">{display.name}.</h1>
                <p className="text-[13px] text-white/[0.35] font-light mt-1">
                  {isCancelled && periodEnd
                    ? `Gekündigt — aktiv bis ${periodEnd}`
                    : tier !== 'free' && periodEnd
                    ? `${display.price} — verlängert sich am ${periodEnd}`
                    : display.price}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {tier !== 'tier2' && !isCancelled && (
                  <Button variant="primary" size="sm" asChild>
                    <Link to="/#pricing">Upgrade</Link>
                  </Button>
                )}
                {tier !== 'free' && (
                  <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verwalten'}
                  </Button>
                )}
              </div>
            </div>

            {quota && <TokenUsageBar quota={quota} history={history} />}
          </div>
        </div>

        {/* COLLAPSED SECTIONS */}
        <div className="mt-8">
          <CollapsibleSection title="Verbindung" defaultOpen={true}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-400' : 'bg-white/[0.15]'}`} />
              <span className="text-[13px] text-white/[0.5] font-light">
                {user ? 'Anki-Plugin verbunden.' : 'Nicht verbunden. Starte Anki und melde dich im Plugin an.'}
              </span>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Account">
            <div className="space-y-0">
              {/* Email row */}
              <div className="flex justify-between items-center py-3.5 border-b border-white/[0.04]">
                <span className="text-[13px] text-white/[0.35] font-light">E-Mail</span>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-white/[0.7]">{user?.email}</span>
                  {!isGoogleAccount ? (
                    <button onClick={() => setEditingEmail(!editingEmail)} className="text-[12px] text-[#0a84ff]">Ändern</button>
                  ) : (
                    <span className="text-[11px] text-white/[0.2]">Google</span>
                  )}
                </div>
              </div>
              {editingEmail && !isGoogleAccount && (
                <form onSubmit={handleUpdateEmail} className="py-4 space-y-3 border-b border-white/[0.04]">
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="neue@email.com" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingEmail || newEmail === user?.email}
                      className="px-4 py-2 rounded-[8px] bg-[#0a84ff] text-white text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
                      {savingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Speichern
                    </button>
                    <button type="button" onClick={() => setEditingEmail(false)}
                      className="px-4 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-white/[0.5]">Abbrechen</button>
                  </div>
                </form>
              )}

              {/* Password row */}
              <div className="flex justify-between items-center py-3.5 border-b border-white/[0.04]">
                <span className="text-[13px] text-white/[0.35] font-light">Passwort</span>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-white/[0.7]">••••••••</span>
                  {!isGoogleAccount ? (
                    <button onClick={() => setEditingPassword(!editingPassword)} className="text-[12px] text-[#0a84ff]">Ändern</button>
                  ) : (
                    <span className="text-[11px] text-white/[0.2]">Google</span>
                  )}
                </div>
              </div>
              {editingPassword && !isGoogleAccount && (
                <form onSubmit={handleUpdatePassword} className="py-4 space-y-3 border-b border-white/[0.04]">
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="Aktuelles Passwort" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="Neues Passwort (min. 6 Zeichen)" />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="Passwort bestätigen" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingPassword}
                      className="px-4 py-2 rounded-[8px] bg-[#0a84ff] text-white text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
                      {savingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Speichern
                    </button>
                    <button type="button" onClick={() => { setEditingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                      className="px-4 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-white/[0.5]">Abbrechen</button>
                  </div>
                </form>
              )}

              {/* Delete row */}
              <div className="flex justify-between items-center py-3.5">
                <span className="text-[13px] text-white/[0.35] font-light">Account löschen</span>
                <button onClick={() => setShowDeleteModal(true)} className="text-[12px] text-red-400/70 hover:text-red-400 transition-colors">
                  Permanent löschen
                </button>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <PageFooter />
      </div>

      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} onConfirm={handleDeleteAccount} />
    </div>
  );
}
