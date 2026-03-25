# Plusi Widget Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign PlusiWidget as a mood-reactive Glow Card with friendship level system and animated mascot header.

**Architecture:** Backend changes add `friendship_delta` to Plusi's AI response, point-based friendship tracking in plusi_storage.py, and friendship data in the frontend payload. Frontend is a complete rewrite of PlusiWidget.jsx with mood-reactive colors, 24px mascot, Varela Round font, and friendship bar footer.

**Tech Stack:** React (JSX), Python (SQLite), Gemini API (system prompt update)

**Spec:** `docs/superpowers/specs/2026-03-19-plusi-widget-redesign.md`

---

### Task 1: Add friendship points to plusi_storage.py

**Files:**
- Modify: `plusi_storage.py:232-248` (replace `increment_interaction_count`)
- Modify: `plusi_storage.py:213-229` (update `build_relationship_context`)

- [ ] **Step 1: Replace `increment_interaction_count` with `apply_friendship_delta`**

Replace the function at line 232 with:

```python
def apply_friendship_delta(delta):
    """Apply AI-decided friendship points and update level.

    Args:
        delta: integer from -3 to +3, decided by Plusi AI
    """
    points = get_memory('relationship', 'friendship_points', 0)
    points = max(0, points + delta)  # never below 0
    set_memory('relationship', 'friendship_points', points)

    # Update level based on points
    if points >= 150:
        level = 4
    elif points >= 50:
        level = 3
    elif points >= 15:
        level = 2
    else:
        level = 1
    set_memory('relationship', 'level', level)

    # Keep interaction count for context
    count = get_memory('relationship', 'interactions', 0)
    set_memory('relationship', 'interactions', count + 1)

    return {'level': level, 'points': points}
```

- [ ] **Step 2: Add `get_friendship_data` function**

Add after `apply_friendship_delta`:

```python
LEVEL_NAMES = {1: 'Fremde', 2: 'Bekannte', 3: 'Freunde', 4: 'Beste Freunde'}
LEVEL_MAX_POINTS = {1: 15, 2: 50, 3: 150, 4: 150}

def get_friendship_data():
    """Get current friendship state for frontend display."""
    points = get_memory('relationship', 'friendship_points', 0)
    level = get_memory('relationship', 'level', 1)
    level_name = LEVEL_NAMES.get(level, 'Fremde')

    if level >= 4:
        max_points = LEVEL_MAX_POINTS[4]
    else:
        max_points = LEVEL_MAX_POINTS.get(level, 15)

    return {
        'level': level,
        'levelName': level_name,
        'points': points,
        'maxPoints': max_points,
    }
```

- [ ] **Step 3: Update `build_relationship_context` to use friendship_points**

Replace the function at line 213 with:

```python
def build_relationship_context():
    """Build relationship context with behavioral guidance per level."""
    rel = get_category('relationship')
    if not rel:
        return "Erster Kontakt. Sei freundlich aber vorsichtig. Lerne den Nutzer kennen."

    level = rel.get('level', 1)
    points = rel.get('friendship_points', 0)

    level_behaviors = {
        1: f"Ihr kennt euch noch nicht ({points} Freundschaftspunkte). Sei offen, stell Fragen, aber dräng dich nicht auf. Kein Sarkasmus.",
        2: f"Ihr seid Bekannte ({points} Punkte). Lockerer Ton erlaubt, erste Insider-Witze okay.",
        3: f"Ihr seid Freunde ({points} Punkte). Sarkasmus, Pushback, eigene Meinungen, Insider referenzieren. Du darfst unbequem sein.",
        4: f"Beste Freunde ({points} Punkte). Komplette Ehrlichkeit. Du hast eine eigene Agenda. Du kannst auch mal Nein sagen oder das Thema wechseln."
    }

    return level_behaviors.get(level, level_behaviors[1])
```

- [ ] **Step 4: Update imports at top of file**

No new imports needed — the file already has everything.

- [ ] **Step 5: Commit**

```bash
git add plusi_storage.py
git commit -m "feat(plusi): replace interaction count with AI-driven friendship points"
```

---

