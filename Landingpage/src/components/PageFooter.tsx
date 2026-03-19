export function PageFooter() {
  return (
    <footer className="mt-12 pt-5 border-t border-white/[0.06] flex justify-between items-center">
      <span className="text-[11px] text-white/[0.15] font-light">&copy; 2026 Anki.plus</span>
      <div className="flex gap-4">
        <a href="#" className="text-[11px] text-white/[0.15] font-light hover:text-white/[0.35] transition-colors">Datenschutz</a>
        <a href="#" className="text-[11px] text-white/[0.15] font-light hover:text-white/[0.35] transition-colors">Impressum</a>
      </div>
    </footer>
  );
}
