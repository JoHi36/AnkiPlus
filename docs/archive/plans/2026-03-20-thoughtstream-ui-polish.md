# ThoughtStream UI Polish & Plusi Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish ThoughtStream layout hierarchy, upgrade the "no search" state, integrate `@Plusi` direct mode, fix animations, and move source cards inside collapse.

**Architecture:** All frontend changes are in `ThoughtStream.tsx` (layout, animations, source cards, no-search state) with supporting changes in `App.jsx`, `ChatMessage.jsx`, and `useChat.js`. Backend changes add `response_length` to router schema (`ai/rag.py`) and handle `plusi_direct` routing (`ui/widget.py`). The `useSmartPipeline` hook logic is unchanged.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Python/Qt backend, Gemini API

**Spec:** `docs/superpowers/specs/2026-03-20-thoughtstream-ui-polish-design.md`

---

### Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `shared/components/ThoughtStream.tsx` | Modify | Layout, animations, no-search, source cards |
| `frontend/src/App.jsx` | Modify | Remove standalone SourcesCarousel |
| `frontend/src/components/ChatMessage.jsx` | Modify | Remove standalone SourcesCarousel |
| `frontend/src/hooks/useChat.js` | Modify | `@Plusi` detection, synthetic pipeline |
| `ai/rag.py` | Modify | Add `response_length` to router schema |
| `ui/widget.py` | Modify | Handle `plusi_direct` flag |

---

### Task 1: Layout Hierarchy Fix

**Files:**
- Modify: `shared/components/ThoughtStream.tsx:525-608` (PhaseRow), `shared/components/ThoughtStream.tsx:789-896` (main component)

- [ ] **Step 1: Remove container borderTop and fix spacing**

In the main component return (line 790), replace:
```tsx
<div style={{ marginBottom: 8, maxWidth: '100%', userSelect: 'none', borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 4 }}>
```
with:
```tsx
<div style={{ marginTop: 12, maxWidth: '100%', userSelect: 'none' }}>
```

- [ ] **Step 2: Add `isFirst` prop to PhaseRow**

Change the PhaseRow signature (line 525) from:
```tsx
function PhaseRow({ step, data, status, isActive }: { step: string; data: Record<string, any>; status: string; isActive: boolean }) {
```
to:
```tsx
function PhaseRow({ step, data, status, isActive, isFirst = false }: { step: string; data: Record<string, any>; status: string; isActive: boolean; isFirst?: boolean }) {
```

In PhaseRow's outer div (line 553), change:
```tsx
borderTop: '1px solid var(--ds-hover-tint)',
```
to:
```tsx
borderTop: isFirst ? 'none' : '1px solid var(--ds-hover-tint)',
```

- [ ] **Step 3: Add step indentation wrapper**

Wrap the chronological done phases + active phase (lines 872-892) in a container with left margin. Replace:
```tsx
{/* Chronological done phases */}
{chronologicalDone.map((entry) => (
  <PhaseRow
    key={entry.step}
    step={entry.step}
    data={pipelineSteps.find(s => s.step === entry.step)?.data || {}}
    status={entry.isError ? 'error' : 'done'}
    isActive={false}
  />
))}

{/* Active phase */}
{activeEntry && (
  <PhaseRow
    key={`active-${activeEntry.step}`}
    step={activeEntry.step}
    data={activeEntry.data}
    status={activeEntry.status}
    isActive={activeEntry.status === 'active'}
  />
)}
```
with:
```tsx
{/* Step rows — indented under "X Schritte" header */}
<div style={{ marginLeft: 16 }}>
  {/* Chronological done phases */}
  {chronologicalDone.map((entry, idx) => (
    <PhaseRow
      key={entry.step}
      step={entry.step}
      data={pipelineSteps.find(s => s.step === entry.step)?.data || {}}
      status={entry.isError ? 'error' : 'done'}
      isActive={false}
      isFirst={idx === 0}
    />
  ))}

  {/* Active phase */}
  {activeEntry && (
    <PhaseRow
      key={`active-${activeEntry.step}`}
      step={activeEntry.step}
      data={activeEntry.data}
      status={activeEntry.status}
      isActive={activeEntry.status === 'active'}
      isFirst={chronologicalDone.length === 0}
    />
  )}
</div>
```

- [ ] **Step 4: Build and verify in browser**

```bash
cd frontend && npm run build
```

Restart Anki, send a message that triggers RAG search. Verify:
- No line between question and "X Schritte"
- Steps are indented under the header
- Lines only appear between steps, not above the first

- [ ] **Step 5: Commit**

