# FreeChatOverlay Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the absolute-positioned FreeChatOverlay (which incorrectly opens the side panel) with an in-place animated transformation of the DeckBrowser panel — deck content slides out, chat unfolds in, session-style ChatInput dock appears at the bottom.

**Architecture:** `DeckBrowser` gains `animPhase`/`freeChatOpen` props that drive CSS transitions on its restructured flex-column root; a new `FreeChatView` component renders inline inside `DeckBrowser`; `ChatInput`'s action row is made configurable via `actionPrimary`/`actionSecondary` props so it can be reused in both session and free chat contexts.

**Tech Stack:** React 18, TypeScript (shared/), Vite, CSS transitions (no framer-motion for the main animation), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-17-freechat-redesign.md`

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `shared/components/ChatInput.tsx` | Extract action row to `actionPrimary`/`actionSecondary` props |
| Modify | `frontend/src/hooks/useFreeChat.js` | Add `resetMessages` to return object |
| **Create** | `frontend/src/components/FreeChatView.jsx` | Inline chat view (replaces FreeChatOverlay) |
| Modify | `frontend/src/App.jsx` | `animPhase` state, updated handlers, new DeckBrowser props, remove FreeChatOverlay |
| Modify | `frontend/src/components/DeckBrowser.jsx` | Accept animation props, restructure root to flex column, CSS transitions, render FreeChatView |
| **Delete** | `frontend/src/components/FreeChatOverlay.jsx` | Replaced by FreeChatView |
| Modify | `custom_screens.py` | Remove `freeChat` action handler and `_open_free_chat` method |

---

## Task 1: Make ChatInput action row configurable

**Files:**
- Modify: `shared/components/ChatInput.tsx`

This is the foundation — both session and FreeChatView will pass their own action configs.

- [ ] **Step 1: Add ActionConfig interface and update ChatInputProps**

  In `shared/components/ChatInput.tsx`, add the interface before the existing `ChatInputProps` and update props:

  ```typescript
  interface ActionConfig {
    label: string;
    shortcut?: string;    // display only, e.g. 'SPACE', 'ESC', '⌘X'
    onClick: () => void;
    disabled?: boolean;
    pulse?: boolean;      // animated highlight (lowScorePulse equivalent)
  }
  ```

  In `ChatInputProps`, remove `onOverview` and `lowScorePulse`, and add:
  ```typescript
  actionPrimary: ActionConfig;
  actionSecondary: ActionConfig;
  ```

- [ ] **Step 2: Update the component signature**

  Remove `onOverview` and `lowScorePulse` from the destructured props (line ~32). Add `actionPrimary` and `actionSecondary`.

- [ ] **Step 3: Replace handleAdvance and handleOverview with thin delegates**

  Replace `handleAdvance` (lines 81–88):
  ```typescript
  const handleAdvance = () => {
    actionPrimary.onClick();
  };
  ```

  Replace `handleOverview` (lines 90–94):
  ```typescript
  const handleOverview = () => {
    actionSecondary.onClick();
  };
  ```

  These local functions preserve the existing `handleKeyDown` and Space-listener call sites unchanged.

- [ ] **Step 4: Fix global Space keydown useEffect deps (line ~130)**

  The global Space handler's `useEffect` currently has `[bridge, onClose]` as its dependency array. After the refactor, `handleAdvance` calls `actionPrimary.onClick()`. Replace the deps:

  ```typescript
  // Before:
  }, [bridge, onClose]);

  // After:
  }, [actionPrimary]);
  ```

  `bridge` and `onClose` are no longer referenced inside this handler.

- [ ] **Step 5: Replace the action row JSX (lines 197–253)**

  Replace the two hardcoded buttons (the "Weiter" and "Übersicht" buttons and the divider between them) with:

  ```tsx
  {/* Action row — configurable via actionPrimary/actionSecondary props */}
  <div
    className="flex items-center"
    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
  >
    {/* Primary action (left) */}
    <button
      type="button"
      onClick={actionPrimary.onClick}
      disabled={actionPrimary.disabled}
      className="flex-1 flex items-center justify-center gap-1 h-[44px] bg-transparent border-none cursor-pointer transition-colors duration-100 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: '600',
        color: 'rgba(255,255,255,0.88)',
        borderRadius: '0',
        borderBottomLeftRadius: '16px',
      }}
    >
      {actionPrimary.label}
      {actionPrimary.shortcut && (
        <span style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.18)',
          marginLeft: '4px',
        }}>{actionPrimary.shortcut}</span>
      )}
    </button>

    {/* Divider */}
    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

    {/* Secondary action (right) */}
    <button
      type="button"
      onClick={actionSecondary.onClick}
      disabled={actionSecondary.disabled}
      className={`flex-1 flex items-center justify-center gap-1.5 h-[44px] bg-transparent border-none cursor-pointer transition-all duration-200 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed ${
        actionSecondary.pulse ? 'animate-pulse' : ''
      }`}
      style={{
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: '500',
        color: actionSecondary.pulse ? 'rgba(10,132,255,0.8)' : 'rgba(255,255,255,0.35)',
        borderRadius: '0',
        borderBottomRightRadius: '16px',
      }}
    >
      {actionSecondary.label}
      {actionSecondary.shortcut && (
        <span style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.18)',
          marginLeft: '4px',
        }}>{actionSecondary.shortcut}</span>
      )}
    </button>
  </div>
  ```

  Remove the `CornerDownLeft` import from lucide-react if it's no longer used after this change.

- [ ] **Step 6: Update the session call site in App.jsx**

  Find `<ChatInput` in `frontend/src/App.jsx` (search for `onSend={handleSend}` — it's the main session input, around line 1902). Replace `onOverview={...}` and `lowScorePulse={...}` with the new props:

  ```jsx
  actionPrimary={{
    label: 'Weiter',
    shortcut: 'SPACE',
    onClick: () => {
      // Replicate original handleAdvance: try bridge.advanceCard, fall back to close
      if (bridge?.advanceCard) {
        bridge.advanceCard();
      } else {
        handleClose();
      }
    },
  }}
  actionSecondary={{
    label: 'Übersicht',
    shortcut: '↵',
    onClick: () => {
      const overviewPrompt = "[[OVERVIEW]] Gib mir eine vollständige Übersicht zu dieser Lernkarte. Erkläre das Thema ausführlich: Was ist der Kerninhalt, warum ist es wichtig, und wie hängt es mit verwandten Konzepten zusammen? Gib eine umfassende Zusammenfassung.";
      handleSend(overviewPrompt, { mode: 'detailed' });
    },
    disabled: chatHook.isLoading,
    pulse: (() => {
      const currentSection = cardContextHook.currentSectionId
        ? cardContextHook.sections.find(s => s.id === cardContextHook.currentSectionId)
        : null;
      return currentSection?.performanceData?.score < 40;
    })(),
  }}
  ```

  Remove the now-unused `onOverview` and `lowScorePulse` props from the call site.

- [ ] **Step 7: Build and verify session chat input still works**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
  npm run build
  ```

  Expected: build succeeds with no TypeScript errors.

  Manual check in Anki: open a review session, verify "Weiter" and "Übersicht" buttons still appear and function correctly (pressing Weiter advances card, pressing Übersicht generates overview).

