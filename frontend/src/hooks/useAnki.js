import { useEffect, useState } from 'react';
import { registerCallback, invokeAndRemove } from '../utils/callbackRegistry';

/**
 * Hook für die Anki-Bridge (Message-Queue System)
 * Stellt die Verbindung zwischen React und Python her
 */
export function useAnki() {
  const [bridge, setBridge] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    
    // Prüfe ob ankiBridge verfügbar ist
    const checkBridge = () => {
      if (window.ankiBridge && window.ankiBridge.addMessage) {
        
        const bridgeWrapper = {
          sendMessage: (msg, history = null, mode = 'compact', requestId = null, agent = undefined) => {
            if (window.ankiBridge) {
              // Sende Nachricht mit optionaler Historie, Modus, requestId und agent
              window.ankiBridge.addMessage('sendMessage', {
                message: msg,
                history: history,
                mode: mode,
                requestId: requestId,
                agent: agent
              });
            }
          },
          cancelRequest: () => {
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
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('closePanel', null);
            }
          },
          advanceCard: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('advanceCard', null);
            }
          },
          previewCard: (cardId) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('previewCard', String(cardId));
            }
          },
          openPreview: (cardId) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openPreview', { cardId: String(cardId) });
            }
          },
          getCurrentConfig: () => {
            // Synchroner Aufruf - fordere Config an und warte auf Antwort
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getCurrentConfig', null);
            }
            // Prüfe ob wir gecachte Config haben
            if (window._cachedConfig) {
              return JSON.stringify(window._cachedConfig);
            }
            // Fallback: Leere Config
            return JSON.stringify({ api_key: '', provider: 'google', model: '' });
          },
          fetchModels: (provider, api_key) => {
            // Synchroner Aufruf - fordere Modelle an und warte auf Antwort
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('fetchModels', { provider, api_key });
            }
            // Prüfe ob wir gecachte Modelle haben
            if (window._cachedModels) {
              return JSON.stringify({ success: true, models: window._cachedModels, error: null });
            }
            // Fallback: Leere Liste
            return JSON.stringify({ success: false, models: [], error: 'Lade Modelle...' });
          },
          saveSettings: (api_key, provider, model_name) => {
            if (window.ankiBridge) {
              const payload = { 
                api_key, 
                provider, 
                model_name 
              };
              window.ankiBridge.addMessage('saveSettings', payload);
            } else {
            }
          },
          authenticate: (token, refreshToken) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('authenticate', { token, refreshToken });
            }
          },
          getAuthStatus: () => {
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
          getAuthToken: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getAuthToken', null);
            }
            // Fallback: Leerer Token
            return Promise.resolve("");
          },
          refreshAuth: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('refreshAuth', null);
            }
          },
          startLinkAuth: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('startLinkAuth', null);
            }
          },
          logout: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('logout', null);
            }
          },
          openUrl: (url) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openUrl', url);
            }
          },
          handleAuthDeepLink: (url) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('handleAuthDeepLink', url);
            }
          },
          getCurrentDeck: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getCurrentDeck', null);
            }
          },
          getAvailableDecks: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getAvailableDecks', null);
            }
          },
          openDeck: (deck_id) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openDeck', deck_id);
            }
          },
          openDeckBrowser: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('openDeckBrowser', null);
            }
          },
          getDeckStats: (deck_id) => {
            // Asynchroner Aufruf über Message-Queue System
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
          generateSectionTitle: (question, answer, _callback) => {
            if (window.ankiBridge) {
              // Section title result is handled by useChat via sectionTitleGenerated event.
              // No callback storage needed.
              window.ankiBridge.addMessage('generateSectionTitle', { question, answer });
            }
          },
          goToCard: (cardId) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('goToCard', cardId);
            }
          },
          getCardDetails: (cardId) => {
            return new Promise((resolve, reject) => {
              const callbackId = `getCardDetails_${Date.now()}_${Math.random()}`;
              // App.jsx calls invokeAndRemove('getCardDetails', callbackId, resolvedJson)
              // on the 'cardDetails' response event.
              registerCallback('getCardDetails', callbackId, (resultJson) => {
                if (resultJson === null) {
                  reject(new Error('getCardDetails timeout'));
                } else {
                  resolve(resultJson);
                }
              });

              // Timeout: pass null to signal rejection
              setTimeout(() => {
                invokeAndRemove('getCardDetails', callbackId, null);
              }, 10000); // 10 Sekunden Timeout

              if (window.ankiBridge) {
                window.ankiBridge.addMessage('getCardDetails', { cardId, callbackId });
              } else {
                reject(new Error('Bridge nicht verfügbar'));
              }
            });
          },
          saveMultipleChoice: (cardId, quizDataJson, callback) => {
            if (window.ankiBridge) {
              const callbackId = `saveMultipleChoice_${Date.now()}_${Math.random()}`;
              registerCallback('saveMultipleChoice', callbackId, (resultJson) => {
                if (callback) callback(resultJson);
              });

              // Setze Timeout für Fehlerbehandlung
              setTimeout(() => {
                const removed = invokeAndRemove('saveMultipleChoice', callbackId, JSON.stringify({ success: false, error: 'Timeout' }));
                // Only fires callback if not yet resolved
                void removed;
              }, 5000); // 5 Sekunden Timeout

              window.ankiBridge.addMessage('saveMultipleChoice', { cardId, quizDataJson, callbackId });
            } else if (callback) {
              callback(JSON.stringify({ success: false, error: 'Bridge nicht verfügbar' }));
            }
          },
          loadMultipleChoice: (cardId, callback) => {
            if (window.ankiBridge) {
              const callbackId = `loadMultipleChoice_${Date.now()}_${Math.random()}`;
              registerCallback('loadMultipleChoice', callbackId, (resultJson) => {
                if (callback) callback(resultJson);
              });

              // Setze Timeout für Fehlerbehandlung
              setTimeout(() => {
                const removed = invokeAndRemove('loadMultipleChoice', callbackId, JSON.stringify({ success: false, quizData: null, error: 'Timeout' }));
                void removed;
              }, 5000); // 5 Sekunden Timeout

              window.ankiBridge.addMessage('loadMultipleChoice', { cardId, callbackId });
            } else if (callback) {
              callback(JSON.stringify({ success: false, quizData: null, error: 'Bridge nicht verfügbar' }));
            }
          },
          hasMultipleChoice: (cardId, callback) => {
            if (window.ankiBridge) {
              const callbackId = `hasMultipleChoice_${Date.now()}_${Math.random()}`;
              registerCallback('hasMultipleChoice', callbackId, (resultJson) => {
                if (callback) callback(resultJson);
              });

              // Setze Timeout für Fehlerbehandlung
              setTimeout(() => {
                const removed = invokeAndRemove('hasMultipleChoice', callbackId, JSON.stringify({ hasMC: false }));
                void removed;
              }, 5000); // 5 Sekunden Timeout

              window.ankiBridge.addMessage('hasMultipleChoice', { cardId, callbackId });
            } else if (callback) {
              callback(JSON.stringify({ hasMC: false }));
            }
          },
          showAnswer: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('showAnswer', null);
            }
          },
          hideAnswer: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('hideAnswer', null);
            }
          },
          // Per-Card Session Methods (SQLite)
          loadCardSession: (cardId) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('loadCardSession', String(cardId));
            }
          },
          saveCardSession: (dataJson) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveCardSession', dataJson);
            }
          },
          saveCardMessage: (dataJson) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveCardMessage', dataJson);
            }
          },
          saveCardSection: (dataJson) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveCardSection', dataJson);
            }
          },
          navigateToCard: (cardId) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('navigateToCard', String(cardId));
            }
          },
          fetchImage: (url, _callback) => {
            if (window.ankiBridge) {
              // Response is delivered via the 'imageLoaded' CustomEvent (dispatched in App.jsx).
              // No window._ callback storage needed.
              window.ankiBridge.addMessage('fetchImage', url);
            }
          },
          getAITools: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getAITools', null);
            }
            // Prüfe ob wir gecachte Tools haben
            if (window._cachedAITools) {
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
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveAITools', toolsJson);
            }
            // Cache für synchrone Aufrufe
            try {
              const tools = JSON.parse(toolsJson);
              window._cachedAITools = tools;
            } catch (e) {
            }
          },
          saveMascotEnabled: (enabled) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveMascotEnabled', enabled);
            }
          },
          subagentDirect: (agentName, text, extraJson) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('subagentDirect', { agent_name: agentName, text, ...JSON.parse(extraJson || '{}') });
            }
          },
          saveTheme: (theme) => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('saveTheme', theme);
            }
          },
          getTheme: () => {
            if (window.ankiBridge) {
              window.ankiBridge.addMessage('getTheme', null);
            }
          }
        };
        
        setBridge(bridgeWrapper);
        setIsReady(true);
        
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
        // Fallback: Mock-Bridge für Development
        const mockState = {
          currentRequestTimeout: null
        };
        setBridge({
          sendMessage: (msg, history = null, mode = 'compact', requestId = null, agent = undefined) => {
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
            if (mockState.currentRequestTimeout) {
              clearTimeout(mockState.currentRequestTimeout);
              mockState.currentRequestTimeout = null;
            }
          },
          setModel: () => {},
          openSettings: () => {},
          closePanel: () => {},
          advanceCard: () => {},
          getCurrentConfig: () => JSON.stringify({ api_key: '', provider: 'google', model: '' }),
          fetchModels: () => JSON.stringify({ success: true, models: [], error: null }),
          saveSettings: () => {},
          authenticate: () => {},
          getAuthStatus: () => JSON.stringify({ authenticated: false, hasToken: false, backendUrl: '', backendMode: false }),
          refreshAuth: () => {},
          handleAuthDeepLink: () => {},
          showAnswer: () => {},
          hideAnswer: () => {},
          getCurrentDeck: () => {
            // Mock: Kein Deck aktiv
            if (window.ankiReceive) {
              window.ankiReceive({
                type: 'currentDeck',
                data: { deckId: null, deckName: null, isInDeck: false }
              });
            }
          },
          getAvailableDecks: () => {
            // Mock: Leere Liste
            if (window.ankiReceive) {
              window.ankiReceive({
                type: 'availableDecks',
                data: { decks: [] }
              });
            }
          },
          openDeck: () => {},
          getDeckStats: (deck_id) => {
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
            // Simuliere Titel-Generierung
            setTimeout(() => {
              if (callback) {
                callback('Lernkarte');
              }
            }, 500);
          },
          goToCard: () => {},
          loadCardSession: (cardId) => {
            if (window.ankiReceive) {
              window.ankiReceive({
                type: 'cardSessionLoaded',
                data: { cardId: Number(cardId), session: null, sections: [], messages: [] }
              });
            }
          },
          saveCardSession: () => {},
          saveCardMessage: () => {},
          saveCardSection: () => {},
          navigateToCard: () => {},
          fetchImage: (url, callback) => {
            // Mock: Gib Fehler zurück (keine echte Bildladung im Browser-Modus)
            if (callback) {
              callback({ success: false, error: 'Browser-Modus: Keine Bildladung möglich' });
            }
          },
          getAITools: () => {
            // Mock: Standardwerte
            const defaultTools = {
              images: true,
              diagrams: true,
              molecules: false
            };
            return JSON.stringify(defaultTools);
          },
          saveAITools: (toolsJson) => {
            // Mock: Speichere in localStorage als Fallback
            try {
              localStorage.setItem('ankiChatAITools', toolsJson);
            } catch (e) {
            }
          },
          saveMascotEnabled: (enabled) => {
            if (window.ankiReceive) {
              window.ankiReceive({ type: 'mascotEnabledSaved', data: { enabled } });
            }
          },
          subagentDirect: (agentName, text, extraJson) => {
            setTimeout(() => {
              if (window.ankiReceive) {
                window.ankiReceive({ type: 'subagent_result', agent_name: agentName, text: `Mock response from ${agentName}: "${text}"`, error: false });
              }
            }, 800);
          },
          saveTheme: (theme) => {
            document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
            if (window.ankiReceive) {
              window.ankiReceive({ type: 'themeChanged', data: { theme, resolvedTheme: theme === 'light' ? 'light' : 'dark' } });
            }
          },
          getTheme: () => {
            if (window.ankiReceive) {
              window.ankiReceive({ type: 'themeLoaded', data: { theme: 'dark', resolvedTheme: 'dark' } });
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
