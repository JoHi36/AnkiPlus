import React from 'react';

/**
 * SourceCard Component
 * Reusable card component for displaying citation/source information
 * Used in SourcesCarousel and CitationBadge tooltip
 */

export interface Citation {
  noteId?: string | number;
  cardId?: string | number;
  id?: string | number;
  deckName?: string;
  front?: string;
  sources?: string[];
  fields?: Record<string, string>;
  [key: string]: any;
}

export interface SourceCardProps {
  citation: Citation;
  index?: number;
  onClick?: (citation: Citation) => void;
}

export default function SourceCard({ citation, index, onClick }: SourceCardProps) {
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
  const parseContent = (text: string): string => {
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

  // Badge color based on source type
  const sources = citation.sources || [];
  const isBoth = sources.length > 1;
  const isKeyword = !isBoth && sources.includes('keyword');
  const isSemantic = !isBoth && sources.includes('semantic');
  const badgeStyle: React.CSSProperties = isBoth
    ? { background: 'rgba(255,180,50,0.25)', color: 'rgba(255,200,80,0.9)' }
    : isKeyword
      ? { background: 'rgba(10,132,255,0.2)', color: 'rgba(80,170,255,0.9)' }
      : isSemantic
        ? { background: 'rgba(20,184,166,0.2)', color: 'rgba(80,220,200,0.9)' }
        : { background: 'var(--fallback-b3,oklch(var(--b3)/1))' };

  const CardContent = (
    <>
      {/* Top Bar / Deck Info */}
      <div className="px-3 py-1.5 border-b border-base-300 flex items-center gap-2">
        {/* Number Badge — colored by source type */}
        <div
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
          style={badgeStyle}
        >
          {index !== undefined && index !== 999 ? index : '#'}
        </div>
        <span className="text-[10px] font-medium text-base-content/50 truncate" title={deckName}>
          {shortDeck}
        </span>
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
        {/* Dual-source star badge */}
        {citation.sources && citation.sources.length > 1 && (
          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
               style={{ background: '#121212' }}>
            <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
              <path d="M6 1l1.5 3 3.5.5-2.5 2.4.6 3.5L6 8.9 2.9 10.4l.6-3.5L1 4.5 4.5 4z"
                    fill="rgba(255,180,50,0.7)"/>
            </svg>
          </div>
        )}
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
      {/* Dual-source star badge */}
      {citation.sources && citation.sources.length > 1 && (
        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
             style={{ background: '#121212' }}>
          <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
            <path d="M6 1l1.5 3 3.5.5-2.5 2.4.6 3.5L6 8.9 2.9 10.4l.6-3.5L1 4.5 4.5 4z"
                  fill="rgba(255,180,50,0.7)"/>
          </svg>
        </div>
      )}
      {CardContent}
    </div>
  );
}