- [ ] **Step 8: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add shared/components/ChatInput.tsx frontend/src/App.jsx
  git commit -m "refactor(ChatInput): extract action row to actionPrimary/actionSecondary props"
  ```

---

## Task 2: Add resetMessages to useFreeChat

**Files:**
- Modify: `frontend/src/hooks/useFreeChat.js` (return statement, lines 95–102)

- [ ] **Step 1: Add resetMessages to the return object**

  In `useFreeChat.js`, update the return statement:
  ```javascript
  return {
    messages,
    streamingMessage,
    isLoading,
    handleSend,
    handleAnkiReceive,
    startCancel,
    resetMessages: () => setMessages([]),
  };
  ```

- [ ] **Step 2: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add frontend/src/hooks/useFreeChat.js
  git commit -m "feat(useFreeChat): expose resetMessages"
  ```

---

## Task 3: Create FreeChatView.jsx

**Files:**
- Create: `frontend/src/components/FreeChatView.jsx`

This replaces `FreeChatOverlay` as an inline flex-column component (no absolute positioning, no mode buttons).

- [ ] **Step 1: Create the component**

  Create `frontend/src/components/FreeChatView.jsx`:

  ```jsx
  // frontend/src/components/FreeChatView.jsx
  import React, { useEffect, useRef } from 'react';
  import ChatMessage from './ChatMessage';
  import StreamingChatMessage from './StreamingChatMessage';
  import ChatInput from '@shared/components/ChatInput';

  /**
   * FreeChatView — inline chat view rendered inside DeckBrowser.
   * No absolute positioning. Flex column, fills available height via flex: 1.
   */
  export default function FreeChatView({
    freeChatHook,
    initialText,
    onClose,      // handleFreeChatClose in App.jsx (cancel-ack aware)
    bridge,
    animPhase,    // 'entering' | 'entered' | 'exiting' — drives own opacity/transform
  }) {
    const { messages, streamingMessage, isLoading, handleSend, resetMessages } = freeChatHook;
    const messagesEndRef = useRef(null);
    const hasSentInitialRef = useRef(false);

    // One-shot: send initial text on mount
    useEffect(() => {
      if (initialText && !hasSentInitialRef.current) {
        hasSentInitialRef.current = true;
        handleSend(initialText, 'compact');
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll to bottom on new messages
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingMessage]);

    const isVisible = animPhase === 'entering' || animPhase === 'entered';

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(-12px)',
          transition: 'opacity 280ms ease, transform 280ms ease',
        }}
      >
        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 14px 8px',
            scrollbarWidth: 'none',
          }}
        >
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

          {isLoading && streamingMessage && (
            <StreamingChatMessage message={streamingMessage} isStreaming={true} />
          )}

          {isLoading && !streamingMessage && (
            <div style={{ color: '#3a3a55', fontSize: 12, padding: '8px 0' }}>
              Denkt nach…
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ChatInput dock — fades in with 150ms delay after messages area */}
        <div
          style={{
            padding: '0 10px 10px',
            flexShrink: 0,
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 250ms ease 150ms, transform 250ms ease 150ms',
          }}
        >
          <ChatInput
            onSend={(text, options) => handleSend(text, options?.mode ?? 'compact')}
            isLoading={isLoading}
            onStop={onClose}
            onClose={onClose}
            bridge={bridge}
            actionPrimary={{
              label: 'Schließen',
              shortcut: 'ESC',
              onClick: onClose,
            }}
            actionSecondary={{
              label: 'Zurücksetzen',
              shortcut: '⌘X',
              onClick: resetMessages,
            }}
          />
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Build to verify no import errors**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
  npm run build
  ```

  Expected: build succeeds. `FreeChatView` is not yet wired into anything — no runtime change.

