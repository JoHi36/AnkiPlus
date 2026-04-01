import { motion } from 'framer-motion';
import { AlertCircle, Info, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@shared/components/Button';

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('de-DE');
};

interface LimitExplanationProps {
  tier: 'free' | 'tier1' | 'tier2';
  currentUsage?: number;
  dailyLimit?: number;
}

export function LimitExplanation({ tier, currentUsage, dailyLimit }: LimitExplanationProps) {
  if (tier === 'tier2') {
    return null;
  }

  const usagePercent = dailyLimit && currentUsage !== undefined
    ? (currentUsage / dailyLimit) * 100
    : 0;
  const isNearLimit = usagePercent >= 80;
  const isAtLimit = dailyLimit && currentUsage !== undefined && currentUsage >= dailyLimit;

  const getLimitInfo = () => {
    if (tier === 'free') {
      return {
        dailyLimit: 20_000,
        message: `${formatTokens(20_000)} Tokens pro Tag verfügbar.`,
        upgradeMessage: 'Upgrade auf Pro für 70K Tokens pro Tag',
        upgradeTier: 'tier1' as const,
      };
    }
    return {
      dailyLimit: 70_000,
      message: `${formatTokens(70_000)} Tokens pro Tag verfügbar.`,
      upgradeMessage: 'Upgrade auf Max für 210K Tokens pro Tag',
      upgradeTier: 'tier2' as const,
    };
  };

  const info = getLimitInfo();
  const displayLimit = dailyLimit || info.dailyLimit;

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
              ? `Tageslimit erreicht: ${formatTokens(currentUsage!)} / ${formatTokens(displayLimit)} Tokens verbraucht`
              : isNearLimit
              ? `Warnung: ${formatTokens(currentUsage!)} / ${formatTokens(displayLimit)} Tokens verbraucht (${Math.round(usagePercent)}%)`
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
             <strong className="text-purple-200">210K Tokens / Tag:</strong> Maximale Power für intensive Lernphasen.
           </p>
         </div>
      </div>
    );
  }

  const dailyLimit = tier === 'free' ? '20K' : '70K';
  const weeklyLimit = tier === 'free' ? '100K' : '350K';
  const upgradeTier = tier === 'free' ? 'Pro' : 'Max';
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
            {dailyLimit} Tokens pro Tag, {weeklyLimit} pro Woche. <br/>
            <span className="opacity-60">Upgrade auf {upgradeTier} für mehr.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
