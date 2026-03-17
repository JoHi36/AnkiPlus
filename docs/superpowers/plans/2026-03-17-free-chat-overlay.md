# Free Chat Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a card-independent free chat accessible from the Stapel tab via an animated search bar that overlays the deck list.

**Architecture:** A new `useFreeChat` hook in AppInner manages all free chat state. An `activeChat` flag in AppInner routes Python→JS payloads to either `useFreeChat` or the existing `useChat`, never both. Two new components (`FreeChatSearchBar`, `FreeChatOverlay`) are rendered inside the existing `showSessionOverview` block.

**Tech Stack:** React 18, Vite, Tailwind CSS, DaisyUI, Framer Motion, existing `bridge` / `useAnki` pattern

---

## Chunk 1: useFreeChat Hook

### Task 1: Create `useFreeChat` hook skeleton

**Files:**
- Create: `frontend/src/hooks/useFreeChat.js`

- [ ] **Step 1: Create the file with state and exports**

```javascript
// frontend/src/hooks/useFreeChat.js
import { useState, useRef, useCallback } from 'react';

/**
 * useFreeChat — card-independent chat hook for the Stapel overlay.
 *
 * Does NOT touch setSessions, currentSessionId, or any card context.
 * All state is RAM-only (cleared on app restart).
 *
 * @param {object} bridge  — the Python bridge object
 * @param {function} onLoadingChange — called with (bool) when isLoading changes
 * @param {function} onCancelComplete — called when a cancel-ack payload is received
 */
export function useFreeChat({ bridge, onLoadingChange, onCancelComplete }) {
  const [messages, setMessages] = useState([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isCancellingRef = useRef(false);

  const setIsLoadingWithCallback = useCallback((value) => {
    setIsLoading(value);
    if (onLoadingChange) onLoadingChange(value);
  }, [onLoadingChange]);

  // Exposed: set isCancelling before calling bridge.cancelRequest()
  const startCancel = useCallback(() => {
    isCancellingRef.current = true;
  }, []);

  const handleSend = useCallback((text, mode = 'compact') => {
    if (!text?.trim() || isLoading) return;

    // Add user message immediately
    setMessages(prev => [...prev, { from: 'user', text, id: Date.now() }]);
    setIsLoadingWithCallback(true);
    setStreamingMessage('');

    // Send to Python — no card context (null)
    if (bridge?.sendMessage) {
      bridge.sendMessage(JSON.stringify({ text, mode, cardContext: null, isFreeChat: true }));
    }
  }, [bridge, isLoading, setIsLoadingWithCallback]);

  // NOTE: streamingMessage is NOT in the dependency array — we read it via functional
  // updater inside setStreamingMessage to avoid stale closures during streaming.
  const handleAnkiReceive = useCallback((payload) => {
    // Drop section-related payloads — free chat has no concept of sections
    if (payload.type === 'sectionTitleGenerated') return;

    if (payload.type === 'loading') {
      setIsLoadingWithCallback(payload.loading ?? true);
      return;
    }

    if (payload.type === 'streaming') {
      setStreamingMessage(prev => prev + (payload.chunk || payload.message || ''));
      return;
    }

    if (payload.type === 'bot') {
      if (isCancellingRef.current) {
        // This is the cancel-ack — close without adding message
        isCancellingRef.current = false;
        setStreamingMessage('');
        setIsLoadingWithCallback(false);
        if (onCancelComplete) onCancelComplete();
        return;
      }
      // Normal bot response — use functional updater to read accumulated streamingMessage
      // without a stale closure (safe pattern: read prev inside setStreamingMessage updater)
      setStreamingMessage(prev => {
        const botText = prev || payload.message || '';
        setMessages(msgs => [
          ...msgs,
          { from: 'bot', text: botText, id: Date.now(), citations: payload.citations || {} }
        ]);
        return ''; // clear streaming
      });
      setIsLoadingWithCallback(false);
      return;
    }

    if (payload.type === 'error') {
      setMessages(prev => [
        ...prev,
        { from: 'bot', text: `Fehler: ${payload.message}`, id: Date.now(), isError: true }
      ]);
      setStreamingMessage('');
      setIsLoadingWithCallback(false);
      return;
    }

    // All other payload types (ai_state, rag_sources, etc.) — silently ignore
  // streamingMessage intentionally omitted — read via setStreamingMessage(prev=>) instead
  }, [setIsLoadingWithCallback, onCancelComplete]);

  return {
    messages,
    streamingMessage,
    isLoading,
    handleSend,
    handleAnkiReceive,
    startCancel,
  };
}

// Dependency array note: handleAnkiReceive does NOT include streamingMessage as a dep.
// It uses setStreamingMessage(prev => ...) functional updater to safely read the latest
// streaming value without recreating the callback on every streaming chunk.
```

