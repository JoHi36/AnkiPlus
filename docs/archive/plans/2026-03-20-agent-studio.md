# Agent Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move agent settings from the popup dialog into an in-place "Agent Studio" view within the chat panel, with manual insight extraction.

**Architecture:** Add an `activeView` state to App.jsx that switches the chat area between three views (chat, agentStudio, plusiMenu). The Agent Studio component reuses existing bridge methods for tool toggles and embedding status. A new ExtractInsightsButton component provides manual insight extraction with animated states.

**Tech Stack:** React 18, Framer Motion (animations), existing bridge communication, design system CSS tokens

**Spec:** `docs/superpowers/specs/2026-03-20-agent-studio-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `frontend/src/components/AgentStudio.jsx` | Agent Studio view: embeddings status, tool toggles, Plusi subagent entry |
| `frontend/src/components/PlusiMenu.jsx` | Plusi sub-menu placeholder (header + navigation, details in follow-up spec) |
| `frontend/src/components/ExtractInsightsButton.jsx` | Sparkles button with idle/hover/loading/done states + animations |

### Modified Files
| File | Changes |
|------|---------|
| `frontend/src/App.jsx` | Add `activeView` state, view-aware action buttons, `Cmd+.` shortcut, conditional rendering |
| `frontend/src/components/InsightsDashboard.jsx` | Add `newInsightIds` prop for "neu" marking on new insights |
| `frontend/src/components/InsightBullet.jsx` | Add optional `bulletColor` prop override |
| `frontend/src/components/ContextSurface.jsx` | Remove `FloatingSectionPill` component and its rendering |
| `shared/components/ChatInput.tsx` | Hide Enter shortcut hint when textarea focused |
| `ui/bridge.py` | Add `getEmbeddingStatus` and `saveMascotEnabled` pyqtSlot methods to WebBridge |
| `settings.html` | Remove Agent tab, remove tab bar, show only Konto content |
| `ui/settings.py` | Remove Agent-tab-specific window sizing if applicable |

---

### Task 0: Add Bridge Methods for Agent Studio

**Files:**
- Modify: `ui/bridge.py` — add `getEmbeddingStatus` and `saveMascotEnabled` to WebBridge

The AgentStudio component needs embedding status and mascot toggle, but these methods currently only exist on `SettingsBridge` (in `ui/settings.py`), not on the main `WebBridge` that the React chat panel uses.

- [ ] **Step 1: Add getEmbeddingStatus to WebBridge**

In `ui/bridge.py`, add a new `@pyqtSlot` method to the WebBridge class. Reference the implementation in `ui/settings.py:119`:

```python
@pyqtSlot(result=str)
def getEmbeddingStatus(self):
    """Return embedding indexing status as JSON."""
    try:
        from ..ai.embeddings import get_embedding_status
        return json.dumps(get_embedding_status())
    except Exception as e:
        logger.exception("getEmbeddingStatus error: %s", e)
        return json.dumps({"embeddedCards": 0, "totalCards": 0, "isRunning": False})
```

- [ ] **Step 2: Add saveMascotEnabled to WebBridge**

```python
@pyqtSlot(bool)
def saveMascotEnabled(self, enabled):
    """Toggle Plusi mascot on/off."""
    try:
        from ..config import update_config
        update_config(mascot_enabled=enabled)
    except Exception as e:
        logger.exception("saveMascotEnabled error: %s", e)
```

- [ ] **Step 3: Also add saveAITools if not present**

Check if `saveAITools` already exists on WebBridge. If not, add it:

```python
@pyqtSlot(str)
def saveAITools(self, tools_json):
    """Save AI tool toggles."""
    try:
        from ..config import update_config
        tools = json.loads(tools_json)
        update_config(ai_tools=tools)
    except Exception as e:
        logger.exception("saveAITools error: %s", e)
