import React, { useState, useEffect } from 'react';
import { Trash2, MoreVertical, Sparkles, Clock, Layers, MessageSquare } from 'lucide-react';
import { getDeckMainTitle, getDeckPath } from '../../utils/deckName';
import DeckProgressBar from '../DeckProgressBar';
import { useSessionContext } from '../../contexts/SessionContext';

/**
 * SessionList - Refactored from SessionOverview with null safety
 * Uses SessionContext instead of props drilling
 */
export default function SessionList({ bridge = null, onSelectSession = null }) {
  const { sessions, deleteSessionById } = useSessionContext();
  const [hoveredSession, setHoveredSession] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  
  // #region agent log
  useEffect(() => {
    const timestamp = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionList.jsx:12',message:'SessionList rendered',data:{sessionsCount:sessions.length,sessionsIsArray:Array.isArray(sessions)},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  }, [sessions]);
  // #endregion
  
  // Sort sessions by "last active" (updatedAt or createdAt)
  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt);
    const dateB = new Date(b.updatedAt || b.createdAt);
    return dateB - dateA; // Newest first
  });
  
  const formatDateOrTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);
    
    const diffTime = today - sessionDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Gestern';
    } else {
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
  };
  
  const getSessionDuration = (session) => {
    if (!session.messages || session.messages.length === 0) {
      return null;
    }
    const estimatedMinutes = Math.ceil(session.messages.length * 0.8);
    return estimatedMinutes < 1 ? '< 1m' : `${estimatedMinutes}m`;
  };
  
  const getCardsDiscussedCount = (session) => {
    if (!session.messages || session.messages.length === 0) return 0;
    const uniqueSections = new Set();
    session.messages.forEach(msg => {
      if (msg.sectionId) uniqueSections.add(msg.sectionId);
    });
    return uniqueSections.size;
  };
  
  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    if (window.confirm('Möchtest du diese Sitzung wirklich löschen?')) {
      deleteSessionById(sessionId);
      setActiveMenu(null);
    }
  };
  
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl"></div>
            <div className="relative w-16 h-16 flex items-center justify-center rounded-2xl bg-base-200/50 border border-base-content/5">
              <Sparkles size={32} className="text-primary/60" strokeWidth={1.5} />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-base-content tracking-tight">Keine Sessions vorhanden</h3>
            <p className="text-sm text-base-content/50 leading-relaxed max-w-xs mx-auto">
              Beginne deine Lernreise, indem du ein Deck in Anki öffnest und eine Konversation startest.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full overflow-hidden bg-base-100">
      <div className="flex-1 overflow-y-auto px-0 scrollbar-thin pb-20">
        <div className="space-y-0">
          {sortedSessions.map((session, idx) => {
            // Strict null checks before accessing properties
            if (!session || !session.id) {
              return null; // Skip invalid sessions
            }
            
            const duration = getSessionDuration(session);
            const cardsCount = getCardsDiscussedCount(session);
            const isHovered = hoveredSession === session.id;
            const isMenuOpen = activeMenu === session.id;
            
            // Title and path logic with null safety
            const deckName = session.deckName || session.name || '';
            if (!deckName || typeof deckName !== 'string') {
              // Skip rendering if no valid deck name
              return null;
            }
            
            const mainTitle = getDeckMainTitle(deckName);
            const deckPath = getDeckPath(deckName);
            
            // Format breadcrumbs: "Anki::Medizin" -> "Anki › Medizin"
            const formattedPath = deckPath ? deckPath.replace(/::/g, ' › ') : null;
            
            return (
              <div
                key={session.id}
                className="group relative"
                onMouseEnter={() => setHoveredSession(session.id)}
                onMouseLeave={() => setHoveredSession(null)}
              >
                <button
                  onClick={() => {
                    if (onSelectSession) {
                      onSelectSession(session.id);
                    } else {
                      console.warn('SessionList: onSelectSession not provided');
                    }
                  }}
                  className="w-full text-left p-4 rounded-xl transition-all duration-200 hover:bg-base-200/40 relative border border-transparent hover:border-base-content/5"
                >
                  {/* Header Row: Breadcrumbs + Date */}
                  <div className="flex items-center justify-between gap-4 mb-1.5 min-h-[16px]">
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                      {formattedPath ? (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-base-content/30 truncate">
                          {formattedPath}
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-base-content/30 opacity-50">
                          ROOT
                        </span>
                      )}
                    </div>
                    
                    <span className="text-[10px] font-mono text-base-content/30 shrink-0 mr-6 group-hover:opacity-50 transition-opacity">
                      {formatDateOrTime(session.updatedAt || session.createdAt)}
                    </span>
                  </div>
                  
                  {/* Main Title */}
                  <div className="mb-3 pr-8">
                    <h4 className={`text-lg font-bold text-base-content transition-colors leading-tight truncate ${isHovered ? 'text-primary' : ''}`}>
                      {mainTitle || 'Unbenannte Sitzung'}
                    </h4>
                  </div>
                  
                  {/* Metadata Pills */}
                  <div className="flex items-center gap-2">
                    {duration && (
                      <div className="flex items-center gap-1.5 text-[10px] text-base-content/50 bg-base-300/30 px-2 py-1 rounded-md">
                        <Clock size={10} />
                        <span>{duration}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] text-base-content/50 bg-base-300/30 px-2 py-1 rounded-md">
                      <Layers size={10} />
                      <span>{cardsCount} Themen</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-base-content/50 bg-base-300/30 px-2 py-1 rounded-md">
                      <MessageSquare size={10} />
                      <span>{session.messages?.length || 0}</span>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  {session.deckId && bridge && (
                    <div className="mt-3.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      <DeckProgressBar deckId={session.deckId} bridge={bridge} session={session} />
                    </div>
                  )}
                </button>
                
                {/* Subtle Divider Line */}
                {idx < sortedSessions.length - 1 && (
                  <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-base-content/5 to-transparent" />
                )}
                
                {/* Three Dots Menu */}
                <div className={`absolute top-3 right-3 z-10 transition-opacity duration-300 ${
                  isMenuOpen || isHovered 
                    ? 'opacity-100' 
                    : 'opacity-0'
                }`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(isMenuOpen ? null : session.id);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${isMenuOpen ? 'bg-base-300 text-base-content' : 'hover:bg-base-300/50 text-base-content/40 hover:text-base-content'}`}
                  >
                    <MoreVertical size={16} />
                  </button>
                  
                  {isMenuOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(null);
                        }}
                      />
                      <div className="absolute right-0 top-8 w-40 bg-base-100 border border-base-content/10 shadow-xl rounded-xl overflow-hidden z-20 py-1 animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={(e) => handleDelete(e, session.id)}
                          className="w-full text-left px-3 py-2.5 text-xs font-medium text-error hover:bg-error/10 flex items-center gap-2 transition-colors"
                        >
                          <Trash2 size={14} />
                          <span>Sitzung löschen</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

