import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { DailyUsage } from '../components/UsageChart';

export interface UsageHistoryData {
  dailyUsage: DailyUsage[];
  totalFlash: number;
  totalDeep: number;
  streak: number; // Consecutive days with usage
}

const DEFAULT_BACKEND_URL = 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';

export function useUsageHistory() {
  const { user, getAuthToken } = useAuth();
  const [history, setHistory] = useState<UsageHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsageHistory = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token) {
        throw new Error('Kein Auth-Token verfügbar');
      }

      const backendUrl = import.meta.env.VITE_BACKEND_URL || DEFAULT_BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/user/usage-history`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // If endpoint doesn't exist yet, return mock data
        if (response.status === 404) {
          console.warn('Usage history endpoint not available, using mock data');
          setHistory({
            dailyUsage: [],
            totalFlash: 0,
            totalDeep: 0,
            streak: 0,
          });
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setHistory(data);
    } catch (err: any) {
      console.error('Error fetching usage history:', err);
      setError(err.message || 'Fehler beim Laden der Nutzungsdaten');
      // Fallback to empty data
      setHistory({
        dailyUsage: [],
        totalFlash: 0,
        totalDeep: 0,
        streak: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageHistory();
  }, [user, getAuthToken]);

  return {
    history,
    loading,
    error,
    refetch: fetchUsageHistory,
  };
}

