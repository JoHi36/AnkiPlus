import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './src/contexts/AuthContext';
import { ProtectedRoute } from './src/components/ProtectedRoute';
import { LandingPage } from './src/pages/LandingPage';
import { LoginPage } from './src/pages/LoginPage';
import { RegisterPage } from './src/pages/RegisterPage';
import { DashboardPage } from './src/pages/DashboardPage';
import { InstallPage } from './src/pages/InstallPage';
import { AuthCallbackPage } from './src/pages/AuthCallbackPage';
import { useEffect } from 'react';

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
  console.log(`[DEBUG] ${location}: ${message}`, data);
};
// #endregion

function App() {
  // #region agent log
  useEffect(() => {
    log('App.tsx:mount', 'App component mounted', {
      pathname: window.location.pathname,
      hypothesisId: 'H'
    });
  }, []);
  // #endregion

  // #region agent log
  try {
    log('App.tsx:render', 'App component rendering', {
      hypothesisId: 'I'
    });
  } catch (e) {
    log('App.tsx:render', 'Error during App render', {
      error: String(e),
      hypothesisId: 'J'
    });
  }
  // #endregion

  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/install" element={<InstallPage />} />
        
        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <ProtectedRoute>
              <AuthCallbackPage />
            </ProtectedRoute>
          }
        />
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
