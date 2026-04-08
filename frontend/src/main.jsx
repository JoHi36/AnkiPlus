import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ComponentViewer from './ComponentViewer';
import GlassLab from './GlassLab';
import RemoteDockLab from './RemoteDockLab';
import { ReasoningProvider } from './reasoning/store/ReasoningProvider';
import { initFrontendLogger, frontendLog } from './utils/frontendLogger';
import './index.css';
import './styles/card-enhancement.css';
import 'katex/dist/katex.min.css'; // KaTeX CSS

if (typeof window !== 'undefined') {
  // Initialize frontend log buffer before anything else
  initFrontendLogger();
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
      frontendLog('ankiReceive:early', payload.type);
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

const params = new URLSearchParams(window.location.search);
const view = params.get('view');

const root = ReactDOM.createRoot(document.getElementById('root'));

try {
  if (view === 'components') {
    // Design System Viewer — localhost:3000?view=components
    root.render(
      <React.StrictMode>
        <ReasoningProvider>
          <ComponentViewer />
        </ReasoningProvider>
      </React.StrictMode>
    );
  } else if (view === 'glass') {
    // Glass Lab — localhost:3000?view=glass
    root.render(
      <React.StrictMode>
        <GlassLab />
      </React.StrictMode>
    );
  } else if (view === 'remote-dock') {
    // Remote Dock Lab — localhost:3000?view=remote-dock
    root.render(
      <React.StrictMode>
        <RemoteDockLab />
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
}
