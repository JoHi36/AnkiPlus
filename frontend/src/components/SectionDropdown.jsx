import React, { useEffect, useRef } from 'react';
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react';

/**
 * SectionDropdown Komponente
 * Zeigt ein Dropdown-Menü mit allen Chat-Abschnitten (Sections)
 * Ermöglicht Navigation zu einzelnen Abschnitten
 */
export default function SectionDropdown({ 
  sections, 
  onScrollToSection, 
  isOpen, 
  onClose 
}) {
  const dropdownRef = useRef(null);

  // Schließe Dropdown bei Klick außerhalb
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      // WICHTIG: Prüfe ob der Click auf einen Button innerhalb des Dropdowns war
      const clickedButton = event.target.closest('button');
      if (clickedButton && dropdownRef.current && dropdownRef.current.contains(clickedButton)) {
        // Click war auf einem Button im Dropdown - NICHT schließen!
        // Der Button's onClick wird das Dropdown schließen
        return;
      }
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    // Verwende 'click' statt 'mousedown' für bessere Kompatibilität
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true); // capture phase
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isOpen, onClose]);

  // Schließe bei Escape-Taste
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Debug: Log wenn Dropdown gerendert wird
  useEffect(() => {
    if (isOpen) {
    }
  }, [isOpen, sections.length]);

  if (!isOpen) return null;

  const handleSectionClick = (e, sectionId) => {
    e.preventDefault();
    e.stopPropagation();
    
    
    // Scrolle ZUERST
    if (onScrollToSection) {
      try {
        onScrollToSection(sectionId);
      } catch (error) {
      }
    } else {
    }
    
    // Dann schließe das Dropdown
    setTimeout(() => {
      onClose();
    }, 50);
  };

  return (
    <div 
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 w-72 bg-base-200/95 backdrop-blur-xl border border-base-300/50 rounded-xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto"
      style={{
        boxShadow: 'var(--ds-shadow-lg), 0 0 0 1px var(--ds-border-subtle)'
      }}
      onClick={(e) => {
        // Debug: Log wenn Dropdown geklickt wird
      }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-base-300/30 bg-base-300/20">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-primary/70" />
          <span className="text-sm font-semibold text-base-content/80">
            Inhaltsverzeichnis
          </span>
        </div>
      </div>

      {/* Sections Liste */}
      <div className="max-h-[50vh] overflow-y-auto py-2 scrollbar-thin">
        {sections.length === 0 ? (
          <div className="px-4 py-6 text-center text-base-content/40">
            <BookOpen size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Noch keine Abschnitte</p>
            <p className="text-xs mt-1">Starte eine Konversation zu einer Lernkarte</p>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {sections.map((section, idx) => {
              const isLoading = section.title === "Lade Titel...";
              
              return (
                <button
                  key={section.id}
                  onClick={(e) => {
                    handleSectionClick(e, section.id);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseUp={(e) => {
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 group hover:bg-primary/10 hover:border-primary/20 border border-transparent pointer-events-auto cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                >
                  <div className="flex items-center gap-3">
                    {/* Nummer */}
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-base-300/50 flex items-center justify-center text-xs font-medium text-base-content/50 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                      {idx + 1}
                    </div>
                    
                    {/* Titel */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isLoading ? (
                          <>
                            <Loader2 size={12} className="animate-spin text-primary/50" />
                            <span className="text-sm text-base-content/40 italic">
                              Generiere Titel...
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-base-content/80 group-hover:text-base-content truncate font-medium">
                            {typeof section.title === 'string' ? section.title : `Abschnitt ${idx + 1}`}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Pfeil */}
                    <ChevronRight 
                      size={14} 
                      className="flex-shrink-0 text-base-content/20 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" 
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Footer Hinweis */}
      {sections.length > 0 && (
        <div className="px-4 py-2 border-t border-base-300/30 bg-base-300/10">
          <p className="text-xs text-base-content/30 text-center">
            Klicke auf einen Abschnitt, um dorthin zu springen
          </p>
        </div>
      )}
    </div>
  );
}