```

- [ ] **Step 4: Verify bridge methods exist**

Restart Anki, open the console, and confirm the methods are available on the bridge object.

- [ ] **Step 5: Commit**

```bash
git add ui/bridge.py
git commit -m "feat: add getEmbeddingStatus, saveMascotEnabled, saveAITools to WebBridge"
```

---

### Task 1: Add `activeView` State to App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:167` (near existing state declarations)
- Modify: `frontend/src/App.jsx:2056-2063` (conditional rendering area)
- Modify: `frontend/src/App.jsx:2357-2378` (action button definitions)

- [ ] **Step 1: Add activeView state**

In `frontend/src/App.jsx`, near line 167 (after `showInsightsDashboard` state), add:

```javascript
const [activeView, setActiveView] = useState('chat'); // 'chat' | 'agentStudio' | 'plusiMenu'
```

- [ ] **Step 2: Update actionPrimary to be view-aware**

Replace the `actionPrimary` definition at line 2357-2367:

```javascript
actionPrimary={{
  label: 'Weiter',
  shortcut: 'SPACE',
  onClick: () => {
    if (activeView !== 'chat') {
      // In Agent Studio or Plusi Menu: Space closes back to chat
      setActiveView('chat');
    } else if (bridge?.advanceCard) {
      bridge.advanceCard();
    } else {
      handleClose();
    }
  },
}}
```

- [ ] **Step 3: Update actionSecondary to be view-aware**

Replace the `actionSecondary` definition at line 2369-2378:

```javascript
actionSecondary={{
  label: 'Agent Studio',
  shortcut: '↵',
  onClick: () => {
    switch (activeView) {
      case 'chat':
        setActiveView('agentStudio');
        break;
      case 'agentStudio':
        setActiveView('plusiMenu');
        break;
      case 'plusiMenu':
        setActiveView('agentStudio');
        break;
    }
  },
}}
```

- [ ] **Step 4: Add Cmd+. global shortcut**

Add a `useEffect` near the other keyboard handlers in App.jsx:

```javascript
useEffect(() => {
  const handleGlobalShortcut = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '.') {
      e.preventDefault();
      setActiveView(prev => prev === 'chat' ? 'agentStudio' : 'chat');
    }
  };
  window.addEventListener('keydown', handleGlobalShortcut);
  return () => window.removeEventListener('keydown', handleGlobalShortcut);
}, []);
```

- [ ] **Step 5: Add conditional rendering placeholder**

In the render area around line 2056, wrap the existing InsightsDashboard/chat rendering with a view check. For now, just show placeholder text for the new views:

```javascript
{activeView === 'agentStudio' ? (
  <div style={{ padding: 40, textAlign: 'center', color: 'rgba(232,232,232,0.3)' }}>
    Agent Studio (placeholder)
  </div>
) : activeView === 'plusiMenu' ? (
  <div style={{ padding: 40, textAlign: 'center', color: 'rgba(232,232,232,0.3)' }}>
    Plusi Menu (placeholder)
  </div>
) : (chatHook.messages.length === 0 || showInsightsDashboard) && !chatHook.isLoading && !chatHook.streamingMessage ? (
  <InsightsDashboard ... />
) : (
  <>
    {/* existing chat rendering */}
  </>
)}
```

- [ ] **Step 6: Reset activeView when chat gets a new message**

In `handleSend` (around line 1487), add at the top:

```javascript
if (activeView !== 'chat') {
  setActiveView('chat');
}
```

- [ ] **Step 7: Verify navigation works**

Build with `cd frontend && npm run build`, restart Anki. Verify:
- Enter action button toggles between chat → agentStudio → plusiMenu → agentStudio
- Space returns to chat from any view
- Cmd+. toggles agent studio
- Typing a message and hitting Enter sends the message and returns to chat
- Placeholder text appears for each view

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add activeView state machine for Agent Studio navigation"
```

---

### Task 2: Create AgentStudio Component

**Files:**
- Create: `frontend/src/components/AgentStudio.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/AgentStudio.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';

