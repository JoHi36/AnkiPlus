import { motion } from 'framer-motion';
import { Check, Zap, GraduationCap, Crown, Sparkles, Vote } from 'lucide-react';
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
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 items-start max-w-7xl mx-auto"
    >
      
      {/* Starter (Free) */}
      <motion.div 
        variants={fadeInUp} 
        className="group relative rounded-[2rem] border border-white/5 bg-neutral-900/20 p-8 flex flex-col h-full backdrop-blur-md hover:bg-neutral-900/30 transition-all duration-300"
      >
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-neutral-400 mb-6">
            <Zap size={14} />
            Starter
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-5xl font-bold text-white tracking-tight">0€</span>
            <span className="text-neutral-500 text-lg">/Monat</span>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed">
            Der perfekte Einstieg in KI-gestütztes Lernen.
          </p>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />
        
        <ul className="space-y-4 mb-8 text-sm text-neutral-300 flex-1">
          <li className="flex items-start gap-3">
            <div className="p-1 rounded-full bg-neutral-800 text-neutral-400 mt-0.5">
              <Check size={12} />
            </div>
            <span>Unbegrenzt Flash Mode</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="p-1 rounded-full bg-white/10 text-white mt-0.5">
              <Check size={12} />
            </div>
            <span>
              <strong className="text-white">3x</strong> Deep Mode / Tag
            </span>
          </li>
          <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-neutral-800 text-neutral-400 mt-0.5">
              <Check size={12} />
            </div>
            <span>Basis Support</span>
          </li>
        </ul>

        <LimitInfoBox tier="free" />
        
        <div className="mt-8">
          {isLoggedIn ? (
            currentTier === 'free' ? (
              <Button 
                className="w-full bg-white/5 text-neutral-500 border-white/5 hover:bg-white/5 cursor-default py-6 rounded-2xl"
                variant="outline"
              >
                Aktueller Plan
              </Button>
            ) : (
              <Button 
                className="w-full py-6 rounded-2xl border-white/10 text-neutral-300 hover:text-white" 
                variant="outline"
                onClick={onPortal}
              >
                Downgrade
              </Button>
            )
          ) : (
            <Link 
              to="/register"
              className="flex items-center justify-center w-full py-4 rounded-2xl border border-white/10 font-medium text-white hover:bg-white hover:text-black transition-all duration-300 group-hover:border-white/20"
            >
              Kostenlos starten
            </Link>
          )}
        </div>
      </motion.div>

      {/* Student (Most Popular) */}
      <motion.div 
        variants={fadeInUp} 
        className="relative rounded-[2rem] border border-teal-500/30 bg-[#0F1312] p-8 flex flex-col h-full shadow-[0_0_60px_-15px_rgba(20,184,166,0.1)] md:-mt-4 md:mb-4 z-10"
      >
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-to-r from-teal-500 to-teal-400 text-black text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg shadow-teal-500/20">
          Am Beliebtesten
        </div>
        
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/30 border border-teal-500/20 text-xs font-medium text-teal-300 mb-6">
            <GraduationCap size={14} />
            Student
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-5xl font-bold text-white tracking-tight">4,99€</span>
            <span className="text-neutral-500 text-lg">/Monat</span>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed">
            Für alle, die Prüfungen nicht nur bestehen, sondern rocken wollen.
          </p>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-500/20 to-transparent mb-8" />
        
        <ul className="space-y-4 mb-8 text-sm text-neutral-200 flex-1">
          <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-teal-500/10 text-teal-400 mt-0.5 border border-teal-500/20">
              <Check size={12} />
            </div>
            <span>Alles aus Starter</span>
          </li>
          <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-teal-500/10 text-teal-400 mt-0.5 border border-teal-500/20">
              <Check size={12} />
            </div>
            <span>
              <strong className="text-teal-300">30x</strong> Deep Mode / Tag
            </span>
          </li>
          <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-teal-500/10 text-teal-400 mt-0.5 border border-teal-500/20">
              <Check size={12} />
            </div>
            <span>Priority Support</span>
          </li>
          <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-teal-500/10 text-teal-400 mt-0.5 border border-teal-500/20">
              <Sparkles size={12} />
            </div>
            <span>Zugriff auf Beta-Features</span>
          </li>
        </ul>
        
        <LimitInfoBox tier="tier1" />
        
        <div className="mt-8">
          {isLoggedIn ? (
            currentTier === 'tier1' ? (
              <Button 
                className="w-full bg-teal-500/5 text-teal-500 border-teal-500/20 hover:bg-teal-500/10 cursor-default py-6 rounded-2xl"
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
              className="flex items-center justify-center w-full py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-teal-400 font-bold text-black text-lg hover:shadow-[0_0_40px_-10px_rgba(20,184,166,0.4)] transition-all transform hover:-translate-y-1"
            >
              Jetzt durchstarten
            </Link>
          )}
        </div>
      </motion.div>

      {/* Exam Pro (Ultimate) */}
      <motion.div 
        variants={fadeInUp} 
        className="group relative rounded-[2rem] border border-purple-500/20 bg-neutral-900/20 p-8 flex flex-col h-full backdrop-blur-md hover:bg-neutral-900/30 hover:border-purple-500/30 transition-all duration-300"
      >
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-900/20 border border-purple-500/30 text-xs font-medium text-purple-300 mb-6">
            <Crown size={14} />
            Exam Pro
          </div>
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-5xl font-bold text-white tracking-tight">14,99€</span>
            <span className="text-neutral-500 text-lg">/Monat</span>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed">
            Das ultimative Werkzeug für Staatsexamen und High-Stakes Tests.
          </p>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-purple-500/20 to-transparent mb-8" />
        
        <ul className="space-y-4 mb-8 text-sm text-neutral-300 flex-1">
           <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-purple-500/10 text-purple-400 mt-0.5 border border-purple-500/20">
               <Check size={12} />
             </div>
             <span>Alles aus Student</span>
           </li>
           <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-purple-500/10 text-purple-400 mt-0.5 border border-purple-500/20">
               <Check size={12} />
             </div>
             <span>
                <strong className="text-white">UNBEGRENZT</strong> Deep Mode
             </span>
           </li>
           <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-purple-500/10 text-purple-400 mt-0.5 border border-purple-500/20">
               <Check size={12} />
             </div>
             <span>Priority Support</span>
           </li>
           <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-purple-500/10 text-purple-400 mt-0.5 border border-purple-500/20">
               <Sparkles size={12} />
             </div>
             <span>Zugriff auf Beta-Features</span>
           </li>
           <li className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-purple-500/10 text-purple-400 mt-0.5 border border-purple-500/20">
               <Vote size={12} />
             </div>
             <span>Über Features abstimmen</span>
           </li>
        </ul>
        
        <LimitInfoBox tier="tier2" />
        
        <div className="mt-8">
          {isLoggedIn ? (
            currentTier === 'tier2' ? (
              <Button 
                className="w-full bg-purple-500/5 text-purple-400 border-purple-500/20 hover:bg-purple-500/10 cursor-default py-6 rounded-2xl"
                variant="outline"
              >
                Aktueller Plan
              </Button>
            ) : (
              <CheckoutButton 
                tier="tier2" 
                className="w-full"
                variant="secondary"
              >
                Upgrade auf Pro
              </CheckoutButton>
            )
          ) : (
            <Link 
              to="/register"
              className="flex items-center justify-center w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-medium text-white hover:opacity-90 transition-all shadow-lg shadow-purple-900/20 transform hover:-translate-y-1"
            >
              Pro werden
            </Link>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}