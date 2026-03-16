// Icon Buttons für Toolbar
(function() {
    // Mapping: Text → Icon (Unicode/Emoji als Platzhalter)
    const iconMap = {
        'Stapelübersicht': '📚',
        'Hinzufügen': '➕',
        'Kartenverwaltung': '🗂️',
        'Statistiken': '📊',
        'Synchronisieren': '🔄'
    };
    
    function convertToIconButtons() {
        // Finde alle Toolbar-Buttons
        const toolbars = document.querySelectorAll('QToolBar, .toolbar, [role="toolbar"]');
        
        toolbars.forEach(toolbar => {
            // Finde alle Links/Buttons im Toolbar
            const buttons = toolbar.querySelectorAll('a, button, [role="button"]');
            
            buttons.forEach(btn => {
                const text = btn.textContent.trim();
                
                // Prüfe ob es einer unserer Buttons ist
                for (const [key, icon] of Object.entries(iconMap)) {
                    if (text.includes(key)) {
                        // Ersetze Text durch Icon
                        btn.innerHTML = `<span style="font-size: 1.2em;">${icon}</span>`;
                        btn.title = key; // Tooltip behalten
                        btn.style.cssText += `
                            width: 40px !important;
                            height: 40px !important;
                            padding: 0 !important;
                            border-radius: 8px !important;
                            display: flex !important;
                            align-items: center !important;
                            justify-content: center !important;
                            background: rgba(255, 255, 255, 0.05) !important;
                            border: 1px solid rgba(255, 255, 255, 0.1) !important;
                            transition: all 0.2s ease !important;
                        `;
                        
                        btn.addEventListener('mouseenter', function() {
                            this.style.background = 'rgba(255, 255, 255, 0.1)';
                            this.style.transform = 'scale(1.05)';
                        });
                        
                        btn.addEventListener('mouseleave', function() {
                            this.style.background = 'rgba(255, 255, 255, 0.05)';
                            this.style.transform = 'scale(1)';
                        });
                        
                        break;
                    }
                }
            });
        });
    }
    
    // Sofort ausführen
    convertToIconButtons();
    
    // Und nach Verzögerung nochmal
    setTimeout(convertToIconButtons, 500);
    setTimeout(convertToIconButtons, 1000);
    
    // MutationObserver für dynamische Änderungen
    const observer = new MutationObserver(function(mutations) {
        convertToIconButtons();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
