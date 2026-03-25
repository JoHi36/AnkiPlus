# Agent Chip System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the colorful @-mention popup with an inline ghost-autocomplete + sticky chip system.

**Architecture:** All changes are in one file (`ChatInput.tsx`) plus parent prop wiring in `App.jsx`. The old mention popup, overlay highlight, and MentionAgentIcon are deleted. New: ghost text overlay, inline chip span, Tab shortcut for empty input. Agent state persists across sends via parent-managed `stickyAgent` prop.

**Tech Stack:** React 18, TypeScript, CSS design tokens

**Spec:** `docs/superpowers/specs/2026-03-24-agent-chip-system-design.md`

---

### Task 1: Add stickyAgent props to ChatInputProps

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx:25-43` (ChatInputProps interface)

- [ ] **Step 1: Add new props to the interface**

Add after `onBlur` (line 43):

```typescript
  stickyAgent?: { name: string; label: string } | null;
  onStickyAgentChange?: (agent: { name: string; label: string } | null) => void;
  onOpenAgentStudio?: () => void;
```

- [ ] **Step 2: Destructure new props in component**

In the function signature (around line 108), add:

```typescript
  stickyAgent: stickyAgentProp = null,
  onStickyAgentChange,
  onOpenAgentStudio,
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: builds without errors (props are optional, no caller changes needed yet)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "feat(agent-chip): add stickyAgent props to ChatInputProps"
```

---

### Task 2: Remove old mention popup and overlay

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx`

This task removes: `MentionAgentIcon` component (lines 46-87), `AUTO_ENTRY` memo (lines 122-133), `mentionAgents` memo (lines 136-149), `showMentionMenu`/`mentionFilter`/`mentionIndex` state (lines 118-120), `selectMentionAgent` callback (lines 164-176), mention detect `useEffect` (lines 152-162), the mention popup JSX (lines 339-417), the highlight overlay (lines 425-456), and the `activeAgentTag`-based border/background coloring on the dock (line 319).

- [ ] **Step 1: Delete `MentionAgentIcon` component**

Remove lines 46-87 (the entire `MentionAgentIcon` function).

- [ ] **Step 2: Delete mention state and logic**

Remove:
- `AUTO_ENTRY` useMemo (lines 122-133)
- `showMentionMenu`, `mentionFilter`, `mentionIndex` state (lines 118-120)
- `mentionAgents` useMemo (lines 136-149)
- Mention detect `useEffect` (lines 152-162)
- `selectMentionAgent` callback (lines 164-176)
- Agent tag detection `useEffect` (lines 178-209)
- `hasAgentTag`, `agentTagLabel`, `agentTagColor`, `hasPlusiTag` derived vars (lines 211-215)
- "Plusi fragen" event listener `useEffect` (lines 217-227) — **adapt to chip system**: change handler from `setInput('@Plusi ')` to:

```typescript
const handler = (e: any) => {
  const agent = { name: 'plusi', label: 'Plusi' };
  setChipAgent(agent);
  onStickyAgentChange?.(agent);
  setTimeout(() => textareaRef.current?.focus(), 50);
};
```

- [ ] **Step 3: Delete mention popup JSX**

Remove the entire `{showMentionMenu && ...}` block (lines 339-417).

- [ ] **Step 4: Delete highlight overlay JSX**

Remove the `{hasAgentTag && ...}` overlay block (lines 425-456).

- [ ] **Step 5: Clean up dock styling**

Change line 319 from:
```tsx
style={hasAgentTag ? { borderColor: `${agentTagColor}66`, background: `${agentTagColor}0D` } : undefined}
```
to:
```tsx
style={undefined}
```

And change textarea color (line 472) from:
```tsx
color: hasAgentTag ? 'transparent' : undefined,
```
to:
```tsx
color: undefined,
```

