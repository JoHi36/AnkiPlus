# Compact Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual insight extraction button with an AI-initiated `compact` tool that suggests chat summarization, clears the chat on confirmation, and shows extracted insights with skeleton loading and "neu" labels.

**Architecture:** New `compact` tool registered in the existing tool system. AI calls it at end of responses when chat is long. Frontend renders a confirm widget via `ToolWidgetRenderer`. On confirmation, existing `InsightExtractionThread` runs extraction with improved prompt, chat clears, `InsightsDashboard` shows skeleton → real insights. Hash-based tracking marks new insights.

**Tech Stack:** Python (PyQt6, QThread), React 18, existing tool registry + message queue

**Spec:** `docs/superpowers/specs/2026-03-22-compact-tool-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `ai/tools.py` | Modify | Register `compact` tool definition |
| `ai/tool_executor.py` | No change | Already handles all tools generically |
| `storage/insights.py` | Modify | Improved extraction prompt, hash utilities |
| `ui/widget.py` | Modify | Compute `new_indices`, add `markInsightsSeen` handler |
| `frontend/src/components/ToolWidgetRenderer.jsx` | Modify | Add `case 'compact':` rendering |
| `frontend/src/components/CompactWidget.jsx` | Create | Confirmation widget (Zusammenfassen? Ja/Nein) |
| `frontend/src/components/InsightsDashboard.jsx` | Modify | Add skeleton loading rows |
| `frontend/src/hooks/useInsights.js` | Modify | Add `markInsightsSeen`, handle `newInsightIds` |
| `frontend/src/App.jsx` | Modify | Remove ExtractInsightsButton, wire compact confirm → extraction + chat clear |
| `frontend/src/components/ExtractInsightsButton.jsx` | Delete | Replaced by compact tool |
| `tests/test_insights.py` | Create | Tests for new prompt, hash utilities |

---

### Task 1: Improve Extraction Prompt + Add Hash Utilities

**Files:**
- Modify: `storage/insights.py`
- Test: `tests/test_insights.py`

- [ ] **Step 1: Write tests for improved prompt and hash utility**

In `tests/test_insights.py`, add:

```python
def test_build_extraction_prompt_has_example():
    """Prompt must include a few-shot JSON example for reliable output."""
    from storage.insights import build_extraction_prompt
    prompt = build_extraction_prompt(
        {'frontField': 'What is mitosis?'},
        [{'from': 'user', 'text': 'explain'}, {'from': 'assistant', 'text': 'cell division'}],
        {'version': 1, 'insights': []},
    )
    assert 'BEISPIEL-OUTPUT' in prompt
    assert '"type":"learned"' in prompt


def test_insight_hash_deterministic():
    """Hash of same text must always produce same result."""
    from storage.insights import insight_hash
    h1 = insight_hash("Kompetitive Hemmung erhöht Km")
    h2 = insight_hash("Kompetitive Hemmung erhöht Km")
    assert h1 == h2
    assert isinstance(h1, str)
    assert len(h1) == 8


def test_insight_hash_different_texts():
    from storage.insights import insight_hash
    h1 = insight_hash("Text A")
    h2 = insight_hash("Text B")
    assert h1 != h2


def test_compute_new_indices():
    """New indices are insights whose hash is not in seen_hashes."""
    from storage.insights import insight_hash, compute_new_indices
    insights = [
        {"text": "old fact", "type": "learned"},
        {"text": "new fact", "type": "learned"},
    ]
    seen = [insight_hash("old fact")]
    result = compute_new_indices(insights, seen)
    assert result == [1]