// Plusi SVG icon (neutral mood) — from PlusiWidget.jsx
function PlusiIcon({ size = 28 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill="#0a84ff"/>
      <rect x="5" y="35" width="110" height="40" rx="8" fill="#0a84ff"/>
      <rect x="40" y="35" width="40" height="40" fill="#0a84ff"/>
      <ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// Toggle switch component
function Toggle({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative',
        cursor: 'pointer', border: 'none', transition: 'background 0.2s',
        background: on ? 'var(--ds-accent, #0a84ff)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

// Tool definitions
const TOOLS = [
  { key: 'card_search', emoji: '🔍', label: 'Kartensuche', desc: 'Karten aus dem Deck suchen' },
  { key: 'images', emoji: '🖼️', label: 'Bilder', desc: 'Bilder aus Karten und Internet' },
  { key: 'diagrams', emoji: '📊', label: 'Diagramme', desc: 'Mermaid-Diagramme' },
  { key: 'statistics', emoji: '📈', label: 'Statistiken', desc: 'Streak, Heatmap, Deck-Überblick' },
  { key: 'molecules', emoji: '🧬', label: 'Moleküle', desc: 'Molekülstrukturen darstellen', badge: 'Beta' },
];

export default function AgentStudio({ bridge, onNavigateToPlusi }) {
  const [tools, setTools] = useState({});
  const [mascotEnabled, setMascotEnabled] = useState(false);
  const [embedding, setEmbedding] = useState({ embeddedCards: 0, totalCards: 0, isRunning: false });

  // Load tool settings on mount
  useEffect(() => {
    if (!bridge) return;
    try {
      const configStr = bridge.getCurrentConfig?.();
      if (configStr) {
        const config = JSON.parse(configStr);
        setTools(config.ai_tools || config.aiTools || {});
        setMascotEnabled(config.mascot_enabled || config.mascotEnabled || false);
      }
    } catch (e) {
      console.error('AgentStudio: failed to load config', e);
    }
  }, [bridge]);

  // Load embedding status (synchronous @pyqtSlot(result=str))
  useEffect(() => {
    if (!bridge?.getEmbeddingStatus) return;
    const fetchStatus = () => {
      try {
        const json = bridge.getEmbeddingStatus();
        if (json) setEmbedding(JSON.parse(json));
      } catch (e) {}
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => clearInterval(timer);
  }, [bridge]);

  const handleToggleTool = useCallback((key) => {
    setTools(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      if (bridge?.saveAITools) {
        bridge.saveAITools(JSON.stringify(updated));
      }
      return updated;
    });
  }, [bridge]);

  const handleToggleMascot = useCallback(() => {
    setMascotEnabled(prev => {
      const next = !prev;
      if (bridge?.saveMascotEnabled) {
        bridge.saveMascotEnabled(next);
      }
      return next;
    });
  }, [bridge]);

  const embedPct = embedding.totalCards > 0
    ? Math.round((embedding.embeddedCards / embedding.totalCards) * 100)
    : 0;
  const embedDone = embedPct >= 100 && !embedding.isRunning;

  const S = styles;

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>Agent Studio</div>

      {/* Semantische Suche */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Semantische Suche</div>
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary, rgba(255,255,255,0.22))" strokeWidth={1.8}>
                <circle cx={11} cy={11} r={8}/><line x1={21} y1={21} x2={16.65} y2={16.65}/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>
                Karten-Embeddings
              </span>
              {(embedding.isRunning || embedDone) && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                  background: embedDone ? 'rgba(34,197,94,0.12)' : 'rgba(10,132,255,0.12)',
                  color: embedDone ? 'rgba(34,197,94,0.8)' : 'rgba(10,132,255,0.7)',
                }}>
                  {embedDone ? 'Fertig' : 'Läuft...'}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))', fontVariantNumeric: 'tabular-nums' }}>
              {embedding.embeddedCards} / {embedding.totalCards}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <div style={{
              width: `${embedPct}%`, height: '100%', borderRadius: 2, transition: 'width 0.6s ease',
              background: embedDone ? '#22c55e' : 'var(--ds-accent, #0a84ff)',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))', marginTop: 8, lineHeight: 1.5 }}>
            Karten werden im Hintergrund indiziert, um semantisch ähnliche Inhalte zu finden.
          </div>
        </div>
      </div>

      {/* Agent Tools */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Agent Tools</div>
        <div style={S.card}>
          {TOOLS.map((tool, i) => (
            <div key={tool.key} style={{
              ...S.toolRow,
              borderBottom: i < TOOLS.length - 1 ? '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))' : 'none',
            }}>
              <span style={{ fontSize: 16, marginRight: 10 }}>{tool.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>
                    {tool.label}
                  </span>
                  {tool.badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                      background: 'rgba(10,132,255,0.12)', color: 'rgba(10,132,255,0.8)',
                    }}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                  {tool.desc}
                </div>
              </div>
              <Toggle on={!!tools[tool.key]} onChange={() => handleToggleTool(tool.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Subagenten — Plusi */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Subagenten</div>
        <div style={S.card}>
          {/* Plusi toggle row */}
          <div style={S.toolRow}>
            <div style={{ marginRight: 10 }}><PlusiIcon size={28} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))' }}>Plusi</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(10,132,255,0.12)', color: 'rgba(10,132,255,0.8)' }}>Beta</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))', marginTop: 1 }}>
                Lern-Begleiter mit Persönlichkeit
              </div>
            </div>
            <Toggle on={mascotEnabled} onChange={handleToggleMascot} />
          </div>
          {/* Divider */}
          <div style={{ height: 1, background: 'var(--ds-border-subtle, rgba(255,255,255,0.06))' }} />
          {/* Sub-Agent-Menü button (entire lower area) */}
          <div
            onClick={onNavigateToPlusi}
            style={S.subAgentButton}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 12, color: 'var(--ds-text-secondary, rgba(255,255,255,0.45))' }}>Sub-Agent-Menü</span>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--ds-text-tertiary, rgba(255,255,255,0.18))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1, display: 'flex', flexDirection: 'column',
    padding: '0 20px 140px', overflowY: 'auto',
  },
  header: {
    fontSize: 16, fontWeight: 600, textAlign: 'center',
    color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
    padding: '20px 0 16px',
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.8px', color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
    marginBottom: 10,
  },
  card: {
    background: 'var(--ds-bg-canvas, rgba(255,255,255,0.03))',
    border: '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))',
    borderRadius: 12, overflow: 'hidden',
  },
  toolRow: {
    display: 'flex', alignItems: 'center', padding: '12px 16px',
  },
  subAgentButton: {
    padding: '14px 16px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    transition: 'background 0.12s',
  },
};
```

- [ ] **Step 2: Wire into App.jsx**

In `frontend/src/App.jsx`, add the import at the top:

```javascript
import AgentStudio from './components/AgentStudio';
```

Replace the placeholder from Task 1 Step 5:

```javascript
{activeView === 'agentStudio' ? (
  <AgentStudio
    bridge={bridge}
    onNavigateToPlusi={() => setActiveView('plusiMenu')}
  />
) : activeView === 'plusiMenu' ? (
  ...
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki, press Enter → verify Agent Studio renders with tool toggles and embedding status.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AgentStudio.jsx frontend/src/App.jsx
git commit -m "feat: create AgentStudio component with tool toggles and embedding status"
```

---

### Task 3: Create PlusiMenu Placeholder

**Files:**
- Create: `frontend/src/components/PlusiMenu.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/PlusiMenu.jsx`:

```jsx
import React from 'react';

export default function PlusiMenu() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px 140px', overflowY: 'auto',
    }}>
      <div style={{
        fontSize: 16, fontWeight: 600, textAlign: 'center',
        color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
        padding: '20px 0 16px',
      }}>
        Plusi
      </div>
      <div style={{
        fontSize: 13, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
        textAlign: 'center', padding: '40px 0',
      }}>
        Plusi-Menü wird in einem zukünftigen Update verfügbar sein.
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into App.jsx**

