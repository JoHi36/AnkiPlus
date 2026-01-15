import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'katex/dist/katex.min.css'; // KaTeX CSS

// Debug: Stelle sicher, dass die App initialisiert wird
console.log('🎯 main.jsx: App wird initialisiert');
if (typeof window !== 'undefined') {
  console.log('🌐 main.jsx: Läuft im Browser -', window.location.href);
  
  // WICHTIG: Definiere window.ankiReceive SOFORT, bevor React rendert
  // Python ruft dies auf, bevor React überhaupt läuft
  if (!window.ankiReceive) {
    window._ankiReceiveQueue = [];
    window.ankiReceive = (payload) => {
      if (!payload || typeof payload !== 'object') {
        console.warn('⚠️ main.jsx: Ungültiges Payload (vor React):', payload);
        return;
      }
      // Queue die Nachricht, wird in App.jsx verarbeitet
      if (window._ankiReceiveQueue) {
        window._ankiReceiveQueue.push(payload);
        console.error('🔵 DEBUG main.jsx: Nachricht gequeued (vor React):', payload.type, 'Queue length:', window._ankiReceiveQueue.length);
        console.log('📥 main.jsx: Nachricht gequeued (vor React):', payload.type);
      } else {
        console.error('🔵 DEBUG main.jsx: Queue nicht verfügbar!');
      }
    };
    console.log('✅ main.jsx: window.ankiReceive initialisiert (Queue-System)');
  }
}

console.log('🔍🔍🔍 DEBUG BUILD VERSION: 2026-01-10-v4-DEVELOPMENT-MODE 🔍🔍🔍', {hasRoot: !!document.getElementById('root'), timestamp: Date.now()});

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('✅ App erfolgreich gerendert');
} catch (error) {
  console.error('❌ Fehler beim Rendern der App:', error);
}