def test_compute_new_indices_all_new():
    from storage.insights import insight_hash, compute_new_indices
    insights = [{"text": "a", "type": "learned"}, {"text": "b", "type": "weakness"}]
    result = compute_new_indices(insights, [])
    assert result == [0, 1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_build_extraction_prompt_has_example or test_insight_hash or test_compute_new" -v`

Expected: FAIL — `insight_hash` and `compute_new_indices` don't exist, prompt lacks `BEISPIEL-OUTPUT`

- [ ] **Step 3: Implement improved prompt and hash utilities**

Replace the `EXTRACTION_PROMPT` constant and add functions in `storage/insights.py`:

```python
EXTRACTION_PROMPT = """Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Karte.

KARTE: {question}

BISHERIGE ERKENNTNISSE: {existing_insights}

CHAT:
{chat_messages}

AUFGABE:
- Extrahiere die wichtigsten Lernpunkte als kurze Stichpunkte
- Typ "learned": Konzept verstanden, Wissen bestätigt
- Typ "weakness": Fehler gemacht, Verwechslung, Unsicherheit
- Priorisiere: Fehler des Nutzers > neue Konzepte > Bestätigungen
- Merge mit bisherigen Erkenntnissen: Duplikate entfernen, Widersprüche aktualisieren, max 10 Einträge
- NUR das JSON-Objekt ausgeben, KEIN anderer Text

BEISPIEL-OUTPUT:
{{"version":1,"insights":[{{"text":"Kompetitive Hemmung erhöht Km, nicht Vmax","type":"learned"}},{{"text":"Verwechslung: allosterisch ≠ nicht-kompetitiv","type":"weakness"}}]}}"""
```

Add hash utilities after the imports:

```python
import hashlib

def insight_hash(text):
    """Deterministic 8-char hash of insight text for seen-tracking."""
    return hashlib.md5(text.encode('utf-8')).hexdigest()[:8]


def compute_new_indices(insights, seen_hashes):
    """Return indices of insights whose text hash is not in seen_hashes."""
    return [
        i for i, ins in enumerate(insights)
        if insight_hash(ins.get('text', '')) not in seen_hashes
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_build_extraction_prompt_has_example or test_insight_hash or test_compute_new" -v`

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add storage/insights.py tests/test_insights.py
git commit -m "feat(insights): improve extraction prompt with few-shot example, add hash utilities"
```

---

### Task 2: Register `compact` Tool

**Files:**
- Modify: `ai/tools.py` (after line 251, after the mermaid registration)

- [ ] **Step 1: Add compact tool definition**

Add at the end of `ai/tools.py`, after the last `registry.register(...)` call:

```python
# ---------------------------------------------------------------------------
# Compact Tool — AI-initiated insight extraction
# ---------------------------------------------------------------------------

COMPACT_SCHEMA = {
    "name": "compact",
    "description": (
        "Schlage dem Nutzer vor, den bisherigen Chat zusammenzufassen "
        "und die Lernerkenntnisse zu extrahieren. Nutze dieses Tool "
        "am ENDE deiner Antwort, wenn der Chat lang wird (>6 Nachrichten) "
        "oder wenn ein Thema abgeschlossen scheint. "
        "Das Tool rendert einen Bestätigungs-Button. Keine Parameter nötig."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
    },
}


def execute_compact(args):
    """No-op execution — the tool is a UI signal, not a data processor."""
    return {"type": "compact"}


registry.register(
    ToolDefinition(
        name="compact",
        schema=COMPACT_SCHEMA,
        execute_fn=execute_compact,
        category="meta",
        config_key=None,
        agent="tutor",
        disabled_modes=[],
        display_type="widget",
        timeout_seconds=1,
    )
)
```

- [ ] **Step 2: Verify tool loads**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "from ai.tools import registry; t = registry.get('compact'); print(t.name, t.display_type)"`

Expected: `compact widget`

- [ ] **Step 3: Commit**

```bash
git add ai/tools.py
git commit -m "feat(tools): register compact tool for AI-initiated insight extraction"
```

---

### Task 3: Backend — Compute `new_indices` and Add `markInsightsSeen` Handler

**Files:**
- Modify: `ui/widget.py` (lines 180-294 InsightExtractionThread, lines 667-696 handler area)

- [ ] **Step 1: Modify `InsightExtractionThread.run()` to compute and embed `new_indices`**

In `ui/widget.py`, in the `run()` method, replace the block at lines 285-289:

```python
            # Save to storage
            from ..storage.card_sessions import save_insights
            save_insights(self.card_id, result)

            self.finished_signal.emit(self.card_id, json.dumps(result, ensure_ascii=False))
```

With:

```python
            # Compute new_indices before saving
            from ..storage.insights import compute_new_indices, insight_hash
            from ..storage.card_sessions import load_insights, save_insights

            # Load existing seen_hashes
            existing = load_insights(self.card_id)
            seen_hashes = existing.get('seen_hashes', [])

            new_indices = compute_new_indices(result.get('insights', []), seen_hashes)

            # Preserve seen_hashes in saved data
            result['seen_hashes'] = seen_hashes

            save_insights(self.card_id, result)

            # Embed new_indices in the emitted JSON (not persisted, just for frontend)
            emit_data = dict(result)
            emit_data['new_indices'] = new_indices
            self.finished_signal.emit(self.card_id, json.dumps(emit_data, ensure_ascii=False))
```

- [ ] **Step 2: Update `_on_done` callback to forward `new_indices`**

In `_msg_extract_insights()` at line 679, the `_on_done` callback already passes the full JSON. The `new_indices` key is now embedded in `result_json`, so `json.loads(result_json)` will include it. The frontend event handler in `useInsights.js` will receive it. No change needed to `_on_done` itself.

Verify by reading: the payload at line 680 does `json.loads(result_json)` which will now contain `new_indices`.

- [ ] **Step 3: Add `_msg_mark_insights_seen` handler**

Add after `_msg_extract_insights` (after line 696):

```python
    def _msg_mark_insights_seen(self, data):
        """Mark all current insights as seen (update seen_hashes)."""
        from ..storage.card_sessions import load_insights, save_insights
        from ..storage.insights import insight_hash
        card_id = data.get('cardId') if isinstance(data, dict) else int(data)
        if not card_id:
            return
        current = load_insights(int(card_id))
        hashes = [insight_hash(ins.get('text', '')) for ins in current.get('insights', [])]
        current['seen_hashes'] = hashes
        save_insights(int(card_id), current)
```

- [ ] **Step 4: Register handler in message dispatch dict**

In `_get_message_handler()` (around line 439-507), add the new handler to the `handlers` dict, after the `'getCardRevlog'` entry:

```python
            'markInsightsSeen': self._msg_mark_insights_seen,
```

Without this, the frontend's `addMessage('markInsightsSeen', ...)` call would be silently ignored.

- [ ] **Step 5: Commit**

```bash
git add ui/widget.py
git commit -m "feat(insights): compute new_indices in extraction thread, add markInsightsSeen handler"
```

---

### Task 4: Frontend — `CompactWidget` Component

**Files:**
- Create: `frontend/src/components/CompactWidget.jsx`

- [ ] **Step 1: Create CompactWidget**

```jsx
import React, { useState } from 'react';

export default function CompactWidget({ onConfirm, onDismiss }) {
  const [state, setState] = useState('idle'); // 'idle' | 'confirmed' | 'dismissed'

  if (state === 'dismissed') return null;

  const handleConfirm = () => {
    setState('confirmed');
    onConfirm?.();
  };

  const handleDismiss = () => {
    setState('dismissed');
    onDismiss?.();
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      marginTop: 8,
      borderRadius: 12,
      background: 'var(--ds-bg-frosted)',
      border: '1px solid var(--ds-border-subtle)',
    }}>
      <span style={{
        fontSize: 13,
        color: 'var(--ds-text-secondary)',
        flex: 1,
      }}>
        Erkenntnisse zusammenfassen?
      </span>

      {state === 'idle' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleConfirm}
            style={{
              padding: '5px 14px',
              borderRadius: 8,
              background: 'var(--ds-hover-tint)',
              color: 'var(--ds-accent)',
              fontSize: 12,
              fontWeight: 500,
              border: '1px solid var(--ds-border-subtle)',
              cursor: 'pointer',
            }}
          >
            Zusammenfassen
          </button>
          <button
            onClick={handleDismiss}
            style={{
              padding: '5px 10px',
              background: 'transparent',
              color: 'var(--ds-text-muted)',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Nein danke
          </button>
        </div>
      )}

      {state === 'confirmed' && (
        <span style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>
          Wird zusammengefasst...
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CompactWidget.jsx
git commit -m "feat(ui): add CompactWidget confirmation component for compact tool"
```

---

### Task 5: Frontend — Wire CompactWidget into ToolWidgetRenderer

**Files:**
- Modify: `frontend/src/components/ToolWidgetRenderer.jsx`

- [ ] **Step 1: Add compact case to ToolWidgetRenderer**

Import `CompactWidget` at the top (after line 10):

```javascript
import CompactWidget from './CompactWidget';
```

Add a new case in the `switch (tw.name)` block at line 85 (before `default:`):

```javascript
            case 'compact':
              return (
                <CompactWidget
                  key={`compact-${i}`}
                  onConfirm={() => {
                    window.dispatchEvent(new CustomEvent('compactConfirmed'));
                  }}
                  onDismiss={() => {}}
                />
              );
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ToolWidgetRenderer.jsx
git commit -m "feat(ui): render CompactWidget in ToolWidgetRenderer for compact tool"
```

---

### Task 6: Frontend — Skeleton State in InsightsDashboard

**Files:**
- Modify: `frontend/src/components/InsightsDashboard.jsx`

- [ ] **Step 1: Add skeleton rows for fresh extraction**

In `InsightsDashboard.jsx`, add a keyframe style block at the top of the file (after imports):

```javascript
const SKELETON_KEYFRAMES = `
@keyframes insight-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}`;

// Inject once
if (typeof document !== 'undefined' && !document.getElementById('insight-skeleton-kf')) {
  const s = document.createElement('style');
  s.id = 'insight-skeleton-kf';
  s.textContent = SKELETON_KEYFRAMES;
  document.head.appendChild(s);
}

function SkeletonRow({ width = '75%' }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--ds-border-subtle)', flexShrink: 0, marginTop: 4,
      }} />
      <div style={{
        height: 10, width, borderRadius: 5,
        background: 'linear-gradient(90deg, var(--ds-border-subtle), var(--ds-hover-tint), var(--ds-border-subtle))',
        backgroundSize: '200% 100%',
        animation: 'insight-shimmer 1.8s ease-in-out infinite',
      }} />
    </div>
  );
}
```

