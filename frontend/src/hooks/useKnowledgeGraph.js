import { useState, useEffect, useCallback } from 'react';

export default function useKnowledgeGraph() {
  const [crossLinks, setCrossLinks] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [termDefinition, setTermDefinition] = useState(null);

  // Request cross-links on mount
  useEffect(() => {
    window.ankiBridge?.addMessage('getDeckCrossLinks', {});
  }, []);

  // Listen for events
  useEffect(() => {
    const handlers = {
      'graph.crossLinks': (e) => setCrossLinks(e.detail || []),
      'graph.searchResult': (e) => setSearchResult(e.detail),
      'graph.termDefinition': (e) => setTermDefinition(e.detail),
    };
    Object.entries(handlers).forEach(([evt, fn]) => window.addEventListener(evt, fn));
    return () => Object.entries(handlers).forEach(([evt, fn]) => window.removeEventListener(evt, fn));
  }, []);

  const searchGraph = useCallback((query) => {
    window.ankiBridge?.addMessage('searchGraph', { query });
  }, []);

  const requestDefinition = useCallback((term) => {
    setTermDefinition({ term, loading: true });
    window.ankiBridge?.addMessage('getTermDefinition', { term });
  }, []);

  const startStack = useCallback((term, cardIds) => {
    window.ankiBridge?.addMessage('startTermStack', { term, cardIds: JSON.stringify(cardIds) });
  }, []);

  return {
    crossLinks, selectedTerm, setSelectedTerm,
    searchResult, termDefinition,
    searchGraph, requestDefinition, startStack,
  };
}
