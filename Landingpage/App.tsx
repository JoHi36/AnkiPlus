import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './src/contexts/AuthContext';
import { ProtectedRoute } from './src/components/ProtectedRoute';
import { LandingPage } from './src/pages/LandingPage';
import { AuthPage } from './src/pages/AuthPage';
import { AccountPage } from './src/pages/AccountPage';
import { AuthCallbackPage } from './src/pages/AuthCallbackPage';

/** Redirect that preserves query params (needed for ?link= forwarding) */
function RedirectWithParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={to + location.search} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Active routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/auth/callback" element={<ProtectedRoute><AuthCallbackPage /></ProtectedRoute>} />

        {/* Redirects for old routes */}
        <Route path="/register" element={<RedirectWithParams to="/login" />} />
        <Route path="/install" element={<Navigate to="/" replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/account" replace />} />
        <Route path="/dashboard" element={<Navigate to="/account" replace />} />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
