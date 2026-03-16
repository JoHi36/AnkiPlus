import { Check, Zap, GraduationCap, Crown, Sparkles, Vote, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@shared/components/Button';
import { CheckoutButton } from './CheckoutButton';

interface PricingGridProps {
  currentTier?: 'free' | 'tier1' | 'tier2';
  onPortal?: () => void;
  isLoggedIn?: boolean;
}

export function PricingGrid({ currentTier = 'free', onPortal, isLoggedIn = false }: PricingGridProps) {
  const getCardStyles = (cardTier: 'free' | 'tier1' | 'tier2') => {
    const base = 'relative rounded-2xl p-8 flex flex-col h-full transition-all duration-200';

    if (currentTier === 'free' && cardTier === 'tier1') {
      return `${base} bg-white/[0.04] border border-[#0a84ff]/20 md:-mt-3 md:mb-3 z-10`;
    }
    if (currentTier === 'tier1' && cardTier === 'tier2') {
      return `${base} bg-white/[0.04] border border-purple-500/20 md:-mt-3 md:mb-3 z-10`;
    }
    return `${base} bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.10]`;
  };

  const getButtonConfig = (cardTier: 'free' | 'tier1' | 'tier2') => {
    if (!isLoggedIn) {
      return { type: 'link' as const, text: cardTier === 'free' ? 'Kostenlos starten' : cardTier === 'tier1' ? 'Jetzt durchstarten' : 'Pro werden' };
    }
    if (currentTier === 'free') {
      if (cardTier === 'free') return { type: 'current' as const, text: 'Aktuelles Abo' };
      return { type: 'upgrade' as const, tier: cardTier };
    } else if (currentTier === 'tier1') {
      if (cardTier === 'free') return { type: 'downgrade' as const, text: 'Downgraden' };
      if (cardTier === 'tier1') return { type: 'current' as const, text: 'Aktuelles Abo' };
      return { type: 'upgrade' as const, tier: cardTier };
    } else {
      if (cardTier === 'tier2') return { type: 'current' as const, text: 'Aktueller Plan' };
      return { type: 'downgrade' as const, text: 'Downgraden' };
    }
  };

  const renderButton = (cardTier: 'free' | 'tier1' | 'tier2') => {
    const config = getButtonConfig(cardTier);

    if (config.type === 'link') {
      const isPrimary = (currentTier === 'free' && cardTier === 'tier1') || (currentTier === 'tier1' && cardTier === 'tier2');
      return (
        <Button
          variant={isPrimary ? 'primary' : 'outline'}
          size="md"
          fullWidth
          asChild
        >
          <Link to="/register">{config.text}</Link>
        </Button>
      );
    }
    if (config.type === 'current') {
      return (
        <Button
          className="w-full cursor-default opacity-40"
          variant="outline"
          size="md"
        >
          {config.text}
        </Button>
      );
    }
    if (config.type === 'upgrade') {
      return (
        <CheckoutButton tier={config.tier!} className="w-full" variant="primary">
          Upgrade auf {config.tier === 'tier1' ? 'Student' : 'Pro'}
        </CheckoutButton>
      );
    }
    if (config.type === 'downgrade') {
      return (
        <Button className="w-full" variant="outline" size="md" onClick={onPortal}>
          {config.text}
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start max-w-5xl mx-auto">

      {/* Starter (Free) */}
      <div className={getCardStyles('free')}>
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs font-medium text-white/[0.35] mb-5">
            <Zap size={13} />
            Starter
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-4xl font-bold text-white tracking-tight">0€</span>
            <span className="text-white/[0.22] text-base">/Monat</span>
          </div>
          <p className="text-white/[0.35] text-sm leading-relaxed">
            Der perfekte Einstieg in KI-gestütztes Lernen.
          </p>
        </div>

        <div className="h-px w-full bg-white/[0.06] mb-6" />

        <ul className="space-y-3 mb-8 text-sm text-white/[0.55] flex-1">
          <li className="flex items-start gap-3">
            <Check size={14} className="text-white/[0.22] mt-0.5 flex-shrink-0" />
            <span>Unbegrenzt Flash Mode</span>
          </li>
          <li className="flex items-start gap-3">
            <Check size={14} className="text-white/[0.22] mt-0.5 flex-shrink-0" />
            <span><strong className="text-white/80">3x</strong> Deep Mode / Tag</span>
          </li>
          <li className="flex items-start gap-3">
            <Check size={14} className="text-white/[0.22] mt-0.5 flex-shrink-0" />
            <span>Basis Support</span>
          </li>
        </ul>

        <div className="mt-auto">{renderButton('free')}</div>
      </div>

      {/* Student */}
      <div className={getCardStyles('tier1')}>
        {currentTier === 'free' && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#0a84ff] text-white text-[10px] font-semibold rounded-md uppercase tracking-wider">
            Beliebt
          </div>
        )}

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#0a84ff]/10 border border-[#0a84ff]/20 text-xs font-medium text-[#0a84ff]/80 mb-5">
            <GraduationCap size={13} />
            Student
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-4xl font-bold text-white tracking-tight">4,99€</span>
            <span className="text-white/[0.22] text-base">/Monat</span>
          </div>
          <p className="text-white/[0.35] text-sm leading-relaxed">
            Für alle, die Prüfungen nicht nur bestehen wollen.
          </p>
        </div>

        <div className="h-px w-full bg-[#0a84ff]/10 mb-6" />

        <ul className="space-y-3 mb-8 text-sm text-white/[0.55] flex-1">
          <li className="flex items-start gap-3">
            <Check size={14} className="text-[#0a84ff]/50 mt-0.5 flex-shrink-0" />
            <span>Alles aus Starter</span>
          </li>
          <li className="flex items-start gap-3">
            <Check size={14} className="text-[#0a84ff]/50 mt-0.5 flex-shrink-0" />
            <span><strong className="text-white/80">30x</strong> Deep Mode / Tag</span>
          </li>
          <li className="flex items-start gap-3">
            <BarChart3 size={14} className="text-[#0a84ff]/50 mt-0.5 flex-shrink-0" />
            <span>Analytics Dashboard</span>
          </li>
        </ul>

        <div className="mt-auto">{renderButton('tier1')}</div>
      </div>

      {/* Exam Pro */}
      <div className={getCardStyles('tier2')}>
        {currentTier === 'tier1' && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-500 text-white text-[10px] font-semibold rounded-md uppercase tracking-wider">
            Premium
          </div>
        )}

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs font-medium text-purple-400/80 mb-5">
            <Crown size={13} />
            Exam Pro
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-4xl font-bold text-white tracking-tight">14,99€</span>
            <span className="text-white/[0.22] text-base">/Monat</span>
          </div>
          <p className="text-white/[0.35] text-sm leading-relaxed">
            Maximale Power für Staatsexamen und High-Stakes Tests.
          </p>
        </div>

        <div className="h-px w-full bg-purple-500/10 mb-6" />

        <ul className="space-y-3 mb-8 text-sm text-white/[0.55] flex-1">
          <li className="flex items-start gap-3">
            <Check size={14} className="text-purple-400/50 mt-0.5 flex-shrink-0" />
            <span>Alles aus Student</span>
          </li>
          <li className="flex items-start gap-3">
            <Check size={14} className="text-purple-400/50 mt-0.5 flex-shrink-0" />
            <span><strong className="text-white/80">UNBEGRENZT</strong> Deep Mode</span>
          </li>
          <li className="flex items-start gap-3">
            <Sparkles size={14} className="text-purple-400/50 mt-0.5 flex-shrink-0" />
            <span>Zugriff auf Beta-Features</span>
          </li>
          <li className="flex items-start gap-3">
            <Vote size={14} className="text-purple-400/50 mt-0.5 flex-shrink-0" />
            <span>Über Features abstimmen</span>
          </li>
        </ul>

        <div className="mt-auto">{renderButton('tier2')}</div>
      </div>
    </div>
  );
}
