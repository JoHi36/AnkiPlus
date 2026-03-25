# ThoughtStream v5 — Clean Pipeline UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild ThoughtStream as a clean, borderless, divider-based pipeline UI with rich router details, source badges, and user messages as section headings.

**Architecture:** Rewrite ThoughtStream.tsx rendering (keep useSmartPipeline hook). Add response_length to router. Fix scope fallback duplicate steps. Restructure chat layout so user messages are headings and ThoughtStream lives in the divider between question and answer.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, framer-motion, Python/Qt backend

**Spec:** `docs/superpowers/specs/2026-03-19-thoughtstream-v5-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `shared/components/ThoughtStream.tsx` | Rewrite rendering | Pipeline UI — collapsed/expanded, phase content, animations |
| `shared/components/SourceCard.tsx` | Modify | Add `sources` field to Citation, star badge for dual-source, remove isCurrentCard |
| `shared/components/SourcesCarousel.tsx` | Modify | Reduce card width to 130px, remove isCurrentCard sorting |
| `frontend/src/components/ChatMessage.jsx` | Modify | User messages become headings (no bubble) |
| `frontend/src/App.jsx` | Modify | ThoughtStream as divider between heading and answer |
| `frontend/src/hooks/useChat.js` | Modify | Filter out 'generating' steps from pipelineSteps |
| `ai_handler.py` | Modify | Add response_length to router, add fallback flag to _emit_pipeline_step |
| `hybrid_retrieval.py` | Modify | Fix scope fallback duplicate emission |

---

### Task 1: Backend — Add `response_length` to Router

**Files:**
- Modify: `ai_handler.py:2083-2112` (router prompt), `ai_handler.py:2176-2181` (router done emission)

- [ ] **Step 1: Add response_length to router prompt**

In `ai_handler.py`, find the router prompt at line ~2083. Add `response_length` to the JSON schema instruction:

```python
router_prompt = f"""Du bist ein Such-Router für eine Lernkarten-App. Entscheide ob und wie gesucht werden soll.

Benutzer-Nachricht: "{user_message}"
{f'Letzte Antwort: "{last_assistant_message[:200]}"' if last_assistant_message else ''}

Karten-Kontext:
- Frage: {card_question}
- Antwort: {card_answer}
- Deck: {deck_name}
- Tags: {', '.join(card_tags) if card_tags else 'keine'}
{extra_fields}

Antworte NUR mit JSON:
{{
  "search_needed": true/false,
  "retrieval_mode": "sql" | "semantic" | "both",
  "response_length": "short" | "medium" | "long",
  "embedding_query": "semantisch reicher Suchtext aus Kartenkontext + Frage synthetisiert",
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck" | "collection"
}}

response_length: "short" für einfache Fakten, "medium" für Erklärungen, "long" für detaillierte Vergleiche oder mehrteilige Fragen.
"""
```

- [ ] **Step 2: Include response_length in router done emission**

Find the router done emission at line ~2176. Add `response_length`:

```python
self._emit_pipeline_step("router", "done", {
    "search_needed": router_result.get("search_needed", True),
    "retrieval_mode": retrieval_mode,
    "response_length": router_result.get("response_length", "medium"),
    "scope": router_result.get("search_scope", "current_deck"),
    "scope_label": scope_label
})
```

Do the same for ALL other `_emit_pipeline_step("router", "done", ...)` calls in the file. There are 3 total:
- **Line ~2176**: Uses `router_result.get("response_length", "medium")` — shown above.
- **Line ~2449**: Same pattern — add `"response_length": router_result.get("response_length", "medium")` to the dict.
- **Line ~2564**: This is the fallback path where `router_result` is not in scope (hardcoded dict). Add `"response_length": "medium"` directly.

- [ ] **Step 3: Test in Anki**

Restart Anki, open a card, send a message. Check the browser console for the `pipeline_step` event with `step: "router"`. Verify `response_length` is present in `data`.

- [ ] **Step 4: Commit**

```bash
git add ai_handler.py
git commit -m "feat(router): add response_length field to router output"
```

---

### Task 2: Backend — Fix Scope Fallback Duplicate Steps

**Files:**
- Modify: `ai_handler.py:1946-1963` (_emit_pipeline_step)
- Modify: `hybrid_retrieval.py:110-118` (scope fallback)

- [ ] **Step 1: Add fallback flag to _emit_pipeline_step**

In `ai_handler.py`, find `_emit_pipeline_step` at line ~1946. Add a check for the fallback flag:

```python
def _emit_pipeline_step(self, step, status, data=None):
    """Emit a pipeline_step event to the frontend via Qt signal."""
    # Always record done labels (even during fallback) for persistence
    if status == 'done':
        label = self._step_done_label(step, data)
        self._current_step_labels.append(label)

    # During scope fallback, skip re-emission of non-router steps to frontend
    if getattr(self, '_fallback_in_progress', False) and step != 'router':
        return

    callback = getattr(self, '_pipeline_signal_callback', None)
    if callback:
        try:
            callback(step, status, data)
        except Exception as e:
            print(f"⚠️ _emit_pipeline_step error: {e}")