Import and replace the plusiMenu placeholder:

```javascript
import PlusiMenu from './components/PlusiMenu';

// In render:
activeView === 'plusiMenu' ? (
  <PlusiMenu />
) : ...
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Verify Enter from Agent Studio navigates to Plusi Menu, Enter again returns to Agent Studio.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlusiMenu.jsx frontend/src/App.jsx
git commit -m "feat: add PlusiMenu placeholder component"
```

---

### Task 4: Create ExtractInsightsButton Component

**Files:**
- Create: `frontend/src/components/ExtractInsightsButton.jsx`

- [ ] **Step 1: Create the component with all animation states**

Create `frontend/src/components/ExtractInsightsButton.jsx`:

```jsx
import React, { useState, useEffect } from 'react';

const KEYFRAMES = `
@keyframes ei-sparkle-float {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  15% { transform: scale(1) rotate(45deg); opacity: 1; }
  50% { transform: scale(0.8) rotate(90deg); opacity: 0.6; }
  100% { transform: scale(0) rotate(180deg); opacity: 0; }
}
@keyframes ei-shimmer-sweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes ei-scan {
  0% { left: -40%; }
  100% { left: 100%; }
}
@keyframes ei-star-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
@keyframes ei-glow-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
`;

// Sparkles SVG (Lucide 4-point star)
function SparklesIcon({ color = 'rgba(232,232,232,0.15)', size = 12, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}

export default function ExtractInsightsButton({ onExtract, messageCount = 0 }) {
  const [state, setState] = useState('idle'); // 'idle' | 'extracting' | 'done'
  const [isHovered, setIsHovered] = useState(false);

  // Inject keyframes
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ei-keyframes')) {
      const s = document.createElement('style');
      s.id = 'ei-keyframes';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
    }
  }, []);

  // Don't show until 3+ messages
  if (messageCount < 3 || state === 'done') return null;

  const handleClick = () => {
    if (state === 'extracting') return;
    setState('extracting');
    onExtract?.(() => setState('done'));
  };

  const isExtracting = state === 'extracting';
  const iconColor = isExtracting || isHovered
    ? 'rgba(10,132,255,0.45)'
    : 'rgba(232,232,232,0.15)';
  const textColor = isExtracting || isHovered
    ? 'rgba(10,132,255,0.4)'
    : 'rgba(232,232,232,0.15)';

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => { if (state === 'idle') setIsHovered(true); }}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, padding: '12px 0', cursor: isExtracting ? 'default' : 'pointer',
        position: 'relative',
      }}
    >
      {/* Hover glow */}
      {isHovered && !isExtracting && (
        <div style={{
          position: 'absolute', width: 140, height: 20,
          background: 'radial-gradient(ellipse, rgba(10,132,255,0.1), transparent)',
          borderRadius: '50%', animation: 'ei-glow-pulse 2.5s ease-in-out infinite',
          pointerEvents: 'none', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        }} />
      )}

      {/* Shimmer bar (extracting only) */}
      {isExtracting && (
        <div style={{
          position: 'relative', width: 180, height: 3, borderRadius: 2,
          overflow: 'hidden', background: 'rgba(255,255,255,0.03)',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.12), rgba(168,85,247,0.18), rgba(10,132,255,0.12), transparent)',
            backgroundSize: '200% 100%', animation: 'ei-shimmer-sweep 2s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', top: 0, height: '100%', width: '35%',
            background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.35), transparent)',
            animation: 'ei-scan 1.5s ease-in-out infinite', borderRadius: 2,
          }} />
        </div>
      )}

      {/* Icon + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
        <SparklesIcon
          color={iconColor}
          style={isExtracting ? { animation: 'ei-star-pulse 2s ease-in-out infinite' } : {}}
        />
        <span style={{ fontSize: 11, color: textColor }}>
          {isExtracting ? 'Extrahiere Erkenntnisse...' : 'Erkenntnisse extrahieren'}
        </span>
      </div>

      {/* Sparkle particles (hover + extracting) */}
      {(isHovered || isExtracting) && (
        <div style={{ position: 'absolute', width: 200, height: 30, top: -5, pointerEvents: 'none' }}>
          {[18, 38, 58, 75].map((left, i) => (
            <div key={i} style={{
              width: 2, height: 2, borderRadius: '50%',
              background: i % 2 === 0 ? 'rgba(10,132,255,0.6)' : 'rgba(255,255,255,0.3)',
              position: 'absolute', left: `${left}%`,
              animation: `ei-sparkle-float ${1.4 + i * 0.2}s ease-in-out ${i * 0.3}s infinite`,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ExtractInsightsButton.jsx
git commit -m "feat: create ExtractInsightsButton with sparkle animations"
```

