import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { useQuota } from '../hooks/useQuota';
import { DashboardLayout } from '../components/DashboardLayout';
import { 
  CreditCard, 
  Check, 
  FileText, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Button } from '@shared/components/Button';
import { Link } from 'react-router-dom';

export function SubscriptionPage() {
  const { user } = useAuth();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const { quota } = useQuota();

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setLoading(false);
      });
    }
  }, [user]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-neutral-400">Lade...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const tierDisplayName = userDoc?.tier === 'free' ? 'Starter' : userDoc?.tier === 'tier1' ? 'Student' : 'Exam Pro';
  const tierColor = userDoc?.tier === 'free' ? 'teal' : userDoc?.tier === 'tier1' ? 'teal' : 'purple';

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 md:mt-10"
        >
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Abo & Plan</h1>
          <p className="text-neutral-400">Verwalte dein Abonnement und Planeinstellungen</p>
        </motion.div>

        {/* Current Plan */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-3 rounded-xl ${
              tierColor === 'purple' 
                ? 'bg-purple-500/10 border border-purple-500/20'
                : 'bg-teal-500/10 border border-teal-500/20'
            }`}>
              <CreditCard className={`w-6 h-6 ${tierColor === 'purple' ? 'text-purple-400' : 'text-teal-400'}`} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{tierDisplayName}</h2>
              <p className="text-neutral-400 text-sm">Aktueller Plan</p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
              <span className="text-neutral-400">Monatlicher Preis</span>
              <span className="text-xl font-bold text-white">
                {userDoc?.tier === 'free' ? '0€' : userDoc?.tier === 'tier1' ? '4,99€' : '14,99€'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
              <span className="text-neutral-400">Nächste Abrechnung</span>
              <span className="text-white font-medium">
                {userDoc?.tier === 'free' ? 'Nie' : 'In 30 Tagen'}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
              <span className="text-neutral-400">Status</span>
              <span className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-bold">
                Aktiv
              </span>
            </div>
          </div>

          {/* Features */}
          <div className="border-t border-white/10 pt-6">
            <h3 className="text-lg font-bold text-white mb-4">Inkludierte Features</h3>
            <div className="space-y-3">
              {userDoc?.tier === 'free' && (
                <>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">Unbegrenzt Flash Mode</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">3x Deep Mode pro Tag</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">Basis-Support</span>
                  </div>
                </>
              )}
              {userDoc?.tier === 'tier1' && (
                <>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">Alles aus Starter</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">30x Deep Mode pro Tag</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">Priorisierte Generierung</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-teal-400" />
                    <span className="text-neutral-300">Werbefrei</span>
                  </div>
                </>
              )}
              {userDoc?.tier === 'tier2' && (
                <>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-400" />
                    <span className="text-neutral-300">Alles aus Student</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-400" />
                    <span className="text-neutral-300">Unbegrenzter Deep Mode</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-400" />
                    <span className="text-neutral-300">Deep Search (25 Quellen)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-purple-400" />
                    <span className="text-neutral-300">24/7 Priority Support</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Usage Overview */}
        {quota && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8"
          >
            <h3 className="text-lg font-bold text-white mb-6">Nutzungsübersicht</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-sm text-neutral-400 mb-1">Deep Mode (Heute)</div>
                <div className="text-2xl font-bold text-white">
                  {quota.deep.used} / {quota.deep.limit === -1 ? '∞' : quota.deep.limit}
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  Reset: {new Date(quota.resetAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="text-sm text-neutral-400 mb-1">Flash Mode (Heute)</div>
                <div className="text-2xl font-bold text-white">
                  {quota.flash.used} / {quota.flash.limit === -1 ? '∞' : quota.flash.limit}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          {userDoc?.tier !== 'tier2' && (
            <Button variant="primary" size="lg" asChild className="flex-1">
              <Link to="/#pricing">Plan upgraden</Link>
            </Button>
          )}
          <Button variant="outline" size="lg" className="flex-1">
            <FileText className="w-5 h-5 mr-2" />
            Rechnung herunterladen
          </Button>
          {userDoc?.tier !== 'free' && (
            <Button variant="ghost" size="lg" className="flex-1 text-red-400 hover:text-red-300">
              Abo kündigen
            </Button>
          )}
        </motion.div>

        {/* Upgrade Info */}
        {userDoc?.tier !== 'tier2' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-6"
          >
            <div className="flex items-start gap-4">
              <Sparkles className="w-6 h-6 text-teal-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {userDoc?.tier === 'free' ? 'Upgrade auf Student' : 'Upgrade auf Exam Pro'}
                </h3>
                <p className="text-neutral-400 text-sm mb-4">
                  {userDoc?.tier === 'free' 
                    ? 'Erhalte 30x Deep Mode pro Tag, priorisierte Generierung und mehr für nur 4,99€/Monat.'
                    : 'Erhalte unbegrenzten Deep Mode, Deep Search mit 25 Quellen und 24/7 Support für 14,99€/Monat.'}
                </p>
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/#pricing">Jetzt upgraden</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Cancellation Warning */}
        {userDoc?.tier !== 'free' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6"
          >
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Abo kündigen</h3>
                <p className="text-neutral-400 text-sm mb-4">
                  Wenn du dein Abo kündigst, behältst du Zugriff bis zum Ende des bezahlten Zeitraums. 
                  Danach wechselst du automatisch auf den Starter-Plan.
                </p>
                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                  Abo kündigen
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}