Then modify the insights rendering section (around line 43). Replace:

```javascript
      {hasInsights ? (
```

With:

```javascript
      {isExtracting && !hasInsights ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--ds-text-muted)', letterSpacing: '0.3px', marginBottom: 20 }}>
              Erkenntnisse werden extrahiert...
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <SkeletonRow width="85%" />
              <SkeletonRow width="70%" />
              <SkeletonRow width="90%" />
              <SkeletonRow width="60%" />
              <SkeletonRow width="78%" />
            </div>
          </>
        ) : hasInsights ? (
```

Note: the closing tags stay the same — this just adds the skeleton branch before the existing `hasInsights` check.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/InsightsDashboard.jsx
git commit -m "feat(ui): add skeleton loading rows to InsightsDashboard during extraction"
```

---

### Task 7: Frontend — Update `useInsights` Hook

**Files:**
- Modify: `frontend/src/hooks/useInsights.js`

- [ ] **Step 1: Add `newInsightIds` state and `markInsightsSeen` method**

Add state for new insight IDs (after line 9):

```javascript
  const [newInsightIds, setNewInsightIds] = useState([]);
```

Add `markInsightsSeen` method (after `extractInsights`):

```javascript
  const markInsightsSeen = useCallback((cardId) => {
    if (!cardId) return;
    setNewInsightIds([]);
    window.ankiBridge?.addMessage('markInsightsSeen', { cardId });
  }, []);