---

### Task 5: Wire ExtractInsightsButton into Chat and Add Manual Extraction

**Files:**
- Modify: `frontend/src/App.jsx:2056-2063` (chat rendering area)
- Modify: `frontend/src/App.jsx:700-710` (remove auto-extraction on card advance)

- [ ] **Step 1: Import and render ExtractInsightsButton**

In `frontend/src/App.jsx`, add import:

```javascript
import ExtractInsightsButton from './components/ExtractInsightsButton';
```

Render it after the chat messages, before the bottom padding. Find the closing `</>` of the chat messages block and add before it:

```jsx
<ExtractInsightsButton
  messageCount={chatHook.messages.length}
  onExtract={(onDone) => {
    if (cardContextHook.cardContext?.cardId) {
      insightsHook.extractInsights(
        cardContextHook.cardContext.cardId,
        cardContextHook.cardContext,
        chatHook.messages,
        null
      );
    }
    // Mark done after extraction completes (or timeout as fallback)
    const checkDone = setInterval(() => {
      if (!insightsHook.isExtracting) {
        clearInterval(checkDone);
        onDone?.();
      }
    }, 500);
  }}
/>
```

- [ ] **Step 2: Remove automatic extraction on card advance**

In App.jsx around line 708 and 1172, find the `_insights.extractInsights(...)` calls that auto-trigger on card change. Comment them out or remove them:

