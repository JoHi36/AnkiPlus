import { useState, useEffect, useCallback } from 'react';

export default function useKnowledgeGraph() {
  const [graphData, setGraphData] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [termDefinition, setTermDefinition] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load graph data on mount
  useEffect(() => {
    window.ankiBridge?.addMessage('getGraphData', {});
    window.ankiBridge?.addMessage('getGraphStatus', {});
  }, []);

  // Listen for async results via window events
  // App.jsx dispatches graph.* ankiReceive events as CustomEvents (same pattern as addon.phrases)
  useEffect(() => {
    const handlers = {
      'graph.data': (e) => { setGraphData(e.detail); setLoading(false); },
      'graph.searchResult': (e) => { setSearchResult(e.detail); },
      'graph.termDefinition': (e) => { setTermDefinition(e.detail); },
      'graph.status': (e) => { setGraphStatus(e.detail); },
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

  const refreshStatus = useCallback(() => {
    window.ankiBridge?.addMessage('getGraphStatus', {});
  }, []);

  return {
    graphData, graphStatus, loading,
    selectedTerm, setSelectedTerm,
    searchResult, termDefinition,
    searchGraph, requestDefinition, startStack, refreshStatus,
  };
}