```bash
git add shared/components/ThoughtStream.tsx
git commit -m "fix(thoughtstream): correct layout hierarchy — remove redundant borders, indent steps"
```

---

### Task 2: Disable Animations for Saved Messages

**Files:**
- Modify: `shared/components/ThoughtStream.tsx:365-471` (SqlTags, SemanticChunks), `shared/components/ThoughtStream.tsx:525-608` (PhaseRow), `shared/components/ThoughtStream.tsx:714-897` (main component)

- [ ] **Step 1: Add `animate` prop to PhaseRow**

Update PhaseRow signature to include `animate`:
```tsx
function PhaseRow({ step, data, status, isActive, isFirst = false, animate = true }: {
  step: string; data: Record<string, any>; status: string; isActive: boolean; isFirst?: boolean; animate?: boolean;
}) {
```

In PhaseRow's outer div (line 556), change:
```tsx
animation: isActive ? undefined : 'ts-phaseReveal 0.25s ease-out both',
```
to:
```tsx
animation: (!animate || isActive) ? undefined : 'ts-phaseReveal 0.25s ease-out both',
```

Change the active dot animation (line 572):
```tsx
animation: 'ts-dotPulse 1.5s ease-in-out infinite',
```
to:
```tsx
animation: animate ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
```

- [ ] **Step 2: Add `animate` prop to SqlTags and SemanticChunks**

Update SqlTags signature (line 365):
```tsx
function SqlTags({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
```

In the SQL tag div style (line 383), change:
```tsx
animation: `ts-pulseIn 0.3s ease-out ${i * 0.15}s both`,
```
to:
```tsx
animation: animate ? `ts-pulseIn 0.3s ease-out ${i * 0.15}s both` : undefined,
```

Update SemanticChunks signature (line 409):
```tsx
function SemanticChunks({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
```

In the scan glow overlay (line 429), change:
```tsx
{!isDone && (
```
to:
```tsx
{!isDone && animate && (
```

In the snippet text animation (line 462), change:
```tsx
animation: `ts-fadeBlurIn 0.8s ease-out ${i * 0.3}s both`,
```
to:
```tsx
animation: animate ? `ts-fadeBlurIn 0.8s ease-out ${i * 0.3}s both` : undefined,
```

- [ ] **Step 3: Pass `animate` through PhaseRow to sub-components**

In PhaseRow's phase-specific content section (lines 588-592), pass `animate`:
```tsx
{step === 'router' && isActive && animate && <RouterThinking />}
{step === 'router' && isDone && <RouterDetails data={data} />}
{step === 'sql_search' && <SqlTags data={data} isDone={isDone} animate={animate} />}
{step === 'semantic_search' && <SemanticChunks data={data} isDone={isDone} animate={animate} />}
{step === 'merge' && isDone && <MergeBar data={data} />}
```

Remove the `generating` shimmer block (lines 593-604) entirely — generating steps are already filtered by the frontend.

- [ ] **Step 4: Derive `animate` in main component and pass to PhaseRow**

In the main component, after the `isProcessing` declaration (around line 741), add:
```tsx
const animate = isStreaming || isProcessing;
```

Pass it to all PhaseRow instances in the step rows section:
```tsx
{chronologicalDone.map((entry, idx) => (
  <PhaseRow
    key={entry.step}
    step={entry.step}
    data={pipelineSteps.find(s => s.step === entry.step)?.data || {}}
    status={entry.isError ? 'error' : 'done'}
    isActive={false}
    isFirst={idx === 0}
    animate={animate}
  />
))}

{activeEntry && (
  <PhaseRow
    key={`active-${activeEntry.step}`}
    step={activeEntry.step}
    data={activeEntry.data}
    status={activeEntry.status}
    isActive={activeEntry.status === 'active'}
    isFirst={chronologicalDone.length === 0}
    animate={animate}
  />
)}
```

Also update the loading state dot (line 864) to respect `animate`:
```tsx
animation: animate ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
```

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Send a message, watch animation play live. Close and reopen chat — saved messages should show ThoughtStream collapsed with no animation on expand.

- [ ] **Step 6: Commit**

```bash
git add shared/components/ThoughtStream.tsx
git commit -m "fix(thoughtstream): disable animations for saved messages — only animate during live streaming"
```

---

### Task 3: Fix Dot Animation Stutter

**Files:**
- Modify: `shared/components/ThoughtStream.tsx:562-574` (dot styles), `shared/components/ThoughtStream.tsx:744` (chronologicalDone)

- [ ] **Step 1: Memoize chronologicalDone**

