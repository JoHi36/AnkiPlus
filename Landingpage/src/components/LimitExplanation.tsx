import { motion } from 'framer-motion';
import { AlertCircle, Info, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@shared/components/Button';

interface LimitExplanationProps {
  tier: 'free' | 'tier1' | 'tier2';
  currentUsage?: number;
  limit?: number;
}

export function LimitExplanation({ tier, currentUsage, limit }: LimitExplanationProps) {
  if (tier === 'tier2') {
    return null; // No limits for Exam Pro
  }

  const usagePercent = limit && currentUsage !== undefined 
    ? (currentUsage / limit) * 100 
    : 0;
  const isNearLimit = usagePercent >= 80;
  const isAtLimit = limit && currentUsage !== undefined && currentUsage >= limit;

  const getLimitInfo = () => {
    if (tier === 'free') {
      return {
        limit: 3,
        message: 'Nach 3x Deep Mode pro Tag kannst du weiterhin Flash Mode nutzen.',
        upgradeMessage: 'Upgrade auf Student für 30x Deep Mode pro Tag',
        upgradeTier: 'tier1' as const,
      };
    }
    return {
      limit: 30,
      message: 'Nach 30x Deep Mode pro Tag kannst du weiterhin Flash Mode nutzen.',
      upgradeMessage: 'Upgrade auf Exam Pro für unbegrenzten Deep Mode',
      upgradeTier: 'tier2' as const,
    };
  };

  const info = getLimitInfo();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-4 p-4 rounded-lg border ${
        isAtLimit
          ? 'bg-red-500/10 border-red-500/20'
          : isNearLimit
          ? 'bg-yellow-500/10 border-yellow-500/20'
          : 'bg-teal-500/10 border-teal-500/20'
      }`}
    >
      <div className="flex items-start gap-3">
        {isAtLimit ? (
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        ) : (
          <Info className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <p className={`text-xs mb-2 ${
            isAtLimit ? 'text-red-400' : isNearLimit ? 'text-yellow-400' : 'text-teal-400'
          }`}>
            {isAtLimit 
              ? `Limit erreicht: ${info.limit}x Deep Mode heute verwendet`
              : isNearLimit
              ? `Warnung: ${currentUsage}/${info.limit} Deep Mode verwendet (${Math.round(usagePercent)}%)`
              : info.message
            }
          </p>
          {isAtLimit && (
            <div className="mt-3">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/register">Jetzt upgraden</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Standalone Info Component for Pricing Cards
export function LimitInfoBox({ tier }: { tier: 'free' | 'tier1' | 'tier2' }) {
  if (tier === 'tier2') {
    return (
      <div className="mt-auto pt-6 border-t border-purple-500/20">
         <div className="flex items-start gap-3">
           <div className="p-1 rounded bg-purple-500/10 text-purple-400 shrink-0 mt-0.5">
             <Sparkles size={12} />
           </div>
           <p className="text-xs text-purple-200/80 leading-relaxed">
             <strong className="text-purple-200">Unlimited Power:</strong> Keine Limits, keine Wartezeiten. Du lernst so schnell du kannst.
           </p>
         </div>
      </div>
    );
  }

  const limit = tier === 'free' ? 3 : 30;
  const upgradeTier = tier === 'free' ? 'Student' : 'Exam Pro';
  const colorClass = tier === 'free' ? 'text-neutral-400' : 'text-teal-400/80';
  const borderClass = tier === 'free' ? 'border-white/10' : 'border-teal-500/20';
  const bgIconClass = tier === 'free' ? 'bg-white/5 text-neutral-400' : 'bg-teal-500/10 text-teal-400';

  return (
    <div className={`mt-auto pt-6 border-t ${borderClass}`}>
      <div className="flex items-start gap-3">
        <div className={`p-1 rounded shrink-0 mt-0.5 ${bgIconClass}`}>
          <Info size={12} />
        </div>
        <div className="flex-1">
          <p className={`text-xs ${colorClass} leading-relaxed`}>
            {limit}x Deep Mode pro Tag. <br/>
            <span className="opacity-60">Danach unbegrenzt Flash Mode.</span>
          </p>
        </div>
      </div>
    </div>
  );
}