- [ ] **Step 3: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add frontend/src/components/FreeChatView.jsx
  git commit -m "feat: add FreeChatView inline chat component"
  ```

---

## Task 4: Update App.jsx — animPhase state and handlers

**Files:**
- Modify: `frontend/src/App.jsx`

> **Note on Task 7 ordering:** Task 4 Step 5 removes the `startFreeChat` handler from App.jsx. Task 7 removes the Python dispatcher that sends `startFreeChat`. Do Task 4 and Task 7 in the same session — removing the App.jsx handler without removing the Python dispatcher creates a window where the Python event fires and is silently ignored (harmless, but confusing). Both are in separate files so they can be done back-to-back.

- [ ] **Step 1: Add animPhase state**

  Find `const [freeChatInitialText, setFreeChatInitialText] = useState('');` and add immediately after:
  ```javascript
  const [animPhase, setAnimPhase] = useState('idle'); // 'idle'|'entering'|'entered'|'exiting'
  ```

- [ ] **Step 2: Add freeChatOpenRef to prevent onLoadingChange race**

  Find the `const freeChatHookRef = useRef(freeChatHook);` declaration and add immediately after:
  ```javascript
  const freeChatOpenRef = useRef(false);
  useEffect(() => { freeChatOpenRef.current = freeChatOpen; }, [freeChatOpen]);
  ```

- [ ] **Step 3: Fix onLoadingChange to not reset routing while chat is open**

  Find `onLoadingChange: (loading) => {` (lines ~269–273). Replace:
  ```javascript
  onLoadingChange: (loading) => {
    // Only restore session routing if free chat is no longer open.
    // If free chat is open, the exit handlers (handleFreeChatClose/onCancelComplete)
    // are responsible for calling setActiveChat('session').
    if (!loading && !freeChatOpenRef.current) {
      setActiveChat('session');
    }
  },
  ```

- [ ] **Step 4: Update onCancelComplete**

  Find `onCancelComplete: () => {` (lines ~275–278). Replace:
  ```javascript
  onCancelComplete: () => {
    // Must animate out — do NOT call setFreeChatOpen(false) directly
    setAnimPhase('exiting');
    setTimeout(() => {
      setFreeChatOpen(false);
      setAnimPhase('idle');
      setActiveChat('session');
    }, 300);
  },
  ```

- [ ] **Step 5: Replace handleFreeChatOpen**

  Find `const handleFreeChatOpen = useCallback(` and replace the entire function:
  ```javascript
  const handleFreeChatOpen = useCallback((text) => {
    setFreeChatInitialText(text);
    setTimeout(() => setFreeChatInitialText(''), 0);
    setFreeChatOpen(true);
    setAnimPhase('entering');
    setTimeout(() => setAnimPhase('entered'), 350);
    setActiveChat('free');
  }, []);
  ```

- [ ] **Step 6: Replace handleFreeChatClose**

  Find `const handleFreeChatClose = useCallback(` and replace the entire function:
  ```javascript
  const handleFreeChatClose = useCallback(() => {
    if (freeChatHookRef.current.isLoading) {
      freeChatHookRef.current.startCancel();
      if (bridge?.cancelRequest) bridge.cancelRequest();
      // onCancelComplete (above) will trigger the exit animation
    } else {
      setAnimPhase('exiting');
      setTimeout(() => {
        setFreeChatOpen(false);
        setAnimPhase('idle');
        setActiveChat('session');
      }, 300);
    }
  }, [bridge]);
  ```

- [ ] **Step 7: Remove startFreeChat handler**

  Find and delete this block (search for `startFreeChat`):
  ```javascript
  // Free Chat triggered from Stapel search bar (custom_screens)
  if (payload.type === 'startFreeChat' && payload.text) {
    handleFreeChatOpen(payload.text);
    return;
  }
  ```

- [ ] **Step 8: Add ⌘X global keydown handler**

  Find the section with other global keyboard `useEffect` blocks. Add:
  ```javascript
  // ⌘X — reset free chat history (stay in chat mode)
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'x' && freeChatOpen && animPhase === 'entered') {
        e.preventDefault();
        freeChatHookRef.current.resetMessages();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [freeChatOpen, animPhase]);
  ```

- [ ] **Step 9: Build to verify no errors**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
  npm run build
  ```

  Expected: build succeeds.

- [ ] **Step 10: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add frontend/src/App.jsx
  git commit -m "feat(App): animPhase state, updated freeChat handlers, Cmd+X reset, fix onLoadingChange race"
  ```

---

## Task 5: Update DeckBrowser.jsx — restructure root + animation + FreeChatView

**Files:**
- Modify: `frontend/src/components/DeckBrowser.jsx`

> **Critical layout note:** The current DeckBrowser `return` renders a single root `<div style={{ flex:1, overflowY:'auto', ... }}>` that is both the scroll container and the only element. For `FreeChatView` to use `flex: 1` alongside the deck content, the root must be restructured into a flex-column wrapper with the scroll container and `FreeChatView` as siblings.

- [ ] **Step 1: Add new props to DeckBrowser function signature**

  Find the function signature. Add these new props with defaults:
  ```javascript
  freeChatOpen = false,
  animPhase = 'idle',
  freeChatInitialText = '',
  freeChatHook = null,
  onFreeChatClose = null,
  ```

- [ ] **Step 2: Add FreeChatView import**

  At the top with other imports:
  ```javascript
  import FreeChatView from './FreeChatView';
  ```

- [ ] **Step 3: Compute animation style**

  Near the top of the component body (after state/refs, before return), add:
  ```javascript
  const deckContentVisible = animPhase === 'idle' || animPhase === 'exiting';
  const deckContentStyle = {
    transition: 'opacity 250ms ease, transform 250ms ease',
    opacity: deckContentVisible ? 1 : 0,
    transform: deckContentVisible ? 'translateY(0)' : 'translateY(60px)',
    pointerEvents: deckContentVisible ? 'auto' : 'none',
    flexShrink: 0,    // prevents scroll container from shrinking when FreeChatView is present
  };
  ```

- [ ] **Step 4: Restructure the DeckBrowser return to a flex-column wrapper**

  Currently the return is roughly:
  ```jsx
  return (
    <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', paddingTop: ..., paddingBottom: 24 }}>
      {/* all deck content */}
    </div>
  );
  ```

  Replace with a two-level structure:
  ```jsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Scrollable deck content — animates out when freeChatOpen */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          paddingTop: (headerHeight || 60) + 12,
          paddingBottom: 24,
          ...deckContentStyle,
        }}
      >
        {/* FreeChatSearchBar, deck list, session list — unchanged content */}
        {/* ... all existing JSX stays here ... */}
      </div>

      {/* FreeChatView — renders when freeChatOpen, fills remaining space */}
      {freeChatOpen && freeChatHook && (
        <FreeChatView
          freeChatHook={freeChatHook}
          initialText={freeChatInitialText}
          onClose={onFreeChatClose}
          bridge={bridge}
          animPhase={animPhase}
        />
      )}
    </div>
  );
  ```

  **Important:** When `freeChatOpen` is true, both the scroll container (with `opacity:0`) and `FreeChatView` are present. The scroll container has `flexShrink: 0` to prevent it from collapsing. The `FreeChatView` uses `flex: 1` to fill the remaining space. The overall wrapper is `overflow: hidden` so the invisible deck content doesn't cause a scrollbar.

- [ ] **Step 5: Build and verify deck browser still loads normally**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
  npm run build
  ```

  Expected: build succeeds. Restart Anki and verify deck browser still shows normally (FreeChatView not wired yet from App.jsx).

