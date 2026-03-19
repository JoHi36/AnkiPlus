import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CheckCircle2, XCircle, RotateCcw, CheckCircle, Lightbulb, Brain, Sparkles, User, Bot, MessageSquare, List, ImageIcon, AlertCircle } from 'lucide-react';
import ReviewFeedback from './ReviewFeedback';
import ReviewResult from './ReviewResult';
import MultipleChoiceCard from './MultipleChoiceCard';
import CitationBadge from './CitationBadge';
import ThoughtStream from './ThoughtStream';
import SourcesCarousel from './SourcesCarousel';
import PlusiWidget from './PlusiWidget';
import mermaid from 'mermaid';
// SmilesDrawer wird dynamisch importiert, da es CommonJS ist und Vite-Probleme verursachen kann

// ============================================================================
// IMAGE LOADING SYSTEM - Stabilisierte Version mit URL-Validierung
// ============================================================================

// LRU Cache mit Max-Größe (verhindert Memory-Leaks)
const MAX_CACHE_SIZE = 100;
const imageCache = new Map(); // src -> { dataUrl, error, timestamp }

// Request-Tracking: URL -> { callbacks: Set, timeoutId: number }
const pendingRequests = new Map();

// URL-Validierung - strikte Prüfung auf gültige Bild-URLs
const isValidImageUrl = (url) => {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }
  
  // Data URLs sind immer gültig (schon geladen)
  if (url.startsWith('data:image/')) {
    return true;
  }
  
  // Prüfe auf gültige HTTP/HTTPS URL
  try {
    const parsed = new URL(url);
    
    // Nur HTTP/HTTPS erlauben
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Prüfe auf verdächtige Zeichen (Security)
    if (url.includes('<') || url.includes('>') || url.includes('"') || url.includes("'")) {
      return false;
    }
    
    // Prüfe auf gültige Domain (mindestens ein Punkt für TLD)
    if (!parsed.hostname || parsed.hostname.length < 4 || !parsed.hostname.includes('.')) {
      return false;
    }
    
    // Prüfe auf bekannte Bild-Endungen (optional, aber hilfreich)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    const hasImageExtension = imageExtensions.some(ext => 
      parsed.pathname.toLowerCase().endsWith(ext)
    );
    
    // Erlaube auch URLs ohne Extension (können trotzdem Bilder sein)
    return true;
  } catch {
    // URL konnte nicht geparst werden
    return false;
  }
};

// Cache-Management: Entferne älteste Einträge wenn Limit erreicht
const manageCacheSize = () => {
  if (imageCache.size <= MAX_CACHE_SIZE) return;
  
  // Sortiere nach Timestamp und entferne älteste 20%
  const entries = Array.from(imageCache.entries())
    .map(([url, data]) => ({ url, ...data }))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  const toRemove = Math.floor(entries.length * 0.2);
  for (let i = 0; i < toRemove; i++) {
    imageCache.delete(entries[i].url);
  }
};

// Global image loading callbacks - OUTSIDE component to prevent race conditions
if (!window._imageLoadCallbacks) {
  window._imageLoadCallbacks = new Map();
  
  // Register GLOBAL listener ONCE
  window.addEventListener('imageLoaded', (event) => {
    const url = event.detail?.url;
    if (!url) return;
    
    const data = event.detail?.data;
    
    // Normalisiere URL für Cache
    const normalizedUrl = url.trim().replace(/\/$/, '');
    
    // Update Cache
    if (data?.success && data?.dataUrl) {
      imageCache.set(normalizedUrl, { 
        dataUrl: data.dataUrl, 
        error: null, 
        timestamp: Date.now() 
      });
      manageCacheSize();
    } else if (data?.error) {
      // Cache auch Fehler (verhindert wiederholte Requests)
      const errorMsg = typeof data.error === 'string' 
        ? data.error 
        : 'Bild konnte nicht geladen werden';
      imageCache.set(normalizedUrl, { 
        dataUrl: null, 
        error: errorMsg, 
        timestamp: Date.now() 
      });
      manageCacheSize(); // Auch bei Fehlern Cache-Größe verwalten
    }
    
    // Notify alle wartenden Callbacks (verwende normalisierte URL)
    if (window._imageLoadCallbacks.has(normalizedUrl)) {
      const callbacks = window._imageLoadCallbacks.get(normalizedUrl);
      callbacks.forEach(callback => {
        try {
          callback(event.detail);
        } catch (err) {
          console.error('Error in image callback:', err);
        }
      });
      window._imageLoadCallbacks.delete(normalizedUrl);
    }
    
    // Cleanup pending request (verwende normalisierte URL)
    if (pendingRequests.has(normalizedUrl)) {
      const request = pendingRequests.get(normalizedUrl);
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      pendingRequests.delete(normalizedUrl);
    }
  });
}

