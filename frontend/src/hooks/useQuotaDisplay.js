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
        const deviceId = localStorage.getItem('anki_chatbot_device_id') || null;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useQuotaDisplay.js:13',message:'getDeviceId called',data:{deviceId:deviceId,hasDeviceId:!!deviceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        return deviceId;
      } catch (e) {
        return null;
      }
    };

    const fetchQuota = async () => {
      // Prüfe ob authentifiziert
      const hasValidToken = currentAuthToken && currentAuthToken.trim() !== '';
      const isAuthenticated = hasValidToken && authStatus.authenticated && authStatus.hasToken;

      try {
        if (isAuthenticated && authStatus.backendUrl) {
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
            // Fallback: Verwende lokale Quota auch für authentifizierte User
            const deviceId = getDeviceId();
            if (deviceId) {
              const today = new Date().toISOString().split('T')[0];
              const key = `quota_${deviceId}_${today}`;
              const used = parseInt(localStorage.getItem(key) || '0', 10);
              const mode = isDetailedMode ? 'deep' : 'flash';
              
              if (mode === 'deep') {
                setQuotaDisplay({
                  used: 0,
                  limit: 0,
                  isUnlimited: false,
                  isAuthenticated: true,
                });
              } else {
                setQuotaDisplay({
                  used: used,
                  limit: 20,
                  isUnlimited: false,
                  isAuthenticated: true,
                });
              }
            }
          }
        } else {
          // Anonymer User: 20 Flash/Tag, 0 Deep/Tag
          const deviceId = getDeviceId();
          if (!deviceId) {
            // Erstelle Device-ID falls nicht vorhanden
            try {
              const newDeviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              localStorage.setItem('anki_chatbot_device_id', newDeviceId);
              // Retry mit neuer Device-ID
              const today = new Date().toISOString().split('T')[0];
              const key = `quota_${newDeviceId}_${today}`;
              const used = parseInt(localStorage.getItem(key) || '0', 10);
              const mode = isDetailedMode ? 'deep' : 'flash';
              
              if (mode === 'deep') {
                setQuotaDisplay({
                  used: 0,
                  limit: 0,
                  isUnlimited: false,
                  isAuthenticated: false,
                });
              } else {
                setQuotaDisplay({
                  used: used,
                  limit: 20,
                  isUnlimited: false,
                  isAuthenticated: false,
                });
              }
              return;
            } catch (e) {
              console.error('Error creating Device-ID:', e);
              setQuotaDisplay(null);
              return;
            }
          }

          // Für anonyme User: Verwende localStorage
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
            const today = new Date().toISOString().split('T')[0];
            const key = `quota_${deviceId}_${today}`;
            const used = parseInt(localStorage.getItem(key) || '0', 10);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useQuotaDisplay.js:82',message:'Anonymous quota fetched from localStorage',data:{deviceId:deviceId,key:key,used:used,limit:20},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
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
        // Fallback: Versuche lokale Quota auch bei Fehler
        const deviceId = getDeviceId();
        if (deviceId) {
          const today = new Date().toISOString().split('T')[0];
          const key = `quota_${deviceId}_${today}`;
          const used = parseInt(localStorage.getItem(key) || '0', 10);
          const mode = isDetailedMode ? 'deep' : 'flash';
          
          if (mode === 'deep') {
            setQuotaDisplay({
              used: 0,
              limit: 0,
              isUnlimited: false,
              isAuthenticated: false,
            });
          } else {
            setQuotaDisplay({
              used: used,
              limit: 20,
              isUnlimited: false,
              isAuthenticated: false,
            });
          }
        } else {
          setQuotaDisplay(null);
        }
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 30000); // Alle 30 Sekunden aktualisieren
    return () => clearInterval(interval);
  }, [bridge, authStatus, currentAuthToken, isDetailedMode]);

  return quotaDisplay;
}

