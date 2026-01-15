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
  AlertCircle,
  Settings,
  Loader2
} from 'lucide-react';
import { Button } from '@shared/components/Button';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckoutButton } from '../components/CheckoutButton';
import { useEffect, useState } from 'react';

export function SubscriptionPage() {
  const { user, getIdToken } = useAuth();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const { quota } = useQuota();
  const [searchParams] = useSearchParams();
  
  // Handle success/cancel from Stripe Checkout
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    
    if (success) {
      // Reload user document to get updated subscription
      if (user) {
        getUserDocument(user.uid).then((doc) => {
          setUserDoc(doc);
        });
      }
    }
    
    if (canceled) {
      // User canceled checkout - could show a message
      console.log('Checkout canceled');
    }
  }, [searchParams, user]);

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
          {userDoc?.tier === 'free' && (
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <CheckoutButton tier="tier1" className="flex-1" />
              <CheckoutButton tier="tier2" className="flex-1" variant="secondary" />
            </div>
          )}
          {userDoc?.tier === 'tier1' && (
            <CheckoutButton tier="tier2" className="flex-1" />
          )}
          {userDoc?.tier !== 'free' && userDoc?.stripeCustomerId && (
            <Button 
              variant="outline" 
              size="lg" 
              className="flex-1"
              onClick={async () => {
                setPortalLoading(true);
                try {
                  const token = await getIdToken();
                  if (!token) {
                    throw new Error('Authentication token not available');
                  }
                  
                  const apiUrl = import.meta.env.VITE_API_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';
                  const response = await fetch(`${apiUrl}/api/stripe/create-portal-session`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`,
                    },
                  });
                  
                  if (!response.ok) {
                    throw new Error('Failed to create portal session');
                  }
                  
                  const data = await response.json();
                  if (data.url) {
                    window.location.href = data.url;
                  }
                } catch (error: any) {
                  console.error('Portal error:', error);
                  alert('Fehler beim Öffnen des Abo-Managements. Bitte versuche es erneut.');
                } finally {
                  setPortalLoading(false);
                }
              }}
              disabled={portalLoading}
            >
              {portalLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Lädt...
                </>
              ) : (
                <>
                  <Settings className="w-5 h-5 mr-2" />
                  Abo verwalten
                </>
              )}
            </Button>
          )}
          {userDoc?.tier === 'free' && (
            <Button variant="outline" size="lg" asChild className="flex-1">
              <Link to="/#pricing">Alle Pläne ansehen</Link>
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
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">
                  {userDoc?.tier === 'free' ? 'Upgrade auf Student' : 'Upgrade auf Exam Pro'}
                </h3>
                <p className="text-neutral-400 text-sm mb-4">
                  {userDoc?.tier === 'free' 
                    ? 'Erhalte 30x Deep Mode pro Tag, priorisierte Generierung und mehr für nur 5€/Monat.'
                    : 'Erhalte unbegrenzten Deep Mode, Deep Search mit 25 Quellen und 24/7 Support für 15€/Monat.'}
                </p>
                {userDoc?.tier === 'free' ? (
                  <div className="flex gap-3">
                    <CheckoutButton tier="tier1" size="sm" variant="secondary" />
                    <CheckoutButton tier="tier2" size="sm" variant="outline" />
                  </div>
                ) : (
                  <CheckoutButton tier="tier2" size="sm" variant="secondary" />
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Subscription Status Info */}
        {userDoc?.tier !== 'free' && userDoc?.subscriptionStatus && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6"
          >
            <div className="flex items-start gap-4">
              <CreditCard className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-2">Abo-Status</h3>
                <p className="text-neutral-400 text-sm mb-2">
                  Status: <span className="text-white font-medium capitalize">{userDoc.subscriptionStatus}</span>
                </p>
                {userDoc.subscriptionCurrentPeriodEnd && (
                  <p className="text-neutral-400 text-sm mb-4">
                    Nächste Abrechnung: {new Date(userDoc.subscriptionCurrentPeriodEnd.toDate()).toLocaleDateString('de-DE', { 
                      day: 'numeric', 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </p>
                )}
                {userDoc.subscriptionCancelAtPeriodEnd && (
                  <p className="text-yellow-400 text-sm mb-4">
                    ⚠️ Dein Abo wird am Ende der aktuellen Periode gekündigt.
                  </p>
                )}
                <p className="text-neutral-400 text-xs">
                  Verwende "Abo verwalten" um dein Abonnement zu ändern, zu kündigen oder Rechnungen herunterzuladen.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}

