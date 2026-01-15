import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Lightbulb, List, EyeOff, Eye, Brain, Sparkles, Search, Zap, Toolbox, BrainCircuit } from 'lucide-react';
import ToolTogglePopup from './ToolTogglePopup';
import { useQuotaDisplay } from '../hooks/useQuotaDisplay';
import QuotaLimitDialog from './QuotaLimitDialog';

/**
 * ChatInput Komponente - Toggle Button für Kompakt/Ausführlich Modus
 * - Toggle-Button ersetzt Modellauswahl
 * - Command-L Shortcut zum Umschalten
 * - Auto-Reset nach Senden
 */
export default function ChatInput({ 
  onSend, 
  onOpenSettings, 
  isLoading, 
  onStop,
  cardContext,
  onRequestHint,
  onRequestMultipleChoice,
  onToggleCardState,
  bridge,
  isPremium = false,
  onShowPaywall,
  onResetPremium,
  authStatus = {},
  currentAuthToken = ''
}) {
  const [input, setInput] = useState('');
  const [isDetailedMode, setIsDetailedMode] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showToolPopup, setShowToolPopup] = useState(false);
  const [aiTools, setAiTools] = useState({
    images: true,
    diagrams: true,
    molecules: false
  });
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [showQuotaLimitDialog, setShowQuotaLimitDialog] = useState(false);

  const isQuestion = cardContext?.isQuestion !== false;
  
  // Quota-Anzeige
  const quotaDisplay = useQuotaDisplay(bridge, authStatus, currentAuthToken, isDetailedMode);
  
  // Ref für vorherigen Premium-Status (um Unlock zu erkennen)
  const prevPremiumRef = useRef(isPremium);

  // Farbschemata - Immer Standardfarbe (primary), Modus wird nur durch Icons angezeigt
  const currentTheme = { 
    border: 'border-base-300', 
    focus: 'border-primary/60', 
    text: 'text-primary', 
    bg: 'bg-primary', 
    bgLight: 'bg-primary/10' 
  };
  
  // Automatisch auf DEEP umschalten, wenn Premium freigeschaltet wird
  useEffect(() => {
    if (isPremium && !prevPremiumRef.current && !isDetailedMode) {
      // Premium wurde gerade freigeschaltet und wir sind noch nicht im DEEP-Modus
      setIsDetailedMode(true);
    }
    prevPremiumRef.current = isPremium;
  }, [isPremium, isDetailedMode]);

  // Auto-Grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 200;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Lade AI Tools beim Mount
  useEffect(() => {
    if (bridge && bridge.getAITools) {
      const toolsJson = bridge.getAITools();
      try {
        const tools = JSON.parse(toolsJson);
        if (tools && typeof tools === 'object') {
          setAiTools(tools);
        }
      } catch (e) {
        console.warn('Fehler beim Laden der AI Tools:', e);
      }
    }
  }, [bridge]);

  // Command-L Shortcut für Toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prüfe ob Command (Mac) oder Ctrl (Windows/Linux) + L gedrückt
      const isModifierPressed = e.metaKey || e.ctrlKey;
      if (isModifierPressed && (e.key === 'l' || e.key === 'L')) {
        // Verhindere Default (z.B. Adressleiste öffnen)
        e.preventDefault();
        // Toggle Modus mit Premium-Check
        if (isDetailedMode) {
          // FLASH-Modus: Immer erlaubt
          setIsDetailedMode(false);
        } else {
          // DEEP-Modus: Nur wenn Premium
          if (isPremium) {
            setIsDetailedMode(true);
          } else {
            // Zeige Paywall
            if (onShowPaywall) {
              onShowPaywall();
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDetailedMode, isPremium, onShowPaywall]);

  // Handler für Tool-Änderungen
  const handleToolsChange = (newTools) => {
    setAiTools(newTools);
    if (bridge && bridge.saveAITools) {
      bridge.saveAITools(JSON.stringify(newTools));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (text) {
      // Prüfe Quota vor dem Senden
      if (quotaDisplay && !quotaDisplay.isUnlimited) {
        const limit = typeof quotaDisplay.limit === 'string' ? Infinity : quotaDisplay.limit;
        
        if (quotaDisplay.used >= limit) {
          // Limit erreicht - zeige Dialog
          setShowQuotaLimitDialog(true);
          return;
        }
      }
      
      const mode = isDetailedMode ? 'detailed' : 'compact';
      onSend(text, { mode });
      setInput('');
      setIsDetailedMode(false); // Auto-Reset nach Senden
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getPlaceholder = () => {
    if (cardContext) return isQuestion ? 'Deine Antwort...' : 'Stelle eine Frage...';
    return "Was willst du lernen?";
  };

  return (
    <div className="w-full relative">
        <form 
          ref={containerRef}
          onSubmit={handleSubmit}
          className={`relative bg-base-200/95 backdrop-blur-xl border rounded-2xl transition-all duration-300 ${
            isFocused
              ? currentTheme.focus
              : `${currentTheme.border} hover:border-base-content/20`
          }`}
        >
          {/* Input Area */}
          <div className="px-4 pt-4 pb-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={getPlaceholder()}
              rows="1"
              className="w-full min-h-[44px] max-h-[200px] bg-transparent text-base-content text-[15px] resize-none outline-none leading-relaxed placeholder:text-base-content/40 overflow-visible"
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-base-300/50 gap-3">
            
            {/* Left: Tool Toggle + Kompakt/Ausführlich Toggle */}
            <div className="flex items-center gap-1">
              {/* Tool Toggle Button */}
              <button
                type="button"
                onClick={() => setShowToolPopup(!showToolPopup)}
                className={`flex items-center justify-center py-1.5 px-2 rounded-lg transition-all ${
                  showToolPopup
                    ? 'text-blue-500'
                    : 'text-base-content/40 hover:text-base-content/70'
                }`}
                title="Agent Tools"
              >
                <Toolbox size={16} strokeWidth={2} className={showToolPopup ? "text-blue-500" : "currentColor"} />
              </button>

              {/* Vertikale Trennlinie */}
              <div className="h-4 w-px bg-base-content/10 mx-1" />

              {/* Toggle Button für FLASH/DEEP */}
              <button
                type="button"
                onClick={() => {
                  if (isDetailedMode) {
                    // FLASH-Modus: Immer erlaubt
                    setIsDetailedMode(false);
                  } else {
                    // DEEP-Modus: Nur wenn Premium
                    if (isPremium) {
                      setIsDetailedMode(true);
                    } else {
                      // Zeige Paywall
                      if (onShowPaywall) {
                        onShowPaywall();
                      }
                    }
                  }
                }}
                onMouseDown={(e) => {
                  // Long Press nur auf FLASH Button (nicht im DEEP Modus)
                  if (!isDetailedMode && onResetPremium) {
                    setLongPressProgress(0);
                    const startTime = Date.now();
                    const duration = 3000; // 3 Sekunden
                    const interval = 50; // Update alle 50ms
                    
                    longPressTimerRef.current = setInterval(() => {
                      const elapsed = Date.now() - startTime;
                      const progress = Math.min((elapsed / duration) * 100, 100);
                      setLongPressProgress(progress);
                      
                      if (elapsed >= duration) {
                        // Long Press abgeschlossen - Reset Premium
                        clearInterval(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                        setLongPressProgress(0);
                        if (onResetPremium) {
                          onResetPremium();
                        }
                      }
                    }, interval);
                  }
                }}
                onMouseUp={() => {
                  // Long Press abgebrochen
                  if (longPressTimerRef.current) {
                    clearInterval(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                    setLongPressProgress(0);
                  }
                }}
                onMouseLeave={() => {
                  // Long Press abgebrochen wenn Maus verlässt
                  if (longPressTimerRef.current) {
                    clearInterval(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                    setLongPressProgress(0);
                  }
                }}
                onTouchStart={(e) => {
                  // Long Press nur auf FLASH Button (nicht im DEEP Modus)
                  if (!isDetailedMode && onResetPremium) {
                    setLongPressProgress(0);
                    const startTime = Date.now();
                    const duration = 3000; // 3 Sekunden
                    const interval = 50; // Update alle 50ms
                    
                    longPressTimerRef.current = setInterval(() => {
                      const elapsed = Date.now() - startTime;
                      const progress = Math.min((elapsed / duration) * 100, 100);
                      setLongPressProgress(progress);
                      
                      if (elapsed >= duration) {
                        // Long Press abgeschlossen - Reset Premium
                        clearInterval(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                        setLongPressProgress(0);
                        if (onResetPremium) {
                          onResetPremium();
                        }
                      }
                    }, interval);
                  }
                }}
                onTouchEnd={() => {
                  // Long Press abgebrochen
                  if (longPressTimerRef.current) {
                    clearInterval(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                    setLongPressProgress(0);
                  }
                }}
                className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all tracking-wide ${
                  isDetailedMode
                    ? 'text-teal-400 bg-gradient-to-r from-teal-500/10 to-emerald-500/5 border border-teal-500/30 shadow-lg shadow-teal-500/20'
                    : 'text-base-content/40 hover:text-base-content/70'
                }`}
                title={isDetailedMode ? "DEEP (⌘L zum Umschalten)" : "FLASH (⌘L zum Umschalten - 3s Long Press zum Reset)"}
              >
                {/* Long Press Progress Bar */}
                {longPressProgress > 0 && !isDetailedMode && (
                  <div className="absolute inset-0 rounded-lg bg-teal-500/20 overflow-hidden">
                    <div 
                      className="h-full bg-teal-500/40 transition-all duration-50"
                      style={{ width: `${longPressProgress}%` }}
                    />
                  </div>
                )}
                {isDetailedMode ? (
                  <>
                    <BrainCircuit size={14} className="text-teal-400 relative z-10" />
                    <span className="relative z-10">DEEP</span>
                    {quotaDisplay && (
                      <span className={`ml-1.5 text-[10px] font-medium relative z-10 ${
                        quotaDisplay.isUnlimited 
                          ? 'text-teal-400' 
                          : quotaDisplay.used >= (typeof quotaDisplay.limit === 'string' ? Infinity : quotaDisplay.limit)
                            ? 'text-red-400'
                            : 'text-teal-400/70'
                      }`}>
                        {quotaDisplay.used} / {quotaDisplay.limit}
                      </span>
                    )}
                    <span className="flex items-center justify-center ml-1.5 min-w-[28px] h-5 px-1.5 text-[10px] bg-teal-500/10 text-teal-400 rounded border border-teal-500/20 font-bold relative z-10">⌘L</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} className="currentColor relative z-10" />
                    <span className="relative z-10">FLASH</span>
                    {quotaDisplay && (
                      <span className={`ml-1.5 text-[10px] font-medium relative z-10 ${
                        quotaDisplay.isUnlimited 
                          ? 'text-base-content/50' 
                          : quotaDisplay.used >= (typeof quotaDisplay.limit === 'string' ? Infinity : quotaDisplay.limit)
                            ? 'text-red-400'
                            : 'text-base-content/50'
                      }`}>
                        {quotaDisplay.used} / {quotaDisplay.limit}
                      </span>
                    )}
                    <span className="flex items-center justify-center ml-1.5 min-w-[28px] h-5 px-1.5 text-[10px] bg-base-300 text-base-content/50 rounded border border-base-content/10 font-bold relative z-10">⌘L</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex-1" />

            {/* 2. & 3. FUSION BLOCK: Quick Actions + Send Button */}
            <div className="flex items-center rounded-full pl-1 pr-1 py-1 gap-1 border border-primary/20 bg-primary/10 transition-colors duration-300">
              
              {/* Status & Actions */}
              {cardContext && (
                  <>
                    {/* Status Toggle Button */}
                    <button
                        type="button"
                        onClick={onToggleCardState}
                        className="w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 bg-primary/20 text-primary hover:bg-primary/30"
                        title={isQuestion ? "Verdeckt (Klicken zum Aufdecken)" : "Offen (Klicken zum Verdecken)"}
                    >
                        {isQuestion ? <EyeOff size={14} strokeWidth={2.5} /> : <Eye size={14} strokeWidth={2.5} />}
                    </button>

                    <div className="h-4 w-px mx-0.5 bg-primary/20" />

                    {/* Quick Actions */}
                    {isQuestion ? (
                        <>
                            <button
                                type="button"
                                onClick={() => onSend("Gib mir einen Hinweis, ohne die Antwort zu verraten.", { mode: 'compact' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-primary/20 text-primary/70 hover:text-primary transition-all duration-200"
                                title="Hinweis anfordern"
                            >
                                <Lightbulb size={15} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onSend("Erstelle ein Multiple Choice Quiz zu dieser Karte.", { mode: 'compact' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-primary/20 text-primary/70 hover:text-primary transition-all duration-200"
                                title="Quiz erstellen"
                            >
                                <List size={15} strokeWidth={2.5} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => onSend("Erkläre mir die Konzepte auf dieser Karte genauer.", { mode: 'detailed' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-primary/20 text-primary/70 hover:text-primary transition-all duration-200"
                                title="Konzepte erklären (ausführlich)"
                            >
                                <Brain size={15} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onSend("Gib mir eine Eselsbrücke für diese Karte.", { mode: 'compact' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-primary/20 text-primary/70 hover:text-primary transition-all duration-200"
                                title="Eselsbrücke"
                            >
                                <Sparkles size={15} strokeWidth={2.5} />
                            </button>
                        </>
                    )}
                  </>
              )}

              {cardContext && (
                  <div className="h-5 w-px mx-1 bg-primary/20" />
              )}

              {/* Send Button */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center justify-center w-8 h-8 bg-error/10 hover:bg-error/20 text-error rounded-full transition-all duration-200"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={`flex items-center justify-center w-8 h-8 rounded-full shadow-sm transition-all duration-200 ${
                    input.trim()
                      ? 'bg-primary text-white hover:bg-primary/90 hover:scale-105'
                      : 'bg-base-200/50 cursor-not-allowed border border-base-content/5'
                  }`}
                >
                  {/* Arrow Icon Color Logic */}
                  <ArrowUp 
                    size={18} 
                    strokeWidth={3} 
                    className={
                        input.trim() 
                            ? 'text-white' // White when typing
                            : 'text-base-content/30' // Neutral when empty
                    }
                  />
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Tool Toggle Popup - positioned relative to form */}
        {showToolPopup && (
          <div className="absolute bottom-full left-0 mb-2 z-50">
            <ToolTogglePopup
              isOpen={showToolPopup}
              onClose={() => setShowToolPopup(false)}
              tools={aiTools}
              onToolsChange={handleToolsChange}
              bridge={bridge}
            />
          </div>
        )}
    </div>
    
    {/* Quota Limit Dialog */}
    <QuotaLimitDialog
      isOpen={showQuotaLimitDialog}
      onClose={() => setShowQuotaLimitDialog(false)}
      onEnterCode={() => {
        setShowQuotaLimitDialog(false);
        if (onOpenSettings) onOpenSettings();
      }}
      onOpenWebsite={() => {
        const url = 'https://anki-plus.vercel.app';
        if (bridge && bridge.openUrl) {
          bridge.openUrl(url);
        } else {
          window.open(url, '_blank');
        }
      }}
      limit={quotaDisplay?.limit || 20}
      used={quotaDisplay?.used || 0}
    />
  </>
  );
}
