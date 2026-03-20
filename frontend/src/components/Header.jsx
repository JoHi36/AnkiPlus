import React, { useState, useEffect } from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import SectionDropdown from './SectionDropdown';
import { getDeckMainTitle } from '../utils/deckName';

/**
 * Header Komponente
 * Minimaler Header - zeigt nur Deck-Name und Reset-Button
 * Buch-Button zeigt im Chat-Modus das Inhaltsverzeichnis der Sections
 */
export default function Header({
  currentDeck,
  onNavigateToOverview,
  showSessionOverview = false,
  onReset,
  sections = [],
  onScrollToSection,
  messages = [],
  isResetDisabled = false,
  activeSectionTitle,
  onSectionTitleClick
}) {
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const [animatingTitle, setAnimatingTitle] = useState(activeSectionTitle);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Bestimme Titel basierend auf Deck oder SessionOverview
  let title = 'Anki Chatbot';
  
  if (showSessionOverview) {
    title = 'Sitzungsverlauf';
  } else if (currentDeck && currentDeck.isInDeck && typeof currentDeck.deckName === 'string') {
    // Extrahiere Haupttitel (ohne Pfad)
    title = getDeckMainTitle(currentDeck.deckName);
  }

  // Animation für Section-Titel-Wechsel
  useEffect(() => {
    if (activeSectionTitle !== animatingTitle) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setAnimatingTitle(activeSectionTitle);
        setIsAnimating(false);
      }, 200); // Warte auf Fade-Out
      return () => clearTimeout(timer);
    }
  }, [activeSectionTitle]);

  // Initial set
  useEffect(() => {
    if (!animatingTitle && activeSectionTitle) {
        setAnimatingTitle(activeSectionTitle);
    }
  }, [activeSectionTitle]);

  const handleBookButtonClick = () => {
    if (showSessionOverview) {
      // In Session-Übersicht: Button ist bereits aktiv, nichts tun
      return;
    }
    
    // Im Chat: Toggle Section-Dropdown wenn Sections vorhanden, sonst zur Übersicht
    if (sections.length > 0) {
      setShowSectionDropdown(!showSectionDropdown);
    } else if (onNavigateToOverview) {
      onNavigateToOverview();
    }
  };

  // Bestimme Button-Styling
  const hasActiveSections = !showSessionOverview && sections.length > 0;
  const isButtonActive = showSessionOverview || showSectionDropdown;

  // Debug-Logs
  console.log('📋 Header: activeSectionTitle:', activeSectionTitle);

  return (
    <header className="w-full flex items-center justify-between px-4 py-3 pointer-events-none relative" style={{ backgroundColor: 'var(--ds-bg-canvas)', background: 'var(--ds-bg-canvas)' }}>
      {/* Nebel-Effekt nur innerhalb des Headers - vollständig opak */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: 'var(--ds-bg-canvas)',
          backgroundColor: 'var(--ds-bg-canvas)'
        }}
      />
      
      {/* Content über dem Nebel */}
      <div className="relative w-full flex items-center justify-between z-10">
        {/* Navigation Button - links (nur wenn nicht in Session-Übersicht) */}
        {!showSessionOverview && (
          <div className="relative pointer-events-auto">
            <button
              onClick={handleBookButtonClick}
              className={`w-9 h-9 rounded-lg hover:bg-base-300/80 transition-all duration-300 backdrop-blur-sm flex items-center justify-center overflow-hidden relative ${
                isButtonActive 
                  ? 'text-primary bg-primary/10 border border-primary/20' 
                  : hasActiveSections
                    ? 'text-base-content/70 bg-base-200/30 hover:text-primary'
                    : 'text-base-content/70 bg-base-200/30'
              }`}
              title={sections.length > 0 ? 'Inhaltsverzeichnis' : 'Zur Übersicht'}
            >
              <BookOpen size={18} />
            </button>
            
            {/* Section Dropdown */}
            <SectionDropdown
              sections={sections}
              onScrollToSection={(id) => {
                console.log('📋 Header übergibt Scroll-Request:', id);
                if (onScrollToSection) {
                  onScrollToSection(id);
                } else {
                  console.error('❌ Header: onScrollToSection ist nicht definiert!');
                }
              }}
              isOpen={showSectionDropdown}
              onClose={() => setShowSectionDropdown(false)}
            />
          </div>
        )}
        
        {/* Platzhalter in Session-Übersicht, damit Titel zentriert bleibt */}
        {showSessionOverview && <div className="w-9" />}

        {/* Deck Title & Section Indicator (zentriert) */}
        <div 
          className="flex flex-col items-center gap-1.5 pointer-events-auto mx-auto max-w-[60%]"
        >
          {/* Main Title - Klickbar für Übersicht */}
          <h1 
            className={`font-semibold text-base transition-colors text-base-content whitespace-nowrap overflow-hidden text-ellipsis w-full text-center ${
                !showSessionOverview && onNavigateToOverview ? 'cursor-pointer hover:opacity-80' : ''
            }`}
            onClick={!showSessionOverview && onNavigateToOverview ? () => onNavigateToOverview() : undefined}
          >
            {title}
          </h1>
          
        </div>

        {/* Reset Button - rechts (nur wenn nicht in Session-Übersicht) */}
        {!showSessionOverview && (
          <div className="pointer-events-auto">
            <button
              onClick={onReset}
              disabled={isResetDisabled}
              className={`w-9 h-9 flex items-center justify-center rounded-lg backdrop-blur-sm border transition-all ${
                isResetDisabled
                  ? 'bg-base-200/20 text-base-content/30 cursor-not-allowed border-base-content/5'
                  : 'bg-base-200/30 hover:bg-base-300/50 text-base-content/60 hover:text-base-content border-base-content/5'
              }`}
              title={isResetDisabled ? "Chat bereits zurückgesetzt" : "Chat zurücksetzen"}
            >
              <RotateCcw size={16} className={isResetDisabled ? 'opacity-50' : ''} />
            </button>
          </div>
        )}
        
        {/* Platzhalter in Session-Übersicht, damit Titel zentriert bleibt */}
        {showSessionOverview && <div className="w-9" />}
      </div>
    </header>
  );
}
