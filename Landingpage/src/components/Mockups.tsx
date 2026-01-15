import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Search, Zap, Brain, Sparkles, Library, Cpu } from 'lucide-react';

export const MockupEvaluation = () => (
  <div className="w-full h-full min-h-[340px] bg-[#0A0A0A] rounded-2xl border border-white/10 p-6 relative overflow-hidden flex flex-col justify-center gap-6">
    <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-yellow-500/5 via-transparent to-transparent pointer-events-none" />
    
    {/* Input Area */}
    <div className="relative z-10 space-y-2">
      <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Deine Eingabe</div>
      <div className="w-full bg-neutral-900 rounded-lg border border-white/10 p-4 text-neutral-300 font-mono text-sm leading-relaxed relative">
        Aldosteron senkt Kalium...
        <span className="inline-block w-1.5 h-4 bg-teal-500 ml-1 animate-pulse align-middle"/>
      </div>
    </div>

    {/* AI Feedback */}
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="relative z-10 bg-[#111] border border-yellow-500/20 rounded-xl p-5 shadow-lg shadow-yellow-900/10"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
          Fast Korrekt
        </span>
      </div>
      <div className="text-sm text-neutral-300 leading-relaxed">
        <span className="text-green-400">✅ Kalium sinkt.</span> <span className="text-white">Aber vergiss nicht das Blutvolumen! 🩸</span> Das ist der entscheidende Faktor für den Blutdruck.
      </div>
    </motion.div>
  </div>
);

export const MockupRescue = () => (
  <div className="w-full h-full min-h-[340px] bg-[#0A0A0A] rounded-2xl border border-white/10 p-6 relative overflow-hidden flex flex-col justify-center">
    
    <div className="mb-8">
      <div className="h-1.5 w-12 bg-teal-500 rounded-full mb-4" />
      <h3 className="text-white text-lg font-medium leading-snug">Was ist die Hauptwirkung von ADH?</h3>
    </div>

    <div className="space-y-3 relative">
      {['Vasokonstriktion', 'Wasserretention', 'Natriumausscheidung', 'Kaliumretention'].map((opt, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`w-full p-3.5 rounded-lg border text-sm text-left flex justify-between items-center transition-all ${i === 1 ? 'bg-teal-500/10 border-teal-500/50 text-white' : 'bg-neutral-900/50 border-white/5 text-neutral-500'}`}
        >
          <span>{opt}</span>
          {i === 1 && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
        </motion.button>
      ))}

      {/* Floating Badge */}
      <motion.div 
        initial={{ scale: 0, rotate: -5 }}
        whileInView={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.5, type: "spring" }}
        className="absolute -right-2 -top-12 bg-neutral-800 border border-white/10 text-[10px] font-bold px-2 py-1 rounded text-teal-400 shadow-xl"
      >
        AUTO-GENERATED
      </motion.div>
    </div>
  </div>
);

const SearchQuery = ({ text, delay, isComplex = false }: { text: string, delay: number, isComplex?: boolean }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
    transition={{ delay, duration: 0.3 }}
    className={`flex items-center gap-3 p-3 rounded-lg border ${isComplex ? 'bg-purple-500/5 border-purple-500/20' : 'bg-[#151515] border-white/5'} mb-2`}
  >
    <Search className={`w-3.5 h-3.5 flex-shrink-0 ${isComplex ? 'text-purple-400' : 'text-neutral-500'}`} />
    <span className={`text-xs font-mono truncate flex-1 min-w-0 ${isComplex ? 'text-purple-100' : 'text-neutral-400'}`}>{text}</span>
    {isComplex && <span className="flex-shrink-0 text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">COMPLEX</span>}
  </motion.div>
);

