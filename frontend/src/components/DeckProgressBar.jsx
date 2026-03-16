import React, { useState, useEffect } from 'react';

/**
 * Signature Progress Bar - Segmented DNA Design
 * 
 * Features:
 * - Segmented blocks representing progress units
 * - Distinctive "active" pulse at the leading edge
 * - Minimalist, high-contrast look
 * - Session tracking visualized clearly
 */
export default function DeckProgressBar({ deckId, bridge, session }) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    if (!bridge || !bridge.getDeckStats || !deckId) {
      setIsLoading(false);
      return;
    }
    
    // Lade Deck-Statistiken über asynchrones Event-System
    const handleDeckStats = (event) => {
      if (event.detail && event.detail.deckId === deckId) {
        const data = event.detail.data;
        if (!data.error) {
          setStats(data);
        }
        setIsLoading(false);
      }
    };
    
    window.addEventListener('deckStats', handleDeckStats);
    bridge.getDeckStats(deckId);
    
    const timeout = setTimeout(() => setIsLoading(false), 2000);
    return () => {
      window.removeEventListener('deckStats', handleDeckStats);
      clearTimeout(timeout);
    };
  }, [deckId, bridge]);
  
  // Wenn wir keine Stats haben, können wir keine korrekten Verhältnisse anzeigen.
  // Aber wenn wir eine Session haben, können wir zumindest die gesehenen Karten anzeigen.
  if (isLoading) return <div className="h-1.5 w-24 bg-base-content/5 rounded-full animate-pulse" />;
  
  // Fallback für totalCards, falls Stats fehlen.
  // Wenn wir keine Stats haben, nehmen wir die Anzahl der gesehenen Karten als absolutes Minimum an,
  // aber wir erfinden keine "10" dazu.
  const totalCards = stats?.totalCards || (session?.seenCardIds?.length || 0);
  
  if (totalCards === 0) return null;

  const isSessionMode = !!session;
  
  let currentVal = 0;
  let label = '';
  
  if (isSessionMode) {
    currentVal = session.seenCardIds ? session.seenCardIds.length : 0;
    label = `${currentVal} / ${totalCards}`;
  } else {
    currentVal = stats?.cards1x || 0;
    label = `${currentVal} / ${totalCards}`;
  }
  
  const percentage = Math.min((currentVal / totalCards) * 100, 100);
  
  // Dynamische Segmente: 1:1 Mapping bis 100 Karten, danach Skalierung
  // Limit auf 100, damit die Segmente noch unterscheidbar bleiben
  const numSegments = Math.max(5, Math.min(totalCards, 100));
  const activeSegments = Math.ceil((percentage / 100) * numSegments);

  return (
    <div className="w-full mt-3 group/progress">
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-[9px] font-bold tracking-widest uppercase text-base-content/30 group-hover/progress:text-primary/60 transition-colors">
          {isSessionMode ? 'SESSION COVERAGE' : 'DECK MASTERY'}
        </span>
        <span className="text-[10px] font-mono font-medium text-base-content/60">
          {label}
        </span>
      </div>
      
      {/* Segmented Bar Container */}
      <div className={`flex h-1.5 w-full ${numSegments > 50 ? 'gap-[1px]' : 'gap-[2px]'}`}>
        {[...Array(numSegments)].map((_, i) => {
          const isActive = i < activeSegments;
          const isLastActive = i === activeSegments - 1;
          
          return (
            <div 
              key={i}
              className={`flex-1 rounded-[0.5px] transition-all duration-300 ${
                isActive 
                  ? 'bg-primary shadow-[0_0_8px_rgba(var(--p),0.4)]' 
                  : 'bg-base-content/5'
              } ${isLastActive ? 'bg-primary-focus scale-y-125' : ''}`}
              style={{
                opacity: isActive ? 1 : 0.3,
                transitionDelay: `${i * 5}ms` // Schnellerer Stagger bei vielen Segmenten
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
