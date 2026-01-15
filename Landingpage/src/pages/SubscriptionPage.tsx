import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { useQuota } from '../hooks/useQuota';
import { DashboardLayout } from '../components/DashboardLayout';
import { 
  Check, 
  Sparkles,
  AlertCircle,
  Settings,
  Loader2,
  CheckCircle2,
  X,
  Zap,
  GraduationCap,
  Crown
} from 'lucide-react';
import { Button } from '@shared/components/Button';
import { useSearchParams } from 'react-router-dom';
import { CheckoutButton } from '../components/CheckoutButton';
import { PricingComparisonTable } from '../components/PricingComparisonTable';
import { PricingFAQ } from '../components/PricingFAQ';

export function SubscriptionPage() {
  const { user, getAuthToken } = useAuth();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const { quota } = useQuota();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showCancelMessage, setShowCancelMessage] = useState(false);
  
  // Handle success/cancel from Stripe Checkout
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    const sessionId = searchParams.get('session_id');
    
    if (success && sessionId && user) {
      setShowSuccessMessage(true);
      
      // Verify checkout session and update backend (fallback if webhook hasn't processed)
      const verifyAndUpdate = async () => {
        try {
          const token = await getAuthToken();
          if (!token) {
            throw new Error('Authentication token not available');
          }
          
          const apiUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';
          const response = await fetch(`${apiUrl}/stripe/verify-checkout-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ sessionId }),
          });
          
          if (response.ok) {
            // Backend updated successfully
            console.log('Checkout session verified and backend updated');
          } else {
            console.warn('Failed to verify checkout session, webhook may handle it');
          }
        } catch (error) {
          console.error('Error verifying checkout session:', error);
          // Continue anyway - webhook might handle it
        }
        
        // Reload user document to get updated subscription
        // Wait a bit for backend to process
        setTimeout(() => {
          getUserDocument(user.uid).then((doc) => {
            setUserDoc(doc);
            setLoading(false);
          });
        }, 1500);
      };
      
      verifyAndUpdate();
      
      // Remove success param from URL after showing message
      setTimeout(() => {
        setSearchParams({}, { replace: true });
        setShowSuccessMessage(false);
      }, 5000);
    } else if (success && user) {
      // Success but no session_id - just reload after delay
      setShowSuccessMessage(true);
      setTimeout(() => {
        getUserDocument(user.uid).then((doc) => {
          setUserDoc(doc);
          setLoading(false);
        });
      }, 2000);
      setTimeout(() => {
        setSearchParams({}, { replace: true });
        setShowSuccessMessage(false);
      }, 5000);
    }
    
    if (canceled) {
      setShowCancelMessage(true);
      // Remove canceled param from URL after showing message
      setTimeout(() => {
        setSearchParams({}, { replace: true });
        setShowCancelMessage(false);
      }, 5000);
    }
  }, [searchParams, user, setSearchParams, getAuthToken]);

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setLoading(false);
      });
    }
  }, [user]);

  const handlePortalSession = async () => {
    setPortalLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication token not available');
      
      const apiUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';
      const response = await fetch(`${apiUrl}/stripe/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to create portal session');
      
      const data = await response.json();
      if (data.url) window.location.href = data.url;
    } catch (error: any) {
      console.error('Portal error:', error);
      alert('Fehler beim Öffnen des Abo-Managements.');
    } finally {
      setPortalLoading(false);
    }
  };

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

  const currentTier = userDoc?.tier || 'free';

  const plans = [
    {
      id: 'free',
      name: 'Starter',
      price: '0€',
      period: 'für immer',
      description: 'Perfekt für den Einstieg in KI-gestütztes Lernen.',
      icon: Zap,
      color: 'neutral',
      features: [
        'Unbegrenzt Flash Mode',
        '3x Deep Mode pro Tag',
        'Basis-Support',
        'Standard Generierung'
      ],
      buttonText: 'Aktueller Plan',
      highlight: false
    },
    {
      id: 'tier1',
      name: 'Student',
      price: '4,99€',
      period: 'pro Monat',
      description: 'Für ambitionierte Studenten, die mehr brauchen.',
      icon: GraduationCap,
      color: 'teal',
      features: [
        'Alles aus Starter',
        '30x Deep Mode pro Tag',
        'Priorisierte Generierung',
        'Werbefrei'
      ],
      buttonText: 'Upgrade auf Student',
      highlight: false
    },
    {
      id: 'tier2',
      name: 'Exam Pro',
      price: '14,99€',
      period: 'pro Monat',
      description: 'Maximale Power für deine Prüfungsphase.',
      icon: Crown,
      color: 'purple',
      features: [
        'Alles aus Student',
        'Unbegrenzter Deep Mode',
        'Deep Search (25 Quellen)',
        '24/7 Priority Support'
      ],
      buttonText: 'Upgrade auf Pro',
      highlight: true
    }
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-16">
        
        {/* Messages */}
        <div className="fixed top-24 right-6 z-50 w-full max-w-sm space-y-4 pointer-events-none">
          <AnimatePresence>
            {showSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-[#0A0A0A] border border-green-500/30 rounded-xl p-4 shadow-2xl pointer-events-auto flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-white text-sm">Zahlung erfolgreich!</h3>
                  <p className="text-neutral-400 text-xs mt-1">Dein Abo ist jetzt aktiv.</p>
                </div>
                <button onClick={() => setShowSuccessMessage(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
            {showCancelMessage && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-[#0A0A0A] border border-yellow-500/30 rounded-xl p-4 shadow-2xl pointer-events-auto flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-white text-sm">Zahlung abgebrochen</h3>
                  <p className="text-neutral-400 text-xs mt-1">Keine Sorge, es wurde nichts abgebucht.</p>
                </div>
                <button onClick={() => setShowCancelMessage(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mt-8">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold mb-4 tracking-tight"
          >
            Wähle den Plan, der zu <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-purple-500">deinem Studium passt</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-neutral-400 text-lg"
          >
            Upgrade jederzeit für mehr Leistung. Kündige monatlich.
          </motion.p>
          
          {/* Active Subscription Status Banner */}
          {userDoc?.tier !== 'free' && (
             <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.2 }}
               className="mt-8 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"
             >
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
               <span className="text-sm text-neutral-300">
                 Du nutzt aktuell den <span className="text-white font-bold">{plans.find(p => p.id === currentTier)?.name}</span> Plan
               </span>
               <button 
                onClick={handlePortalSession}
                disabled={portalLoading}
                className="ml-2 text-xs font-medium text-teal-400 hover:text-teal-300 underline disabled:opacity-50"
               >
                 {portalLoading ? 'Lädt...' : 'Verwalten'}
               </button>
             </motion.div>
          )}
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const isActive = currentTier === plan.id;
            const isHighlight = plan.highlight;
            const Icon = plan.icon;
            
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + (index * 0.1) }}
                className={`relative flex flex-col p-8 rounded-3xl border transition-all duration-300 ${
                  isHighlight 
                    ? 'bg-gradient-to-b from-[#1a1a1a] to-[#0A0A0A] border-purple-500/30 shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)]' 
                    : 'bg-[#0A0A0A] border-white/10 hover:border-white/20'
                }`}
              >
                {isHighlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    AM BELIEBTESTEN
                  </div>
                )}

                <div className="mb-8">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${
                    plan.color === 'purple' ? 'bg-purple-500/10 text-purple-400' :
                    plan.color === 'teal' ? 'bg-teal-500/10 text-teal-400' :
                    'bg-white/5 text-white'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-neutral-500 text-sm">{plan.period}</span>
                  </div>
                  <p className="text-neutral-400 text-sm leading-relaxed">{plan.description}</p>
                </div>

                <div className="space-y-4 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 ${
                        plan.color === 'purple' ? 'text-purple-400' : 
                        plan.color === 'teal' ? 'text-teal-400' : 
                        'text-white'
                      }`} />
                      <span className="text-neutral-300 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {isActive ? (
                  <Button 
                    className="w-full bg-white/5 text-neutral-400 border-white/10 hover:bg-white/5 cursor-default"
                    variant="outline"
                  >
                    Aktueller Plan
                  </Button>
                ) : (
                  <>
                    {plan.id === 'free' ? (
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={handlePortalSession}
                      >
                        Downgrade
                      </Button>
                    ) : (
                      <CheckoutButton 
                        tier={plan.id as 'tier1' | 'tier2'} 
                        className="w-full"
                        variant={isHighlight ? 'primary' : 'outline'}
                      >
                        {plan.buttonText}
                      </CheckoutButton>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Usage Stats (Compact) */}
        {quota && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-teal-500/10 rounded-xl">
                <Sparkles className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Deine Nutzung heute</h3>
                <p className="text-neutral-400 text-sm">Reset um {new Date(quota.resetAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
              </div>
            </div>
            <div className="flex gap-8">
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{quota.deep.used} / {quota.deep.limit === -1 ? '∞' : quota.deep.limit}</div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Deep Mode</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{quota.flash.used} / {quota.flash.limit === -1 ? '∞' : quota.flash.limit}</div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-medium">Flash Mode</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Comparison Table */}
        <PricingComparisonTable />

        {/* FAQ */}
        <PricingFAQ />
        
        {/* Support Link */}
        <div className="text-center pb-20">
          <p className="text-neutral-400">
            Noch Fragen? <a href="mailto:support@ankiplus.de" className="text-teal-400 hover:text-teal-300 underline">Schreib uns</a>
          </p>
        </div>

      </div>
    </DashboardLayout>
  );
}