# Card Insights Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty chat state with a per-card dashboard showing accumulated learning insights and review statistics, and use insights as clean AI context instead of full chat history.

**Architecture:** Backend adds three message handlers (insights CRUD + revlog fetch) and a new `insight_extractor.py` module for AI-based insight extraction. Frontend adds three new components (`InsightsDashboard`, `InsightBullet`, `MiniChart`) rendered in the empty state. Extraction triggers automatically on chat reset or card change via App.jsx integration.

**Tech Stack:** Python/Qt backend, React 18 frontend, SQLite storage, SVG charts, existing AI provider integration

**Spec:** `docs/superpowers/specs/2026-03-19-card-insights-dashboard.md`

---

## File Structure

### New Files
- `insight_extractor.py` — AI extraction logic: prompt construction, JSON parsing, error handling, retry
- `frontend/src/components/InsightsDashboard.jsx` — main dashboard component (empty state replacement)
- `frontend/src/components/InsightBullet.jsx` — single insight row with colored dot + optional citation
- `frontend/src/components/MiniChart.jsx` — reusable SVG sparkline with gradient fill and grid
- `frontend/src/hooks/useInsights.js` — hook for loading/saving insights, revlog data, extraction trigger

### Modified Files
- `card_sessions_storage.py:572+` — add `load_insights()`, `save_insights()`, `get_card_revlog()` module-level functions
- `widget.py:240+` — add message handlers for insights CRUD + extraction in `_handle_js_message()`
- `widget.py:147+` — add `InsightExtractionThread` class
- `frontend/src/App.jsx:1952-1958` — replace empty state placeholder with `InsightsDashboard`
- `frontend/src/App.jsx:1737+` — trigger extraction on reset and card change
- `shared/components/ChatInput.tsx:293-318` — replace "Übersicht" with "Erkenntnisse" toggle
- `system_prompt.py:43-54` — inject insights into AI system prompt context

---

## Task 1: Backend — Insights Storage Methods

**Files:**
- Modify: `card_sessions_storage.py:572+` (add module-level functions after existing `update_summary`)

**Important:** This file uses module-level functions with a `_get_db()` singleton, NOT a class. Follow the existing pattern exactly.

- [ ] **Step 1: Add `load_insights(card_id)` function**

In `card_sessions_storage.py`, after the existing `update_summary()` function (line 584), add:

```python
def load_insights(card_id):
    """Load insights JSON from card_sessions.summary"""
    try:
        db = _get_db()
        row = db.execute(
            "SELECT summary FROM card_sessions WHERE card_id = ?",
            (card_id,)
        ).fetchone()
        if row and row['summary']:
            return json.loads(row['summary'])
        return {"version": 1, "insights": []}
    except Exception as e:
        print(f"[card_sessions_storage] Error loading insights for card {card_id}: {e}")
        return {"version": 1, "insights": []}
```

- [ ] **Step 2: Add `save_insights(card_id, insights_data)` function**

```python
def save_insights(card_id, insights_data):
    """Save insights JSON to card_sessions.summary"""
    try:
        db = _get_db()
        summary_str = json.dumps(insights_data, ensure_ascii=False)
        existing = db.execute(
            "SELECT card_id FROM card_sessions WHERE card_id = ?",
            (card_id,)
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE card_sessions SET summary = ?, updated_at = ? WHERE card_id = ?",
                (summary_str, datetime.now().isoformat(), card_id)
            )
        else:
            db.execute(
                "INSERT INTO card_sessions (card_id, summary, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (card_id, summary_str, datetime.now().isoformat(), datetime.now().isoformat())
            )
        db.commit()
        return True
    except Exception as e:
        print(f"[card_sessions_storage] Error saving insights for card {card_id}: {e}")
        return False
```

- [ ] **Step 3: Add `get_card_revlog(card_id, max_points=50)` function**

This queries Anki's own database (not the addon's SQLite):