- [ ] **Step 6: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add frontend/src/components/DeckBrowser.jsx
  git commit -m "feat(DeckBrowser): restructure to flex column, add animation props, render FreeChatView"
  ```

---

## Task 6: Wire App.jsx + delete FreeChatOverlay

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Update DeckBrowser render — add new props**

  Find `<DeckBrowser` (search for `onFreeChatOpen={handleFreeChatOpen}`). Replace the entire `<DeckBrowser ... />` element with:

  ```jsx
  <DeckBrowser
    bridge={bridge}
    sessions={sessionContext.sessions}
    onSelectSession={handleSelectSession}
    onOpenDeck={handleOpenDeck}
    headerHeight={headerHeight}
    onFreeChatOpen={handleFreeChatOpen}
    freeChatOpen={freeChatOpen}
    animPhase={animPhase}
    freeChatInitialText={freeChatInitialText}
    freeChatHook={freeChatHook}
    onFreeChatClose={handleFreeChatClose}
  />
  ```

- [ ] **Step 2: Delete the FreeChatOverlay render block**

  Find and delete the `{freeChatOpen && (<FreeChatOverlay ... />)}` block (the entire conditional including the surrounding braces).

- [ ] **Step 3: Remove FreeChatOverlay import**

  Delete: `import FreeChatOverlay from './components/FreeChatOverlay';`

- [ ] **Step 4: Update the wrapper div**

  Find the wrapper `<div>` around `<DeckBrowser>` (search for `relative container so FreeChatOverlay`). Update its comment and ensure it has `display: flex; flex-direction: column`:

  ```jsx
  {/* Deck Browser — flex column container for in-place chat transformation */}
  <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
  ```

- [ ] **Step 5: Build**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
  npm run build
  ```

  Expected: build succeeds with no unused import warnings.