```

**Important:** The label-append MUST happen before the fallback guard, so step labels are always persisted even when frontend emission is suppressed.

- [ ] **Step 2: Set fallback flag in hybrid_retrieval.py**

In `hybrid_retrieval.py`, find the scope fallback at line ~110. Set the flag before retry and emit a router scope update after:

```python
# Scope fallback: if <2 results on current_deck, try collection
total_results = len(merged)
if total_results < 2 and router_result.get('search_scope') == 'current_deck' and not router_result.get('_fallback_used'):
    # Keep only the router label, remove search/merge labels before retry
    self.ai._current_step_labels = self.ai._current_step_labels[:1]

    # Suppress duplicate step emissions during fallback
    self.ai._fallback_in_progress = True
    fallback_router = {**router_result, 'search_scope': 'collection', '_fallback_used': True}
    result = self.retrieve(user_message, fallback_router, context, max_notes)
    self.ai._fallback_in_progress = False

    # Update router step with new scope
    scope_label = ""
    if self.ai._current_deck_name:
        scope_label = "Alle Stapel"
    self.ai._emit_pipeline_step("router", "done", {
        "search_needed": True,
        "retrieval_mode": router_result.get('retrieval_mode', 'both'),
        "response_length": router_result.get('response_length', 'medium'),
        "scope": "collection",
        "scope_label": scope_label
    })

    return result
```

- [ ] **Step 3: Initialize fallback flag**

In `ai_handler.py`, in the `get_response_with_rag` method (where `_current_step_labels` is initialized), add:

```python
self._fallback_in_progress = False
```

- [ ] **Step 4: Test scope fallback**

In Anki, ask a very specific question on a small deck (likely to have <2 results). Check that "Keyword-Suche" does NOT appear twice in the pipeline. Check the router step updates its scope label.

- [ ] **Step 5: Commit**

```bash
git add ai_handler.py hybrid_retrieval.py
git commit -m "fix(pipeline): prevent duplicate step emission on scope fallback"
```

---

### Task 3: Frontend — Filter Generating Steps in useChat

**Files:**
- Modify: `frontend/src/hooks/useChat.js:432-450` (pipeline_step handler)

- [ ] **Step 1: Filter out generating steps**

In `useChat.js`, find the pipeline_step handler at line ~432. Add a filter before processing:

```javascript
} else if (payload.type === 'pipeline_step') {
    // Filter out generating steps — ThoughtStream doesn't render them
    if (payload.step === 'generating') return;

    if (payload.requestId && payload.requestId !== activeRequestIdRef.current) return;
    updatePipelineSteps(prev => {
        // ... existing dedup logic
    });
}
```

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki, send a message. Verify pipeline steps render normally but no "Generierung" step appears.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useChat.js
git commit -m "fix(pipeline): filter out generating steps from ThoughtStream"
```

---

### Task 4: Frontend — SourceCard Badges

**Files:**
- Modify: `shared/components/SourceCard.tsx:10-19` (Citation interface), `shared/components/SourceCard.tsx:72-86` (isCurrentCard rendering)
- Modify: `shared/components/SourcesCarousel.tsx:25-43` (sorting), `shared/components/SourcesCarousel.tsx:133` (width)

- [ ] **Step 1: Update Citation interface in SourceCard.tsx**

At line ~10, add `sources` and remove `isCurrentCard`:

```typescript
export interface Citation {
  noteId: string;
  cardId?: string;
  question: string;
  answer?: string;
  deckName?: string;
  tags?: string[];
  similarity_score?: number;
  sources?: string[];  // ['keyword'], ['semantic'], or ['keyword', 'semantic']
}
```

Remove `isCurrentCard?: boolean;` from line 16.

- [ ] **Step 2: Replace isCurrentCard star with dual-source badge**

Remove the current star rendering (lines ~72-86). Replace with:

```tsx
{/* Dual-source badge — found by both keyword and semantic search */}
{citation.sources && citation.sources.length > 1 && (
  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
       style={{ background: '#121212' }}>
    <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
      <path d="M6 1l1.5 3 3.5.5-2.5 2.4.6 3.5L6 8.9 2.9 10.4l.6-3.5L1 4.5 4.5 4z"
            fill="rgba(255,180,50,0.7)"/>
    </svg>
  </div>
)}
```

Add `position: relative` to the card container if not already present.

- [ ] **Step 3: Add source type label to deck line**

In the deck name display area, add a source type indicator:

```tsx
<span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
  {citation.deckName || ''}
  {citation.sources && citation.sources.length === 1 && (
    <span style={{
      fontSize: '8px',
      marginLeft: '4px',
      color: citation.sources[0] === 'keyword'
        ? 'rgba(10,132,255,0.35)'
        : 'rgba(100,210,180,0.35)'
    }}>
      {citation.sources[0]}
    </span>
  )}
</span>
```

- [ ] **Step 4: Remove isCurrentCard from function params and all usages**

Remove `isCurrentCard = false` from the component function params (line ~28). Then grep the entire codebase for remaining references:

```bash
grep -r "isCurrentCard" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js"
```

Remove or update every occurrence found. This includes:
- `SourceCard.tsx` props and rendering
- `SourcesCarousel.tsx` props passing
- `ChatMessage.jsx` where it passes `isCurrentCard` to SourcesCarousel
- Any other file that references it

- [ ] **Step 5: Update SourcesCarousel width and sorting**

In `SourcesCarousel.tsx`:
- Line ~133: Change `w-48` to `w-[130px]`
- Lines ~25-43: Remove the sorting logic that puts `isCurrentCard` first. Sort by `sources.length` descending instead (dual-source cards first):

```typescript
const sortedCitations = [...citations].sort((a, b) =>
  (b.sources?.length || 0) - (a.sources?.length || 0)
);
```

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add shared/components/SourceCard.tsx shared/components/SourcesCarousel.tsx
git commit -m "feat(sources): dual-source star badge, remove isCurrentCard, 130px width"
```

---

### Task 5: Frontend — Rewrite ThoughtStream Rendering

**Files:**
- Modify: `shared/components/ThoughtStream.tsx` (rewrite lines 263-716, keep 1-261)

This is the main task. The `useSmartPipeline` hook (lines 1-261) stays. Everything below gets rewritten.

**Important dependency:** Task 3 (filter generating steps) MUST be done before this task, otherwise `generating` steps will appear in the pipeline with no content renderer.

**Note:** ThoughtStream v5 no longer renders SourcesCarousel internally. Sources are rendered by the parent component (App.jsx for live messages, ChatMessage.jsx for saved messages). Task 7 handles this relocation.

**Note:** Remove the `import { motion, AnimatePresence } from 'framer-motion'` line (line 3) since v5 no longer uses framer-motion. Keep the `import { ChevronDown } from 'lucide-react'` if needed, or remove if replaced by inline SVGs.

- [ ] **Step 1: Replace KEYFRAMES**

Replace the KEYFRAMES constant (lines 18-43) with updated animations:

```typescript
const KEYFRAMES = `
@keyframes ts-phaseReveal {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ts-dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
@keyframes ts-routerScan {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes ts-routerDotFloat {
  0%, 100% { transform: translateX(0); opacity: 0.4; }
  50% { transform: translateX(3px); opacity: 0.8; }
}
@keyframes ts-pulseIn {
  0% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ts-fadeBlurIn {
  0% { filter: blur(3px); opacity: 0.2; }
  100% { filter: blur(0); opacity: 1; }
}
@keyframes ts-scanGlow {
  0% { left: -40%; }
  100% { left: 100%; }
}
@keyframes ts-shimmerWave {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;
```

