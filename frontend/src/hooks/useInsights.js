import { useState, useEffect, useCallback, useMemo } from 'react';

const EMPTY_INSIGHTS = { version: 1, insights: [] };

export default function useInsights() {
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [revlogData, setRevlogData] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentCardId, setCurrentCardId] = useState(null);
  const [newInsightIds, setNewInsightIds] = useState([]);
  const [noNewInsights, setNoNewInsights] = useState(false);

  const loadInsights = useCallback((cardId) => {
    if (!cardId) return;
    setCurrentCardId(cardId);
    setInsights(EMPTY_INSIGHTS);
    setRevlogData([]);
    setNewInsightIds([]);
    window.ankiBridge?.addMessage('getCardInsights', { cardId });
    window.ankiBridge?.addMessage('getCardRevlog', { cardId });
  }, []);

  const saveInsights = useCallback((cardId, insightsData) => {
    window.ankiBridge?.addMessage('saveCardInsights', {
      cardId,
      insights: insightsData,
    });
  }, []);

  const extractInsights = useCallback((cardId, cardContext, messages, performanceData) => {
    if (!cardId || !messages?.length) return;
    setIsExtracting(true);

    window.ankiBridge?.addMessage('extractInsights', {
      cardId,
      cardContext,
      messages,
      existingInsights: insights,
      performanceData,
    });
  }, [insights]);

  const markInsightsSeen = useCallback((cardId) => {
    if (!cardId) return;
    setNewInsightIds([]);
    window.ankiBridge?.addMessage('markInsightsSeen', { cardId });
  }, []);

  useEffect(() => {
    const onInsightsLoaded = (e) => {
      const data = e.detail;
      if (data?.success) {
        setInsights(data.data || EMPTY_INSIGHTS);
      }
    };

    const onRevlogLoaded = (e) => {
      const data = e.detail;
      if (data?.success) {
        setRevlogData(data.data || []);
      }
    };

    const onExtractionComplete = (e) => {
      const data = e.detail;
      setIsExtracting(false);
      if (data?.success && data.insights) {
        if (data.insights.no_new_insights) {
          // No new insights found — show brief message, keep existing
          setNoNewInsights(true);
          setTimeout(() => setNoNewInsights(false), 4000);
          setInsights(data.insights);
          setNewInsightIds([]);
        } else {
          setNoNewInsights(false);
          setInsights(data.insights);
          setNewInsightIds(data.insights.new_indices || []);
        }
      }
    };

    window.addEventListener('ankiCardInsightsLoaded', onInsightsLoaded);
    window.addEventListener('ankiCardRevlogLoaded', onRevlogLoaded);
    window.addEventListener('ankiInsightExtractionComplete', onExtractionComplete);

    return () => {
      window.removeEventListener('ankiCardInsightsLoaded', onInsightsLoaded);
      window.removeEventListener('ankiCardRevlogLoaded', onRevlogLoaded);
      window.removeEventListener('ankiInsightExtractionComplete', onExtractionComplete);
    };
  }, []);

  const chartData = useMemo(() => {
    if (!revlogData.length) return { main: [], flip: [], mc: [], text: [] };
    const main = revlogData.map((r) => (r.ease - 1) / 3);
    return { main, flip: [], mc: [], text: [] };
  }, [revlogData]);

  return {
    insights,
    revlogData,
    chartData,
    isExtracting,
    currentCardId,
    newInsightIds,
    noNewInsights,
    loadInsights,
    saveInsights,
    extractInsights,
    markInsightsSeen,
    setInsights,
  };
}
