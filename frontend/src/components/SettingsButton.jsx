import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

/**
 * Settings Button Komponente
 * Modernes, cleanes Design - nur das Icon, keine störenden Hintergründe
 */
export default function SettingsButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="p-2 text-base-content/40 hover:text-base-content transition-all duration-300 pointer-events-auto z-50 hover:rotate-90"
      title="Einstellungen"
      style={{ position: 'relative' }}
    >
      <SlidersHorizontal size={20} strokeWidth={1.5} />
    </button>
  );
}

