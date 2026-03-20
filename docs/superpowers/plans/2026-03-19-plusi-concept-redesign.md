# Plusi Concept Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Plusi as a unified companion — new chat widget style, dock with context menu + event bubbles, @Plusi direct messaging, and mood sync between dock and chat.

**Architecture:** PlusiWidget gets a visual redesign (rectangular, header with mood-right). MascotShell replaces CompanionCard with context menu + event bubble. A new `plusiDirect` bridge handler replaces the old `companionChat` flow, routing all Plusi AI through `plusi_agent.py`. Frontend detects `@Plusi` prefix and routes accordingly.

**Tech Stack:** React 18, Space Grotesk font, inline CSS-in-JS, Python/Qt bridge, Gemini Flash API

**Spec:** `docs/superpowers/specs/2026-03-19-plusi-concept-redesign.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/components/PlusiWidget.jsx` | Redesign: rectangular, header mood-right, fade divider, frozen state |
| Modify | `frontend/src/components/MascotShell.jsx` | Replace CompanionCard with context menu + event bubble |
| Delete | `frontend/src/components/CompanionCard.jsx` | No longer needed |
| Create | `frontend/src/hooks/usePlusiDirect.js` | @Plusi direct message hook |
| Delete | `frontend/src/hooks/useCompanion.js` | Replaced by usePlusiDirect |
| Modify | `frontend/src/hooks/useMascot.js` | Add event-mood 4s timeout |
| Modify | `shared/components/ChatInput.tsx` | @Plusi tag overlay highlighting |
| Modify | `frontend/src/App.jsx` | Wire @Plusi routing, event triggers, remove companion refs |
| Modify | `frontend/src/components/ChatMessage.jsx` | Multi-plusi parsing + freeze logic |
| Modify | `frontend/src/hooks/useAnki.js` | Remove companionChat, add plusiDirect bridge method |
| Modify | `widget.py` | Add `plusiDirect` handler, remove `companionChat` handler |
| Modify | `plusi_agent.py` | Fix relationship level prompt (days → interaction count) |
| Modify | `card_tracker.py` or `__init__.py` | Emit `cardResult` event to frontend |

**Task ordering note:** Tasks 3 (MascotShell) and 4 (usePlusiDirect) delete files imported by App.jsx. Do NOT run `npm run build` between Tasks 3-7. Tasks 3, 4, and 7 must be completed together before building.

---

### Task 1: Fix Backend — Relationship Levels + plusiDirect Handler

**Files:**
- Modify: `plusi_agent.py:56-60` (system prompt)
- Modify: `widget.py:651-722` (replace companionChat with plusiDirect)

- [ ] **Step 1: Fix relationship level references in plusi_agent.py**

In `plusi_agent.py`, find the PLUSI_SYSTEM_PROMPT string. Replace the day-based levels with interaction-based levels to match `plusi_storage.py` logic (levels at 10, 30, 100 interactions):

```python
# Replace lines ~56-60 in PLUSI_SYSTEM_PROMPT:
# OLD:
# - Level 1 (Fremde, Tag 1-3): ...
# - Level 2 (Bekannte, Tag 4-14): ...
# - Level 3 (Freunde, Tag 15-30): ...
# - Level 4 (Beste Freunde, 30+): ...

# NEW:
# - Level 1 (Fremde, 0-9 Interaktionen): Sei freundlich aber vorsichtig, lerne den Nutzer kennen
# - Level 2 (Bekannte, 10-29 Interaktionen): Lockerer, erste Insider-Witze erlaubt, stell Fragen
# - Level 3 (Freunde, 30-99 Interaktionen): Sarkasmus, Pushback, eigene Meinungen, Insider referenzieren
# - Level 4 (Beste Freunde, 100+): Komplette Ehrlichkeit, eigene Agenda, kannst auch mal Nein sagen
```

- [ ] **Step 2: Add plusiDirect handler in widget.py**

Replace the `companionChat` handler (lines 651-722) with a `plusiDirect` handler:

```python
# In _handle_js_message(), replace the companionChat block:
elif msg_type == 'plusiDirect':
    text = data.get('text', '') if isinstance(data, dict) else str(data)
    deck_id = data.get('deck_id', None) if isinstance(data, dict) else None
    self._handle_plusi_direct(text, deck_id)

# Replace _handle_companion_chat with:
def _handle_plusi_direct(self, text: str, deck_id=None):
    """Route @Plusi messages directly to plusi_agent.py"""
    try:
        from plusi_agent import run_plusi
        result = run_plusi(situation=text, deck_id=deck_id)
        # result = {mood, text, error?}
        payload = {
            'type': 'plusi_direct_result',
            'mood': result.get('mood', 'neutral'),
            'text': result.get('text', ''),
            'meta': result.get('meta', ''),
            'error': result.get('error', False)
        }
        self._send_to_js(payload)
    except Exception as e:
        self._send_to_js({
            'type': 'plusi_direct_result',
            'mood': 'neutral',
            'text': '',
            'error': True
        })
```

- [ ] **Step 3: Delete the old CompanionThread class and _handle_companion_chat method**

Remove the `CompanionThread` QThread subclass (lines ~673-707) and the `_handle_companion_chat` method (lines ~658-722). These are fully replaced.

- [ ] **Step 4: Verify plusi_agent.py runs correctly**

Test by importing and calling from Python console:
```python
from plusi_agent import run_plusi
result = run_plusi("test nachricht")
print(result)  # Should return {mood: "...", text: "...", ...}
```

- [ ] **Step 5: Commit**

```bash
git add plusi_agent.py widget.py
git commit -m "feat(plusi): add plusiDirect handler, fix relationship levels, remove companionChat"
```

---

### Task 2: Redesign PlusiWidget

**Files:**
- Modify: `frontend/src/components/PlusiWidget.jsx` (full rewrite of CSS + layout)

- [ ] **Step 1: Rewrite PlusiWidget component**

Replace the entire file with the new design. Key changes:
- Rectangular (no border-radius, no border-left stripe)
- Header: character 24px left, name left, mood text + dot RIGHT
- Fade divider for multi-actions
- Colors use `#0a84ff` (app accent) not `#007AFF`
- Frozen state: opacity 0.55, no animation

```jsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MascotCharacter from './MascotCharacter';

const MOOD_DOT_COLORS = {
  happy: '#34d399',
  empathy: '#818cf8',
  excited: '#a78bfa',
  neutral: '#0a84ff',
  sleepy: '#6b7280',
  surprised: '#f59e0b',
  blush: '#f87171',
  thinking: '#0a84ff',
};

const MOOD_META = {
  happy: 'freut sich',
  empathy: 'fühlt mit',
  excited: 'aufgeregt',
  neutral: '',
  sleepy: 'müde',
  surprised: 'überrascht',
  blush: 'verlegen',
  thinking: 'grübelt...',
};

export default function PlusiWidget({ mood = 'neutral', text = '', metaText = '', isLoading = false, isFrozen = false }) {
  const dotColor = MOOD_DOT_COLORS[mood] || MOOD_DOT_COLORS.neutral;
  const resolvedMeta = isLoading ? 'denkt nach...'
    : metaText || MOOD_META[mood] || '';
  const displayText = isLoading ? 'hmm, moment mal...' : text;

  // Split text by fade divider marker if multi-action
  const textParts = displayText.split('\n---\n');

  return (
    <>
      <style>{PLUSI_CSS}</style>
      <div
        className="plusi-w"
        style={isFrozen ? { opacity: 0.55 } : undefined}
      >
        {isLoading && <div className="plusi-w-shimmer" />}

        {/* Header */}
        <div className="plusi-w-header">
          <div className="plusi-w-char">
            <MascotCharacter
              mood={isLoading ? 'thinking' : mood}
              size={24}
              isThinking={isLoading}
              active={false}
            />
          </div>
          <span className="plusi-w-name">Plusi</span>
          <div className="plusi-w-spacer" />
          {resolvedMeta && (
            <div className="plusi-w-mood">
              <span className="plusi-w-mood-text">{resolvedMeta}</span>
              <span
                className="plusi-w-mood-dot"
                style={{ background: dotColor, boxShadow: `0 0 3px ${dotColor}4D` }}
              />
            </div>
          )}
          {!resolvedMeta && (
            <span
              className="plusi-w-mood-dot"
              style={{ background: dotColor, opacity: 0.4 }}
            />
          )}
        </div>

        {/* Content */}
        <div className="plusi-w-content">
          {isLoading ? (
            <p className="plusi-w-placeholder">{displayText}</p>
          ) : (
            textParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="plusi-w-fade" />}
                <div className="plusi-w-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.trim()}
                  </ReactMarkdown>
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const PLUSI_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .plusi-w {
    margin: 10px 0 6px;
    background: rgba(10,132,255,.04);
    overflow: hidden;
    transition: opacity 0.3s ease;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    position: relative;
  }

  .plusi-w-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 5px;
    background: rgba(10,132,255,.06);
  }

  .plusi-w-char {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    position: relative;
    overflow: visible;
  }
  .plusi-w-char .mascot-shadow { display: none !important; }

  .plusi-w-name {
    font-size: 12px;
    font-weight: 600;
    color: rgba(10,132,255,.55);
    letter-spacing: 0.02em;
  }

  .plusi-w-spacer { flex: 1; }

  .plusi-w-mood {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .plusi-w-mood-text {
    font-size: 10px;
    color: rgba(154,154,154,.45);
  }

  .plusi-w-mood-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .plusi-w-content {
    padding: 7px 12px 9px;
  }

  .plusi-w-markdown {
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    color: rgba(232,232,232,.72);
  }
  .plusi-w-markdown p {
    font-size: 13px;
    line-height: 1.6;
    margin: 0 0 0.5em;
  }
  .plusi-w-markdown p:last-child { margin-bottom: 0; }
  .plusi-w-markdown strong { color: rgba(232,232,232,.9); font-weight: 600; }
  .plusi-w-markdown em { color: rgba(180,210,255,.7); }
  .plusi-w-markdown code {
    background: rgba(0,0,0,.25);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .plusi-w-markdown a { color: rgba(10,132,255,.8); text-decoration: none; }

  /* Fade divider between multi-actions */
  .plusi-w-fade {
    height: 1px;
    margin: 8px 0;
    background: radial-gradient(
      ellipse at center,
      rgba(10,132,255,.25) 0%,
      rgba(10,132,255,.08) 40%,
      transparent 80%
    );
  }

  /* Loading shimmer */
  .plusi-w-shimmer {
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(10,132,255,.03) 40%,
      rgba(10,132,255,.06) 50%,
      rgba(10,132,255,.03) 60%,
      transparent 100%);
    animation: plusi-shimmer 2.5s ease-in-out infinite;
    pointer-events: none;
    z-index: 1;
  }
  @keyframes plusi-shimmer { 0% { left: -100%; } 100% { left: 100%; } }

  .plusi-w-placeholder {
    font-size: 12px;
    color: rgba(154,154,154,.35);
    font-style: italic;
    margin: 0;
    position: relative;
    z-index: 2;
  }
`;
```

- [ ] **Step 2: Build frontend and verify visually**

```bash
cd frontend && npm run build
```

Restart Anki, send a message that triggers `spawn_plusi`, verify:
- Rectangular shape, no left border stripe
- Header: Plusi character 24px left, mood text + dot right
- Loading state shows shimmer + "hmm, moment mal..."

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlusiWidget.jsx
git commit -m "feat(plusi): redesign PlusiWidget — rectangular, mood-right header, fade divider"
```

---

### Task 3: Rewrite MascotShell — Context Menu + Event Bubble

