import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Copy, Check, Laptop, MousePointer2 } from 'lucide-react';

const AnkiMockup = ({ activeStep }: { activeStep: number }) => {
  return (
    <div className="w-full aspect-video bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl relative overflow-hidden font-sans">
       {/* Window Controls */}
       <div className="h-8 bg-[#252525] border-b border-white/5 flex items-center px-4 gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
       </div>

       {/* Menu Bar */}
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

export function InstallPage() {
  const navigate = useNavigate();
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
          <Link to="/" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Zurück zur Startseite</span>
          </Link>
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
                      <span className="text-teal-400 flex items-center gap-2">
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
  );
}