```javascript
// Removed: automatic insight extraction on card advance
// Manual extraction via ExtractInsightsButton is now used instead
```

Keep the extraction in `handleResetChat` (line 1825) — that's user-triggered.

- [ ] **Step 3: Remove showInsightsDashboard toggle logic**

Remove the `showInsightsDashboard` state (line 167) and all its references. This is safe because Task 1 Step 3 already replaced the `actionSecondary` that referenced it. Remaining references to find and remove: the state declaration, the `useEffect` that resets it (around line 1840), and the conditional rendering check at line 2056. The InsightsDashboard is now shown simply when `chatHook.messages.length === 0`. Update the conditional at line 2056:

```javascript
{activeView === 'agentStudio' ? (
  <AgentStudio ... />
) : activeView === 'plusiMenu' ? (
  <PlusiMenu />
) : chatHook.messages.length === 0 && !chatHook.isLoading && !chatHook.streamingMessage ? (
  <InsightsDashboard ... />
) : (
  <>
    {/* chat messages + ExtractInsightsButton */}
  </>
)}
```

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

Verify: Chat with 3+ messages shows the sparkles button. Clicking it triggers extraction with animation. Space during extraction advances to next card (background extraction).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: wire manual insight extraction, remove auto-extraction on card advance"
```

---

### Task 6: Add "Neu" Marking to InsightsDashboard

**Files:**
- Modify: `frontend/src/components/InsightBullet.jsx` — add optional `bulletColor` prop
- Modify: `frontend/src/components/InsightsDashboard.jsx` — add `newInsightIds` prop
- Modify: `frontend/src/hooks/useInsights.js` (or wherever insights state lives) — track new insight indices

- [ ] **Step 1: Add bulletColor prop to InsightBullet**

In `frontend/src/components/InsightBullet.jsx`, update the component to accept an optional `bulletColor` prop. Find where the dot color is set (via `DOT_COLORS[type]` around line 16) and add a fallback:

```javascript
// In the component signature, add bulletColor param:
export default function InsightBullet({ text, type, citations, onCitationClick, bulletColor }) {

// Where the dot is rendered, use bulletColor if provided:
const dotColor = bulletColor || DOT_COLORS[type] || DOT_COLORS.default;
```

- [ ] **Step 2: Add newInsightIds prop to InsightsDashboard**

In `frontend/src/components/InsightsDashboard.jsx`, update the function signature:

```javascript
export default function InsightsDashboard({
  insights = { version: 1, insights: [] },
  cardStats = {},
  chartData = { main: [], flip: [], mc: [], text: [] },
  isExtracting = false,
  onCitationClick,
  newInsightIds = [],
}) {
```

- [ ] **Step 3: Add "neu" marking to insight rendering**

In the insights mapping (around line 48-56), wrap each InsightBullet to pass `bulletColor` and show "neu" label:

```jsx
{insights.insights.map((insight, i) => {
  const isNew = newInsightIds.includes(i);
  return (
    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <InsightBullet
        text={insight.text}
        type={insight.type}
        citations={insight.citations}
        onCitationClick={onCitationClick}
        bulletColor={isNew ? 'rgba(10,132,255,0.4)' : undefined}
      />
      {isNew && (
        <span style={{
          fontSize: 9, color: 'rgba(10,132,255,0.35)',
          fontWeight: 500, flexShrink: 0, marginTop: 4,
        }}>
          neu
        </span>
      )}
    </div>
  );
})}
```

- [ ] **Step 4: Add newInsightIds tracking to useInsights hook**

Find the `useInsights` hook (search for `useInsights` in `frontend/src/hooks/`). Add state tracking:

```javascript
const [newInsightIds, setNewInsightIds] = useState([]);

// In the extractInsights function, after new insights are added:
// Calculate which indices are new (compare old count vs new count)
const oldCount = insights.insights?.length || 0;
// ... after extraction completes:
const newCount = updatedInsights.insights?.length || 0;
const newIds = [];
for (let i = oldCount; i < newCount; i++) newIds.push(i);
setNewInsightIds(newIds);

// Expose a clearNewInsights function:
const clearNewInsights = useCallback(() => setNewInsightIds([]), []);
```

Return `newInsightIds` and `clearNewInsights` from the hook.

- [ ] **Step 5: Pass newInsightIds from App.jsx and clear on mount**

```jsx
<InsightsDashboard
  insights={insightsHook.insights}
  cardStats={cardContextHook.cardContext?.stats || {}}
  chartData={insightsHook.chartData}
  isExtracting={insightsHook.isExtracting}
  onCitationClick={(cardId) => bridge.goToCard?.(String(cardId))}
  newInsightIds={insightsHook.newInsightIds || []}
/>
```

In InsightsDashboard, add a `useEffect` to clear the "neu" marking after the component has been seen:

```javascript
useEffect(() => {
  if (newInsightIds.length > 0) {
    // Clear after a short delay so the user sees the marking
    const timer = setTimeout(() => {
      // Call parent's clearNewInsights via a new onSeen prop
    }, 3000);
    return () => clearTimeout(timer);
  }
}, [newInsightIds]);
```

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

Verify: After extracting insights, the InsightsDashboard shows new items with blue bullets and "neu" labels. After 3 seconds, the "neu" labels fade.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/InsightBullet.jsx frontend/src/components/InsightsDashboard.jsx frontend/src/hooks/useInsights.js frontend/src/App.jsx
git commit -m "feat: add 'neu' marking to InsightsDashboard for newly extracted insights"
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/InsightsDashboard.jsx frontend/src/App.jsx
git commit -m "feat: add 'neu' marking to InsightsDashboard for newly extracted insights"
```

---

### Task 7: Remove Lernkarte Pill

**Files:**
- Modify: `frontend/src/components/ContextSurface.jsx`

- [ ] **Step 1: Remove FloatingSectionPill rendering**

In `frontend/src/components/ContextSurface.jsx`, find the `FloatingSectionPill` component (lines 76-246) and its rendering. Remove the component definition and its usage. Keep the rest of ContextSurface intact (session header, etc.).

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

Verify: The "Lernkarte" pill no longer appears at the top of the chat panel.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ContextSurface.jsx
git commit -m "refactor: remove FloatingSectionPill (Lernkarte pill) from ContextSurface"
```

---

### Task 8: Remove Agent Tab from Settings

**Files:**
- Modify: `settings.html`
- Modify: `ui/settings.py`

- [ ] **Step 1: Remove Agent tab from settings.html**

In `settings.html`:
1. Remove the tab bar (`.tab-bar` with Konto/Agent pills) — since only one section remains
2. Remove the entire `<div class="tab-content" id="tab-agent">` block (lines 420-465)
3. Remove the `switchTab()` function
4. Make `tab-konto` always visible (remove `tab-content` class, add `display: block`)
5. Remove `renderTools()` and `renderEmbeddingStatus()` functions and their calls in `renderAll()`

- [ ] **Step 2: Clean up settings.py if needed**

In `ui/settings.py`, check if the window sizing needs adjustment now that the Agent tab is gone. The window may need to be smaller.

- [ ] **Step 3: Build and verify**

Restart Anki, open settings. Verify: Only Konto content is shown, no tab bar, no Agent settings.

- [ ] **Step 4: Commit**

```bash
git add settings.html ui/settings.py
git commit -m "refactor: remove Agent tab from settings, keep only Konto content"
```

---

### Task 9: Hide Enter Shortcut Hint When Input Focused

**Files:**
- Modify: `shared/components/ChatInput.tsx`

- [ ] **Step 1: Add focus state tracking**

In `shared/components/ChatInput.tsx`, add a state for input focus:

```typescript
const [isInputFocused, setIsInputFocused] = useState(false);
```

Add `onFocus` and `onBlur` handlers to the textarea:

```typescript
onFocus={() => setIsInputFocused(true)}
onBlur={() => setIsInputFocused(false)}
```

- [ ] **Step 2: Conditionally hide the Enter shortcut**

In the action buttons rendering area (around line 258-319), find the secondary action button's shortcut display. Conditionally hide the shortcut text when focused:

```typescript
{!isInputFocused && actionSecondary?.shortcut && (
  <span className="...">{actionSecondary.shortcut}</span>
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Verify: When clicking into the input field, the "↵" hint next to "Agent Studio" disappears. When clicking out, it reappears.

- [ ] **Step 4: Commit**

```bash
git add shared/components/ChatInput.tsx
git commit -m "feat: hide Enter shortcut hint when chat input is focused"
```

---

### Task 10: Final Integration Test

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Test all navigation flows**

Restart Anki and verify:
1. Enter opens Agent Studio from empty chat
2. Enter from Agent Studio goes to Plusi Menu
3. Enter from Plusi Menu returns to Agent Studio
4. Space closes from any view back to Chat
5. Cmd+. toggles Agent Studio from chat
6. Typing text + Enter sends message and returns to chat
7. Chat messages/scroll/input preserved across view switches
8. Tool toggles in Agent Studio save and persist
9. Embedding status shows and updates
10. Sparkles extraction button appears at 3+ messages
11. Extraction animation plays, insights appear in empty state with "neu"
12. Lernkarte pill is gone
13. Settings popup shows only Konto content

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for Agent Studio"
```
