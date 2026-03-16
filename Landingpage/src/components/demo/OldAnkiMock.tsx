import { motion } from 'framer-motion';

/**
 * Static mock of vanilla Anki's reviewer UI.
 * Shown during intro, before the plus explodes and transforms into InteractivePlayground.
 */
export function OldAnkiMock() {
  return (
    <div className="w-full h-full flex flex-col bg-[#2d2d2d] rounded-2xl overflow-hidden text-[#d4d4d4] font-sans select-none">

      {/* ── Anki Menu Bar ── */}
      <div className="flex items-center justify-center gap-6 px-4 h-10 bg-[#383838] text-[13px] font-medium text-[#b0b0b0] shrink-0" style={{ borderBottom: '1px solid #222' }}>
        {['Stapelübersicht', 'Hinzufügen', 'Kartenverwaltung', 'Statistiken', 'Synchronisieren'].map((item) => (
          <span key={item} className="hover:text-white transition-colors">{item}</span>
        ))}
      </div>

      {/* ── Info Row ── */}
      <div className="flex items-center justify-between px-4 h-8 text-[11px] text-[#777] shrink-0" style={{ borderBottom: '1px solid #333' }}>
        <span className="text-[#5a9] font-mono">0:01</span>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 border border-[#555] rounded text-[10px]">Tags</span>
          <span>AMBOSS</span>
          <span className="px-1.5 py-0.5 border border-[#555] rounded text-[10px]">Note ID</span>
        </div>
        <span className="px-1.5 py-0.5 border border-[#555] rounded text-[10px]">Errata</span>
      </div>

      {/* ── Divider ── */}
      <div className="h-[2px] bg-gradient-to-r from-[#c44] via-[#c84] to-[#4a8] mx-0 shrink-0" />

      {/* ── Card Content ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="text-lg md:text-xl leading-relaxed max-w-2xl">
          Wie wird die{' '}
          <span className="text-yellow-400">mediale</span>{' '}
          <span className="text-green-400">Lücke unterhalb</span>{' '}
          des{' '}
          <span className="text-orange-400 font-bold">Leistenbandes</span>{' '}
          (<span className="text-teal-400">Lig. inguinale</span>){' '}
          <span className="text-blue-400">bezeichnet</span>?
        </p>

        <div className="mt-6 text-orange-400/70 font-bold text-xl">[...]</div>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="shrink-0 px-4 pb-3 pt-2 flex flex-col items-center gap-2">
        {/* Stats */}
        <div className="flex items-center gap-1 text-xs font-mono">
          <span className="text-green-500">4871</span>
          <span className="text-[#555]">+</span>
          <span className="text-red-500">20</span>
          <span className="text-[#555]">+</span>
          <span className="text-blue-500">3148</span>
        </div>

        {/* Antwort anzeigen */}
        <div className="flex items-center justify-between w-full">
          <span className="px-3 py-1.5 rounded text-[11px] font-medium text-[#999] border border-[#555] bg-[#333]">
            Bearbeiten
          </span>
          <button className="px-6 py-1.5 rounded text-[12px] font-medium text-[#ccc] bg-[#444] border border-[#555] shadow-sm">
            Antwort anzeigen
          </button>
          <span className="px-3 py-1.5 rounded text-[11px] font-medium text-[#999] border border-[#555] bg-[#333]">
            Mehr ▾
          </span>
        </div>
      </div>
    </div>
  );
}
