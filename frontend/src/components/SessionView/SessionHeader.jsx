import React, { useState, useEffect } from 'react';
import { ChevronLeft, BookOpen, CheckCircle, XCircle, User } from 'lucide-react';
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
  const [quotaStatus, setQuotaStatus] = useState(null);

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
      // Prüfe häufiger wenn nicht verbunden (für Clipboard-Monitoring)
      const interval = setInterval(checkAuth, authStatus.authenticated ? 30000 : 2000);
      return () => clearInterval(interval);
    }
  }, [bridge, authStatus.authenticated]);
  
  // Höre auf auth_success Events
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.detail && event.detail.type === 'auth_success') {
        // Aktualisiere Status sofort
        if (bridge && bridge.getAuthStatus) {
          try {
            const statusStr = bridge.getAuthStatus();
            if (statusStr) {
              const status = JSON.parse(statusStr);
              setAuthStatus(status);
            }
          } catch (e) {
            console.error('Fehler beim Laden des Auth-Status:', e);
          }
        }
      } else if (event.detail && event.detail.type === 'refreshAuthStatus') {
        // Manueller Refresh
        if (bridge && bridge.getAuthStatus) {
          try {
            const statusStr = bridge.getAuthStatus();
            if (statusStr) {
              const status = JSON.parse(statusStr);
              setAuthStatus(status);
            }
          } catch (e) {
            console.error('Fehler beim Laden des Auth-Status:', e);
          }
        }
      }
    };
    
    window.addEventListener('ankiMessage', handleMessage);
    return () => window.removeEventListener('ankiMessage', handleMessage);
  }, [bridge]);

  // Fetch quota status
  useEffect(() => {
    if (!authStatus.authenticated || !authStatus.backendUrl || !bridge) {
      setQuotaStatus(null);
      return;
    }

    const fetchQuota = async () => {
      try {
        // Get auth token - we need to call the backend endpoint
        // For now, we'll skip this as it requires async token retrieval
        // This can be enhanced later with proper token management
        // Backend-URL ist die Cloud Function Base-URL, Express-Routen haben kein /api/ Präfix
        const response = await fetch(`${authStatus.backendUrl}/user/quota`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setQuotaStatus(data);
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
      }
    };

    fetchQuota();
    // Refresh every 60 seconds
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [authStatus.authenticated, authStatus.backendUrl, bridge]);
  
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
          
          {/* Quota Badge - Show Deep Requests if limited */}
          {quotaStatus && quotaStatus.deep.limit !== -1 && (
            <div 
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                quotaStatus.deep.remaining === 0 
                  ? 'bg-error/10 text-error' 
                  : quotaStatus.deep.remaining <= quotaStatus.deep.limit * 0.2
                  ? 'bg-warning/10 text-warning'
                  : 'bg-base-content/10 text-base-content/70'
              }`}
              title={`Deep Requests: ${quotaStatus.deep.used}/${quotaStatus.deep.limit} (${quotaStatus.deep.remaining} verbleibend)`}
            >
              <span>Deep: {quotaStatus.deep.used}/{quotaStatus.deep.limit}</span>
            </div>
          )}
          
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
          {showSessionOverview && (
            <>
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs backdrop-blur-sm border transition-all ${
                    authStatus.authenticated
                      ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                      : 'bg-base-300/50 text-base-content/70 border-base-300 hover:bg-base-300'
                  }`}
                  title={authStatus.authenticated ? 'Profil öffnen' : 'Profil öffnen - Nicht verbunden'}
                >
                  <User size={12} />
                  <span>Profil</span>
                  {authStatus.authenticated && (
                    <CheckCircle size={10} className="text-success" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

