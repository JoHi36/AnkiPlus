import { motion } from 'framer-motion';
import { Check, Zap, GraduationCap, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@shared/components/Button';
import { CheckoutButton } from './CheckoutButton';
import { LimitInfoBox } from './LimitExplanation';

interface PricingGridProps {
  currentTier?: 'free' | 'tier1' | 'tier2';
  onPortal?: () => void;
  isLoggedIn?: boolean;
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
};

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } 
  }
};

export function PricingGrid({ currentTier, onPortal, isLoggedIn = false }: PricingGridProps) {
  return (
    <motion.div 
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={staggerContainer}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-start"
    >
      
      {/* Starter (Free) */}
      <motion.div variants={fadeInUp} className="relative rounded-3xl border border-white/10 bg-neutral-900/40 p-6 sm:p-8 md:p-10 backdrop-blur-sm hover:border-white/20 transition-colors h-full flex flex-col">
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-neutral-400">
          <Zap size={14} />
          Starter
        </div>
        <div className="flex items-baseline gap-1 mb-8">
          <span className="text-5xl font-bold text-white tracking-tight">0€</span>
          <span className="text-neutral-500 text-lg">/Monat</span>
        </div>
        <p className="text-neutral-400 text-sm mb-8 min-h-[40px] leading-relaxed">
          Perfekt, um die Magie von ANKI+ kennenzulernen.
        </p>
        <ul className="space-y-4 mb-6 text-sm text-neutral-300 flex-1">
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-neutral-500" /> Unbegrenzt Flash Mode</li>
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-white" /> 3x Deep Mode pro Tag</li>
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-neutral-500" /> Basis-Support</li>
        </ul>
        <LimitInfoBox tier="free" />
        
        <div className="mt-6">
          {isLoggedIn ? (
            currentTier === 'free' ? (
              <Button 
                className="w-full bg-white/5 text-neutral-400 border-white/10 hover:bg-white/5 cursor-default"
                variant="outline"
              >
                Aktueller Plan
              </Button>
            ) : (
              <Button 
                className="w-full" 
                variant="outline"
                onClick={onPortal}
              >
                Downgrade
              </Button>
            )
          ) : (
            <Link 
              to="/register"
              className="block w-full py-4 rounded-full border border-white/10 font-medium text-white hover:bg-white hover:text-black transition-all text-center"
            >
              Download
            </Link>
          )}
        </div>
      </motion.div>

      {/* Student (Most Popular) */}
      <motion.div variants={fadeInUp} className="relative rounded-3xl border border-teal-500/50 bg-[#0F1110] p-6 sm:p-8 md:p-10 shadow-[0_0_50px_-15px_rgba(20,184,166,0.2)] md:scale-105 z-10 flex flex-col h-full">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-teal-500 text-black text-xs font-bold rounded-full uppercase tracking-wider shadow-lg shadow-teal-500/20">
          Beliebt
        </div>
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/50 border border-teal-500/30 text-xs font-medium text-teal-400">
          <GraduationCap size={14} />
          Student
        </div>
        <div className="flex items-baseline gap-1 mb-8">
          <span className="text-5xl font-bold text-white tracking-tight">4,99€</span>
          <span className="text-neutral-500 text-lg">/Monat</span>
        </div>
        <p className="text-neutral-400 text-sm mb-8 min-h-[40px] leading-relaxed">
          Für alle, die Prüfungen nicht nur bestehen, sondern rocken wollen.
        </p>
        <ul className="space-y-4 mb-6 text-sm text-neutral-200 flex-1">
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Alles aus Starter</li>
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> 30x Deep Mode pro Tag</li>
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Priorisierte Generierung</li>
          <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Werbefrei</li>
        </ul>
        <LimitInfoBox tier="tier1" />
        
        <div className="mt-6">
          {isLoggedIn ? (
            currentTier === 'tier1' ? (
              <Button 
                className="w-full bg-white/5 text-neutral-400 border-white/10 hover:bg-white/5 cursor-default"
                variant="outline"
              >
                Aktueller Plan
              </Button>
            ) : (
              <CheckoutButton 
                tier="tier1" 
                className="w-full"
                variant="primary"
              >
                Upgrade auf Student
              </CheckoutButton>
            )
          ) : (
            <Link 
              to="/register"
              className="w-full py-4 rounded-full bg-teal-500 font-bold text-black text-lg hover:bg-teal-400 hover:shadow-[0_0_30px_rgba(20,184,166,0.4)] transition-all transform hover:-translate-y-1 text-center block"
            >
              Jetzt starten
            </Link>
          )}
        </div>
      </motion.div>

      {/* Exam Pro (Ultimate) */}
      <motion.div variants={fadeInUp} className="relative rounded-3xl border border-white/10 bg-neutral-900/40 p-6 sm:p-8 md:p-10 backdrop-blur-sm hover:border-purple-500/30 transition-colors h-full flex flex-col">
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/20 border border-purple-500/30 text-xs font-medium text-purple-300">
          <Crown size={14} />
          Fürs Examen
        </div>
        <div className="flex items-baseline gap-1 mb-8">
          <span className="text-5xl font-bold text-white tracking-tight">14,99€</span>
          <span className="text-neutral-500 text-lg">/Monat</span>
        </div>
        <p className="text-neutral-400 text-sm mb-8 min-h-[40px] leading-relaxed">
          Das ultimative Werkzeug für Staatsexamen und High-Stakes Tests.
        </p>
        <ul className="space-y-4 mb-6 text-sm text-neutral-300 flex-1">
           <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> Alles aus Student</li>
           <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span className="text-white font-medium">UNBEGRENZT</span> Deep Mode</li>
           <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> Deep Search (25 Quellen)</li>
           <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> 24/7 Priority Support</li>
        </ul>
        <LimitInfoBox tier="tier2" />
        
        <div className="mt-6">
          {isLoggedIn ? (
            currentTier === 'tier2' ? (
              <Button 
                className="w-full bg-white/5 text-neutral-400 border-white/10 hover:bg-white/5 cursor-default"
                variant="outline"
              >
                Aktueller Plan
              </Button>
            ) : (
              <CheckoutButton 
                tier="tier2" 
                className="w-full"
                variant="secondary" // Blue/Purple gradient style if supported or modify CheckoutButton
              >
                Upgrade auf Pro
              </CheckoutButton>
            )
          ) : (
            <Link 
              to="/register"
              className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 font-medium text-white hover:opacity-90 transition-opacity shadow-lg shadow-purple-900/20 text-center block"
            >
              Pro werden
            </Link>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
