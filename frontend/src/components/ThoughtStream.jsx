import React, { useState, useEffect, useRef } from 'react';
import { Brain, Search, Library, ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';

/**
 * ThoughtStream Component - "Perplexity Pro" Style
 * 
 * Features:
 * - Auto-Expands initially.
 * - Locked while thinking (cannot be collapsed).
 * - Shows sources INSIDE the stream.
 * - Auto-Collapses after a delay when answering starts.
 * - Full detail history when re-expanded.
 */
export default function ThoughtStream({ 
  steps = [], 
  citations = {}, 
  citationIndices = {}, // NEW prop
  isStreaming = false, 
  bridge = null,
  intent = null,
  onPreviewCard,
  message = '' // NEW: Pass message to detect when first text chunk arrives
}) {
  // Start expanded ONLY if streaming (active generation). 
  // If loading from history (!isStreaming), start collapsed.
  const [isExpanded, setIsExpanded] = useState(isStreaming); 
  const [currentStatus, setCurrentStatus] = useState("Bereit");
  const [processedSteps, setProcessedSteps] = useState([]);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const [waitingForCitations, setWaitingForCitations] = useState(false);
  const [firstTextChunkReceived, setFirstTextChunkReceived] = useState(false);
  // CRITICAL: Track which steps have been shown to prevent them from disappearing
  const [shownStepIds, setShownStepIds] = useState(new Set());
  
  // CRITICAL: hasTextChunk must be defined at component level (not just in useEffect) for JSX access
  // #region agent log
  const hasTextChunk_debug = message && message.trim().length > 0;
  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:35',message:'hasTextChunk defined at component level',data:{hasTextChunk:hasTextChunk_debug,messageLength:message?.length||0,messageDefined:!!message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const hasTextChunk = message && message.trim().length > 0;
  
  // CRITICAL: lastPhase and isFinished must be defined at component level for JSX access
  const lastStep = steps && steps.length > 0 ? steps[steps.length - 1] : null;
  const lastPhase = lastStep?.phase || null;
  const isFinished = lastPhase === "finished" || (!isStreaming && steps.length > 0 && lastPhase === "generating");
  
  // Analyze steps & Manage Auto-Collapse
  useEffect(() => {
    // #region agent log
    const timestamp = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:32',message:'useEffect triggered',data:{stepsLength:steps?.length||0,citationsCount:Object.keys(citations||{}).length,isStreaming,isExpanded,hasAutoCollapsed,waitingForCitations,intent:!!intent},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    if (!steps || steps.length === 0) {
        if (intent) {
             setCurrentStatus("Analysiere Anfrage...");
        }
        return;
    }

    const state = lastStep?.state || "";

    // 1. Update Status Text - Phase-based logic
    let status = "Verarbeite...";
    if (lastPhase === "intent") status = "Analysiere Anfrage...";
    else if (lastPhase === "search") status = "Durchsuche Wissensdatenbank...";
    else if (lastPhase === "retrieval") status = "Analysiere Suchergebnisse...";
    else if (lastPhase === "generating") status = "Formuliere Antwort...";
    else if (lastPhase === "finished") status = "Fertiggestellt";
    
    // Check if finished (streaming ended or last step is finished phase)
    // Note: isFinished is already defined at component level
    const isGenerating = lastPhase === "generating";
    
    // CRITICAL: Check if we're in retrieval phase (searching for knowledge)
    const isRetrieving = lastPhase === "retrieval" || lastPhase === "search";
    
    // CRITICAL: Check if we have a retrieval step, which indicates citations should arrive
    const hasFoundStep = steps.some(s => s.phase === "retrieval");
    const hasCitations = Object.keys(citations).length > 0;
    
    // #region agent log
    const timestamp2 = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:60',message:'State analysis',data:{isGenerating,isFinished,isRetrieving,hasFoundStep,hasCitations,lastStepState:state.substring(0,50),status},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
    // #endregion
    
    if (isFinished && !isRetrieving && !isGenerating) {
        const count = Object.keys(citations).length;
        status = `Überprüft: ${count} relevante Anki-Karte${count !== 1 ? 'n' : ''}`;
    }
    setCurrentStatus(status);

    // 2. Auto-Collapse Logic - ONLY WHEN GENERATION STARTS
    // CRITICAL: Keep open during retrieval and citation loading
    // Only collapse when generation actually starts (isGenerating = true)
    
    // Track waiting state for citations
    if (hasFoundStep && !hasCitations && (isFinished || isGenerating)) {
        if (!waitingForCitations) {
            // #region agent log
            const timestamp3 = Date.now();
            fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:75',message:'Setting waitingForCitations=true',data:{hasFoundStep,hasCitations,isFinished,isGenerating},timestamp:timestamp3,sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
            // #endregion
            setWaitingForCitations(true);
        }
    } else if (hasCitations && waitingForCitations) {
        // Citations arrived, stop waiting
        // #region agent log
        const timestamp4 = Date.now();
        fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:84',message:'Citations arrived, stopping wait',data:{citationsCount:Object.keys(citations).length},timestamp:timestamp4,sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
        // #endregion
        setWaitingForCitations(false);
    }
    
    // CRITICAL: Immediate auto-collapse when FIRST TEXT CHUNK arrives (message is not empty)
    // Do NOT collapse during retrieval, citation loading, or before text generation starts
    // Keep open during: retrieval, citation loading, waiting for citations, until first text chunk
    // NOTE: hasTextChunk is now defined at component level (above) for JSX access
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:109',message:'useEffect: hasTextChunk check',data:{hasTextChunk,messageLength:message?.length||0,firstTextChunkReceived,isExpanded,hasAutoCollapsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Track when first text chunk arrives and collapse WITH ANIMATION
    // Sanfter Kollaps verhindert Layout-Shift und gibt dem Browser Zeit für Scroll-Anpassung
    if (hasTextChunk && !firstTextChunkReceived) {
        setFirstTextChunkReceived(true);
        // #region agent log
        const timestamp_first = Date.now();
        fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:95',message:'First text chunk received - animated collapse',data:{messageLength:message.length,hasCitations,citationsCount:Object.keys(citations||{}).length},timestamp:timestamp_first,sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
        // #endregion
        // ANIMATED collapse - allows smooth transition and scroll adjustment
        if (isExpanded && !hasAutoCollapsed) {
            // Kurze Verzögerung für sanften Übergang (gibt Browser Zeit für Scroll)
            setTimeout(() => {
                setIsExpanded(false);
                setHasAutoCollapsed(true);
                setWaitingForCitations(false);
            }, 100); // 100ms delay für sanften Übergang
        }
    }

    // 3. Group Steps Logic (Process for Display)
    // CRITICAL: Sort steps by timestamp to ensure correct order
    const sortedSteps = [...steps].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // #region agent log
    const timestamp_sort = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:137',message:'Steps sorted by timestamp',data:{originalLength:steps.length,sortedLength:sortedSteps.length,originalOrder:steps.map(s=>({state:s.state?.substring(0,30),timestamp:s.timestamp})),sortedOrder:sortedSteps.map(s=>({state:s.state?.substring(0,30),timestamp:s.timestamp}))},timestamp:timestamp_sort,sessionId:'debug-session',runId:'run1',hypothesisId:'N'})}).catch(()=>{});
    // #endregion
    
    // CRITICAL: Build steps in correct order: Intent → Search → Retrieval → Finished
    // Use explicit order instead of timestamp-based sorting to ensure correct sequence
    const newProcessedSteps = [];
    
    // Step 1: Intent Phase (always first) - Phase-based
    const intentStep = sortedSteps.find(s => s.phase === "intent");
    if (intentStep || intent) {
        const intentText = intent || intentStep?.metadata?.intent || (intentStep?.state.match(/Intent:\s*(\w+)/)?.[1]) || "General";
        const stepTimestamp = intentStep?.timestamp || sortedSteps[0]?.timestamp || Date.now();
        const existingIdx = processedSteps.findIndex(s => s.id === 'intent');
        if (existingIdx >= 0) {
            // Update existing
            newProcessedSteps.push({
                ...processedSteps[existingIdx],
                detail: intentText, // Store just the text, badge will render separately
                order: 1
            });
        } else {
            // Add new
            newProcessedSteps.push({
                id: 'intent',
                icon: Brain,
                label: "Intentionsanalyse",
                detail: intentText, // Store just the text, badge will render separately
                status: 'done',
                timestamp: stepTimestamp,
                order: 1, // Explicit order
                phase: "intent",
                metadata: intentStep?.metadata || {}
            });
        }
    }

    // Step 2: Search Phase (always second, shows search queries) - Phase-based
    const strategies = sortedSteps.filter(s => s.phase === "search");
    
    if (strategies.length > 0) {
        const stepTimestamp = strategies[0]?.timestamp || Date.now();
        const existingIdx = processedSteps.findIndex(s => s.id === 'search');
        
        // Find scope if available - from metadata or state
        const scopeStep = strategies.find(s => s.metadata?.scope || s.state?.includes("Suchraum:"));
        let rawScope = scopeStep?.metadata?.scope || null;
        
        // If not in metadata, extract from state text (e.g. "Suchraum: Stapel" or "Suchraum: Global")
        if (!rawScope && scopeStep?.state) {
            const stateText = scopeStep.state;
            if (stateText.includes("Suchraum:")) {
                const extractedLabel = stateText.replace("Suchraum:", "").trim();
                // Map German labels to scope values
                if (extractedLabel === "Stapel") {
                    rawScope = "current_deck";
                } else if (extractedLabel === "Global" || extractedLabel === "Sammlung") {
                    rawScope = "collection";
                } else if (extractedLabel === "Karte") {
                    rawScope = "current_card";
                } else {
                    // Fallback: try to match directly
                    rawScope = extractedLabel.toLowerCase().replace(/\s+/g, '_');
                }
            }
        }
        
        // Map scope to badge text
        const scopeMapping = {
            'current_card': 'KARTE',
            'current_deck': 'STAPEL',
            'collection': 'SAMMLUNG'
        };
        const scope = rawScope ? (scopeMapping[rawScope] || rawScope.toUpperCase()) : null;
        
        // Helper to format sub-items into objects
        const parseSubItem = (text) => {
            // Pattern: "Ergebnis: 5 Treffer für 'query...'"
            const match = text.match(/Ergebnis:\s*(\d+)\s*Treffer\s*für\s*'(.*?)'/);
            if (match) {
                return {
                    count: parseInt(match[1]),
                    query: match[2],
                    status: parseInt(match[1]) > 0 ? 'success' : 'empty'
                };
            }
            // Pattern: "Suche: query..."
            const searchMatch = text.match(/Suche:\s*(.+)/);
            if (searchMatch) {
                return {
                    count: null,
                    query: searchMatch[1].trim(),
                    status: 'pending'
                };
            }
            // Legacy/Fallback
            return {
                count: null,
                query: text.replace("Suche:", "").replace("Strategie:", "").trim(),
                status: 'pending'
            };
        };
        
        // Separate precise and broad queries based on step state
        const preciseItems = [];
        const broadItems = [];
        const seenQueries = new Set();
        let currentPhase = 'precise'; // Track which phase we're in
        
        for (const step of sortedSteps) {
            const state = step.state || '';
            if (state.includes('Präzise Suche') || state.includes('Präzise Suche:')) {
                currentPhase = 'precise';
            } else if (state.includes('Erweiterte Suche') || state.includes('Erweiterte Suche:')) {
                currentPhase = 'broad';
            } else if (state.includes('Suche:') && !state.includes('Ergebnis:')) {
                const parsed = parseSubItem(state);
                const normalized = parsed.query?.toLowerCase().trim();
                if (normalized && !seenQueries.has(normalized)) {
                    seenQueries.add(normalized);
                    if (currentPhase === 'precise') {
                        preciseItems.push(parsed);
                    } else if (currentPhase === 'broad') {
                        broadItems.push(parsed);
                    }
                }
            } else if (state.includes('Ergebnis:')) {
                // Match results to queries
                const parsed = parseSubItem(state);
                const normalized = parsed.query?.toLowerCase().trim();
                if (normalized) {
                    // Update existing item if found
                    const allItems = [...preciseItems, ...broadItems];
                    const existingItem = allItems.find(item => item.query?.toLowerCase().trim() === normalized);
                    if (existingItem) {
                        existingItem.count = parsed.count;
                        existingItem.status = parsed.status;
                    } else if (!seenQueries.has(normalized)) {
                        seenQueries.add(normalized);
                        if (currentPhase === 'precise') {
                            preciseItems.push(parsed);
                        } else if (currentPhase === 'broad') {
                            broadItems.push(parsed);
                        }
                    }
                }
            }
        }
        
        // Store grouped items for UI rendering
        const subItems = {
            precise: preciseItems,
            broad: broadItems
        };
        
        if (existingIdx >= 0) {
            // Update existing
            newProcessedSteps.push({
                ...processedSteps[existingIdx],
                detail: scope || null, // Store mapped scope (KARTE, STAPEL, SAMMLUNG)
                subItems: subItems, // Now an object with precise/broad arrays
                order: 2,
                metadata: { ...(processedSteps[existingIdx].metadata || {}), rawScope: rawScope } // Store raw scope for conditional rendering
            });
        } else {
            // Add new
            newProcessedSteps.push({
                id: 'search',
                icon: Search,
                label: "Kontextstrategie",
                detail: scope || null, // Store mapped scope (KARTE, STAPEL, SAMMLUNG)
                status: 'done',
                subItems: subItems, // Now an object with precise/broad arrays
                timestamp: stepTimestamp,
                order: 2, // Explicit order
                phase: "search",
                metadata: { ...(strategies[0]?.metadata || {}), rawScope: rawScope } // Store raw scope for conditional rendering
            });
        }
    }

    // Step 3: Retrieval Phase (always third, shows citations/results) - Phase-based
    const retrieval = sortedSteps.find(s => s.phase === "retrieval");
    // Get mode and sourceCount from generating/finished step for badge
    const generatingStep = sortedSteps.find(s => s.phase === "generating" || s.phase === "finished");
    const mode = generatingStep?.metadata?.mode || 'compact';
    const sourceCount = generatingStep?.metadata?.sourceCount || Object.keys(citations).length;
    
    if (retrieval || Object.keys(citations).length > 0) {
        const count = Object.keys(citations).length;
        const isRetrievalDone = count > 0 || isFinished || isGenerating;
        const stepTimestamp = retrieval?.timestamp || (sortedSteps.length > 0 ? sortedSteps[sortedSteps.length - 1]?.timestamp : Date.now());
        const existingIdx = processedSteps.findIndex(s => s.id === 'retrieval');
        if (existingIdx >= 0) {
            // Update existing
            newProcessedSteps.push({
                ...processedSteps[existingIdx],
                detail: null, // No detail text, badge will show mode + sourceCount
                status: isRetrievalDone ? 'done' : 'loading',
                hasSources: count > 0,
                order: 3,
                metadata: { ...processedSteps[existingIdx].metadata, mode, sourceCount }
            });
        } else {
            // Add new
            newProcessedSteps.push({
                id: 'retrieval',
                icon: Library,
                label: "Relevanzanalyse",
                detail: null, // No detail text, badge will show mode + sourceCount
                status: isRetrievalDone ? 'done' : 'loading',
                hasSources: count > 0,
                timestamp: stepTimestamp,
                order: 3, // Explicit order
                phase: "retrieval",
                metadata: { ...(retrieval?.metadata || {}), mode, sourceCount }
            });
        }
    }

    // Step 4: Finished Phase - REMOVED
    // We now use the explicit Footer component at the end instead of a regular step
    // This prevents duplicate "Fertig" messages

    // Sort by explicit order, then by timestamp as fallback
    newProcessedSteps.sort((a, b) => {
        const orderA = a.order || 999;
        const orderB = b.order || 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.timestamp || 0) - (b.timestamp || 0);
    });
    setProcessedSteps(newProcessedSteps);

  }, [steps, citations, intent, isStreaming, hasAutoCollapsed, isExpanded, waitingForCitations, message, firstTextChunkReceived]);

  // Fallback: If no steps but citations exist (e.g. from history), generate artificial steps
  // This prevents the "empty expanded box" issue
  // Also generate fallback if steps exist but are empty/insufficient
  const displaySteps = React.useMemo(() => {
      // If we have processed steps, use them
      if (processedSteps.length > 0) return processedSteps;
      
      // If we have citations but no steps, generate fallback steps
      const citationCount = Object.keys(citations).length;
      const now = Date.now();
      if (citationCount > 0) {
          return [
              {
                  id: 'intent',
                  icon: Brain,
                  label: "Anfrage analysiert",
                  detail: "Kontext wurde wiederhergestellt",
                  status: 'done',
                  timestamp: now - 2000 // 2s ago
              },
              {
                  id: 'retrieval',
                  icon: Library,
                  label: "Wissensabruf",
                  detail: `${citationCount} relevante Karten gefunden`,
                  status: 'done',
                  hasSources: true,
                  timestamp: now - 1000 // 1s ago
              }
          ];
      }
      
      // If we have steps from props but they're not processed (e.g., empty or malformed),
      // but we have citations, still generate fallback
      if (steps.length === 0 && citationCount > 0) {
          return [
              {
                  id: 'intent',
                  icon: Brain,
                  label: "Anfrage analysiert",
                  detail: "Kontext wurde wiederhergestellt",
                  status: 'done',
                  timestamp: now - 2000 // 2s ago
              },
              {
                  id: 'retrieval',
                  icon: Library,
                  label: "Wissensabruf",
                  detail: `${citationCount} relevante Karten gefunden`,
                  status: 'done',
                  hasSources: true,
                  timestamp: now - 1000 // 1s ago
              }
          ];
      }
      
      return [];
  }, [processedSteps, citations, steps.length]);

  // Determine visual states - Phase-based (lastPhase already defined at component level)
  const isThinking = isStreaming && lastPhase !== "generating" && lastPhase !== "finished";
  const hasCitations = Object.keys(citations).length > 0;
  const hasSteps = displaySteps.length > 0 || steps.length > 0;

  // #region agent log
  const timestamp_render = Date.now();
  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:205',message:'Rendering decision',data:{hasSteps,hasCitations,hasIntent:!!intent,isThinking,willRender:!(!hasSteps && !intent && !hasCitations && !isThinking)},timestamp:timestamp_render,sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  // #endregion

  // CRITICAL: Always render if we have citations OR steps, even after collapse
  // This ensures the ThoughtStream can be expanded again to see citations
  // Don't render only if completely empty (no steps, no citations, no intent, not thinking)
  if (!hasSteps && !intent && !hasCitations && !isThinking) {
    // #region agent log
    const timestamp_no_render = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThoughtStream.jsx:213',message:'ThoughtStream returning null',data:{hasSteps,hasCitations,hasIntent:!!intent,isThinking},timestamp:timestamp_no_render,sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    return null;
  }

  // Handler for toggle - prevent closing while thinking
  const handleToggle = () => {
    if (isThinking) return; // Locked while thinking
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mb-3 font-sans max-w-full overflow-hidden">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
      {/* 1. Header (Always visible) - Static Container, No Animations */}
      <button 
        onClick={handleToggle}
        disabled={isThinking}
        className={`group relative flex items-center justify-start gap-3 px-0 py-2 w-full text-left
                   ${isThinking ? 'cursor-default' : 'cursor-pointer hover:opacity-100'}
                   ${!isThinking && !isExpanded ? 'opacity-70' : 'opacity-100'}`}
      >
        {/* ANKI+ Text - Always visible with proper gradient */}
        <div className="relative z-10">
            {!isStreaming && !isFinished ? (
                <span 
                    className="text-sm"
                    style={{
                        fontWeight: 700,
                        background: "linear-gradient(to right, rgb(15, 118, 110) 0%, rgb(15, 118, 110) 20%, rgb(94, 234, 212) 50%, rgb(15, 118, 110) 80%, rgb(15, 118, 110) 100%)",
                        backgroundSize: "200% auto",
                        backgroundClip: "text",
                        WebkitBackgroundClip: "text",
                        WebkitFontSmoothing: "antialiased",
                        color: "transparent",
                        animation: "shimmer 3s linear infinite"
                    }}
                >
                    ANKI+
                </span>
            ) : (
                <span className="text-sm" style={{ fontWeight: 700, color: "rgb(13, 148, 136)", WebkitFontSmoothing: "antialiased" }}>
                    ANKI+
                </span>
            )}
        </div>

        {/* Chevron - Between ANKI+ and Badge */}
        {!isThinking && (displaySteps.length > 0 || hasCitations) && (
            <div className="relative z-10 p-1 rounded-full hover:bg-base-200 transition-transform duration-200">
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-base-content/40" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-base-content/40" />
                )}
            </div>
        )}

        {/* Info Badge - Only visible when collapsed */}
            {!isExpanded && !isThinking && (displaySteps.length > 0 || hasCitations) && (
            <div className="relative z-10 flex items-center gap-1.5 text-xs text-base-content/40">
                    {displaySteps.length > 0 && <span>{displaySteps.length} Schritte</span>}
                    {hasCitations && (
                        <>
                            <span className="w-1 h-1 rounded-full bg-base-content/30" />
                        <span>{Object.keys(citations).length} Quellen</span>
                        </>
                    )}
            </div>
        )}
      </button>

      {/* 2. Expanded Content (The "Stream") - Grid-based Timeline */}
      {/* CRITICAL: Only render if we have steps OR show fallback placeholder when thinking */}
      {/* AnimatePresence + motion.div mit layout prop für sanfte Höhenänderung */}
      <AnimatePresence initial={false}>
        {isExpanded && (() => {
          // If we have steps, render normally
          if (displaySteps.length > 0 || hasCitations) {
            return true;
          }
          // If thinking but no steps yet, show placeholder
          if (isThinking) {
            return true;
          }
          return false;
        })() && (
          <motion.div
            key="expanded-content"
            layout // WICHTIG: layout prop ermöglicht sanfte Höhenänderung
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              height: { duration: 0.3, ease: 'easeInOut' },
              opacity: { duration: 0.2 }
            }}
            className="py-2 overflow-hidden"
          >
            {/* Grid Container: Timeline Column (1.5rem) + Content Column (flex-1) */}
            <div className="grid grid-cols-[1.5rem_1fr] gap-0">
                {/* Timeline Column - Fixed width, centered with visible line */}
                <div className="flex flex-col items-center relative self-stretch">
                    {/* Start Dot - Top */}
                    <div className="w-2 h-2 rounded-full bg-base-content/30 shadow-sm z-10 mb-2 flex-shrink-0" />
                    
                    {/* Timeline Line - Always visible, connects all steps */}
                    <div className="absolute left-1/2 top-2 bottom-0 w-0.5 -translate-x-1/2 -z-0">
                        {/* Background Line (Ghost) - Always visible base */}
                        <div className="absolute inset-0 bg-base-content/5" />
                        
                        {/* Active/Done Line - Grows as steps complete */}
                        {(() => {
                            const allStepsDone = displaySteps.length > 0 && displaySteps.every(s => s.status === 'done');
                            const isFinished = hasTextChunk && !isStreaming && allStepsDone;
                            
                            // Find last active step
                            const lastActiveStep = [...displaySteps].reverse().find(s => 
                                s.phase === lastPhase && 
                                lastPhase !== null && 
                                lastPhase !== "finished" && 
                                lastPhase !== "generating"
                            );
                            const hasActiveStep = lastActiveStep !== undefined;
                            const isLiquidLine = hasActiveStep && !isFinished;
                            
                            return (
                                <motion.div 
                                    className="w-full origin-top"
                                    initial={{ height: 0 }}
                                    animate={{ height: isFinished ? '100%' : (hasActiveStep ? '100%' : '0%') }}
                                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                                    style={isLiquidLine ? {
                                        // Liquid line: gradient extends below active step
                                        background: "linear-gradient(to bottom, hsl(var(--bc) / 0.2) 0%, hsl(var(--bc) / 0.2) calc(100% - 24px), transparent 100%)",
                                        minHeight: '20px'
                                    } : {
                                        // Solid line: connection established
                                        background: "hsl(var(--bc) / 0.2)"
                                    }}
                                />
                            );
                        })()}
                    </div>
                    
                    {/* End Dot - Always visible when footer exists */}
                    {(() => {
                        const mainSteps = displaySteps.filter(s => s.id === 'intent' || s.id === 'search' || s.id === 'retrieval');
                        const allMainStepsDone = mainSteps.length > 0 && mainSteps.every(s => s.status === 'done');
                        const isInGeneratingPhase = lastPhase === "generating" || lastPhase === "finished";
                        const shouldShowFooter = steps.length > 0 && allMainStepsDone && isInGeneratingPhase;
                        
                        if (shouldShowFooter) {
                            return (
                                <div className="w-2 h-2 rounded-full bg-base-content/30 shadow-sm z-10 mt-auto mb-0 flex-shrink-0" />
                            );
                        }
                        return null;
                    })()}
                </div>

                {/* Content Column */}
                <div className="space-y-6 pl-3 min-w-0">
                {/* Fallback placeholder when thinking but no steps yet */}
                {displaySteps.length === 0 && isThinking && (
                  <div className="flex flex-col gap-2 group/step">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-base-200">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-base-content/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-base-content/80">Initialisiere...</div>
                      </div>
                    </div>
                  </div>
                )}
                <AnimatePresence mode="popLayout">
                  {displaySteps.map((step, idx) => {
                    const Icon = step.icon;
                    
                    // Determine if response is finished (all steps should appear instantly)
                    const allStepsDone = displaySteps.every(s => s.status === 'done');
                    const isResponseFinished = hasTextChunk && !isStreaming && allStepsDone;
                    
                    // Sequential animation: Only animate if response is still being generated
                    // If finished, show everything instantly (no delay, no animation)
                    const animationDelay = isResponseFinished ? 0 : idx * 300; // 300ms delay between each step when active
                    const shouldAnimate = !isResponseFinished; // Only animate if not finished
                    
                    // Determine if this is the active step based on current phase
                    // Step is active if its phase matches the current lastPhase
                    const isActiveStep = step.phase === lastPhase && lastPhase !== null && lastPhase !== "finished" && lastPhase !== "generating";
                    
                    // Determine if this is the last active step (for timeline gradient)
                    const isLastActiveStep = isActiveStep && (idx === displaySteps.length - 1 || 
                      !displaySteps.slice(idx + 1).some(s => s.phase === lastPhase));
                    
                    return (
                        <motion.div
                            key={step.id || `step-${idx}`}
                            initial={shouldAnimate ? { opacity: 0, y: -10 } : { opacity: 1, y: 0 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{
                                opacity: { duration: 0.4, delay: animationDelay / 1000 },
                                y: { duration: 0.4, delay: animationDelay / 1000, ease: 'easeOut' }
                            }}
                            className="flex flex-col gap-2 group/step"
                        >
                                                    <div className="flex items-start gap-3">
                                                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300 mt-0.5
                                                                        ${isActiveStep ? 'bg-base-200' : 'bg-base-100 border border-base-200'}`}>
                                                            {isActiveStep ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-base-content/60" />
                                                            ) : (
                                                                <Icon className="w-3.5 h-3.5 text-base-content/50" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs font-semibold text-base-content/80">{step.label}</div>
                                                            {/* Intent Badge - Subtle, directly under title */}
                                                            {step.id === 'intent' && step.detail && (
                                                                <div className="mt-1">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider bg-teal-500/10 text-teal-400">
                                                                        {step.detail}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {/* Retrieval Badge - Mode + SourceCount */}
                                                            {step.id === 'retrieval' && step.metadata?.mode && (
                                                                <div className="mt-1">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider bg-primary/10 text-primary">
                                                                        {step.metadata.mode.toUpperCase()} • {step.metadata.sourceCount || 0} QUELLEN
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {/* Scope Badge - Only if scope exists, same style as Intent Badge */}
                                                            {step.id === 'search' && step.detail && (
                                                                <div className="mt-1">
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider bg-teal-500/10 text-teal-400">
                                                                        {step.detail}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {/* Fallback: Show detail text only if not a badge step */}
                                                            {step.id !== 'intent' && step.id !== 'retrieval' && step.id !== 'search' && step.detail && (
                                                            <div className="text-xs text-base-content/60 mt-0.5 leading-relaxed">
                                                                {step.detail}
                                                            </div>
                                                            )}
                                                            
                                                                                            {/* Sub Items (Queries) - Grouped Tag Cloud */}
                                                                                            {/* Hide queries if scope is current_card (no search needed) */}
                                                                                            {step.subItems && step.metadata?.rawScope !== 'current_card' && (
                                                                                                (step.subItems.precise && step.subItems.precise.length > 0) || 
                                                                                                (step.subItems.broad && step.subItems.broad.length > 0) || 
                                                                                                (Array.isArray(step.subItems) && step.subItems.length > 0)
                                                                                            ) && (
                                                                                                <div className="mt-2 flex flex-col gap-3 max-w-full">
                                                                                                    {/* Precise Queries Group */}
                                                                                                    {step.subItems.precise && step.subItems.precise.length > 0 && (
                                                                                                        <div className="flex flex-col gap-3 max-w-full">
                                                                                                            <div className="text-[10px] font-medium text-base-content/40 uppercase tracking-wide">Präzise Suche</div>
                                                                                                            <div className="flex flex-wrap gap-2 items-center max-w-full">
                                                                                                                {step.subItems.precise.map((item, i) => (
                                                                                                                    <div 
                                                                                                                        key={`precise-${i}-${item.query}`}
                                                                                                                        className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all duration-300
                                                                                                                                   ${item.status === 'empty' 
                                                                                                                                      ? 'bg-base-200/20 border-base-content/5 opacity-40' 
                                                                                                                                      : 'bg-base-200/50 border-base-200 shadow-sm'}`}
                                                                                                                    >
                                                                                                                        <Search className={`w-3 h-3 flex-shrink-0 ${item.status === 'empty' ? 'opacity-30' : 'text-primary/60'}`} />
                                                                                                                        <span className={`font-medium whitespace-normal break-words ${item.status === 'empty' ? 'line-through decoration-base-content/30' : 'text-base-content/70'}`}>
                                                                                                                            {item.query}
                                                                                                                        </span>
                                                                                                                        
                                                                                                                        {item.count !== null && (
                                                                                                                            <div className={`flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center
                                                                                                                                            ${item.status === 'empty' 
                                                                                                                                                ? 'bg-base-content/5 text-base-content/30' 
                                                                                                                                                : 'bg-primary/10 text-primary'}`}>
                                                                                                                                {item.count}
                                                                                                                            </div>
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    )}
                                                                                                    
                                                                                                    {/* Broad Queries Group */}
                                                                                                    {step.subItems.broad && step.subItems.broad.length > 0 && (
                                                                                                        <div className="flex flex-col gap-3 max-w-full">
                                                                                                            <div className="text-[10px] font-medium text-base-content/40 uppercase tracking-wide">Erweiterte Suche</div>
                                                                                                            <div className="flex flex-wrap gap-2 items-center max-w-full">
                                                                                                                {step.subItems.broad.map((item, i) => (
                                                                                                                    <div 
                                                                                                                        key={`broad-${i}-${item.query}`}
                                                                                                                        className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all duration-300
                                                                                                                       ${item.status === 'empty' 
                                                                                                                          ? 'bg-base-200/20 border-base-content/5 opacity-40' 
                                                                                                                          : 'bg-base-200/50 border-base-200 shadow-sm'}`}
                                                                                                        >
                                                                                                                <Search className={`w-3 h-3 flex-shrink-0 ${item.status === 'empty' ? 'opacity-30' : 'text-primary/60'}`} />
                                                                                                                        <span className={`font-medium whitespace-normal break-words ${item.status === 'empty' ? 'line-through decoration-base-content/30' : 'text-base-content/70'}`}>
                                                                                                                    {item.query}
                                                                                                                </span>
                                                                                                                        
                                                                                                                        {item.count !== null && (
                                                                                                                            <div className={`flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center
                                                                                                                                            ${item.status === 'empty' 
                                                                                                                                                ? 'bg-base-content/5 text-base-content/30' 
                                                                                                                                                : 'bg-primary/10 text-primary'}`}>
                                                                                                                                {item.count}
                                                                                                                            </div>
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    )}
                                                                                                    
                                                                                                    {/* Fallback: Legacy array format */}
                                                                                                    {Array.isArray(step.subItems) && step.subItems.length > 0 && (
                                                                                                        <div className="flex flex-wrap gap-2 items-center max-w-full">
                                                                                                            {step.subItems.map((item, i) => (
                                                                                                                <div 
                                                                                                                    key={i}
                                                                                                                    className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all duration-300
                                                                                                                               ${item.status === 'empty' 
                                                                                                                                  ? 'bg-base-200/20 border-base-content/5 opacity-40' 
                                                                                                                                  : 'bg-base-200/50 border-base-200 shadow-sm'}`}
                                                                                                                >
                                                                                                                    <Search className={`w-3 h-3 flex-shrink-0 ${item.status === 'empty' ? 'opacity-30' : 'text-primary/60'}`} />
                                                                                                                    <span className={`font-medium whitespace-normal break-words ${item.status === 'empty' ? 'line-through decoration-base-content/30' : 'text-base-content/70'}`}>
                                                                                                                        {item.query}
                                                                                                                    </span>
                                                                                                            
                                                                                                            {item.count !== null && (
                                                                                                                <div className={`flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center
                                                                                                                                ${item.status === 'empty' 
                                                                                                                                    ? 'bg-base-content/5 text-base-content/30' 
                                                                                                                                    : 'bg-primary/10 text-primary'}`}>
                                                                                                                    {item.count}
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    ))}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            )}                                                        </div>
                                                    </div>
                            {/* SOURCES CAROUSEL (Embedded inside the Retrieval Step) */}
                            {step.hasSources && hasCitations && (
                                <div className="ml-8 mt-1 animate-in fade-in slide-in-from-left-2 duration-300 max-w-full overflow-hidden">
                                    <SourcesCarousel 
                                        citations={citations} 
                                        citationIndices={citationIndices} // Pass indices
                                        bridge={bridge} 
                                        onPreviewCard={onPreviewCard}
                                    />
                                </div>
                            )}
                        </motion.div>
                    );
                  })}
                </AnimatePresence>
                
                    {/* Footer Step - Synthese with Model Branding */}
                    <AnimatePresence>
                      {(() => {
                        // Check if all main steps (Intent, Search, Retrieval) are done
                        const mainSteps = displaySteps.filter(s => s.id === 'intent' || s.id === 'search' || s.id === 'retrieval');
                        const allMainStepsDone = mainSteps.length > 0 && mainSteps.every(s => s.status === 'done');
                        
                        // Footer should only appear when:
                        // 1. All main steps (intent, search, retrieval) are done
                        // 2. We have steps (not empty)
                        // 3. We're ACTUALLY in generating phase OR finished phase
                        const isInGeneratingPhase = lastPhase === "generating" || lastPhase === "finished";
                        const shouldShowFooter = steps.length > 0 && allMainStepsDone && isInGeneratingPhase;
                        
                        if (!shouldShowFooter) {
                            return null;
                        }
                        
                        // Get mode from steps metadata (same logic as retrieval badge)
                        const generatingStep = steps.find(s => s.phase === "generating" || s.phase === "finished");
                        const mode = generatingStep?.metadata?.mode || 'compact';
                        
                        const isGenerating = !hasTextChunk && isStreaming && shouldShowFooter;
                        const isFinished = hasTextChunk && !isStreaming && shouldShowFooter;
                        
                        if (isGenerating || isFinished) {
                            return (
                                <motion.div
                                    key="footer-step"
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                    className="flex flex-col gap-2 group/step"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-300 border border-base-200 z-10
                                                        ${isGenerating ? 'bg-base-200' : 'bg-teal-500/10 border-teal-500/20'}`}>
                                            {isGenerating ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-base-content/60" />
                                            ) : (
                                                <Check className="w-3.5 h-3.5 text-teal-500" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {isGenerating ? (
                                                <>
                                                    <div className="text-xs font-semibold text-base-content/80">
                                                        Synthese
                                                    </div>
                                                    <div className="text-xs text-base-content/60 mt-0.5">
                                                        Verarbeite Quellen...
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-2 h-full">
                                                    {/* Titel */}
                                                    <span className="text-xs font-semibold text-base-content/80">
                                                        Synthese
                                                    </span>
                                                    
                                                    {/* Premium Model Badge - Inline */}
                                                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border tracking-wider flex items-center h-5
                                                        ${mode === 'detailed' 
                                                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                                                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                                        {mode === 'detailed' ? 'PRO' : 'FLASH'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        }
                        return null;
                      })()}
                    </AnimatePresence>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  );
}
