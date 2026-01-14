import React from 'react';

/**
 * Error Boundary Komponente
 * Fängt React-Fehler ab und verhindert, dass die gesamte App crasht
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    console.error('ErrorBoundary: Error caught -', error?.message, error?.name);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
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
      
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-base-content/70">
          <div className="text-lg font-semibold mb-2 text-error">
            Ein Fehler ist aufgetreten
          </div>
          <div className="text-sm text-base-content/50 mb-4">
            {safeErrorMessage}
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 bg-primary text-primary-content rounded-lg hover:bg-primary/90 transition-colors"
          >
            Seite neu laden
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

