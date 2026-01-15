/**
 * JavaScript HTML Transformer für Premium Anki Reviewer
 * Transformiert Anki's HTML client-side (robust & version-unabhängig)
 */

(function() {
    'use strict';
    
    console.log('🎨 Premium HTML Transformer: Initialisiere...');
    
    // Flag um doppelte Transformation zu vermeiden
    if (window.ankiPremiumTransformerActive) {
        console.log('🎨 Premium HTML Transformer: Bereits aktiv');
        return;
    }
    window.ankiPremiumTransformerActive = true;
    
    // State
    let currentCardId = null;
    let isAnswerShown = false;
    
    /**
     * Findet Anki's QA Container
     */
    function findQAContainer() {
        // Anki verwendet verschiedene Selektoren je nach Version
        const selectors = ['#qa', '.qa', 'div[id="qa"]', 'body > center'];
        for (let selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                console.log('🎨 QA Container gefunden:', selector);
                return el;
            }
        }
        console.warn('🎨 Kein QA Container gefunden!');
        return null;
    }
    
    /**
     * Extrahiert die Frage aus dem HTML
     */
    function extractQuestion(html) {
        // Bereinige HTML von Anki's Wrapper
        let cleaned = html;
        
        // Entferne typische Anki-Wrapper
        cleaned = cleaned.replace(/<div[^>]*class="[^"]*card[^"]*"[^>]*>/gi, '');
        cleaned = cleaned.replace(/<\/div>/gi, '');
        
        // Entferne leere Zeilen
        cleaned = cleaned.trim();
        
        return cleaned || '<p>Keine Frage gefunden</p>';
    }
    
    /**
     * Baut das Premium Question Layout
     */
    function buildQuestionLayout(questionHTML) {
        return `
            <div id="anki-premium-container" class="anki-premium-root">
                <!-- Plugin Zone -->
                <div id="plugin-zone" class="anki-plugin-zone"></div>
                
                <!-- Main Content -->
                <div class="anki-premium-card">
                    <!-- Question Panel -->
                    <div class="anki-question-panel">
                        <h1 class="anki-question-title">
                            ${questionHTML}
                        </h1>
                        <div class="anki-decorative-line"></div>
                    </div>
                    
                    <!-- Actions Bar -->
                    <div class="anki-actions-bar">
                        <button class="anki-btn-show-answer" id="premium-show-answer">
                            <span>Antwort anzeigen</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Baut das Premium Answer Layout
     */
    function buildAnswerLayout(questionHTML, answerHTML) {
        return `
            <div id="anki-premium-container" class="anki-premium-root">
                <!-- Plugin Zone -->
                <div id="plugin-zone" class="anki-plugin-zone"></div>
                
                <!-- Main Content -->
                <div class="anki-premium-card">
                    <!-- Question Panel (bleibt sichtbar) -->
                    <div class="anki-question-panel">
                        <h1 class="anki-question-title">
                            ${questionHTML}
                        </h1>
                        <div class="anki-decorative-line"></div>
                    </div>
                    
                    <!-- Answer Panel -->
                    <div class="anki-answer-panel">
                        ${answerHTML}
                    </div>
                    
                    <!-- Actions Bar -->
                    <div class="anki-actions-bar">
                        ${buildRatingButtons()}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Baut Rating-Buttons
     */
    function buildRatingButtons() {
        const buttons = [
            { ease: 1, label: 'Nochmal', interval: '1m', className: 'again' },
            { ease: 2, label: 'Schwer', interval: '10m', className: 'hard' },
            { ease: 3, label: 'Gut', interval: '4d', className: 'good' },
            { ease: 4, label: 'Einfach', interval: '21d', className: 'easy' }
        ];
        
        return buttons.map(btn => `
            <button class="anki-btn-rating ${btn.className}" data-ease="${btn.ease}" id="premium-ease-${btn.ease}">
                <span class="label">${btn.label}</span>
                <span class="interval">${btn.interval}</span>
            </button>
        `).join('');
    }
    
    /**
     * Versteckt Anki's Original-Buttons
     */
    function hideOriginalButtons() {
        const selectors = [
            '#innertable',
            '.reviewer-bottom',
            'table[id*="bottom"]',
            'button[onclick*="ease"]',
            'button[onclick*="ans"]'
        ];
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
                el.style.position = 'absolute';
                el.style.left = '-9999px';
            });
        });
    }
    
    /**
     * Attachiert Event-Listener für Buttons
     */
    function attachButtonListeners() {
        // Show Answer Button
        const showAnswerBtn = document.getElementById('premium-show-answer');
        if (showAnswerBtn) {
            showAnswerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🎨 Show Answer geklickt');
                if (window.pycmd) {
                    window.pycmd('ans');
                    isAnswerShown = true;
                }
            });
        }
        
        // Rating Buttons
        for (let ease = 1; ease <= 4; ease++) {
            const ratingBtn = document.getElementById(`premium-ease-${ease}`);
            if (ratingBtn) {
                ratingBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log(`🎨 Rating ${ease} geklickt`);
                    if (window.pycmd) {
                        window.pycmd(`ease${ease}`);
                        isAnswerShown = false;
                    }
                });
            }
        }
        
        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            // Ignore wenn in Input/Textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Space/Enter = Show Answer
            if ((e.code === 'Space' || e.code === 'Enter') && !isAnswerShown && !e.ctrlKey && !e.metaKey) {
                const showBtn = document.getElementById('premium-show-answer');
                if (showBtn && showBtn.style.display !== 'none') {
                    e.preventDefault();
                    showBtn.click();
                }
            }
            
            // 1-4 = Rating
            const ratings = { '1': 1, '2': 2, '3': 3, '4': 4 };
            if (ratings[e.key] && isAnswerShown && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const ratingBtn = document.getElementById(`premium-ease-${ratings[e.key]}`);
                if (ratingBtn) {
                    ratingBtn.click();
                }
            }
        });
    }
    
    /**
     * Verschiebt Plugin-Elemente in Plugin-Zone
     */
    function preservePlugins() {
        const pluginZone = document.getElementById('plugin-zone');
        if (!pluginZone) return;
        
        const pluginSelectors = [
            '[id*="amboss"]',
            '[id*="meditricks"]',
            '[class*="amboss"]',
            '[class*="meditricks"]'
        ];
        
        pluginSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (!pluginZone.contains(el) && !el.closest('.anki-premium-root')) {
                        pluginZone.appendChild(el);
                        console.log('🎨 Plugin-Element verschoben:', selector);
                    }
                });
            } catch (e) {
                // Ignore
            }
        });
    }
    
    /**
     * Transformiert das HTML
     */
    function transformHTML() {
        const qaContainer = findQAContainer();
        if (!qaContainer) {
            console.warn('🎨 Transformation abgebrochen: Kein QA Container');
            return;
        }
        
        // Speichere Original-HTML
        const originalHTML = qaContainer.innerHTML;
        
        // Prüfe ob schon transformiert
        if (originalHTML.includes('anki-premium-root')) {
            console.log('🎨 HTML bereits transformiert');
            return;
        }
        
        console.log('🎨 Transformiere HTML...');
        
        // Extrahiere Frage
        const questionHTML = extractQuestion(originalHTML);
        
        // Baue Premium-Layout (Question State)
        const premiumHTML = buildQuestionLayout(questionHTML);
        
        // Ersetze HTML
        qaContainer.innerHTML = premiumHTML;
        
        // Verstecke Original-Buttons
        hideOriginalButtons();
        
        // Attachiere Event-Listener
        attachButtonListeners();
        
        // Preserve Plugins
        setTimeout(() => preservePlugins(), 100);
        
        console.log('🎨 HTML-Transformation abgeschlossen!');
    }
    
    /**
     * Initialisiert den Transformer
     */
    function init() {
        console.log('🎨 Premium HTML Transformer: Init');
        
        // Warte auf DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        
        // Transformiere sofort
        transformHTML();
        
        // Beobachte DOM-Änderungen (für Answer-State)
        const observer = new MutationObserver((mutations) => {
            // Prüfe ob #qa geändert wurde
            const qaChanged = mutations.some(mutation => {
                return Array.from(mutation.addedNodes).some(node => {
                    return node.nodeType === Node.ELEMENT_NODE && 
                           (node.id === 'qa' || node.querySelector && node.querySelector('#qa'));
                }) || (mutation.target.id === 'qa' || mutation.target.closest('#qa'));
            });
            
            if (qaChanged) {
                console.log('🎨 QA geändert, re-transformiere...');
                setTimeout(() => transformHTML(), 50);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log('🎨 Premium HTML Transformer: Aktiv!');
    }
    
    // Start
    init();
})();
