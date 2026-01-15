import { Send, Sparkles, Paperclip, Mic } from 'lucide-react';
import { motion } from 'framer-motion';

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
  return (
    <div className="w-full relative group">
      {/* Input Container */}
      <div className={`
        relative flex items-center gap-3 p-3 pl-4 rounded-2xl border transition-all duration-300
        ${mode === 'deep' 
          ? 'bg-[#1a1520] border-purple-500/30 shadow-[0_0_20px_-5px_rgba(168,85,247,0.15)]' 
          : 'bg-[#151515] border-white/10 focus-within:border-teal-500/30'
        }
      `}>
        
        {/* Attachment Button (Visual Only) */}
        <button className="text-neutral-500 hover:text-neutral-300 transition-colors">
          <Paperclip size={18} />
        </button>

        {/* Text Input */}
        <input
          type="text"
          value={value}
          readOnly // Controlled by demo
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-neutral-500 font-medium"
        />

        {/* Right Actions */}
        <div className="flex items-center gap-2">
           {/* Mic (Visual) */}
           <button className="p-2 text-neutral-500 hover:text-neutral-300 transition-colors hidden sm:block">
              <Mic size={18} />
           </button>

           {/* Send Button */}
           <button
             onClick={onSend}
             disabled={isLoading || !value}
             className={`
               p-2 rounded-xl flex items-center justify-center transition-all duration-300
               ${isLoading 
                 ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                 : mode === 'deep'
                   ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/20'
                   : 'bg-teal-500 hover:bg-teal-400 text-black shadow-lg shadow-teal-900/20'
               }
             `}
           >
             {isLoading ? (
               <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
             ) : mode === 'deep' ? (
               <Sparkles size={18} fill="currentColor" />
             ) : (
               <Send size={18} />
             )}
           </button>
        </div>
      </div>

      {/* Mode Indicator (Subtle) */}
      <div className="absolute -bottom-6 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <span className={`w-1.5 h-1.5 rounded-full ${mode === 'deep' ? 'bg-purple-500' : 'bg-teal-500'}`} />
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
          {mode === 'deep' ? 'Deep Mode Active' : 'Flash Mode Ready'}
        </span>
      </div>
    </div>
  );
}