- [ ] **Step 6: Full end-to-end test in Anki**

  Restart Anki. Verify each of the following:

  1. **Deck browser loads normally** — search bar visible, decks listed, no layout issues
  2. **Forward animation:** Type a question in search bar, press Enter:
     - Deck list slides down and fades out (~250ms)
     - Chat messages area fades in from above with the typed question as first user bubble
     - ChatInput dock fades in at bottom: `Schließen ESC | Zurücksetzen ⌘X`
     - Textarea auto-focuses
  3. **Follow-up message:** Type another question, press Enter — AI responds, streaming text appears
  4. **Reverse animation (Schließen):** Press ESC or click "Schließen" — reverse animation plays, deck browser returns
  5. **Reset:** While chat is open and settled, press ⌘X — messages clear, stays in chat mode
  6. **Session chat:** Open a review session, verify "Weiter" (advances card) and "Übersicht" (generates overview) still work
  7. **Cancel mid-stream:** While AI is responding, click Schließen — cancel-ack flow completes, exit animation plays (no hang)

- [ ] **Step 7: Delete FreeChatOverlay.jsx**

  ```bash
  git rm "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend/src/components/FreeChatOverlay.jsx"
  ```

  Using `git rm` stages the deletion automatically.

- [ ] **Step 8: Final build after delete**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
  npm run build
  ```

  Expected: clean build with no references to the deleted file.

- [ ] **Step 9: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add frontend/src/App.jsx
  git commit -m "feat: wire FreeChatView in-place, remove FreeChatOverlay"
  ```