- [ ] **Step 2: Verify build passes (no import errors yet)**

```bash
cd "frontend" && npm run build 2>&1 | tail -20
```
Expected: Build completes. The hook isn't imported anywhere yet so no errors.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/hooks/useFreeChat.js"
git commit -m "feat: add useFreeChat hook skeleton"
```

---

## Chunk 2: FreeChatSearchBar Component

### Task 2: Animated search bar with snake-border

**Files:**
- Create: `frontend/src/components/FreeChatSearchBar.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/FreeChatSearchBar.jsx
import React, { useState, useRef } from 'react';

/**
 * FreeChatSearchBar — special entry-point input for the free chat overlay.
 *
 * Visual: animated blue/purple conic-gradient snake border around a dark input.
 * Behavior: on Enter with non-empty text, calls onOpen(text).
 *
 * Props:
 *   onOpen(text: string) — called when user presses Enter with text
 */
export default function FreeChatSearchBar({ onOpen }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && value.trim()) {
      onOpen(value.trim());
      setValue('');
    }
  };

  return (
    <div style={{ padding: '8px 16px 12px' }}>
      {/* Brand */}
      <div style={{
        textAlign: 'center',
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.3px',
        marginBottom: 10,
      }}>
        Anki<span style={{ color: '#6b8cff' }}>Plus</span>
      </div>

      {/* Snake-border wrapper */}
      <div style={{ position: 'relative', borderRadius: 24, padding: 2 }}>
        {/* Animated conic-gradient ring */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          background: 'conic-gradient(from 0deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg)',
          WebkitMask: 'radial-gradient(circle, transparent calc(100% - 2px), white calc(100% - 2px))',
          mask: 'radial-gradient(circle, transparent calc(100% - 2px), white calc(100% - 2px))',
          animation: 'freechat-snake-rotate 2.5s linear infinite',
        }} />

        {/* Input */}
        <div style={{
          position: 'relative',
          background: '#22222f',
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          padding: '9px 14px 9px 38px',
          gap: 8,
        }}>
          {/* Icon */}
          <span style={{
            position: 'absolute',
            left: 13,
            color: '#6b8cff',
            fontSize: 14,
            lineHeight: 1,
          }}>✦</span>

          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stelle eine Frage…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ccc',
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* Hint */}
      <div style={{ textAlign: 'right', fontSize: 10, color: '#2a2a40', marginTop: 4, paddingRight: 4 }}>
        Enter zum Senden
      </div>

      {/* CSS animation — injected once via style tag */}
      <style>{`
        @keyframes freechat-snake-rotate {
          0%   { background: conic-gradient(from 0deg,   transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          25%  { background: conic-gradient(from 90deg,  transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          50%  { background: conic-gradient(from 180deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          75%  { background: conic-gradient(from 270deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          100% { background: conic-gradient(from 360deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
        }
      `}</style>
    </div>
  );
}
```

**Note on the CSS animation:** The `conic-gradient` `from <angle>` syntax with `@property --angle` requires Chrome 85+ and may not work in all Qt WebEngine versions. The keyframe approach above is a safe fallback. If the rotation looks static in Anki, replace the entire snake-border `<div>` with a simple gradient border using `linear-gradient` + `border-image` or a solid blue border.

- [ ] **Step 2: Verify build**

```bash
cd "frontend" && npm run build 2>&1 | tail -20
```
Expected: Build completes — component isn't imported yet.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/components/FreeChatSearchBar.jsx"
git commit -m "feat: add FreeChatSearchBar component with animated snake border"
```

