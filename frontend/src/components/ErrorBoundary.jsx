import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

/**
 * Error Boundary Komponente
 * Fängt React-Fehler ab und verhindert, dass die gesamte App crasht
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    console.error('ErrorBoundary: Error caught -', error?.message, error?.name);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Optional: Log to backend (can be implemented later)
    // this.logErrorToBackend(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Optionally trigger a re-render or reset
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  }

  handleReload = () => {
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      // KRITISCH: Sicherstellen dass error.message ein String ist (verhindert React Error #60)
      let safeErrorMessage = 'Unbekannter Fehler';
      try {
        const err = this.state.error;
        if (err === null || err === undefined) {
          safeErrorMessage = 'Ein Fehler ist aufgetreten';
        } else if (typeof err === 'string') {
          safeErrorMessage = err;
        } else if (typeof err === 'object') {
          // Versuche message zu extrahieren
          if (typeof err.message === 'string') {
            safeErrorMessage = err.message;
          } else if (typeof err.message === 'object') {
            // message ist ein Objekt → Konvertiere zu String (verhindert [object Object])
            safeErrorMessage = JSON.stringify(err.message);
          } else if (err.toString && err.toString() !== '[object Object]') {
            safeErrorMessage = err.toString();
          } else {
            safeErrorMessage = 'Ein unerwarteter Fehler ist aufgetreten';
          }
        } else {
          safeErrorMessage = String(err);
        }
      } catch (e) {
        safeErrorMessage = 'Fehler beim Anzeigen der Fehlermeldung';
        console.error('🔍 [ErrorBoundary] Error in render:', e);
      }
      
      // Final validation
      safeErrorMessage = String(safeErrorMessage || 'Ein Fehler ist aufgetreten');
      
      const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
      
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-base-100">
          <div className="max-w-md w-full bg-base-200 rounded-xl p-6 shadow-lg border border-error/20">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-error" size={24} />
              <h2 className="text-xl font-semibold text-error">
                Ein Fehler ist aufgetreten
              </h2>
            </div>
            
            <div className="text-sm text-base-content/70 mb-6 bg-base-300 p-4 rounded-lg">
              {safeErrorMessage}
            </div>
            
            {isDevelopment && this.state.errorInfo && (
              <details className="mb-4 text-xs">
                <summary className="cursor-pointer text-base-content/50 hover:text-base-content mb-2">
                  Technische Details (Development)
                </summary>
                <pre className="bg-base-300 p-3 rounded overflow-auto max-h-48 text-xs">
                  {this.state.error?.stack || 'No stack trace available'}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack || 'No component stack'}
                </pre>
              </details>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-content rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RefreshCw size={16} />
                Erneut versuchen
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-base-300 text-base-content rounded-lg hover:bg-base-300/80 transition-colors"
              >
                <Home size={16} />
                Seite neu laden
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

