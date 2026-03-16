import React from 'react';
import { Star } from 'lucide-react';

/**
 * SourceCard Component
 * Reusable card component for displaying citation/source information
 * Used in SourcesCarousel and CitationBadge tooltip
 */
export default function SourceCard({ citation, index, isCurrentCard = false, onClick }) {
  const cardId = citation?.noteId || citation?.cardId || citation?.id;
  
  // Content extraction
  let frontText = '';
  if (citation?.fields) {
    frontText = citation.fields.Front || citation.fields.Vorderseite || 
               citation.fields.Question || citation.fields.Frage ||
               Object.values(citation.fields)[0] || '';
  } else {
    frontText = citation?.front || '';
  }

  const deckName = citation?.deckName || 'Unbekanntes Deck';
  const shortDeck = deckName.split('::').pop();

  // Parse HTML and Cloze deletions for better rendering
  const parseContent = (text) => {
    if (!text) return "Kein Vorschautext";
    
    // First, handle Cloze deletions: {{c1::text}} -> <span class="text-blue-600">text</span>
    let parsed = text.replace(/\{\{c\d+::([^}]+)\}\}/g, '<span class="text-blue-600 font-medium">$1</span>');
    
    // Remove other HTML tags but keep the content
    parsed = parsed.replace(/<[^>]+>/g, '');
    
    // Decode HTML entities
    parsed = parsed.replace(/&nbsp;/g, ' ');
    parsed = parsed.replace(/&amp;/g, '&');
    parsed = parsed.replace(/&lt;/g, '<');
    parsed = parsed.replace(/&gt;/g, '>');
    parsed = parsed.replace(/&quot;/g, '"');
    parsed = parsed.replace(/&#39;/g, "'");
    
    return parsed.trim();
  };

  const parsedContent = parseContent(frontText);

  const CardContent = (
    <>
      {/* Top Bar / Deck Info */}
      <div className="px-3 py-1.5 border-b border-base-300 flex items-center gap-2">
        {/* Current Card Badge or Number Badge */}
        {isCurrentCard ? (
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-primary/20 text-[10px] font-bold text-primary" title="Aktuelle Karte">
            <Star className="w-2.5 h-2.5 fill-primary" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-base-300 text-[10px] font-bold text-base-content/70">
            {index !== undefined && index !== 999 ? index : '#'}
          </div>
        )}
        <span className="text-[10px] font-medium text-base-content/50 truncate" title={deckName}>
          {shortDeck}
        </span>
        {isCurrentCard && (
          <span className="text-[10px] font-semibold text-primary/80 ml-auto">Aktuell</span>
        )}
      </div>

      {/* Content Snippet */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <p 
          className="text-xs font-medium text-base-content/80 line-clamp-3 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parsedContent }}
        />
      </div>
    </>
  );

  // If onClick is provided, render as button, otherwise as div
  // All cards use the same styling (no special blue for current card)
  if (onClick) {
    return (
      <button
        onClick={() => onClick(citation)}
        className="w-full text-left
                   group relative flex flex-col
                   bg-base-200 hover:bg-base-300 border-base-300 hover:border-primary/30
                   rounded-lg border transition-all duration-200
                   hover:shadow-sm overflow-hidden"
      >
        {CardContent}
      </button>
    );
  }

  return (
    <div
      className="w-full
                 group relative flex flex-col
                 bg-base-200 border-base-300
                 rounded-lg border overflow-hidden"
    >
      {CardContent}
    </div>
  );
}

