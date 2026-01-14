import React from 'react';
import { FileText, Clock, Repeat, Loader2 } from 'lucide-react';

/**
 * CardContext Komponente
 * Reduzierte Version: Zeigt ID/Titel links, Stats und Status rechts.
 */
export default function CardContext({ 
  context,
  title
}) {
  if (!context || (!context.question && !context.frontField)) {
    return null;
  }

  const cardId = context?.cardId || '—';
  // Zeige Titel wenn vorhanden und nicht "Lade Titel..."
  const displayTitle = title && title !== "Lade Titel..." ? title : null;
  const isLoadingTitle = title === "Lade Titel...";
  
  // Statistiken
  const knowledgeScore = context?.stats?.knowledgeScore || 0;
  const reps = context?.stats?.reps || 0;
  const interval = context?.stats?.interval || 0;
  
  const getKnowledge = (score) => {
    if (score >= 70) return { label: 'Gut bekannt', color: 'text-success' };
    if (score >= 40) return { label: 'Mäßig bekannt', color: 'text-warning' };
    if (score > 0) return { label: 'Wenig bekannt', color: 'text-error' };
    return { label: 'Neu', color: 'text-info' };
  };

  const formatInterval = (days) => {
    if (days >= 365) return `${(days / 365).toFixed(1)}j`;
    if (days >= 30) return `${(days / 30).toFixed(1)}m`;
    return `${days}t`;
  };

  const knowledge = getKnowledge(knowledgeScore);

  return (
    <div className="bg-base-200/60 backdrop-blur-xl rounded-t-2xl rounded-b-none px-5 pt-3 pb-8 pointer-events-auto w-full">
      <div className="flex items-center justify-between w-full gap-4">
        
        {/* Left: ID or Title */}
        <div className="flex items-center gap-2 min-w-0 max-w-[50%]">
            <div className="flex-shrink-0 w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                <FileText size={12} className="text-primary/70" />
            </div>
            
            {displayTitle ? (
                // Titel anzeigen
                <div className="flex items-center gap-1.5 min-w-0" title={typeof displayTitle === 'string' ? displayTitle : ''}>
                    <span className="text-[11px] font-medium text-base-content/80 truncate">
                        {typeof displayTitle === 'string' ? displayTitle : String(displayTitle || '')}
                    </span>
                </div>
            ) : (
                // ID anzeigen (oder Loading)
                <div className="flex items-center gap-1.5 text-[11px] text-base-content/60 font-medium whitespace-nowrap overflow-hidden">
                    {isLoadingTitle ? (
                        <>
                         <Loader2 size={10} className="animate-spin text-primary/50" />
                         <span className="text-[10px] text-base-content/40 italic">Generiere...</span>
                        </>
                    ) : (
                        <>
                            <span className="uppercase tracking-wide text-base-content/40 font-semibold text-[10px]">ID</span>
                            <span className="font-mono text-base-content/70">{cardId}</span>
                        </>
                    )}
                </div>
            )}
        </div>
        
        {/* Right: Stats & Status */}
        <div className="flex items-center gap-3 shrink-0">
            {/* Interval */}
            <div className="flex items-center gap-1 text-[11px] text-base-content/50" title={`Intervall: ${interval} Tage`}>
                <Clock size={11} />
                <span>{formatInterval(interval)}</span>
            </div>

            {/* Reps */}
            <div className="flex items-center gap-1 text-[11px] text-base-content/50" title={`Wiederholungen: ${reps}`}>
                <Repeat size={11} />
                <span>{reps}</span>
            </div>

            {/* Divider */}
            <div className="w-px h-3 bg-base-content/10 mx-0.5"></div>

            {/* Knowledge Status */}
            <div className={`text-[11px] font-semibold ${knowledge.color} whitespace-nowrap`}>
                {knowledge.label}
            </div>
        </div>

      </div>
    </div>
  );
}
