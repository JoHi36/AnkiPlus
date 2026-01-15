import { motion } from 'framer-motion';
import { Sparkles, Calendar, Zap, GraduationCap, Crown, CreditCard, AlertTriangle } from 'lucide-react';
import { UserDocument } from '../utils/userSetup';
import { QuotaResponse } from '../hooks/useQuota';

interface AccountOverviewProps {
  userDoc: UserDocument | null;
  quota: QuotaResponse | null;
  onPortal: () => void;
  portalLoading: boolean;
}

export function AccountOverview({ userDoc, quota, onPortal, portalLoading }: AccountOverviewProps) {
  const currentTier = userDoc?.tier || 'free';
  
  const getTierInfo = (tier: string) => {
    switch (tier) {
      case 'tier2':
        return { 
          name: 'Exam Pro', 
          icon: Crown, 
          color: 'text-purple-400', 
          bg: 'bg-purple-500/10', 
          border: 'border-purple-500/20',
          gradient: 'from-purple-500/20 to-blue-500/20'
        };
      case 'tier1':
        return { 
          name: 'Student', 
          icon: GraduationCap, 
          color: 'text-teal-400', 
          bg: 'bg-teal-500/10', 
          border: 'border-teal-500/20',
          gradient: 'from-teal-500/20 to-emerald-500/20'
        };
      default:
        return { 
          name: 'Starter', 
          icon: Zap, 
          color: 'text-neutral-400', 
          bg: 'bg-neutral-800/50', 
          border: 'border-white/10',
          gradient: 'from-neutral-800 to-neutral-900'
        };
    }
  };

  const tierInfo = getTierInfo(currentTier);
  const TierIcon = tierInfo.icon;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unbekannt';
    // Firestore timestamp handling
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-5xl mx-auto mb-16"
    >
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left Column: Plan Status */}
        <div className={`flex-1 rounded-3xl p-8 border ${tierInfo.border} bg-gradient-to-br ${tierInfo.gradient} relative overflow-hidden`}>
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <TierIcon size={120} strokeWidth={1} />
          </div>
          
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 ${tierInfo.color}`}>
                  <TierIcon size={24} />
                </div>
                <div className="flex flex-col">
                    <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide">Aktueller Plan</h2>
                    <h3 className="text-3xl font-bold text-white">{tierInfo.name}</h3>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${userDoc?.subscriptionStatus === 'active' || currentTier === 'free' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                  <span className="text-white/80">
                    Status: <span className="font-medium text-white capitalize">{userDoc?.subscriptionStatus || 'Aktiv'}</span>
                  </span>
                </div>
                
                {userDoc?.subscriptionCurrentPeriodEnd && (
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <Calendar size={16} className="text-white/60" />
                    <span>
                        {userDoc.subscriptionCancelAtPeriodEnd ? 'Endet am: ' : 'Erneuert sich am: '} 
                        <span className="font-medium text-white">{formatDate(userDoc.subscriptionCurrentPeriodEnd)}</span>
                    </span>
                  </div>
                )}
                
                {userDoc?.subscriptionCancelAtPeriodEnd && (
                   <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs">
                     <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                     <span>Dein Abo läuft aus. Reaktiviere es, um deine Vorteile zu behalten.</span>
                   </div>
                )}
              </div>
            </div>

            {currentTier !== 'free' && (
              <button 
                onClick={onPortal}
                disabled={portalLoading}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-all text-sm font-medium"
              >
                {portalLoading ? 'Lädt...' : (
                    <>
                        <CreditCard size={16} />
                        Abo & Zahlungen verwalten
                    </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Usage Stats */}
        <div className="flex-1 rounded-3xl p-8 border border-white/10 bg-[#0A0A0A] flex flex-col justify-center">
            <div className="mb-6 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                    <Sparkles size={20} />
                </div>
                <h3 className="text-xl font-bold text-white">Deine Nutzung</h3>
            </div>
            
            {quota ? (
                <div className="space-y-8">
                    {/* Deep Mode Bar */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <div className="text-sm font-medium text-white mb-0.5">Deep Mode</div>
                                <div className="text-xs text-neutral-400">Intelligente Recherche</div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-white leading-none">
                                    {quota.deep.used} <span className="text-lg text-neutral-500 font-normal">/ {quota.deep.limit === -1 ? '∞' : quota.deep.limit}</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-3 w-full bg-neutral-800 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${quota.deep.limit === -1 ? 0 : Math.min(100, (quota.deep.used / quota.deep.limit) * 100)}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className={`h-full rounded-full ${
                                    currentTier === 'tier2' ? 'bg-gradient-to-r from-purple-500 to-blue-500' : 'bg-teal-500'
                                }`}
                            />
                        </div>
                         {quota.deep.limit !== -1 && (
                            <div className="mt-2 text-xs text-neutral-500 text-right">
                                {Math.max(0, quota.deep.limit - quota.deep.used)} verbleibend heute
                            </div>
                         )}
                    </div>

                    {/* Flash Mode Bar */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <div className="text-sm font-medium text-white mb-0.5">Flash Mode</div>
                                <div className="text-xs text-neutral-400">Schnelle Antworten</div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-white leading-none">
                                    {quota.flash.used} <span className="text-lg text-neutral-500 font-normal">/ {quota.flash.limit === -1 ? '∞' : quota.flash.limit}</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-3 w-full bg-neutral-800 rounded-full overflow-hidden">
                             <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${quota.flash.limit === -1 ? 0 : Math.min(100, (quota.flash.used / quota.flash.limit) * 100)}%` }}
                                transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                                className="h-full rounded-full bg-neutral-500"
                            />
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 text-xs text-neutral-500 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                        Limits werden täglich um 00:00 UTC zurückgesetzt.
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-40 text-neutral-500">
                    <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mb-2" />
                    <span>Lade Nutzungsdaten...</span>
                </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}
