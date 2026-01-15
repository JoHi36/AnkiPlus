import React, { useRef, useEffect, useState } from 'react';
import { ArrowUp, Square, Lightbulb, List, EyeOff, Eye, Brain, Sparkles, Zap, Toolbox, BrainCircuit } from 'lucide-react';

interface DemoChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
  mode?: 'flash' | 'deep';
}

export function DemoChatInput({ 
  value, 
  onChange, 
  onSend, 
  isLoading, 
  placeholder = "Antworte oder frage...",
  mode = 'flash'
}: DemoChatInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-Grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 200;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSend();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full relative group">
      <form 
        onSubmit={handleSubmit}
        className={`relative bg-[#151515] backdrop-blur-xl border rounded-2xl transition-all duration-300 ${
          isFocused || mode === 'deep'
            ? 'border-teal-500/60 shadow-[0_0_15px_-5px_rgba(20,184,166,0.2)]'
            : 'border-white/10 hover:border-white/20'
        }`}
      >
        {/* Input Area */}
        <div className="px-4 pt-4 pb-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            rows={1}
            className="w-full min-h-[44px] max-h-[200px] bg-transparent text-white text-[15px] resize-none outline-none leading-relaxed placeholder:text-neutral-500 overflow-visible font-sans"
            readOnly={false} // Allow typing to trigger demo events
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 gap-3">
          
          {/* Left: Tool Toggle + Kompakt/Ausführlich Toggle */}
          <div className="flex items-center gap-1">
            {/* Tool Toggle Button (Visual) */}
            <button
              type="button"
              className="flex items-center justify-center py-1.5 px-2 rounded-lg text-neutral-500 hover:text-white transition-colors"
            >
              <Toolbox size={16} strokeWidth={2} />
            </button>

            {/* Vertikale Trennlinie */}
            <div className="h-4 w-px bg-white/10 mx-1" />

            {/* Toggle Button für FLASH/DEEP */}
            <button
              type="button"
              className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all tracking-wide ${
                mode === 'deep'
                  ? 'text-purple-400 bg-purple-500/10 border border-purple-500/30 shadow-lg shadow-purple-900/20'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {mode === 'deep' ? (
                <>
                  <BrainCircuit size={14} className="text-purple-400 relative z-10" />
                  <span className="relative z-10">DEEP</span>
                  <span className="flex items-center justify-center ml-1.5 min-w-[28px] h-5 px-1.5 text-[10px] bg-purple-500/10 text-purple-400 rounded border border-purple-500/20 font-bold relative z-10">⌘L</span>
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

          {/* FUSION BLOCK: Quick Actions + Send Button */}
          <div className="flex items-center rounded-full pl-1 pr-1 py-1 gap-1 border border-teal-500/20 bg-teal-500/5 transition-colors duration-300">
            
            {/* Quick Actions (Visual Only) */}
            <button
                type="button"
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-500/20 text-teal-500/70 hover:text-teal-400 transition-all duration-200"
            >
                <Lightbulb size={15} strokeWidth={2.5} />
            </button>
            <button
                type="button"
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-teal-500/20 text-teal-500/70 hover:text-teal-400 transition-all duration-200"
            >
                <List size={15} strokeWidth={2.5} />
            </button>

            <div className="h-5 w-px mx-1 bg-teal-500/20" />

            {/* Send Button */}
            <button
              onClick={onSend}
              type="button" // Prevent form submit double trigger
              disabled={isLoading || !value}
              className={`flex items-center justify-center w-8 h-8 rounded-full shadow-sm transition-all duration-200 ${
                isLoading 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : value.trim()
                    ? mode === 'deep' ? 'bg-purple-600 text-white hover:bg-purple-500 hover:scale-105' : 'bg-teal-500 text-black hover:bg-teal-400 hover:scale-105'
                    : 'bg-[#222] cursor-not-allowed border border-white/5'
              }`}
            >
              {isLoading ? (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowUp 
                  size={18} 
                  strokeWidth={3} 
                  className={value.trim() ? (mode === 'deep' ? 'text-white' : 'text-black') : 'text-neutral-600'}
                />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}