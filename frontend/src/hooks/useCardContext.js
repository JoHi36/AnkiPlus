import { useState, useCallback, useEffect } from 'react';

/**
 * Hook für Card-Context und Sections
 * Verwaltet Karten-Kontext und Abschnitte basierend auf Karten
 * 
 * WICHTIG: Sections werden NICHT automatisch erstellt, wenn eine Karte geöffnet wird.
 * Sie werden nur erstellt, wenn tatsächlich eine Interaktion (Nachricht) stattfindet.
 * Die Erstellung erfolgt über createSectionForCard(), aufgerufen von useChat.
 */
export function useCardContext() {
  const [cardContext, setCardContext] = useState(null);
  const [sections, setSections] = useState([]);
  const [currentSectionId, setCurrentSectionId] = useState(null);
  const [scrollToSectionId, setScrollToSectionId] = useState(null);
  
  /**
   * Verarbeite Card-Context Event
   * Setzt nur den Kontext, erstellt KEINE Section automatisch
   */
  const handleCardContext = useCallback((cardContextData) => {
    console.log('🃏 useCardContext: Karten-Kontext erhalten:', cardContextData?.cardId);
    console.log('🃏 useCardContext: Karten-Kontext Details:', {
      hasQuestion: !!cardContextData?.question,
      questionLength: cardContextData?.question?.length,
      cardId: cardContextData?.cardId
    });
    
    setCardContext(cardContextData);
    
    // Prüfe ob diese Karte bereits einen Abschnitt hat
    if (cardContextData && cardContextData.cardId) {
      const existingSection = sections.find(s => s.cardId === cardContextData.cardId);
      if (existingSection) {
        setCurrentSectionId(existingSection.id);
      } else {
        // Keine Section erstellen - wird erst bei Interaktion erstellt
        // Setze currentSectionId auf null bis eine Section erstellt wird
        setCurrentSectionId(null);
      }
    }
  }, [sections]);
  
  /**
   * Erstellt eine neue Section für die aktuelle Karte
   * Wird von useChat aufgerufen, wenn die erste Nachricht gesendet wird
   * 
   * @param {string} cardId - Die ID der Karte
   * @param {object} cardContextData - Der Kartenkontext
   * @param {string} initialTitle - Optionaler initialer Titel (z.B. "Lade...")
   * @returns {object} Objekt mit { sectionId, section } für Persistenz
   */
  const createSectionForCard = useCallback((cardId, cardContextData, initialTitle = "Lade Titel...") => {
    // Prüfe ob Section bereits existiert
    const existingSection = sections.find(s => s.cardId === cardId);
    if (existingSection) {
      console.log('🃏 useCardContext: Section existiert bereits:', existingSection.id);
      setCurrentSectionId(existingSection.id);
      return { sectionId: existingSection.id, section: null };
    }
    
    // Neue Section erstellen
    const sectionId = `section-${cardId}-${Date.now()}`;
    const newSection = {
      id: sectionId,
      cardId: cardId,
      title: initialTitle,
      question: cardContextData?.question || '',
      answer: cardContextData?.answer || '',
      createdAt: Date.now()
    };
    
    console.log('🃏 useCardContext: Neue Section erstellt:', sectionId, 'Titel:', initialTitle);
    
    setSections(prev => [...prev, newSection]);
    setCurrentSectionId(sectionId);
    
    // Gib sowohl ID als auch Section zurück für Persistenz
    return { sectionId, section: newSection };
  }, [sections]);
  
  /**
   * Aktualisiert den Titel einer Section
   * Wird aufgerufen, wenn der KI-generierte Titel empfangen wurde
   * 
   * @param {string} sectionId - Die ID der Section
   * @param {string} newTitle - Der neue Titel
   */
  const updateSectionTitle = useCallback((sectionId, newTitle) => {
    console.log('🃏 useCardContext: Section-Titel aktualisiert:', sectionId, '->', newTitle);
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, title: newTitle }
        : section
    ));
  }, []);
  
  /**
   * Prüft ob für eine Karte bereits eine Section existiert
   * 
   * @param {string} cardId - Die ID der Karte
   * @returns {object|null} Die existierende Section oder null
   */
  const getSectionForCard = useCallback((cardId) => {
    return sections.find(s => s.cardId === cardId) || null;
  }, [sections]);
  
  // Scroll zu Abschnitt - State-basierter Ansatz für bessere Zuverlässigkeit
  const handleScrollToSection = useCallback((sectionId) => {
    console.log('🔍 handleScrollToSection: Request für Section:', sectionId);
    // Setze State - useEffect wird reagieren
    setScrollToSectionId(sectionId);
  }, []);
  
  // useEffect der auf scrollToSectionId reagiert
  useEffect(() => {
    if (!scrollToSectionId) return;
    
    console.log('🔍 useEffect: Scrolle zu Section:', scrollToSectionId);
    
    // Mehrere Versuche mit verschiedenen Timings
    const attemptScroll = (attempt = 1) => {
      const element = document.getElementById(scrollToSectionId) || 
                     document.querySelector(`[data-section-id="${scrollToSectionId}"]`);
      
      const container = document.querySelector('#messages-container');
      
      if (!element || !container) {
        if (attempt < 5) {
          console.log(`⚠️ Versuch ${attempt}: Element oder Container nicht gefunden, versuche erneut...`);
          setTimeout(() => attemptScroll(attempt + 1), 100 * attempt);
          return;
        } else {
          console.error('❌ Alle Versuche fehlgeschlagen');
          setScrollToSectionId(null);
          return;
        }
      }
      
      console.log('✅ Element und Container gefunden, scrolle...');
      
      // Direkte Scroll-Berechnung
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      const targetScroll = container.scrollTop + relativeTop - 100;
      
      console.log('📊 Scroll-Details:', {
        relativeTop,
        currentScrollTop: container.scrollTop,
        targetScroll,
        containerHeight: container.clientHeight,
        elementTop: elementRect.top,
        containerTop: containerRect.top
      });
      
      // Scrolle sofort (ohne smooth für sofortige Reaktion)
      container.scrollTop = Math.max(0, targetScroll);
      
      // Dann smooth scroll für bessere UX
      setTimeout(() => {
        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }, 10);
      
      // Subtiler Highlight-Effekt: Simuliere Hover-Animation
      setTimeout(() => {
        // Finde den Button innerhalb der Section
        const button = element.querySelector('button');
        const line = element.querySelector('.flex-1.h-px');
        
        if (button) {
          // Füge temporäre Hover-Klassen hinzu
          button.classList.add('bg-primary/10', 'border-primary/20');
          button.style.transition = 'all 0.4s ease-out';
          
          // Aktualisiere auch die Linie
          if (line) {
            line.classList.remove('from-base-content/15', 'via-base-content/8');
            line.classList.add('from-primary/25', 'via-primary/10');
            line.style.transition = 'all 0.4s ease-out';
          }
          
          // Langsam ausblenden nach 1.5 Sekunden
          setTimeout(() => {
            button.style.transition = 'all 0.8s ease-out';
            button.classList.remove('bg-primary/10', 'border-primary/20');
            
            if (line) {
              line.style.transition = 'all 0.8s ease-out';
              line.classList.remove('from-primary/25', 'via-primary/10');
              line.classList.add('from-base-content/15', 'via-base-content/8');
            }
            
            // Entferne inline styles nach Animation
            setTimeout(() => {
              button.style.transition = '';
              if (line) line.style.transition = '';
            }, 800);
          }, 1500);
        }
      }, 400);
      
      // Reset State
      setScrollToSectionId(null);
    };
    
    // Starte ersten Versuch
    attemptScroll(1);
  }, [scrollToSectionId]);
  
  // Schnellaktion: Hinweis anfordern - gibt Callback zurück
  const createHandleRequestHint = useCallback((handleSend) => {
    return () => {
      if (!cardContext || !cardContext.isQuestion) {
        return;
      }
      const knowledgeScore = cardContext?.stats?.knowledgeScore || 0;
      let hintRequest = "Gib mir einen Hinweis zu dieser Karte, ohne die Antwort zu verraten.";
      
      // Passe Schwierigkeit an Kenntnisstand an
      if (knowledgeScore >= 70) {
        hintRequest += " Die Karte ist gut bekannt - gib einen subtilen, fortgeschrittenen Hinweis, der zum Nachdenken anregt.";
      } else if (knowledgeScore >= 40) {
        hintRequest += " Die Karte ist mäßig bekannt - gib einen hilfreichen Hinweis mit mittlerer Schwierigkeit.";
      } else {
        hintRequest += " Die Karte ist neu oder wenig bekannt - gib einen klaren, einfachen Hinweis, der in die richtige Richtung weist.";
      }
      
      handleSend(hintRequest, null);
    };
  }, [cardContext]);
  
  // Schnellaktion: Multiple Choice erstellen - gibt Callback zurück
  const createHandleRequestMultipleChoice = useCallback((handleSend) => {
    return () => {
      if (!cardContext || !cardContext.isQuestion) {
        return;
      }
      const knowledgeScore = cardContext?.stats?.knowledgeScore || 0;
      let mcRequest = `Erstelle ein Multiple-Choice-Quiz zu dieser Karte mit genau 5 Optionen (A, B, C, D, E).
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt im folgenden Format (ohne Markdown, ohne zusätzlichen Text):

[[QUIZ_DATA: {
  "question": "Die Frage hier",
  "options": [
    { "letter": "A", "text": "Antwort A", "explanation": "Erklärung warum richtig/falsch", "isCorrect": false },
    { "letter": "B", "text": "Antwort B", "explanation": "Erklärung warum richtig/falsch", "isCorrect": true },
    { "letter": "C", "text": "Antwort C", "explanation": "Erklärung warum richtig/falsch", "isCorrect": false },
    { "letter": "D", "text": "Antwort D", "explanation": "Erklärung warum richtig/falsch", "isCorrect": false },
    { "letter": "E", "text": "Antwort E", "explanation": "Erklärung warum richtig/falsch", "isCorrect": false }
  ]
}]]`;
      
      // Passe Schwierigkeit an Kenntnisstand an
      if (knowledgeScore >= 70) {
        mcRequest += " Die Karte ist gut bekannt - erstelle anspruchsvolle Optionen mit ähnlichen, aber subtil unterschiedlichen Antworten, die zum Nachdenken anregen.";
      } else if (knowledgeScore >= 40) {
        mcRequest += " Die Karte ist mäßig bekannt - erstelle Optionen mit mittlerer Schwierigkeit, wobei einige plausible Ablenkungen enthalten sein können.";
      } else {
        mcRequest += " Die Karte ist neu oder wenig bekannt - erstelle einfache, klare Optionen, wobei die falschen Antworten offensichtlich falsch sind, um das Lernen zu unterstützen.";
      }
      
      handleSend(mcRequest, null);
    };
  }, [cardContext]);
  
  return {
    cardContext,
    setCardContext,
    sections,
    setSections,
    currentSectionId,
    setCurrentSectionId,
    handleCardContext,
    handleScrollToSection,
    createSectionForCard,
    updateSectionTitle,
    getSectionForCard,
    createHandleRequestHint,
    createHandleRequestMultipleChoice
  };
}
