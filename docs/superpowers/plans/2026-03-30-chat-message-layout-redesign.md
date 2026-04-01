# Chat Message Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic chatbot layout with a premium Q&A layout: questions as bold headings, agent identity via activity line showing pipeline work, fade line separators between blocks.

**Architecture:** User messages get heading styles (21px bold). The Tutor's AgenticCell wrapper is bypassed in favor of a new `ActivityLine` component + raw content rendering. A `FadeSeparator` component sits between consecutive Q&A blocks. Other agents (Research, Plusi) keep their current AgenticCell rendering unchanged.

**Tech Stack:** React 18, CSS custom properties (design system tokens), existing ChatMessage.jsx rendering pipeline.

**Spec:** `docs/superpowers/specs/2026-03-30-chat-message-layout-redesign.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/ActivityLine.jsx` | Agent activity summary line |
| Create | `frontend/src/components/FadeSeparator.jsx` | Subtle gradient divider between Q&A blocks |
| Modify | `frontend/src/components/ChatMessage.jsx:1450-1465` | User message heading styles |
| Modify | `frontend/src/components/ChatMessage.jsx:1862-1975` | Tutor: bypass AgenticCell, use ActivityLine |
| Modify | `frontend/src/App.jsx:2672-2743` | Add FadeSeparator between message blocks |

---

### Task 1: Create `ActivityLine` Component

**Files:**
- Create: `frontend/src/components/ActivityLine.jsx`

- [ ] **Step 1: Create ActivityLine component**

```jsx
// frontend/src/components/ActivityLine.jsx
import React from 'react';

const LINE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  marginBottom: 8,
};

const NAME_STYLE = {
  fontWeight: 600,
  color: 'var(--ds-text-secondary)',
};

const SEP_STYLE = {
  opacity: 0.3,
};

const DOTS_STYLE = {
  display: 'flex',
  gap: 2,
  alignItems: 'center',
};

const DOT_STYLE = {
  width: 4,
  height: 4,
  borderRadius: '50%',
};

export default function ActivityLine({ agentName, cardCount, stepCount, citedCount, cardSourceCount }) {
  const webCount = citedCount - (cardSourceCount || 0);
  const hasSources = citedCount > 0;
  const hasAction = cardCount > 0;

  // Build dot array (max 6 card + 4 web)
  const dots = hasSources ? [
    ...Array(Math.min(cardSourceCount || 0, 6)).fill('card'),
    ...Array(Math.min(Math.max(webCount, 0), 4)).fill('web'),
  ] : [];

  return (
    <div style={LINE_STYLE}>
      <span style={NAME_STYLE}>{agentName || 'tutor'}</span>

      {hasAction && (
        <>
          <span style={SEP_STYLE}>·</span>
          <span>durchsuchte {cardCount.toLocaleString('de-DE')} Karten</span>
        </>
      )}

      {stepCount > 3 && (
        <>
          <span style={SEP_STYLE}>·</span>
          <span>{stepCount} Schritte</span>
        </>
      )}

      {hasSources && (
        <>
          <span style={SEP_STYLE}>·</span>
          <div style={DOTS_STYLE}>
            {dots.map((type, i) => (
              <div
                key={i}
                style={{
                  ...DOT_STYLE,
                  background: type === 'card'
                    ? 'color-mix(in srgb, var(--ds-accent) 50%, transparent)'
                    : 'color-mix(in srgb, var(--ds-green) 50%, transparent)',
                }}
              />
            ))}
          </div>
          <span>{citedCount} Quelle{citedCount !== 1 ? 'n' : ''}</span>
        </>
      )}

      {!hasAction && !hasSources && (
        <>
          <span style={SEP_STYLE}>·</span>
          <span>direkte Antwort</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ActivityLine.jsx
git commit -m "feat: add ActivityLine component — agent pipeline summary"
```

---

### Task 2: Create `FadeSeparator` Component

**Files:**
- Create: `frontend/src/components/FadeSeparator.jsx`

- [ ] **Step 1: Create FadeSeparator component**

