# Plusi Chat Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-state speech bubble next to Plusi that shows one thing at a time — Plusi's last message, user typing, Plusi's response, or a voice message. No chat history.

**Architecture:** New `PlusiChatBubble.tsx` component rendered inside MascotShell's dock container. State machine: `closed → empty → typing → waiting → response → closed`. Sends text messages via `window.ankiBridge.addMessage('sendMessage', {message: '@Plusi ...'})` to route through existing agent system. Voice messages displayed from existing `usePlusiVoice` hook data.

**Tech Stack:** React 18, TypeScript, CSS-in-JS (module-level constants), design system tokens (`var(--ds-*)`), existing bridge message queue

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/components/PlusiChatBubble.tsx` | Bubble component with state machine, text input, voice player |
| Modify | `frontend/src/components/MascotShell.jsx` | Render bubble, toggle open/close on tap, pass props |
| Modify | `frontend/src/App.jsx` | Pass Plusi response data to MascotShell for bubble display |

---

### Task 1: PlusiChatBubble Component

**Files:**
- Create: `frontend/src/components/PlusiChatBubble.tsx`

- [ ] **Step 1: Create the bubble component**

```tsx
// frontend/src/components/PlusiChatBubble.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';

type BubbleState = 'empty' | 'typing' | 'waiting' | 'response' | 'voice';

interface PlusiChatBubbleProps {
  /** Whether the bubble is visible */
  open: boolean;
  /** Close the bubble */
  onClose: () => void;
  /** Last Plusi response text (from agent or voice) */
  plusiText: string | null;
  /** Voice audio base64 (WAV) — when set, shows voice player */
  voiceAudio: string | null;
  /** Voice transcript */
  voiceTranscript: string | null;
  /** Current voice state from usePlusiVoice */
  voiceState: 'idle' | 'recording' | 'processing' | 'speaking';
}

const MAX_HEIGHT = 200;

// ── Module-level style constants ──

const BUBBLE_CONTAINER: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 60,
  maxWidth: 280,
  minWidth: 180,
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  boxShadow: 'var(--ds-shadow-md)',
  zIndex: 81,
  overflow: 'hidden',
  animation: 'plusi-bubble-in 200ms var(--ds-ease) both',
};

const BUBBLE_ARROW: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: -7,
  width: 12,
  height: 12,
  background: 'var(--ds-bg-frosted)',
  borderLeft: '1px solid var(--ds-border-subtle)',
  borderBottom: '1px solid var(--ds-border-subtle)',
  transform: 'rotate(45deg)',
};

const SCROLL_AREA: React.CSSProperties = {
  maxHeight: MAX_HEIGHT,
  overflowY: 'auto',
  padding: '14px 16px',
  scrollbarWidth: 'none',
  // Fade masks handled via CSS class
};

const TEXT_STYLE: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--ds-text-primary)',
  fontFamily: "'Space Grotesk', var(--ds-font-sans)",
};

const PLACEHOLDER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 18px',
  cursor: 'text',
};

const PLACEHOLDER_TEXT: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ds-text-placeholder)',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--ds-text-primary)',
  fontFamily: "'Space Grotesk', var(--ds-font-sans)",
  resize: 'none',
  padding: '14px 16px',
  maxHeight: MAX_HEIGHT,
  overflowY: 'auto',
  scrollbarWidth: 'none',
};

const WAITING_STYLE: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 13,
  color: 'var(--ds-text-tertiary)',
  fontStyle: 'italic',
};

const VOICE_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
};

const VOICE_PLAY: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--ds-accent-10)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  border: 'none',
};

const VOICE_BAR_BG: React.CSSProperties = {
  flex: 1,
  height: 3,
  background: 'var(--ds-hover-tint)',
  borderRadius: 2,
  overflow: 'hidden',
};

const VOICE_TIME: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
};

const VOICE_TRANSCRIPT: React.CSSProperties = {
  padding: '0 16px 12px',
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  lineHeight: 1.5,
};

const PENCIL_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="var(--ds-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
);

