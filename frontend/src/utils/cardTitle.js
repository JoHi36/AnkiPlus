/**
 * Universelle Utility-Funktion für die Extraktion von Kartentiteln
 * Funktioniert für alle Anki-Decks, nicht nur spezifische Formate
 */

/**
 * Entfernt HTML-Tags und extrahiert reinen Text
 */
export function stripHtml(html) {
  if (!html) return '';
  try {
    if (typeof document === 'undefined') {
      // Fallback: Entferne HTML-Tags manuell
      return String(html).replace(/<[^>]*>/g, '').trim();
    }
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  } catch (e) {
    // Fallback: Entferne HTML-Tags manuell
    return String(html).replace(/<[^>]*>/g, '').trim();
  }
}

/**
 * Prüft ob eine Zeile Meta-Informationen enthält (nicht informativ)
 */
function isMetaLine(line) {
  if (!line || line.length < 3) return true;
  
  const lower = line.toLowerCase().trim();
  
  // Generische Meta-Patterns (universell für alle Decks)
  const metaPatterns = [
    /^©/i,                                    // Copyright
    /copyright/i,                             // Copyright (Text)
    /all rights reserved/i,                   // Rechte
    /^version\s*[0-9]/i,                      // Version X
    /^v[0-9]+\.[0-9]+/i,                      // v1.0, v2.3 etc.
    /note type/i,                             // Note Type
    /^\.\w+\s*\{/,                            // CSS-Selektoren (.card {, .class {)
    /^\/\//,                                  // Kommentare
    /^\/\*/,                                  // CSS-Kommentare
    /^\*/,                                    // Markdown-Listen
    /^#+\s*$/,                                // Nur Markdown-Überschriften ohne Text
    /^https?:\/\//,                           // URLs
    /^www\./,                                 // URLs ohne Protokoll
    /^mailto:/,                               // E-Mail-Links
    /^\s*$/,                                  // Leerzeilen
    /^\[.*\]\(.*\)$/,                         // Markdown-Links [text](url)
    /^amboss/i,                               // AMBOSS-spezifisch (kann entfernt werden wenn nicht gewünscht)
    /^anki/i,                                 // "Anki" allein
    /^c\d+\s*anki/i,                          // C24 Anki etc.
    /^anki\s*c\d+/i,                          // Anki C24 etc.
  ];
  
  return metaPatterns.some(pattern => pattern.test(lower));
}

/**
 * Prüft ob eine Zeile informativ genug ist
 */
function isInformativeLine(line) {
  if (!line || line.trim().length < 6) return false; // Mindestens 6 Zeichen
  if (isMetaLine(line)) return false;
  
  // Prüfe ob es hauptsächlich Sonderzeichen sind
  const specialCharRatio = (line.match(/[^a-zA-Z0-9\säöüÄÖÜß]/g) || []).length / line.length;
  if (specialCharRatio > 0.5) return false; // Mehr als 50% Sonderzeichen = wahrscheinlich Code/Meta
  
  return true;
}

/**
 * Extrahiert einen informativen Kartentitel aus dem Karteninhalt
 * 
 * @param {string} questionText - Der rohe Karteninhalt (kann HTML enthalten)
 * @param {number} maxLength - Maximale Länge des Titels (default: 80)
 * @returns {string} - Bereinigter, informativer Titel
 */
export function extractCardTitle(questionText, maxLength = 80) {
  if (!questionText) return 'Ohne Titel';
  
  // 1. Entferne HTML
  let text = stripHtml(questionText);
  
  // 2. Entferne Markdown-Formatierung
  text = text
    .replace(/\*{1,3}/g, '')           // Bold/Italic
    .replace(/#{1,6}\s*/g, '')         // Überschriften
    .replace(/_{1,3}/g, '')            // Underline
    .replace(/~~/g, '')                // Strikethrough
    .replace(/`/g, '')                 // Inline Code
    .trim();
  
  // 3. Zerlege in Zeilen
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  
  if (lines.length === 0) {
    // Fallback: Verwende ersten Teil des Textes
    const cleaned = text.substring(0, maxLength).trim();
    return cleaned || 'Ohne Titel';
  }
  
  // 4. Finde die erste informative Zeile
  let informativeLine = null;
  for (const line of lines) {
    if (isInformativeLine(line)) {
      informativeLine = line;
      break;
    }
  }
  
  // 5. Fallback: Wenn keine informative Zeile gefunden, nimm erste nicht-leere Zeile
  if (!informativeLine) {
    informativeLine = lines.find(l => l.length >= 3 && !isMetaLine(l)) || lines[0] || text;
  }
  
  // 6. Bereinige und kürze
  let result = informativeLine.trim();
  
  // Entferne führende/trailing Sonderzeichen
  result = result.replace(/^[^\w]+|[^\w]+$/g, '');
  
  // Kürze auf maxLength, aber versuche bei Wortgrenze zu schneiden
  if (result.length > maxLength) {
    const shortened = result.substring(0, maxLength);
    const lastSpace = shortened.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) { // Wenn letztes Leerzeichen nicht zu weit am Anfang
      result = shortened.substring(0, lastSpace) + '...';
    } else {
      result = shortened + '...';
    }
  }
  
  return result || 'Ohne Titel';
}