---

## Task 7: Clean up custom_screens.py

**Files:**
- Modify: `custom_screens.py`

Do this task in the same session as Task 4 (both are quick, their changes are logically coupled).

- [ ] **Step 1: Remove the freeChat action handler**

  Find the polling loop action handler (search for `action_type == 'freeChat'`). Delete the `elif` block:
  ```python
  elif action_type == 'freeChat':
      text = action.get('text', '').strip()
      if text:
          self._open_free_chat(text)
  ```

- [ ] **Step 2: Remove the _open_free_chat method**

  Find and delete the entire `_open_free_chat` method (search for `def _open_free_chat`). Delete from the `def` line through the final `traceback.print_exc()` line.

- [ ] **Step 3: Verify Anki starts cleanly**

  Restart Anki. Verify:
  - No Python errors in console/log on startup
  - Deck browser loads, free chat works via the React search bar
  - Note: `custom_screens.py` line ~661 contains `window._apAction = {type:'freeChat', text: ...}` in the native Anki DeckBrowser HTML. This is dead code (the React panel never polls `_apAction`). Leave it — it is harmless.

- [ ] **Step 4: Commit**

  ```bash
  cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
  git add custom_screens.py
  git commit -m "chore(custom_screens): remove freeChat panel-toggle flow (now in-place in React)"
  ```

---

## Final Verification Checklist

After all tasks complete:

- [ ] `npm run build` succeeds with zero errors
- [ ] `FreeChatOverlay.jsx` is deleted
- [ ] Deck browser → search bar → Enter → smooth in-place animation (deck slides down, chat appears)
- [ ] ESC / Schließen → reverse animation → deck browser returns
- [ ] ⌘X clears messages while staying in chat mode
- [ ] Stop button during streaming → cancel-ack → exit animation plays (no hang)
- [ ] Second question routes correctly to free chat hook (not session hook)
- [ ] Session chat (Weiter / Übersicht) works correctly, Weiter advances card
- [ ] No `startFreeChat` handling in App.jsx
- [ ] No `_open_free_chat` in `custom_screens.py`
