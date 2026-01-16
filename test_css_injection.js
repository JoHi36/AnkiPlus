// Test-Script: Prüft, ob CSS injiziert wurde
(function() {
    console.log('=== CSS INJECTION TEST ===');
    
    // 1. Prüfe, ob Style-Tag existiert
    const styleTag = document.getElementById('anki-minimal-styles');
    console.log('Style-Tag gefunden:', !!styleTag);
    
    if (styleTag) {
        console.log('CSS Länge:', styleTag.textContent.length, 'Zeichen');
        console.log('CSS Preview:', styleTag.textContent.substring(0, 200));
    } else {
        console.log('❌ FEHLER: Style-Tag nicht gefunden!');
    }
    
    // 2. Prüfe alle Style-Tags
    const allStyles = document.querySelectorAll('style');
    console.log('Anzahl Style-Tags:', allStyles.length);
    allStyles.forEach((style, i) => {
        console.log(`Style ${i}:`, style.id || '(keine ID)', style.textContent.length, 'Zeichen');
    });
    
    // 3. Prüfe Bottom-Container
    const bottom = document.getElementById('bottom');
    console.log('Bottom-Container gefunden:', !!bottom);
    if (bottom) {
        const buttons = bottom.querySelectorAll('button');
        console.log('Buttons in #bottom:', buttons.length);
        if (buttons.length > 0) {
            const firstButton = buttons[0];
            const computedStyle = window.getComputedStyle(firstButton);
            console.log('Erster Button Background:', computedStyle.backgroundColor);
            console.log('Erster Button Border:', computedStyle.border);
        }
    }
    
    // 4. Prüfe Body Background
    const bodyStyle = window.getComputedStyle(document.body);
    console.log('Body Background:', bodyStyle.backgroundColor);
    
    console.log('=== TEST ENDE ===');
})();
