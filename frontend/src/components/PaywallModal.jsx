import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export default function PaywallModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const handleUpgrade = () => {
    window.open('https://anki-plus.vercel.app/#pricing', '_blank');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 backdrop-blur-md"
          style={{ background: 'var(--ds-bg-deep)', opacity: 0.9 }}
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="ds-frosted relative w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden"
          style={{ border: '1px solid var(--ds-accent-20)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-gray-400 hover:text-gray-300"
          >
            <X size={16} />
          </button>
          <div className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2 text-white tracking-tight">
              Token-Limit erreicht
            </h2>
            <p className="text-gray-400 text-sm mb-8">
              Dein tägliches Token-Budget ist aufgebraucht. Upgrade für mehr Tokens und lerne ohne Unterbrechung weiter.
            </p>
            <div className="space-y-3 mb-8 text-left">
              {[
                { tier: 'Student', tokens: '70K Tokens/Tag', price: '4,99€/Monat' },
                { tier: 'Exam Pro', tokens: '210K Tokens/Tag', price: '14,99€/Monat' },
              ].map(({ tier, tokens, price }) => (
                <div key={tier} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div>
                    <span className="text-sm font-medium text-white/80">{tier}</span>
                    <span className="text-xs text-white/30 ml-2">{tokens}</span>
                  </div>
                  <span className="text-xs text-white/40">{price}</span>
                </div>
              ))}
            </div>
            <motion.button
              onClick={handleUpgrade}
              className="w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all"
              style={{ background: 'var(--ds-accent)', color: '#ffffff' }}
            >
              Pläne vergleichen
            </motion.button>
            <p className="mt-4 text-xs text-gray-500">
              Dein Limit setzt sich täglich um 00:00 UTC zurück.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