**Files:**
- Modify: `frontend/src/components/MascotShell.jsx` (full rewrite)
- Delete: `frontend/src/components/CompanionCard.jsx`

- [ ] **Step 1: Rewrite MascotShell.jsx**

Replace the entire component. New design: dock row with Plusi left, context menu OR event bubble right. Both share parent animation container.

```jsx
import React, { useState, useEffect, useRef } from 'react';
import MascotCharacter from './MascotCharacter';

const EVENT_REACTIONS = {
  card_correct:  { text: 'Richtig! ✨', mood: 'happy' },
  card_wrong:    { text: 'nächstes mal 💪', mood: 'empathy' },
  streak_5:     { text: 'Super, 5 richtig! 🔥', mood: 'happy' },
  streak_10:    { text: '10er streak!! du bist on fire 🔥🔥', mood: 'excited' },
};

export default function MascotShell({ mood = 'neutral', onPlusiAsk, onOpenSettings, onEvent, enabled = true }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [eventBubble, setEventBubble] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const eventTimerRef = useRef(null);
  const menuRef = useRef(null);

  // Auto-dismiss event bubble after 4s
  useEffect(() => {
    if (eventBubble) {
      eventTimerRef.current = setTimeout(() => setEventBubble(null), 4000);
      return () => clearTimeout(eventTimerRef.current);
    }
  }, [eventBubble]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Expose triggerEvent for parent
  useEffect(() => {
    if (onEvent) {
      onEvent.current = (eventType) => {
        const reaction = EVENT_REACTIONS[eventType];
        if (reaction && !menuOpen) {
          setEventBubble(reaction);
        }
      };
    }
  }, [onEvent, menuOpen]);

  if (!enabled) return null;

  const handleClick = () => {
    setTapKey(k => k + 1);
    setMenuOpen(prev => !prev);
    setEventBubble(null); // Close bubble when opening menu
  };

  const handlePlusiAsk = () => {
    setMenuOpen(false);
    onPlusiAsk?.();
  };

  const handleSettings = () => {
    setMenuOpen(false);
    onOpenSettings?.();
  };

  // Determine animation class for sync
  const animClass = mood === 'happy' || mood === 'excited' ? 'plusi-dock-bounce'
    : mood === 'empathy' ? 'plusi-dock-droop'
    : 'plusi-dock-float';

  return (
    <>
      <style>{DOCK_CSS}</style>
      <div className={`plusi-dock ${animClass}`} ref={menuRef}>
        {/* Plusi character */}
        <div
          className="plusi-dock-char"
          onClick={handleClick}
          title={menuOpen ? 'Menü schließen' : 'Plusi-Menü'}
        >
          <MascotCharacter
            mood={eventBubble ? eventBubble.mood : mood}
            size={48}
            tapKey={tapKey}
            active={menuOpen}
          />
        </div>

        {/* Context menu OR event bubble — never both */}
        {menuOpen && (
          <div className="plusi-dock-menu">
            <div className="plusi-menu-item plusi-menu-accent" onClick={handlePlusiAsk}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>Plusi fragen</span>
            </div>
            <div className="plusi-menu-sep" />
            <div className="plusi-menu-item" onClick={handleSettings}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Einstellungen</span>
            </div>
          </div>
        )}

        {!menuOpen && eventBubble && (
          <div className="plusi-dock-bubble">
            {eventBubble.text}
          </div>
        )}
      </div>
    </>
  );
}

const DOCK_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap');

  .plusi-dock {
    position: fixed;
    bottom: 104px;
    left: 12px;
    z-index: 60;
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  /* Parent animation — children inherit the movement */
  .plusi-dock-float  { animation: pd-float 3.5s ease-in-out infinite; }
  .plusi-dock-bounce { animation: pd-bounce 0.55s ease-in-out infinite alternate; }
  .plusi-dock-droop  { animation: pd-droop 4s ease-in-out infinite; }

  @keyframes pd-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  @keyframes pd-bounce { 0%{transform:translateY(0)} 100%{transform:translateY(-6px)} }
  @keyframes pd-droop  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(2px)} }

  .plusi-dock-char {
    cursor: pointer;
    flex-shrink: 0;
    width: 48px;
  }

  /* ── Shared glass style for menu + bubble ── */
  .plusi-dock-menu,
  .plusi-dock-bubble {
    background: rgba(18,18,18,.94);
    border: none;
    border-radius: 10px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow:
      -4px 0 12px rgba(10,132,255,.06),
      0 4px 16px rgba(0,0,0,.35),
      0 0 0 0.5px rgba(255,255,255,.04) inset;
    animation: pd-card-in 0.25s cubic-bezier(0.34,1.1,0.64,1);
    align-self: center;
  }
  @keyframes pd-card-in {
    0% { opacity: 0; transform: translateX(-4px) scale(0.96); }
    100% { opacity: 1; transform: translateX(0) scale(1); }
  }

  /* ── Context menu ── */
  .plusi-dock-menu {
    padding: 3px;
    min-width: 130px;
  }

  .plusi-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 7px;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 12.5px;
    color: rgba(232,232,232,.7);
    font-family: -apple-system, sans-serif;
  }
  .plusi-menu-item:hover { background: rgba(10,132,255,.08); }
  .plusi-menu-item svg { opacity: 0.4; flex-shrink: 0; }
  .plusi-menu-accent { color: rgba(10,132,255,.8); font-weight: 500; }
  .plusi-menu-accent svg { opacity: 0.65; color: #0a84ff; }

  .plusi-menu-sep {
    height: 1px;
    margin: 2px 6px;
    background: radial-gradient(ellipse at center, rgba(255,255,255,.05) 0%, transparent 75%);
  }

  /* ── Event bubble ── */
  .plusi-dock-bubble {
    padding: 6px 11px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    color: rgba(232,232,232,.72);
    line-height: 1.45;
    background: rgba(10,132,255,.05);
  }
`;
```

- [ ] **Step 2: Delete CompanionCard.jsx**

```bash
rm frontend/src/components/CompanionCard.jsx
```

**Note:** Do NOT build yet. App.jsx still imports useCompanion and references companionMode. Complete Tasks 4 and 7 first.

- [ ] **Step 3: Commit (without building)**

```bash
git add frontend/src/components/MascotShell.jsx
git rm frontend/src/components/CompanionCard.jsx
git commit -m "feat(plusi): rewrite MascotShell — context menu + event bubble, delete CompanionCard"
```

---

### Task 4: Create usePlusiDirect Hook + Remove useCompanion

**Files:**
- Create: `frontend/src/hooks/usePlusiDirect.js`
- Delete: `frontend/src/hooks/useCompanion.js`

- [ ] **Step 1: Create usePlusiDirect.js**

Simple hook that sends `plusiDirect` bridge message and handles the response:

```jsx
import { useState, useCallback } from 'react';