```python
def get_card_revlog(card_id, max_points=50):
    """Fetch review history from Anki's revlog table. Must run on main thread."""
    try:
        from aqt import mw
        if not mw or not mw.col:
            return []
        rows = mw.col.db.all(
            "SELECT id, ease, ivl, time FROM revlog WHERE cid = ? ORDER BY id ASC",
            card_id
        )
        if not rows:
            return []
        # Aggregate if too many points
        if len(rows) > max_points:
            step = len(rows) / max_points
            rows = [rows[int(i * step)] for i in range(max_points)]
        return [
            {
                "timestamp": row[0] // 1000,  # ms to seconds
                "ease": row[1],               # 1-4
                "ivl": row[2],                # interval after review
                "time": row[3]                # time spent in ms
            }
            for row in rows
        ]
    except Exception as e:
        print(f"[card_sessions_storage] Error fetching revlog for card {card_id}: {e}")
        return []
```

- [ ] **Step 4: Commit**

```bash
git add card_sessions_storage.py
git commit -m "feat(insights): add storage functions for insights CRUD and revlog fetch"
```

---

## Task 2: Backend — Message Handlers in Widget

**Files:**
- Modify: `widget.py:240+` (add message handlers in `_handle_js_message()`)

**Important:** Follow the existing `loadCardSession` pattern at lines 415-429: construct a full payload dict, serialize to JSON, then dispatch via `runJavaScript` with both `ankiReceive` and `CustomEvent`.

- [ ] **Step 1: Add message handlers**

In `_handle_js_message()`, after the existing card session handlers (around line 470), add:

```python
elif msg_type == 'getCardInsights':
    try:
        from .card_sessions_storage import load_insights
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = load_insights(card_id)
        payload = {"type": "cardInsightsLoaded", "cardId": card_id, "success": True, "data": result}
        payload_json = json.dumps(payload, ensure_ascii=False)
        js = f"""(function() {{
            var p = {payload_json};
            if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
            window.dispatchEvent(new CustomEvent('ankiCardInsightsLoaded', {{detail: p}}));
        }})();"""
        self.web_view.page().runJavaScript(js)
    except Exception as e:
        print(f"_handle_js_message: getCardInsights error: {e}")

elif msg_type == 'saveCardInsights':
    try:
        from .card_sessions_storage import save_insights
        card_id = data.get('cardId')
        insights_data = data.get('insights')
        if card_id and insights_data:
            save_insights(int(card_id), insights_data)
    except Exception as e:
        print(f"_handle_js_message: saveCardInsights error: {e}")

elif msg_type == 'getCardRevlog':
    try:
        from .card_sessions_storage import get_card_revlog
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = get_card_revlog(card_id)
        payload = {"type": "cardRevlogLoaded", "cardId": card_id, "success": True, "data": result}
        payload_json = json.dumps(payload, ensure_ascii=False)
        js = f"""(function() {{
            var p = {payload_json};
            if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
            window.dispatchEvent(new CustomEvent('ankiCardRevlogLoaded', {{detail: p}}));
        }})();"""
        self.web_view.page().runJavaScript(js)
    except Exception as e:
        print(f"_handle_js_message: getCardRevlog error: {e}")
```

- [ ] **Step 2: Commit**

```bash
git add widget.py
git commit -m "feat(insights): add message handlers for insights CRUD and revlog"
```

---

## Task 3: Backend — Insight Extraction Module

**Files:**
- Create: `insight_extractor.py`

- [ ] **Step 1: Create `insight_extractor.py`**

