import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './src/index.css';
import App from './App';

// #region agent log
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32';
const log = (location: string, message: string, data: any) => {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'runtime-debug',
    })
  }).catch(() => {});
  // Also log to console for immediate visibility
  console.log(`[DEBUG] ${location}: ${message}`, data);
};
// #endregion

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // #region agent log
    log('index.tsx:ErrorBoundary', 'React Error Caught', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      hypothesisId: 'A'
    });
    // #endregion
    console.error('React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '2rem', 
          color: 'white', 
          background: '#030303',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️ Error</h1>
          <pre style={{ 
            background: '#1a1a1a', 
            padding: '1rem', 
            borderRadius: '8px',
            overflow: 'auto',
            maxWidth: '800px'
          }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// #region agent log
log('index.tsx:init', 'Starting app initialization', {
  rootExists: !!document.getElementById('root'),
  hypothesisId: 'B'
});
// #endregion

const rootElement = document.getElementById('root');
if (!rootElement) {
  // #region agent log
  log('index.tsx:init', 'Root element not found', {
    hypothesisId: 'C'
  });
  // #endregion
  throw new Error("Could not find root element to mount to");
}

// #region agent log
log('index.tsx:init', 'Root element found, creating React root', {
  hypothesisId: 'D'
});
// #endregion

const root = ReactDOM.createRoot(rootElement);

// #region agent log
log('index.tsx:init', 'Rendering app', {
  hypothesisId: 'E'
});
// #endregion

root.render(
  <ErrorBoundary>
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  </ErrorBoundary>
);

// #region agent log
log('index.tsx:init', 'Render call completed', {
  hypothesisId: 'G'
});
// #endregion