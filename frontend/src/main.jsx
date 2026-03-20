import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FreeChatApp from './FreeChatApp';
import './index.css';
import 'katex/dist/katex.min.css'; // KaTeX CSS

if (typeof window !== 'undefined') {
  // Define window.ankiReceive immediately, before React renders
  // Python calls this before React is even running
  if (!window.ankiReceive) {
    window._ankiReceiveQueue = [];
    window.ankiReceive = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      if (window._ankiReceiveQueue) {
        window._ankiReceiveQueue.push(payload);
      }
    };
  }
}

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

const root = ReactDOM.createRoot(document.getElementById('root'));

try {
  if (mode === 'freechat') {
    root.render(
      <React.StrictMode>
        <FreeChatApp />
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
} catch (error) {
  console.error('❌ Fehler beim Rendern der App:', error);
}
