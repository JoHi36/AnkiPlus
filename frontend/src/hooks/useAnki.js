import { useEffect, useState } from 'react';

/**
 * Hook für die Anki-Bridge (Message-Queue System)
 * Stellt die Verbindung zwischen React und Python her
 */
export function useAnki() {
  const [bridge, setBridge] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.log('useAnki: Initialisiere Bridge (Message-Queue System)...');
    
    // Prüfe ob ankiBridge verfügbar ist
    const checkBridge = () => {
      if (window.ankiBridge && window.ankiBridge.addMessage) {
        console.log('useAnki: ankiBridge gefunden');
        
        const bridgeWrapper = {
          sendMessage: (msg, history = null, mode = 'compact') => {
            console.log('Bridge: sendMessage aufgerufen:', msg?.substring(0, 50), 'Historie:', history?.length || 0, 'Modus:', mode);
            if (window.ankiBridge) {
              // Sende Nachricht mit optionaler Historie und Modus
              window.ankiBridge.addMessage('sendMessage', { 
                message: msg, 
                history: history,
                mode: mode
              });
            }
          },
          cancelRequest: () => {
            console.log('Bridge: cancelRequest aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('cancelRequest', null);
            }
          },
          setModel: (model) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('setModel', model);
            }
          },
          openSettings: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openSettings', null);
            }
          },
          closePanel: () => {
            console.log('Bridge: closePanel aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('closePanel', null);
            }
          },
          previewCard: (cardId) => {
            console.log('Bridge: previewCard aufgerufen für Card:', cardId);
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('previewCard', String(cardId));
            }
          },
          getCurrentConfig: () => {
            // Synchroner Aufruf - fordere Config an und warte auf Antwort
            console.log('Bridge: getCurrentConfig aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getCurrentConfig', null);
            }
            // Prüfe ob wir gecachte Config haben
            if (window._cachedConfig) {
              console.log('Bridge: Verwende gecachte Config');
              return JSON.stringify(window._cachedConfig);
            }
            // Fallback: Leere Config
            return JSON.stringify({ api_key: '', provider: 'google', model: '' });
          },
          fetchModels: (provider, api_key) => {
            // Synchroner Aufruf - fordere Modelle an und warte auf Antwort
            console.log('Bridge: fetchModels aufgerufen mit API-Key Länge:', api_key?.length || 0);
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('fetchModels', { provider, api_key });
            }
            // Prüfe ob wir gecachte Modelle haben
            if (window._cachedModels) {
              console.log('Bridge: Verwende gecachte Modelle');
              return JSON.stringify({ success: true, models: window._cachedModels, error: null });
            }
            // Fallback: Leere Liste
            return JSON.stringify({ success: false, models: [], error: 'Lade Modelle...' });
          },
          saveSettings: (api_key, provider, model_name) => {
            console.log('Bridge: saveSettings aufgerufen mit API-Key Länge:', api_key?.length || 0);
            if (window.ankiBridge) {
              const payload = { 
                api_key, 
                provider, 
                model_name 
              };
              console.log('Bridge: Sende saveSettings Payload:', JSON.stringify(payload).substring(0, 100));
              window.ankiBridge.addMessage('saveSettings', payload);
            } else {
              console.error('Bridge: ankiBridge nicht verfügbar!');
            }
          },
          authenticate: (token, refreshToken) => {
            console.log('Bridge: authenticate aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('authenticate', { token, refreshToken });
            }
          },
          getAuthStatus: () => {
            console.log('Bridge: getAuthStatus aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getAuthStatus', null);
            }
            // Fallback: Nicht authentifiziert
            return JSON.stringify({
              authenticated: false,
              hasToken: false,
              backendUrl: '',
              backendMode: false
            });
          },
          refreshAuth: () => {
            console.log('Bridge: refreshAuth aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('refreshAuth', null);
            }
          },
          handleAuthDeepLink: (url) => {
            console.log('Bridge: handleAuthDeepLink aufgerufen:', url?.substring(0, 100));
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('handleAuthDeepLink', url);
            }
          },
          getCurrentDeck: () => {
            console.log('Bridge: getCurrentDeck aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getCurrentDeck', null);
            }
          },
          getAvailableDecks: () => {
            console.log('Bridge: getAvailableDecks aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getAvailableDecks', null);
            }
          },
          openDeck: (deck_id) => {
            console.log('Bridge: openDeck aufgerufen', deck_id);
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openDeck', deck_id);
            }
          },
          openDeckBrowser: () => {
            console.log('Bridge: openDeckBrowser aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openDeckBrowser', null);
            }
          },
          getDeckStats: (deck_id) => {
            // Asynchroner Aufruf über Message-Queue System
            console.log('Bridge: getDeckStats aufgerufen', deck_id);
            if (window.ankiBridge && window.ankiBridge.addMessage) {
              // Verwende Message-Queue System
              window.ankiBridge.addMessage('getDeckStats', deck_id);
              // Da es asynchron ist, müssen wir das Ergebnis über ankiReceive erhalten
              // Für jetzt: Gib leere Statistiken zurück, das Ergebnis kommt über Event
              // Die Komponente muss das Event abonnieren
              return JSON.stringify({ 
                totalCards: 0,
                cards1x: 0,
                cards2x: 0,
                cards3x: 0,
                level1Percent: 0,
                level2Percent: 0,
                level3Percent: 0,
                pending: true // Flag dass Daten noch kommen
              });
            }
            // Fallback: Leere Statistiken
            return JSON.stringify({ 
              totalCards: 0,
              cards1x: 0,
              cards2x: 0,
              cards3x: 0,
              level1Percent: 0,
              level2Percent: 0,
              level3Percent: 0
            });
          },
          generateSectionTitle: (question, answer, callback) => {
            console.log('Bridge: generateSectionTitle aufgerufen');
            if (window.ankiBridge) {
              // Speichere Callback für Antwort
              window._sectionTitleCallback = callback;
              window.ankiBridge.addMessage('generateSectionTitle', { question, answer });
            }
          },
          goToCard: (cardId) => {
            console.log('Bridge: goToCard aufgerufen', cardId);
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('goToCard', cardId);
            }
          },
          getCardDetails: (cardId) => {
            console.log('Bridge: getCardDetails aufgerufen', cardId);
            return new Promise((resolve, reject) => {
              // Speichere Callback für Antwort
              const callbackId = `getCardDetails_${Date.now()}_${Math.random()}`;
              window._getCardDetailsCallbacks = window._getCardDetailsCallbacks || {};
              window._getCardDetailsCallbacks[callbackId] = { resolve, reject };
              
              // Setze Timeout für Fehlerbehandlung
              setTimeout(() => {
                if (window._getCardDetailsCallbacks && window._getCardDetailsCallbacks[callbackId]) {
                  delete window._getCardDetailsCallbacks[callbackId];
                  reject(new Error('getCardDetails timeout'));
                }
              }, 10000); // 10 Sekunden Timeout
              
              if (window.ankiBridge) {
                window.ankiBridge.addMessage('getCardDetails', { cardId, callbackId });
              } else {
                reject(new Error('Bridge nicht verfügbar'));
              }
            });
          },
          showAnswer: () => {
            console.log('Bridge: showAnswer aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('showAnswer', null);
            }
          },
          hideAnswer: () => {
            console.log('Bridge: hideAnswer aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('hideAnswer', null);
            }
          },
          loadSessions: () => {
            console.log('Bridge: loadSessions aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('loadSessions', null);
            }
          },
          saveSessions: (sessions) => {
            console.log('Bridge: saveSessions aufgerufen', sessions?.length || 0, 'Sessions');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveSessions', JSON.stringify(sessions));
            }
          },
          fetchImage: (url, callback) => {
            console.log('Bridge: fetchImage aufgerufen', url?.substring(0, 50));
            if (window.ankiBridge) {
              // Speichere Callback für Antwort (mit URL als Key)
              if (!window._imageCallbacks) {
                window._imageCallbacks = {};
              }
              window._imageCallbacks[url] = callback;
              window.ankiBridge.addMessage('fetchImage', url);
            }
          },
          getAITools: () => {
            console.log('Bridge: getAITools aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getAITools', null);
            }
            // Prüfe ob wir gecachte Tools haben
            if (window._cachedAITools) {
              console.log('Bridge: Verwende gecachte AI Tools');
              return JSON.stringify(window._cachedAITools);
            }
            // Fallback: Standardwerte
            const defaultTools = {
              images: true,
              diagrams: true,
              molecules: false
            };
            return JSON.stringify(defaultTools);
          },
          saveAITools: (toolsJson) => {
            console.log('Bridge: saveAITools aufgerufen');
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveAITools', toolsJson);
            }
            // Cache für synchrone Aufrufe
            try {
              const tools = JSON.parse(toolsJson);
              window._cachedAITools = tools;
            } catch (e) {
              console.warn('Bridge: Fehler beim Parsen der Tools:', e);
            }
          }
        };
        
        setBridge(bridgeWrapper);
        setIsReady(true);
        console.log('✅ useAnki: Bridge gesetzt, isReady=true');
        
        return true;
      }
      return false;
    };
    
    // Versuche sofort
    if (checkBridge()) {
      return;
    }
    
    // Warte auf ankiBridge (wird von Python initialisiert)
    let retryCount = 0;
    const maxRetries = 100; // 10 Sekunden
    const checkInterval = setInterval(() => {
      retryCount++;
      if (checkBridge()) {
        clearInterval(checkInterval);
      } else if (retryCount >= maxRetries) {
        clearInterval(checkInterval);
        console.error('useAnki: ankiBridge konnte nach', maxRetries, 'Versuchen nicht gefunden werden');
        // Fallback: Mock-Bridge für Development
        console.log('useAnki: Verwende Mock-Bridge als Fallback');
        const mockState = {
          currentRequestTimeout: null
        };
        setBridge({
          sendMessage: (msg, history = null, mode = 'compact') => {
            console.log('Mock: sendMessage', msg, 'Historie:', history?.length || 0, 'Modus:', mode);
            if (mockState.currentRequestTimeout) {
              clearTimeout(mockState.currentRequestTimeout);
              mockState.currentRequestTimeout = null;
            }
            if (window.ankiReceive) {
              window.ankiReceive({ type: 'loading' });
            }
            mockState.currentRequestTimeout = setTimeout(() => {
              if (window.ankiReceive) {
                const historyInfo = history ? ` (Mit ${history.length} Nachrichten Historie)` : '';
                const modeInfo = mode === 'detailed' ? ' [Ausführlich]' : ' [Kompakt]';
                const mockResponse = `Das ist eine simulierte Antwort auf deine Nachricht: "${msg}".${historyInfo}${modeInfo} Im Browser-Modus werden nur Mock-Antworten angezeigt.`;
                window.ankiReceive({ 
                  type: 'bot', 
                  message: mockResponse 
                });
              }
              mockState.currentRequestTimeout = null;
            }, 1500);
          },
          cancelRequest: () => {
            console.log('Mock: cancelRequest');
            if (mockState.currentRequestTimeout) {
              clearTimeout(mockState.currentRequestTimeout);
              mockState.currentRequestTimeout = null;
            }
          },
          setModel: (model) => console.log('Mock: setModel', model),
          openSettings: () => console.log('Mock: openSettings'),
          closePanel: () => console.log('Mock: closePanel'),
          getCurrentConfig: () => JSON.stringify({ api_key: '', provider: 'google', model: '' }),
          fetchModels: () => JSON.stringify({ success: true, models: [], error: null }),
          saveSettings: () => console.log('Mock: saveSettings'),
          authenticate: () => console.log('Mock: authenticate'),
          getAuthStatus: () => JSON.stringify({ authenticated: false, hasToken: false, backendUrl: '', backendMode: false }),
          refreshAuth: () => console.log('Mock: refreshAuth'),
          handleAuthDeepLink: () => console.log('Mock: handleAuthDeepLink'),
          showAnswer: () => console.log('Mock: showAnswer'),
          hideAnswer: () => console.log('Mock: hideAnswer'),
          getCurrentDeck: () => {
            console.log('Mock: getCurrentDeck');
            // Mock: Kein Deck aktiv
            if (window.ankiReceive) {
              window.ankiReceive({
                type: 'currentDeck',
                data: { deckId: null, deckName: null, isInDeck: false }
              });
            }
          },
          getAvailableDecks: () => {
            console.log('Mock: getAvailableDecks');
            // Mock: Leere Liste
            if (window.ankiReceive) {
              window.ankiReceive({
                type: 'availableDecks',
                data: { decks: [] }
              });
            }
          },
          openDeck: (deck_id) => console.log('Mock: openDeck', deck_id),
          getDeckStats: (deck_id) => {
            console.log('Mock: getDeckStats', deck_id);
            // Mock: Simuliere Statistiken
            return JSON.stringify({
              totalCards: 100,
              cards1x: 75,
              cards2x: 50,
              cards3x: 25,
              level1Percent: 75,
              level2Percent: 50,
              level3Percent: 25
            });
          },
          generateSectionTitle: (question, answer, callback) => {
            console.log('Mock: generateSectionTitle');
            // Simuliere Titel-Generierung
            setTimeout(() => {
              if (callback) {
                callback('Lernkarte');
              }
            }, 500);
          },
          goToCard: (cardId) => console.log('Mock: goToCard', cardId),
          loadSessions: () => {
            console.log('Mock: loadSessions');
            // Mock: Sende leere Sessions
            if (window.ankiReceive) {
              window.ankiReceive({
                type: 'sessionsLoaded',
                data: { sessions: [] }
              });
            }
          },
          saveSessions: (sessions) => {
            console.log('Mock: saveSessions', sessions?.length || 0, 'Sessions');
            // Mock: Speichere in localStorage als Fallback
            try {
              localStorage.setItem('ankiChatSessions', JSON.stringify(sessions));
            } catch (e) {
              console.warn('Mock: localStorage nicht verfügbar');
            }
          },
          fetchImage: (url, callback) => {
            console.log('Mock: fetchImage', url?.substring(0, 50));
            // Mock: Gib Fehler zurück (keine echte Bildladung im Browser-Modus)
            if (callback) {
              callback({ success: false, error: 'Browser-Modus: Keine Bildladung möglich' });
            }
          },
          getAITools: () => {
            console.log('Mock: getAITools');
            // Mock: Standardwerte
            const defaultTools = {
              images: true,
              diagrams: true,
              molecules: false
            };
            return JSON.stringify(defaultTools);
          },
          saveAITools: (toolsJson) => {
            console.log('Mock: saveAITools', toolsJson);
            // Mock: Speichere in localStorage als Fallback
            try {
              localStorage.setItem('ankiChatAITools', toolsJson);
            } catch (e) {
              console.warn('Mock: localStorage nicht verfügbar');
            }
          }
        });
        setIsReady(true);
      }
    }, 100);
    
    return () => clearInterval(checkInterval);
  }, []);

  return { bridge, isReady };
}