```python
"""
Insight extraction from card chats.
Extracts learning insights incrementally using AI, merges with existing insights.
"""
import json


EXTRACTION_PROMPT = """Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Lernkarte.

Karteninhalt:
Frage: {question}
Antwort: {answer}

Bisherige Erkenntnisse: {existing_insights}

Chat-Verlauf:
{chat_messages}

Session-Performance: {performance}

Regeln:
- Formuliere stichpunktartig, keine ganzen Sätze
- Priorisiere: User-Fehler > neue Konzepte > Bestätigungen
- Typ "learned" = verstanden/gelernt, Typ "weakness" = Fehler/Unsicherheit
- Wenn eine andere Karte relevant ist, füge cardId als Citation hinzu
- Merge mit bestehenden Erkenntnissen: update wenn sich etwas verändert hat, ergänze nur wirklich Neues
- Maximal 10 Erkenntnisse pro Karte — wenn das Limit erreicht ist, ersetze die am wenigsten relevante
- Antworte ausschließlich im folgenden JSON-Format

Output-Format:
{{
  "version": 1,
  "insights": [
    {{
      "text": "Stichpunktartige Erkenntnis",
      "type": "learned | weakness",
      "citations": [{{ "cardId": 12345, "label": "1" }}]
    }}
  ]
}}"""


def _strip_tool_messages(messages):
    """Remove tool/function call messages to reduce tokens."""
    return [
        m for m in messages
        if not m.get('is_function_call') and m.get('sender', m.get('from')) in ('user', 'assistant', 'bot')
    ]


def _format_chat_for_extraction(messages):
    """Format chat messages as compact text for the extraction prompt."""
    stripped = _strip_tool_messages(messages)
    lines = []
    for m in stripped:
        sender = "User" if m.get('sender', m.get('from')) == 'user' else "Plusi"
        text = m.get('text', '')[:500]  # Truncate long messages
        lines.append(f"{sender}: {text}")
    return "\n".join(lines)


def _count_user_messages(messages):
    """Count messages from the user."""
    return sum(1 for m in messages if m.get('sender', m.get('from')) == 'user')


def build_extraction_prompt(card_context, messages, existing_insights, performance_data=None):
    """Build the full extraction prompt."""
    question = card_context.get('question', card_context.get('frontField', ''))
    answer = card_context.get('answer', '')

    existing_str = json.dumps(existing_insights, ensure_ascii=False) if existing_insights.get('insights') else "Keine"
    chat_str = _format_chat_for_extraction(messages)
    perf_str = json.dumps(performance_data, ensure_ascii=False) if performance_data else "Keine Daten"

    return EXTRACTION_PROMPT.format(
        question=question,
        answer=answer,
        existing_insights=existing_str,
        chat_messages=chat_str,
        performance=perf_str
    )


def parse_extraction_response(response_text):
    """Parse AI response into insights JSON. Returns None on failure."""
    try:
        text = response_text.strip()
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        data = json.loads(text)

        if 'insights' not in data or not isinstance(data['insights'], list):
            return None

        data['version'] = data.get('version', 1)

        valid_insights = []
        for insight in data['insights'][:10]:
            if isinstance(insight, dict) and 'text' in insight and 'type' in insight:
                if insight['type'] not in ('learned', 'weakness'):
                    insight['type'] = 'learned'
                insight.setdefault('citations', [])
                valid_insights.append(insight)

        data['insights'] = valid_insights
        return data

    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"[InsightExtractor] Failed to parse response: {e}")
        return None


def should_extract(messages):
    """Check if extraction should trigger (≥2 user messages)."""
    return _count_user_messages(messages) >= 2
```

- [ ] **Step 2: Commit**

```bash
git add insight_extractor.py
git commit -m "feat(insights): add insight extraction module with prompt and parser"
```

---

## Task 4: Backend — Extraction Thread & Handler

**Files:**
- Modify: `widget.py:147+` (add `InsightExtractionThread`)
- Modify: `widget.py:240+` (add `extractInsights` handler)

- [ ] **Step 1: Add `InsightExtractionThread` to `widget.py`**

After the existing `AIRequestThread` class (around line 147), add:

```python
class InsightExtractionThread(QThread):
    """Background thread for insight extraction."""
    finished_signal = pyqtSignal(int, str)  # card_id, insights_json
    error_signal = pyqtSignal(int, str)     # card_id, error_message

    def __init__(self, card_id, card_context, messages, existing_insights, performance_data, ai_handler):
        super().__init__()
        self.card_id = card_id
        self.card_context = card_context
        self.messages = messages
        self.existing_insights = existing_insights
        self.performance_data = performance_data
        self.ai_handler = ai_handler
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        if self._cancelled:
            return
        try:
            from .insight_extractor import build_extraction_prompt, parse_extraction_response

            prompt = build_extraction_prompt(
                self.card_context, self.messages,
                self.existing_insights, self.performance_data
            )

            # Use non-streaming AI request with extraction prompt as system override
            response = self.ai_handler.get_response(
                user_message="Extrahiere die Erkenntnisse aus dem folgenden Chat.",
                context=self.card_context,
                history=[],
                mode='compact',
                system_prompt_override=prompt
            )

            if self._cancelled:
                return

            if not response:
                self.error_signal.emit(self.card_id, "Empty response from AI")
                return

            result = parse_extraction_response(response)

            if result is None:
                # Retry once
                response = self.ai_handler.get_response(
                    user_message="Extrahiere die Erkenntnisse aus dem folgenden Chat.",
                    context=self.card_context,
                    history=[],
                    mode='compact',
                    system_prompt_override=prompt
                )
                if self._cancelled:
                    return
                result = parse_extraction_response(response) if response else None

            if result is None:
                self.error_signal.emit(self.card_id, "Failed to parse extraction response after retry")
                return

            # Save to storage
            from .card_sessions_storage import save_insights
            save_insights(self.card_id, result)

            self.finished_signal.emit(self.card_id, json.dumps(result, ensure_ascii=False))

        except Exception as e:
            if not self._cancelled:
                self.error_signal.emit(self.card_id, str(e))
```

- [ ] **Step 2: Add `extractInsights` handler in `_handle_js_message()`**

Follow the same `runJavaScript` dispatch pattern:

```python
elif msg_type == 'extractInsights':
    card_id = data.get('cardId')
    card_context = data.get('cardContext', {})
    messages = data.get('messages', [])
    existing_insights = data.get('existingInsights', {"version": 1, "insights": []})
    performance_data = data.get('performanceData')

    # Cancel any pending extraction
    if hasattr(self, '_extraction_thread') and self._extraction_thread and self._extraction_thread.isRunning():
        self._extraction_thread.cancel()
        self._extraction_thread.wait(1000)

    def _on_extraction_done(cid, result_json):
        try:
            payload = {"type": "insightExtractionComplete", "cardId": cid, "success": True, "insights": json.loads(result_json)}
            payload_json = json.dumps(payload, ensure_ascii=False)
            js = f"""(function() {{
                var p = {payload_json};
                if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
                window.dispatchEvent(new CustomEvent('ankiInsightExtractionComplete', {{detail: p}}));
            }})();"""
            self.web_view.page().runJavaScript(js)
        except Exception as e:
            print(f"_on_extraction_done error: {e}")

    def _on_extraction_error(cid, err):
        try:
            payload = {"type": "insightExtractionComplete", "cardId": cid, "success": False, "error": err}
            payload_json = json.dumps(payload, ensure_ascii=False)
            js = f"""(function() {{
                var p = {payload_json};
                if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
                window.dispatchEvent(new CustomEvent('ankiInsightExtractionComplete', {{detail: p}}));
            }})();"""
            self.web_view.page().runJavaScript(js)
        except Exception as e:
            print(f"_on_extraction_error error: {e}")

    self._extraction_thread = InsightExtractionThread(
        card_id, card_context, messages,
        existing_insights, performance_data, self.ai_handler
    )
    self._extraction_thread.finished_signal.connect(_on_extraction_done)
    self._extraction_thread.error_signal.connect(_on_extraction_error)
    self._extraction_thread.start()
```

- [ ] **Step 3: Commit**

```bash
git add widget.py
git commit -m "feat(insights): add background extraction thread and message handler"
```

---

## Task 5: Frontend — MiniChart Component

**Files:**
- Create: `frontend/src/components/MiniChart.jsx`

- [ ] **Step 1: Create `MiniChart.jsx`**