Remove `WebkitTextFillColor` line (474) as well.

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: builds. The @-mention system is now completely gone.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "refactor(agent-chip): remove old mention popup and overlay"
```

---

### Task 3: Implement inline chip rendering

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: Add chip state initialized from prop**

After the existing `useState` declarations, add:

```typescript
  const [chipAgent, setChipAgent] = useState<{ name: string; label: string } | null>(stickyAgentProp);

  // Sync chip from parent prop (e.g. after send resets input)
  useEffect(() => {
    setChipAgent(stickyAgentProp);
  }, [stickyAgentProp]);
```

- [ ] **Step 2: Add chip JSX before the textarea**

Inside the `{!hideInput && <div style={{ display: 'grid', position: 'relative' }}>}` block, before the `<textarea>`, add a chip + textarea wrapper:

Replace the bare `<textarea>` with a flex wrapper that holds chip + textarea:

```tsx
{/* Chip + Textarea wrapper */}
<div style={{
  gridArea: '1 / 1',
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-start',
  padding: 'var(--ds-space-md) var(--ds-space-lg)',
  paddingRight: '40px',
  gap: 0,
}}>
  {/* Agent chip */}
  {chipAgent && (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 8px', borderRadius: 6, marginRight: 5,
      fontSize: 13, fontWeight: 600, flexShrink: 0,
      background: 'var(--ds-accent)', color: 'white',
      lineHeight: '20px', userSelect: 'none', cursor: 'default',
      marginTop: 2,
    }}>
      {chipAgent.label}
    </span>
  )}
  <textarea
    ref={textareaRef}
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={handleKeyDown}
    onFocus={() => { setIsFocused(true); onFocusProp?.(); }}
    onBlur={() => { setIsFocused(false); onBlurProp?.(); }}
    placeholder={chipAgent ? 'Frage stellen...' : (placeholderProp || 'Stelle eine Frage...')}
    data-chat-input="true"
    rows={1}
    style={{
      flex: 1,
      minHeight: '24px',
      maxHeight: '120px',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      resize: 'none',
      color: 'var(--ds-text-primary)',
      fontFamily: 'var(--ds-font-sans)',
      fontSize: 'var(--ds-text-lg)',
      padding: 0,
      caretColor: 'var(--ds-text-primary)',
    }}
  />
</div>
```

Remove the old standalone `<textarea>` that had `gridArea: '1 / 1'` and DS class styling (those CSS rules from `.ds-input-dock textarea` applied via class — now we use inline styles since the textarea is no longer a direct child).

- [ ] **Step 3: Handle Backspace to delete chip**

In `handleKeyDown`, add before the existing Escape handler:

```typescript
    // Backspace at position 0 with chip → delete chip
    if (e.key === 'Backspace' && chipAgent && textareaRef.current?.selectionStart === 0 && textareaRef.current?.selectionEnd === 0) {
      e.preventDefault();
      setChipAgent(null);
      onStickyAgentChange?.(null);
      return;
    }
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: builds. Chip renders when `stickyAgent` prop is passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "feat(agent-chip): inline chip rendering with backspace delete"
```

---

### Task 4: Implement ghost autocomplete

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: Add ghost state and agent list builder**

```typescript
  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostIndex, setGhostIndex] = useState(0);
  const [ghostFilter, setGhostFilter] = useState('');

  // Build ghost suggestion list from registry
  const ghostAgents = React.useMemo(() => {
    const registry = getRegistry();
    const registryAgents = registry.size > 0
      ? [...registry.values()].filter(a => a.enabled).sort((a, b) => a.label.localeCompare(b.label))
      : [];

    const settingsEntry = { name: 'agenten-anpassen', label: 'Agenten anpassen', isSettings: true };
    const all = [settingsEntry, ...registryAgents];

    if (!ghostFilter) return all;
    const lower = ghostFilter.toLowerCase();
    return all.filter(a => a.name.includes(lower) || a.label.toLowerCase().includes(lower));
  }, [ghostFilter]);

  const currentGhost = ghostAgents[ghostIndex] || null;
