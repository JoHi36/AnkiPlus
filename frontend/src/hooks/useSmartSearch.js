import { useState, useCallback, useEffect, useRef } from 'react';

export default function useSmartSearch() {
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [answerText, setAnswerText] = useState(null);
  const [clusterLabels, setClusterLabels] = useState(null);
  const [clusterSummaries, setClusterSummaries] = useState(null);
  const [cardRefs, setCardRefs] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [subClusters, setSubClusters] = useState(null);
  const [isSubClustering, setIsSubClustering] = useState(false);
  const [kgSubgraph, setKgSubgraph] = useState(null);
  const [graphMode, setGraphMode] = useState('clusters');
  const [selectedTerm, setSelectedTerm] = useState(null); // { id, label, cardIds, color }
  const [termDefinition, setTermDefinition] = useState(null); // { term, definition, sources }

  // Track if sidebar slide-in has played — survives tab switches (lives in hook, not component)
  const sidebarHasAnimated = useRef(false);

  // Pipeline steps — same system as session chat ReasoningStream
  const [pipelineSteps, setPipelineSteps] = useState([]);
  const [pipelineGeneration, setPipelineGeneration] = useState(0);

  // Cache survives view transitions
  const cacheRef = useRef(null);

  // Listen for backend events
  useEffect(() => {
    const onSearchCards = (e) => {
      const result = e.detail;
      setSearchResult(result);
      setIsSearching(false);
      setClusterLabels(null);
      setClusterSummaries(null);
      setCardRefs(null);
      setSelectedClusterId(null);
      setSubClusters(null);
      setKgSubgraph(null);
      cacheRef.current = result;

      // Request KG subgraph in parallel (for alternative visualization)
      if (result?.cards?.length > 0) {
        window.ankiBridge?.addMessage('searchKgSubgraph', {
          cardIds: JSON.stringify(result.cards.map(c => Number(c.id))),
          query: result.query || '',
        });
      }
    };

    const onQuickAnswer = (e) => {
      const data = e.detail;
      setAnswerText(data?.answer || null);
      if (data?.clusterLabels && Object.keys(data.clusterLabels).length > 0) {
        setClusterLabels(data.clusterLabels);
      }
      if (data?.clusterSummaries && Object.keys(data.clusterSummaries).length > 0) {
        setClusterSummaries(data.clusterSummaries);
      }
      if (data?.cardRefs && Object.keys(data.cardRefs).length > 0) {
        setCardRefs(data.cardRefs);
      }
    };

    const onSubClusters = (e) => {
      const data = e.detail;
      setIsSubClustering(false);
      if (data?.subClusters?.length > 0) {
        setSubClusters(data.subClusters);
      } else {
        setSubClusters(null);
      }
    };

    const onKgSubgraph = (e) => {
      setKgSubgraph(e.detail);
    };

    const onTermDefinition = (e) => {
      const data = e.detail;
      if (data?.term) setTermDefinition(data);
    };

    // Pipeline steps — same format as session chat
    const onPipelineStep = (e) => {
      const payload = e.detail;
      setPipelineSteps(prev => {
        const existing = prev.findIndex(s => s.step === payload.step);
        const newStep = {
          step: payload.step,
          status: payload.status,
          data: payload.data || {},
          timestamp: Date.now(),
        };
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = newStep;
          return next;
        }
        return [...prev, newStep];
      });
    };

    window.addEventListener('graph.searchCards', onSearchCards);
    window.addEventListener('graph.quickAnswer', onQuickAnswer);
    window.addEventListener('graph.subClusters', onSubClusters);
    window.addEventListener('graph.kgSubgraph', onKgSubgraph);
    window.addEventListener('graph.termDefinition', onTermDefinition);
    window.addEventListener('graph.pipelineStep', onPipelineStep);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
      window.removeEventListener('graph.quickAnswer', onQuickAnswer);
      window.removeEventListener('graph.subClusters', onSubClusters);
      window.removeEventListener('graph.kgSubgraph', onKgSubgraph);
      window.removeEventListener('graph.termDefinition', onTermDefinition);
      window.removeEventListener('graph.pipelineStep', onPipelineStep);
    };
  }, []);

  // Select a KG term — request definition
  const selectTerm = useCallback((termNode) => {
    if (!termNode) {
      setSelectedTerm(null);
      setTermDefinition(null);
      return;
    }
    setSelectedTerm(termNode);
    setTermDefinition(null);
    // Request definition from backend (will check cache first)
    window.ankiBridge?.addMessage('getTermDefinition', { term: termNode.label || termNode.id });
  }, []);

  // Request sub-clusters when a cluster is selected
  const selectCluster = useCallback((clusterId) => {
    setSelectedClusterId(clusterId);
    setSubClusters(null);

    if (clusterId && searchResult?.clusters) {
      const idx = parseInt(clusterId.replace('cluster_', ''), 10);
      const cluster = searchResult.clusters[idx];
      if (cluster?.cards?.length >= 4) {
        setIsSubClustering(true);
        window.ankiBridge?.addMessage('subClusterCards', {
          cardIds: JSON.stringify(cluster.cards.map(c => Number(c.id))),
          clusterId: clusterId,
          query: query,
        });
      }
    }
  }, [searchResult, query]);

  const search = useCallback((q) => {
    setQuery(q);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setClusterLabels(null);
    setClusterSummaries(null);
    setCardRefs(null);
    setSelectedClusterId(null);
    setSubClusters(null);
    setPipelineSteps([]);
    setPipelineGeneration(g => g + 1);
    window.ankiBridge?.addMessage('searchCards', { query: q.trim(), topK: 100 });
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    setSearchResult(null);
    setIsSearching(false);
    setAnswerText(null);
    setClusterLabels(null);
    setClusterSummaries(null);
    setCardRefs(null);
    setSelectedClusterId(null);
    setSubClusters(null);
    cacheRef.current = null;
    sidebarHasAnimated.current = false;
  }, []);

  const restoreFromCache = useCallback(() => {
    if (cacheRef.current) {
      setSearchResult(cacheRef.current);
    }
  }, []);

  // Derive selected cluster data
  const selectedCluster = selectedClusterId != null && searchResult?.clusters
    ? searchResult.clusters.find((_, i) => `cluster_${i}` === selectedClusterId)
    : null;

  const selectedClusterLabel = selectedClusterId && clusterLabels?.[selectedClusterId]
    || selectedCluster?.label || null;

  const selectedClusterSummary = selectedClusterId && clusterSummaries?.[selectedClusterId] || null;

  return {
    query, searchResult, isSearching,
    answerText, clusterLabels, clusterSummaries, cardRefs,
    pipelineSteps, pipelineGeneration,
    selectedClusterId, setSelectedClusterId: selectCluster,
    selectedCluster, selectedClusterLabel, selectedClusterSummary,
    subClusters, isSubClustering,
    kgSubgraph, graphMode, setGraphMode,
    selectedTerm, selectTerm, termDefinition,
    sidebarHasAnimated,
    search, reset, restoreFromCache,
    hasResults: !!(searchResult?.cards?.length > 0),
  };
}
