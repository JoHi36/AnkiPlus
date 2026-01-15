/**
 * Premium Reviewer JavaScript
 * Interaktivität und Animationen für "Anki auf Steroiden" UI
 */

(function() {
    'use strict';
    
    // Prüfe ob bereits initialisiert
    if (window.ankiPremiumInitialized) {
        return;
    }
    window.ankiPremiumInitialized = true;
    
    console.log('ankiPremium: Initialisiere Premium Reviewer UI...');
    
    /**
     * Show Answer Handler
     * Zeigt die Antwort mit smooth Animation
     */
    function handleShowAnswer() {
        const answerPanel = document.querySelector('.anki-answer-panel');
        const showBtn = document.querySelector('.anki-btn-show-answer');
        const actionsBar = document.querySelector('.anki-actions-bar');
        
        if (answerPanel) {
            // Fade in answer
            answerPanel.style.display = 'block';
            answerPanel.style.opacity = '0';
            setTimeout(() => {
                answerPanel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                answerPanel.style.opacity = '1';
                answerPanel.style.transform = 'translateY(0)';
            }, 10);
        }
        
        if (showBtn) {
            showBtn.style.display = 'none';
        }
        
        // Call Anki's internal showAnswer
        if (window.pycmd) {
            window.pycmd('ans');
        } else if (window.anki && window.anki.answerButton) {
            // Fallback
            window.anki.answerButton.click();
        }
    }
    
    /**
     * Rating Handler
     * Bewertet die Karte mit visuellem Feedback
     */
    function handleRating(ease) {
        const btn = document.querySelector(`.anki-btn-rating[data-ease="${ease}"]`);
        if (btn) {
            // Visual feedback
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => {
                btn.style.transform = '';
            }, 100);
        }
        
        // Call Anki's rating
        if (window.pycmd) {
            window.pycmd(`ease${ease}`);
        }
    }
    
    /**
     * Keyboard Shortcuts
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Space or Enter = Show Answer (when question is shown)
            if ((e.code === 'Space' || e.code === 'Enter') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const showBtn = document.querySelector('.anki-btn-show-answer');
                if (showBtn && showBtn.style.display !== 'none') {
                    e.preventDefault();
                    handleShowAnswer();
                }
            }
            
            // 1-4 = Rating (when answer is shown)
            const ratings = { '1': 1, '2': 2, '3': 3, '4': 4 };
            if (ratings[e.key] && !e.ctrlKey && !e.metaKey) {
                const ratingBtn = document.querySelector(`.anki-btn-rating[data-ease="${ratings[e.key]}"]`);
                if (ratingBtn) {
                    e.preventDefault();
                    handleRating(ratings[e.key]);
                }
            }
        });
    }
    
    /**
     * Plugin Zone Management
     * Verschiebt AMBOSS/Meditricks-Elemente in Plugin-Zone
     */
    function preservePluginContent() {
        const pluginZone = document.getElementById('plugin-zone');
        if (!pluginZone) return;
        
        // Find plugin elements (AMBOSS, Meditricks, etc.)
        const pluginSelectors = [
            '[id*="amboss"]',
            '[id*="meditricks"]',
            '[class*="amboss"]',
            '[class*="meditricks"]',
            '[class*="addon-"]',
            '[id*="addon-"]'
        ];
        
        pluginSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    // Skip if already in plugin zone
                    if (pluginZone.contains(el)) return;
                    
                    // Skip if it's our own container
                    if (el.closest('.anki-premium-root')) return;
                    
                    // Move to plugin zone
                    pluginZone.appendChild(el);
                    console.log('ankiPremium: Plugin-Element verschoben:', selector);
                });
            } catch (e) {
                // Ignore selector errors
            }
        });
    }
    
    /**
     * Initialize Event Listeners
     */
    function initializeEventListeners() {
        // Show Answer Button
        document.addEventListener('click', (e) => {
            if (e.target.closest('.anki-btn-show-answer')) {
                e.preventDefault();
                handleShowAnswer();
            }
        });
        
        // Rating Buttons
        document.addEventListener('click', (e) => {
            const ratingBtn = e.target.closest('.anki-btn-rating');
            if (ratingBtn) {
                e.preventDefault();
                const ease = ratingBtn.getAttribute('data-ease');
                if (ease) {
                    handleRating(parseInt(ease));
                }
            }
        });
    }
    
    /**
     * Initialize when DOM is ready
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        
        console.log('ankiPremium: DOM ready, initialisiere...');
        
        // Setup keyboard shortcuts
        setupKeyboardShortcuts();
        
        // Initialize event listeners
        initializeEventListeners();
        
        // Preserve plugin content
        preservePluginContent();
        
        // Re-check for plugins periodically (they might load later)
        setInterval(preservePluginContent, 1000);
        
        console.log('ankiPremium: Initialisierung abgeschlossen');
    }
    
    // Start initialization
    init();
    
    // Also run on card changes (Anki's internal events)
    if (window.anki) {
        const originalShowQuestion = window.anki.showQuestion;
        if (originalShowQuestion) {
            window.anki.showQuestion = function() {
                originalShowQuestion.apply(this, arguments);
                setTimeout(() => {
                    preservePluginContent();
                    initializeEventListeners();
                }, 300);
            };
        }
    }
    
})();