```jsx
import React, { useMemo } from 'react';

/**
 * Reusable SVG sparkline with gradient fill and grid lines.
 * @param {Array<number>} data - Array of values (0-1 normalized)
 * @param {string} color - CSS color for the line
 * @param {string} fillColor - CSS color for gradient fill top
 * @param {number} [height=36] - Chart height in px
 * @param {string} [label] - Optional label above chart
 * @param {boolean} [showGrid=true] - Show grid lines
 * @param {string} id - Unique ID for SVG gradient
 */
export default function MiniChart({
  data = [],
  color = 'rgba(140,120,200,0.35)',
  fillColor = 'rgba(140,120,200,0.1)',
  height = 36,
  label,
  showGrid = true,
  id
}) {
  const gradientId = `fill-${id || label || 'chart'}`;
  const viewWidth = 140;
  const viewHeight = height;
  const padding = 2;

  const points = useMemo(() => {
    if (!data.length) return '';
    const effectiveHeight = viewHeight - padding * 2;
    const step = viewWidth / Math.max(data.length - 1, 1);
    return data
      .map((val, i) => {
        const x = i * step;
        const y = padding + effectiveHeight * (1 - Math.max(0, Math.min(1, val)));
        return `${x},${y}`;
      })
      .join(' ');
  }, [data, viewWidth, viewHeight]);

  const fillPoints = useMemo(() => {
    if (!points) return '';
    return `${points} ${viewWidth},${viewHeight} 0,${viewHeight}`;
  }, [points, viewWidth, viewHeight]);

  if (!data.length) {
    return (
      <div>
        {label && (
          <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', letterSpacing: '0.3px', marginBottom: 4 }}>
            {label}
          </div>
        )}
        <div style={{ position: 'relative', height }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.025)' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', letterSpacing: '0.3px', marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', height }}>
        {showGrid && (
          <>
            <div style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.02)' }} />
            <div style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.02)' }} />
          </>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.025)' }} />
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <polygon points={fillPoints} fill={`url(#${gradientId})`} />
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MiniChart.jsx
git commit -m "feat(insights): add MiniChart SVG sparkline component"
```

---

## Task 6: Frontend — InsightBullet Component

**Files:**
- Create: `frontend/src/components/InsightBullet.jsx`

- [ ] **Step 1: Create `InsightBullet.jsx`**

```jsx
import React from 'react';

const DOT_COLORS = {
  learned: 'rgba(74,158,108,0.55)',
  weakness: 'rgba(180,80,70,0.55)',
};

export default function InsightBullet({ text, type = 'learned', citations = [], onCitationClick }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: DOT_COLORS[type] || DOT_COLORS.learned,
          flexShrink: 0,
          marginTop: 6,
        }}
      />
      <div style={{ fontSize: 15, color: 'rgba(232,232,232,0.8)', lineHeight: 1.55, letterSpacing: '-0.2px' }}>
        {text}
        {citations.map((c) => (
          <sup
            key={c.cardId}
            onClick={() => onCitationClick?.(c.cardId)}
            style={{
              fontSize: 10,
              color: 'rgba(10,132,255,0.5)',
              cursor: 'pointer',
              marginLeft: 3,
              fontWeight: 500,
            }}
          >
            {c.label}
          </sup>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/InsightBullet.jsx
git commit -m "feat(insights): add InsightBullet component with citation support"
```

---

## Task 7: Frontend — useInsights Hook

**Files:**
- Create: `frontend/src/hooks/useInsights.js`

**Important:** The hook listens for messages via `window.ankiReceive`. The existing App.jsx `ankiReceive` handler dispatches to various handlers — this hook intercepts messages before they reach App.jsx by adding its own `ankiReceive` wrapper, or by listening to the `CustomEvent`s dispatched in Task 2 (`ankiCardInsightsLoaded`, `ankiCardRevlogLoaded`, `ankiInsightExtractionComplete`).

- [ ] **Step 1: Create `useInsights.js`**

```jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const EMPTY_INSIGHTS = { version: 1, insights: [] };

export default function useInsights() {
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [revlogData, setRevlogData] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentCardId, setCurrentCardId] = useState(null);

  // Load insights for a card
  const loadInsights = useCallback((cardId) => {
    if (!cardId) return;
    setCurrentCardId(cardId);
    window.ankiBridge?.addMessage('getCardInsights', { cardId });
    window.ankiBridge?.addMessage('getCardRevlog', { cardId });
  }, []);

  // Save insights
  const saveInsights = useCallback((cardId, insightsData) => {
    window.ankiBridge?.addMessage('saveCardInsights', {
      cardId,
      insights: insightsData,
    });
  }, []);

  // Trigger extraction
  const extractInsights = useCallback((cardId, cardContext, messages, performanceData) => {
    if (!cardId || !messages?.length) return;
    setIsExtracting(true);

    window.ankiBridge?.addMessage('extractInsights', {
      cardId,
      cardContext,
      messages,
      existingInsights: insights,
      performanceData,
    });
  }, [insights]);

  // Listen for CustomEvent responses from widget.py
  useEffect(() => {
    const onInsightsLoaded = (e) => {
      const data = e.detail;
      if (data?.success) {
        setInsights(data.data || EMPTY_INSIGHTS);
      }
    };

    const onRevlogLoaded = (e) => {
      const data = e.detail;
      if (data?.success) {
        setRevlogData(data.data || []);
      }
    };

    const onExtractionComplete = (e) => {
      const data = e.detail;
      setIsExtracting(false);
      if (data?.success && data.insights) {
        setInsights(data.insights);
      }
    };

    window.addEventListener('ankiCardInsightsLoaded', onInsightsLoaded);
    window.addEventListener('ankiCardRevlogLoaded', onRevlogLoaded);
    window.addEventListener('ankiInsightExtractionComplete', onExtractionComplete);

    return () => {
      window.removeEventListener('ankiCardInsightsLoaded', onInsightsLoaded);
      window.removeEventListener('ankiCardRevlogLoaded', onRevlogLoaded);
      window.removeEventListener('ankiInsightExtractionComplete', onExtractionComplete);
    };
  }, []);

  // Derive chart data from revlog (memoized value, not function)
  const chartData = useMemo(() => {
    if (!revlogData.length) return { main: [], flip: [], mc: [], text: [] };

    // Normalize ease (1-4) to 0-1
    const main = revlogData.map((r) => (r.ease - 1) / 3);

    // TODO: Split by performance_type when review_sections data is available
    return { main, flip: [], mc: [], text: [] };
  }, [revlogData]);

  return {
    insights,
    revlogData,
    chartData,
    isExtracting,
    currentCardId,
    loadInsights,
    saveInsights,
    extractInsights,
    setInsights,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useInsights.js
git commit -m "feat(insights): add useInsights hook for state management"
```

---

## Task 8: Frontend — InsightsDashboard Component

**Files:**
- Create: `frontend/src/components/InsightsDashboard.jsx`

- [ ] **Step 1: Create `InsightsDashboard.jsx`**

Note: The `shimmer` keyframe already exists in the codebase (defined in index.css). No need to add it.

```jsx
import React from 'react';
import InsightBullet from './InsightBullet';
import MiniChart from './MiniChart';

export default function InsightsDashboard({
  insights = { version: 1, insights: [] },
  cardStats = {},
  chartData = { main: [], flip: [], mc: [], text: [] },
  isExtracting = false,
  onCitationClick,
}) {
  const hasInsights = insights.insights?.length > 0;
  const hasStats = (cardStats.reps || 0) > 0;
  const successRate = cardStats.reps
    ? Math.round(((cardStats.reps - (cardStats.lapses || 0)) / cardStats.reps) * 100)
    : 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '28px 24px 140px',
        position: 'relative',
      }}
    >
      {isExtracting && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)',
            animation: 'shimmer 2s infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Erkenntnisse */}
      <div style={{ marginBottom: 36 }}>
        {hasInsights ? (
          <>
            <div style={{ fontSize: 11, color: 'rgba(232,232,232,0.12)', letterSpacing: '0.3px', marginBottom: 20 }}>
              {insights.insights.length} Erkenntnisse gesammelt
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {insights.insights.map((insight, i) => (
                <InsightBullet
                  key={i}
                  text={insight.text}
                  type={insight.type}
                  citations={insight.citations}
                  onCitationClick={onCitationClick}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'rgba(232,232,232,0.15)', lineHeight: 1.5 }}>
            Noch keine Erkenntnisse — starte einen Chat, um Lernpunkte zu sammeln
          </div>
        )}
      </div>

      {/* Stats */}
      <div>
        <div
          style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(232,232,232,0.03), rgba(232,232,232,0.06), rgba(232,232,232,0.03))',
            marginBottom: 14,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'end', gap: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'rgba(232,232,232,0.3)' }}>
                {hasStats ? cardStats.reps : '0'}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', marginTop: 2 }}>REV</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'rgba(232,232,232,0.3)' }}>
                {hasStats ? `${successRate}%` : '—'}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', marginTop: 2 }}>OK</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'rgba(232,232,232,0.3)' }}>
                {hasStats ? `${cardStats.interval || 0}d` : '—'}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(232,232,232,0.1)', marginTop: 2 }}>IVL</div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <MiniChart
              data={chartData.main}
              color="rgba(140,120,200,0.35)"
              fillColor="rgba(140,120,200,0.1)"
              height={36}
              id="main"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <MiniChart data={chartData.flip} color="rgba(20,184,166,0.2)" fillColor="rgba(20,184,166,0.1)" height={24} label="FLIP" id="flip" />
          </div>
          <div style={{ flex: 1 }}>
            <MiniChart data={chartData.mc} color="rgba(10,132,255,0.18)" fillColor="rgba(10,132,255,0.1)" height={24} label="MC" id="mc" />
          </div>
          <div style={{ flex: 1 }}>
            <MiniChart data={chartData.text} color="rgba(249,115,22,0.18)" fillColor="rgba(249,115,22,0.1)" height={24} label="TEXT" id="text" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/InsightsDashboard.jsx
git commit -m "feat(insights): add InsightsDashboard component with stats and charts"
```

---

## Task 9: Frontend — Integration in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:1952-1958` (replace empty state)
- Modify: `frontend/src/App.jsx` (add useInsights hook, card-change extraction, reset flow)

- [ ] **Step 1: Import and initialize**

At the top of `App.jsx`, add import:
```jsx
import InsightsDashboard from './components/InsightsDashboard';
import useInsights from './hooks/useInsights';
```

Inside `AppInner`, initialize the hook alongside other hooks:
```jsx
const insightsHook = useInsights();
```

Add toggle state:
```jsx
const [showInsightsDashboard, setShowInsightsDashboard] = useState(false);
```

- [ ] **Step 2: Load insights on card change + auto-extract previous card**

Find the existing card change handler (where `loadCardSession` is called). Add a ref to track the previous card's state and trigger extraction:

```jsx
const prevCardRef = useRef({ cardId: null, messages: [], cardContext: null });
```

In the card change handler, BEFORE loading the new card's session:
```jsx
// Auto-extract insights from previous card if enough messages
const prev = prevCardRef.current;
if (prev.cardId && prev.messages.length > 0) {
  const userMsgCount = prev.messages.filter(m => m.from === 'user').length;
  if (userMsgCount >= 2 && prev.cardContext) {
    insightsHook.extractInsights(prev.cardId, prev.cardContext, prev.messages, null);
  }
}

// Load new card's insights
insightsHook.loadInsights(newCardId);

// Update ref for next card change
prevCardRef.current = { cardId: newCardId, messages: [], cardContext: cardContextHook.cardContext };
```

Also keep the ref's messages in sync — add an effect:
```jsx
useEffect(() => {
  prevCardRef.current.messages = chatHook.messages;
  prevCardRef.current.cardContext = cardContextHook.cardContext;
}, [chatHook.messages, cardContextHook.cardContext]);
```

- [ ] **Step 3: Replace empty state (lines 1952-1958)**

Replace:
```jsx
{chatHook.messages.length === 0 && !chatHook.isLoading && !chatHook.streamingMessage ? (
  <div className="flex items-center justify-center h-full">
    <p className="text-[13px] text-base-content/20 tracking-tight">
      Stelle eine Frage zur aktuellen Karte.
    </p>
  </div>
```

With:
```jsx
{(chatHook.messages.length === 0 || showInsightsDashboard) && !chatHook.isLoading && !chatHook.streamingMessage ? (
  <InsightsDashboard
    insights={insightsHook.insights}
    cardStats={cardContextHook.cardContext?.stats || {}}
    chartData={insightsHook.chartData}
    isExtracting={insightsHook.isExtracting}
    onCitationClick={(cardId) => bridge.goToCard?.(String(cardId))}
  />
```

Note: `chartData` is now a memoized value (not a function call).

- [ ] **Step 4: Wire up extraction trigger in handleResetChat**

Modify `handleResetChat` (line 1737) to trigger extraction before clearing:
```jsx
const handleResetChat = useCallback(() => {
  if (window.confirm('Möchtest du den Chat wirklich zurücksetzen?')) {
    const userMsgCount = chatHook.messages.filter(m => m.from === 'user').length;
    if (userMsgCount >= 2 && cardContextHook.cardContext?.cardId) {
      insightsHook.extractInsights(
        cardContextHook.cardContext.cardId,
        cardContextHook.cardContext,
        chatHook.messages,
        null
      );
    }
    chatHook.setMessages([]);
    cardContextHook.setSections([]);
    cardContextHook.setCurrentSectionId(null);
  }
}, [chatHook, cardContextHook, insightsHook]);
```

- [ ] **Step 5: Reset toggle when messages clear**

```jsx
useEffect(() => {
  if (chatHook.messages.length === 0) {
    setShowInsightsDashboard(false);
  }
}, [chatHook.messages.length]);
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(insights): integrate InsightsDashboard with card change extraction and reset flow"
```

---

## Task 10: Frontend — Erkenntnisse Toggle in ChatInput

**Files:**
- Modify: `frontend/src/App.jsx` (update actionSecondary prop)

- [ ] **Step 1: Update ChatInput actionSecondary**

Find where `ChatInput` is rendered with `actionSecondary` prop and change the label to toggle dynamically:

```jsx
actionSecondary={{
  label: showInsightsDashboard ? 'Chat' : 'Erkenntnisse',
  shortcut: '↵',
  onClick: () => {
    if (chatHook.messages.length > 0) {
      setShowInsightsDashboard(prev => !prev);
    }
  },
  disabled: chatHook.messages.length === 0,
}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(insights): replace Übersicht with Erkenntnisse toggle"
```

---

## Task 11: Backend — Inject Insights into AI Context

**Files:**
- Modify: `system_prompt.py:43-54` (add insights parameter)
- Modify: `widget.py` (load and pass insights when sending messages)

- [ ] **Step 1: Add insights injection to system prompt**

In `system_prompt.py`, modify `get_system_prompt()` to accept optional insights:

```python
def get_system_prompt(mode='compact', tools=None, insights=None):
    prompt = SYSTEM_PROMPT
    # ... existing tool injection logic ...

    if insights and insights.get('insights'):
        insights_text = "\n".join(
            f"- {'[!] ' if i['type'] == 'weakness' else ''}{i['text']}"
            for i in insights['insights']
        )
        prompt += f"\n\nBISHERIGE ERKENNTNISSE DES NUTZERS ZU DIESER KARTE:\n{insights_text}\n\nBerücksichtige diese Erkenntnisse in deinen Antworten. Gehe besonders auf markierte Schwachpunkte [!] ein."

    return prompt
```

- [ ] **Step 2: Load and pass insights in widget.py sendMessage handler**

In the `sendMessage` handler in `_handle_js_message()`, before creating the `AIRequestThread`, load insights:

```python
from .card_sessions_storage import load_insights
card_id = data.get('cardId')
card_insights = load_insights(int(card_id)) if card_id else None
```

Then pass `card_insights` through to the system prompt construction where `get_system_prompt()` is called.

- [ ] **Step 3: Commit**

```bash
git add system_prompt.py widget.py
git commit -m "feat(insights): inject accumulated insights into AI system prompt"
```

---

## Task 12: Frontend Build & Manual Test

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and test**

Test checklist:
1. Open a card with no chat history → Dashboard shows empty state ("Noch keine Erkenntnisse") with flat chart baselines
2. Open a card with review history but no chats → Stats show real data, insights placeholder
3. Chat with the card (≥2 user messages) → Dashboard disappears, normal chat
4. Reset chat → Shimmer animation, insights appear after extraction
5. Navigate to different card → Previous card's insights extracted automatically
6. Return to same card later → Insights visible in dashboard
7. "Erkenntnisse" toggle during chat → Switches to dashboard view, back preserves scroll
8. Citation click → Navigates to referenced card
9. Stats show correct REV/OK%/IVL values
10. Charts render with correct colors, gradient fills, and grid lines

- [ ] **Step 3: Fix any issues found during testing**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(insights): Card Insights Dashboard complete"
```