```

- [ ] **Step 2: Detect @ trigger for ghost**

```typescript
  // Detect @ in input → activate ghost
  useEffect(() => {
    const atMatch = input.match(/@(\w*)$/);
    if (atMatch) {
      setGhostFilter(atMatch[1]);
      setGhostVisible(true);
      setGhostIndex(0);
    } else if (input === '@') {
      setGhostFilter('');
      setGhostVisible(true);
      setGhostIndex(0);
    } else {
      setGhostVisible(false);
    }
  }, [input]);
```

- [ ] **Step 3: Render ghost text overlay**

After the textarea inside the flex wrapper, add:

```tsx
  {/* Ghost autocomplete text */}
  {ghostVisible && currentGhost && (() => {
    // Calculate ghost suffix: what comes after what user typed
    const atMatch = input.match(/@(\w*)$/);
    const typed = atMatch ? atMatch[1] : '';
    const ghostLabel = currentGhost.label;
    const suffix = ghostLabel.startsWith(typed.charAt(0).toUpperCase() + typed.slice(1))
      ? ghostLabel.slice(typed.length)
      : ghostLabel;

    return (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: textareaRef.current
            ? textareaRef.current.offsetLeft + getTextWidth(input, textareaRef.current)
            : 0,
          top: 'var(--ds-space-md)',
          color: 'var(--ds-text-placeholder)',
          fontSize: 'var(--ds-text-lg)',
          fontFamily: 'var(--ds-font-sans)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'pre',
        }}
      >
        {suffix}
      </span>
    );
  })()}
```

Add this helper function at the top of the component (or outside):

```typescript
function getTextWidth(text: string, textarea: HTMLTextAreaElement): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const style = window.getComputedStyle(textarea);
  ctx.font = `${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText(text).width;
}
```

- [ ] **Step 4: Handle ghost keyboard shortcuts**

In `handleKeyDown`, add at the top (before other handlers):

```typescript
    // Ghost autocomplete navigation
    if (ghostVisible && ghostAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setGhostIndex(prev => (prev + 1) % ghostAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setGhostIndex(prev => (prev - 1 + ghostAgents.length) % ghostAgents.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (currentGhost) {
          if ((currentGhost as any).isSettings) {
            // Open Agent Studio
            setInput(input.replace(/@\w*$/, ''));
            setGhostVisible(false);
            onOpenAgentStudio?.();
          } else {
            // Create chip, remove @text from input
            const newAgent = { name: currentGhost.name, label: currentGhost.label };
            setChipAgent(newAgent);
            onStickyAgentChange?.(newAgent);
            setInput(input.replace(/@\w*$/, ''));
            setGhostVisible(false);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput(input.replace(/@\w*$/, ''));
        setGhostVisible(false);
        return;
      }
    }
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: builds. Ghost autocomplete works when typing `@`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "feat(agent-chip): ghost autocomplete with Tab/Arrow/Escape"
```

---

### Task 5: Ensure Tab key reaches WebView in Anki

**Files:**
- Modify: `ui/shortcut_filter.py`

The `GlobalShortcutFilter` intercepts all key events at the Qt level. Tab is a focus-traversal key in Qt — by default Qt consumes it to move focus between widgets, so it never reaches the WebView. We need to ensure Tab passes through when a text field has focus.

- [ ] **Step 1: Check current behavior**

Read `ui/shortcut_filter.py` lines 328-339. When `text_field_active` is true, the filter handles Escape and Enter explicitly, then falls through to `super().eventFilter()` for everything else. The question: does `super().eventFilter()` pass Tab to the WebView, or does Qt's default handler consume it for focus traversal?

In the `text_field_active` block (line 328), add Tab handling to prevent Qt from consuming it:

```python
        if text_field_active:
            if event.key() == Qt.Key.Key_Escape:
                self._clear_and_defocus_text_field()
                return True

            if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
                if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                    return super().eventFilter(obj, event)
                self._send_chat_message()
                return True

            # Tab: let it through to WebView (used for ghost autocomplete)
            if event.key() == Qt.Key.Key_Tab:
                return super().eventFilter(obj, event)

            return super().eventFilter(obj, event)
```

If Tab is still consumed by Qt focus traversal after this, change the Tab handler to dispatch the key event directly to the WebView via `runJavaScript`:

```python
            if event.key() == Qt.Key.Key_Tab:
                # Bypass Qt focus traversal, dispatch directly to JS
                self._dispatch_js_key('Tab')
                return True
```

- [ ] **Step 2: Test in Anki**

After build, restart Anki. Focus the chat input, press Tab. If `@` appears in the input, it works. If focus jumps to another widget, the Tab key is being consumed by Qt — use the `runJavaScript` dispatch approach.

- [ ] **Step 3: Commit**

```bash
git add ui/shortcut_filter.py
git commit -m "fix(shortcuts): pass Tab key through to WebView when text field is focused"
```

---

### Task 6: Tab badge and Tab-to-@ shortcut

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: Add Tab badge in textarea area**

Inside the chip+textarea flex wrapper, after the textarea, add:

```tsx
  {/* Tab badge — visible when focused + empty + no chip */}
  {isFocused && !input && !chipAgent && !ghostVisible && (
    <kbd style={{
      position: 'absolute',
      right: 40,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 10,
      fontWeight: 500,
      color: 'var(--ds-text-muted)',
      background: 'var(--ds-bg-overlay)',
      borderRadius: 4,
      padding: '1px 5px',
      pointerEvents: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      Tab
    </kbd>
  )}
```

- [ ] **Step 2: Handle Tab on empty input**

In `handleKeyDown`, add before the ghost handler:

```typescript
    // Tab on empty input → insert @ and activate ghost
    if (e.key === 'Tab' && !input && !chipAgent && !ghostVisible) {
      e.preventDefault();
      setInput('@');
      return;
    }
```

- [ ] **Step 3: Add ↑↓ badge when ghost is active**

In the same position as the Tab badge, add:

```tsx
  {/* ↑↓ badge — visible during ghost autocomplete */}
  {ghostVisible && (
    <kbd style={{
      position: 'absolute',
      right: 40,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 10,
      fontWeight: 500,
      color: 'var(--ds-text-muted)',
      background: 'var(--ds-bg-overlay)',
      borderRadius: 4,
      padding: '1px 5px',
      pointerEvents: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      ↑↓
    </kbd>
  )}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "feat(agent-chip): Tab badge and Tab-to-@ shortcut"
```

---

### Task 7: Agent switching (chip already present)

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: Handle ghost Tab when chip already exists**

The ghost Tab handler in Task 4 Step 4 already handles creating a new chip. When a chip already exists and user types `@NewAgent`, the ghost activates. On Tab:
- The old chip gets replaced by the new one
- The `@text` is removed from the input

This already works with the Task 4 implementation because `setChipAgent(newAgent)` overwrites any existing chip.

Verify: type text with a chip present, then type `@Res` and press Tab. The chip should switch to Research and `@Res` should disappear from text.

- [ ] **Step 2: Handle Escape during switch (restore old chip)**

The current Escape handler in the ghost block removes `@text` from input. The old chip is never modified during the ghost phase (it stays rendered). So Escape naturally preserves the old chip. Verify this.