export function usePlusiDirect() {
  const [isLoading, setIsLoading] = useState(false);

  const sendDirect = useCallback((text, deckId = null) => {
    if (!text?.trim() || !window.ankiBridge) return;
    setIsLoading(true);
    window.ankiBridge.addMessage('plusiDirect', {
      text: text.trim(),
      deck_id: deckId,
    });
  }, []);

  // Called by App.jsx when plusi_direct_result event arrives
  const handleResult = useCallback((data) => {
    setIsLoading(false);
    return {
      mood: data.mood || 'neutral',
      text: data.text || '',
      meta: data.meta || '',
      error: data.error || false,
    };
  }, []);

  return { sendDirect, handleResult, isLoading };
}
```

- [ ] **Step 2: Delete useCompanion.js**

```bash
rm frontend/src/hooks/useCompanion.js
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePlusiDirect.js
git rm frontend/src/hooks/useCompanion.js
git commit -m "feat(plusi): add usePlusiDirect hook, remove useCompanion"
```

---

### Task 5: Update useMascot — Event-Mood 4s Timeout

**Files:**
- Modify: `frontend/src/hooks/useMascot.js`

- [ ] **Step 1: Add event-mood timeout**

Current `setEventMood` is sticky (no timeout). Add a 4s auto-revert:

```jsx
import { useState, useRef, useCallback } from 'react';

