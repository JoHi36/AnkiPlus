# Free Chat Overlay — Design Spec
**Date:** 2026-03-17
**Status:** Approved for implementation

## Summary

Add a free, card-independent chat to the Stapel (deck overview) tab. A special animated search bar sits at the top of the deck list. Pressing Enter triggers a full-screen overlay chat over the deck browser. The chat is contextless (no current card), reuses existing AI capabilities, and persists in RAM until app restart.

---

## User Experience

### Idle State (Stapel Tab)
- The deck list gets a new header area: **"AnkiPlus"** brand text above a special search bar
- The search bar has an animated blue/purple snake-border (conic-gradient CSS animation)
- Visually distinct from the regular session chat input — serves as an entry point, not a full interaction surface
- Hint text: "Stelle eine Frage…" with Enter-to-send hint

### Activation
- User types a question into the search bar and presses Enter
- Smooth transition: deck list fades out, dark overlay background (#0f1117) fades in (~0.4s)
- The typed text is immediately sent as the first AI message — streaming starts during/after transition
- No second click needed; one Enter = open + send
- `freeChatInitialText` is cleared to `""` inside `handleFreeChatOpen` in AppInner immediately after setting `freeChatOpen = true` — before the overlay mounts. The overlay reads the value synchronously on mount via a prop, calls `onSend(initialText)`, and receives an already-cleared value if it ever remounts.

### Chat State
- Minimalist overlay: just messages + bottom action bar
- Small X button top-right to close
- Bottom: identical Action Input Field as session chat (Flash / Deep / Übersicht buttons + text input)
- Empty Enter in the bottom input closes the chat **only if no request is currently in-flight**; ignored during streaming
- Chat messages use the same `ChatMessage` / `StreamingChatMessage` components as the session chat

### Persistence
- `freeChatMessages` state lives in `AppInner` — not inside `FreeChatOverlay`
- `FreeChatOverlay` receives `messages`, `streamingMessage`, `isLoading`, and `onSend`/`onClose` as props
- `freeChatMessages` is **never explicitly cleared** during a session — messages accumulate until app restart. No "new conversation" button is in scope for this iteration.
- RAM only: clears on app restart — free chat messages are **not** written to the sessions store or disk
- If user opens Stapel tab and chat was open: chat is still open, messages intact

### Closing
- X button (top right) — always visible
- Empty Enter in bottom input — only when no streaming is in progress
- Closing while a request is in-flight: calls `bridge.cancelRequest()`, then waits for the cancel-ack payload before resetting `activeChat` to `"session"` and closing the overlay (see Routing section)

---

## AI Capabilities

Same as session chat: Flash / Deep / Übersicht modes, card references, diagrams, images.
**Contextless**: no current card injected into the prompt.
**Future extensibility**: additional tools (card search, study set building) can be added later without affecting the session chat.

---

## Architecture

### State in AppInner (App.jsx)

```
freeChatOpen: boolean           // is overlay visible
freeChatInitialText: string     // text from search bar → first message (cleared after first send)
freeChatMessages: Message[]     // lifted so messages survive overlay unmount on tab switch
freeChatStreaming: string        // current streaming chunk
freeChatIsLoading: boolean
activeChat: "session" | "free"  // controls handleAnkiReceive routing; resets to "session" when useFreeChat.isLoading transitions false→false (response complete) OR when onCancelComplete fires
```

### AI Response Routing

`handleAnkiReceive` in AppInner currently routes all Python payloads to `chatHookRef.current.handleAnkiReceive`. With two hooks, routing must be mutually exclusive:

- `activeChat === "free"` → all payloads go to `freeChatHookRef.current.handleAnkiReceive` **only**
- `activeChat === "session"` → all payloads go to `chatHookRef.current.handleAnkiReceive` **only**

This mutual exclusion applies to **all call sites** in `handleAnkiReceive`, including the secondary dispatch points for `sectionTitleGenerated` and `ai_state` which currently call `chatHookRef` directly — these must also be gated by `activeChat`.

**`sectionTitleGenerated` in free chat context**: `useFreeChat` explicitly drops this payload type (free chat has no concept of sections). The routing guard ensures it never reaches `useChat` when free chat is active.

### Cancel-Ack Race Condition

When closing the overlay while a request is in-flight:

1. `handleFreeChatClose` (AppInner) calls `useFreeChat.startCancel()` → sets `isCancelling = true`
2. `handleFreeChatClose` calls `bridge.cancelRequest()`
3. `activeChat` remains `"free"` — routing stays on `useFreeChat`
4. Python sends back `{"type": "bot", "message": "Anfrage abgebrochen."}`
5. `useFreeChat.handleAnkiReceive` receives the payload; since `isCancelling === true`, treats this `bot` payload as the cancel-ack
6. Calls `onCancelComplete()` → AppInner resets `activeChat = "session"`, `freeChatOpen = false`

**Cancel-ack detection**: Any `bot` payload received while `isCancelling === true` is treated as the cancel-ack and triggers close. No backend changes required.

### Session Isolation

Free chat messages are **not** routed through `setSessions` or `currentSessionId`. `useFreeChat` manages its own state entirely. `saveSessions` is never called for free chat content.

### New Components

- **`FreeChatSearchBar.jsx`** — animated snake-border input, rendered in DeckBrowser header area; calls `onFreeChatOpen(text)` on Enter
- **`FreeChatOverlay.jsx`** — `position: absolute; inset: 0` overlay, positioned relative to the `showSessionOverview` container div in AppInner (which is already `position: relative`); receives `messages`, `streamingMessage`, `isLoading`, `onSend`, `onClose`, `initialText` as props; reuses `ChatMessage`, `StreamingChatMessage`, `ChatInput`; calls `onSend(initialText)` in a `useEffect` on mount if `initialText` is non-empty

### New Hook

**`useFreeChat`** — lightweight hook instantiated in AppInner. Exposes:

```javascript
const {
  messages,         // Message[]
  streamingMessage, // string
  isLoading,        // boolean
  handleSend,       // (text: string, mode: string) => void  — mode defaults to 'compact'
  handleAnkiReceive,// (payload) => void
  startCancel,      // () => void  — called by AppInner when closing mid-stream
} = useFreeChat({ bridge, useAnki })
```

- `handleSend(text, mode)` — sends the message to the AI with no card context; does not call `setSessions` or touch `currentSessionId`
- `handleAnkiReceive(payload)` — processes streaming/bot/error/loading payloads; explicitly drops `sectionTitleGenerated`; when `isCancelling === true`, treats any incoming `bot` payload as the cancel-ack: resets `isCancelling`, then calls `onCancelComplete()` callback (provided by AppInner) which resets `activeChat` to `"session"` and sets `freeChatOpen = false`
- `startCancel()` — sets `isCancelling = true` internally; called by `handleFreeChatClose` in AppInner before `bridge.cancelRequest()`

### Modified Components

- **`DeckBrowser.jsx`** — updated prop signature:
  ```javascript
  DeckBrowser({ bridge, sessions, onSelectSession, onOpenDeck, headerHeight, onFreeChatOpen })
  ```
  Renders `FreeChatSearchBar` at top of deck list

- **`App.jsx (AppInner)`** — adds free chat state, `useFreeChat` hook, `activeChat` routing in `handleAnkiReceive`, renders `FreeChatOverlay`

### Render Logic

```jsx
{showSessionOverview && (
  <>
    <DeckBrowser onFreeChatOpen={handleFreeChatOpen} ... />
    {freeChatOpen && (
      <FreeChatOverlay
        messages={freeChatMessages}
        streamingMessage={freeChatStreaming}
        isLoading={freeChatIsLoading}
        onSend={handleFreeChatSend}
        onClose={handleFreeChatClose}
      />
    )}
  </>
)}
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Overlay closed while streaming | `bridge.cancelRequest()` called; `activeChat` stays `"free"` until cancel-ack consumed; then overlay closes |
| Empty Enter while streaming | No-op (ignored) |
| Tab switch (Stapel → Session) with overlay open, no streaming | Overlay unmounts; `freeChatMessages` survive in AppInner; `activeChat` stays `"free"` until free chat response finishes |
| Tab switch (Stapel → Session) with overlay open, streaming in-flight | Overlay unmounts; AI response completes silently; `useFreeChat` appends response to `freeChatMessages`; when `isLoading` transitions to `false`, `activeChat` automatically resets to `"session"` so session chat routing is restored |
| Tab switch back to Stapel | Overlay re-mounts if `freeChatOpen === true`; messages intact including any response that arrived during absence |
| Re-opening overlay after close | Previous messages visible; `freeChatInitialText` is `""` so no auto-send |
| App restart | All free chat messages cleared |
| User starts review while free chat open | No conflict — free chat overlay only renders when `showSessionOverview === true`; review is a separate view |
| `sectionTitleGenerated` received while free chat active | `useFreeChat` explicitly drops payload; never reaches `useChat` |

---

## What We Are NOT Building
- No persistent chat history saved to disk
- No new tab in the navigation
- No changes to the session chat or card review flow
- No new AI tools in this iteration
- No "new conversation" / clear button in this iteration