// ProxyImage Component - lädt Bilder über Python-Backend
// WICHTIG: Mit React.memo optimiert um Duplikate während Streaming zu vermeiden
// PERFORMANCE: Uses Intersection Observer for lazy loading
const ProxyImage = React.memo(({ src, alt }) => {
  const [dataUrl, setDataUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const isMountedRef = useRef(true);
  const timeoutIdRef = useRef(null);
  const imageRef = useRef(null);

  // PERFORMANCE: Intersection Observer - only load when image is about to be visible
  useEffect(() => {
    if (!imageRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect(); // Only need to trigger once
          }
        });
      },
      { rootMargin: '50px' } // Start loading 50px before it's visible
    );

    observer.observe(imageRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    // PERFORMANCE: Don't load image until it's visible
    if (!isVisible) {
      return;
    }
    
    // Safe State Update (nur wenn Component noch gemountet)
    const safeSetState = (updater) => {
      if (isMountedRef.current) {
        updater();
      }
    };
    
    // URL-Validierung - FRÜH ABFANGEN
    if (!isValidImageUrl(src)) {
      const invalidUrlError = 'Ungültige Bild-URL';
      // Cache auch ungültige URLs (verhindert wiederholte Validierung)
      imageCache.set(src, { 
        dataUrl: null, 
        error: invalidUrlError, 
        timestamp: Date.now() 
      });
      manageCacheSize();
      
      safeSetState(() => {
        setError(invalidUrlError);
        setLoading(false);
      });
      return;
    }
    
    // Prüfe ob bereits Data-URL (kein Laden nötig)
    if (src?.startsWith('data:image/')) {
      safeSetState(() => {
        setDataUrl(src);
        setLoading(false);
      });
      return;
    }
    
    // Normalisiere URL für Cache (entferne Trailing Slash, etc.)
    const normalizedSrc = src.trim().replace(/\/$/, '');
    
    // Prüfe Cache mit normalisierter URL
    if (imageCache.has(normalizedSrc)) {
      const cached = imageCache.get(normalizedSrc);
      safeSetState(() => {
        if (cached.error) {
          setError(cached.error);
        } else {
          setDataUrl(cached.dataUrl);
        }
        setLoading(false);
      });
      return;
    }
    
    // Prüfe auch ob eine ähnliche URL bereits im Cache ist (mit/ohne Trailing Slash)
    for (const [cachedUrl, cachedData] of imageCache.entries()) {
      if (cachedUrl.trim().replace(/\/$/, '') === normalizedSrc) {
        safeSetState(() => {
          if (cachedData.error) {
            setError(cachedData.error);
          } else {
            setDataUrl(cachedData.dataUrl);
          }
          setLoading(false);
        });
        // Kopiere Cache-Eintrag für normalisierte URL
        imageCache.set(normalizedSrc, cachedData);
        return;
      }
    }
    
    // Callback für diese Component
    const handleImageLoaded = (detail) => {
      if (!isMountedRef.current) return;
      
      const data = detail?.data;
      
      safeSetState(() => {
        if (data?.success && data?.dataUrl) {
          setDataUrl(data.dataUrl);
        } else {
          const errorMsg = typeof data?.error === 'string' 
            ? data.error 
            : 'Bild konnte nicht geladen werden';
          setError(errorMsg);
        }
        setLoading(false);
      });
    };
    
    // Verwende normalisierte URL für Callbacks und Requests
    const urlKey = normalizedSrc;
    
    // Registriere Callback (unterstützt mehrere Components pro URL)
    if (!window._imageLoadCallbacks.has(urlKey)) {
      window._imageLoadCallbacks.set(urlKey, new Set());
    }
    window._imageLoadCallbacks.get(urlKey).add(handleImageLoaded);

    // Bild über Bridge anfordern (nur wenn noch nicht pending)
    if (!pendingRequests.has(urlKey)) {
      if (window.ankiBridge && window.ankiBridge.addMessage) {
        // Erstelle Request-Objekt
        const request = { callbacks: new Set(), timeoutId: null };
        pendingRequests.set(urlKey, request);
        
        // Timeout mit ID speichern
        const timeoutId = setTimeout(() => {
          // Cache Timeout-Fehler
          const timeoutError = 'Zeitüberschreitung beim Laden des Bildes';
          imageCache.set(urlKey, { 
            dataUrl: null, 
            error: timeoutError, 
            timestamp: Date.now() 
          });
          manageCacheSize();
          
          // Notify ALLE wartenden Callbacks (nicht nur diese Component)
          if (window._imageLoadCallbacks.has(urlKey)) {
            const callbacks = window._imageLoadCallbacks.get(urlKey);
            const errorDetail = {
              url: urlKey,
              data: { success: false, error: timeoutError }
            };
            callbacks.forEach(callback => {
              try {
                callback(errorDetail);
              } catch (err) {
                console.error('Error in timeout callback:', err);
              }
            });
            window._imageLoadCallbacks.delete(urlKey);
          }
          
          // Cleanup
          pendingRequests.delete(urlKey);
        }, 15000);
        
        // Speichere Timeout-ID (sowohl lokal als auch im Request-Objekt)
        request.timeoutId = timeoutId;
        timeoutIdRef.current = timeoutId;
        
        // Sende Request mit normalisierter URL
        window.ankiBridge.addMessage('fetchImage', urlKey);
      } else {
        // Fallback für Browser-Modus (nur wenn URL gültig)
        safeSetState(() => {
          setDataUrl(src);
          setLoading(false);
        });
      }
    } else {
      // Request bereits pending - warte auf Callback
      // (Callback ist bereits registriert oben)
    }

    // Cleanup
    return () => {
      isMountedRef.current = false;
      
      // Entferne Callback
      if (window._imageLoadCallbacks.has(src)) {
        const callbacks = window._imageLoadCallbacks.get(src);
        callbacks.delete(handleImageLoaded);
        if (callbacks.size === 0) {
          window._imageLoadCallbacks.delete(src);
        }
      }
      
      // Cancel Timeout (sowohl lokal als auch in pendingRequests)
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      // Cleanup aus pendingRequests (falls noch vorhanden)
      if (pendingRequests.has(src)) {
        const request = pendingRequests.get(src);
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        // Nur löschen wenn keine anderen Callbacks mehr warten
        if (!window._imageLoadCallbacks.has(src) || 
            window._imageLoadCallbacks.get(src).size === 0) {
          pendingRequests.delete(src);
        }
      }
    };
  }, [src, isVisible]);

  // CRITICAL FIX: Use <span> instead of <div> to avoid DOM nesting errors
  // (React-Markdown wraps images in <p> tags, and <div> inside <p> is invalid HTML)
  
  // PERFORMANCE: Show placeholder if not visible yet
  if (!isVisible) {
    return (
      <span ref={imageRef} className="block my-8 rounded-2xl overflow-hidden bg-base-200/30 p-3 shadow-sm" style={{ minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="inline-flex items-center gap-2 px-3 py-2 bg-base-200/30 rounded-lg border border-base-300/50 text-sm text-base-content/50">
          <span className="inline-block w-4 h-4 border-2 border-primary/50 border-t-primary rounded-full animate-spin" />
          <span>Bild wird geladen...</span>
        </span>
      </span>
    );
  }

  // Loading State
  if (loading) {
    return (
      <span ref={imageRef} className="inline-flex items-center gap-2 px-3 py-2 bg-base-200/30 rounded-lg border border-base-300/50 text-sm text-base-content/50">
        <span className="inline-block w-4 h-4 border-2 border-primary/50 border-t-primary rounded-full animate-spin" />
        <span>Lade Bild...</span>
      </span>
    );
  }

  // Error State - mit Fallback-Icon
  if (error) {
    // KRITISCH: Sicherstellen dass error ein String ist (verhindert React Error #60)
    const safeError = typeof error === 'string' ? error : String(error || 'Bild konnte nicht geladen werden');
    
    // Check if it's an external service error (503, timeout, etc)
    const isExternalError = safeError.includes('503') || safeError.includes('Timeout') || safeError.includes('Zeitüberschreitung');
    
    return (
      <span className="inline-flex items-center gap-2 px-3 py-2 bg-warning/10 rounded-lg border border-warning/30 text-sm text-warning">
        <AlertCircle size={16} className="flex-shrink-0" />
        <span>
          {isExternalError ? '⚠️ Bildservice nicht erreichbar' : safeError}
          {isExternalError && <span className="text-xs ml-2 opacity-60">(Unsplash down)</span>}
        </span>
      </span>
    );
  }

  // Bild anzeigen - modernisiertes, cleaneres Design mit weißem Hintergrund
  // CRITICAL: Must use <span> as root to avoid DOM nesting error (react-markdown wraps images in <p>)
  return (
    <span ref={imageRef} className="block my-8 rounded-2xl overflow-hidden bg-white p-3 shadow-sm hover:shadow-md transition-all duration-300">
      <span className="block rounded-xl overflow-hidden bg-white">
        <img 
          src={dataUrl} 
          alt={alt || 'Bild'} 
          className="w-full h-auto object-contain max-h-[500px]"
          loading="lazy"
          style={{ display: 'block' }}
        />
      </span>
      {alt && alt !== 'Bild' && (
        <span className="block text-center text-xs text-base-content/50 mt-2.5 font-medium">
          {alt}
        </span>
      )}
    </span>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - nur re-render wenn src sich ändert
  // Verhindert Duplikate während Streaming
  return prevProps.src === nextProps.src && prevProps.alt === nextProps.alt;
});

ProxyImage.displayName = 'ProxyImage';

// Mermaid Initialisierung
let mermaidInitialized = false;
const initMermaid = () => {
  if (!mermaidInitialized) {
    mermaid.initialize({ 
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true },
      themeVariables: {
        // Hauptfarben - konsistente Grautöne mit Teal-Akzent
        primaryColor: '#252525',      // Hauptfarbe für Knoten (Mittelgrau)
        primaryTextColor: '#e8e8e8',
        primaryBorderColor: '#14b8a6', // Teal für Borders
        lineColor: '#14b8a6',          // Teal für Linien
        secondaryColor: '#1a1a1a',     // Dunkelgrau
        tertiaryColor: '#2a2a2a',      // Hellgrau
        background: '#1a1a1a',
        mainBkg: '#252525',            // Haupt-Hintergrund für Knoten
        secondBkg: '#2a2a2a',          // Sekundär-Hintergrund
        textColor: '#e8e8e8',
        secondaryTextColor: '#9a9a9a',
        tertiaryTextColor: '#6a6a6a',
        border1: '#14b8a6',
        border2: '#2dd4bf',
        noteBkgColor: '#252525',
        noteTextColor: '#e8e8e8',
        noteBorderColor: '#14b8a6',
        activationBorderColor: '#14b8a6',
        activationBkgColor: '#252525',
        sequenceNumberColor: '#e8e8e8',
        labelBoxBkgColor: '#252525',
        labelBoxBorderColor: '#14b8a6',
        labelTextColor: '#e8e8e8',
        loopTextColor: '#e8e8e8',
        actorBorder: '#14b8a6',
        actorBkg: '#252525',
        actorTextColor: '#e8e8e8',
        actorLineColor: '#14b8a6',
        signalColor: '#e8e8e8',
        signalTextColor: '#e8e8e8',
        labelBoxColor: '#252525',
        boxTextColor: '#e8e8e8',
        messageTextColor: '#e8e8e8',
        messageLineColor: '#14b8a6',
        labelColor: '#e8e8e8',
        errorBkgColor: '#ef4444',
        errorTextColor: '#ffffff',
        // Flowchart node background colors (cScale0-cScale11) - konsistente Grautöne
        // Mermaid rotiert durch diese Farben für verschiedene Knoten
        cScale0: '#252525',   // Mittelgrau (Hauptfarbe)
        cScale1: '#2a2a2a',   // Hellgrau
        cScale2: '#1f1f1f',   // Dunkelgrau
        cScale3: '#252525',   // Mittelgrau (wiederholt)
        cScale4: '#2a2a2a',   // Hellgrau (wiederholt)
        cScale5: '#1f1f1f',   // Dunkelgrau (wiederholt)
        cScale6: '#252525',   // Mittelgrau (wiederholt)
        cScale7: '#2a2a2a',   // Hellgrau (wiederholt)
        cScale8: '#1f1f1f',   // Dunkelgrau (wiederholt)
        cScale9: '#252525',   // Mittelgrau (wiederholt)
        cScale10: '#2a2a2a',  // Hellgrau (wiederholt)
        cScale11: '#1f1f1f'   // Dunkelgrau (wiederholt)
      }
    });
    mermaidInitialized = true;
  }
};

// Cache für Mermaid-Diagramme (verhindert wiederholte Render-Versuche)
const mermaidCache = new Map(); // code hash -> { svg, error }

// Cache für Molekül-Renderings (verhindert wiederholte Render-Versuche)
const moleculeCache = new Map(); // smiles -> { rendered: true, error }

// Globaler SmilesDrawer Loader - lädt über CDN
let smilesDrawerPromise = null;
const loadSmilesDrawer = () => {
  if (smilesDrawerPromise) return smilesDrawerPromise;
  
  smilesDrawerPromise = new Promise((resolve, reject) => {
    // Prüfe ob bereits geladen (wird im HTML eingebunden)
    if (window.SmilesDrawer) {
      console.log('✅ SmilesDrawer bereits verfügbar (lokal eingebunden)');
      resolve(window.SmilesDrawer);
      return;
    }
    
    console.log('🧪 Warte auf SmilesDrawer (wird im HTML geladen)...');
    console.log('   window.SmilesDrawer:', typeof window.SmilesDrawer);
    console.log('   Verfügbare Scripts:', Array.from(document.scripts).map(s => s.src).filter(s => s.includes('smiles')));
    
    // Warte länger, falls das Script noch lädt (wird im HTML eingebunden)
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.SmilesDrawer) {
        clearInterval(checkInterval);
        console.log('✅ SmilesDrawer erfolgreich geladen (lokal eingebunden) nach', attempts * 100, 'ms');
        resolve(window.SmilesDrawer);
      } else if (attempts > 50) {
        // 5 Sekunden gewartet (50 * 100ms)
        clearInterval(checkInterval);
        console.error('❌ SmilesDrawer konnte nicht geladen werden (Timeout nach 5s)');
        console.error('   window.SmilesDrawer:', typeof window.SmilesDrawer);
        console.error('   Verfügbare Scripts:', Array.from(document.scripts).map(s => s.src));
        reject(new Error('SmilesDrawer konnte nicht geladen werden. Bitte prüfe, ob smiles-drawer.min.js im assets-Ordner vorhanden ist und im HTML eingebunden ist.'));
      }
    }, 100);
  });
  
  return smilesDrawerPromise;
};

