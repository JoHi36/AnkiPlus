import { useEffect, useRef } from 'react';

// ───────────────────────────────────────────────
// useDemoBridgeStub
// Stubs window.ankiBridge with a no-op addMessage on mount,
// restores the original on unmount.
// ───────────────────────────────────────────────

export function useDemoBridgeStub(): void {
  const originalRef = useRef<unknown>(undefined);

  useEffect(() => {
    originalRef.current = (window as Record<string, unknown>).ankiBridge;

    (window as Record<string, unknown>).ankiBridge = {
      addMessage: (_type: string, _data: unknown) => {
        // no-op — demo environment has no Python bridge
      },
    };

    return () => {
      (window as Record<string, unknown>).ankiBridge = originalRef.current;
    };
  }, []);
}

// ───────────────────────────────────────────────
// buildDemoBridgeProp
// Returns an object mimicking the bridge prop that
// ChatMessage / SourcesCarousel expect.
// ───────────────────────────────────────────────

export interface DemoBridgeProp {
  saveMultipleChoice: () => void;
  loadMultipleChoice: () => string;
  hasMultipleChoice: () => string;
  openPreview: () => void;
  previewCard: () => void;
  openUrl: (url: string) => void;
  goToCard: () => void;
  getCardDetails: () => string;
}

export function buildDemoBridgeProp(): DemoBridgeProp {
  return {
    saveMultipleChoice: () => {},
    loadMultipleChoice: () => JSON.stringify({ success: false }),
    hasMultipleChoice: () => JSON.stringify({ has: false }),
    openPreview: () => {},
    previewCard: () => {},
    openUrl: (url: string) => window.open(url, '_blank'),
    goToCard: () => {},
    getCardDetails: () => JSON.stringify({}),
  };
}
