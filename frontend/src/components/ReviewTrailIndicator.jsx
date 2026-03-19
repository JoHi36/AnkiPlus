import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * ReviewTrailIndicator — Dezenter Indikator oben im Chat-Panel
 * Zeigt "Karte 3 von 7" mit ← → Pfeilen.
 * Verschwindet wenn nur 1 Karte gesehen wurde.
 */
export default function ReviewTrailIndicator({
  currentPosition,
  totalCards,
  canGoLeft,
  canGoRight,
  isViewingHistory,
  onNavigateLeft,
  onNavigateRight,
}) {
  // Nicht anzeigen wenn weniger als 2 Karten
  if (totalCards < 2) return null;

  return (
    <div className="flex items-center justify-center gap-1 py-1 px-2">
      <button
        onClick={onNavigateLeft}
        disabled={!canGoLeft}
        className={`p-0.5 rounded transition-colors ${
          canGoLeft
            ? 'text-base-content/50 hover:text-base-content/80 hover:bg-base-content/5'
            : 'text-base-content/15 cursor-default'
        }`}
        aria-label="Vorherige Karte"
      >
        <ChevronLeft size={14} />
      </button>

      <span className={`text-[11px] tabular-nums tracking-tight select-none ${
        isViewingHistory ? 'text-primary/70' : 'text-base-content/30'
      }`}>
        {currentPosition} / {totalCards}
      </span>

      <button
        onClick={onNavigateRight}
        disabled={!canGoRight}
        className={`p-0.5 rounded transition-colors ${
          canGoRight
            ? 'text-base-content/50 hover:text-base-content/80 hover:bg-base-content/5'
            : 'text-base-content/15 cursor-default'
        }`}
        aria-label="Nächste Karte"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
