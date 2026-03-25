# SP2 Conservative Sidebar Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace QDockWidget with a CSS-positioned sidebar inside MainViewWidget while keeping ALL internals (widget.py, bridge.py, App.jsx, useAnki.js, CardTracker) untouched.

**Architecture:** MainViewWidget gets a second child widget (ChatbotWidget instance) that displays the session chat. In review state: main web_view hides, sidebar shows at 450px right. In deckBrowser/overview: sidebar hides, main web_view fullscreen.

**Tech Stack:** Python/PyQt6, existing ChatbotWidget class, existing React frontend

**Spec:** `docs/superpowers/specs/2026-03-23-sp2-conservative-sidebar-migration.md`
**Lessons:** `memory/project_sp2_lessons_learned.md` — NEVER touch widget.py, bridge.py, App.jsx, useAnki.js, custom_reviewer, CardTracker

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `ui/main_view.py` | MODIFY | Add sidebar_widget (ChatbotWidget), layout logic for review vs fullscreen, toggle/show/hide sidebar |
| `ui/setup.py` | MODIFY | Remove QDockWidget creation, redirect ensure_chatbot_open/toggle/get_chatbot_widget to MainViewWidget sidebar |
| `__init__.py` | MODIFY | Minimal — verify close_chatbot_panel calls work, no structural changes |

**DO NOT TOUCH:** `ui/widget.py`, `ui/bridge.py`, `frontend/src/App.jsx`, `frontend/src/hooks/useAnki.js`, `custom_reviewer/*`, `utils/card_tracker.py`

---

### Task 1: Add sidebar support to MainViewWidget

**Files:**
- Modify: `ui/main_view.py`

- [ ] **Step 1: Add sidebar properties and _ensure_sidebar() method**
- [ ] **Step 2: Add show_sidebar / hide_sidebar / toggle_sidebar**
- [ ] **Step 3: Modify show_for_state() to handle review state**
- [ ] **Step 4: Modify _position_over_main() for review layout**
- [ ] **Step 5: Add _notify_reviewer_chat_state helper**
- [ ] **Step 6: Add get_sidebar_widget() accessor**
- [ ] **Step 7: Commit**

---

### Task 2: Remove QDockWidget, redirect to sidebar

**Files:**
- Modify: `ui/setup.py`

- [ ] **Step 1: Remove _create_chatbot_dock() and dock globals**
- [ ] **Step 2: Rewrite get_chatbot_widget() to return sidebar widget**
- [ ] **Step 3: Rewrite ensure_chatbot_open() to use sidebar**
- [ ] **Step 4: Rewrite toggle_chatbot_panel() and close_chatbot_panel()**
- [ ] **Step 5: Simplify on_state_did_change()**
- [ ] **Step 6: Clean up unused imports and functions**
- [ ] **Step 7: Commit**

---

### Task 3: Update __init__.py references

**Files:**
- Modify: `__init__.py`

- [ ] **Step 1: Verify imports still work**
- [ ] **Step 2: Minimal cleanup of dead references**
- [ ] **Step 3: Commit**

---

### Task 4: Smoke test and fix edge cases

- [ ] **Step 1: Build frontend (verify no changes needed)**
- [ ] **Step 2: Test in Anki**
- [ ] **Step 3: Fix any layout/timing issues**
- [ ] **Step 4: Final commit**