export function useMascot() {
  const [mood, setMood] = useState('neutral');
  const eventMoodRef = useRef('neutral');
  const aiMoodRef = useRef(null);
  const aiTimerRef = useRef(null);
  const eventTimerRef = useRef(null);

  const resolveMood = useCallback(() => {
    if (aiMoodRef.current) return aiMoodRef.current;
    if (eventMoodRef.current && eventMoodRef.current !== 'neutral') return eventMoodRef.current;
    return 'neutral';
  }, []);

  const setEventMood = useCallback((newMood) => {
    eventMoodRef.current = newMood;
    setMood(resolveMood());

    // Auto-revert event mood after 4s
    clearTimeout(eventTimerRef.current);
    if (newMood !== 'neutral') {
      eventTimerRef.current = setTimeout(() => {
        eventMoodRef.current = 'neutral';
        setMood(resolveMood());
      }, 4000);
    }
  }, [resolveMood]);

  const setAiMood = useCallback((newMood) => {
    aiMoodRef.current = newMood;
    setMood(newMood);

    // Auto-revert AI mood after 30s
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      aiMoodRef.current = null;
      setMood(resolveMood());
    }, 30000);
  }, [resolveMood]);

  const resetMood = useCallback(() => {
    clearTimeout(aiTimerRef.current);
    clearTimeout(eventTimerRef.current);
    aiMoodRef.current = null;
    eventMoodRef.current = 'neutral';
    setMood('neutral');
  }, []);

  return { mood, setEventMood, setAiMood, resetMood };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useMascot.js
git commit -m "feat(plusi): add 4s event-mood timeout, refactor mood priority resolution"
```

---

### Task 6: @Plusi Tag Highlighting in ChatInput

**Files:**
- Modify: `shared/components/ChatInput.tsx`

- [ ] **Step 1: Add @Plusi overlay highlighting**

Add an overlay div behind the textarea that renders `@Plusi` as a styled span. The textarea stays plain text with transparent text color only for the `@Plusi` portion.

In `ChatInput.tsx`, add:

1. A state to track if message starts with `@Plusi`:
```tsx
const hasPlusiTag = message.trim().startsWith('@Plusi');
```

2. An overlay div positioned absolutely behind the textarea:
```tsx
{/* @Plusi tag overlay — positioned behind transparent textarea */}
<div className="plusi-tag-overlay" aria-hidden="true"
  style={{
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    padding: '10px 14px', /* must match textarea padding exactly — check ChatInput's textarea styles */
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    font: 'inherit',
    lineHeight: 'inherit',
    color: 'transparent',
    overflow: 'hidden',
  }}
>
  {hasPlusiTag && (
    <>
      <span style={{
        background: 'rgba(10,132,255,.18)',
        color: '#0a84ff',
        padding: '1px 6px',
        borderRadius: '4px',
        fontWeight: 600,
        fontSize: '13px',
        fontFamily: "'Space Grotesk', sans-serif",
      }}>@Plusi</span>
      <span style={{ color: 'transparent' }}>{message.slice(6)}</span>
    </>
  )}
  {!hasPlusiTag && <span style={{ color: 'transparent' }}>{message}</span>}
</div>
```

3. Remove the `companionMode` prop references (purple border, etc.) as companion mode is removed.

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

Type `@Plusi` in chat input — should show blue highlighted tag. Type normal text — no highlight.

- [ ] **Step 3: Commit**

```bash
git add shared/components/ChatInput.tsx
git commit -m "feat(plusi): add @Plusi tag overlay highlighting in ChatInput"
```

---

### Task 7: Wire Everything in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/ChatMessage.jsx` (freeze logic)

