import React, { useEffect, useState } from 'react';
import { X, Edit3, Loader2, RotateCcw } from 'lucide-react';
import { formatDeckPathWithArrows } from '../utils/deckName';

/**
 * CardPreviewModal - Kompakte Karten-Ansicht mit Flip-Funktion
 * Features:
 * - Zeigt nur Karten-Content (Vorderseite/Rückseite)
 * - Standardmäßig Rückseite
 * - Flip-Button zum Umblättern
 * - Breiteres, kartenähnliches Design
 */
export default function CardPreviewModal({ card, isOpen, onClose, bridge }) {
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentSide, setCurrentSide] = useState('back'); // 'front' oder 'back', default: 'back'

  // Reset state when card changes or modal opens
  useEffect(() => {
    if (isOpen && card) {
        // #region agent log
        if (window.ankiBridge && window.ankiBridge.addMessage) {
          window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'CardPreviewModal.jsx:19',message:'CardPreviewModal opened',data:{card:card?{cardId:card.cardId,noteId:card.noteId,id:card.id}:null,isOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
        }
        // #endregion
        setDetails(null);
        setError(null);
        setCurrentSide('back'); // Standardmäßig Rückseite
        loadCardDetails();
    }
  }, [isOpen, card]);

  // Prevent background scrolling
  useEffect(() => {
    if (isOpen) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const loadCardDetails = async () => {
    if (!card) return;

    // Always fetch from bridge using ID to get the full rendered HTML
    // This ensures we get the exact same content as Anki displays (card.q() and card.a())
    // PRIORITÄT: cardId vor noteId, da getCardDetails Card-ID braucht
    const cardId = card.cardId || card.noteId || card.id;
    // #region agent log
    if (window.ankiBridge && window.ankiBridge.addMessage) {
      window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'CardPreviewModal.jsx:53',message:'loadCardDetails called',data:{card:card?{cardId:card.cardId,noteId:card.noteId,id:card.id}:null,cardId,hasBridge:!!bridge,hasGetCardDetails:!!bridge?.getCardDetails},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
    }
    // #endregion
    if (bridge && bridge.getCardDetails && cardId) {
        setIsLoading(true);
        try {
            // bridge.getCardDetails returns a JSON string with rendered HTML from card.q() and card.a()
            // #region agent log
            if (window.ankiBridge && window.ankiBridge.addMessage) {
              window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'CardPreviewModal.jsx:64',message:'calling getCardDetails',data:{cardId:String(cardId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
            }
            // #endregion
            const response = await bridge.getCardDetails(String(cardId));
            const data = typeof response === 'string' ? JSON.parse(response) : response;
            // #region agent log
            if (window.ankiBridge && window.ankiBridge.addMessage) {
              window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'CardPreviewModal.jsx:65',message:'getCardDetails response',data:{hasError:!!data.error,error:data.error,frontLength:data.front?.length||0,backLength:data.back?.length||0,hasFront:!!data.front,hasBack:!!data.back},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
            }
            // #endregion
            
            if (data.error) {
                setError(data.error);
            } else {
                // Format deck path in HTML content if present
                if (data.front) {
                    data.front = data.front.replace(/::/g, ' → ');
                }
                if (data.back) {
                    data.back = data.back.replace(/::/g, ' → ');
                }
                setDetails(data);
            }
        } catch (err) {
            console.error("Failed to load card details:", err);
            setError("Fehler beim Laden der Karte");
        } finally {
            setIsLoading(false);
        }
    } else {
        // Fallback: try to use props if available
        const hasContent = (card.fields?.Front || card.front) && (card.fields?.Back || card.back);
        if (hasContent) {
            setDetails({
                front: card.fields?.Front || card.fields?.Vorderseite || card.fields?.Frage || card.fields?.Question || card.front,
                back: card.fields?.Back || card.fields?.Rückseite || card.fields?.Antwort || card.fields?.Answer || card.back,
                id: card.noteId || card.cardId || card.id,
                deckName: card.deckName
            });
        } else {
            // Final fallback
            setDetails({
                front: "Keine Daten verfügbar",
                back: "ID: " + (cardId || "Unbekannt"),
                id: cardId
            });
        }
    }
  };

  if (!isOpen || !card) return null;

  const handleOpenInAnki = () => {
    const id = details?.id || card.noteId || card.cardId || card.id;
    if (bridge && bridge.goToCard && id) {
      bridge.goToCard(String(id));
    }
  };

  const handleFlip = () => {
    setCurrentSide(currentSide === 'front' ? 'back' : 'front');
  };

  const createMarkup = (html) => {
    // Ensure we always have a string, even if html is null/undefined
    const htmlString = html || '';
    // If it's not already a string, convert it
    const safeHtml = typeof htmlString === 'string' ? htmlString : String(htmlString);
    return { __html: safeHtml };
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-sans">
      {/* Darkened Backdrop with Blur */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* The Modal - Breiter für kartenähnliches Design */}
      <div className="relative w-full max-w-3xl transform transition-all animate-in zoom-in-95 duration-200">
        
        {/* Card Container */}
        <div className="bg-base-100 rounded-xl shadow-2xl overflow-hidden border border-base-200 flex flex-col max-h-[90vh]">
          
          {/* Header - Nur Breadcrumbs und Buttons */}
          <div className="px-6 py-4 border-b border-base-200 bg-base-100 flex items-center justify-between shrink-0">
            <div className="flex-1">
                <span className="text-xs font-medium text-base-content/50 tracking-wide">
                    {isLoading ? "Lade..." : (formatDeckPathWithArrows(details?.deckName) || "Vorschau")}
                </span>
            </div>
            
            <div className="flex gap-2">
               <button 
                onClick={handleOpenInAnki}
                className="p-2 rounded-lg hover:bg-base-200 text-base-content/50 hover:text-primary transition-colors"
                title="Im Editor öffnen"
              >
                <Edit3 size={18} />
              </button>
              <button 
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-base-200 text-base-content/50 hover:text-error transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content Area - Nur eine Seite zeigen */}
          <div className="overflow-y-auto p-8 scrollbar-hide bg-base-100 relative min-h-[400px] flex-1">
            
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <span className="text-sm text-base-content/50">Lade Karte...</span>
                    </div>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-3">
                        <X className="w-6 h-6 text-error" />
                    </div>
                    <h3 className="text-sm font-semibold text-base-content">Fehler beim Laden</h3>
                    <p className="text-xs text-base-content/60 mt-1">{error}</p>
                </div>
            ) : (
                <div className="relative">
                    {/* Bearbeiten-Button unten links im Content */}
                    <button 
                      onClick={handleOpenInAnki}
                      className="absolute bottom-0 left-0 p-2 rounded-lg hover:bg-base-200 text-base-content/40 hover:text-primary transition-colors z-10"
                      title="Im Editor öffnen"
                    >
                      <Edit3 size={16} />
                    </button>

                    {/* Aktuelle Seite (Front oder Back) */}
                    {currentSide === 'front' ? (
                        <div>
                            {details?.front ? (
                                <div 
                                    className="prose prose-lg max-w-none text-lg leading-relaxed text-base-content select-text
                                               [&_*]:text-base-content [&_*]:font-inherit [&_*]:leading-inherit
                                               [&_strong]:font-semibold [&_em]:italic [&_u]:underline
                                               [&_code]:bg-base-200 [&_code]:px-1.5 [&_code]:rounded [&_code]:text-sm
                                               [&_pre]:bg-base-200 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
                                               [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:space-y-2
                                               [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:space-y-2
                                               [&_table]:border-collapse [&_table]:w-full [&_table]:my-4
                                               [&_th]:border [&_th]:border-base-300 [&_th]:p-2 [&_th]:bg-base-200
                                               [&_td]:border [&_td]:border-base-300 [&_td]:p-2"
                                    dangerouslySetInnerHTML={createMarkup(details.front)}
                                />
                            ) : (
                                <div className="text-base-content/50 text-center py-8">Keine Daten verfügbar</div>
                            )}
                        </div>
                    ) : (
                        <div>
                            {details?.back ? (
                                <div 
                                    className="prose prose-lg max-w-none text-lg leading-relaxed text-base-content select-text
                                               [&_*]:text-base-content [&_*]:font-inherit [&_*]:leading-inherit
                                               [&_strong]:font-semibold [&_em]:italic [&_u]:underline
                                               [&_code]:bg-base-200 [&_code]:px-1.5 [&_code]:rounded [&_code]:text-sm
                                               [&_pre]:bg-base-200 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto
                                               [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:space-y-2
                                               [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:space-y-2
                                               [&_table]:border-collapse [&_table]:w-full [&_table]:my-4
                                               [&_th]:border [&_th]:border-base-300 [&_th]:p-2 [&_th]:bg-base-200
                                               [&_td]:border [&_td]:border-base-300 [&_td]:p-2"
                                    dangerouslySetInnerHTML={createMarkup(details.back)}
                                />
                            ) : (
                                <div className="text-base-content/50 text-center py-8">Keine Daten verfügbar</div>
                            )}
                        </div>
                    )}
                </div>
            )}

          </div>

          {/* Footer - Nur dezenter Flip-Button */}
          <div className="p-4 bg-base-100 border-t border-base-200 shrink-0 flex justify-center">
            <button 
              onClick={handleFlip}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-base-300 bg-base-200/50
                         text-sm font-medium text-base-content/60 hover:bg-base-200 hover:border-base-400 
                         hover:text-base-content transition-all active:scale-[0.98]"
            >
              <RotateCcw size={16} />
              {currentSide === 'front' ? 'Zurückseite zeigen' : 'Vorderseite zeigen'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}