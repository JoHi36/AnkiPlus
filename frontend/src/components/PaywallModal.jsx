import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Gift } from 'lucide-react';

export default function PaywallModal({ isOpen, onClose, onUnlock }) {
  const [voucherCode, setVoucherCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleRedeem = () => {
    if (voucherCode.trim().toUpperCase() === 'BSP2026') {
      setIsRedeeming(true);
      // Simuliere kurze Verzögerung für besseres UX
      setTimeout(() => {
        setIsRedeeming(false);
        setShowSuccess(true);
        // Nach kurzer Erfolgs-Animation: Unlock ausführen
        setTimeout(() => {
          onUnlock();
          onClose();
          setVoucherCode('');
          setShowSuccess(false);
        }, 1500);
      }, 500);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isRedeeming) {
      handleRedeem();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop mit subtilem radialen Teal-Glow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-[#09090b] backdrop-blur-md"
          onClick={onClose}
        >
          {/* Subtiler radialer Teal-Glow im Hintergrund */}
          <div className="absolute inset-0 bg-gradient-radial from-teal-500/5 via-transparent to-transparent pointer-events-none" />
        </motion.div>

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ 
            type: "spring", 
            damping: 30, 
            stiffness: 300,
            duration: 0.3 
          }}
          className="relative w-full max-w-lg mx-4 bg-[#09090b]/95 backdrop-blur-xl border border-teal-500/20 rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-gray-400 hover:text-gray-300"
          >
            <X size={16} />
          </button>

          {/* Content */}
          <div className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold mb-2 text-white tracking-tight">
                Unlock ANKI+ DEEP
              </h2>
              <p className="text-gray-400 text-sm">
                Erweitere deine Lern-Erfahrung mit Premium-Features
              </p>
            </div>

            {/* Features Grid - 2 Spalten */}
            <div className="grid grid-cols-1 gap-3 mb-8">
              {[
                'Gemini 3.0 Pro – Höchste KI-Leistung',
                '10+ Quellenanalyse pro Antwort',
                'Klinische Fallstudien & Praxisbezug',
                'Evidence-based Learning mit Quellen',
                'Prüfungsrelevanz-Marker',
                'Vernetzung zwischen Konzepten'
              ].map((feature, idx) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.05 }}
                  className="flex items-start gap-3"
                >
                  <CheckCircle2 size={18} className="text-teal-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <span className="text-sm text-gray-300 font-medium leading-relaxed">{feature}</span>
                </motion.div>
              ))}
            </div>

            {/* Pricing - Minimalistisch */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center mb-6 pb-6 border-b border-white/5"
            >
              <div className="text-4xl font-bold text-white mb-1 tracking-tight">
                9,99€
              </div>
              <div className="text-sm text-gray-400">/ Monat</div>
            </motion.div>

            {/* CTA Button - Edel mit Shimmer */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="w-full py-3.5 px-6 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-semibold text-base relative overflow-hidden group shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_25px_rgba(20,184,166,0.4)] transition-all duration-300"
            >
              {/* Shimmer Effect - läuft kontinuierlich alle 3 Sekunden */}
              <span 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                style={{
                  animation: 'shimmer 3s ease-in-out infinite'
                }}
              />
              
              <span className="relative z-10 flex items-center justify-center gap-2">
                Jetzt upgraden
              </span>
            </motion.button>

            {/* Voucher Code Section - Minimalistisch */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 pt-6 border-t border-white/5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Gift size={14} className="text-gray-500" />
                <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                  Gutscheincode
                </label>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Code eingeben..."
                  className="flex-1 px-4 py-2.5 bg-black/50 border border-transparent rounded-lg text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 transition-all"
                  disabled={isRedeeming || showSuccess}
                />
                <button
                  onClick={handleRedeem}
                  disabled={!voucherCode.trim() || isRedeeming || showSuccess}
                  className="px-4 py-2.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg text-sm font-medium text-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isRedeeming ? '...' : 'Einlösen'}
                </button>
              </div>
            </motion.div>

            {/* Success Animation - Teal/Emerald */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute inset-0 bg-[#09090b]/95 backdrop-blur-sm flex items-center justify-center rounded-xl"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.1, 1] }}
                    transition={{ type: "spring", stiffness: 200 }}
                    className="text-center"
                  >
                    <motion.div
                      animate={{ 
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ 
                        duration: 0.5,
                        repeat: 1,
                        repeatType: "reverse"
                      }}
                      className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(20,184,166,0.5)]"
                    >
                      <CheckCircle2 size={32} className="text-white" strokeWidth={2.5} />
                    </motion.div>
                    <p className="text-xl font-semibold text-white mb-1">
                      Deep Mode freigeschaltet
                    </p>
                    <p className="text-sm text-gray-400">
                      Viel Erfolg beim Lernen
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