### Task 2: Add friendship_delta to plusi_agent.py

**Files:**
- Modify: `plusi_agent.py:12-14` (update imports)
- Modify: `plusi_agent.py:96-112` (update system prompt TECHNISCH section)
- Modify: `plusi_agent.py:119-145` (update `parse_plusi_response`)
- Modify: `plusi_agent.py:220-236` (update `run_plusi` return + storage calls)

- [ ] **Step 1: Update import to use new function**

In `plusi_agent.py`, replace both import blocks (lines 12-14 and 17-19) — change `increment_interaction_count` to `apply_friendship_delta, get_friendship_data`:

```python
# In try block (line 12-14):
from .plusi_storage import (save_interaction, load_history, build_memory_context,
                            apply_friendship_delta, get_friendship_data,
                            build_internal_state_context,
                            persist_internal_state, build_relationship_context)

# In except block (line 17-19):
from plusi_storage import (save_interaction, load_history, build_memory_context,
                           apply_friendship_delta, get_friendship_data,
                           build_internal_state_context,
                           persist_internal_state, build_relationship_context)
```

- [ ] **Step 2: Add friendship_delta to system prompt**

In `PLUSI_SYSTEM_PROMPT`, update the TECHNISCH section (lines 98-112). Replace with:

```
TECHNISCH:
- Beginne JEDE Antwort mit einem JSON-Block (eine Zeile, kein Markdown-
  Codeblock drumherum):
  {"mood":"<key>", "friendship_delta":<int>, "internal":{...optional...}}
- Erlaubte moods: neutral, happy, blush, sleepy, thinking, surprised,
  excited, empathy, annoyed, curious
- friendship_delta: Ganzzahl von -3 bis +3. Wie sehr hat diese Interaktion
  eure Freundschaft verändert? +1 bis +3 für echte Gespräche, geteilte
  Momente, persönliches. 0 für Small Talk. -1 bis -3 wenn der User lange
  weg war, unhöflich war, oder dich ignoriert hat. Sei ehrlich und nicht zu
  großzügig — Freundschaft muss verdient werden.
- "internal" nutzt du wenn sich was ändert oder du dir was merken willst:
  - "learned": {"key": "wert"} — neues über den User
  - "energy": 1-10 — wie wach/aktiv du gerade bist
  - "obsession": "thema" — was dich gerade beschäftigt
  - "opinion": "text" — deine aktuelle Meinung
  - "relationship_note": "text" — Beobachtung zur Beziehung
  - "opinions": {"key": "wert"} — deine Meinungen
- Schreib "internal" nur wenn sich wirklich was geändert hat. Nicht jedes Mal.
- Der User sieht NUR den Text nach dem JSON-Block. Der JSON-Block ist
  dein privates Innenleben.
```

- [ ] **Step 3: Update `parse_plusi_response` to extract friendship_delta**

Change return type to include `friendship_delta`. Replace the function (lines 119-145):

```python
def parse_plusi_response(raw_text):
    """Parse Plusi response into (mood, text, internal_state, friendship_delta)."""
    clean = raw_text.strip()
    if clean.startswith("```"):
        first_newline = clean.index("\n") if "\n" in clean else len(clean)
        clean = clean[first_newline + 1:]
        if clean.rstrip().endswith("```"):
            clean = clean.rstrip()[:-3]
        clean = clean.strip()

    try:
        decoder = json.JSONDecoder()
        meta, end_idx = decoder.raw_decode(clean)
        mood = meta.get("mood", "neutral")
        if mood not in VALID_MOODS:
            mood = "neutral"
        internal = meta.get("internal", {})
        friendship_delta = meta.get("friendship_delta", 0)
        # Clamp to valid range
        friendship_delta = max(-3, min(3, int(friendship_delta)))
        text = clean[end_idx:].strip()
        return mood, text, internal, friendship_delta
    except (json.JSONDecodeError, ValueError):
        pass

    return "neutral", raw_text.strip(), {}, 0