---

## Chunk 3: FreeChatOverlay Component

### Task 3: Chat overlay that renders over the deck browser

**Files:**
- Create: `frontend/src/components/FreeChatOverlay.jsx`

The overlay receives all state as props (messages live in AppInner). It calls `onSend(initialText)` on mount if `initialText` is non-empty, which kicks off the first AI request.

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/FreeChatOverlay.jsx
import React, { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import StreamingChatMessage from './StreamingChatMessage';

/**
 * FreeChatOverlay — full-screen chat overlay on top of the deck browser.
 *
 * Props:
 *   messages        — Message[] from AppInner (not local state)
 *   streamingMessage — string, current streaming chunk
 *   isLoading       — boolean
 *   initialText     — string, sent as first message on mount (cleared in AppInner before render)
 *   onSend(text, mode) — sends a message
 *   onClose()       — closes the overlay (X button or empty Enter)
 *   bridge          — passed through to ChatMessage for card previews
 */
export default function FreeChatOverlay({
  messages,
  streamingMessage,
  isLoading,
  initialText,
  onSend,
  onClose,
  bridge,
}) {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState('compact');
  const messagesEndRef = useRef(null);
  const hasSentInitialRef = useRef(false);

  // Send initial text on mount (one-shot)
  useEffect(() => {
    if (initialText && !hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      onSend(initialText, 'compact');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (inputValue.trim()) {
        onSend(inputValue.trim(), mode);
        setInputValue('');
      } else if (!isLoading) {
        // Empty Enter closes when not streaming
        onClose();
      }
    }
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: '#0f1117',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      animation: 'freechat-fadein 0.4s ease forwards',
    }}>
      <style>{`
        @keyframes freechat-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Top bar — just the X button */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '14px 16px 6px',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#1e1e28',
            border: '1px solid #2a2a38',
            color: '#666',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 14px',
        scrollbarWidth: 'none',
      }}>
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg.text}
            from={msg.from}
            cardContext={null}
            citations={msg.citations || {}}
            bridge={bridge}
          />
        ))}

        {/* Streaming message */}
        {isLoading && streamingMessage && (
          <StreamingChatMessage
            message={streamingMessage}
            isStreaming={true}
          />
        )}

        {/* Loading indicator when no streaming text yet */}
        {isLoading && !streamingMessage && (
          <div style={{ color: '#3a3a55', fontSize: 12, padding: '8px 0' }}>
            Denkt nach…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom action input — same visual style as session chat */}
      <div style={{
        padding: '8px 12px 14px',
        borderTop: '1px solid #1a1a24',
        flexShrink: 0,
      }}>
        {/* Mode buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {['compact', 'detailed', 'overview'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? '#252545' : '#1a1a28',
                border: `1px solid ${mode === m ? '#4a5aff' : '#252535'}`,
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 10,
                color: mode === m ? '#8899ff' : '#555',
                cursor: 'pointer',
              }}
            >
              {m === 'compact' ? '⚡ Flash' : m === 'detailed' ? '🔍 Deep' : '📋 Übersicht'}
            </button>
          ))}
        </div>

        {/* Text input row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#1a1a28',
          border: '1px solid #252535',
          borderRadius: 16,
          padding: '7px 10px 7px 14px',
        }}>
          <input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Wartet auf Antwort…' : 'Weiterfragen… oder Enter zum Schließen'}
            disabled={isLoading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ccc',
              fontSize: 12,
            }}
          />
          {isLoading ? (
            // IMPORTANT: This stop button correctly calls onClose (= handleFreeChatClose
            // in AppInner), which handles the cancel-ack flow:
            //   1. calls startCancel() on the hook
            //   2. calls bridge.cancelRequest()
            //   3. waits for cancel-ack payload before actually closing
            // Do NOT simplify to setFreeChatOpen(false) — that would bypass cancel-ack.
            <button
              onClick={onClose}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: '#3a1a1a', border: '1px solid #5a2a2a',
                color: '#ff6b6b', fontSize: 11, cursor: 'pointer',
              }}
            >
              ■
            </button>
          ) : (
            <button
              onClick={() => { if (inputValue.trim()) { onSend(inputValue.trim(), mode); setInputValue(''); } }}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: inputValue.trim() ? '#4a5aff' : '#1e1e38',
                border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer',
              }}
            >
              ↑
            </button>
          )}
        </div>

        <div style={{ fontSize: 9, color: '#2a2a40', textAlign: 'center', marginTop: 4 }}>
          Leeres Enter → zurück zur Stapelansicht
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd "frontend" && npm run build 2>&1 | tail -20
```
Expected: Clean build — component isn't wired up yet.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/components/FreeChatOverlay.jsx"
git commit -m "feat: add FreeChatOverlay component"
```

---

## Chunk 4: App.jsx Wiring

### Task 4: Add free chat state, routing, and render block to AppInner

**Files:**
- Modify: `frontend/src/App.jsx:1-29` (imports)
- Modify: `frontend/src/App.jsx:153` (hook instantiation area)
- Modify: `frontend/src/App.jsx:488` (main handleAnkiReceive dispatch)
- Modify: `frontend/src/App.jsx:626-629` (sectionTitleGenerated secondary dispatch)
- Modify: `frontend/src/App.jsx:712-718` (ai_state secondary dispatch)
- Modify: `frontend/src/App.jsx:1543-1552` (showSessionOverview render block)

- [ ] **Step 1: Add imports**

In `frontend/src/App.jsx`, add after line 28 (after `import { BookOpen } from 'lucide-react';`):

```javascript
import { useFreeChat } from './hooks/useFreeChat';
import FreeChatOverlay from './components/FreeChatOverlay';
```

- [ ] **Step 2: Add state variables**

In `AppInner`, find the block where `useState` calls are grouped (around lines 200–260). Add after the existing state declarations:

```javascript
// ── Free Chat State ──────────────────────────────────────────────
const [freeChatOpen, setFreeChatOpen] = useState(false);
const [freeChatInitialText, setFreeChatInitialText] = useState('');
const [activeChat, setActiveChat] = useState('session'); // "session" | "free"
```

- [ ] **Step 3: Instantiate useFreeChat and declare refs at top level**

Directly after the `const chatHook = useChat(...)` line (~line 153), add:

```javascript
const freeChatHook = useFreeChat({
  bridge,
  onLoadingChange: (loading) => {
    // When free chat finishes loading (response complete), restore session routing
    if (!loading) {
      setActiveChat('session');
    }
  },
  onCancelComplete: () => {
    setActiveChat('session');
    setFreeChatOpen(false);
  },
});
const freeChatHookRef = useRef(freeChatHook);
useEffect(() => { freeChatHookRef.current = freeChatHook; }, [freeChatHook]);

// activeChatRef must be declared at AppInner top-level scope — NOT inside a useEffect.
// It mirrors the activeChat state for use inside closures (e.g. handleAnkiReceive).
const activeChatRef = useRef('session');
useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
```

**IMPORTANT:** `activeChatRef` and its `useEffect` must live here at the component top level. Moving them inside the `handleAnkiReceive` `useEffect` would violate the Rules of Hooks.

- [ ] **Step 4: Add free chat handlers**

After the existing `handleOpenDeck` / `handleSelectSession` handlers, add:

```javascript
const handleFreeChatOpen = useCallback((text) => {
  // Clear initialText immediately in the same state batch so the overlay
  // receives it as a prop on mount and it won't re-trigger on re-renders.
  // The overlay's hasSentInitialRef guards against double-send, but clearing
  // here before mount is the correct primary defense.
  setFreeChatInitialText(text);
  setTimeout(() => setFreeChatInitialText(''), 0); // clear after React processes the mount
  setFreeChatOpen(true);
  setActiveChat('free');
}, []);

const handleFreeChatClose = useCallback(() => {
  if (freeChatHookRef.current.isLoading) {
    // Cancel in-flight request; onCancelComplete will close
    freeChatHookRef.current.startCancel();
    bridge?.cancelRequest?.();
  } else {
    setActiveChat('session');
    setFreeChatOpen(false);
  }
}, [bridge]);
```

- [ ] **Step 5: Update handleAnkiReceive routing**

At `App.jsx:488`, change:

```javascript
// BEFORE:
_chat.handleAnkiReceive(payload);
```

to:

```javascript
// AFTER — mutual exclusion: only one hook receives each payload
if (activeChatRef.current === 'free') {
  _freeChat.handleAnkiReceive(payload);
} else {
  _chat.handleAnkiReceive(payload);
}
```

Where `_freeChat` and `activeChatRef` are extracted from refs (add alongside the existing `_chat` ref extraction):

```javascript
const _freeChat = freeChatHookRef.current;
const activeChatRef = useRef(activeChat);
useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
```

Add `_freeChat` and `activeChatRef` to the refs object extracted at the top of the `handleAnkiReceive` useEffect (around lines 451-458).

- [ ] **Step 6: Gate the secondary dispatch points**

At `App.jsx:628`, change:
```javascript
// BEFORE:
_chat.handleAnkiReceive(payload);  // sectionTitleGenerated
```
to:
```javascript
// AFTER:
if (activeChatRef.current !== 'free') {
  _chat.handleAnkiReceive(payload);
}
// If free chat is active, useFreeChat.handleAnkiReceive already drops this type
```

At `App.jsx:714`, change:
```javascript
// BEFORE:
_chat.handleAnkiReceive(payload);  // ai_state
```
to:
```javascript
// AFTER:
if (activeChatRef.current === 'free') {
  _freeChat.handleAnkiReceive(payload);
} else {
  _chat.handleAnkiReceive(payload);
}
```

- [ ] **Step 7: Update the showSessionOverview render block**

At `App.jsx:1543`, change:

```jsx
// BEFORE:
{showSessionOverview ? (
  <DeckBrowser
    bridge={bridge}
    sessions={sessionContext.sessions}
    onSelectSession={handleSelectSession}
    onOpenDeck={handleOpenDeck}
    headerHeight={headerHeight}
  />
```

to:

```jsx
// AFTER:
{showSessionOverview ? (
  <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <DeckBrowser
      bridge={bridge}
      sessions={sessionContext.sessions}
      onSelectSession={handleSelectSession}
      onOpenDeck={handleOpenDeck}
      headerHeight={headerHeight}
      onFreeChatOpen={handleFreeChatOpen}
    />
    {freeChatOpen && (
      <FreeChatOverlay
        messages={freeChatHook.messages}
        streamingMessage={freeChatHook.streamingMessage}
        isLoading={freeChatHook.isLoading}
        initialText={freeChatInitialText}
        onSend={(text, mode) => freeChatHook.handleSend(text, mode)}
        onClose={handleFreeChatClose}
        bridge={bridge}
      />
    )}
  </div>
```

**Note:** The `initialText` prop is passed once on mount. On subsequent sends, `onSend` is called directly from the overlay's input. `setFreeChatInitialText('')` inside `onSend` ensures the prop is cleared before any potential re-mount.

- [ ] **Step 8: Verify build**

```bash
cd "frontend" && npm run build 2>&1 | tail -30
```
Expected: Clean build. Fix any import or syntax errors before proceeding.

- [ ] **Step 9: Commit**

```bash
git add "frontend/src/App.jsx"
git commit -m "feat: wire free chat state and routing into AppInner"
```

---

## Chunk 5: DeckBrowser Integration

### Task 5: Add FreeChatSearchBar to DeckBrowser header

**Files:**
- Modify: `frontend/src/components/DeckBrowser.jsx:360` (component signature)
- Modify: `frontend/src/components/DeckBrowser.jsx:1-3` (imports)
- Modify: `frontend/src/components/DeckBrowser.jsx:421` (render — before deck list)

- [ ] **Step 1: Add import**

In `frontend/src/components/DeckBrowser.jsx`, add to the imports (after line 3):

```javascript
import FreeChatSearchBar from './FreeChatSearchBar';
```

- [ ] **Step 2: Update component signature**

At line 360, change:
```javascript
// BEFORE:
export default function DeckBrowser({ bridge, sessions, onSelectSession, onOpenDeck, headerHeight }) {
```
to:
```javascript
// AFTER:
export default function DeckBrowser({ bridge, sessions, onSelectSession, onOpenDeck, headerHeight, onFreeChatOpen }) {
```

- [ ] **Step 3: Render FreeChatSearchBar before the deck list**

In the return block, the outermost `<div>` starts at line 421 with `paddingTop: (headerHeight || 60) + 12`. Insert `FreeChatSearchBar` as the first child, before the `{/* ── Decks ── */}` comment:

```jsx
// Add this BEFORE the existing <div style={{ marginBottom: 4 }}> deck list block:
{onFreeChatOpen && (
  <FreeChatSearchBar onOpen={onFreeChatOpen} />
)}
```

- [ ] **Step 4: Verify build**

```bash
cd "frontend" && npm run build 2>&1 | tail -20
```
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/components/DeckBrowser.jsx"
git commit -m "feat: add FreeChatSearchBar to DeckBrowser header"
```

---

## Chunk 6: Integration Verification

### Task 6: Build for Anki and verify end-to-end

- [ ] **Step 1: Production build**

```bash
cd "frontend" && npm run build 2>&1
```
Expected: `✓ built in X.XXs` with no errors or warnings about undefined variables.

- [ ] **Step 2: Restart Anki and open the Stapel tab**

Verify:
- AnkiPlus brand + animated search bar appear above the deck list
- Snake-border animation runs (blue/purple ring rotating around the input)
- Typing in the search bar and pressing Enter opens the overlay
- The overlay fades in over the dark background
- The typed text is sent immediately and streaming starts

- [ ] **Step 3: Verify tab-switch persistence**

1. Type something, press Enter — overlay opens and AI responds
2. Switch to Session tab
3. Switch back to Stapel tab
4. Verify: overlay is still open, messages intact

- [ ] **Step 4: Verify closing behavior**

Test X button closes the overlay and returns to deck list.
Test empty Enter (while not streaming) closes the overlay.

- [ ] **Step 5: Verify session chat is unaffected**

1. Open a card in Anki (enter review mode)
2. Use the session chat normally
3. Return to Stapel tab — free chat state should be preserved
4. Session chat in review mode should have no spurious messages

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: free chat overlay — complete integration"
```

---

## Known Limitations (acceptable for this iteration)

- **Snake-border animation**: Qt WebEngine may not support `@property --angle` CSS custom property. If rotation is static, the gradient still shows the colored arc as a static decoration (acceptable).
- **No chat history persistence**: Messages are RAM-only. Closing Anki loses the conversation.
- **No "new conversation" button**: Not in scope.
- **Cancel flow**: If Anki's Python side doesn't send a `bot` cancel-ack, the overlay will not auto-close. Manual X button always works as fallback.
