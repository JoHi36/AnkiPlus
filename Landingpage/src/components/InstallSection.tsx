import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, MousePointer2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const ADDON_CODE = '882734192';

const STEPS = [
  { step: 1, title: 'Öffne Anki', desc: 'Starte die Anki App auf deinem Computer.' },
  { step: 2, title: 'Extras → Add-ons', desc: 'Klicke im Menü auf Extras → Erweiterungen.' },
  { step: 3, title: 'Herunterladen', desc: 'Klicke auf „Erweiterungen herunterladen".' },
  { step: 4, title: 'Code einfügen', desc: 'Füge den Code ein und starte Anki neu.' },
];

/* ── Mini Anki Mockup ── */
function AnkiMini({ activeStep }: { activeStep: number }) {
  return (
    <div className="w-full aspect-[16/10] bg-[#1e1e1e] rounded-xl border border-white/[0.08] shadow-2xl relative overflow-hidden text-[13px]">
      {/* Title bar */}
      <div className="h-7 bg-[#252525] border-b border-white/[0.05] flex items-center px-3 gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
      </div>

      {/* Menu bar */}
      <div className="h-7 bg-[#252525] border-b border-white/[0.05] flex items-center px-3 gap-3 text-[11px] text-neutral-500">
        <span>Decks</span>
        <span>Add</span>
        <span>Browse</span>
        <span>Stats</span>
        <span>Sync</span>
        <motion.span
          animate={{ color: activeStep >= 2 ? '#fff' : '#737373' }}
          className="relative"
        >
          Tools
          <AnimatePresence>
            {activeStep === 2 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-full left-0 mt-0.5 w-36 bg-[#2a2a2a] border border-white/10 rounded shadow-xl py-0.5 z-20 text-[10px]"
              >
                <div className="px-2.5 py-1">Study Options</div>
                <div className="px-2.5 py-1">Preferences</div>
                <div className="h-px bg-white/10 my-0.5" />
                <div className="px-2.5 py-1 bg-blue-600/20 text-blue-200">Add-ons...</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.span>
        <span>Help</span>
      </div>

      {/* Deck list */}
      <div className="p-4 space-y-1.5">
        <div className="text-base font-light text-neutral-400 mb-3">Decks</div>
        {['Default', 'Medizin – Kardio'].map((d) => (
          <div key={d} className="flex justify-between items-center bg-[#252525] px-2.5 py-2 rounded border border-white/[0.04] text-[11px]">
            <span className="text-neutral-300">{d}</span>
            <span className="text-green-500/60">12 <span className="text-red-400/60">2</span> <span className="text-blue-400/60">0</span></span>
          </div>
        ))}
      </div>

      {/* Cursor for step 2 */}
      <AnimatePresence>
        {activeStep === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 160, y: 160 }}
            animate={{ opacity: 1, x: 190, y: 38 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute z-50 pointer-events-none"
          >
            <MousePointer2 className="w-4 h-4 fill-white text-black drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add-ons window (step 3) */}
      <AnimatePresence>
        {activeStep === 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
          >
            <div className="w-[70%] bg-[#333] rounded-lg border border-white/10 shadow-2xl flex flex-col">
              <div className="h-6 border-b border-white/5 flex items-center px-3 text-[10px] font-bold text-neutral-400">Add-ons</div>
              <div className="h-20" />
              <div className="p-2 border-t border-white/5 flex justify-end gap-1.5">
                <div className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded animate-pulse">Get Add-ons...</div>
                <div className="px-2 py-1 bg-[#444] text-neutral-300 text-[10px] rounded">Config</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install code window (step 4) */}
      <AnimatePresence>
        {activeStep === 4 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 bg-black/50 flex items-center justify-center z-40"
          >
            <div className="w-56 bg-[#333] rounded-lg border border-white/10 shadow-2xl flex flex-col">
              <div className="h-6 border-b border-white/5 flex items-center px-3 text-[10px] font-bold text-neutral-400">Install from code</div>
              <div className="p-3 flex flex-col gap-2">
                <div className="text-[10px] text-neutral-400">Code:</div>
                <div className="bg-[#111] border border-white/10 p-1.5 text-xs text-white font-mono rounded flex items-center">
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    {ADDON_CODE}
                  </motion.span>
                  <motion.span
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="inline-block w-1 h-3.5 bg-blue-500 ml-0.5"
                  />
                </div>
              </div>
              <div className="p-2 border-t border-white/5 flex justify-end gap-1.5">
                <div className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded">OK</div>
                <div className="px-2 py-1 bg-[#444] text-neutral-300 text-[10px] rounded">Cancel</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main Section ── */
export function InstallSection() {
  const [activeStep, setActiveStep] = useState(1);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(ADDON_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="install" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">

      {/* Heading */}
      <div className="text-center mb-16">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
          In 60 Sekunden installiert.
        </h2>
        <p className="text-sm text-white/[0.35] font-light max-w-md mx-auto">
          Kopiere den Code, füge ihn in Anki ein — fertig.
        </p>
      </div>

      {/* Code box */}
      <div className="flex justify-center mb-14">
        <motion.button
          onClick={copyCode}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="relative group cursor-pointer bg-transparent border-none"
        >
          <div className="absolute inset-0 bg-[#0a84ff]/10 blur-2xl rounded-2xl group-hover:bg-[#0a84ff]/15 transition-all duration-500" />
          <div className="relative bg-[#111] border border-white/[0.08] rounded-xl px-8 py-5 flex items-center gap-5 group-hover:border-[#0a84ff]/30 transition-colors">
            <span className="text-2xl sm:text-4xl font-mono font-bold tracking-[0.15em] text-white/90">
              {ADDON_CODE}
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {copied ? (
                <span className="text-green-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Kopiert</span>
              ) : (
                <span className="text-white/30 group-hover:text-white/60 flex items-center gap-1 transition-colors"><Copy className="w-3.5 h-3.5" /> Kopieren</span>
              )}
            </div>
          </div>
        </motion.button>
      </div>

      {/* Steps + Mockup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">

        {/* Left: Steps */}
        <div className="space-y-3">
          {STEPS.map((item) => (
            <button
              key={item.step}
              type="button"
              onClick={() => setActiveStep(item.step)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer bg-transparent ${
                activeStep === item.step
                  ? 'bg-white/[0.03] border-[#0a84ff]/30 shadow-[inset_3px_0_0_0_#0a84ff]'
                  : 'border-white/[0.04] hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 mt-0.5 ${
                  activeStep === item.step
                    ? 'bg-[#0a84ff]/10 border-[#0a84ff]/50 text-[#0a84ff]'
                    : 'bg-white/[0.03] border-white/[0.08] text-white/30'
                }`}>
                  {item.step}
                </div>
                <div>
                  <h4 className={`text-sm font-semibold mb-0.5 ${activeStep === item.step ? 'text-white/90' : 'text-white/40'}`}>
                    {item.title}
                  </h4>
                  <p className="text-xs text-white/25 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </button>
          ))}

          {/* CTA */}
          <div className="pt-4">
            <Link
              to="/install"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0a84ff]/70 hover:text-[#0a84ff] transition-colors"
            >
              Ausführliche Anleitung
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Right: Interactive Anki mockup */}
        <div className="sticky top-10">
          <AnkiMini activeStep={activeStep} />
          <p className="text-center mt-3 text-[10px] text-white/20 font-mono tracking-wider">
            SCHRITT {activeStep} / 4
          </p>
        </div>
      </div>
    </section>
  );
}
