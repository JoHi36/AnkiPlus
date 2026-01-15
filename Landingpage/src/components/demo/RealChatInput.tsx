import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Lightbulb, List, EyeOff, Eye, Brain, Sparkles, Search, Zap, Toolbox, BrainCircuit } from 'lucide-react';
import RealToolTogglePopup from './RealToolTogglePopup';

/**
 * RealChatInput Komponente - Adaptiert für Landingpage Demo
 * 1:1 UI Klon von ChatInput.jsx, aber ohne Backend-Logik
 */
export default function RealChatInput({ 
  onSend, 
  isLoading, 
  onStop,
  cardContext,
  onToggleCardState,
  isPremium = true, // Force premium UI for demo
  value, // Controlled input for demo typing
  onChange
}: any) {
  const [internalInput, setInternalInput] = useState('');
  const [isDetailedMode, setIsDetailedMode] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showToolPopup, setShowToolPopup] = useState(false);
  const [aiTools, setAiTools] = useState({
    images: true,
    diagrams: true,
    molecules: false
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLFormElement>(null);
  const longPressTimerRef = useRef<any>(null);
  const [longPressProgress, setLongPressProgress] = useState(0);

  const isQuestion = cardContext?.isQuestion !== false;
  
  // Demo: Sync internal input with prop value if provided
  useEffect(() => {
    if (value !== undefined) {
      setInternalInput(value);
    }
  }, [value]);

  // Demo: Handle change
  const handleChange = (e: any) => {
    setInternalInput(e.target.value);
    if (onChange) onChange(e.target.value);
  };

  // Farbschemata - Immer Standardfarbe (primary), Modus wird nur durch Icons angezeigt
  // Demo Anpassung: Hardcoded Colors statt CSS Vars
  const currentTheme = { 
    border: 'border-white/10', 
    focus: 'border-teal-500/60', 
    text: 'text-teal-500', 
    bg: 'bg-teal-500', 
    bgLight: 'bg-teal-500/10' 
  };
  
  // Auto-Grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 200;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [internalInput]);

  // Handler für Tool-Änderungen
  const handleToolsChange = (newTools: any) => {
    setAiTools(newTools);
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const text = internalInput.trim();
    if (text || value?.trim()) { // Allow submit if prop value exists
      const mode = isDetailedMode ? 'detailed' : 'compact';
      onSend(text || value, { mode });
      // Input clear handled by parent in demo
      setIsDetailedMode(false); // Auto-Reset nach Senden
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: any) => {
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
          className={`relative bg-[#151515] backdrop-blur-xl border rounded-2xl transition-all duration-300 ${
            isFocused
              ? currentTheme.focus
              : `${currentTheme.border} hover:border-white/20`
          }`}
        >
          {/* Input Area */}
          <div className="px-4 pt-4 pb-1">
            <textarea
              ref={textareaRef}
              value={internalInput}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={getPlaceholder()}
              rows={1}
              className="w-full min-h-[44px] max-h-[200px] bg-transparent text-white text-[15px] resize-none outline-none leading-relaxed placeholder:text-neutral-500 overflow-visible"
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 gap-3">
            
            {/* Left: Tool Toggle + Kompakt/Ausführlich Toggle */}
            <div className="flex items-center gap-1">
              {/* Tool Toggle Button */}
              <button
                type="button"
                onClick={() => setShowToolPopup(!showToolPopup)}
                className={`flex items-center justify-center py-1.5 px-2 rounded-lg transition-all ${
                  showToolPopup
                    ? 'text-blue-500'
                    : 'text-neutral-500 hover:text-white'
                }`}
                title="Agent Tools"
              >
                <Toolbox size={16} strokeWidth={2} className={showToolPopup ? "text-blue-500" : "currentColor"} />
              </button>

              {/* Vertikale Trennlinie */}
              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Toggle Button für FLASH/DEEP */}
              <button
                type="button"
                onClick={() => {
                    setIsDetailedMode(!isDetailedMode);
                }}
                className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all tracking-wide ${
                  isDetailedMode
                    ? 'text-purple-500 hover:bg-purple-500/10' // Active (Deep): Purple Text, Subtle BG on Hover
                    : 'text-neutral-500 hover:text-white hover:bg-white/5' // Inactive: Standard
                }`}
                title={isDetailedMode ? "DEEP (⌘L zum Umschalten)" : "FLASH (⌘L zum Umschalten)"}
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
                    <BrainCircuit size={14} className="currentColor relative z-10" />
                    <span className="relative z-10">DEEP</span>
                    <span className="flex items-center justify-center ml-1.5 min-w-[28px] h-5 px-1.5 text-[10px] bg-purple-500/10 text-purple-500 rounded border border-purple-500/20 font-bold relative z-10">⌘L</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} className="currentColor relative z-10" />
                    <span className="relative z-10">FLASH</span>
                    <span className="flex items-center justify-center ml-1.5 min-w-[28px] h-5 px-1.5 text-[10px] bg-white/5 text-neutral-500 rounded border border-white/10 font-bold relative z-10">⌘L</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex-1" />

            {/* 2. & 3. FUSION BLOCK: Quick Actions + Send Button */}
            <div className="flex items-center rounded-full pl-1 pr-1 py-1 gap-1 border border-teal-500/20 bg-teal-500/10 transition-colors duration-300">
              
              {/* Status & Actions */}
              {cardContext && (
                  <>
                    {/* Status Toggle Button */}
                    <button
                        type="button"
                        onClick={onToggleCardState}
                        className="w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 bg-teal-500/20 text-teal-500 hover:bg-teal-500/30"
                        title={isQuestion ? "Verdeckt (Klicken zum Aufdecken)" : "Offen (Klicken zum Verdecken)"}
                    >
                        {isQuestion ? <EyeOff size={14} strokeWidth={2.5} /> : <Eye size={14} strokeWidth={2.5} />}
                    </button>

                    <div className="h-4 w-px mx-0.5 bg-teal-500/20" />

                    {/* Quick Actions */}
                    {isQuestion ? (
                        <>
                            <button
                                type="button"
                                onClick={() => onSend("Gib mir einen Hinweis, ohne die Antwort zu verraten.", { mode: 'compact' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-500/20 text-teal-500/70 hover:text-teal-500 transition-all duration-200"
                                title="Hinweis anfordern"
                            >
                                <Lightbulb size={15} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onSend("Erstelle ein Multiple Choice Quiz zu dieser Karte.", { mode: 'compact' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-500/20 text-teal-500/70 hover:text-teal-500 transition-all duration-200"
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
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-500/20 text-teal-500/70 hover:text-teal-500 transition-all duration-200"
                                title="Konzepte erklären (ausführlich)"
                            >
                                <Brain size={15} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onSend("Gib mir eine Eselsbrücke für diese Karte.", { mode: 'compact' })}
                                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-500/20 text-teal-500/70 hover:text-teal-500 transition-all duration-200"
                                title="Eselsbrücke"
                            >
                                <Sparkles size={15} strokeWidth={2.5} />
                            </button>
                        </>
                    )}
                  </>
              )}

              {cardContext && (
                  <div className="h-5 w-px mx-1 bg-teal-500/20" />
              )}

              {/* Send Button */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center justify-center w-8 h-8 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full transition-all duration-200"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!internalInput.trim() && !value?.trim()}
                  className={`flex items-center justify-center w-8 h-8 rounded-full shadow-sm transition-all duration-200 ${
                    internalInput.trim() || value?.trim()
                      ? 'bg-teal-500 text-white hover:bg-teal-400 hover:scale-105'
                      : 'bg-[#222] cursor-not-allowed border border-white/5'
                  }`}
                >
                  {/* Arrow Icon Color Logic */}
                  <ArrowUp 
                    size={18} 
                    strokeWidth={3} 
                    className={
                        internalInput.trim() || value?.trim()
                            ? 'text-white' // White when typing
                            : 'text-neutral-700' // Neutral when empty
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
            <RealToolTogglePopup
              isOpen={showToolPopup}
              onClose={() => setShowToolPopup(false)}
              tools={aiTools}
              onToolsChange={handleToolsChange}
            />
          </div>
        )}
    </div>
  );
}
