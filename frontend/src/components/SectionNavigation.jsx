import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import SectionDropdown from './SectionDropdown';

/**
 * SectionNavigation - Compact Section Pill for Breadcrumb Header
 * 
 * Inline Mode: Always shows as compact pill [Icon] [Section Title]
 * Split-Button Behavior:
 * - Left Zone (Icon): Opens TOC dropdown
 * - Right Zone (Text): Navigates to Anki card or scrolls to section
 */
export default function SectionNavigation({
  sections = [],
  activeSectionTitle = null,
  onScrollToSection,
  onSectionTitleClick,
  showSessionOverview = false,
  onNavigateToOverview,
  inlineMode = false, // When true, always shows as compact pill (no expand/collapse)
  showIcon = true // When false, hides icon and divider (for inline mode with external icon)
}) {
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(activeSectionTitle);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scrollDirection, setScrollDirection] = useState('down');
  const prevTitleRef = useRef(activeSectionTitle);
  const scrollPositionRef = useRef(0);

  // Initialize displayTitle if it's null but activeSectionTitle is set
  useEffect(() => {
    if (displayTitle === null && activeSectionTitle !== null && !isAnimating) {
      setDisplayTitle(activeSectionTitle);
    }
  }, [activeSectionTitle, displayTitle, isAnimating]);

  // Sync displayTitle with activeSectionTitle when not animating
  useEffect(() => {
    if (!isAnimating && activeSectionTitle !== displayTitle && activeSectionTitle !== null) {
      setDisplayTitle(activeSectionTitle);
    }
  }, [activeSectionTitle, isAnimating]);

  const hasActiveSection = !showSessionOverview && !!activeSectionTitle;
  const hasSections = sections.length > 0;

  // Track scroll direction for animation
  useEffect(() => {
    const container = document.getElementById('messages-container') || 
                     document.querySelector('[data-messages-container]') || 
                     document.querySelector('.overflow-y-auto');
    
    if (!container) return;
    
    const handleScroll = () => {
      const currentScroll = container.scrollTop;
      const direction = currentScroll > scrollPositionRef.current ? 'down' : 'up';
      setScrollDirection(direction);
      scrollPositionRef.current = currentScroll;
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle title changes with slide animation
  useEffect(() => {
    if (activeSectionTitle !== displayTitle) {
      if (activeSectionTitle === null) {
        // If title becomes null, just update without animation
        setDisplayTitle(null);
        setIsAnimating(false);
      } else if (displayTitle !== null) {
        // Only animate if we have a previous title
        prevTitleRef.current = displayTitle;
        setIsAnimating(true);
        // Update title immediately so new text is visible
        setDisplayTitle(activeSectionTitle);
        
        // Animation duration: 150ms
        setTimeout(() => {
          setIsAnimating(false);
        }, 150);
      } else {
        // No previous title, just set it without animation
        setDisplayTitle(activeSectionTitle);
        setIsAnimating(false);
      }
    } else {
      // Ensure text is visible when not animating
      setIsAnimating(false);
    }
  }, [activeSectionTitle, displayTitle, scrollDirection]);

  const handleIconClick = (e) => {
    e.stopPropagation();
    if (showSessionOverview) {
      return;
    }
    
    if (hasSections) {
      setShowSectionDropdown(!showSectionDropdown);
    } else if (onNavigateToOverview) {
      onNavigateToOverview();
    }
  };

  const handleTextClick = (e) => {
    e.stopPropagation();
    // In inline mode, clicking text scrolls to section in chat
    if (inlineMode && onScrollToSection && activeSectionTitle) {
      // Find section by title and scroll to it
      const section = sections.find(s => s.title === activeSectionTitle);
      if (section) {
        onScrollToSection(section.id);
      }
    } else if (onSectionTitleClick) {
      onSectionTitleClick();
    }
  };

  const isButtonActive = showSectionDropdown;
  const isExpanded = inlineMode ? hasActiveSection : hasActiveSection; // In inline mode, always expanded when active

  return (
    <div className="relative pointer-events-auto">
      {/* Compact Pill Container - always visible when active in inline mode */}
      <div
        className={`
          flex items-center
          rounded-lg
          transition-all duration-300 ease-out
          ${isExpanded 
            ? 'bg-base-200/60 backdrop-blur-md border border-base-content/5 shadow-sm px-2 py-1' 
            : 'bg-transparent'
          }
        `}
        style={{
          width: inlineMode ? 'auto' : (isExpanded ? 'auto' : '36px'),
          minWidth: inlineMode ? 'auto' : '36px',
          maxWidth: inlineMode ? '240px' : (isExpanded ? '280px' : '36px'),
          transition: inlineMode ? 'background-color 300ms ease-out, border-color 300ms ease-out' : 'width 300ms ease-out, background-color 300ms ease-out, border-color 300ms ease-out, box-shadow 300ms ease-out'
        }}
      >
        {/* Section Title - only content in pill when showIcon is false */}
        {isExpanded && (
          <div className="relative min-w-0 overflow-hidden" style={{ minHeight: '20px', display: 'flex', alignItems: 'center' }}>
            {/* Old title sliding out */}
            {isAnimating && prevTitleRef.current && prevTitleRef.current !== displayTitle && (
              <button
                onClick={handleTextClick}
                className={`
                  absolute inset-0
                  flex items-center gap-1.5
                  rounded-lg
                  transition-all duration-150 ease-out
                  group/text
                  min-w-0
                  ${scrollDirection === 'down' 
                    ? 'opacity-0 transform translate-y-full' 
                    : 'opacity-0 transform -translate-y-full'
                  }
                `}
                title={inlineMode ? "Zum Abschnitt scrollen" : "Zur Lernkarte springen"}
              >
                <span className="text-xs font-medium truncate transition-colors duration-200 text-base-content/60 group-hover/text:text-primary">
                  {prevTitleRef.current}
                </span>
                {!inlineMode && (
                  <ExternalLink 
                    size={12} 
                    className="flex-shrink-0 text-base-content/20 group-hover/text:text-primary/60 transition-all duration-200 opacity-0 group-hover/text:opacity-100 transform translate-x-[-4px] group-hover/text:translate-x-0"
                  />
                )}
              </button>
            )}
            {/* New title sliding in */}
            <button
              onClick={handleTextClick}
              className={`
                ${isAnimating ? 'absolute inset-0' : 'relative w-full'}
                flex items-center gap-1.5
                rounded-lg
                transition-all duration-150 ease-out
                group/text
                min-w-0
                ${isAnimating 
                  ? scrollDirection === 'down' 
                    ? 'opacity-100 transform translate-y-0' 
                    : 'opacity-100 transform translate-y-0'
                  : 'opacity-100 transform translate-y-0'
                }
              `}
              style={isAnimating && scrollDirection === 'down' ? {
                transform: 'translateY(100%)',
                animation: 'slideInFromBottom 150ms ease-out forwards'
              } : isAnimating && scrollDirection === 'up' ? {
                transform: 'translateY(-100%)',
                animation: 'slideInFromTop 150ms ease-out forwards'
              } : {}}
              title={inlineMode ? "Zum Abschnitt scrollen" : "Zur Lernkarte springen"}
            >
              <span 
                className={`
                  text-xs font-medium
                  truncate
                  transition-colors duration-200
                  ${displayTitle === "Lade Titel..." 
                    ? 'text-base-content/40 italic' 
                    : 'text-base-content/60 group-hover/text:text-primary'
                  }
                `}
              >
                {displayTitle === "Lade Titel..." ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 border-2 border-base-content/20 border-t-primary/50 rounded-full animate-spin" />
                    <span>Generiere...</span>
                  </span>
                ) : (
                  displayTitle || 'Abschnitt'
                )}
              </span>
              
              {/* External Link Icon - appears on hover (only in non-inline mode) */}
              {!inlineMode && (
                <ExternalLink 
                  size={12} 
                  className={`
                    flex-shrink-0
                    text-base-content/20
                    group-hover/text:text-primary/60
                    transition-all duration-200
                    opacity-0 group-hover/text:opacity-100
                    transform translate-x-[-4px] group-hover/text:translate-x-0
                  `}
                />
              )}
            </button>
          </div>
        )}

        {/* Icon and Divider - only show if showIcon is true */}
        {showIcon && (
          <>
            {/* Vertical Divider - only visible when expanded */}
            {isExpanded && (
              <div
                className="flex-shrink-0 w-px h-4 bg-base-content/10 mx-1.5"
                style={{ opacity: 0.15 }}
              />
            )}

            {/* Right Zone - Icon Button */}
            <button
              onClick={handleIconClick}
              className={`
                flex-shrink-0
                ${inlineMode ? 'w-7 h-7' : 'w-9 h-9'}
                flex items-center justify-center
                rounded-lg
                transition-all duration-300
                relative
                group/icon
                ${isExpanded ? 'rounded-l-none' : 'rounded-lg'}
                ${isButtonActive
                  ? 'text-primary bg-primary/10 border border-primary/20'
                  : hasSections
                    ? 'text-base-content/70 bg-base-200/30 hover:text-primary hover:bg-primary/5'
                    : 'text-base-content/70 bg-base-200/30 hover:bg-base-300/50'
                }
              `}
              title={hasSections ? 'Inhaltsverzeichnis' : 'Zur Übersicht'}
            >
              <BookOpen 
                size={inlineMode ? 14 : 18} 
                className={`
                  transition-all duration-300
                  ${isButtonActive ? 'scale-110' : 'group-hover/icon:scale-110'}
                `}
              />
              {/* Glow effect on hover */}
              <div className="absolute inset-0 rounded-lg bg-primary/0 group-hover/icon:bg-primary/10 transition-all duration-300 blur-sm -z-10" />
            </button>
          </>
        )}
      </div>

      {/* Section Dropdown - only show if icon is in pill */}
      {!showSessionOverview && showIcon && (
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
      )}
    </div>
  );
}