```jsx
// frontend/src/components/FadeSeparator.jsx
import React from 'react';

const SEPARATOR_STYLE = {
  height: 1,
  background: 'linear-gradient(90deg, transparent 0%, var(--ds-hover-tint) 20%, var(--ds-hover-tint) 80%, transparent 100%)',
  margin: '8px 0 24px',
};

export default function FadeSeparator() {
  return <div style={SEPARATOR_STYLE} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FadeSeparator.jsx
git commit -m "feat: add FadeSeparator component — subtle gradient divider"
```

---

### Task 3: Restyle User Messages as Headings

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx:1450-1465`

- [ ] **Step 1: Read current user message rendering**

Read `frontend/src/components/ChatMessage.jsx` around lines 1450-1465 to find the exact current code.

- [ ] **Step 2: Replace user message styles with heading**

Find the user message return block (approximately):
```jsx
  return (
    <div className="pt-4">
      <div
        className="text-[14.5px] font-medium leading-[1.45]"
        style={{ color: 'var(--ds-text-primary)' }}
      >
        {displayText}
      </div>
    </div>
  );
```

Replace with:
```jsx
  return (
    <div style={{ paddingTop: 16 }}>
      <div
        style={{
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: '-0.3px',
          lineHeight: 1.3,
          color: 'var(--ds-text-primary)',
        }}
      >
        {displayText}
      </div>
    </div>
  );
```

- [ ] **Step 3: Test in browser**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000`
Verify: User messages render as large bold headings, left-aligned.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat: restyle user messages as bold headings (21px)"
```

---

### Task 4: Tutor — Bypass AgenticCell, Use ActivityLine

This is the core task. For Tutor agent cells, render ActivityLine + raw content instead of the full AgenticCell wrapper.

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx:1862-1975`

- [ ] **Step 1: Read the current agentCells rendering**

Read `frontend/src/components/ChatMessage.jsx` around lines 1862-1975 to understand the exact current structure. Pay attention to:
- The `.map()` over `message_prop.agentCells`
- The `headerMeta` computation
- The `AgenticCell` wrapper
- The children: step label, text content, research sources, tool widgets

- [ ] **Step 2: Add ActivityLine import**

At the top of `ChatMessage.jsx`, add:
```jsx
import ActivityLine from './ActivityLine';
```

- [ ] **Step 3: Branch Tutor rendering from other agents**

Inside the `agentCells.map()` block, after the existing `headerMeta`/`citedCount`/`remapOldToNew` computations, add a branch for the Tutor agent that renders WITHOUT AgenticCell.

Find the `return (` that starts the AgenticCell JSX (approximately `return ( <AgenticCell ...>`).

Replace the return block with a conditional:

```jsx
                  // Tutor: render without AgenticCell wrapper
                  if (cell.agent === 'tutor') {
                    const stepCount = cell.pipelineSteps?.length || 0;
                    // Card count from deck stats or pipeline data (fallback 0)
                    const totalCards = cell.pipelineSteps?.find(s => s.data?.total_cards)?.data?.total_cards || 0;

                    return (
                      <div key={`${cell.agent}-${i}`}>
                        {/* Activity Line — during streaming show dots, after show summary */}
                        {cellIsStreaming && hasReasoningData ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ds-text-tertiary)', marginBottom: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ds-text-secondary)' }}>tutor</span>
                            <span style={{ opacity: 0.3 }}>·</span>
                            <ReasoningDisplay
                              streamId={requestId ? `${cell.agent}-${requestId}` : undefined}
                              steps={undefined}
                              mode="dots"
                            />
                          </div>
                        ) : (
                          <ActivityLine
                            agentName="tutor"
                            cardCount={totalCards}
                            stepCount={stepCount}
                            citedCount={citedCount}
                            cardSourceCount={cardSourceCount}
                          />
                        )}

                        {/* Step label during streaming */}
                        {cellIsStreaming && hasReasoningData && (
                          <ReasoningDisplay
                            streamId={requestId ? `${cell.agent}-${requestId}` : undefined}
                            mode="compact"
                            hideCounter
                            hasOutput={Boolean(cell.text)}
                          />
                        )}

                        {/* Text content */}
                        {cell.text && cell.status !== 'loading' && !cell.sources?.length && (() => {
                          let cleanText = cell.text.replace(/\n?HANDOFF:?\s*\w+\s+REASON:?\s*.+?\s+QUERY:?\s*.+$/s, '').trim();
                          if (!cleanText) return null;
                          if (Object.keys(remapOldToNew).length > 0) {
                            cleanText = cleanText.replace(/\[(\d+)\](?!\()/g, (match, numStr) => {
                              const oldIdx = parseInt(numStr, 10);
                              const newIdx = remapOldToNew[oldIdx];
                              const citIdKey = backendIndexToCitId[oldIdx];
                              if (newIdx && citIdKey) return `[${newIdx}](citation:${citIdKey})`;
                              return match;
                            });
                          }
                          return (
                            <SafeMarkdownRenderer
                              content={cleanText}
                              MermaidDiagram={MermaidDiagram}
                              isStreaming={cell.status === 'streaming'}
                              citations={cellCitations || {}}
                              citationIndices={cellCitationIndices}
                              bridge={bridge}
                              onPreviewCard={onPreviewCard}
                            />
                          );
                        })()}

                        {/* Tool widgets (keep as-is) */}
                        {cell.toolResults && cell.toolResults.length > 0 && (
                          <ComponentErrorBoundary>
                            <ToolWidgetRenderer
                              toolResults={cell.toolResults}
                              bridge={bridge}
                              onPreviewCard={onPreviewCard}
                            />
                          </ComponentErrorBoundary>
                        )}
                      </div>
                    );
                  }

                  // Other agents: keep AgenticCell wrapper (existing code)
                  return (
                  <AgenticCell
                    key={`${cell.agent}-${i}`}
                    agentName={cell.agent}
                    isLoading={cell.status === 'loading'}
                    loadingHint={cell.loadingHint || ''}
                    headerMeta={headerMeta}
                  >
```

**IMPORTANT:** The `return ( <AgenticCell ...>` block and everything inside it (the existing non-Tutor rendering) stays EXACTLY as is. You're adding the Tutor branch BEFORE it with an early return.

- [ ] **Step 4: Test in browser**

Run: `cd frontend && npm run dev`
Verify:
- Tutor responses show ActivityLine instead of icon + "Tutor" header
- No gray background on Tutor responses
- Other agents (if any) still show their AgenticCell

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat: Tutor bypasses AgenticCell — renders ActivityLine + raw content"
```

---

### Task 5: Add FadeSeparator Between Q&A Blocks

**Files:**
- Modify: `frontend/src/App.jsx:2672-2743`

- [ ] **Step 1: Read the message mapping in App.jsx**

Read `frontend/src/App.jsx` around lines 2672-2743 to understand the message iteration. Each message is wrapped in a `<div className="mb-6">`.

- [ ] **Step 2: Add FadeSeparator import**

At top of App.jsx:
```jsx
import FadeSeparator from './components/FadeSeparator';
```

- [ ] **Step 3: Add FadeSeparator between consecutive bot→user transitions**

Inside the `messagesToRender.map()`, before each user message that follows a bot message, render a FadeSeparator.

Find the message wrapper div (approximately):
```jsx
      {msg && typeof msg.text === 'string' && msg.text && (
        <div
          className="mb-6"
```

Add the separator BEFORE the message div, inside the `<React.Fragment>`:

```jsx
      {/* Fade separator between Q&A blocks (before user messages that follow bot messages) */}
      {msg.from === 'user' && localIdx > 0 && (() => {
        const prevInRender = messagesToRender[localIdx - 1];
        return prevInRender && prevInRender.from !== 'user' ? <FadeSeparator /> : null;
      })()}
```

This adds a fade line before each user message that follows a bot message — effectively separating Q&A blocks.

- [ ] **Step 4: Test in browser**

Run: `cd frontend && npm run dev`
Verify: Subtle gradient lines appear between consecutive Q&A blocks. No separator before the first message. No separator between consecutive user messages.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add FadeSeparator between Q&A blocks in chat"
```

---

### Task 6: Build and Verify

**Files:** None (verification only)

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: All tests pass.

- [ ] **Step 2: Build for production**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit build**

```bash
git add web/
git commit -m "build: production build with chat message layout redesign"
```
