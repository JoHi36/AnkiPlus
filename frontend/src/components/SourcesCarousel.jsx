import React, { useRef, useState, useEffect } from 'react';
import { FileText, ChevronLeft, ChevronRight, Library, BookOpen, Star } from 'lucide-react';
import SourceCard from './SourceCard';

/**
 * SourcesCarousel Component - Perplexity-style Redesign
 * Compact, elegant cards representing the knowledge source.
 * Now supports numbering and onPreviewCard callback.
 */
export default function SourcesCarousel({ citations = {}, citationIndices = {}, bridge = null, onPreviewCard }) {
  const scrollContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Convert citations to array and sort by index (current card always first)
  const citationArray = React.useMemo(() => {
    if (!citations || typeof citations !== 'object') return [];
    
    const entries = Object.entries(citations)
      .map(([id, citation]) => ({
        id,
        index: citationIndices[id] || 999, // Use index or push to end
        ...citation
      }));
    
    // Sort: Current card first (isCurrentCard: true), then by index
    return entries.sort((a, b) => {
      // Current card always comes first
      if (a.isCurrentCard && !b.isCurrentCard) return -1;
      if (!a.isCurrentCard && b.isCurrentCard) return 1;
      // Then sort by index
      return a.index - b.index;
    });
  }, [citations, citationIndices]);

  const checkScroll = React.useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 5); // Little threshold
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

  const scroll = (direction) => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 280;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  const handleCardClick = (citation) => {
    const cardId = citation.noteId || citation.cardId || citation.id;
    
    // Use new popup if available, otherwise fallback to bridge
    if (onPreviewCard) {
      onPreviewCard(citation);
    } else if (bridge && bridge.previewCard && cardId) {
      bridge.previewCard(String(cardId));
    }
  };

  if (citationArray.length === 0) return null;

  return (
    <div className="relative group/carousel my-2 max-w-full overflow-hidden">
      
      {/* Navigation Buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 
                     w-7 h-7 rounded-full bg-base-100 shadow-md border border-base-200
                     flex items-center justify-center text-base-content/70 hover:text-primary
                     hover:scale-110 transition-all duration-200 -ml-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 
                     w-7 h-7 rounded-full bg-base-100 shadow-md border border-base-200
                     flex items-center justify-center text-base-content/70 hover:text-primary
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
        {citationArray.map((citation) => {
          const cardId = citation.noteId || citation.cardId || citation.id;

          return (
            <div key={cardId} className="flex-shrink-0 w-48 snap-start">
              <SourceCard
                citation={citation}
                index={citation.index}
                isCurrentCard={citation.isCurrentCard}
                onClick={() => handleCardClick(citation)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

