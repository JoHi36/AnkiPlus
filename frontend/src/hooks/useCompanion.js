// Stub — companion hook (Plusi integration, to be implemented)
export function useCompanion({ bridge, onChunk } = {}) {
  return {
    send: () => {},
    handleChunk: () => {},
    isLoading: false,
  };
}