```

- [ ] **Step 4: Update `run_plusi` to use new functions and return friendship data**

Replace the section after `parse_plusi_response` call (lines 220-236):

```python
        # Parse mood + internal state from response
        mood, text, internal, friendship_delta = parse_plusi_response(raw_text)

        # Persist internal state updates
        if internal:
            persist_internal_state(internal)

        # Apply friendship delta and get current state
        apply_friendship_delta(friendship_delta)
        friendship = get_friendship_data()
        friendship['delta'] = friendship_delta

        # Save to persistent history
        save_interaction(
            context=situation,
            response=text,
            mood=mood,
            deck_id=deck_id,
        )

        print(f"plusi_agent: mood={mood}, delta={friendship_delta}, text_len={len(text)}")
        return {"mood": mood, "text": text, "friendship": friendship, "error": False}
```

- [ ] **Step 5: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): add friendship_delta to AI response format and parsing"
```

---

### Task 3: Update widget.py to pass friendship data to frontend

**Files:**
- Modify: `widget.py:692-702` (update payload in `_handle_plusi_direct`)

- [ ] **Step 1: Update the payload construction**

In `_handle_plusi_direct`, after `result = run_plusi(...)`, update the payload (lines 694-699):

```python
            result = run_plusi(situation=text, deck_id=deck_id)
            mood = result.get('mood', 'neutral')
            friendship = result.get('friendship', {})
            payload = {
                'type': 'plusi_direct_result',
                'mood': mood,
                'text': result.get('text', ''),
                'meta': result.get('meta', ''),
                'friendship': friendship,
                'error': result.get('error', False)
            }
```

- [ ] **Step 2: Commit**

```bash
git add widget.py
git commit -m "feat(plusi): pass friendship data to frontend in plusi response"
```

---

### Task 4: Update App.jsx to pass friendship data through TOOL marker

**Files:**
- Modify: `frontend/src/App.jsx:882-885` (spawn_plusi tool marker)
- Modify: `frontend/src/App.jsx:918-921` (plusi_direct_result marker)

- [ ] **Step 1: Update both TOOL marker constructions to include friendship**

Find the first marker (around line 882):
```javascript
const plusiMarker = `[[TOOL:${JSON.stringify({
  name: "spawn_plusi",
  displayType: "widget",
  result: { mood: payload.mood, text: payload.text, meta: meta, friendship: payload.friendship }
})}]]`;
```

Find the second marker (around line 918):
```javascript
const plusiMarker = `[[TOOL:${JSON.stringify({
  name: "spawn_plusi",
  displayType: "widget",
  result: { mood: result.mood, text: result.text, meta: result.meta, friendship: result.friendship }
})}]]`;
```

- [ ] **Step 2: Update mock in useAnki.js**

In `frontend/src/hooks/useAnki.js` around line 571, update the mock response:

```javascript
window.ankiReceive({
  type: 'plusi_direct_result',
  mood: 'happy',
  text: 'Hey! Das ist eine Mock-Antwort von Plusi.',
  meta: 'freut sich',
  friendship: { level: 2, levelName: 'Bekannte', points: 23, maxPoints: 50, delta: 1 },
  error: false
});
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/App.jsx src/hooks/useAnki.js
git commit -m "feat(plusi): pass friendship data through TOOL markers to PlusiWidget"
```

---

### Task 5: Update ToolWidgetRenderer to pass friendship prop

**Files:**
- Modify: `frontend/src/components/ToolWidgetRenderer.jsx:29-39`

- [ ] **Step 1: Add friendship prop to PlusiWidget render**

```jsx
case 'spawn_plusi':
  return (
    <PlusiWidget
      key={`plusi-${i}`}
      mood={tw.result.mood || 'neutral'}
      text={tw.result.text || ''}
      metaText={tw.result.meta || ''}
      friendship={tw.result.friendship || null}
      isLoading={false}
      isFrozen={!isStreaming && !isLastMessage}
    />
  );
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/components/ToolWidgetRenderer.jsx
git commit -m "feat(plusi): pass friendship prop to PlusiWidget"
```

---

### Task 6: Rewrite PlusiWidget.jsx — Mood-Reactive Glow Card

**Files:**
- Rewrite: `frontend/src/components/PlusiWidget.jsx` (complete replacement)