Add `useMemo` to the import at line 1:
```tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
```

Replace line 744:
```tsx
const chronologicalDone = [...doneStack].reverse();
```
with:
```tsx
const chronologicalDone = useMemo(() => [...doneStack].reverse(), [doneStack]);
```

- [ ] **Step 2: Add compositing hints to dot elements**

In PhaseRow, add `willChange` and `contain` to both dot styles.

Done dot (line 563):
```tsx
<div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(20,184,166,0.5)', flexShrink: 0, willChange: 'transform, opacity', contain: 'layout style' }} />
```

Active dot (lines 565-574):
```tsx
<div
  style={{
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--ds-accent)',
    flexShrink: 0,
    animation: animate ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
    willChange: 'transform, opacity',
    contain: 'layout style',
  }}
/>
```

Also add to the loading state dot (line 857-866):
```tsx
willChange: 'transform, opacity',
contain: 'layout style',
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Send a RAG query. Watch dots as new steps appear — they should no longer stutter.

- [ ] **Step 4: Commit**

```bash
git add shared/components/ThoughtStream.tsx
git commit -m "fix(thoughtstream): prevent dot animation stutter with compositing hints and memoization"
```

---

### Task 4: Backend — Add `response_length` to Router

**Files:**
- Modify: `ai/rag.py:298-307` (router JSON schema), `ai/rag.py:394-401` (backend router emit), `ai/rag.py:670-677` (direct API router emit)

- [ ] **Step 1: Add `response_length` to router JSON schema**

In `ai/rag.py`, find the JSON schema at line 298-307. Change:
```python
Antworte NUR mit JSON:
{{
  "search_needed": true/false,
  "retrieval_mode": "sql" | "semantic" | "both",
  "embedding_queries": ["semantischer Suchtext 1", "semantischer Suchtext 2"],
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck" | "collection",
  "max_sources": "low" | "medium" | "high"
}}
```
to:
```python
Antworte NUR mit JSON:
{{
  "search_needed": true/false,
  "retrieval_mode": "sql" | "semantic" | "both",
  "response_length": "short" | "medium" | "long",
  "embedding_queries": ["semantischer Suchtext 1", "semantischer Suchtext 2"],
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck" | "collection",
  "max_sources": "low" | "medium" | "high"
}}
```

- [ ] **Step 2: Add response_length instruction to rules**

After the existing rules (around line 329), add a new line:
```python
- response_length: "short" für einfache Fakten, "medium" für Erklärungen, "long" für detaillierte Vergleiche oder mehrteilige Fragen
```

- [ ] **Step 3: Include response_length in pipeline step emissions**

At line 395 (backend router emit), add `response_length`:
```python
if emit_step:
    emit_step("router", "done", {
        "search_needed": router_result.get("search_needed", True),
        "retrieval_mode": retrieval_mode,
        "response_length": router_result.get("response_length", "medium"),
        "scope": router_result.get("search_scope", "current_deck"),
        "scope_label": scope_label,
        "max_sources": router_result.get("max_sources", "medium")
    })
```

At line 671 (direct API router emit), add the same:
```python
if emit_step:
    emit_step("router", "done", {
        "search_needed": router_result.get("search_needed", True),
        "retrieval_mode": retrieval_mode,
        "response_length": router_result.get("response_length", "medium"),
        "scope": router_result.get("search_scope", "current_deck"),
        "scope_label": scope_label,
        "max_sources": router_result.get("max_sources", "medium")
    })
