import { useState, useEffect, useCallback, useRef } from 'react';

export default function useKnowledgeGraph() {
  const [graphData, setGraphData] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [termDefinition, setTermDefinition] = useState(null);
  const [loading, setLoading] = useState(true);
  const retryRef = useRef(null);

  // Load graph data on mount, retry every 5s until data arrives
  useEffect(() => {
    const requestData = () => {
      window.ankiBridge?.addMessage('getGraphData', {});
      window.ankiBridge?.addMessage('getGraphStatus', {});
    };
    requestData();

    // Poll every 5s until we get graph data (pipeline may still be running)
    retryRef.current = setInterval(() => {
      if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
        requestData();
      } else {
        clearInterval(retryRef.current);
      }
    }, 5000);

    return () => clearInterval(retryRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop polling once data arrives
  useEffect(() => {
    if (graphData?.nodes?.length > 0 && retryRef.current) {
      clearInterval(retryRef.current);
      retryRef.current = null;
    }
  }, [graphData]);

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
