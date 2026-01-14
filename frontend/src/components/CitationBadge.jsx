import React, { useState } from 'react';
import SourceCard from './SourceCard';

/**
 * CitationBadge Component
 * Clickable pill badge for card citations with hover tooltip
 * 
 * Style: bg-base-300/50 hover:bg-primary/20
 * Interaction: Click triggers bridge.previewCard(id)
 */
export default function CitationBadge({ cardId, citation, onClick, index }) {
  const [showTooltip, setShowTooltip] = useState(false);
  // #region agent log
  console.log('🔍 [HYP-E] CitationBadge rendered', {cardId, index, indexUndefined: index===undefined, indexType: typeof index});
  if (window.ankiBridge && window.ankiBridge.addMessage) {
    window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'CitationBadge.jsx:11',message:'CitationBadge rendered',data:{cardId,index,indexUndefined:index===undefined,indexType:typeof index},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
  }
  // #endregion
  
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CitationBadge.jsx:20',message:'CitationBadge handleClick called',data:{cardId,hasOnClick:!!onClick},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    if (onClick) {
      onClick(cardId, citation);
    }
  };
  
  // Determine display text: [1] if index provided, else [cardId]
  const displayText = index !== undefined ? `[${index}]` : `[${cardId}]`;
  // #region agent log
  console.log('🔍 [HYP-E] displayText determined', {displayText, index, cardId});
  if (window.ankiBridge && window.ankiBridge.addMessage) {
    window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'CitationBadge.jsx:37',message:'displayText determined',data:{displayText,index,cardId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
  }
  // #endregion
  
  return (
    <span className="relative inline-block">
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded 
                   bg-base-300/80 hover:bg-base-300 border border-base-content/20 
                   hover:border-primary/50 cursor-pointer 
                   transition-all duration-150 shadow-sm hover:shadow-md
                   active:scale-95 mx-0.5 align-middle translate-y-[-1px]
                   hover:bg-primary/10"
        style={{ display: 'inline-flex' }}
      >
        <span className="font-sans font-semibold text-sm text-base-content/90 
                        hover:text-primary leading-none select-none">
          {index !== undefined ? index : cardId}
        </span>
      </button>
      
      {/* Tooltip with SourceCard */}
      {showTooltip && citation && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 z-50"
             style={{ width: '192px' }}
             onMouseEnter={() => setShowTooltip(true)}
             onMouseLeave={() => setShowTooltip(false)}>
          {/* SourceCard Container */}
          <div className="relative">
            <SourceCard 
              citation={citation}
              index={index}
              isCurrentCard={citation.isCurrentCard}
              onClick={onClick ? () => onClick(cardId, citation) : null} // Enable click in tooltip
            />
            
            {/* Arrow pointing down to the badge - positioned at bottom center */}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full pointer-events-none">
              {/* Outer arrow (matches card border) */}
              <div className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-transparent border-t-base-300"></div>
              {/* Inner arrow (matches card background) */}
              <div className="absolute top-[-1px] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-base-200"></div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