- [ ] **Step 3: Commit (if any fixes needed)**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "feat(agent-chip): verify agent switching behavior"
```

---

### Task 8: Wire stickyAgent in parent (App.jsx)

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add stickyAgent state**

Near the other state declarations in `AppInner`:

```javascript
const [stickyAgent, setStickyAgent] = useState(null);
```

- [ ] **Step 2: Pass props to ChatInput**

Find every `<ChatInput` render in App.jsx and add:

```jsx
stickyAgent={stickyAgent}
onStickyAgentChange={setStickyAgent}
onOpenAgentStudio={() => executeAction('agentStudio.open')}
```

Search for all ChatInput usages: `grep -n '<ChatInput' frontend/src/App.jsx`

- [ ] **Step 3: Include agent name in send payload**

The backend routes messages based on `@AgentName` prefix detected by `getDirectCallPattern()`. The cleanest approach: pass `stickyAgent` as a separate option to the send handler, and have `useChat.handleSend` prepend the `@Label` prefix before sending to Python.

In `App.jsx`, find the `onSend` handler passed to ChatInput. It calls into `chatHook.handleSend(text, options)`. Add the agent:

```javascript
// In the onSend wrapper:
const handleChatSend = (text, options) => {
  const agentPrefix = stickyAgent ? `@${stickyAgent.label} ` : '';
  chatHook.handleSend(agentPrefix + text, options);
};
```

Verify by checking `useChat.js`'s `handleSend` function — ensure it doesn't also do `@` detection that would conflict. The existing agent detection in `useChat` reads `getDirectCallPattern()` which matches `@Label` at the start of text — prepending the prefix aligns with this.

- [ ] **Step 4: Verify build + test in Anki**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Then restart Anki. Test:
1. Tab in empty input → `@` appears, ghost shows
2. Type `Res` → ghost shows "earch"
3. Tab → chip "Research" appears
4. Type message, send → chip persists
5. Backspace at chip → chip deleted

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ChatInput.tsx
git commit -m "feat(agent-chip): wire stickyAgent state in App.jsx"
```

---

### Task 9: Clean up and remove dead code

**Files:**
- Modify: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: Remove unused imports**

If `findAgent` is no longer used directly in ChatInput, remove it from the import.
Check if `Square` from lucide is still used (for the stop button — yes, keep it).

- [ ] **Step 2: Remove the animated snake border div**

The conic-gradient snake border (lines 321-337) used to animate based on `hasAgentTag`. With the chip system, the dock should use standard `.ds-input-dock` styling without agent-colored borders. Remove or simplify the border animation div if no longer needed for focus state.

Keep the focus-only blue snake animation if desired (it existed before the agent system).

- [ ] **Step 3: Remove `plusiEnabled` prop if no longer needed**

Check if `plusiEnabled` is still used anywhere. It was used for mention filtering — if ghost list comes from registry which already has `enabled` flags, `plusiEnabled` may be unnecessary. Keep if used for other things.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatInput.tsx
git commit -m "refactor(agent-chip): clean up dead code from old mention system"
```

---

### Task 10: Build and manual test

**Files:**
- None (testing only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build 2>&1 | tail -10`

- [ ] **Step 2: Test in Anki — complete flow**

Restart Anki. Test each state from the spec:
1. Empty input focused → Tab badge visible on right
2. Tab → `@` inserted, ghost shows first agent
3. ↑↓ → ghost cycles through agents
4. Type `@Res` → ghost shows "earch"
5. Tab → chip "Research" appears
6. Type message, Enter → message sent with `@Research` prefix, chip stays
7. Type another message → chip still there
8. Backspace at chip → chip gone, back to Auto
9. Tab → badge not visible anymore (text field empty, no chip)
10. Test `@agen` → "Agenten anpassen" entry appears as ghost
11. Multi-line: type long text with chip present → textarea auto-grows correctly
12. Agent switch: with chip present, type `@Help` → Tab → chip switches to Help

- [ ] **Step 3: Test light mode**

Switch to light mode. Verify:
- Chip is readable (white text on accent blue)
- Ghost text visible but muted
- Tab/↑↓ badges visible

- [ ] **Step 4: Final commit if needed**

```bash
git commit -m "test(agent-chip): verified complete flow in dark + light mode"
```
