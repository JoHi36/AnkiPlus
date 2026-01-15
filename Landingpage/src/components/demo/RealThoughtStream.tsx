import React, { useState, useEffect } from 'react';
import { Brain, Search, Library, ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import RealSourcesCarousel from './RealSourcesCarousel';

/**
 * RealThoughtStream Component - Adaptiert für Landing Page Demo
 * 1:1 UI Clone von ThoughtStream.jsx
 */
export default function RealThoughtStream({ 
  steps = [], 
  citations = {}, 
  isStreaming = false, 
  isVisible = false, // Demo Control
  isComplete = false // Demo Control
}: any) {
  const [isExpanded, setIsExpanded] = useState(true); 
  const [processedSteps, setProcessedSteps] = useState<any[]>([]);
  
  // Demo Logic: Process string-steps into rich step objects
  useEffect(() => {
    if (!steps || steps.length === 0) return;

    // Transform simple string steps into rich objects for the UI
    const richSteps = steps.map((stepStr: string, idx: number) => {
        let phase = 'intent';
        let icon = Brain;
        let label = 'Analyse';
        let detail = stepStr;
        let subItems = null;

        if (idx === 0) {
            phase = 'intent';
            label = 'Intentionsanalyse';
            detail = 'Erklärung angefordert';
        } else if (stepStr.includes('Scanne') || stepStr.includes('Leitlinien')) {
            phase = 'search';
            icon = Search;
            label = 'Kontextstrategie';
            detail = 'SAMMLUNG';
            subItems = {
                precise: [
                    { query: 'Hyperkaliämie EKG', status: 'success', count: 5 },
                    { query: 'Zelt-T Welle', status: 'success', count: 3 }
                ],
                broad: [
                    { query: 'Elektrolytstörungen', status: 'success', count: 12 }
                ]
            };
        } else if (stepStr.includes('Korreliere')) {
            phase = 'retrieval';
            icon = Library;
            label = 'Relevanzanalyse';
            detail = null;
        }

        return {
            id: phase,
            phase,
            icon,
            label,
            detail,
            subItems,
            status: isComplete || idx < steps.length - 1 ? 'done' : 'loading',
            hasSources: phase === 'retrieval',
            metadata: phase === 'retrieval' ? { mode: 'detailed', sourceCount: 3 } : {}
        };
    });

    setProcessedSteps(richSteps);
    
    // Auto-collapse on completion
    if (isComplete) {
        const timer = setTimeout(() => setIsExpanded(false), 800);
        return () => clearTimeout(timer);
    } else {
        setIsExpanded(true);
    }

  }, [steps, isComplete]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  // Determine active phase for timeline
  const lastPhase = isComplete ? 'finished' : (processedSteps[processedSteps.length - 1]?.phase || 'intent');

  return (
    <div className="mb-3 font-sans max-w-full overflow-hidden">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
      
      {/* 1. Header */}
      <button 
        onClick={handleToggle}
        className={`group relative flex items-center justify-start gap-3 px-0 py-2 w-full text-left cursor-pointer hover:opacity-100 ${!isExpanded ? 'opacity-70' : 'opacity-100'}`}
      >
        <div className="relative z-10">
            {!isComplete ? (
                <span 
                    className="text-sm"
                    style={{
                        fontWeight: 700,
                        background: "linear-gradient(to right, rgb(15, 118, 110) 0%, rgb(15, 118, 110) 20%, rgb(94, 234, 212) 50%, rgb(15, 118, 110) 80%, rgb(15, 118, 110) 100%)",
                        backgroundSize: "200% auto",
                        backgroundClip: "text",
                        WebkitBackgroundClip: "text",
                        WebkitFontSmoothing: "antialiased",
                        color: "transparent",
                        animation: "shimmer 3s linear infinite"
                    }}
                >
                    ANKI+
                </span>
            ) : (
                <span className="text-sm" style={{ fontWeight: 700, color: "rgb(13, 148, 136)", WebkitFontSmoothing: "antialiased" }}>
                    ANKI+
                </span>
            )}
        </div>

        <div className="relative z-10 p-1 rounded-full hover:bg-white/10 transition-transform duration-200">
            {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-white/40" />
            ) : (
                <ChevronRight className="w-4 h-4 text-white/40" />
            )}
        </div>

        {!isExpanded && (
            <div className="relative z-10 flex items-center gap-1.5 text-xs text-white/40">
                <span>{processedSteps.length} Schritte</span>
                <span className="w-1 h-1 rounded-full bg-white/30" />
                <span>{Object.keys(citations).length || 3} Quellen</span>
            </div>
        )}
      </button>

      {/* 2. Expanded Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="expanded-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="py-2 overflow-hidden"
          >
            <div className="grid grid-cols-[1.5rem_1fr] gap-0">
                {/* Timeline Column */}
                <div className="flex flex-col items-center relative self-stretch">
                    <div className="w-2 h-2 rounded-full bg-white/30 shadow-sm z-10 mb-2 flex-shrink-0" />
                    <div className="absolute left-1/2 top-2 bottom-0 w-0.5 -translate-x-1/2 -z-0">
                        <div className="absolute inset-0 bg-white/5" />
                        <motion.div 
                            className="w-full origin-top bg-white/20"
                            initial={{ height: 0 }}
                            animate={{ height: '100%' }}
                        />
                    </div>
                    {isComplete && (
                        <div className="w-2 h-2 rounded-full bg-white/30 shadow-sm z-10 mt-auto mb-0 flex-shrink-0" />
                    )}
                </div>

                {/* Content Column */}
                <div className="space-y-6 pl-3 min-w-0">
                <AnimatePresence mode="popLayout">
                  {processedSteps.map((step, idx) => {
                    const Icon = step.icon;
                    const isActiveStep = step.status === 'loading';
                    
                    return (
                        <motion.div
                            key={step.id || idx}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col gap-2 group/step"
                        >
                            <div className="flex items-start gap-3">
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300 mt-0.5
                                                ${isActiveStep ? 'bg-[#222]' : 'bg-[#151515] border border-[#222]'}`}>
                                    {isActiveStep ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white/60" />
                                    ) : (
                                        <Icon className="w-3.5 h-3.5 text-white/50" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-white/80">{step.label}</div>
                                    
                                    {/* Badges */}
                                    {(step.id === 'intent' || step.id === 'search') && step.detail && (
                                        <div className="mt-1">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider bg-teal-500/10 text-teal-400">
                                                {step.detail}
                                            </span>
                                        </div>
                                    )}
                                    {step.id === 'retrieval' && (
                                        <div className="mt-1">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider bg-purple-500/10 text-purple-400">
                                                DETAILED • 3 QUELLEN
                                            </span>
                                        </div>
                                    )}

                                    {/* Sub Items (Search Queries) */}
                                    {step.subItems && (
                                        <div className="mt-2 flex flex-col gap-3">
                                            {step.subItems.precise && (
                                                <div className="flex flex-wrap gap-2">
                                                    {step.subItems.precise.map((item: any, i: number) => (
                                                        <div key={i} className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#333] bg-[#222]">
                                                            <Search className="w-3 h-3 text-white/60" />
                                                            <span className="text-white/70">{item.query}</span>
                                                            <div className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-teal-500/10 text-teal-500">
                                                                {item.count}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Sources Carousel */}
                            {step.hasSources && (
                                <div className="ml-8 mt-1 max-w-full overflow-hidden">
                                    <RealSourcesCarousel citations={citations} />
                                </div>
                            )}
                        </motion.div>
                    );
                  })}
                </AnimatePresence>
                
                {/* Footer Step */}
                {isComplete && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col gap-2 group/step"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300 border border-teal-500/20 bg-teal-500/10 z-10">
                                <Check className="w-3.5 h-3.5 text-teal-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 h-full">
                                    <span className="text-xs font-semibold text-white/80">Synthese</span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border tracking-wider flex items-center h-5 bg-purple-500/10 text-purple-400 border-purple-500/20">
                                        PRO
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