- [ ] **Step 1: Remove useCompanion imports and companion mode state**

In `App.jsx`:
- Remove `import { useCompanion } from './hooks/useCompanion'`
- Remove `import MascotShell from './components/MascotShell'` — re-add with new props
- Remove all `companionMode`, `bubbleText`, `companionIsLoading` state
- Remove `sendToCompanion`, `handleCompanionChunk` references
- Remove companion-related event handlers (Escape key companion exit, etc.)

- [ ] **Step 2: Add usePlusiDirect + rewired MascotShell**

```jsx
import { usePlusiDirect } from './hooks/usePlusiDirect';
import MascotShell from './components/MascotShell';

// In AppInner():
const { sendDirect: sendPlusiDirect, handleResult: handlePlusiResult, isLoading: plusiDirectLoading } = usePlusiDirect();
const eventTriggerRef = useRef(null);

// @Plusi message detection — intercept before normal send
const handleSend = useCallback((text) => {
  if (text.trim().startsWith('@Plusi')) {
    const plusiText = text.trim().slice(6).trim(); // Remove "@Plusi" prefix
    if (plusiText) {
      // Add user message to chat
      addMessage({ from: 'user', message: text, timestamp: Date.now() });
      sendPlusiDirect(plusiText, currentDeckId);
    }
    return;
  }
  // ... existing send logic
}, [sendPlusiDirect, currentDeckId]);

// Handle plusi_direct_result from backend
// In the ankiReceive handler:
if (payload.type === 'plusi_direct_result') {
  const result = handlePlusiResult(payload);
  if (!result.error) {
    addMessage({
      from: 'bot',
      message: `[[PLUSI_DATA: ${JSON.stringify({ mood: result.mood, text: result.text, meta: result.meta })}]]`,
      timestamp: Date.now(),
      isPlusiDirect: true,
    });
    setAiMood(result.mood);
  }
}
```

- [ ] **Step 3: Add event triggers for MascotShell**

```jsx
// Streak counter state
const [streak, setStreak] = useState(0);

// In ankiReceive handler, add cardResult handling:
if (payload.type === 'cardResult') {
  if (payload.correct) {
    const newStreak = streak + 1;
    setStreak(newStreak);
    setEventMood('happy');
    if (newStreak === 5) eventTriggerRef.current?.('streak_5');
    else if (newStreak === 10) eventTriggerRef.current?.('streak_10');
  } else {
    setStreak(0);
    setEventMood('empathy');
    eventTriggerRef.current?.('card_wrong');
  }
}
```

- [ ] **Step 4: Wire MascotShell with new props**

```jsx
<MascotShell
  mood={mood}
  onPlusiAsk={() => {
    // Insert @Plusi into chat input
    setInputValue('@Plusi ');
    // Focus the input
    inputRef.current?.focus();
  }}
  onOpenSettings={() => setShowProfile(true)}
  onEvent={eventTriggerRef}
  enabled={mascotEnabled}
/>
```

- [ ] **Step 5: Update ChatMessage.jsx — multi-plusi parsing + freeze logic**

In `ChatMessage.jsx`, the current Plusi data parsing (line ~1398) only matches the FIRST `[[PLUSI_DATA:...]]` via `.match()`. Update to support multiple markers via `.matchAll()`:

```jsx
// Replace the single plusiMatch (line ~1399) with multi-match:
const plusiMatches = [...fixedMessage.matchAll(/\[\[PLUSI_DATA:\s*(\{[\s\S]*?\})\s*\]\]/g)];
const plusiDataList = plusiMatches.map(m => {
  try { return JSON.parse(m[1]); } catch { return null; }
}).filter(Boolean);
```

Add `isLastMessage` to the ChatMessage function signature:
```jsx
function ChatMessage({ message, from, ..., isLastMessage = false }) {
```

