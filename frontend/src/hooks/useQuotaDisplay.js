import { useState, useEffect } from 'react';

/**
 * Hook für Quota-Anzeige im ChatInput
 * Unterstützt sowohl authentifizierte als auch anonyme User
 */
export function useQuotaDisplay(bridge, authStatus, currentAuthToken, isDetailedMode) {
  const [quotaDisplay, setQuotaDisplay] = useState(null);

  useEffect(() => {
    // Für anonyme User: Device-ID aus localStorage
    const getDeviceId = () => {
      try {
        return localStorage.getItem('anki_chatbot_device_id') || null;
      } catch (e) {
        return null;
      }
    };

    const fetchQuota = async () => {
      // Prüfe ob authentifiziert
      const hasValidToken = currentAuthToken && currentAuthToken.trim() !== '';
      const isAuthenticated = hasValidToken && authStatus.authenticated && authStatus.hasToken;

      if (!authStatus.backendUrl) {
        setQuotaDisplay(null);
        return;
      }

      try {
        if (isAuthenticated) {
          // Authentifizierter User: Hole Quota vom Backend
          const response = await fetch(`${authStatus.backendUrl}/user/quota`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentAuthToken}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const mode = isDetailedMode ? 'deep' : 'flash';
            const quota = mode === 'deep' ? data.deep : data.flash;
            
            setQuotaDisplay({
              used: quota.used || 0,
              limit: quota.limit === -1 ? '∞' : quota.limit,
              isUnlimited: quota.limit === -1,
              isAuthenticated: true,
            });
          } else {
            setQuotaDisplay(null);
          }
        } else {
          // Anonymer User: 20 Flash/Tag, 0 Deep/Tag
          const deviceId = getDeviceId();
          if (!deviceId) {
            setQuotaDisplay(null);
            return;
          }

          // Für anonyme User: Hole Quota vom Backend mit Device-ID
          // TODO: Backend-Endpoint für anonyme Quota erstellen
          // Für jetzt: Verwende lokalen State (wird beim Senden aktualisiert)
          const mode = isDetailedMode ? 'deep' : 'flash';
          
          if (mode === 'deep') {
            // Anonyme User können kein Deep Mode nutzen
            setQuotaDisplay({
              used: 0,
              limit: 0,
              isUnlimited: false,
              isAuthenticated: false,
            });
          } else {
            // Flash Mode: 20/Tag für anonyme User
            // TODO: Hole tatsächliche Usage vom Backend
            // Für jetzt: Verwende localStorage als Fallback
            const today = new Date().toISOString().split('T')[0];
            const key = `quota_${deviceId}_${today}`;
            const used = parseInt(localStorage.getItem(key) || '0', 10);
            
            setQuotaDisplay({
              used: used,
              limit: 20,
              isUnlimited: false,
              isAuthenticated: false,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching quota:', error);
        setQuotaDisplay(null);
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 30000); // Alle 30 Sekunden aktualisieren
    return () => clearInterval(interval);
  }, [bridge, authStatus, currentAuthToken, isDetailedMode]);

  return quotaDisplay;
}