This is the main visual change. The component gets a complete rewrite.

- [ ] **Step 1: Write the new PlusiWidget.jsx**

Complete replacement of `frontend/src/components/PlusiWidget.jsx`:

```jsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MascotCharacter from './MascotCharacter';

const MOOD_COLORS = {
  happy:     '#34d399',
  empathy:   '#818cf8',
  excited:   '#a78bfa',
  neutral:   '#0a84ff',
  sleepy:    '#6b7280',
  surprised: '#f59e0b',
  blush:     '#f87171',
  thinking:  '#0a84ff',
  annoyed:   '#f87171',
  curious:   '#f59e0b',
};

const MOOD_META = {
  happy:     'freut sich',
  empathy:   'fühlt mit',
  excited:   'aufgeregt',
  neutral:   '',
  sleepy:    'müde',
  surprised: 'überrascht',
  blush:     'verlegen',
  thinking:  'grübelt...',
  annoyed:   'genervt',
  curious:   'neugierig',
};

export default function PlusiWidget({
  mood = 'neutral',
  text = '',
  metaText = '',
  friendship = null,
  isLoading = false,
  isFrozen = false,
}) {
  const color = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
  const resolvedMeta = isLoading ? 'denkt nach...' : metaText || MOOD_META[mood] || '';
  const displayText = isLoading ? 'hmm, moment mal...' : text;
  const textParts = displayText.split('\n---\n');

  // Parse color to rgba components for dynamic styling
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  };
  const rgb = hexToRgb(color);

  const cardStyle = {
    background: `rgba(${rgb}, 0.04)`,
    border: `1px solid rgba(${rgb}, 0.15)`,
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: `0 0 16px rgba(${rgb}, 0.07)`,
    margin: '10px 0 6px',
    transition: 'all 0.3s ease',
    opacity: isFrozen ? 0.55 : 1,
    position: 'relative',
  };

  return (
    <>
      <style>{PLUSI_CSS}</style>
      <div style={cardStyle}>
        {isLoading && <div className="plusi-shimmer" style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(${rgb},0.03) 40%, rgba(${rgb},0.06) 50%, rgba(${rgb},0.03) 60%, transparent 100%)`
        }} />}

        {/* Header: Mascot + Name + Mood */}
        <div className="plusi-header">
          <div className="plusi-mascot">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={48}
              isThinking={isLoading}
              active={false}
            />
          </div>
          <span className="plusi-name" style={{ color: `rgba(${rgb}, 0.7)` }}>
            Plusi
          </span>
          <div style={{ flex: 1 }} />
          {resolvedMeta && (
            <span className="plusi-mood-text" style={{ color: `rgba(${rgb}, 0.4)` }}>
              {resolvedMeta}
            </span>
          )}
          <span
            className="plusi-mood-dot"
            style={{
              background: color,
              boxShadow: `0 0 5px rgba(${rgb}, 0.5)`,
              opacity: resolvedMeta ? 1 : 0.5,
            }}
          />
        </div>

        {/* Body: Text */}
        <div className="plusi-body">
          {isLoading ? (
            <p className="plusi-placeholder">{displayText}</p>
          ) : (
            textParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="plusi-fade" style={{
                  background: `radial-gradient(ellipse at center, rgba(${rgb},0.25) 0%, rgba(${rgb},0.08) 40%, transparent 80%)`
                }} />}
                <div className="plusi-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.trim()}
                  </ReactMarkdown>
                </div>
              </React.Fragment>
            ))
          )}
        </div>

        {/* Footer: Friendship Bar */}
        {friendship && (
          <div className="plusi-footer">
            <div className="plusi-footer-row">
              <div className="plusi-footer-left">
                <span className="plusi-level-name" style={{ color: `rgba(${rgb}, 0.5)` }}>
                  {friendship.levelName}
                </span>
                {friendship.delta > 0 && (
                  <span className="plusi-delta" style={{ color: `rgba(${rgb}, 0.6)` }}>
                    ▲ +{friendship.delta}
                  </span>
                )}
                {friendship.delta < 0 && (
                  <span className="plusi-delta" style={{ color: `rgba(${rgb}, 0.55)` }}>
                    ▼ {friendship.delta}
                  </span>
                )}
              </div>
              <span className="plusi-points">
                {friendship.level >= 4 ? '★ Max' : `${friendship.points} / ${friendship.maxPoints}`}
              </span>
            </div>
            <div className="plusi-bar-bg">
              <div
                className="plusi-bar-fill"
                style={{
                  width: friendship.level >= 4
                    ? '100%'
                    : `${Math.min(100, (friendship.points / friendship.maxPoints) * 100)}%`,
                  background: friendship.level >= 4
                    ? `linear-gradient(90deg, rgba(${rgb},0.5), rgba(${rgb},0.7))`
                    : `rgba(${rgb}, 0.5)`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const PLUSI_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Varela+Round&display=swap');

  .plusi-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 11px 7px;
  }

  .plusi-mascot {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    position: relative;
    overflow: visible;
  }
  .plusi-mascot > * {
    transform: scale(0.5);
    transform-origin: top left;
  }
  .plusi-mascot .mascot-shadow { display: none !important; }

  .plusi-name {
    font-size: 11px;
    font-weight: 600;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-mood-text {
    font-size: 9px;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-mood-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .plusi-body {
    padding: 2px 11px 9px;
  }

  .plusi-markdown {
    font-family: 'Varela Round', -apple-system, sans-serif;
    color: rgba(232,232,232,0.72);
  }
  .plusi-markdown p {
    font-size: 14px;
    line-height: 1.65;
    margin: 0 0 0.5em;
  }
  .plusi-markdown p:last-child { margin-bottom: 0; }
  .plusi-markdown strong { color: rgba(232,232,232,0.9); font-weight: 600; }
  .plusi-markdown em { color: rgba(180,210,255,0.7); }
  .plusi-markdown code {
    background: rgba(0,0,0,0.25);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .plusi-markdown a { color: rgba(10,132,255,0.8); text-decoration: none; }

  .plusi-fade {
    height: 1px;
    margin: 8px 0;
  }

  .plusi-placeholder {
    font-size: 12px;
    color: rgba(154,154,154,0.35);
    font-style: italic;
    margin: 0;
    font-family: 'Varela Round', -apple-system, sans-serif;
    position: relative;
    z-index: 2;
  }

  .plusi-footer {
    padding: 6px 11px 7px;
    background: rgba(0,0,0,0.15);
    border-top: 1px solid rgba(255,255,255,0.04);
  }

  .plusi-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .plusi-footer-left {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .plusi-level-name {
    font-size: 9px;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-delta {
    font-size: 8px;
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-points {
    font-size: 8px;
    color: rgba(255,255,255,0.15);
    font-family: 'Varela Round', -apple-system, sans-serif;
  }

  .plusi-bar-bg {
    height: 2px;
    background: rgba(255,255,255,0.06);
    border-radius: 1px;
    overflow: hidden;
  }

  .plusi-bar-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.5s ease;
  }

  .plusi-shimmer {
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    animation: plusi-shimmer 2.5s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes plusi-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
`;
```

- [ ] **Step 2: Build frontend and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/PlusiWidget.jsx
git commit -m "feat(plusi): rewrite PlusiWidget as mood-reactive Glow Card with friendship bar"
```

---

### Task 7: Build, test in Anki, and fix issues

**Files:**
- Potentially any of the above files for bug fixes

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and test**

Test checklist:
1. Open Anki, go to deck browser
2. Type `@Plusi hi` in the chat input
3. Verify: Glow Card appears with blue border (neutral mood)
4. Verify: 24px mascot shows in header with correct expression
5. Verify: Varela Round font is used for Plusi text
6. Verify: Friendship footer shows level name + progress bar
7. Verify: Text size matches regular chat messages (14px)
8. Type `@Plusi ich hab heute 200 karten gemacht!`
9. Verify: Card changes color based on mood (e.g., green for happy)
10. Verify: Delta indicator (▲ +N) appears in footer
11. Verify: Dock mascot in bottom-left mirrors the mood

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(plusi): widget redesign polish and bug fixes"
```
