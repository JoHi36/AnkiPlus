# Chat System Phase 3 — Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** Add SectionDivider trend indicators, smooth chat animations, and clean up old multi-provider settings.

**Spec:** `docs/superpowers/specs/2026-03-18-chat-system-redesign.md`

---

### Task 1: SectionDivider trend indicator

**Files:**
- Modify: `frontend/src/components/SectionDivider.jsx`

Add a trend indicator (↑↓→) showing performance change from previous review.

- [ ] **Step 1: Read current SectionDivider.jsx and understand props**
- [ ] **Step 2: Add trend calculation logic**

The section data should include `previous_score` (from the review_sections table). Calculate trend:

```javascript
function getTrend(section) {
  const currentData = section.performanceData || section.performance_data;
  const previousScore = section.previousScore ?? section.previous_score;

  if (previousScore == null) return null; // First review

  let currentScore = null;
  if (typeof currentData === 'string') {
    try { currentScore = JSON.parse(currentData)?.score; } catch {}
  } else if (currentData) {
    currentScore = currentData.score;
  }

  if (currentScore == null) return null;

  const delta = currentScore - previousScore;
  if (delta > 5) return { direction: 'up', symbol: '↑', color: '#22c55e' };
  if (delta < -5) return { direction: 'down', symbol: '↓', color: '#ef4444' };
  return { direction: 'same', symbol: '→', color: '#94a3b8' };
}
```

- [ ] **Step 3: Render trend indicator next to score**

Add a small trend badge next to the performance badge. Style it inline, subtle:

```jsx
{trend && (
  <span style={{
    color: trend.color,
    fontSize: '0.75rem',
    fontWeight: 600,
    marginLeft: '4px'
  }}>
    {trend.symbol}
  </span>
)}
```

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

---

### Task 2: Clean up old multi-provider settings

**Files:**
- Modify: `settings.html`
- Modify: `settings_window.py`

Remove or disable OpenAI/Anthropic provider selection since everything runs on Gemini now.

- [ ] **Step 1: Read settings.html and settings_window.py**

Understand current settings UI structure.

- [ ] **Step 2: Simplify provider settings**

In settings.html:
- Hide or remove provider selection dropdown (OpenAI, Anthropic, Google)
- Hide or remove API key input fields for OpenAI and Anthropic
- Keep Gemini/Google API key field if it exists
- Keep model selection (only Gemini models)

In settings_window.py:
- Remove or comment out OpenAI/Anthropic API key saving logic
- Keep Gemini config logic

IMPORTANT: Don't delete the backend code that handles multiple providers (in ai_handler.py) — just hide the UI. The code might be needed for future flexibility.

- [ ] **Step 3: Commit**

---

### Task 3: Final build and verification

- [ ] **Step 1: Python syntax check all modified files**
- [ ] **Step 2: Frontend build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Verify complete file list of changes across all 3 phases**

List all files that were created or modified.

- [ ] **Step 4: Commit**

---

## Summary

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | SectionDivider trend indicator | Simple |
| 2 | Clean up multi-provider settings | Simple |
| 3 | Final build and verification | Simple |
