import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'katex/dist/katex.min.css'; // KaTeX CSS

if (typeof window !== 'undefined') {
  // Apply dark theme immediately to avoid flash of unstyled content
  // Python will send the correct theme via init payload; this is the safe default
  document.documentElement.setAttribute('data-theme', 'dark');

  // Define window.ankiReceive immediately, before React renders
  // Python calls this before React is even running
  if (!window.ankiReceive) {
    window._ankiReceiveQueue = [];
    window.ankiReceive = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      // Apply theme immediately when received — before React is ready
      if ((payload.type === 'init' || payload.type === 'themeChanged' || payload.type === 'themeLoaded') && payload.resolvedTheme) {
        document.documentElement.setAttribute('data-theme', payload.resolvedTheme);
      }
      if (window._ankiReceiveQueue) {
        window._ankiReceiveQueue.push(payload);
      }
    };
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error('Fehler beim Rendern der App:', error);
}
