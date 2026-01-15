import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@shared/components/Button';
import { useState, useEffect } from 'react';

interface UpgradePromptProps {
  tier: 'free' | 'tier1' | 'tier2';
  currentUsage?: number;
  limit?: number;
  daysAtLimit?: number; // Number of consecutive days at limit
}

const STORAGE_KEY = 'anki_upgrade_prompt_dismissed';

export function UpgradePrompt({ tier, currentUsage, limit, daysAtLimit = 0 }: UpgradePromptProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user dismissed this prompt
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Don't show for Exam Pro
  if (tier === 'tier2') {
    return null;
  }

  // Calculate if we should show the prompt
  const usagePercent = limit && currentUsage !== undefined 
    ? (currentUsage / limit) * 100 
    : 0;
  
  const shouldShow = !isDismissed && (
    (limit && currentUsage !== undefined && usagePercent >= 80) || // Near limit
    daysAtLimit >= 3 // 3+ days at limit
  );

  if (!shouldShow) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  const getMessage = () => {
    if (daysAtLimit >= 3) {
      return {
        title: tier === 'free' 
          ? 'Mehr Deep Mode nutzen?' 
          : 'Unbegrenzter Deep Mode?',
        description: tier === 'free'
          ? 'Du hast diese Woche mehrfach dein Limit erreicht. Upgrade auf Student für 30x Deep Mode pro Tag.'
          : 'Du hast diese Woche mehrfach dein Limit erreicht. Upgrade auf Exam Pro für unbegrenzten Deep Mode.',
        cta: tier === 'free' ? 'Zu Student upgraden' : 'Zu Exam Pro upgraden',
        link: '/#pricing',
      };
    }
    
    if (usagePercent >= 80) {
      return {
        title: tier === 'free'
          ? 'Fast am Limit?'
          : 'Mehr Deep Mode?',
        description: tier === 'free'
          ? `Du hast ${currentUsage}/${limit} Deep Mode verwendet. Upgrade auf Student für 30x pro Tag.`
          : `Du hast ${currentUsage}/${limit} Deep Mode verwendet. Upgrade auf Exam Pro für unbegrenzte Nutzung.`,
        cta: tier === 'free' ? 'Jetzt upgraden' : 'Zu Exam Pro',
        link: '/#pricing',
      };
    }

    return null;
  };

  const message = getMessage();
  if (!message) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-gradient-to-r from-teal-500/10 to-purple-500/10 border border-teal-500/30 rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 blur-[60px] pointer-events-none" />
        
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="p-3 rounded-xl bg-teal-500/20 border border-teal-500/30 flex-shrink-0">
              <Sparkles className="w-6 h-6 text-teal-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white mb-2">{message.title}</h3>
              <p className="text-sm text-neutral-400 mb-4">{message.description}</p>
              <Button variant="primary" size="sm" asChild>
                <Link to={message.link}>
                  {message.cta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Schließen"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

