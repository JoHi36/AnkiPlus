import { useState, useCallback, useEffect, useRef } from 'react';

export default function useSmartSearch() {
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [answerText, setAnswerText] = useState(null);
  const [clusterLabels, setClusterLabels] = useState(null);
  const [clusterSummaries, setClusterSummaries] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);

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
      setSelectedClusterId(null);
      cacheRef.current = result;
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
    };

    window.addEventListener('graph.searchCards', onSearchCards);
    window.addEventListener('graph.quickAnswer', onQuickAnswer);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
      window.removeEventListener('graph.quickAnswer', onQuickAnswer);
    };
  }, []);

  const search = useCallback((q) => {
    setQuery(q);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setClusterLabels(null);
    setClusterSummaries(null);
    setSelectedClusterId(null);
    window.ankiBridge?.addMessage('searchCards', { query: q.trim(), topK: 100 });
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    setSearchResult(null);
    setIsSearching(false);
    setAnswerText(null);
    setClusterLabels(null);
    setClusterSummaries(null);
    setSelectedClusterId(null);
    cacheRef.current = null;
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
    answerText, clusterLabels, clusterSummaries,
    selectedClusterId, setSelectedClusterId,
    selectedCluster, selectedClusterLabel, selectedClusterSummary,
    search, reset, restoreFromCache,
    hasResults: !!(searchResult?.cards?.length > 0),
  };
}