```

There is a third `emit_step("router", "done"` call at line 764 (fallback path where `router_result` may not have `response_length`). Add `"response_length": "medium"` directly (hardcoded default) since this is the error fallback.

Search for any additional `emit_step("router", "done"` calls in the file and add `response_length` to all of them.

- [ ] **Step 4: Commit**

```bash
git add ai/rag.py
git commit -m "feat(router): add response_length field to router JSON schema and pipeline emissions"
```

---

### Task 5: Upgrade "Keine Suche" State

**Files:**
- Modify: `shared/components/ThoughtStream.tsx:273-330` (RouterDetails), `shared/components/ThoughtStream.tsx:781-787` (isNoSearch shortcut)

- [ ] **Step 1: Remove the no-search 1px line shortcut**

Delete lines 781-787:
```tsx
// No-search shortcut: if only step is router with search_needed=false, just show a simple line
const isNoSearch = !isProcessing && !activeEntry && doneStack.length > 0 &&
  doneStack.every(d => d.step === 'router') &&
  pipelineSteps.some(s => s.step === 'router' && s.data?.search_needed === false);
if (isNoSearch) {
  return <div style={{ height: 1, margin: '8px 0', background: 'var(--ds-border-subtle)' }} />;
}
```

- [ ] **Step 2: Update RouterDetails for no-search case**

Replace the `RouterDetails` component (lines 273-330) with:

```tsx
function RouterDetails({ data }: { data: Record<string, any> }) {
  const RESPONSE_LENGTH_LABELS: Record<string, string> = {
    short: 'Kurz',
    medium: 'Mittel',
    long: 'Ausführlich',
  };

  const tags = data.search_needed === false
    ? [
        { label: 'Strategie', value: 'Direkte Antwort', icon: 'M8 2v12M2 8h12' },
        { label: 'Kontext', value: 'Nicht benötigt', icon: 'M2 3h12v10H2zM2 6h12' },
        { label: 'Antwort', value: RESPONSE_LENGTH_LABELS[data.response_length] || 'Mittel', icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6' },
      ]
    : [
        {
          label: 'Strategie',
          value: MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '—',
          icon: 'M8 2v12M2 8h12',
        },
        {
          label: 'Scope',
          value: data.scope_label || (data.scope === 'current' ? 'Aktueller Stapel' : 'Alle Stapel'),
          icon: 'M2 3h12v10H2zM2 6h12',
        },
        {
          label: 'Quellen',
          value: ({ low: 'Wenig (5)', medium: 'Mittel (10)', high: 'Viel (15)' } as Record<string, string>)[data.max_sources] || 'Mittel (10)',
          icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6',
        },
      ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {tags.map((tag) => (
        <div
          key={tag.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.2 }}>
            <path d={tag.icon} />
          </svg>
          <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
          <span style={{ color: 'var(--ds-text-tertiary)', fontWeight: 500 }}>{tag.value}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update PhaseRow router title for no-search**

In PhaseRow (line 532-536), update the router done title:
```tsx
} else if (step === 'router') {
  if (!data.search_needed) {
    title = 'Direkte Antwort';
  } else {
    const mode = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '';
    const scope = data.scope_label || '';
    title = scope ? `${mode} · ${scope}` : mode || 'Anfrage analysiert';
  }
}
```

Also update `getDoneLabel` (line 114) — change:
```tsx
if (!data.search_needed) return 'Keine Suche nötig';
```
to:
```tsx
if (!data.search_needed) return 'Direkte Antwort';
```

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Send a conversational message (e.g., "danke" or "was kannst du?"). Verify:
- ThoughtStream shows Router step with shimmer animation
- Done state shows three tags: Strategie: Direkte Antwort / Kontext: Nicht benötigt / Antwort: Mittel
- Auto-collapses to "1 Schritt" after text arrives

- [ ] **Step 5: Commit**

```bash
git add shared/components/ThoughtStream.tsx
git commit -m "feat(thoughtstream): upgrade no-search state with router info tags instead of bare line"
```

---

### Task 6: Move Source Cards Inside Collapse

**Files:**
- Modify: `shared/components/ThoughtStream.tsx:1,714-897` (import + main component)
- Modify: `frontend/src/App.jsx:2289-2296` (remove standalone SourcesCarousel)
- Modify: `frontend/src/components/ChatMessage.jsx:1721-1726` (remove standalone SourcesCarousel)

- [ ] **Step 1: Import SourcesCarousel in ThoughtStream**

At the top of `ThoughtStream.tsx` (after line 1), add:
```tsx
import SourcesCarousel from './SourcesCarousel';
import type { Citation } from './SourceCard';
```

- [ ] **Step 2: Render SourcesCarousel inside expanded view**

In the expanded view section, after the step rows closing `</div>` and before the outer `</div>`, add the SourcesCarousel. After the `{/* Active phase */}` block's closing tag (inside the `marginLeft: 16` wrapper), add:

```tsx
{/* Source cards — only after pipeline completes */}
{!isProcessing && hasCitations && (
  <SourcesCarousel
    citations={citations}
    citationIndices={citationIndices}
    bridge={bridge}
    onPreviewCard={onPreviewCard}
  />
)}
```

Place this **inside** the `marginLeft: 16` div, after the active phase, so sources are indented with the steps.

- [ ] **Step 3: Remove standalone SourcesCarousel from App.jsx**

In `frontend/src/App.jsx`, find the SourcesCarousel rendering around lines 2289-2296 in the streaming section. Remove the entire block that renders SourcesCarousel outside of ThoughtStream. The ThoughtStream component now handles this internally.

Look for the pattern:
```jsx
<SourcesCarousel
  citations={cits}
  citationIndices={indices}
  bridge={bridge}
  onPreviewCard={handlePreviewCard}
/>
```

Remove this and its surrounding conditional/wrapper. Keep the citation data computation if it's used elsewhere.

- [ ] **Step 4: Remove standalone SourcesCarousel from ChatMessage.jsx**

In `frontend/src/components/ChatMessage.jsx`, find the SourcesCarousel rendering around lines 1721-1726. Remove:
```jsx
{Object.keys(citations).length > 0 && (
  <SourcesCarousel
    citations={citations}
    citationIndices={citationIndices || {}}
    bridge={bridge}
    onPreviewCard={onPreviewCard}
  />
)}
```

The ThoughtStream already receives these props and will render SourcesCarousel internally.

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Send a RAG query. Verify:
- Source cards appear inside expanded ThoughtStream, below the last step
- Source cards disappear when ThoughtStream collapses
- Collapsed summary shows "X Schritte · Y Quellen"
- Saved messages also show source cards inside collapse

- [ ] **Step 6: Commit**

```bash
git add shared/components/ThoughtStream.tsx frontend/src/App.jsx frontend/src/components/ChatMessage.jsx
git commit -m "feat(thoughtstream): move source cards inside collapsible area"
```

---

### Task 7: `@Plusi` Direct Mode

**Context:** The backend already has a complete `plusiDirect` routing system:
- `ui/widget.py:418` — `'plusiDirect': self._msg_plusi_direct` handler registered
- `ui/widget.py:886-940` — `_msg_plusi_direct` → `_handle_plusi_direct` — calls `run_plusi()`, syncs mood to dock, notifies panel
- `frontend/src/hooks/useAnki.js:411-413` — `bridge.plusiDirect(text, deckId)` calls `window.ankiBridge.addMessage('plusiDirect', ...)`
- `frontend/src/App.jsx:961` — handles `plusi_direct_result` payload

The task is to add `@Plusi` detection in `useChat.js` that (a) emits synthetic pipeline events for ThoughtStream and (b) routes via the existing `plusiDirect` bridge method.

**Files:**
- Modify: `frontend/src/hooks/useChat.js:362-374` (sendMessage function)

- [ ] **Step 1: Add Plusi detection and synthetic pipeline emission**

In `useChat.js`, inside the `sendMessage` function, find the section right after pipeline steps are reset (around line 366). After `updatePipelineSteps([]);` add the Plusi detection:

```javascript
// @Plusi direct mode — skip router, emit synthetic pipeline, route via plusiDirect
const isPlusiDirect = /^@plusi\b/i.test(text);
if (isPlusiDirect) {
  // Emit synthetic router-active immediately
  updatePipelineSteps([{ step: 'router', status: 'active', data: {}, timestamp: Date.now() }]);

  // After 700ms, emit router-done (simulated thinking)
  setTimeout(() => {
    updatePipelineSteps(prev => prev.map(s => s.step === 'router' ? {
      ...s,
      status: 'done',
      data: {
        search_needed: false,
        retrieval_mode: 'none',
        response_length: 'short',
        scope: 'none',
        scope_label: ''
      },
      timestamp: Date.now()
    } : s));
  }, 700);
}
```

- [ ] **Step 2: Route via existing plusiDirect bridge method**

After the synthetic pipeline emission block, add the backend routing. Instead of calling `bridge.sendMessage`, use the existing `bridge.plusiDirect` method (defined in `useAnki.js:411`):

```javascript
if (isPlusiDirect) {
  // Strip @Plusi prefix
  const cleanText = text.replace(/^@plusi\s*/i, '').trim() || text;
  // Use existing plusiDirect bridge — already handles run_plusi(), mood sync, panel notify
  if (bridge && bridge.plusiDirect) {
    bridge.plusiDirect(cleanText, null); // deck_id=null, backend resolves current deck
  }
  return; // Skip normal sendMessage flow — no router, no main model
}
```

Place this **before** the existing `bridge.sendMessage(text, ...)` call (around line 371-374), so Plusi-direct messages exit early and never reach the normal AI pipeline.

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Type `@Plusi wie geht es dir?`. Verify:
- ThoughtStream shows "Analysiere Anfrage..." with shimmer
- After ~700ms, shows "Direkte Antwort" with three tags (Strategie / Kontext / Antwort)
- Plusi responds with mood + text via existing `plusi_direct_result` handler
- Router is not called (no router log in Anki console)
- Plusi dock mood updates

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useChat.js
git commit -m "feat(plusi): add @Plusi detection in useChat with synthetic pipeline and direct routing"
```