```

Update the `onExtractionComplete` handler (line 55-61) to handle `new_indices`:

```javascript
    const onExtractionComplete = (e) => {
      const data = e.detail;
      setIsExtracting(false);
      if (data?.success && data.insights) {
        setInsights(data.insights);
        setNewInsightIds(data.insights.new_indices || []);
      }
    };
```

Add `newInsightIds` and `markInsightsSeen` to the return object (after line 89):

```javascript
  return {
    insights,
    revlogData,
    chartData,
    isExtracting,
    currentCardId,
    newInsightIds,
    loadInsights,
    saveInsights,
    extractInsights,
    markInsightsSeen,
    setInsights,
  };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useInsights.js
git commit -m "feat(insights): add newInsightIds tracking and markInsightsSeen to useInsights hook"
```

---

### Task 8: Frontend — Wire Compact Confirmation in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

This is the main wiring task. On `compactConfirmed` event:
1. Clear chat messages
2. Set extracting state
3. Trigger extraction
4. Pass `newInsightIds` to `InsightsDashboard`

- [ ] **Step 1: Remove ExtractInsightsButton import and usage**

Remove import at line 35:
```javascript
// DELETE: import ExtractInsightsButton from './components/ExtractInsightsButton';
```

Remove the `<ExtractInsightsButton ... />` block at lines 2385-2409.

- [ ] **Step 2: Remove auto-extraction from `handleResetChat`**

Replace lines 1876-1891:

```javascript
  const handleResetChat = useCallback(() => {
    if (confirm('Möchtest du den Chat wirklich zurücksetzen? Alle Nachrichten und Abschnitte werden gelöscht.')) {
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    }
  }, [chatHook, cardContextHook]);