- [ ] **Step 2: Replace phase-specific content components**

Delete ActiveBox (445-485), LoadingBox (489-506), DoneStep (510-526). Replace with new components:

```tsx
/* ── Router Details (done state) ── */
function RouterDetails({ data }: { data: Record<string, any> }) {
  const strategy = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || 'Hybrid';
  const scope = data.scope === 'collection' ? 'Alle Stapel' : 'Aktueller Stapel';
  const lengthMap: Record<string, string> = { short: 'Kurz', medium: 'Mittel', long: 'Ausführlich' };
  const length = lengthMap[data.response_length] || 'Mittel';

  const tags = [
    { icon: 'M8 2v12M2 8h12', label: 'Strategie', value: strategy },
    { icon: 'M2 3h12v10H2zM2 6h12', label: 'Scope', value: scope },
    { icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6', label: 'Antwort', value: length },
  ];

  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1 ml-[10.5px]">
      {tags.map(t => (
        <span key={t.label} className="inline-flex items-center gap-1 text-[9.5px]">
          <svg className="w-2.5 h-2.5 opacity-20" viewBox="0 0 16 16" fill="none">
            <path d={t.icon} stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span style={{ color: 'rgba(255,255,255,0.13)' }}>{t.label}</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{t.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ── Router Thinking (active state) ── */
function RouterThinking() {
  return (
    <div className="flex items-center gap-2 mt-1.5 ml-[10.5px]">
      <div className="w-20 h-0.5 rounded-sm"
        style={{
          background: 'linear-gradient(90deg, rgba(10,132,255,0.05), rgba(10,132,255,0.25), rgba(168,85,247,0.2), rgba(10,132,255,0.05))',
          backgroundSize: '200% 100%',
          animation: 'ts-routerScan 2.5s ease-in-out infinite',
        }}
      />
      <div className="flex gap-0.5">
        {[0, 0.2, 0.4].map((d, i) => (
          <span key={i} className="w-[3px] h-[3px] rounded-full"
            style={{ background: 'rgba(10,132,255,0.4)', animation: `ts-routerDotFloat 1.2s ease-in-out ${d}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── SQL Query Tags ── */
