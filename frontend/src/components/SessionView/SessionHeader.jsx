import React, { useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, CheckCircle, XCircle } from 'lucide-react';
import SectionNavigation from '../SectionNavigation';
import SectionDropdown from '../SectionDropdown';
import { getDeckMainTitle } from '../../utils/deckName';
import { useSessionContext } from '../../contexts/SessionContext';

/**
 * SessionHeader - Left-aligned Breadcrumb Header
 * New design: [Back] [Deck Title] › [Section Pill] ... [Reset]
 */
export default function SessionHeader({
  onNavigateToOverview,
  showSessionOverview = false,
  onReset,
  sections = [],
  onScrollToSection,
  messages = [],
  isResetDisabled = false,
  activeSectionTitle,
  onSectionTitleClick,
  bridge,
  onOpenSettings
}) {
  const { currentSession } = useSessionContext();
  
  // Strict null checks - prevent ReferenceError
  let title = 'Anki Chatbot';
  
  if (showSessionOverview) {
    title = 'Sitzungsverlauf';
  } else if (currentSession && currentSession.deckName) {
    // Guard clause: ensure deckName exists and is a string
    const deckName = currentSession.deckName;
    if (typeof deckName === 'string' && deckName.trim() !== '') {
      title = getDeckMainTitle(deckName);
    }
  }
  
  const hasActiveSection = !showSessionOverview && !!activeSectionTitle;
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const hasSections = sections.length > 0;
  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    hasToken: false,
    backendUrl: '',
    backendMode: false
  });

  // Auth-Status prüfen
  useEffect(() => {
    if (bridge && bridge.getAuthStatus) {
      const checkAuth = () => {
        try {
          const statusStr = bridge.getAuthStatus();
          if (statusStr) {
            const status = JSON.parse(statusStr);
            setAuthStatus(status);
          }
        } catch (e) {
          console.error('Fehler beim Laden des Auth-Status:', e);
        }
      };
      
      checkAuth();
      // Prüfe alle 30 Sekunden
      const interval = setInterval(checkAuth, 30000);
      return () => clearInterval(interval);
    }
  }, [bridge]);
  
  const handleBookButtonClick = () => {
    if (showSessionOverview) {
      return;
    }
    
    if (hasSections) {
      setShowSectionDropdown(!showSectionDropdown);
    } else if (onNavigateToOverview) {
      onNavigateToOverview();
    }
  };
  
  return (
    <header className="w-full flex items-center px-4 py-3 pointer-events-none bg-base-100 relative">
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: 'linear-gradient(to bottom, #121212 0%, #121212 100%)'
        }}
      />
      
      <div className="relative w-full flex items-center justify-between z-10">
        {/* Left Area - Back Button */}
        <div className="flex-shrink-0 pointer-events-auto">
          {!showSessionOverview && onNavigateToOverview ? (
            <button
              onClick={onNavigateToOverview}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-base-200/30 hover:bg-base-300/50 text-base-content/70 hover:text-base-content transition-all"
              title="Zur Übersicht"
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <div className="w-9" /> // Spacer wenn kein Back Button
          )}
        </div>
        
        {/* Center Area - Deck Title & Section Pill (absolutely centered) */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 pointer-events-auto">
          {/* Deck Title */}
          <h1 
            className={`
              flex-shrink-0
              font-semibold text-lg text-base-content
              whitespace-nowrap
              ${!showSessionOverview && onNavigateToOverview ? 'cursor-pointer hover:opacity-80' : ''}
            `}
            onClick={!showSessionOverview && onNavigateToOverview ? () => onNavigateToOverview() : undefined}
          >
            {title}
          </h1>
          
          {/* Separator - only show when section is active */}
          {hasActiveSection && (
            <span className="flex-shrink-0 text-base-content/30 text-sm mx-0.5">›</span>
          )}
          
          {/* Section Pill - inline in breadcrumb (only text, no icon) */}
          {hasActiveSection && (
            <SectionNavigation
              sections={sections}
              activeSectionTitle={activeSectionTitle}
              onScrollToSection={onScrollToSection}
              onSectionTitleClick={onSectionTitleClick}
              showSessionOverview={showSessionOverview}
              onNavigateToOverview={onNavigateToOverview}
              inlineMode={true}
              showIcon={false}
            />
          )}
        </div>
        
        {/* Right Area - Auth Status, Book Button */}
        <div className="flex-shrink-0 pointer-events-auto relative flex items-center gap-2">
          {!showSessionOverview && (
            <>
              {/* Auth Status Badge */}
              {authStatus.backendMode && onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs backdrop-blur-sm border transition-all ${
                    authStatus.authenticated
                      ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                      : 'bg-error/10 text-error border-error/20 hover:bg-error/20'
                  }`}
                  title={authStatus.authenticated ? 'Verbunden' : 'Nicht verbunden - Klicken zum Verbinden'}
                >
                  {authStatus.authenticated ? (
                    <>
                      <CheckCircle size={12} />
                      <span>Verbunden</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={12} />
                      <span>Nicht verbunden</span>
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={handleBookButtonClick}
                className={`w-9 h-9 flex items-center justify-center rounded-lg backdrop-blur-sm border transition-all ${
                  showSectionDropdown
                    ? 'text-primary bg-primary/10 border-primary/20'
                    : hasSections
                      ? 'bg-base-200/30 hover:bg-base-300/50 text-base-content/70 hover:text-primary border-white/5'
                      : 'bg-base-200/30 hover:bg-base-300/50 text-base-content/60 hover:text-base-content border-white/5'
                }`}
                title={hasSections ? 'Inhaltsverzeichnis' : 'Zur Übersicht'}
              >
                <BookOpen size={18} />
              </button>
              
              {/* Section Dropdown */}
              <SectionDropdown
                sections={sections}
                onScrollToSection={(id) => {
                  if (onScrollToSection) {
                    onScrollToSection(id);
                  }
                }}
                isOpen={showSectionDropdown}
                onClose={() => setShowSectionDropdown(false)}
              />
            </>
          )}
          {showSessionOverview && <div className="w-9" />}
        </div>
      </div>
    </header>
  );
}

