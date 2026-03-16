import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export interface QuotaData {
  tier: 'free' | 'tier1' | 'tier2';
  flash: {
    used: number;
    limit: number; // -1 for unlimited
    remaining: number; // -1 for unlimited
  };
  deep: {
    used: number;
    limit: number;
    remaining: number;
  };
  resetAt: string; // ISO date string
}

const DEFAULT_BACKEND_URL = 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';

export function useQuota() {
  const { user, getAuthToken } = useAuth();
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuota = async () => {
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
      const response = await fetch(`${backendUrl}/user/quota`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setQuota(data);
    } catch (err: any) {
      console.error('Error fetching quota:', err);
      setError(err.message || 'Fehler beim Laden der Quota');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuota();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, getAuthToken]);

  return {
    quota,
    loading,
    error,
    refetch: fetchQuota,
  };
}

