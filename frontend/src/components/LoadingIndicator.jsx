import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Search, Sparkles } from 'lucide-react';

/**
 * Loading Indicator Komponente
 * Modernes, cooles, cleanes Loading-Animation mit Neuro-Pulse RAG State Indicator
 */
export default function LoadingIndicator() {
  const [aiState, setAiState] = useState(null);

  // Icon-Mapping für RAG States
  const getStateIcon = (stateText) => {
    if (!stateText) return null;
    if (stateText.includes('Analysiere')) return BrainCircuit;
    if (stateText.includes('Durchsuche')) return Search;
    if (stateText.includes('Generiere')) return Sparkles;
    return null;
  };

  // Event Listener für AI State Updates
  useEffect(() => {
    const handleAiStateUpdate = (event) => {
      const message = event.detail?.message;
      if (message) {
        setAiState(message);
      }
    };

    // Listen for aiStateUpdate custom event (dispatched from App.jsx)
    window.addEventListener('aiStateUpdate', handleAiStateUpdate);

    // Cleanup
    return () => {
      window.removeEventListener('aiStateUpdate', handleAiStateUpdate);
    };
  }, []);

  const StateIcon = aiState ? getStateIcon(aiState) : null;

  return (
    <div className="flex items-start gap-3 mb-8">
      {/* Avatar/Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative">
        {/* Pulsierender Punkt - ohne Rotation */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-primary" />
        </div>
      </div>
      
      {/* Typing Indicator Container */}
      <div className="flex flex-col gap-2">
        {/* Bouncing Dots */}
        <div className="flex items-center gap-2 px-4 py-3 bg-base-300/60 rounded-2xl rounded-tl-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-base-content/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-base-content/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-base-content/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {/* Neuro-Pulse Indicator - RAG State */}
        <AnimatePresence mode="wait">
          {aiState && (
            <motion.div
              key={aiState}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5 px-3 py-1.5"
            >
              {StateIcon && (
                <StateIcon className="w-3 h-3 text-primary animate-pulse flex-shrink-0" />
              )}
              <span className="text-[10px] uppercase tracking-wider text-base-content/50 font-mono">
                {aiState}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

