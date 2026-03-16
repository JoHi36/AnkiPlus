import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { useQuota } from '../hooks/useQuota';
import { DashboardLayout } from '../components/DashboardLayout';
import { 
  CheckCircle2, 
  AlertCircle,
  X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PricingGrid } from '../components/PricingGrid';
import { PricingFAQ } from '../components/PricingFAQ';
import { PricingComparisonTable } from '../components/PricingComparisonTable';
import { AccountOverview } from '../components/AccountOverview';

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
    
    if (success) {
      setShowSuccessMessage(true);
      if (user) {
        setTimeout(() => {
          getUserDocument(user.uid).then((doc) => {
            setUserDoc(doc);
            setLoading(false);
          });
        }, 2000);
      }
      setTimeout(() => {
        setSearchParams({}, { replace: true });
        setShowSuccessMessage(false);
      }, 5000);
    }
    
    if (canceled) {
      setShowCancelMessage(true);
      setTimeout(() => {
        setSearchParams({}, { replace: true });
        setShowCancelMessage(false);
      }, 5000);
    }
  }, [searchParams, user, setSearchParams]);

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setLoading(false);
      });
    } else {
      setLoading(false);
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
  const isLoggedIn = !!user;

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

        {/* LOGGED IN VIEW: Account Dashboard */}
        {isLoggedIn ? (
          <>
             <AccountOverview 
                userDoc={userDoc}
                quota={quota}
                onPortal={handlePortalSession}
                portalLoading={portalLoading}
             />
             
             {/* Upgrade Section Header */}
             <div className="text-center max-w-3xl mx-auto mt-12 mb-8 border-t border-white/5 pt-12">
               <h2 className="text-3xl font-bold mb-4 tracking-tight">Verfügbare Upgrades</h2>
               <p className="text-neutral-400">
                 Hole mehr aus ANKI+ heraus. Upgrades werden sofort aktiv.
               </p>
             </div>
          </>
        ) : (
          /* PUBLIC VIEW: Marketing Header */
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
          </div>
        )}

        {/* Pricing Grid (Shared Component) */}
        <PricingGrid 
          currentTier={currentTier as any} 
          onPortal={handlePortalSession}
          isLoggedIn={isLoggedIn}
        />

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
