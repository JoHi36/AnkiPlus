/**
 * Multiple Choice Card Injector
 * Integriert Multiple-Choice-Quiz direkt in Anki-Karten
 */

(function() {
    'use strict';
    
    // Prüfe ob bereits initialisiert
    if (window.ankiMCInitialized) {
        return;
    }
    window.ankiMCInitialized = true;
    
    // Warte auf Card-ID und initialisiere MC-Integration
    function initMCIntegration() {
        // Finde Card-Container
        const cardContainer = document.querySelector('.card') || document.querySelector('#qa');
        if (!cardContainer) {
            console.log('ankiMC: Card-Container nicht gefunden, versuche erneut...');
            setTimeout(initMCIntegration, 500);
            return;
        }
        
        // Hole Card-ID aus window.anki (wird von Python gesetzt)
        let cardId = null;
        try {
            if (window.anki && window.anki.currentCardId) {
                cardId = window.anki.currentCardId;
            }
        } catch (e) {
            console.error('ankiMC: Fehler beim Extrahieren der Card-ID:', e);
        }
        
        if (!cardId) {
            console.log('ankiMC: Card-ID nicht gefunden, versuche erneut...');
            setTimeout(initMCIntegration, 500);
            return;
        }
        
        console.log('ankiMC: Card-ID gefunden:', cardId, 'prüfe auf MC...');
        
        // Prüfe ob MC vorhanden über Python-Bridge (via Anki's web.eval)
        // Wir verwenden einen indirekten Aufruf über ein Custom Event
        const checkMC = function() {
            // Versuche Bridge-Zugriff über verschiedene Methoden
            if (typeof pybridge !== 'undefined' && pybridge && pybridge.hasMultipleChoice) {
                pybridge.hasMultipleChoice(parseInt(cardId), function(result) {
                    try {
                        const data = JSON.parse(result);
                        if (data.hasMC) {
                            console.log('ankiMC: Multiple Choice gefunden für Card', cardId);
                            injectMCBadge(cardContainer, cardId);
                        } else {
                            console.log('ankiMC: Keine Multiple Choice für Card', cardId);
                        }
                    } catch (e) {
                        console.error('ankiMC: Fehler beim Parsen von hasMultipleChoice:', e);
                    }
                });
            } else {
                // Fallback: Versuche über Custom Event (wird von Python gehandled)
                console.log('ankiMC: Bridge nicht verfügbar, verwende Fallback-Methode');
                // Für jetzt: Zeige Badge nicht an wenn Bridge nicht verfügbar
                // Später können wir hier eine alternative Methode implementieren
            }
        };
        
        // Warte kurz bevor wir prüfen (Card muss vollständig geladen sein)
        setTimeout(checkMC, 300);
    }
    
    /**
     * Injiziert MC-Badge in Card-Container
     */
    function injectMCBadge(container, cardId) {
        // Prüfe ob Badge bereits existiert
        if (container.querySelector('.anki-mc-badge')) {
            return;
        }
        
        // Finde beste Position für Badge (nach Frage, vor Antwort)
        const questionElement = container.querySelector('.question') || 
                               container.querySelector('.card-front') ||
                               container.querySelector('div:first-child');
        
        const badge = document.createElement('div');
        badge.className = 'anki-mc-badge';
        badge.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            <span>Multiple Choice verfügbar</span>
        `;
        
        badge.addEventListener('click', function() {
            toggleMCQuiz(container, cardId, badge);
        });
        
        // Füge Badge nach Frage ein
        if (questionElement && questionElement.nextSibling) {
            questionElement.parentNode.insertBefore(badge, questionElement.nextSibling);
        } else if (questionElement) {
            questionElement.parentNode.appendChild(badge);
        } else {
            container.insertBefore(badge, container.firstChild);
        }
    }
    
    /**
     * Lädt und zeigt MC-Quiz
     */
    function toggleMCQuiz(container, cardId, badge) {
        // Prüfe ob bereits geöffnet
        const existingMC = container.querySelector('.anki-mc-container');
        if (existingMC) {
            // Schließe MC
            existingMC.style.animation = 'fadeOutSlideUp 0.3s ease-out';
            setTimeout(() => {
                existingMC.remove();
            }, 300);
            return;
        }
        
        // Lade MC-Daten
        if (typeof pybridge !== 'undefined' && pybridge && pybridge.loadMultipleChoice) {
            pybridge.loadMultipleChoice(parseInt(cardId), function(result) {
                try {
                    const data = JSON.parse(result);
                    if (data.success && data.quizData) {
                        renderMCQuiz(container, data.quizData, badge);
                    } else {
                        console.error('ankiMC: Fehler beim Laden:', data.error);
                        showError(container, 'Multiple Choice konnte nicht geladen werden.');
                    }
                } catch (e) {
                    console.error('ankiMC: Fehler beim Parsen von loadMultipleChoice:', e);
                    showError(container, 'Fehler beim Laden der Multiple Choice.');
                }
            });
        } else {
            console.error('ankiMC: Bridge nicht verfügbar für loadMultipleChoice');
            showError(container, 'Bridge nicht verfügbar. Bitte öffne den Chatbot-Panel.');
        }
    }
    
    /**
     * Rendert MC-Quiz in Card DOM
     */
    function renderMCQuiz(container, quizData, badge) {
        const mcContainer = document.createElement('div');
        mcContainer.className = 'anki-mc-container';
        
        // Frage
        const questionEl = document.createElement('h3');
        questionEl.className = 'anki-mc-question';
        questionEl.textContent = quizData.question || 'Wähle die richtige Antwort';
        mcContainer.appendChild(questionEl);
        
        // Optionen
        const optionsList = document.createElement('div');
        optionsList.className = 'anki-mc-options';
        
        let selectedOption = null;
        let hasSubmitted = false;
        
        quizData.options.forEach((option) => {
            const optionEl = document.createElement('div');
            optionEl.className = 'anki-mc-option';
            optionEl.setAttribute('data-letter', option.letter);
            optionEl.setAttribute('data-correct', option.isCorrect);
            
            const letterEl = document.createElement('div');
            letterEl.className = 'anki-mc-option-letter';
            letterEl.textContent = option.letter;
            
            const textEl = document.createElement('div');
            textEl.className = 'anki-mc-option-text';
            textEl.textContent = option.text;
            
            optionEl.appendChild(letterEl);
            optionEl.appendChild(textEl);
            
            optionEl.addEventListener('click', function() {
                if (hasSubmitted) return;
                
                selectedOption = option;
                hasSubmitted = true;
                
                // Markiere ausgewählte Option
                optionEl.classList.add(selectedOption.isCorrect ? 'selected-correct' : 'selected-wrong');
                
                // Markiere alle anderen Optionen
                optionsList.querySelectorAll('.anki-mc-option').forEach((opt) => {
                    if (opt !== optionEl) {
                        if (opt.getAttribute('data-correct') === 'true') {
                            opt.classList.add('missed-correct');
                        } else {
                            opt.style.opacity = '0.4';
                        }
                    }
                });
                
                // Zeige Erklärung falls vorhanden
                if (option.explanation) {
                    const explanationEl = document.createElement('div');
                    explanationEl.className = 'anki-mc-explanation';
                    explanationEl.style.marginTop = '0.5rem';
                    explanationEl.style.padding = '0.75rem';
                    explanationEl.style.background = selectedOption.isCorrect 
                        ? 'rgba(16, 185, 129, 0.1)' 
                        : 'rgba(239, 68, 68, 0.1)';
                    explanationEl.style.borderRadius = '0.5rem';
                    explanationEl.style.border = selectedOption.isCorrect
                        ? '1px solid rgba(16, 185, 129, 0.3)'
                        : '1px solid rgba(239, 68, 68, 0.3)';
                    explanationEl.style.color = selectedOption.isCorrect
                        ? 'rgba(16, 185, 129, 0.9)'
                        : 'rgba(239, 68, 68, 0.9)';
                    explanationEl.style.fontSize = '0.875rem';
                    explanationEl.textContent = option.explanation;
                    optionEl.appendChild(explanationEl);
                }
            });
            
            optionsList.appendChild(optionEl);
        });
        
        mcContainer.appendChild(optionsList);
        
        // Füge nach Badge ein
        if (badge && badge.nextSibling) {
            badge.parentNode.insertBefore(mcContainer, badge.nextSibling);
        } else if (badge) {
            badge.parentNode.appendChild(mcContainer);
        } else {
            container.appendChild(mcContainer);
        }
        
        // Scroll zu MC
        mcContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    /**
     * Zeigt Fehlermeldung
     */
    function showError(container, message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'anki-mc-error';
        errorEl.style.padding = '1rem';
        errorEl.style.background = 'rgba(239, 68, 68, 0.1)';
        errorEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        errorEl.style.borderRadius = '0.5rem';
        errorEl.style.color = 'rgba(239, 68, 68, 0.9)';
        errorEl.textContent = message;
        container.appendChild(errorEl);
    }
    
    // Initialisiere wenn DOM bereit
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMCIntegration);
    } else {
        // DOM bereits geladen
        setTimeout(initMCIntegration, 500); // Warte kurz auf Anki's Card-Rendering
    }
    
    // Re-initialisiere bei Card-Wechsel (Anki's Event)
    if (window.anki) {
        const originalShowQuestion = window.anki.showQuestion;
        if (originalShowQuestion) {
            window.anki.showQuestion = function() {
                originalShowQuestion.apply(this, arguments);
                setTimeout(initMCIntegration, 300);
            };
        }
    }
    
})();
