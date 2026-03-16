import React from 'react';
import { Star } from 'lucide-react';

/**
 * RealSourceCard Component
 * Reusable card component for displaying citation/source information
 * Adaptiert für Landingpage Demo
 */
export default function RealSourceCard({ citation, index, isCurrentCard = false, onClick }: any) {
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
  const parseContent = (text: string) => {
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
      <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-2">
        {/* Current Card Badge or Number Badge */}
        {isCurrentCard ? (
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-teal-500/20 text-[10px] font-bold text-teal-500" title="Aktuelle Karte">
            <Star className="w-2.5 h-2.5 fill-teal-500" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-[#333] text-[10px] font-bold text-white/70">
            {index !== undefined && index !== 999 ? index : '#'}
          </div>
        )}
        <span className="text-[10px] font-medium text-white/50 truncate" title={deckName}>
          {shortDeck}
        </span>
        {isCurrentCard && (
          <span className="text-[10px] font-semibold text-teal-500/80 ml-auto">Aktuell</span>
        )}
      </div>

      {/* Content Snippet */}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <p 
          className="text-xs font-medium text-white/80 line-clamp-3 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parsedContent }}
        />
      </div>
    </>
  );

  // If onClick is provided, render as button, otherwise as div
  if (onClick) {
    return (
      <button
        onClick={() => onClick(citation)}
        className="w-full text-left
                   group relative flex flex-col
                   bg-[#151515] hover:bg-[#222] border-white/10 hover:border-teal-500/30
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
                 bg-[#151515] border-white/10
                 rounded-lg border overflow-hidden"
    >
      {CardContent}
    </div>
  );
}