Update the PlusiWidget render (~line 1708) to render ALL parsed widgets:
```jsx
{plusiDataList.length > 0 && plusiDataList.map((pd, idx) => (
    <PlusiWidget
        key={idx}
        mood={pd._loading ? 'thinking' : (pd.mood || 'neutral')}
        text={pd.text || ''}
        metaText={pd.meta || ''}
        isLoading={!!pd._loading}
        isFrozen={!isStreaming && (!isLastMessage || idx < plusiDataList.length - 1)}
    />
))}
```

Also update the `processedMessage` cleanup to strip ALL markers (already uses `/g` flag at line ~1510 — verify).

In `App.jsx` where messages are mapped, pass `isLastMessage` to ChatMessage:
```jsx
<ChatMessage
  key={msg.id}
  {...msg}
  isLastMessage={i === messages.length - 1}
/>
```

- [ ] **Step 6: Build and test end-to-end**

```bash
cd frontend && npm run build
```

Test in Anki:
1. Normal message → Tutor responds, may spawn Plusi widget
2. Type `@Plusi wie geht's?` → Blue tag shown, Plusi responds standalone
3. Click dock Plusi → Menu appears, "Plusi fragen" inserts @Plusi
4. Answer cards → Dock Plusi reacts with event bubbles
5. Old Plusi widgets are frozen (no animation, lower opacity)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ChatMessage.jsx
git commit -m "feat(plusi): wire @Plusi routing, event triggers, freeze logic in App + ChatMessage"
```

---

### Task 8: Emit cardResult Events from Python

**Files:**
- Modify: `__init__.py` (hook handler for reviewer_did_show_question)

- [ ] **Step 1: Add cardResult event emission**

In `__init__.py`, the `reviewer_did_show_question` hook already fires when a card is shown (which means the previous card was answered). Find the hook handler and add a `cardResult` event emission to the frontend.

Look for the existing handler that tracks card answers. After the answer is processed, emit:

```python
# After determining if the previous card was answered correctly:
if hasattr(mw, '_chatbot_widget') and mw._chatbot_widget:
    payload = json.dumps({'type': 'cardResult', 'correct': was_correct})
    mw._chatbot_widget.web_view.page().runJavaScript(
        f"window.ankiReceive({payload});"
    )
```

The `was_correct` value can be derived from Anki's reviewer state — check `mw.reviewer.card` and the ease/answer that was given. If `card_tracker.py` already tracks this, reuse its logic.

- [ ] **Step 2: Verify in Anki**

Answer a card in Anki, check browser console for `cardResult` event arriving.

- [ ] **Step 3: Commit**

```bash
git add __init__.py
git commit -m "feat(plusi): emit cardResult events to frontend for dock reactions"
```

---

### Task 9: Cleanup + Final Build

**Files:**
- Modify: `frontend/src/hooks/useAnki.js` (remove companionChat, add plusiDirect)
- Various cleanup across modified files

- [ ] **Step 1: Update useAnki.js**

In `frontend/src/hooks/useAnki.js`, find the `companionChat` bridge method definition (~lines 405-408 and 567-568). Remove it. Optionally add a `plusiDirect` method, though `usePlusiDirect.js` calls `window.ankiBridge.addMessage()` directly.

- [ ] **Step 2: Search for stale companion references**

```bash
grep -r "companionChat\|useCompanion\|CompanionCard\|companionMode\|SpeechBubble" frontend/src/ shared/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts"
```

Remove any remaining imports or references found.

- [ ] **Step 2: Search for stale Python companion references**

```bash
grep -r "companionChat\|companion_chat\|CompanionThread" *.py
```

Remove any remaining handlers or references.

- [ ] **Step 3: Final build + smoke test**

```bash
cd frontend && npm run build
```

Restart Anki and verify:
- [ ] PlusiWidget renders correctly with new design
- [ ] Dock Plusi shows context menu on click
- [ ] @Plusi direct messages work
- [ ] Event bubbles appear on card correct/wrong
- [ ] Mood syncs between chat widgets and dock
- [ ] Old widgets are frozen
- [ ] No console errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(plusi): cleanup stale companion references"
```