function SqlTags({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  const queries = data.queries || [];
  if (queries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5 ml-[10.5px]">
      {queries.map((q: any, i: number) => (
        <div key={i} className="inline-flex items-center gap-1 text-[10px] py-0.5 px-[7px] rounded"
          style={{ background: 'rgba(255,255,255,0.025)', color: 'rgba(255,255,255,0.3)',
                   animation: `ts-pulseIn 0.3s ease-out ${i * 0.15}s both` }}>
          <svg className="w-2 h-2 opacity-[0.18]" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          <span>{q.text || q}</span>
          {isDone && typeof q.hits === 'number' && (
            <span className="font-mono text-[9px]"
              style={{ color: q.hits > 0 ? 'rgba(100,210,180,0.45)' : 'rgba(255,255,255,0.15)' }}>
              {q.hits}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Semantic Chunks ── */
function SemanticChunks({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  const chunks = data.chunks || [];
  if (chunks.length === 0) return null;
  return (
    <div className="flex flex-col ml-[10.5px] mt-0.5">
      {chunks.slice(0, 3).map((c: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-[2.5px] relative overflow-hidden"
          style={{ animation: `ts-fadeBlurIn 0.8s ease-out ${i * 0.3}s both` }}>
          {!isDone && (
            <div className="absolute top-0 h-full w-[40%] pointer-events-none"
              style={{ left: '-40%', background: 'linear-gradient(90deg,transparent,rgba(10,132,255,0.06),transparent)',
                       animation: 'ts-scanGlow 2.5s ease-in-out infinite' }} />
          )}
          <span className="font-mono text-[9px] min-w-[28px] flex-shrink-0" style={{ color: 'rgba(10,132,255,0.45)' }}>
            {typeof c.score === 'number' ? c.score.toFixed(3) : '—'}
          </span>
          <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {c.snippet || c.text || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Merge Bar (compact) ── */
function MergeBar({ data }: { data: Record<string, any> }) {
  const kw = data.keyword_count || 0;
  const sem = data.semantic_count || 0;
  const wp = typeof data.weight_position === 'number' ? data.weight_position : 0.5;
  return (
    <div className="flex items-center gap-1.5 mt-0.5 ml-[10.5px]">
      <span className="font-mono text-[9px]" style={{ color: 'rgba(10,132,255,0.4)' }}>{kw}K</span>
      <div className="flex-1 h-[1.5px] rounded-sm relative"
        style={{ background: `linear-gradient(90deg, rgba(10,132,255,0.15), rgba(100,210,180,0.15))` }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full"
          style={{ left: `${Math.round(wp * 100)}%`, background: '#0a84ff',
                   boxShadow: '0 0 4px rgba(10,132,255,0.3)' }} />
      </div>
      <span className="font-mono text-[9px]" style={{ color: 'rgba(100,210,180,0.4)' }}>{sem}S</span>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the phase renderer**

Replace the ActiveBox / DoneStep approach with a unified Phase component:

```tsx
/* ── Phase Row ── */
function PhaseRow({ entry, index }: { entry: ActiveEntry; index: number }) {
  const isDone = entry.status !== 'active';
  const title = isDone
    ? getDoneLabel(entry.step, entry.data, entry.status)
    : (ACTIVE_TITLES[entry.step] || 'Verarbeite...');

  return (
    <div className="py-[5px]"
      style={{
        borderTop: index > 0 ? '1px solid rgba(255,255,255,0.025)' : 'none',
        animation: `ts-phaseReveal 0.25s ease-out ${index * 0.03}s both`,
      }}>
      <div className="flex items-center gap-[7px]">
        <div className="w-[3.5px] h-[3.5px] rounded-full flex-shrink-0"
          style={isDone
            ? { background: 'rgba(100,210,180,0.35)' }
            : { background: 'rgba(10,132,255,0.6)', animation: 'ts-dotPulse 1.5s ease-in-out infinite',
                boxShadow: '0 0 4px rgba(10,132,255,0.2)' }
          } />
        <span className="text-[10.5px]"
          style={{ color: isDone ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.4)' }}>
          {entry.step === 'router' && isDone ? (
            <>Hybrid-Suche · <em className="not-italic" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {entry.data.scope_label || 'Suche'}
            </em></>
          ) : (
            <>{title.split(/(\d+)/).map((part, i) =>
              /\d+/.test(part)
                ? <em key={i} className="not-italic" style={{ color: 'rgba(255,255,255,0.45)' }}>{part}</em>
                : <span key={i}>{part}</span>
            )}</>
          )}
        </span>
        {isDone && entry.status !== 'error' && (
          <span className="ml-auto text-[9px]" style={{ color: 'rgba(100,210,180,0.35)' }}>✓</span>
        )}
      </div>

      {/* Phase-specific content */}
      {entry.step === 'router' && (isDone ? <RouterDetails data={entry.data} /> : <RouterThinking />)}
      {entry.step === 'sql_search' && <SqlTags data={entry.data} isDone={isDone} />}
      {entry.step === 'semantic_search' && <SemanticChunks data={entry.data} isDone={isDone} />}
      {entry.step === 'merge' && isDone && <MergeBar data={entry.data} />}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the main ThoughtStream component**

Replace the main export (lines 590-715) with the new divider-based layout:

```tsx
export default function ThoughtStream({
  pipelineSteps = [],
  citations = {},
  citationIndices = {},
  isStreaming = false,
  bridge = null,
  onPreviewCard,
  message = '',
  steps = [],
  intent = null,
}: ThoughtStreamProps) {
  // Inject keyframes once
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ts-keyframes-v5')) {
      const s = document.createElement('style');
      s.id = 'ts-keyframes-v5';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
      ['ts-keyframes', 'ts-keyframes-v4'].forEach(id => document.getElementById(id)?.remove());
    }
  }, []);

  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;
  const { activeEntry, doneStack, isProcessing } = useSmartPipeline(pipelineSteps);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasText = Boolean(message && message.trim().length > 0);

  // Auto-collapse when text arrives and pipeline done
  useEffect(() => {
    if (hasText && !isCollapsed && !isProcessing && !activeEntry) {
      const t = setTimeout(() => setIsCollapsed(true), 800);
      return () => clearTimeout(t);
    }
  }, [hasText, isCollapsed, isProcessing, activeEntry]);

  // Expand when new pipeline starts
  useEffect(() => {
    if (isProcessing) setIsCollapsed(false);
  }, [isProcessing]);

  const hasCitations = Object.keys(citations).length > 0;
  const showLoadingBox = isStreaming && !isProcessing && !activeEntry && doneStack.length === 0 && pipelineSteps.length === 0 && !isLegacy;
  const hasContent = isProcessing || activeEntry !== null || doneStack.length > 0 || isLegacy || showLoadingBox;
  const totalSteps = doneStack.length + (activeEntry ? 1 : 0);

  if (!hasContent) return null;
  if (isLegacy) return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;

  // doneStack is newest-first (prepended in useSmartPipeline). Reverse for chronological display.
  const chronologicalDone = [...doneStack].reverse();

  return (
    <div className="py-2 select-none">
      {/* ── Collapsed ── */}
      {isCollapsed && !isProcessing && !showLoadingBox && (
        <div className="flex items-center gap-0 cursor-pointer py-0.5 opacity-50 hover:opacity-70 transition-opacity"
          onClick={() => setIsCollapsed(false)}>
          <div className="flex items-center gap-[5px] flex-shrink-0">
            <svg className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.15)' }} viewBox="0 0 16 16" fill="none">
              <path d="M5 3l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[10.5px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <em className="not-italic" style={{ color: 'rgba(255,255,255,0.3)' }}>{totalSteps}</em>
              {' '}Schritt{totalSteps !== 1 ? 'e' : ''}
              {hasCitations && (
                <> · <em className="not-italic" style={{ color: 'rgba(255,255,255,0.3)' }}>{Object.keys(citations).length}</em> Quellen</>
              )}
            </span>
          </div>
          <div className="flex-1 h-px ml-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
      )}

      {/* ── Expanded ── */}
      {(!isCollapsed || showLoadingBox) && (
        <div>
          {/* Toggle row */}
          {!isProcessing && !showLoadingBox && totalSteps > 0 && (
            <div className="flex items-center gap-0 cursor-pointer py-0.5 mb-1 opacity-55 hover:opacity-70 transition-opacity"
              onClick={() => setIsCollapsed(true)}>
              <div className="flex items-center gap-[5px] flex-shrink-0">
                <svg className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.2)' }} viewBox="0 0 16 16" fill="none">
                  <path d="M3 5l5 6 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10.5px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {totalSteps} Schritt{totalSteps !== 1 ? 'e' : ''}
                </span>
              </div>
              <div className="flex-1 h-px ml-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
          )}

          {/* Loading state (before any steps) */}
          {(isProcessing || showLoadingBox) && !activeEntry && doneStack.length === 0 && (
            <div className="flex items-center gap-0 py-0.5 opacity-55">
              <div className="flex items-center gap-[5px] flex-shrink-0">
                <svg className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.2)' }} viewBox="0 0 16 16" fill="none">
                  <path d="M3 5l5 6 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10.5px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Analysiere...</span>
              </div>
              <div className="flex-1 h-px ml-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
          )}

          {/* Done phases (chronological order) */}
          {chronologicalDone.map((entry, i) => (
            <PhaseRow key={entry.step} entry={{
              step: entry.step, status: entry.isError ? 'error' : 'done',
              data: pipelineSteps.find(s => s.step === entry.step)?.data || {},
              label: entry.label,
            }} index={i} />
          ))}

          {/* Active phase */}
          {activeEntry && (
            <PhaseRow entry={activeEntry} index={chronologicalDone.length} />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Keep LegacyThoughtStream unchanged**

The `LegacyThoughtStream` component (lines 530-584) stays as-is. No changes.

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki, test with:
1. A complex question (should show full pipeline with router details)
2. A simple follow-up (should show shorter pipeline)
3. After response completes: verify auto-collapse, then click to expand
4. An old message with legacy steps format (should render flat list)

- [ ] **Step 7: Commit**

```bash
git add shared/components/ThoughtStream.tsx
git commit -m "feat(ui): ThoughtStream v5 — borderless divider layout with router details"
```

---

### Task 6: Frontend — User Messages as Section Headings

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx:1339-1456` (user message rendering)

- [ ] **Step 1: Replace user bubble with heading style**

In `ChatMessage.jsx`, find the user message rendering at line ~1443. Replace the bubble:

```jsx
{isUser ? (
  <div className="pt-4">
    <div className="text-[14.5px] font-medium leading-[1.45]"
         style={{ color: 'rgba(255,255,255,0.85)' }}>
      {text}
    </div>
  </div>
) : (
  // ... existing bot rendering stays
)}
```

Remove the `flex justify-end`, `max-w-[85%]`, `bg-base-300/60`, `rounded-2xl`, and all bubble-related classes from user messages.

- [ ] **Step 2: Remove useBubble logic and handle overview pill**

Delete or skip the `useBubble` variable (line ~1341) since user messages no longer use bubbles.

Also check for the `[[OVERVIEW]]` special case at lines ~1431-1441. This renders overview requests as a compact pill with `justify-end` and bubble styling. Convert this to heading style too — or if it's a system-generated message that the user doesn't type, hide it entirely. Check what `[[OVERVIEW]]` means in context before deciding.

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Verify:
- User messages appear as headings (left-aligned, no bubble, no background)
- Bot messages still render normally below
- Chat history with old messages still looks reasonable

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat(ui): user messages as section headings — remove bubbles"
```

---

### Task 7: Integration — ThoughtStream as Divider in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:2086-2116` (ThoughtStream + StreamingChatMessage rendering)

- [ ] **Step 1: Relocate SourcesCarousel to App.jsx**

In `App.jsx` at line ~2086, ThoughtStream and StreamingChatMessage are siblings rendered inside a `chatHook.isLoading` conditional. The current ThoughtStream internally renders SourcesCarousel. After the v5 rewrite, it no longer does. Add SourcesCarousel rendering AFTER the ThoughtStream and BEFORE StreamingChatMessage:

```jsx
{/* ThoughtStream divider */}
<ThoughtStream
  pipelineSteps={chatHook.pipelineSteps || []}
  isStreaming={true}
  message={chatHook.streamingMessage || ''}
  // Remove citations/citationIndices/bridge/onPreviewCard props — v5 doesn't use them
/>

{/* Sources — always visible, outside ThoughtStream */}
{Object.keys(chatHook.currentCitations || {}).length > 0 && (
  <SourcesCarousel
    citations={chatHook.currentCitations}
    citationIndices={chatHook.currentCitationIndices || {}}
    bridge={bridge}
    onPreviewCard={handlePreviewCard}
  />
)}

{/* StreamingChatMessage */}
<StreamingChatMessage ... />
```

Also verify that `ChatMessage.jsx` renders SourcesCarousel for saved messages. The saved-message path (line ~1691) already renders ThoughtStream which previously included SourcesCarousel. Now SourcesCarousel must be rendered separately after ThoughtStream in the saved-message path too.

- [ ] **Step 2: Add simple divider for no-search messages**

In `App.jsx`, when there are no pipeline steps and the response has started streaming, render a simple line as the divider:

```jsx
{/* Simple divider when no pipeline steps */}
{chatHook.isLoading && (!chatHook.pipelineSteps || chatHook.pipelineSteps.length === 0) && (
  <div className="h-px my-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
)}
```

Similarly, in `ChatMessage.jsx` for saved messages without steps, render the simple line between the user heading and bot text.

- [ ] **Step 3: Build and test full flow**

```bash
cd frontend && npm run build
```

Restart Anki, test the complete flow:
1. Ask a question → router thinking animation → steps appear one by one → auto-collapse → sources + answer
2. Simple question → no-search line → answer
3. Click collapsed stream → expand → see all details → click again → collapse
4. Verify sources always visible regardless of collapse state

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(ui): ThoughtStream as divider between heading and answer"
```

---

### Task 8: Polish & Final Verification

- [ ] **Step 1: Visual polish pass**

Open Anki, have a full conversation (5+ messages). Check:
- Collapsed streams feel like natural dividers, not UI clutter
- Expanded state shows all content correctly (router tags, query tags, chunks, merge bar)
- Source card star badges appear on dual-source cards
- Animations are smooth, not janky
- No-search messages have clean simple line
- Legacy messages with old step format still render

- [ ] **Step 2: Fix any visual issues**

Adjust spacing, colors, or timing as needed based on visual review.

- [ ] **Step 3: Build final production version**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit final polish**

```bash
git add -A
git commit -m "polish(ui): ThoughtStream v5 final adjustments"
```