```

(Removed the `extractInsights` call — compact tool replaces this.)

- [ ] **Step 3: Add `compactConfirmed` event listener**

Add a `useEffect` near the other event listeners in App.jsx:

```javascript
  // Compact tool: when user confirms, clear chat and trigger extraction
  useEffect(() => {
    const handleCompactConfirmed = () => {
      const cardId = cardContextHook.cardContext?.cardId;
      if (!cardId) return;

      // Trigger extraction with current messages before clearing
      insightsHook.extractInsights(
        cardId,
        cardContextHook.cardContext,
        chatHook.messages,
        null
      );

      // Clear chat immediately
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    };

    window.addEventListener('compactConfirmed', handleCompactConfirmed);
    return () => window.removeEventListener('compactConfirmed', handleCompactConfirmed);
  }, [cardContextHook, chatHook, insightsHook]);
```

- [ ] **Step 4: Pass `newInsightIds` to InsightsDashboard**

Find the `<InsightsDashboard` render (around line 2102-2108) and add the prop:

```javascript
  newInsightIds={insightsHook.newInsightIds}
```

- [ ] **Step 5: Add seen-marking on card change**

In the card-change handlers (around lines 705-719 and 1215-1229), add before loading new insights. **Important:** These handlers access the hook via `insightsHookRef.current` (not `insightsHook` directly), matching the existing pattern:

```javascript
  // Mark previous card's insights as seen
  if (insightsHookRef.current.currentCardId) {
    insightsHookRef.current.markInsightsSeen(insightsHookRef.current.currentCardId);
  }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(compact): wire compact confirmation to extraction flow, remove ExtractInsightsButton"
```

---

### Task 9: Delete ExtractInsightsButton

**Files:**
- Delete: `frontend/src/components/ExtractInsightsButton.jsx`

- [ ] **Step 1: Delete the file**

```bash
rm "frontend/src/components/ExtractInsightsButton.jsx"
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "ExtractInsightsButton" frontend/src/
```

Expected: No results (import was already removed in Task 8)

- [ ] **Step 3: Commit**

```bash
git add -u frontend/src/components/ExtractInsightsButton.jsx
git commit -m "chore: remove ExtractInsightsButton, replaced by compact tool"
```

---

### Task 10: Build & Smoke Test

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 2: Verify no import/reference errors**

```bash
grep -r "ExtractInsightsButton" frontend/src/ web/
```

Expected: No results

- [ ] **Step 3: Verify compact tool is registered**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "
from ai.tools import registry
t = registry.get('compact')
assert t is not None, 'compact tool not found'
assert t.display_type == 'widget', f'expected widget, got {t.display_type}'
print('compact tool OK:', t.name, t.display_type)
"
```

- [ ] **Step 4: Run all existing tests**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v
```

Expected: All tests pass

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: compact tool — AI-initiated insight extraction with skeleton loading and neu labels"
```
