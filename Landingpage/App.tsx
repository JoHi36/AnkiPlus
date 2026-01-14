import React, { useState, useEffect } from 'react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  Search, 
  Brain, 
  ChevronRight, 
  Play, 
  CheckCircle2, 
  Layers,
  Check,
  Star,
  Quote,
  MessageSquare,
  ListChecks,
  GitGraph,
  ArrowRight,
  Sparkles,
  ToggleRight,
  AlertCircle,
  Database,
  Wand2,
  Plus,
  Globe,
  Cpu,
  ScanSearch,
  Library,
  LayoutDashboard,
  CreditCard,
  Settings,
  LogOut,
  Clock,
  Flame,
  FileText,
  User,
  Bell,
  MoreVertical,
  ChevronLeft,
  Copy,
  Download,
  MousePointer2,
  Laptop,
  Command,
  Monitor
} from 'lucide-react';

// Animation variants for consistency
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } 
  }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
};

// --- LANDING PAGE MOCKUPS ---

const MockupEvaluation = () => (
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

const MockupRescue = () => (
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

const MockupDeepReasoning = () => {
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
        
        {/* Timeline Line - Centered relative to dots (left-30px aligns with left-0.5px dot center) */}
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
                 backgroundColor: isDeepMode ? '#581c87' : '#134e4a' // purple-900 vs teal-900
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


// --- DASHBOARD COMPONENTS ---

const DashboardPage = ({ onLogout }: { onLogout: () => void }) => {
  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col md:flex-row relative overflow-hidden">
      
      {/* Background Ambience (Subtle) */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-teal-900/10 blur-[120px] pointer-events-none z-0" />
      
      {/* --- Sidebar (Desktop) / Bottom Nav (Mobile) --- */}
      <aside className="fixed bottom-0 w-full z-50 md:relative md:w-72 md:h-screen bg-[#080808]/90 backdrop-blur-xl border-t md:border-t-0 md:border-r border-white/5 flex flex-row md:flex-col justify-between p-4 md:p-6">
        
        <div className="flex flex-col gap-8">
           {/* Logo (Hidden on Mobile for space, visible Desktop) */}
           <div className="hidden md:flex items-center gap-3 font-bold text-xl tracking-tight cursor-pointer group mb-4">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center border border-teal-500/20">
                <span className="text-teal-400 text-sm">A+</span>
              </div>
              <span className="text-white">ANKI+</span>
            </div>

            {/* Navigation */}
            <nav className="flex md:flex-col justify-around md:justify-start w-full gap-2">
              {[
                { icon: LayoutDashboard, label: 'Übersicht', active: true },
                { icon: CreditCard, label: 'Abo & Plan', active: false },
                { icon: Sparkles, label: 'Deep Mode', active: false },
                { icon: Settings, label: 'Einstellungen', active: false },
              ].map((item, i) => (
                <button key={i} className={`flex flex-col md:flex-row items-center md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-all ${item.active ? 'text-white bg-white/5 border border-white/5' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}>
                  <item.icon className={`w-6 h-6 md:w-5 md:h-5 ${item.active ? 'text-teal-400' : ''}`} />
                  <span className="text-[10px] md:text-sm font-medium mt-1 md:mt-0">{item.label}</span>
                </button>
              ))}
            </nav>
        </div>

        {/* User Profile (Desktop Only) */}
        <div className="hidden md:flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-xs font-bold">
             JD
           </div>
           <div className="flex-1 min-w-0">
             <div className="text-sm font-medium truncate">Johannes D.</div>
             <div className="text-xs text-neutral-500 truncate">johannes@uni.de</div>
           </div>
           <button onClick={onLogout} className="text-neutral-500 hover:text-white transition-colors">
             <LogOut className="w-4 h-4" />
           </button>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 relative z-10 overflow-y-auto h-screen pb-24 md:pb-10">
        
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-6 pb-2">
           <div className="flex items-center gap-3 font-bold text-xl tracking-tight">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center border border-teal-500/20">
                <span className="text-teal-400 text-sm">A+</span>
              </div>
              <span className="text-white">ANKI+</span>
            </div>
            <button onClick={onLogout} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400">
               <LogOut className="w-4 h-4" />
            </button>
        </div>

        <div className="max-w-5xl mx-auto p-6 space-y-10">
          
          {/* SECTION 1: HEADER & STATUS */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-4 md:mt-10"
          >
            <div>
               <h1 className="text-3xl md:text-4xl font-bold mb-2">Willkommen zurück, Johannes</h1>
               <p className="text-neutral-400">Hier ist dein Lern-Überblick für heute.</p>
            </div>
            
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)] backdrop-blur-md">
               <Sparkles className="w-4 h-4 text-purple-300 fill-purple-300" />
               <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-blue-200 uppercase tracking-wide">
                 Plan: Exam Pro
               </span>
            </div>
          </motion.div>


          {/* SECTION 2: USAGE STATS (VALUE PROOF) */}
          <motion.div 
             variants={staggerContainer}
             initial="hidden"
             animate="visible"
             className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
             {/* Card 1: Deep Mode Credits */}
             <motion.div variants={fadeInUp} className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full group-hover:bg-purple-500/20 transition-all" />
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                         <Brain className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium bg-white/5 px-2 py-1 rounded text-neutral-400">Reset: 00:00</span>
                   </div>
                   <div className="text-neutral-400 text-sm font-medium mb-1">Deep Mode Credits</div>
                   <div className="text-2xl font-bold text-white mb-4">12 <span className="text-neutral-500 text-lg font-normal">/ 50 genutzt</span></div>
                   
                   {/* Progress Bar */}
                   <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '24%' }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                      />
                   </div>
                </div>
             </motion.div>

             {/* Card 2: Time Saved */}
             <motion.div variants={fadeInUp} className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 blur-[50px] rounded-full group-hover:bg-teal-500/20 transition-all" />
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                         <Clock className="w-5 h-5" />
                      </div>
                   </div>
                   <div className="text-neutral-400 text-sm font-medium mb-1">Gesparte Zeit (Heute)</div>
                   <div className="text-2xl font-bold text-white mb-2">~ 45 <span className="text-neutral-500 text-lg font-normal">Minuten</span></div>
                   <p className="text-xs text-neutral-500">Durch schnelle KI-Erklärungen statt manueller Recherche.</p>
                </div>
             </motion.div>

             {/* Card 3: Streak */}
             <motion.div variants={fadeInUp} className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-[50px] rounded-full group-hover:bg-orange-500/20 transition-all" />
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                         <Flame className="w-5 h-5" />
                      </div>
                   </div>
                   <div className="text-neutral-400 text-sm font-medium mb-1">Lern-Streak</div>
                   <div className="text-2xl font-bold text-white mb-2">14 <span className="text-neutral-500 text-lg font-normal">Tage</span></div>
                   <p className="text-xs text-neutral-500">Du bist im Flow! Lern morgen weiter um den Streak zu halten.</p>
                </div>
             </motion.div>
          </motion.div>


          {/* SECTION 3: SUBSCRIPTION */}
          <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.4 }}
             className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8 relative overflow-hidden"
          >
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                <div>
                   <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">Exam Pro (Monatlich)</h3>
                      <span className="px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Aktiv
                      </span>
                   </div>
                   <div className="text-neutral-400 text-sm mb-4">14,99€ pro Monat • Nächste Abbuchung: <span className="text-white">03. Juli 2025</span></div>
                   <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Check className="w-3 h-3 text-teal-500" />
                      <span>Unbegrenzter Deep Mode inklusive</span>
                   </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                   <button className="flex-1 md:flex-none px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                      Plan verwalten
                   </button>
                   <button className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors" title="Rechnung herunterladen">
                      <FileText className="w-5 h-5" />
                   </button>
                </div>
             </div>
          </motion.div>


          {/* SECTION 4: PAYMENT METHOD */}
          <motion.div
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.5 }}
          >
             <h3 className="text-lg font-semibold mb-4">Zahlungsmethode</h3>
             <div className="flex flex-col md:flex-row gap-6">
                
                {/* Credit Card Visual */}
                <div className="w-full md:w-80 h-48 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] border border-white/10 p-6 flex flex-col justify-between relative overflow-hidden shadow-2xl">
                   {/* Card Shine */}
                   <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                   <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-teal-500/10 blur-[40px] rounded-full pointer-events-none" />
                   
                   <div className="flex justify-between items-start">
                      <div className="w-10 h-7 rounded bg-gradient-to-r from-yellow-200 to-yellow-400 opacity-80" /> {/* Chip */}
                      <span className="font-bold italic text-white/50 text-lg">VISA</span>
                   </div>
                   
                   <div>
                      <div className="text-neutral-400 text-xs font-mono mb-1 tracking-widest">**** **** **** 4242</div>
                      <div className="flex justify-between items-end">
                         <div className="text-xs text-neutral-500">JOHANNES DOE</div>
                         <div className="text-xs text-neutral-500">12/28</div>
                      </div>
                   </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col justify-center gap-4">
                   <button className="text-sm font-medium text-white hover:text-teal-400 transition-colors flex items-center gap-2 group">
                      Methode ändern <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                   </button>
                   <button className="text-sm font-medium text-neutral-500 hover:text-white transition-colors">
                      Zahlungshistorie ansehen
                   </button>
                </div>

             </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
};


// --- INSTALL PAGE COMPONENTS ---

const AnkiMockup = ({ activeStep }: { activeStep: number }) => {
  return (
    <div className="w-full aspect-video bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl relative overflow-hidden font-sans">
       {/* Window Controls */}
       <div className="h-8 bg-[#252525] border-b border-white/5 flex items-center px-4 gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
       </div>

       {/* Menu Bar (Step 1 Highlight) */}
       <div className="h-8 bg-[#252525] border-b border-white/5 flex items-center px-4 gap-4 text-xs text-neutral-400">
          <div className="hover:text-white cursor-default">Decks</div>
          <div className="hover:text-white cursor-default">Add</div>
          <div className="hover:text-white cursor-default">Browse</div>
          <div className="hover:text-white cursor-default">Stats</div>
          <div className="hover:text-white cursor-default">Sync</div>
          <motion.div 
             animate={{ color: activeStep >= 2 ? '#fff' : '#a3a3a3' }}
             className="relative cursor-default"
          >
             Tools
             {/* Dropdown (Step 2) */}
             <AnimatePresence>
                {activeStep === 2 && (
                   <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute top-full left-0 mt-1 w-48 bg-[#2a2a2a] border border-white/10 rounded shadow-xl py-1 z-20"
                   >
                      <div className="px-3 py-1.5 hover:bg-blue-600">Study Options</div>
                      <div className="px-3 py-1.5 hover:bg-blue-600">Preferences</div>
                      <div className="h-[1px] bg-white/10 my-1" />
                      <div className="px-3 py-1.5 bg-blue-600/20 text-blue-200">Add-ons...</div>
                   </motion.div>
                )}
             </AnimatePresence>
          </motion.div>
          <div className="hover:text-white cursor-default">Help</div>
       </div>

       {/* Main Content Area */}
       <div className="p-8 flex flex-col gap-4">
          <div className="text-2xl font-light text-neutral-300">Decks</div>
          <div className="space-y-2">
             <div className="flex justify-between items-center bg-[#252525] p-3 rounded border border-white/5">
                <span className="text-sm">Default</span>
                <span className="text-xs text-green-500">20 <span className="text-red-400">0</span> <span className="text-blue-400">0</span></span>
             </div>
             <div className="flex justify-between items-center bg-[#252525] p-3 rounded border border-white/5">
                <span className="text-sm">Medizin - Kardiologie</span>
                <span className="text-xs text-green-500">15 <span className="text-red-400">3</span> <span className="text-blue-400">0</span></span>
             </div>
          </div>
       </div>

       {/* CURSOR ANIMATION FOR STEP 2 */}
       <AnimatePresence>
          {activeStep === 2 && (
             <motion.div
                initial={{ opacity: 0, x: 200, y: 200 }}
                animate={{ opacity: 1, x: 230, y: 45 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeInOut" }}
                className="absolute z-50 pointer-events-none"
             >
                <MousePointer2 className="w-5 h-5 fill-white text-black drop-shadow-lg" />
             </motion.div>
          )}
       </AnimatePresence>

       {/* ADD-ONS WINDOW (STEP 3) */}
       <AnimatePresence>
          {activeStep === 3 && (
             <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
             >
                <div className="w-3/4 h-3/4 bg-[#333] rounded-lg border border-white/10 shadow-2xl flex flex-col">
                   <div className="h-8 border-b border-white/5 flex items-center px-3 text-xs font-bold text-neutral-400">Add-ons</div>
                   <div className="flex-1 p-4">
                      {/* Empty List */}
                   </div>
                   <div className="p-3 border-t border-white/5 flex justify-end gap-2">
                      <div className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded shadow-lg shadow-blue-500/20 animate-pulse">Get Add-ons...</div>
                      <div className="px-3 py-1.5 bg-[#444] text-neutral-300 text-xs rounded">Config</div>
                   </div>
                </div>
             </motion.div>
          )}
       </AnimatePresence>

       {/* INSTALL CODE WINDOW (STEP 4) */}
       <AnimatePresence>
          {activeStep === 4 && (
             <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="absolute inset-0 bg-black/50 flex items-center justify-center z-40"
             >
                <div className="w-80 bg-[#333] rounded-lg border border-white/10 shadow-2xl flex flex-col">
                   <div className="h-8 border-b border-white/5 flex items-center px-3 text-xs font-bold text-neutral-400">Install from code</div>
                   <div className="p-4 flex flex-col gap-3">
                      <div className="text-xs text-neutral-300">Code:</div>
                      <div className="bg-[#111] border border-white/10 p-2 text-sm text-white font-mono rounded">
                         <motion.span
                           initial={{ opacity: 0 }}
                           animate={{ opacity: 1 }}
                           transition={{ duration: 0.5, delay: 0.5 }}
                         >
                           882734192
                         </motion.span>
                         <motion.span
                           animate={{ opacity: [0, 1, 0] }}
                           transition={{ repeat: Infinity, duration: 0.8 }}
                           className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 align-middle"
                         />
                      </div>
                   </div>
                   <div className="p-3 border-t border-white/5 flex justify-end gap-2">
                      <div className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded">OK</div>
                      <div className="px-3 py-1.5 bg-[#444] text-neutral-300 text-xs rounded">Cancel</div>
                   </div>
                </div>
             </motion.div>
          )}
       </AnimatePresence>

    </div>
  );
}

const InstallPage = ({ onBack }: { onBack: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const copyToClipboard = () => {
    navigator.clipboard.writeText("882734192");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-teal-500/30 overflow-x-hidden relative">
      
      {/* Background Ambience */}
      <div className="fixed top-[-10%] right-[-10%] w-[800px] h-[800px] bg-teal-500/5 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* Nav */}
      <header className="absolute top-0 w-full z-50 p-6 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer text-neutral-400 hover:text-white transition-colors" onClick={onBack}>
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Zurück zur Startseite</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-32 pb-20 max-w-6xl mx-auto px-6">
        
        {/* --- HERO: THE CODE --- */}
        <div className="text-center mb-24">
           <motion.div
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="mb-8"
           >
              <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
                 Installiere das <br/>
                 <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-200 to-teal-500">Gehirn-Update.</span>
              </h1>
              <p className="text-neutral-400 text-lg">Kopiere diesen Code und füge ihn in Anki ein.</p>
           </motion.div>

           <motion.div
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             transition={{ delay: 0.2 }}
             className="relative inline-block group cursor-pointer"
             onClick={copyToClipboard}
           >
              <div className="absolute inset-0 bg-teal-500/20 blur-2xl rounded-2xl group-hover:bg-teal-500/30 transition-all duration-500" />
              <div className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 md:p-12 flex flex-col items-center gap-4 hover:border-teal-500/50 transition-colors">
                 
                 <div className="text-4xl md:text-7xl font-mono font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)] group-hover:scale-105 transition-transform duration-300">
                    882734192
                 </div>

                 <div className="flex items-center gap-2 text-sm font-medium transition-colors duration-300">
                    {copied ? (
                      <span className="text-teal-400 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                        <Check className="w-4 h-4" /> Kopiert!
                      </span>
                    ) : (
                      <span className="text-neutral-500 group-hover:text-white flex items-center gap-2">
                        <Copy className="w-4 h-4" /> Zum Kopieren klicken
                      </span>
                    )}
                 </div>
              </div>
           </motion.div>
        </div>


        {/* --- GUIDE SECTION --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
           
           {/* Left: Steps */}
           <div className="space-y-6">
              <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                 <Laptop className="w-5 h-5 text-neutral-500" />
                 Installation Guide
              </h3>

              {[
                { step: 1, title: "Öffne Anki am Desktop", desc: "Starte die Anki Applikation auf deinem Computer." },
                { step: 2, title: "Navigiere zu Add-ons", desc: "Klicke im Menü auf Extras (Tools) → Erweiterungen (Add-ons)." },
                { step: 3, title: "Download starten", desc: "Klicke auf den Button 'Erweiterungen herunterladen' (Get Add-ons)." },
                { step: 4, title: "Code einfügen & Neustart", desc: "Füge den Code ein und starte Anki neu." }
              ].map((item) => (
                 <motion.div
                   key={item.step}
                   initial={{ opacity: 0, x: -20 }}
                   whileInView={{ opacity: 1, x: 0 }}
                   transition={{ delay: item.step * 0.1 }}
                   onClick={() => setActiveStep(item.step)}
                   className={`p-6 rounded-xl border cursor-pointer transition-all duration-300 relative overflow-hidden ${
                     activeStep === item.step 
                       ? 'bg-[#111] border-teal-500/50 shadow-[inset_4px_0_0_0_#14b8a6]' 
                       : 'bg-[#080808] border-white/5 hover:bg-[#111]'
                   }`}
                 >
                    <div className="flex items-start gap-4 relative z-10">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${
                          activeStep === item.step 
                            ? 'bg-teal-500/10 border-teal-500 text-teal-400' 
                            : 'bg-white/5 border-white/10 text-neutral-500'
                       }`}>
                          {item.step}
                       </div>
                       <div>
                          <h4 className={`text-lg font-medium mb-1 ${activeStep === item.step ? 'text-white' : 'text-neutral-400'}`}>
                             {item.title}
                          </h4>
                          <p className="text-sm text-neutral-500 leading-relaxed">{item.desc}</p>
                       </div>
                    </div>
                 </motion.div>
              ))}
           </div>


           {/* Right: Visualizer */}
           <div className="sticky top-10">
              <div className="relative">
                 {/* Glow behind mockup */}
                 <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/10 to-purple-500/10 blur-3xl -z-10" />
                 
                 <AnkiMockup activeStep={activeStep} />
                 
                 <div className="mt-4 text-center">
                    <p className="text-xs text-neutral-500 font-mono">
                       INTERACTIVE PREVIEW • STEP {activeStep}/4
                    </p>
                 </div>
              </div>
           </div>

        </div>

      </main>
    </div>
  )
}


const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'install'>('landing');

  if (currentView === 'dashboard') {
    return <DashboardPage onLogout={() => setCurrentView('landing')} />;
  }

  if (currentView === 'install') {
    return <InstallPage onBack={() => setCurrentView('landing')} />;
  }

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-teal-500/30 overflow-x-hidden relative">
      
      {/* --- LAYER 2: Masked Grid Pattern --- */}
      <div className="fixed inset-0 z-0 pointer-events-none h-screen">
        <div 
          className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px]"
          style={{
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)'
          }}
        />
      </div>

      {/* --- LAYER 3: High-End Atmosphere --- */}
      <div className="fixed top-[-20%] left-1/2 -translate-x-1/2 w-[100vw] h-[800px] bg-teal-500/15 rounded-full blur-[120px] pointer-events-none z-0 mix-blend-screen opacity-60" />
      <div className="fixed top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[100px] pointer-events-none z-0" />


      {/* Navbar - Ultra-Minimalist */}
      <header className="absolute top-0 w-full z-50 p-6 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 font-bold text-xl tracking-tight cursor-pointer group" onClick={() => setCurrentView('landing')}>
            <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center border border-teal-500/20 shadow-[0_0_20px_rgba(20,184,166,0.2)] group-hover:shadow-[0_0_30px_rgba(20,184,166,0.4)] transition-all">
              <span className="text-teal-400 group-hover:text-teal-300 transition-colors">A+</span>
            </div>
            <span className="text-white drop-shadow-[0_0_15px_rgba(20,184,166,0.3)] group-hover:text-teal-50 transition-colors">ANKI+</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <nav className="flex gap-8 text-sm text-neutral-400 font-medium">
              <a href="#" className="hover:text-white transition-colors">Features</a>
              <a href="#" className="hover:text-white transition-colors">Pricing</a>
              <button onClick={() => setCurrentView('install')} className="hover:text-white transition-colors">Download</button>
            </nav>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Login
              </button>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="text-sm font-medium bg-white/10 border border-white/10 text-white px-5 py-2.5 rounded-full hover:bg-white hover:text-black hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 pt-44 pb-20">
        
        {/* --- Hero Section --- */}
        <section className="max-w-7xl mx-auto px-6 flex flex-col items-center text-center relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-32 bg-teal-500/20 blur-[80px] -z-10 rounded-full" />

          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center max-w-5xl"
          >
            <motion.div variants={fadeInUp} className="mb-10">
              <span className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full text-sm font-medium bg-teal-950/40 border border-teal-500/50 text-teal-300 shadow-[0_0_30px_-10px_rgba(45,212,191,0.4)] backdrop-blur-md ring-1 ring-white/10 hover:bg-teal-950/60 transition-colors cursor-default">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500 shadow-[0_0_8px_2px_rgba(20,184,166,0.6)]"></span>
                </span>
                Jetzt verfügbar: ANKI+ Deep Mode
              </span>
            </motion.div>

            <motion.h1 
              variants={fadeInUp}
              className="text-6xl md:text-8xl lg:text-9xl font-extrabold tracking-tighter leading-[1] mb-10 text-white drop-shadow-2xl"
            >
              Anki auf <br className="md:hidden" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-400 to-teal-600 drop-shadow-[0_0_30px_rgba(45,212,191,0.3)]">
                Steroiden
              </span>.
            </motion.h1>

            <motion.p 
              variants={fadeInUp}
              className="text-xl md:text-2xl text-neutral-300 max-w-3xl leading-relaxed mb-14 font-light"
            >
              Das KI-Gehirn für deine Karteikarten. <br className="hidden md:block"/>
              Verstehe Medizin, Jura und komplexe Themen, statt nur Fakten zu pauken.
            </motion.p>

            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-5 w-full justify-center">
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-white px-10 font-semibold text-lg text-neutral-950 transition-all duration-300 hover:bg-neutral-200 hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]"
              >
                <span className="mr-2">Kostenlos starten</span>
                <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
              
              <button className="group inline-flex h-14 items-center justify-center rounded-full border border-white/10 bg-white/5 px-10 font-medium text-lg text-white transition-all hover:bg-white/10 hover:border-white/20 hover:scale-105 active:scale-95 backdrop-blur-sm">
                <Play className="mr-2 w-4 h-4 fill-white" />
                Wie es funktioniert
              </button>
            </motion.div>
          </motion.div>
        </section>


        {/* --- 3-STEP FEATURE JOURNEY --- */}
        <section className="mt-40 max-w-7xl mx-auto px-6 flex flex-col gap-32 md:gap-40">
          
          {/* STEP 1: EVALUATION */}
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
            {/* Image (Top on Mobile, Left on Desktop) */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1"
            >
              <div className="aspect-[4/3] lg:aspect-auto lg:h-[450px]">
                <MockupEvaluation />
              </div>
            </motion.div>

            {/* Text */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1 space-y-8"
            >
              <div className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center border border-yellow-500/20">
                <MessageSquare className="w-7 h-7 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Dein persönlicher Prüfer.</h2>
                <p className="text-xl text-neutral-400 leading-relaxed">
                  Schluss mit binärem Richtig/Falsch. Tipp deine Antwort ein – ANKI+ versteht Nuancen, lobt Details und korrigiert Konzepte wie ein echter Tutor.
                </p>
              </div>
            </motion.div>
          </div>

          {/* STEP 2: RESCUE */}
          <div className="flex flex-col lg:flex-row-reverse items-center gap-16 lg:gap-24">
            {/* Image (Top on Mobile, Right on Desktop) */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1"
            >
              <div className="aspect-[4/3] lg:aspect-auto lg:h-[450px]">
                <MockupRescue />
              </div>
            </motion.div>

            {/* Text */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1 space-y-8"
            >
              <div className="w-14 h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center border border-teal-500/20">
                <ListChecks className="w-7 h-7 text-teal-400" />
              </div>
              <div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Nie wieder Frust-Moment.</h2>
                <p className="text-xl text-neutral-400 leading-relaxed">
                  Keine Ahnung? Wandel die Karte sofort in ein Quiz um. Der sanfteste Weg, um Blockaden zu lösen und im Flow zu bleiben.
                </p>
              </div>
            </motion.div>
          </div>

          {/* STEP 3: DEEP REASONING (PREMIUM) */}
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
            {/* Image (Top on Mobile, Left on Desktop) */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1"
            >
              <div className="aspect-[4/3] lg:aspect-auto lg:h-[550px]">
                <MockupDeepReasoning />
              </div>
            </motion.div>

            {/* Text */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="w-full lg:flex-1 space-y-8"
            >
              <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.2)]">
                <Brain className="w-7 h-7 text-purple-400" />
              </div>
              <div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                  Die Erleuchtung <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-amber-300">
                    (Deep Mode).
                  </span>
                </h2>
                <p className="text-xl text-neutral-400 leading-relaxed">
                  Das ist mehr als eine Antwort. ANKI+ analysiert 10+ Quellen, vernetzt das Wissen und liefert dir eine Synthese auf Facharzt-Niveau.
                </p>
              </div>
            </motion.div>
          </div>

        </section>


        {/* --- Pricing Section --- */}
        <section className="mt-40 max-w-7xl mx-auto px-6 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl bg-teal-900/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">Investiere in dein Gehirn.</h2>
            <p className="text-xl text-neutral-400">Wähle den unfairen Vorteil, der zu dir passt.</p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start"
          >
            
            {/* Starter (Free) */}
            <motion.div variants={fadeInUp} className="relative rounded-3xl border border-white/10 bg-neutral-900/40 p-10 backdrop-blur-sm hover:border-white/20 transition-colors">
              <div className="mb-6 inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-neutral-400">
                Starter
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">0€</span>
                <span className="text-neutral-500 text-lg">/Monat</span>
              </div>
              <p className="text-neutral-400 text-sm mb-8 h-10 leading-relaxed">
                Perfekt, um die Magie von ANKI+ kennenzulernen.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-neutral-300">
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-neutral-500" /> Unbegrenzt Flash Mode</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-white" /> 3x Deep Mode pro Tag</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-neutral-500" /> Basis-Support</li>
              </ul>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="w-full py-4 rounded-full border border-white/10 font-medium text-white hover:bg-white hover:text-black transition-all"
              >
                Download
              </button>
            </motion.div>

            {/* Student (Most Popular) */}
            <motion.div variants={fadeInUp} className="relative rounded-3xl border border-teal-500/50 bg-[#0F1110] p-10 shadow-[0_0_50px_-15px_rgba(20,184,166,0.2)] md:scale-105 z-10 flex flex-col">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 bg-teal-500 text-black text-xs font-bold rounded-full uppercase tracking-wider shadow-lg shadow-teal-500/20">
                Beliebt
              </div>
              <div className="mb-6 inline-block px-3 py-1 rounded-full bg-teal-950/50 border border-teal-500/30 text-xs font-medium text-teal-400">
                Student
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">4,99€</span>
                <span className="text-neutral-500 text-lg">/Monat</span>
              </div>
              <p className="text-neutral-400 text-sm mb-8 h-10 leading-relaxed">
                Für alle, die Prüfungen nicht nur bestehen, sondern rocken wollen.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-neutral-200">
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Alles aus Starter</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> 50x Deep Mode pro Tag</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Priorisierte Generierung</li>
                <li className="flex items-center gap-3"><Check className="w-5 h-5 text-teal-400" /> Werbefrei</li>
              </ul>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="w-full py-4 rounded-full bg-teal-500 font-bold text-black text-lg hover:bg-teal-400 hover:shadow-[0_0_30px_rgba(20,184,166,0.4)] transition-all transform hover:-translate-y-1"
              >
                Jetzt starten
              </button>
            </motion.div>

            {/* Exam Pro (Ultimate) */}
            <motion.div variants={fadeInUp} className="relative rounded-3xl border border-white/10 bg-neutral-900/40 p-10 backdrop-blur-sm hover:border-purple-500/30 transition-colors">
              <div className="mb-6 inline-block px-3 py-1 rounded-full bg-purple-900/20 border border-purple-500/30 text-xs font-medium text-purple-300">
                Fürs Examen
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-bold text-white tracking-tight">14,99€</span>
                <span className="text-neutral-500 text-lg">/Monat</span>
              </div>
              <p className="text-neutral-400 text-sm mb-8 h-10 leading-relaxed">
                Das ultimative Werkzeug für Staatsexamen und High-Stakes Tests.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-neutral-300">
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> Alles aus Student</li>
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> <span className="text-white font-medium">UNBEGRENZT</span> Deep Mode</li>
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> Deep Search (25 Quellen)</li>
                 <li className="flex items-center gap-3"><Check className="w-5 h-5 text-purple-400" /> 24/7 Priority Support</li>
              </ul>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 font-medium text-white hover:opacity-90 transition-opacity shadow-lg shadow-purple-900/20"
              >
                Pro werden
              </button>
            </motion.div>

          </motion.div>
        </section>


        {/* --- Testimonials Section --- */}
        <section className="mt-40 max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-24"
          >
            <h2 className="text-3xl font-bold mb-4">Von High-Performern geliebt</h2>
            <div className="flex justify-center gap-1 text-teal-400 mb-2">
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
              <Star className="w-5 h-5 fill-current" />
            </div>
            <p className="text-neutral-400 text-sm">4.9/5 Durchschnittsbewertung</p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                name: "Sarah M.",
                role: "Medizinstudentin, 4. Jahr",
                text: "Anki+ hat mein Physikum gerettet. Der Deep Mode ist wie ein persönlicher Professor, der 24/7 in meiner Tasche ist. Komplexe Zusammenhänge endlich verstanden.",
                image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces"
              },
              {
                name: "Jonas K.",
                role: "Jura Student, LMU",
                text: "Endlich verstehe ich die Zusammenhänge zwischen den Paragraphen, statt nur auswendig zu lernen. Gamechanger für mein Staatsexamen.",
                image: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop&crop=faces"
              },
              {
                name: "Dr. Lisa Weber",
                role: "Assistenzärztin",
                text: "Ich nutze ANKI+ zum Auffrischen von Facharztwissen. Die Deep Search Funktion spart mir täglich Stunden an Recherchezeit.",
                image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=faces"
              }
            ].map((testimonial, i) => (
              <motion.div key={i} variants={fadeInUp} className="glass-card p-10 rounded-3xl relative bg-neutral-900/30 hover:bg-neutral-900/50 transition-colors">
                <Quote className="w-10 h-10 text-teal-500/10 absolute top-8 right-8" />
                <p className="text-neutral-300 leading-relaxed mb-8 relative z-10 text-lg font-light">
                  "{testimonial.text}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10">
                    <img src={testimonial.image} alt={testimonial.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-base">{testimonial.name}</div>
                    <div className="text-teal-500/80 text-sm">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>


        {/* --- CTA Section --- */}
        <section className="mt-40 mb-20 max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
             {/* Background glow for CTA */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-teal-500/15 blur-[120px] rounded-full -z-10" />
            
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 text-white">
              Bereit für den <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-teal-200 to-teal-500">unfairen Vorteil?</span>
            </h2>
            
            <div className="flex flex-col items-center gap-8">
              <ul className="flex gap-8 text-neutral-400 text-sm mb-4">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-teal-500"/> 14 Tage kostenlos</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-teal-500"/> Jederzeit kündbar</li>
              </ul>
              
              <button 
                onClick={() => setCurrentView('dashboard')}
                className="h-16 px-12 rounded-full bg-white text-black font-bold text-xl hover:scale-105 transition-transform duration-200 shadow-[0_0_50px_-10px_rgba(255,255,255,0.3)]"
              >
                Jetzt kostenlos starten
              </button>
            </div>
          </motion.div>
        </section>

      </main>

      <footer className="border-t border-white/5 py-12 bg-[#030303] relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-neutral-500 text-sm">
            &copy; 2024 ANKI+. Built for high performers.
          </div>
          <div className="flex gap-8 text-neutral-500 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;