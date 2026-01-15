import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Mail, 
  Lock, 
  Star, 
  Trash2, 
  Bell, 
  Globe, 
  Shield,
  Settings as SettingsIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { TestimonialEditor } from '../components/TestimonialEditor';
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { auth } from '../lib/firebase';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } 
  }
};

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'account' | 'community' | 'app'>('account');
  
  // Account Settings
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setNewEmail(user.email || '');
        setLoading(false);
      });
    }
  }, [user]);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth) return;

    if (newEmail === user.email) {
      setMessage({ type: 'error', text: 'Das ist bereits deine aktuelle E-Mail' });
      return;
    }

    setSavingEmail(true);
    setMessage(null);

    try {
      await updateEmail(user, newEmail);
      setMessage({ type: 'success', text: 'E-Mail erfolgreich aktualisiert' });
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        setMessage({ type: 'error', text: 'Bitte melde dich erneut an, um deine E-Mail zu ändern' });
      } else {
        setMessage({ type: 'error', text: error.message || 'Fehler beim Aktualisieren der E-Mail' });
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth) return;

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwörter stimmen nicht überein' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Passwort muss mindestens 6 Zeichen lang sein' });
      return;
    }

    setSavingPassword(true);
    setMessage(null);

    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
      await updatePassword(user, newPassword);
      setMessage({ type: 'success', text: 'Passwort erfolgreich aktualisiert' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        setMessage({ type: 'error', text: 'Aktuelles Passwort ist falsch' });
      } else {
        setMessage({ type: 'error', text: error.message || 'Fehler beim Aktualisieren des Passworts' });
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth) return;
    
    const confirmed = confirm(
      'Bist du sicher? Diese Aktion kann nicht rückgängig gemacht werden. Dein Account und alle Daten werden permanent gelöscht.'
    );
    
    if (!confirmed) return;

    try {
      await deleteUser(user);
      await logout();
      navigate('/');
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        setMessage({ type: 'error', text: 'Bitte melde dich erneut an, um deinen Account zu löschen' });
      } else {
        setMessage({ type: 'error', text: error.message || 'Fehler beim Löschen des Accounts' });
      }
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <SettingsIcon size={24} />
            </div>
            <h1 className="text-3xl font-bold text-white">Einstellungen</h1>
          </div>
          <p className="text-neutral-400">Verwalte dein Profil, Community-Beiträge und App-Einstellungen</p>
        </motion.div>

        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1">{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-current/60 hover:text-current"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}

        {/* Section Tabs */}
        <div className="flex gap-2 mb-8 border-b border-white/10">
          {[
            { id: 'account' as const, label: 'Account & Profil', icon: User },
            { id: 'community' as const, label: 'Community', icon: Star },
            { id: 'app' as const, label: 'App-Einstellungen', icon: SettingsIcon },
          ].map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-4 py-3 rounded-t-xl font-medium transition-all flex items-center gap-2 ${
                  activeSection === section.id
                    ? 'bg-purple-500/10 text-purple-400 border-b-2 border-purple-500'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {section.label}
              </button>
            );
          })}
        </div>

        {/* Account & Profil Section */}
        {activeSection === 'account' && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* Email Update */}
            <div className="rounded-2xl p-6 border border-white/10 bg-[#0A0A0A]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">E-Mail-Adresse</h3>
                  <p className="text-xs text-neutral-400">Aktuelle E-Mail: {user?.email}</p>
                </div>
              </div>
              <form onSubmit={handleUpdateEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-300">
                    Neue E-Mail-Adresse
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 transition-colors"
                    placeholder="neue@email.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingEmail || newEmail === user?.email}
                  className="px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingEmail ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Wird gespeichert...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      E-Mail aktualisieren
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Password Update */}
            <div className="rounded-2xl p-6 border border-white/10 bg-[#0A0A0A]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Passwort ändern</h3>
                  <p className="text-xs text-neutral-400">Wähle ein sicheres Passwort</p>
                </div>
              </div>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-300">
                    Aktuelles Passwort
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-300">
                    Neues Passwort
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                    placeholder="Mindestens 6 Zeichen"
                    minLength={6}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-300">
                    Passwort bestätigen
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                    placeholder="Passwort wiederholen"
                    minLength={6}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingPassword ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Wird gespeichert...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Passwort aktualisieren
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Delete Account */}
            <div className="rounded-2xl p-6 border border-red-500/20 bg-red-900/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Account löschen</h3>
                  <p className="text-xs text-neutral-400">Diese Aktion kann nicht rückgängig gemacht werden</p>
                </div>
              </div>
              <button
                onClick={handleDeleteAccount}
                className="px-6 py-3 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-medium transition-all flex items-center gap-2"
              >
                <Trash2 size={16} />
                Account permanent löschen
              </button>
            </div>
          </motion.div>
        )}

        {/* Community Section */}
        {activeSection === 'community' && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <TestimonialEditor onSaved={() => setMessage({ type: 'success', text: 'Testimonial aktualisiert' })} />
          </motion.div>
        )}

        {/* App Settings Section */}
        {activeSection === 'app' && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <div className="rounded-2xl p-6 border border-white/10 bg-[#0A0A0A]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Bell size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Benachrichtigungen</h3>
                  <p className="text-xs text-neutral-400">Coming soon</p>
                </div>
              </div>
              <p className="text-sm text-neutral-400">Benachrichtigungseinstellungen werden in einer zukünftigen Version verfügbar sein.</p>
            </div>

            <div className="rounded-2xl p-6 border border-white/10 bg-[#0A0A0A]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Sprache</h3>
                  <p className="text-xs text-neutral-400">Coming soon</p>
                </div>
              </div>
              <p className="text-sm text-neutral-400">Spracheinstellungen werden in einer zukünftigen Version verfügbar sein.</p>
            </div>

            <div className="rounded-2xl p-6 border border-white/10 bg-[#0A0A0A]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Shield size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Datenschutz</h3>
                  <p className="text-xs text-neutral-400">Coming soon</p>
                </div>
              </div>
              <p className="text-sm text-neutral-400">Datenschutzeinstellungen werden in einer zukünftigen Version verfügbar sein.</p>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}

