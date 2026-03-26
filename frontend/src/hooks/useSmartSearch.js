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
  const [subClusters, setSubClusters] = useState(null); // sub-clusters for selected cluster
  const [isSubClustering, setIsSubClustering] = useState(false);

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

    window.addEventListener('graph.searchCards', onSearchCards);
    window.addEventListener('graph.quickAnswer', onQuickAnswer);
    window.addEventListener('graph.subClusters', onSubClusters);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
      window.removeEventListener('graph.quickAnswer', onQuickAnswer);
      window.removeEventListener('graph.subClusters', onSubClusters);
    };
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
    selectedClusterId, setSelectedClusterId: selectCluster,
    selectedCluster, selectedClusterLabel, selectedClusterSummary,
    subClusters, isSubClustering,
    search, reset, restoreFromCache,
    hasResults: !!(searchResult?.cards?.length > 0),
  };
}
