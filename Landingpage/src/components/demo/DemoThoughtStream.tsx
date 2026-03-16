import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CheckCircle2, Loader2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface DemoThoughtStreamProps {
  steps: string[];
  isComplete: boolean;
  isVisible: boolean;
}

export function DemoThoughtStream({ steps, isComplete, isVisible }: DemoThoughtStreamProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-progress steps when visible
  useEffect(() => {
    if (!isVisible || isComplete) return;
    
    // Reset when becoming visible
    if (isVisible && !isComplete && currentStepIndex === steps.length) {
      setCurrentStepIndex(0);
    }

    const interval = setInterval(() => {
      setCurrentStepIndex(prev => {
        if (prev < steps.length) return prev + 1;
        return prev;
      });
    }, 800); // New step every 800ms

    return () => clearInterval(interval);
  }, [isVisible, isComplete, steps.length]);

  // Auto-collapse on completion
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setIsCollapsed(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setIsCollapsed(false);
    }
  }, [isComplete]);

  if (!isVisible && !isComplete) return null;

  return (
    <div className="w-full mb-6">
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="rounded-xl overflow-hidden border border-purple-500/20 bg-purple-900/10 backdrop-blur-sm"
      >
        {/* Header */}
        <div 
          className="flex items-center gap-2 px-4 py-3 bg-purple-500/5 border-b border-purple-500/10 cursor-pointer hover:bg-purple-500/10 transition-colors"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="relative">
            {isComplete ? (
              <Sparkles className="w-4 h-4 text-purple-400" />
            ) : (
              <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
            )}
            {!isComplete && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
            )}
          </div>
          
          <span className="text-xs font-bold text-purple-200 uppercase tracking-wider flex-1">
            {isComplete ? 'Reasoning Complete' : 'Deep Reasoning...'}
          </span>
          
          {isCollapsed ? <ChevronRight size={14} className="text-purple-400"/> : <ChevronDown size={14} className="text-purple-400"/>}
        </div>

        {/* Steps Body */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 space-y-3"
            >
              {steps.map((step, idx) => {
                const isDone = idx < currentStepIndex || isComplete;
                const isCurrent = idx === currentStepIndex && !isComplete;

                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: isDone || isCurrent ? 1 : 0.3, x: 0 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-4 flex justify-center">
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                      ) : isCurrent ? (
                        <Loader2 className="w-3.5 h-3.5 text-purple-300 animate-spin" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500/30" />
                      )}
                    </div>
                    <span className={`text-xs ${isCurrent ? 'text-purple-100 font-medium' : 'text-purple-300/70'}`}>
                      {step}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