// Mermaid Diagram Component - AUSSERHALB von ChatMessage um Re-Renders zu vermeiden
// CRITICAL: Custom comparison function to prevent unnecessary re-renders
// PERFORMANCE: Uses Intersection Observer to only render when visible
const MermaidDiagram = React.memo(({ code, isStreaming = false }) => {
  const diagramRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [svgContent, setSvgContent] = useState('');
  const renderedRef = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const instanceId = useRef(`diagram-${Math.random().toString(36).substr(2, 9)}`);

  // PERFORMANCE: Intersection Observer - only render when diagram is in viewport
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect(); // Only need to trigger once
          }
        });
      },
      { rootMargin: '100px' } // Start loading 100px before it's visible
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // PERFORMANCE: Don't render if not visible (unless streaming)
    if (!isVisible && !isStreaming) {
      return;
    }

    // WICHTIG: Rendere Mermaid-Diagramme NICHT während des Streamings
    // Das blockiert das Streaming und verursacht Fehler bei unvollständigem Code
    if (isStreaming) {
      // Während Streaming: Zeige nur Placeholder, kein Rendering
      setIsRendering(true);
      setSvgContent('');
      setError(null);
      return;
    }
    
    // CRITICAL: Set rendered flag IMMEDIATELY to prevent parallel renders
    if (renderedRef.current) {
      console.error('📊 MermaidDiagram: Skipping re-render (already rendered)');
      return;
    }
    renderedRef.current = true; // ← SET IMMEDIATELY, not after async!
    
    const renderDiagram = async () => {
      if (!mermaidInitialized) {
        initMermaid();
      }
      
      // Bereinige den Code für Mermaid
      let cleanCode = String(code || '');
      
      // 1. Entferne HTML-Tags (Mermaid kann kein HTML)
      // <br> wird zu Newline statt Leerzeichen, damit Zeilenumbrüche erhalten bleiben
      cleanCode = cleanCode.replace(/<br\s*\/?>/gi, '\n');
      cleanCode = cleanCode.replace(/<[^>]+>/g, '');
      
      // 2. Entferne Markdown-Formatierung (Mermaid kann kein Markdown)
      cleanCode = cleanCode.replace(/\*\*([^*]+)\*\*/g, '$1'); // **bold** → bold
      cleanCode = cleanCode.replace(/\*([^*]+)\*/g, '$1');    // *italic* → italic
      
      // 3. Entferne LaTeX-Dollar-Zeichen
      cleanCode = cleanCode.replace(/\$([^$]+)\$/g, '$1');
      
      // 4. Entferne LaTeX-Tildes (für Leerzeichen)
      cleanCode = cleanCode.replace(/~/g, ' ');
      
      // 5. Entferne Backslash-Escapes
      cleanCode = cleanCode.replace(/\\ /g, ' ');
      cleanCode = cleanCode.replace(/\\,/g, ' ');
      
      // 6. Bereinige mehrfache Leerzeichen (aber BEHALTE Zeilenumbrüche!)
      // Ersetze nur mehrfache Leerzeichen innerhalb einer Zeile, nicht Newlines
      cleanCode = cleanCode.split('\n').map(line => 
        line.replace(/\s+/g, ' ').trim()
      ).filter(line => line.length > 0).join('\n');
      
      // 7. Stelle sicher, dass nach "graph TD" oder "graph LR" ein Newline kommt
      // Falls die KI vergisst, den Newline nach graph TD/LR zu setzen
      cleanCode = cleanCode.replace(/(graph\s+(TD|LR|TB|BT|RL))\s+([A-Z])/gi, '$1\n    $3');
      
      // 7.5. Entferne explizite Farben aus dem Code (style Statements, classDef mit Farben)
      // Entferne style-Statements mit Farben
      cleanCode = cleanCode.replace(/style\s+[A-Za-z0-9_]+\s+fill:[^;]+;?/gi, '');
      cleanCode = cleanCode.replace(/style\s+[A-Za-z0-9_]+\s+stroke:[^;]+;?/gi, '');
      // Entferne classDef mit Farben
      cleanCode = cleanCode.replace(/classDef\s+\w+\s+fill:[^;]+;?/gi, '');
      cleanCode = cleanCode.replace(/classDef\s+\w+\s+stroke:[^;]+;?/gi, '');
      // Entferne class-Zuweisungen (die könnten Farben haben)
      // cleanCode = cleanCode.replace(/class\s+[A-Za-z0-9_]+\s+\w+/gi, ''); // Behalte class für andere Zwecke
      
      // 8. Fix häufige Syntax-Fehler in Mermaid-Diagrammen
      // Fix: "CIV --" → "CIV -->" (fehlender Pfeil)
      cleanCode = cleanCode.replace(/([A-Za-z0-9_]+)\s*--\s*$/gm, '$1 -->');
      // Fix: "--> 2H2O]subgraph" → "--> 2H2O\nsubgraph" (fehlender Newline vor subgraph)
      cleanCode = cleanCode.replace(/\]\s*subgraph/gi, ']\nsubgraph');
      // Fix: "--> CIVCO[Kohlen" → "--> CIVCO[\"Kohlen" (fehlende Anführungszeichen)
      cleanCode = cleanCode.replace(/-->\s*([A-Za-z0-9_]+)\[([^\]"]+)\]/g, '--> $1["$2"]');
      // Fix: Mehrfache Bindestriche ohne Pfeil → Pfeil
      cleanCode = cleanCode.replace(/([A-Za-z0-9_]+)\s*--\s*([A-Za-z0-9_]+)/g, '$1 --> $2');
      // Fix: Ungültige Zeichen in Knoten-Namen (Zahlen am Anfang)
      cleanCode = cleanCode.replace(/([A-Za-z0-9_]+)\[([^\]"]*[0-9]+[^\]"]*)\]/g, (match, node, label) => {
        // Wenn Label mit Zahl beginnt, füge Text hinzu
        if (/^[0-9]/.test(label)) {
          return `${node}["${label}"]`;
        }
        return match;
      });
      
      // 9. Validiere grundlegende Mermaid-Syntax
      // Prüfe ob es ein gültiges Mermaid-Diagramm ist
      const validDiagramTypes = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitgraph', 'journey'];
      const hasValidType = validDiagramTypes.some(type => cleanCode.trim().toLowerCase().startsWith(type));
      
      if (!hasValidType && cleanCode.trim().length > 0) {
        // Versuche automatisch zu erkennen und zu fixen
        if (cleanCode.includes('-->') || cleanCode.includes('--')) {
          cleanCode = 'graph TD\n' + cleanCode;
        }
      }
      
      // Prüfe Cache
      const cacheKey = cleanCode;
      if (mermaidCache.has(cacheKey)) {
        const cached = mermaidCache.get(cacheKey);
        if (cached.error) {
          setError(cached.error);
        } else {
          setSvgContent(cached.svg);
        }
        setIsRendering(false);
        renderedRef.current = true;
        return;
      }
      
      try {
        console.error('📊 MermaidDiagram: Starting render...', { codeLength: cleanCode.length });
        setIsRendering(true);
        setError(null);
        
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, cleanCode);
        
        if (typeof svg === 'string') {
          console.error('✅ MermaidDiagram: Render successful');
          // Entferne explizite Farben aus dem SVG (überschreibe mit konsistenten Farben)
          // Das CSS mit !important überschreibt bereits alles, aber wir bereinigen trotzdem
          let cleanedSvg = svg;
          // Erlaubte Farben (unsere Standard-Farben)
          const allowedFills = ['none', '#252525', '#2a2a2a', '#1f1f1f', '#1a1a1a', 'transparent'];
          const allowedStrokes = ['none', '#14b8a6', '#2dd4bf', 'transparent'];
          
          // Ersetze fill-Attribute mit nicht-erlaubten Farben
          cleanedSvg = cleanedSvg.replace(/fill="([^"]*)"/gi, (match, color) => {
            if (allowedFills.includes(color.toLowerCase())) {
              return match; // Behalte erlaubte Farben
            }
            return 'fill="#252525"'; // Ersetze durch Standard-Farbe
          });
          
          // Ersetze stroke-Attribute mit nicht-erlaubten Farben
          cleanedSvg = cleanedSvg.replace(/stroke="([^"]*)"/gi, (match, color) => {
            if (allowedStrokes.includes(color.toLowerCase())) {
              return match; // Behalte erlaubte Farben
            }
            return 'stroke="#14b8a6"'; // Ersetze durch Standard-Farbe
          });
          
          // Bereinige style-Attribute mit Farben
          cleanedSvg = cleanedSvg.replace(/style="([^"]*)"/gi, (match, styleContent) => {
            let cleanedStyle = styleContent;
            // Ersetze fill in style-Attributen
            cleanedStyle = cleanedStyle.replace(/fill:\s*[^;]+/gi, (fillMatch) => {
              const color = fillMatch.replace(/fill:\s*/i, '').trim();
              if (allowedFills.includes(color.toLowerCase())) {
                return fillMatch;
              }
              return 'fill:#252525';
            });
            // Ersetze stroke in style-Attributen
            cleanedStyle = cleanedStyle.replace(/stroke:\s*[^;]+/gi, (strokeMatch) => {
              const color = strokeMatch.replace(/stroke:\s*/i, '').trim();
              if (allowedStrokes.includes(color.toLowerCase())) {
                return strokeMatch;
              }
              return 'stroke:#14b8a6';
            });
            return `style="${cleanedStyle}"`;
          });
          
          mermaidCache.set(cacheKey, { svg: cleanedSvg });
          setSvgContent(cleanedSvg);
        } else {
          const errorMsg = 'Diagramm konnte nicht gerendert werden';
          console.error('❌ MermaidDiagram: Render failed - invalid SVG');
          mermaidCache.set(cacheKey, { error: errorMsg });
          setError(errorMsg);
        }
      } catch (err) {
        console.error('❌ MermaidDiagram rendering error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err || 'Unbekannter Fehler');
        const truncatedError = errorMsg.length > 150 ? errorMsg.substring(0, 150) + '...' : errorMsg;
        mermaidCache.set(cacheKey, { error: truncatedError });
        setError(truncatedError);
      } finally {
        setIsRendering(false);
        console.error('📊 MermaidDiagram: Render complete');
      }
    };
    
    renderDiagram();
  }, [code, isStreaming, isVisible]);

  if (error) {
    // Fallback: Wenn Rendering fehlschlägt, zeige einfach den Code an.
    // Das verhindert Layout-Probleme und ist nützlicher als eine Fehlermeldung.
    return (
      <div className="my-5 rounded-xl overflow-hidden border border-base-300/50 bg-[#1e1e1e] p-4 shadow-sm group">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-white/40">Diagramm-Quellcode</span>
             <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning/60 text-[10px] font-medium border border-warning/10">
               Render-Fehler
             </span>
           </div>
        </div>
        <pre className="overflow-auto text-sm leading-relaxed max-h-[300px] scrollbar-thin">
          <code className="text-gray-300 font-mono text-xs whitespace-pre">
            {code}
          </code>
        </pre>
      </div>
    );
  }

  // PERFORMANCE: Show placeholder if not visible yet
  if (!isVisible && !isStreaming) {
    return (
      <div ref={containerRef} className="my-5 rounded-xl overflow-hidden border border-base-300/50 bg-base-200/30 p-4 shadow-sm">
        <div className="flex items-center justify-center py-8 text-base-content/40">
          <span className="text-sm">Lade Diagramm...</span>
        </div>
      </div>
    );
  }

  // CRITICAL FIX: Cannot use both dangerouslySetInnerHTML and children
  // Render conditionally based on svgContent
  return (
    <div ref={containerRef} className="my-5 rounded-xl overflow-hidden border border-base-300/50 bg-base-200/30 p-4 shadow-sm">
      <style>{`
        /* Überschreibe alle Mermaid-Knoten-Farben mit konsistenten Grautönen */
        .mermaid-diagram .node rect,
        .mermaid-diagram .node circle,
        .mermaid-diagram .node ellipse,
        .mermaid-diagram .node polygon,
        .mermaid-diagram .node path {
          fill: #252525 !important;
          stroke: #14b8a6 !important;
        }
        .mermaid-diagram .cluster rect {
          fill: #1f1f1f !important;
          stroke: #14b8a6 !important;
        }
        .mermaid-diagram .edgePath .path {
          stroke: #14b8a6 !important;
        }
        .mermaid-diagram .arrowheadPath {
          fill: #14b8a6 !important;
        }
        /* Überschreibe alle anderen Farben */
        .mermaid-diagram [fill]:not([fill="none"]):not([fill="#252525"]):not([fill="#2a2a2a"]):not([fill="#1f1f1f"]):not([fill="#1a1a1a"]) {
          fill: #252525 !important;
        }
        .mermaid-diagram [stroke]:not([stroke="none"]):not([stroke="#14b8a6"]):not([stroke="#2dd4bf"]) {
          stroke: #14b8a6 !important;
        }
      `}</style>
      {svgContent ? (
        <div 
          ref={diagramRef} 
          className="mermaid-diagram flex items-center justify-center min-h-[100px] bg-base-200/20 rounded-lg"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      ) : (
      <div 
        ref={diagramRef} 
        className="mermaid-diagram flex items-center justify-center min-h-[100px] bg-base-200/20 rounded-lg"
      >
          {isRendering && (
          <div className="text-base-content/40 text-sm flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/50 border-t-primary rounded-full animate-spin" />
            <span>Lade Diagramm...</span>
          </div>
        )}
      </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // CRITICAL: Custom comparison to prevent re-renders when code content is the same
  // String-Vergleich statt Referenz-Vergleich (verhindert Re-Renders bei State-Updates)
  const prevCode = String(prevProps.code || '');
  const nextCode = String(nextProps.code || '');
  return prevCode === nextCode;
});

// Molecule Renderer Component - lädt SmilesDrawer über CDN
const MoleculeRenderer = React.memo(({ smiles }) => {
  const canvasRef = useRef(null);
  const canvasIdRef = useRef(`smiles-canvas-${Math.random().toString(36).substr(2, 9)}`);
  const [error, setError] = useState(null);
  const [isRendering, setIsRendering] = useState(true);
  const [smilesDrawerLoaded, setSmilesDrawerLoaded] = useState(false);
  const renderedRef = useRef(false);
  const instanceId = useRef(`molecule-${Math.random().toString(36).substr(2, 9)}`);

  // Lade SmilesDrawer über CDN
  useEffect(() => {
    let cancelled = false;
    
    
    console.log('🧪 MoleculeRenderer: Starte SmilesDrawer-Laden...');
    loadSmilesDrawer()
      .then((SmilesDrawer) => {
        if (!cancelled) {
          console.log('✅ MoleculeRenderer: SmilesDrawer erfolgreich geladen');
          setSmilesDrawerLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('❌ MoleculeRenderer: Failed to load SmilesDrawer:', err);
          setError(`SmilesDrawer-Bibliothek konnte nicht geladen werden: ${err.message}`);
          setIsRendering(false);
        }
      });
    
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!smilesDrawerLoaded || !smiles) {
      if (!smilesDrawerLoaded) {
        return; // Warte auf SmilesDrawer
      }
      setIsRendering(false);
      return;
    }
    
    // Warte bis Canvas im DOM ist - CRITICAL: Canvas muss im DOM sein, bevor draw() aufgerufen wird
    if (!canvasRef.current) {
      console.log('🧪 MoleculeRenderer: Warte auf Canvas-Element...');
      setIsRendering(false);
      return;
    }
    
    // CRITICAL: Prüfe ob Canvas wirklich im DOM ist (getElementById muss funktionieren)
    const canvasInDOM = document.getElementById(canvasIdRef.current);
    if (!canvasInDOM) {
      // Warte kurz und versuche es erneut (React könnte noch nicht gerendert haben)
      setTimeout(() => {
        const retryCanvas = document.getElementById(canvasIdRef.current);
        if (!retryCanvas) {
          setError('Canvas-Element konnte nicht im DOM gefunden werden');
          setIsRendering(false);
        }
        // Wenn Canvas jetzt da ist, wird der useEffect erneut ausgelöst
      }, 100);
      return;
    }

    // CRITICAL: Set rendered flag IMMEDIATELY to prevent parallel renders
    if (renderedRef.current) {
      console.log('🧪 MoleculeRenderer: Skipping re-render (already rendered)');
      return;
    }
    renderedRef.current = true;

    const renderMolecule = () => {
      const SmilesDrawer = window.SmilesDrawer;
      if (!SmilesDrawer) {
        setError('SmilesDrawer nicht verfügbar');
        setIsRendering(false);
        return;
      }

      // Bereinige SMILES-String
      let cleanSmiles = String(smiles || '').trim();
      
      // Entferne Markdown-Code-Block-Marker falls vorhanden
      cleanSmiles = cleanSmiles.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '');
      cleanSmiles = cleanSmiles.trim();

      if (!cleanSmiles) {
        setError('Kein SMILES-String angegeben');
        setIsRendering(false);
        return;
      }

      // Prüfe Cache
      const cacheKey = cleanSmiles;
      if (moleculeCache.has(cacheKey)) {
        const cached = moleculeCache.get(cacheKey);
        if (cached.error) {
          setError(cached.error);
        } else {
          // Re-render from cache (Canvas muss neu gezeichnet werden)
          try {
            const drawer = new SmilesDrawer.Drawer({ 
              width: 400, 
              height: 300,
              bondThickness: 2,
              bondLength: 15,
              isomeric: true,
              terminalCarbons: false,
              overlapSensitivity: 0.42,
              overlapResolutionIterations: 1,
              debug: false,
              experimental: false,
              padding: 30
            });
            
            SmilesDrawer.parse(cleanSmiles, (tree) => {
              // CRITICAL: Stelle sicher, dass Canvas-Element vorhanden ist
              if (!canvasRef.current) {
                setError('Canvas-Element nicht verfügbar');
                setIsRendering(false);
                return;
              }
              
              // Setze Canvas-Dimensionen explizit
              const canvas = canvasRef.current;
              canvas.width = 400;
              canvas.height = 300;
              
              // CRITICAL: Verwende den gleichen Workaround wie im normalen Pfad
              try {
                // Erstelle SVG-Element (wie Drawer.draw() es tut)
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                svg.setAttributeNS(null, 'viewBox', '0 0 ' + drawer.svgDrawer.opts.width + ' ' + drawer.svgDrawer.opts.height);
                svg.setAttributeNS(null, 'width', drawer.svgDrawer.opts.width + '');
                svg.setAttributeNS(null, 'height', drawer.svgDrawer.opts.height + '');
                
                // Rufe svgDrawer.draw() direkt auf (mit infoOnly = false)
                drawer.svgDrawer.draw(tree, svg, 'dark', null, false, []);
                
                // Konvertiere SVG zu Canvas
                const canvas = document.getElementById(canvasIdRef.current);
                if (drawer.svgDrawer.svgWrapper) {
                  drawer.svgDrawer.svgWrapper.toCanvas(canvas, drawer.svgDrawer.opts.width, drawer.svgDrawer.opts.height);
                } else {
                  throw new Error('svgWrapper wurde nicht erstellt');
                }
                setIsRendering(false);
              } catch (drawError) {
                console.error('❌ MoleculeRenderer: draw() error (cache):', drawError);
                setError(drawError?.message || 'Fehler beim Zeichnen');
                setIsRendering(false);
              }
            }, (err) => {
              const errorMsg = err?.message || 'Ungültiger SMILES-String';
              setError(errorMsg);
              moleculeCache.set(cacheKey, { error: errorMsg });
              setIsRendering(false);
            });
          } catch (err) {
            setError('Fehler beim Rendern des Moleküls');
            setIsRendering(false);
          }
        }
        return;
      }

      try {
        console.log('🧪 MoleculeRenderer: Starting render...', { smiles: cleanSmiles.substring(0, 50) });
        setIsRendering(true);
        setError(null);

        // Konfiguration für Dark Mode
        // CRITICAL: clear: true sorgt dafür, dass svgWrapper bei jedem draw() neu erstellt wird
        const drawer = new SmilesDrawer.Drawer({ 
          width: 400, 
          height: 300,
          bondThickness: 2,
          bondLength: 15,
          isomeric: true,
          terminalCarbons: false,
          overlapSensitivity: 0.42,
          overlapResolutionIterations: 1,
          debug: false,
          experimental: false,
          padding: 30,
          clear: true  // CRITICAL: Muss true sein, damit svgWrapper initialisiert wird
        });

        // Parse und rendere SMILES
        SmilesDrawer.parse(cleanSmiles, (tree) => {
          
          // CRITICAL: Stelle sicher, dass Canvas-Element vorhanden und initialisiert ist
          if (!canvasRef.current) {
            console.error('❌ MoleculeRenderer: Canvas-Element nicht gefunden');
            setError('Canvas-Element nicht verfügbar');
            setIsRendering(false);
            return;
          }
          
          // Setze Canvas-Dimensionen explizit
          const canvas = canvasRef.current;
          canvas.width = 400;
          canvas.height = 300;
          
          // Prüfe ob Canvas im DOM ist
          const canvasById = document.getElementById(canvasIdRef.current);
          
          // CRITICAL: SmilesDrawer.draw() erwartet die Canvas-ID als String, nicht das Element!
          // Prüfe nochmal ob Canvas wirklich im DOM ist
          const canvasElementById = document.getElementById(canvasIdRef.current);
          if (!canvasElementById) {
            setError('Canvas-Element nicht im DOM gefunden');
            setIsRendering(false);
            return;
          }
          
          try {
            
            // CRITICAL: Übergebe infoOnly EXPLICIT als false (nicht undefined)
            // WORKAROUND: Rufe svgDrawer.draw() direkt auf, um sicherzustellen, dass svgWrapper erstellt wird
            // Der normale drawer.draw() ruft intern svgDrawer.draw() auf, aber es gibt einen Bug
            // Wir umgehen das, indem wir svgDrawer.draw() direkt aufrufen und dann toCanvas() manuell
            try {
              // Erstelle SVG-Element (wie Drawer.draw() es tut)
              const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
              svg.setAttributeNS(null, 'viewBox', '0 0 ' + drawer.svgDrawer.opts.width + ' ' + drawer.svgDrawer.opts.height);
              svg.setAttributeNS(null, 'width', drawer.svgDrawer.opts.width + '');
              svg.setAttributeNS(null, 'height', drawer.svgDrawer.opts.height + '');
              
              // Rufe svgDrawer.draw() direkt auf (mit infoOnly = false)
              drawer.svgDrawer.draw(tree, svg, 'dark', null, false, []);
              
              // Konvertiere SVG zu Canvas
              const canvas = document.getElementById(canvasIdRef.current);
              if (drawer.svgDrawer.svgWrapper) {
                drawer.svgDrawer.svgWrapper.toCanvas(canvas, drawer.svgDrawer.opts.width, drawer.svgDrawer.opts.height);
              } else {
                throw new Error('svgWrapper wurde nicht erstellt');
              }
            } catch (workaroundError) {
              // Fallback: Versuche normalen drawer.draw() Aufruf
              console.error('❌ MoleculeRenderer: Workaround failed, trying normal draw()', workaroundError);
              drawer.draw(tree, canvasIdRef.current, 'dark', false);
            }
            
            console.log('✅ MoleculeRenderer: Render successful');
            moleculeCache.set(cacheKey, { rendered: true });
            setIsRendering(false);
          } catch (drawError) {
            console.error('❌ MoleculeRenderer: draw() error:', drawError);
            const errorMsg = drawError?.message || 'Fehler beim Zeichnen des Moleküls';
            moleculeCache.set(cacheKey, { error: errorMsg });
            setError(errorMsg);
            setIsRendering(false);
          }
        }, (err) => {
          console.error('❌ MoleculeRenderer parsing error:', err);
          const errorMsg = err?.message || 'Ungültiger SMILES-String';
          const truncatedError = errorMsg.length > 150 ? errorMsg.substring(0, 150) + '...' : errorMsg;
          moleculeCache.set(cacheKey, { error: truncatedError });
          setError(truncatedError);
          setIsRendering(false);
        });
      } catch (err) {
        console.error('❌ MoleculeRenderer error:', err);
        const errorMsg = err instanceof Error ? err.message : String(err || 'Unbekannter Fehler');
        const truncatedError = errorMsg.length > 150 ? errorMsg.substring(0, 150) + '...' : errorMsg;
        moleculeCache.set(cacheKey, { error: truncatedError });
        setError(truncatedError);
        setIsRendering(false);
      }
    };

    renderMolecule();
  }, [smiles, smilesDrawerLoaded]);

  if (error) {
    // Verbesserte Fehleranzeige - ähnlich wie Mermaid
    return (
      <div className="my-4 p-3 bg-base-200/50 border border-base-content/20 rounded-lg">
        <div className="flex items-start gap-2 text-base-content/70 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-warning/70" />
          <div className="flex-1">
            <div className="font-medium mb-1">Molekül konnte nicht gerendert werden</div>
            <div className="text-xs text-base-content/50 mb-2">
              Der SMILES-String ist ungültig oder konnte nicht geparst werden.
            </div>
            <details className="text-xs text-base-content/40">
              <summary className="cursor-pointer hover:text-base-content/60 mb-1">Fehlerdetails anzeigen</summary>
              <div className="mt-2 font-mono whitespace-pre-wrap max-h-[100px] overflow-auto bg-base-300/30 p-2 rounded text-xs">
                {String(error)}
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-5 rounded-xl overflow-hidden border border-base-300/50 bg-base-200/30 p-4 shadow-sm">
      <div className="relative flex items-center justify-center min-h-[250px] bg-base-200/20 rounded-lg">
        <canvas 
          ref={canvasRef}
          id={canvasIdRef.current}
          className="max-w-full h-auto"
          style={{ 
            backgroundColor: 'transparent',
            imageRendering: 'crisp-edges',
            maxWidth: '100%',
            height: 'auto',
            display: 'block'
          }}
        />
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center text-base-content/40 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-primary/50 border-t-primary rounded-full animate-spin" />
            <span>Lade Molekül...</span>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders
  const prevSmiles = String(prevProps.smiles || '');
  const nextSmiles = String(nextProps.smiles || '');
  return prevSmiles === nextSmiles;
});

/**
 * ChatMessage Komponente - INTENT BASED RENDERING
 * Analysiert JSON-Daten oder Intents und rendert die entsprechende High-End Card.
 */
function ChatMessage({ message, from, cardContext, onAnswerSelect, onAutoFlip, isStreaming = false, isLastMessage = false, steps = [], citations = {}, pipelineSteps = [], bridge = null, onPreviewCard, onPerformanceCapture }) {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [score, setScore] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [plusiData, setPlusiData] = useState(null);
  const [intent, setIntent] = useState(null); // 'REVIEW', 'MC', 'HINT', 'EXPLANATION', 'MNEMONIC', 'CHAT'
  const [routerIntent, setRouterIntent] = useState(null); // Router intent: 'EXPLANATION', 'FACT_CHECK', 'MNEMONIC', 'QUIZ', 'CHAT'
  
  const messageRef = useRef(null);
  
  
  // Extract router intent from steps
  useEffect(() => {
    if (steps && steps.length > 0) {
      const intentStep = steps.find(s => 
        s.state?.includes('Intent:') || 
        s.state?.toLowerCase().includes('intent')
      );
      if (intentStep) {
        const match = intentStep.state?.match(/Intent:\s*(\w+)/i);
        if (match && match[1]) {
          setRouterIntent(match[1]);
        }
      }
    }
  }, [steps]);
  
  // Save Multiple Choice data to card when generated
  useEffect(() => {
    if (quizData && quizData.options && cardContext && cardContext.cardId && bridge && bridge.saveMultipleChoice) {
      // Prüfe ob MC-Daten bereits gespeichert wurden (verhindert mehrfaches Speichern)
      const saveKey = `mc_saved_${cardContext.cardId}_${quizData.question?.substring(0, 50)}`;
      if (sessionStorage.getItem(saveKey)) {
        return; // Bereits gespeichert
      }
      
      // Speichere MC-Daten in Anki Card
      const quizDataJson = JSON.stringify(quizData);
      bridge.saveMultipleChoice(cardContext.cardId, quizDataJson, (result) => {
        try {
          const data = JSON.parse(result);
          if (data.success) {
            console.log('MC-Daten erfolgreich in Card gespeichert');
            sessionStorage.setItem(saveKey, 'true');
          } else {
            console.error('Fehler beim Speichern von MC-Daten:', data.error);
          }
        } catch (e) {
          console.error('Fehler beim Parsen von saveMultipleChoice:', e);
        }
      });
    }
  }, [quizData, cardContext, bridge]);
  
  // Sicherheitsüberprüfung: Stelle sicher dass message ein String ist
  const safeMessage = typeof message === 'string' ? message : (message ? String(message) : '');
  
  // Repariere unvollständige LaTeX-Blöcke und problematische LaTeX-Konstrukte
  const fixIncompleteLatex = (text) => {
    if (!text) return text;
    
    let result = text;
    
    // 1. Ersetze Backslash-Leerzeichen in LaTeX durch normale Leerzeichen
    // $Fasciculus\ lateralis$ -> $Fasciculus lateralis$
    result = result.replace(/\$([^$]*)\\\s+([^$]*)\$/g, (match, before, after) => {
      return '$' + before.replace(/\\ /g, ' ') + ' ' + after.replace(/\\ /g, ' ') + '$';
    });
    
    // 2. Bereinige alle LaTeX-Blöcke von Backslash-Leerzeichen
    result = result.replace(/\$([^$]+)\$/g, (match, content) => {
      const cleaned = content.replace(/\\ /g, ' ').replace(/\\,/g, ' ');
      return '$' + cleaned + '$';
    });
    
    // 3. Zähle unescapte $ Zeichen außerhalb von Code-Blöcken
    let dollarCount = 0;
    let inCodeBlock = false;
    let inInlineCode = false;
    
    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      const prevChar = i > 0 ? result[i-1] : '';
      
      // Prüfe auf Code-Blöcke (```)
      if (char === '`' && result[i+1] === '`' && result[i+2] === '`') {
        inCodeBlock = !inCodeBlock;
        i += 2;
        continue;
      }
      
      // Prüfe auf Inline-Code (`)
      if (char === '`' && !inCodeBlock) {
        inInlineCode = !inInlineCode;
        continue;
      }
      
      // Zähle $ nur außerhalb von Code
      if (char === '$' && prevChar !== '\\' && !inCodeBlock && !inInlineCode) {
        dollarCount++;
      }
    }
    
    // Wenn ungerade Anzahl von $, füge ein schließendes $ am Ende hinzu
    if (dollarCount % 2 !== 0) {
      console.log('ChatMessage: Repariere unvollständigen LaTeX-Block');
      result = result + '$';
    }
    
    return result;
  };
  
  const fixedMessage = fixIncompleteLatex(safeMessage);
  
  const isUser = from === 'user';

  // Initialize Mermaid when component mounts (only for bot messages)
  useEffect(() => {
    if (!isUser) {
      initMermaid();
    }
  }, [isUser]);

  // PARSING LOGIC
  useEffect(() => {
    if (!isUser && fixedMessage) {
        // 1. Intent Parsing ([[INTENT: TYPE]])
        const intentMatch = fixedMessage.match(/\[\[INTENT:\s*(\w+)\]\]/);
        if (intentMatch && intentMatch[1]) {
            setIntent(intentMatch[1]);
        }

        // 2. Evaluation Data Parsing ([[EVALUATION_DATA: {...}]])
        const jsonMatch = fixedMessage.match(/\[\[EVALUATION_DATA:\s*(\{[\s\S]*?\})\s*\]\]/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const data = JSON.parse(jsonMatch[1]);
                if (data && typeof data === 'object' && data.score !== undefined) {
                    setReviewData(data);
                    // Force Intent to REVIEW if data is present
                    setIntent('REVIEW');
                } else {
                    console.warn("Invalid Evaluation Data structure", data);
                }
            } catch (e) {
                console.error("Failed to parse Evaluation Data", e);
            }
        }

        // 3. Fallback Score Parsing ([[SCORE: X]])
        if (!jsonMatch) {
            const scoreMatch = fixedMessage.match(/\[\[SCORE:\s*(\d+)\]\]/);
            if (scoreMatch && scoreMatch[1]) {
                setScore(parseInt(scoreMatch[1], 10));
            }
        }

        // 4. Quiz Data Parsing ([[QUIZ_DATA: {...}]])
        const quizMatch = fixedMessage.match(/\[\[QUIZ_DATA:\s*(\{[\s\S]*?\})\s*\]\]/);
        if (quizMatch && quizMatch[1]) {
            try {
                const data = JSON.parse(quizMatch[1]);
                if (data && data.options) {
                    setQuizData(data);
                    setIntent('MC');
                }
            } catch (e) {
                console.error("Failed to parse Quiz Data", e);
            }
        }

        // 5. Plusi Data Parsing ([[PLUSI_DATA: {...}]] or [[PLUSI_LOADING]])
        const plusiMatch = fixedMessage.match(/\[\[PLUSI_DATA:\s*(\{[\s\S]*?\})\s*\]\]/);
        if (plusiMatch && plusiMatch[1]) {
            try {
                const data = JSON.parse(plusiMatch[1]);
                if (data && data.text) {
                    setPlusiData(data);
                }
            } catch (e) {
                console.warn('Failed to parse PLUSI_DATA:', e);
            }
        } else if (fixedMessage.includes('[[PLUSI_LOADING]]')) {
            // Show loading widget while Plusi's AI call is in progress
            setPlusiData({ _loading: true });
        }
    }
  }, [fixedMessage, isUser]);

  // Capture text evaluation performance data for SectionDivider
  useEffect(() => {
    if (reviewData && onPerformanceCapture) {
      onPerformanceCapture({
        type: 'text',
        score: reviewData.score || 0,
        userAnswer: '', // User answer is in a separate user message
        analysis: reviewData.analysis || [],
      });
    }
  }, [reviewData]); // intentionally exclude onPerformanceCapture to avoid loops

  // Render Logic für User Messages (Section Heading)
  if (isUser) {
    // [[OVERVIEW]] is a system-internal trigger — render as heading like any other user message
    const displayText = fixedMessage.startsWith('[[OVERVIEW]]')
      ? fixedMessage.slice('[[OVERVIEW]]'.length).trim() || 'Übersicht'
      : fixedMessage;

    return (
      <div className="pt-4">
        <div
          className="text-[14.5px] font-medium leading-[1.45]"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          {displayText}
        </div>
      </div>
    );
  } 
  
  // === BOT MESSAGE PROCESSING ===
    
  // 1. Multiple Choice Extraction (Legacy Pattern & New Intent)
  // WICHTIG: Pattern muss am Zeilenanfang matchen um Mermaid-Code nicht zu erfassen
  // "A --> C(...)" sollte NICHT als Multiple Choice erkannt werden!
  const mcPattern = /^([A-E]\))\s+([^->\n][^\n]*)(\s*\(✓\s*richtig\))?/gim;
  const mcMatches = [...fixedMessage.matchAll(mcPattern)];
  
  // Zusätzliche Validierung: Prüfe ob es wirklich Quiz-Optionen sind
  // und nicht Mermaid-Code oder andere Artefakte
  const validMcMatches = mcMatches.filter(match => {
    const text = match[2]?.trim() || '';
    // Filtere offensichtliche Nicht-Quiz-Texte aus:
    // - Mermaid-Syntax (enthält -->, ---, ===, |, etc.)
    // - Zu kurze Texte (< 3 Zeichen)
    // - Nur Interpunktion
    if (text.length < 3) return false;
    if (/-->|---|===|\|/.test(text)) return false;
    if (/^[.\-_*#]+$/.test(text)) return false;
    return true;
  });
  
  // Use quizData if available, otherwise fallback to legacy parsing
  // Mindestens 2 valide Optionen für echtes Quiz
  const hasMultipleChoice = (quizData && quizData.options) || validMcMatches.length >= 2 || intent === 'MC';
    
  const mcOptions = quizData?.options || (hasMultipleChoice && validMcMatches.length >= 2 ? validMcMatches.map(match => ({
    letter: match[1].replace(')', ''),
    text: match[2].trim(),
    isCorrect: match[3] !== undefined && match[3].includes('✓')
  })) : null);
    
  // 2. Cleanup Message (Remove Tags for Clean Text)
  let processedMessage = fixedMessage;
  
  // Clean up legacy MC text if we have valid options (either from JSON or regex)
  if (hasMultipleChoice && mcOptions) {
     // If we parsed from JSON, we want to remove ANY fallback text that might look like MC
     if (quizData) {
         // Also try to remove the regex matches if they exist in the text (redundancy)
         processedMessage = processedMessage.replace(mcPattern, '');
     } else {
         // Standard legacy cleanup
         processedMessage = fixedMessage.replace(mcPattern, '');
     }
  }
  // Remove Metadata Tags (sorgfältig, auch Reste entfernen)
  processedMessage = processedMessage.replace(/\[\[QUIZ_DATA:\s*\{[\s\S]*?\}\s*\]\]/g, '');
  processedMessage = processedMessage.replace(/\[\[EVALUATION_DATA:\s*\{[\s\S]*?\}\s*\]\]/g, '');
  processedMessage = processedMessage.replace(/\[\[SCORE:\s*\d+\]\]/g, '');
  processedMessage = processedMessage.replace(/\[\[INTENT:\s*\w+\]\]/g, '');
  processedMessage = processedMessage.replace(/\[\[PLUSI_DATA:\s*\{[\s\S]*?\}\s*\]\]/g, '');
  processedMessage = processedMessage.replace(/\[\[PLUSI_LOADING\]\]/g, '');
  // Remove "JSON undefined" artefacts if any leaked
  processedMessage = processedMessage.replace(/JSON\s*\n\s*undefined/g, '');
  
  // Remove duplicate newlines
  processedMessage = processedMessage.replace(/(---\s*\n\s*){2,}/g, '---\n\n').trim();

  // === CITATION NUMBERING LOGIC (1, 2, 3...) ===
  // Calculate indices once, consistent for Text and Carousel
  const citationIndices = React.useMemo(() => {
    const indices = {};
    if (!citations || Object.keys(citations).length === 0) {
      return indices;
    }
    
    let counter = 1;
    
    // 1. Priority: Order of appearance in text
    // Matches [[CardID: 123]], [[ CardID: 123 ]], [[123]], [[ 123 ]]
    const pattern = /\[\[\s*(?:CardID:\s*)?(\d+)\s*\]\]/gi;
    const matches = [...processedMessage.matchAll(pattern)];
    
    matches.forEach(match => {
        const citationId = match[1]; // ID from text (String)
        const citation = citations[citationId];
        
        if (citation) {
            // Use same logic as in text renderer: noteId || cardId || citationId
            // This ensures consistency between index calculation and rendering
            const id = citation.noteId || citation.cardId || citationId;
            const idKey = String(id); // Always use string key for consistency
            
            // Only assign if not already assigned
            if (!indices[idKey]) {
                indices[idKey] = counter++;
            }
        }
    });
    
    // 2. Remaining citations (found but not referenced in text)
    // Sort keys to be deterministic
    Object.keys(citations).sort().forEach(citationId => {
        const citation = citations[citationId];
        if (citation) {
            // Use same logic as in text renderer: noteId || cardId || citationId
            const id = citation.noteId || citation.cardId || citationId;
            const idKey = String(id); // Always use string key for consistency
            
            if (!indices[idKey]) {
                indices[idKey] = counter++;
            }
        }
    });
    return indices;
  }, [processedMessage, citations]);
  
  // === CITATION REPLACEMENT (BEFORE MARKDOWN RENDERING) ===
  // Replace citation patterns with special markdown links that will be rendered as CitationBadges
  // This must happen AFTER citationIndices is calculated, so we have the correct index numbers
  // Use a ref to store the processed message with citations replaced
  const processedMessageWithCitations = React.useMemo(() => {
    let message = processedMessage;
    if (citations && Object.keys(citations).length > 0) {
      const citationPattern = /\[\[\s*(?:CardID:\s*)?(\d+)\s*\]\]/gi;
      let replacementCount = 0;
      message = message.replace(citationPattern, (match, citationId) => {
        const citation = citations[citationId];
        if (citation) {
          const id = citation.noteId || citation.cardId || citationId;
          const idKey = String(id);
          const index = citationIndices[idKey];
          if (index !== undefined) {
            replacementCount++;
            const replacement = `[${index}](citation:${idKey})`;
            // Replace with a special markdown link that we can catch in the link renderer
            return replacement;
          }
        }
        return match; // Keep original if citation not found or no index
      });
    }
    return message;
  }, [processedMessage, citations, citationIndices]);
    
  // Handler für MC Klick
  const handleAnswerClick = (option) => {
    if (selectedAnswer !== null) return;

    setSelectedAnswer(option.letter);
    const isCorrect = option.isCorrect;
    setAnswerFeedback(isCorrect);

    if (onAnswerSelect) {
        onAnswerSelect(option.letter, isCorrect);
    }

    // Capture MC performance data for SectionDivider
    if (onPerformanceCapture && mcOptions) {
      const correctOption = mcOptions.find(o => o.isCorrect);
      const wrongAnswers = mcOptions
        .filter(o => o.letter === option.letter && !o.isCorrect)
        .map(o => ({ letter: o.letter, text: o.text, explanation: o.explanation }));

      onPerformanceCapture({
        type: 'mc',
        score: isCorrect ? 100 : 0,
        wrongAnswers: isCorrect ? [] : wrongAnswers,
        correctAnswer: correctOption ? correctOption.text : '',
        correctAnswerLetter: correctOption ? correctOption.letter : '',
      });
    }

    if (isCorrect && onAutoFlip) {
        // Verzögerung für Flip bei MC
        setTimeout(() => { onAutoFlip(); }, 1500);
    }
  };

  const handleRetry = () => {
    setSelectedAnswer(null);
    setAnswerFeedback(null);
  };

  // Bot Icon Logic (Einheitliche Farbe, unterschiedliche Icons)
  const getBotIcon = () => {
    // Farbe: Immer Primary/Brand Color (z.B. Teal/Emerald), konsistent
    const baseClass = "bg-primary/10 text-primary"; 
    
    switch(intent) {
        case 'REVIEW': return <CheckCircle size={18} />;
        case 'HINT': return <Lightbulb size={18} />;
        case 'MC': return <List size={18} />; // List Icon für Quiz
        case 'EXPLANATION': return <Brain size={18} />;
        case 'MNEMONIC': return <Sparkles size={18} />;
        case 'CHAT': return <MessageSquare size={18} />;
        default: return <Bot size={18} />;
    }
  };

  // Generate fallback steps if citations exist but no steps
  const generateFallbackSteps = React.useMemo(() => {
    if (steps.length > 0) return steps; // Use existing steps if available
    
    const citationCount = Object.keys(citations).length;
    if (citationCount > 0) {
      // Generate artificial steps to show the retrieval process
      return [
        {
          state: 'Intent: Analyse',
          timestamp: Date.now() - 2000
        },
        {
          state: 'Wissensabruf: ' + citationCount + ' relevante Karten gefunden',
          timestamp: Date.now() - 1000
        }
      ];
    }
    
    return steps; // Return empty array if no citations
  }, [steps, citations]);
  
  // Determine if ThoughtStream should be rendered
  // NOTE: Live pipelineSteps are rendered directly in App.jsx during loading.
  // ChatMessage only renders ThoughtStream for SAVED messages (steps/citations).
  const shouldRenderThoughtStream = React.useMemo(() => {
    if (isUser) return false;
    if (isStreaming) return false; // Live pipeline is handled by App.jsx

    const hasSteps = steps.length > 0 || generateFallbackSteps.length > 0;
    const hasCitations = Object.keys(citations).length > 0;

    return hasSteps || hasCitations;
  }, [isUser, isStreaming, steps.length, generateFallbackSteps.length, citations]);

  // === RENDER RETURN ===
  return (
    <div className="flex flex-col mb-10 animate-in slide-in-from-left-4 duration-500" ref={messageRef}>
        {/* Content area - Full width for bot messages, no icon column */}
        <div className="w-full min-w-0">
            {/* 0. ThoughtStream - Shows during loading and after completion */}
            {shouldRenderThoughtStream ? (
                <>
                  <ThoughtStream
                      steps={generateFallbackSteps}
                      message={message}
                  />
                  {Object.keys(citations).length > 0 && (
                    <SourcesCarousel
                      citations={citations}
                      citationIndices={citationIndices || {}}
                      bridge={bridge}
                      onPreviewCard={onPreviewCard}
                    />
                  )}
                </>
            ) : (
                /* Simple divider for saved bot messages without steps — only for pure text replies (no Plusi, no ReviewCard) */
                !isUser && !plusiData && !reviewData && message && message.trim().length > 0 && (
                  <div className="h-px my-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
                )
            )}
            
            {/* 1. Review Card (Highest Priority) */}
            {reviewData && (
                <ReviewResult data={reviewData} onAutoFlip={onAutoFlip} />
            )}

            {/* Plusi Widget */}
            {plusiData && (
                <PlusiWidget
                    mood={plusiData._loading ? 'thinking' : (plusiData.mood || 'neutral')}
                    text={plusiData.text || ''}
                    metaText={plusiData.meta || ''}
                    isLoading={!!plusiData._loading}
                    isFrozen={!isStreaming && !isLastMessage}
                />
            )}

            {/* Fallback Progress Bar */}
            {!reviewData && score !== null && (
                <ReviewFeedback score={score} onAutoFlip={onAutoFlip} />
            )}

            {/* 2. Multiple Choice Card */}
            {hasMultipleChoice && mcOptions && (
                <MultipleChoiceCard 
                    question={quizData?.question}
                    options={mcOptions} 
                    onSelect={handleAnswerClick} 
                    onRetry={handleRetry} 
                />
            )}

            {/* 3. Text Content (Markdown) - Show only if not empty */}
            {processedMessageWithCitations && (
                <SafeMarkdownRenderer 
                    content={processedMessageWithCitations} 
                    MermaidDiagram={MermaidDiagram} 
                    isStreaming={isStreaming}
                    citations={citations}
                    citationIndices={citationIndices} // PASS INDICES
                    bridge={bridge}
                    onPreviewCard={onPreviewCard}
                />
            )}
        </div>
    </div>
  );
}

// Wrapper mit React.memo für Performance-Optimierung
const MemoizedChatMessage = React.memo(ChatMessage, (prevProps, nextProps) => {
  // Custom comparison - nur re-render wenn sich wichtige Props ändern
  // Verhindert Re-Renders während Streaming (wenn nur message sich ändert)
  return prevProps.message === nextProps.message &&
         prevProps.from === nextProps.from &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.isLastMessage === nextProps.isLastMessage &&
         prevProps.cardContext === nextProps.cardContext &&
         JSON.stringify(prevProps.steps) === JSON.stringify(nextProps.steps) &&
         JSON.stringify(prevProps.citations) === JSON.stringify(nextProps.citations);
});

MemoizedChatMessage.displayName = 'ChatMessage';

export default MemoizedChatMessage;

// Separate Komponente für sicheres Markdown-Rendering mit Error Boundary
function SafeMarkdownRenderer({ content, MermaidDiagram, isStreaming = false, citations = {}, citationIndices = {}, bridge = null, onPreviewCard }) {
  const [hasError, setHasError] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  
  // Validiere Content - KRITISCH für React Error #60
  const safeContent = React.useMemo(() => {
    if (content === null || content === undefined) return '';
    if (typeof content === 'string') return content;
    // Wenn content ein Objekt ist, konvertiere zu String
    if (typeof content === 'object') {
      console.warn('SafeMarkdownRenderer: Content ist ein Objekt, konvertiere zu String:', content);
      try {
        return JSON.stringify(content, null, 2);
      } catch {
        return String(content);
      }
    }
    return String(content);
  }, [content]);

  // Use passed indices or empty map if not provided
  // Note: We don't recalculate here anymore, we trust the parent
  
  // Error Handler für den Fall, dass das Rendering fehlschlägt
  React.useEffect(() => {
    setHasError(false);
    setErrorMsg('');
  }, [safeContent]);
  
  if (hasError) {
    return (
      <div className="markdown-content">
        <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-sm mb-4">
          Fehler beim Rendern: {String(errorMsg)}
        </div>
        <pre className="text-xs text-base-content/60 whitespace-pre-wrap bg-base-200/50 p-4 rounded-lg overflow-auto max-h-[300px]">
          {String(safeContent)}
        </pre>
      </div>
    );
  }
  
  try {
    // USE REACT-MARKDOWN with fixes for dangerouslySetInnerHTML conflicts
    return (
                <div className="markdown-content">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                            // Typography - mehr Abstand und bessere Lesbarkeit
                            h1: ({node, children, ...props}) => {
                              const safeChildren = React.Children.map(children, child => {
                                if (typeof child === 'string' || typeof child === 'number') return child;
                                if (child === null || child === undefined) return '';
                                if (React.isValidElement(child)) return child;
                                return String(child);
                              });
                              return <h1 className="text-xl font-bold mt-6 mb-3 text-base-content tracking-tight first:mt-0" {...props}>{safeChildren}</h1>;
                            },
                            h2: ({node, children, ...props}) => {
                              const safeChildren = React.Children.map(children, child => {
                                if (typeof child === 'string' || typeof child === 'number') return child;
                                if (child === null || child === undefined) return '';
                                if (React.isValidElement(child)) return child;
                                return String(child);
                              });
                              return <h2 className="text-lg font-bold mt-5 mb-3 text-base-content/95 first:mt-0" {...props}>{safeChildren}</h2>;
                            },
                            h3: ({node, children, ...props}) => {
                              const safeChildren = React.Children.map(children, child => {
                                if (typeof child === 'string' || typeof child === 'number') return child;
                                if (child === null || child === undefined) return '';
                                if (React.isValidElement(child)) return child;
                                return String(child);
                              });
                              return <h3 className="text-base font-semibold mt-4 mb-2 text-base-content/90" {...props}>{safeChildren}</h3>;
                            },
                            p: ({node, children, ...props}) => {
                              // Validiere children - verhindert React Error #60
                              const safeChildren = React.Children.map(children, child => {
                                if (typeof child === 'string' || typeof child === 'number') return child;
                                if (child === null || child === undefined) return '';
                                if (React.isValidElement(child)) return child;
                                // Objekt → String konvertieren
                                console.warn('SafeMarkdownRenderer: Ungültiges Kind in <p>, konvertiere:', child);
                                return String(child);
                              });
                              return <p className="mb-5 text-[15px] leading-[1.8] text-base-content/85" {...props}>{safeChildren}</p>;
                            },
                            
                            // Custom Text Renderer für Citations ([[CardID]] oder [CardID] Pattern)
                            // FALLBACK: Auch einzelne Zahlen (1, 2, 3) als Citations erkennen, wenn sie am Anfang/Ende stehen
                            text: ({node, children, ...props}) => {
                              const textContent = String(children || '');
                              
                              // FALLBACK: Wenn nur eine Zahl (1, 2, 3) und Citations vorhanden, versuche als Citation zu rendern
                              // CRITICAL: This must run BEFORE the [[CardID]] pattern check to catch plain numbers
                              if (citations && Object.keys(citations).length > 0 && textContent.match(/^\d+$/)) {
                                const indexNum = parseInt(textContent, 10);
                                // Suche Citation mit diesem Index
                                const citationEntry = Object.entries(citationIndices).find(([id, idx]) => idx === indexNum);
                                if (citationEntry) {
                                  const [idKey, idx] = citationEntry;
                                  const citation = citations[idKey] || Object.values(citations).find(c => {
                                    const cid = c?.noteId || c?.cardId;
                                    return String(cid) === idKey;
                                  });
                                  if (citation) {
                                    return (
                                      <CitationBadge
                                        cardId={idKey}
                                        citation={citation}
                                        index={idx}
                                        onClick={(cardId, citation) => {
                                          if (onPreviewCard) {
                                            onPreviewCard(citation);
                                          } else {
                                            console.warn('onPreviewCard not available, citation click may not work properly');
                                          }
                                        }}
                                      />
                                    );
                                  }
                                }
                              }
                              
                              // Prüfe ob Citations vorhanden und Pattern im Text
                              if (citations && Object.keys(citations).length > 0 && textContent.includes('[[')) {
                                // Parse [[CardID: 123]], [[ 123 ]], [[123]], etc.
                                const citationPattern = /\[\[\s*(?:CardID:\s*)?(\d+)\s*\]\]/gi;
                                const parts = [];
                                let lastIndex = 0;
                                let match;
                                
                                while ((match = citationPattern.exec(textContent)) !== null) {
                                  // Text vor Citation
                                  if (match.index > lastIndex) {
                                    parts.push({ type: 'text', content: textContent.slice(lastIndex, match.index) });
                                  }
                                  
                                  // Citation - support both noteId and cardId
                                  const citationId = match[1]; // ID from text (String)
                                  // Try noteId first (new format), then cardId (old format)
                                  let citation = citations[citationId];
                                  if (!citation) {
                                    // Try as cardId for backward compatibility
                                    citation = citations.get ? citations.get(citationId) : null;
                                  }
                                  if (citation) {
                                    // Use same logic as in citationIndices: noteId || cardId || citationId
                                    // This ensures consistency between index calculation and rendering
                                    const id = citation.noteId || citation.cardId || citationId;
                                    const idKey = String(id); // Always use string key for consistency
                                    // Get index from citationIndices using the same key format
                                    const index = citationIndices[idKey];
                                    
                                    parts.push({ 
                                      type: 'citation', 
                                      cardId: idKey,  // Use consistent string key (same as used for index lookup)
                                      citation,
                                      index // Pass index (from citationIndices lookup)
                                    });
                                  } else {
                                    // Fallback: Plain text if citation not found
                                    parts.push({ type: 'text', content: match[0] });
                                  }
                                  
                                  lastIndex = match.index + match[0].length;
                                }
                                
                                // Restlicher Text
                                if (lastIndex < textContent.length) {
                                  parts.push({ type: 'text', content: textContent.slice(lastIndex) });
                                }
                                
                                // Render parts
                                if (parts.length > 0) {
                                  return (
                                    <>
                                      {parts.map((part, idx) => {
                                        if (part.type === 'citation') {
                                          return (
                                            <CitationBadge
                                              key={idx}
                                              cardId={part.cardId}
                                              citation={part.citation}
                                              index={part.index} // Pass index prop
                                              onClick={(cardId, citation) => {
                                                if (onPreviewCard) {
                                                  onPreviewCard(citation);
                                                } else if (bridge && bridge.previewCard) {
                                                  bridge.previewCard(cardId);
                                                }
                                              }}
                                            />
                                          );
                                        }
                                        return <span key={idx}>{part.content}</span>;
                                      })}
                                    </>
                                  );
                                }
                              }
                              
                              // Fallback: Normaler Text
                              return <span {...props}>{children}</span>;
                            },
                            
                            // Listen mit mehr Abstand
                            ul: ({node, ...props}) => <ul className="mb-6 ml-5 list-disc space-y-3 text-base-content/85 marker:text-primary/60" {...props} />,
                            ol: ({node, ...props}) => <ol className="mb-6 ml-5 list-decimal space-y-3 text-base-content/85 marker:text-primary/60" {...props} />,
                            li: ({node, children, ...props}) => {
                              // FIX: Ensure children are properly rendered, not just spread
                              // Convert objects to strings to prevent [object Object] rendering
                              const safeChildren = React.Children.map(children, child => {
                                if (typeof child === 'object' && child !== null && !React.isValidElement(child)) {
                                  try {
                                    return JSON.stringify(child);
                                  } catch (e) {
                                    return String(child);
                                  }
                                }
                                return child;
                              });
                              return <li className="pl-1 leading-[1.8]" {...props}>{safeChildren}</li>;
                            },
                            
                            // Hervorhebungen - Textmarker Effekt
                            strong: ({node, ...props}) => (
                                <span className="font-semibold text-base-content bg-primary/15 px-1 rounded-sm decoration-clone box-decoration-clone pb-0.5" {...props} />
                            ),
                            em: ({node, ...props}) => <em className="italic text-base-content/75" {...props} />,
                            
                            // Simplified Blockquote - ONLY brand colors (primary), no yellow/red variants
                            blockquote: ({node, children, ...props}) => {
                                // Always use primary brand color - no special coloring for keywords
                                return (
                                    <blockquote className="border-l-2 border-primary/40 bg-primary/5 text-base-content/90 pl-4 py-3 my-5 rounded-none shadow-sm" {...props}>
                                        <div className="reset-strong">
                                            {children}
                                        </div>
                                    </blockquote>
                                );
                            },
                            
                            // Horizontale Linie - subtiler
                            hr: ({node, ...props}) => <hr className="my-6 border-0 h-px bg-gradient-to-r from-transparent via-base-content/20 to-transparent" {...props} />,
                            
                            // Table Styling
                            table: ({node, ...props}) => (
                                <div className="my-5 overflow-hidden rounded-xl border border-base-300/50 shadow-sm">
                                    <table className="min-w-full divide-y divide-base-300/50" {...props} />
                                </div>
                            ),
                            thead: ({node, ...props}) => <thead className="bg-base-200/60" {...props} />,
                            th: ({node, ...props}) => <th className="px-4 py-3 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider" {...props} />,
                            tbody: ({node, ...props}) => <tbody className="divide-y divide-base-300/30 bg-base-100/20" {...props} />,
                            td: ({node, ...props}) => <td className="px-4 py-3 text-sm text-base-content/80" {...props} />,

                            // Code Blocks & Concept Pills
                            code: ({node, inline, className, children, ...props}) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const language = match ? match[1] : '';
                                
                                // Sichere String-Konvertierung (behandelt Arrays und Objekte)
                                let codeString = '';
                                if (Array.isArray(children)) {
                                    codeString = children.map(child => 
                                        typeof child === 'string' ? child : String(child || '')
                                    ).join('');
                                } else {
                                    codeString = String(children || '');
                                }
                                codeString = codeString.replace(/\n$/, '');
                                
                                // Mermaid Diagram Rendering
                                // WICHTIG: Rendere Mermaid-Diagramme NICHT während des Streamings
                                // Das blockiert das Streaming und verursacht Fehler bei unvollständigem Code
                                if (!inline && language === 'mermaid') {
                                    return <MermaidDiagram code={codeString} isStreaming={isStreaming} />;
                                }
                                
                                // SMILES Molecule Rendering - lädt über CDN
                                if (!inline && (language === 'smiles' || language === 'molecule')) {
                                    console.log('🧪 SMILES Code-Block erkannt:', { language, codeString: codeString.substring(0, 50) });
                                    return <MoleculeRenderer smiles={codeString} />;
                                }
                                
                                // Block Code - Simple rendering without SyntaxHighlighter to avoid React conflicts
                                // CRITICAL: Do NOT use {...props} here as it may contain dangerouslySetInnerHTML
                                return !inline ? (
                                    <pre 
                                        className="my-4 rounded-xl overflow-auto p-4 text-sm leading-relaxed"
                                        style={{ 
                                            background: '#1e1e1e', 
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            maxHeight: '500px'
                                        }}
                                    >
                                        <code className="text-gray-300 font-mono text-xs">
                                            {codeString}
                                        </code>
                                    </pre>
                                ) : (
                                    // Inline Code - CRITICAL: Do NOT use {...props}
                                    <code 
                                        className="px-1.5 py-0.5 rounded bg-base-200/80 text-base-content/90 text-sm font-mono"
                                    >
                                        {children}
                                    </code>
                                );
                            },
                            
                            // Link Rendering - handle citation links
                            a: ({node, href, children, ...props}) => {
                              const childrenText = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children || '');

                              // FALLBACK: If link contains only a number (1, 2, 3) and citations exist, try to render as CitationBadge
                              // This handles cases where AI outputs [1] instead of [[CardID: 123]]
                              if (citations && Object.keys(citations).length > 0 && childrenText.match(/^\d+$/)) {
                                const indexNum = parseInt(childrenText, 10);
                                // Find citation with this index
                                const citationEntry = Object.entries(citationIndices).find(([id, idx]) => idx === indexNum);
                                if (citationEntry) {
                                  const [idKey, idx] = citationEntry;
                                  const citation = citations[idKey] || Object.values(citations).find(c => {
                                    const cid = c?.noteId || c?.cardId;
                                    return String(cid) === idKey;
                                  });
                                  if (citation) {
                                    return (
                                      <CitationBadge
                                        cardId={idKey}
                                        citation={citation}
                                        index={idx}
                                        onClick={(cardId, citation) => {
                                          if (onPreviewCard) {
                                            onPreviewCard(citation);
                                          } else {
                                            console.warn('onPreviewCard not available, citation click may not work properly');
                                          }
                                        }}
                                      />
                                    );
                                  }
                                }
                              }
                              
                              // Check if this is a citation link (format: citation:ID)
                              if (href && href.startsWith('citation:')) {
                                const cardId = href.replace('citation:', '');
                                
                                // Try to find citation: first by key (most efficient), then by searching values
                                let citation = citations[cardId];
                                if (!citation) {
                                  // Fallback: search in values (for cases where key doesn't match)
                                  citation = Object.values(citations).find(c => {
                                    const id = c?.noteId || c?.cardId;
                                    return String(id) === cardId;
                                  });
                                }
                                
                                const index = citationIndices[cardId];
                                
                                if (citation) {
                                  return (
                                    <CitationBadge
                                      cardId={cardId}
                                      citation={citation}
                                      index={index}
                                      onClick={(cardId, citation) => {
                                        // Always prefer onPreviewCard to open the modal
                                        if (onPreviewCard) {
                                          onPreviewCard(citation);
                                        } else {
                                          // Fallback: try to construct citation object and use bridge.getCardDetails
                                          // This should not close the session
                                          console.warn('onPreviewCard not available, citation click may not work properly');
                                        }
                                      }}
                                    />
                                  );
                                }
                                // If citation not found, render as normal link (fallback)
                                return <a href={href} {...props}>{children}</a>;
                              }
                              // Normal link - check if it's a number that might be a citation
                              // Normal link - CRITICAL: Prevent default if href is empty, #, or undefined
                              // This prevents navigation to session overview when clicking numbers
                              return <a href={href} {...props} onClick={(e) => {
                                // CRITICAL FIX: Prevent default navigation for empty href, #, or number links
                                if (!href || href === '' || href === '#' || (childrenText && childrenText.match(/^\d+$/))) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }
                                if (props.onClick) props.onClick(e);
                              }}>{children}</a>;
                            },
                            
                            // Image Rendering - verwendet ProxyImage für externe URLs
                            img: ({node, src, alt, ...props}) => {
                                // Verwende ProxyImage für alle Bilder (lädt über Python-Proxy)
                                return <ProxyImage src={src} alt={alt} />;
                            },
                            
                        }}
                    >
                        {safeContent}
                    </ReactMarkdown>
                </div>
    );
  } catch (err) {
    console.error('SafeMarkdownRenderer: Rendering error', err);
    // Zeige Fehler an und aktiviere Fallback
    setTimeout(() => {
      setHasError(true);
      setErrorMsg(err?.message || 'Unbekannter Renderfehler');
    }, 0);
    return (
      <div className="markdown-content">
        <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-sm mb-4">
          Fehler beim Rendern des Inhalts: {String(err?.message || 'Unbekannter Fehler')}
        </div>
        <pre className="text-xs text-base-content/60 whitespace-pre-wrap bg-base-200/50 p-4 rounded-lg overflow-auto max-h-[300px]">
          {String(safeContent)}
        </pre>
      </div>
    );
  }
}
