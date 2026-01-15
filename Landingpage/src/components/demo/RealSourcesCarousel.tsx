import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import RealSourceCard from './RealSourceCard';

/**
 * RealSourcesCarousel Component
 * UI Clone of SourcesCarousel for Landing Page Demo
 */
export default function RealSourcesCarousel({ citations = {}, citationIndices = {}, onPreviewCard }: any) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Convert citations to array and sort by index (current card always first)
  const citationArray = React.useMemo(() => {
    if (!citations || typeof citations !== 'object') return [];
    
    // Demo: Citations is an array of strings in demo data, but here we expect objects
    // Need to handle both or transform simple strings to objects
    let entries = [];
    if (Array.isArray(citations)) {
        entries = citations.map((cite, idx) => ({
            id: `cite-${idx}`,
            index: idx + 1,
            deckName: "Medizin::Kardiologie",
            front: cite,
            isCurrentCard: idx === 0
        }));
    } else {
        entries = Object.entries(citations)
        .map(([id, citation]: [string, any]) => ({
            id,
            index: citationIndices[id] || 999,
            ...citation
        }));
    }
    
    return entries;
  }, [citations, citationIndices]);

  const checkScroll = React.useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
  }, []);

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        container.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [checkScroll, citationArray.length]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 280;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  if (citationArray.length === 0) return null;

  return (
    <div className="relative group/carousel my-2 max-w-full overflow-hidden">
      
      {/* Navigation Buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 
                     w-7 h-7 rounded-full bg-[#1a1a1a] shadow-md border border-white/10
                     flex items-center justify-center text-white/70 hover:text-teal-500
                     hover:scale-110 transition-all duration-200 -ml-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 
                     w-7 h-7 rounded-full bg-[#1a1a1a] shadow-md border border-white/10
                     flex items-center justify-center text-white/70 hover:text-teal-500
                     hover:scale-110 transition-all duration-200 -mr-3"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Carousel Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1
                   scrollbar-hide snap-x max-w-full"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          // Masking for smooth fade edges - stronger fade
          maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)'
        }}
      >
        {citationArray.map((citation: any) => {
          return (
            <div key={citation.id} className="flex-shrink-0 w-48 snap-start">
              <RealSourceCard
                citation={citation}
                index={citation.index}
                isCurrentCard={citation.isCurrentCard}
                onClick={onPreviewCard}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