export default function PlusiChatBubble({
  open, onClose, plusiText, voiceAudio, voiceTranscript, voiceState,
}: PlusiChatBubbleProps) {
  const [bubbleState, setBubbleState] = useState<BubbleState>('empty');
  const [inputText, setInputText] = useState('');
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<number>(0);

  // When Plusi responds via agent (text), show it
  useEffect(() => {
    if (plusiText && open) {
      setDisplayText(plusiText);
      setBubbleState('response');
    }
  }, [plusiText, open]);

  // When voice response comes in, show voice player
  useEffect(() => {
    if (voiceAudio && open) {
      setBubbleState('voice');
    }
  }, [voiceAudio, open]);

  // When voice is processing, show waiting
  useEffect(() => {
    if (voiceState === 'processing' && open) {
      setBubbleState('waiting');
    }
  }, [voiceState, open]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setBubbleState('empty');
      setInputText('');
    }
  }, [open]);

  // Auto-focus textarea when entering typing state
  useEffect(() => {
    if (bubbleState === 'typing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [bubbleState]);

  const handlePlaceholderClick = useCallback(() => {
    setBubbleState('typing');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputText.trim();
      if (!text) return;
      // Send as @Plusi message through existing agent system
      if (window.ankiBridge) {
        window.ankiBridge.addMessage('sendMessage', {
          message: `@Plusi ${text}`,
          history: null,
          mode: 'compact',
          requestId: null,
        });
      }
      setInputText('');
      setBubbleState('waiting');
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [inputText, onClose]);

  const togglePlayback = useCallback(() => {
    if (!voiceAudio) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    const player = new Audio(`data:audio/wav;base64,${voiceAudio}`);
    audioRef.current = player;
    player.ontimeupdate = () => {
      if (player.duration) {
        setAudioProgress(player.currentTime / player.duration);
        setAudioDuration(player.duration);
      }
    };
    player.onended = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };
    player.play();
    setIsPlaying(true);
  }, [voiceAudio, isPlaying]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!open) return null;

  // Close on click outside (handled by MascotShell)

  return (
    <div style={BUBBLE_CONTAINER}>
      <div style={BUBBLE_ARROW} />

      {/* Empty state: placeholder */}
      {bubbleState === 'empty' && (
        <div style={PLACEHOLDER_STYLE} onClick={handlePlaceholderClick}>
          {PENCIL_ICON}
          <span style={PLACEHOLDER_TEXT}>Schreib was...</span>
        </div>
      )}

      {/* Typing state: textarea */}
      {bubbleState === 'typing' && (
        <textarea
          ref={inputRef}
          style={INPUT_STYLE}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Schreib Plusi..."
          rows={1}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px';
          }}
        />
      )}

      {/* Waiting state */}
      {bubbleState === 'waiting' && (
        <div style={WAITING_STYLE}>Plusi denkt nach...</div>
      )}

      {/* Response state: Plusi's text */}
      {bubbleState === 'response' && displayText && (
        <div style={SCROLL_AREA} className="plusi-bubble-scroll">
          <div style={TEXT_STYLE}>{displayText}</div>
        </div>
      )}

      {/* Voice state: audio player */}
      {bubbleState === 'voice' && (
        <>
          <div style={VOICE_ROW}>
            <button style={VOICE_PLAY} onClick={togglePlayback}>
              <span style={{ color: 'var(--ds-accent)', fontSize: 10, marginLeft: 1 }}>
                {isPlaying ? '⏸' : '▶'}
              </span>
            </button>
            <div style={VOICE_BAR_BG}>
              <div style={{
                height: '100%',
                width: `${audioProgress * 100}%`,
                background: 'var(--ds-accent)',
                borderRadius: 2,
                transition: 'width 100ms linear',
              }} />
            </div>
            <span style={VOICE_TIME}>
              {audioDuration > 0 ? `0:${String(Math.round(audioDuration)).padStart(2, '0')}` : '0:00'}
            </span>
          </div>
          {voiceTranscript && (
            <div style={VOICE_TRANSCRIPT}>"{voiceTranscript}"</div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add bubble animation keyframes to MascotShell's DOCK_CSS**

In `MascotShell.jsx`, find the `DOCK_CSS` template string and add at the end (before the closing backtick):

```css
@keyframes plusi-bubble-in {
  from { opacity: 0; transform: translateX(-8px) scale(0.95); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

.plusi-bubble-scroll {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.plusi-bubble-scroll::-webkit-scrollbar { display: none; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlusiChatBubble.tsx frontend/src/components/MascotShell.jsx
git commit -m "feat(plusi): add PlusiChatBubble single-state speech bubble component"
```

---

### Task 2: Wire Bubble into MascotShell

**Files:**
- Modify: `frontend/src/components/MascotShell.jsx`

The MascotShell needs to:
1. Track `bubbleOpen` state
2. Toggle on tap (instead of current tap counter logic)
3. Render `PlusiChatBubble` inside the dock container
4. Close bubble on click outside

- [ ] **Step 1: Add bubble state and import to MascotShell**

At the top of `MascotShell.jsx`, add the import:

```javascript
import PlusiChatBubble from './PlusiChatBubble';
```

Add new props to the component signature:

```javascript
export default function MascotShell({
  mood = 'neutral', onEvent, enabled = true, voiceState,
  plusiText, voiceAudio, voiceTranscript,
}) {
```

Add `bubbleOpen` state after the existing `useState` calls:

```javascript
const [bubbleOpen, setBubbleOpen] = useState(false);
```

- [ ] **Step 2: Modify handleTap to toggle bubble**

Replace the `handleTap` callback. The existing tap-counter logic (multi-tap → frustrated/annoyed) should still work, but single tap toggles the bubble:

```javascript
const handleTap = useCallback(() => {
  const ds = dragStateRef.current;

  // If Plusi is placed elsewhere, trigger walk-back
  if (ds.placed) {
    const dock = dockRef.current;
    if (dock) {
      const dockRect = dock.getBoundingClientRect();
      startPhysicsSequence(dockRect.left, dockRect.top);
    }
    return;
  }

  setTapKey((k) => k + 1);
  setEventBubble(null);

  // Toggle chat bubble
  setBubbleOpen((prev) => !prev);

  const now = Date.now();
  tapTimesRef.current.push(now);
  tapTimesRef.current = tapTimesRef.current.filter((t) => now - t < 3000);

  const tapsIn2s = tapTimesRef.current.filter((t) => now - t < 2000).length;
  const tapsIn3s = tapTimesRef.current.length;

  if (tapsIn3s >= 5) {
    setTempMood('frustrated', 4000);
  } else if (tapsIn2s >= 3) {
    setTempMood('annoyed', 3000);
  }
}, [setTempMood]);
```

- [ ] **Step 3: Add click-outside handler to close bubble**

Add a `useEffect` for click-outside:

```javascript
useEffect(() => {
  if (!bubbleOpen) return;
  const handleClickOutside = (e) => {
    const dock = dockRef.current;
    if (dock && !dock.contains(e.target)) {
      setBubbleOpen(false);
    }
  };
  // Delay to avoid closing on the tap that opened it
  const timer = setTimeout(() => {
    document.addEventListener('pointerdown', handleClickOutside);
  }, 100);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('pointerdown', handleClickOutside);
  };
}, [bubbleOpen]);
```

- [ ] **Step 4: Render PlusiChatBubble inside the dock container**

In the JSX return, add `PlusiChatBubble` inside the `.plusi-dock` div, after the event bubble:

```jsx
{eventBubble && (
  <div className="plusi-dock-bubble">
    {eventBubble.text}
  </div>
)}

<PlusiChatBubble
  open={bubbleOpen}
  onClose={() => setBubbleOpen(false)}
  plusiText={plusiText}
  voiceAudio={voiceAudio}
  voiceTranscript={voiceTranscript}
  voiceState={voiceState}
/>
```

- [ ] **Step 5: Override voiceMood when bubble is open and typing**

Update the effectiveMood to reflect bubble state:

```javascript
const voiceMood = voiceState && voiceState !== 'idle' ? VOICE_STATE_MOOD[voiceState] : null;
const bubbleMood = bubbleOpen ? 'curious' : null;
const effectiveMood = voiceMood || bubbleMood || overrideMood || (eventBubble ? eventBubble.mood : mood);
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MascotShell.jsx
git commit -m "feat(plusi): wire PlusiChatBubble into MascotShell with tap toggle"
```

---

### Task 3: Pass Plusi Response Data from App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/hooks/usePlusiVoice.ts`

The bubble needs to display Plusi's text responses (from the agent system) and voice data.

- [ ] **Step 1: Track last Plusi response text in App.jsx**

Add state near the other state declarations in `AppInner`:

```javascript
const [lastPlusiText, setLastPlusiText] = useState(null);
```

In the `ankiReceive` handler, where agent_cell responses are processed (around line 1290 where `payload.mood` is checked), add Plusi text tracking:

Find the block that handles `agent_cell` with `status: 'done'` and add:

```javascript
if (payload.agent === 'plusi' && payload.text) {
  setLastPlusiText(payload.text);
}
```

- [ ] **Step 2: Expose voice response text from usePlusiVoice**

In `frontend/src/hooks/usePlusiVoice.ts`, add state for the last voice response:

```typescript
const [lastVoiceText, setLastVoiceText] = useState('');
const [lastVoiceAudio, setLastVoiceAudio] = useState<string | null>(null);
```

In the `handleVoiceResponse` handler, save the data:

```typescript
const { audio, mood, text } = e.detail?.data || e.detail || {};
if (text) setLastVoiceText(text);
if (audio) setLastVoiceAudio(audio);
```

Update the return type and return:

```typescript
interface UsePlusiVoiceReturn {
  voiceState: VoiceState;
  recordingDuration: number;
  lastVoiceText: string;
  lastVoiceAudio: string | null;
}

return { voiceState, recordingDuration, lastVoiceText, lastVoiceAudio };
```

- [ ] **Step 3: Pass data to MascotShell in App.jsx**

Update the `usePlusiVoice` destructuring:

```javascript
const { voiceState, recordingDuration, lastVoiceText, lastVoiceAudio } = usePlusiVoice({ onMoodChange: setAiMood });
```

Pass to MascotShell:

```jsx
<MascotShell
  mood={mood}
  onEvent={eventTriggerRef}
  enabled={mascotEnabled}
  voiceState={voiceState}
  plusiText={lastPlusiText}
  voiceAudio={lastVoiceAudio}
  voiceTranscript={lastVoiceText}
/>
```

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/hooks/usePlusiVoice.ts
git commit -m "feat(plusi): pass Plusi response data to bubble via App + usePlusiVoice"
```

---

### Task 4: Build and Test

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Manual testing in Anki**

1. Click Plusi → bubble opens with "Schreib was..." + pencil icon
2. Click placeholder → start typing
3. Enter → "Plusi denkt nach..." → Plusi responds → text appears in bubble
4. Option key → voice recording → voice player appears in bubble
5. Click outside bubble → closes
6. Escape while typing → closes

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix(plusi): bubble integration fixes"
```