export const MockupDeepReasoning = () => {
  const [isDeepMode, setIsDeepMode] = useState(false);

  return (
    <motion.div 
      className="w-full h-full min-h-[550px] bg-[#0A0A0A] rounded-2xl border relative flex flex-col overflow-hidden"
      animate={{
        borderColor: isDeepMode ? 'rgba(168, 85, 247, 0.4)' : 'rgba(20, 184, 166, 0.2)',
        boxShadow: isDeepMode ? '0 0 50px -15px rgba(168, 85, 247, 0.15)' : '0 0 30px -10px rgba(20, 184, 166, 0.05)'
      }}
      transition={{ duration: 0.5 }}
    >
      {/* Background Ambience */}
      <motion.div 
        className="absolute top-0 right-0 w-2/3 h-full pointer-events-none opacity-20"
        animate={{
          background: isDeepMode 
            ? 'radial-gradient(circle at top right, rgba(168, 85, 247, 0.4), transparent 70%)'
            : 'radial-gradient(circle at top right, rgba(20, 184, 166, 0.3), transparent 70%)'
        }}
      />

      {/* --- CONTENT AREA --- */}
      <div className="flex-1 p-6 pb-24 relative z-10">
        
        {/* Timeline Line */}
        <div 
            className="absolute left-[30px] top-8 bottom-10 w-[1px]" 
            style={{
                background: 'linear-gradient(to bottom, #262626 0%, #262626 60%, transparent 100%)'
            }}
        />

        {/* STEP 1: INTENT */}
        <div className="relative mb-8 pl-10">
          <div className="absolute left-[0.5px] top-[2px] w-3 h-3 rounded-full bg-[#0A0A0A] border border-neutral-700 flex items-center justify-center z-10">
            <div className={`w-1 h-1 rounded-full ${isDeepMode ? 'bg-purple-500' : 'bg-teal-500'}`} />
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Intentionsanalyse</h4>
            <motion.div 
              key={isDeepMode ? 'deep-intent' : 'flash-intent'}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#111] border border-white/10"
            >
              {isDeepMode ? <Brain className="w-3.5 h-3.5 text-purple-400" /> : <Zap className="w-3.5 h-3.5 text-teal-400" />}
              <span className={`text-xs font-bold ${isDeepMode ? 'text-purple-100' : 'text-teal-100'}`}>
                {isDeepMode ? "TIEFES VERSTÄNDNIS" : "SCHNELLE ANTWORT"}
              </span>
            </motion.div>
          </div>
        </div>

        {/* STEP 2: CONTEXT STRATEGY (SEARCH) */}
        <div className="relative mb-8 pl-10">
          <div className="absolute left-[0.5px] top-[2px] w-3 h-3 rounded-full bg-[#0A0A0A] border border-neutral-700 flex items-center justify-center z-10">
             <div className={`w-1 h-1 rounded-full ${isDeepMode ? 'bg-purple-500' : 'bg-teal-500'}`} />
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Kontextstrategie</h4>
              <motion.span 
                key={isDeepMode ? 'deep-count' : 'flash-count'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-[10px] ${isDeepMode ? 'text-purple-400' : 'text-teal-500'}`}
              >
                {isDeepMode ? '6 QUERIES' : '3 QUERIES'}
              </motion.span>
            </div>
            
            <div className="relative">
              <SearchQuery text="N. cutaneus brachii AND antebrachii" delay={0.1} />
              <SearchQuery text="Spinalnerven AND Segment C8" delay={0.2} />
              
              <AnimatePresence>
                {isDeepMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                     <div className="my-3 flex items-center gap-2">
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-purple-500/50 to-transparent" />
                        <span className="text-[9px] font-bold text-purple-500 uppercase flex-shrink-0">Erweiterte Suche</span>
                     </div>
                     <SearchQuery text="Fasciculus medialis OR Plexus brachialis" delay={0.3} isComplex />
                     <SearchQuery text="Klinik: Obere Plexuslähmung (Erb)" delay={0.4} isComplex />
                  </motion.div>
                )}
              </AnimatePresence>

              {!isDeepMode && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-2 border border-dashed border-white/5 rounded-lg flex items-center justify-center gap-2 mt-2">
                    <span className="text-[10px] text-neutral-600">Deep Mode für erweiterte Suche aktivieren</span>
                 </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* STEP 3: RELEVANCE & MODEL */}
        <div className="relative pl-10">
          <div className="absolute left-[0.5px] top-[2px] w-3 h-3 rounded-full bg-[#0A0A0A] border border-neutral-700 flex items-center justify-center z-10">
             <div className={`w-1 h-1 rounded-full ${isDeepMode ? 'bg-purple-500' : 'bg-teal-500'}`} />
          </div>
          <div className="space-y-3">
             <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Relevanzanalyse</h4>
             <div className="flex gap-2">
                <motion.div 
                  className={`flex-1 rounded-lg border p-3 flex flex-col gap-2 transition-colors duration-500 ${isDeepMode ? 'bg-purple-900/10 border-purple-500/30' : 'bg-[#151515] border-white/5'}`}
                >
                   <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <Library className="w-3.5 h-3.5" />
                      <span>Kontext</span>
                   </div>
                   <div className="text-xl font-bold text-white flex items-baseline gap-1">
                      <motion.span
                         key={isDeepMode ? 'deep-cards' : 'flash-cards'}
                         initial={{ opacity: 0, y: 10 }}
                         animate={{ opacity: 1, y: 0 }}
                      >
                        {isDeepMode ? '25' : '8'}
                      </motion.span>
                      <span className="text-xs font-normal text-neutral-500">Karten</span>
                   </div>
                </motion.div>

                <motion.div 
                   className={`flex-1 rounded-lg border p-3 flex flex-col gap-2 transition-colors duration-500 ${isDeepMode ? 'bg-purple-900/10 border-purple-500/30' : 'bg-[#151515] border-white/5'}`}
                >
                   <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Modell</span>
                   </div>
                   <div className="font-bold text-white flex items-center gap-1 h-[28px]">
                      <motion.span
                         key={isDeepMode ? 'deep-model' : 'flash-model'}
                         initial={{ opacity: 0, scale: 0.9 }}
                         animate={{ opacity: 1, scale: 1 }}
                         className={`text-sm ${isDeepMode ? 'text-purple-200' : 'text-teal-200'}`}
                      >
                        {isDeepMode ? 'Heavy' : 'Flash'}
                      </motion.span>
                   </div>
                </motion.div>
             </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM TOGGLE BAR --- */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent pt-10 z-20">
         <div className="bg-[#111] p-1 rounded-full border border-white/10 relative h-14 flex cursor-pointer shadow-2xl" onClick={() => setIsDeepMode(!isDeepMode)}>
            
            {/* Sliding Background */}
            <motion.div 
               className="absolute top-1 bottom-1 rounded-full shadow-lg z-0"
               animate={{
                 left: isDeepMode ? '50%' : '1%',
                 width: '49%',
                 backgroundColor: isDeepMode ? '#581c87' : '#134e4a'
               }}
               transition={{ type: "spring", stiffness: 250, damping: 30 }}
            />
            
            {/* Highlight Glow Effect */}
            <motion.div 
               className="absolute top-1 bottom-1 rounded-full z-0 blur-md opacity-50"
               animate={{
                 left: isDeepMode ? '50%' : '1%',
                 width: '49%',
                 backgroundColor: isDeepMode ? '#a855f7' : '#2dd4bf'
               }}
            />

            {/* Flash Option */}
            <div className="flex-1 relative z-10 flex items-center justify-center gap-2 text-sm font-bold transition-colors duration-300">
              <Zap className={`w-4 h-4 ${!isDeepMode ? 'text-white' : 'text-neutral-500'}`} />
              <span className={!isDeepMode ? 'text-white' : 'text-neutral-500'}>Flash Mode</span>
            </div>

            {/* Deep Option */}
            <div className="flex-1 relative z-10 flex items-center justify-center gap-2 text-sm font-bold transition-colors duration-300">
              <Sparkles className={`w-4 h-4 ${isDeepMode ? 'text-white' : 'text-neutral-500'}`} />
              <span className={isDeepMode ? 'text-white' : 'text-neutral-500'}>Deep Mode</span>
            </div>
         </div>
      </div>
    </motion.div>
  );
};


