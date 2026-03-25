# AnkiPlus Production Stabilization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform AnkiPlus from feature-complete prototype into production-ready, clean, performant codebase — professional quality throughout.

**Architecture:** No structural changes. Same files, same patterns. This plan fixes what's broken, removes noise, adds safety, and improves performance — nothing else. App.jsx refactoring is intentionally deferred to a separate plan after stabilization.

**Tech Stack:** Python 3.9+ / PyQt6 / React 18 / Vite / Tailwind / SQLite

**Scope:** Backend + Frontend code quality. User handles frontend polish/features in parallel.

---

## Phase 1: Remove Production Noise (console statements, debug logging)

**Why first:** This is the highest-volume, lowest-risk change. 230+ console statements across 26+ files in production React code. Removing these makes every subsequent diff cleaner and the runtime quieter.

---

### Task 1: Strip all console statements from React production code

**Approach:** Grep-based sweep of ALL files — not a pre-enumerated list. Console statements regrow naturally during development, so we also add a Vite build config to strip them automatically in production.

**Strategy:**
- `console.error` in catch blocks → remove entirely (errors should be silent in production, or use a proper error boundary)
- `console.log` for debugging → remove entirely
- `console.warn` for deprecation notices → remove (these are internal, not library APIs)
- Exception: Keep `console.error` in `ErrorBoundary.jsx` (that's its job)

**Known high-count files (26+ files total, ~230 statements):**
- `hooks/useAnki.js` (~82), `hooks/useChat.js` (~44), `components/ChatMessage.jsx` (~44), `App.jsx` (~37)
- `contexts/SessionContext.jsx` (~10), `hooks/useAgenticMessage.js` (~10), `hooks/useModels.js` (~9)
- `components/SectionDropdown.jsx` (~11), `hooks/useCardSession.js` (~4), `hooks/useFreeChat.js` (~3)
- `hooks/useDeckTracking.js` (~3), `hooks/useQuotaDisplay.js` (~2), `utils/sessions.js` (~7)
- `utils/deviceId.js` (~2), `components/Header.jsx` (~3), `components/SessionView/SessionHeader.jsx` (~4)
- Plus ~10 more files with 1-2 statements each

- [ ] **Step 1:** Run `grep -rn 'console\.' frontend/src/ --include='*.jsx' --include='*.tsx' --include='*.js' --include='*.ts' | grep -v node_modules | wc -l` to get exact count
- [ ] **Step 2:** Work through ALL files with console statements, starting with highest-count files
- [ ] **Step 3:** Remove all `console.` from `App.jsx` (including `console.error('[v2-render]...')` in render path)
- [ ] **Step 4:** Remove all `console.` from hooks (`useAnki.js`, `useChat.js`, `useAgenticMessage.js`, `useModels.js`, `useCardSession.js`, `useFreeChat.js`, `useDeckTracking.js`, `useQuotaDisplay.js`)
- [ ] **Step 5:** Remove all `console.` from components (`ChatMessage.jsx`, `SectionDropdown.jsx`, `Header.jsx`, `SessionHeader.jsx`, `SessionList.jsx`, `DeckBrowser.jsx`, all others found in Step 1)
- [ ] **Step 6:** Remove all `console.` from utils (`sessions.js`, `deviceId.js`, `actions.js`, `eventBus.js` — keep eventBus error handler)
- [ ] **Step 7:** Add Vite production console stripping to `frontend/vite.config.js`:
```js
build: {
  // ... existing config
  esbuild: {
    drop: ['console', 'debugger'],
  },
}
```
- [ ] **Step 8:** Verify build succeeds: `cd frontend && npm run build`
- [ ] **Step 9:** Commit: `chore: remove 230+ console statements and add Vite auto-strip for production`

---

## Phase 2: Python Safety — Error Handling & Crash Prevention

**Why second:** These are silent crash risks. Each one is a potential user-facing failure that currently either swallows bugs or crashes Anki. Fixing these makes the addon robust under real-world conditions.

---

### Task 3: Replace bare `except:` with specific exception types

**Files:**
- Modify: `ui/shortcut_filter.py` — Lines 13, 16: `except Exception:` → `except ImportError:` (covers ModuleNotFoundError automatically)
- Modify: `research/pubmed.py` — Line 40: `except Exception:` → `except (urllib.error.URLError, xml.etree.ElementTree.ParseError, KeyError) as e:`
- Modify: `research/search.py` — Lines 66, 168, 196, 218: `except Exception:` → specific types per context
- Modify: `research/openrouter.py` — Line 99: `except Exception:` → `except (urllib.error.URLError, json.JSONDecodeError, KeyError) as e:`
- Modify: `ai/tutor.py` — Lines 99, 115: `except Exception:` → `except (AttributeError, KeyError):` and `except (ImportError, AttributeError):`
- Modify: `utils/card_tracker.py` — Line 208: `except Exception:` → `except Exception as e:` with `logger.debug()`

- [ ] **Step 1:** Fix `ui/shortcut_filter.py` — 2 import fallbacks: change to `except ImportError:` (ModuleNotFoundError is a subclass)
- [ ] **Step 2:** Fix `research/pubmed.py` — line 40: change to `except (urllib.error.URLError, ET.ParseError, KeyError) as e:` with `logger.warning()`
- [ ] **Step 3:** Fix `research/search.py` — 4 instances: read each context, determine correct exception types (likely `urllib.error.URLError`, `json.JSONDecodeError`, `KeyError`, `ValueError`)
- [ ] **Step 4:** Fix `research/openrouter.py` — line 99: `except (urllib.error.URLError, json.JSONDecodeError, KeyError, ValueError) as e:`
- [ ] **Step 5:** Fix `ai/tutor.py` — lines 99, 115: narrow to specific types
- [ ] **Step 6:** Fix `utils/card_tracker.py` — line 208: add `logger.debug("Embedding failed for card: %s", e)`
- [ ] **Step 7:** Run tests: `python3 run_tests.py`
- [ ] **Step 8:** Commit: `fix: replace 11 bare except clauses with specific exception types`

---

### Task 4: Add `mw.col` None guards

**Files:**
- Modify: `custom_reviewer/__init__.py` — Lines 44, 119, 264, 271, 278, 286 (6 unguarded accesses)
- Modify: `ui/widget.py` — Lines 1709, 1713, 1729, 1814-1816, 1954, 1979 (6 unguarded accesses)

**Pattern:** Add early return guard at the top of each function or code block:
```python
if not mw or not mw.col:
    logger.warning("mw.col not available, skipping operation")
    return  # or return appropriate default
```

- [ ] **Step 1:** Read `custom_reviewer/__init__.py` around lines 44, 119, 264-286 — identify each function boundary
- [ ] **Step 2:** Add guards to all 6 unprotected `mw.col` accesses in `custom_reviewer/__init__.py`
- [ ] **Step 3:** Read `ui/widget.py` around lines 1709-1729 and 1814-1979 — identify each function boundary
- [ ] **Step 4:** Add guards to all 6 unprotected `mw.col` accesses in `ui/widget.py`
- [ ] **Step 5:** Run tests: `python3 run_tests.py`
- [ ] **Step 6:** Commit: `fix: add mw.col None guards to prevent crashes when collection unavailable`

---

### Task 5: Wrap unprotected `json.loads()` calls

**Files:**
- Modify: `ui/widget.py` — Lines 445-446, 480-482 (lambdas with json.loads), lines 601, 606, 611, 616
- Modify: `storage/insights.py` — Line 179
- Modify: `research/pubmed.py` — Lines 58, 70

**Pattern:**
```python
# Before (crashes on malformed JSON):
data = json.loads(result)

# After:
try:
    data = json.loads(result)
except (json.JSONDecodeError, TypeError) as e:
    logger.warning("Failed to parse JSON: %s", e)
    data = {}  # or appropriate default
```

- [ ] **Step 1:** Read `ui/widget.py` lines 440-490 — fix lambda json.loads calls (wrap in helper function)
- [ ] **Step 2:** Read `ui/widget.py` lines 595-620 — wrap message handler json.loads
- [ ] **Step 3:** Fix `storage/insights.py` line 179 — add json.JSONDecodeError catch
- [ ] **Step 4:** Fix `research/pubmed.py` lines 58, 70 — add json.JSONDecodeError to existing catch
- [ ] **Step 5:** Run tests: `python3 run_tests.py`
- [ ] **Step 6:** Commit: `fix: add JSON parse error handling to 10+ unprotected json.loads calls`

---

### Task 6: Thread safety — WeakRef for object references in background threads

**Files:**
- Modify: `ui/widget.py` — AIRequestThread (holds `widget_ref` and `ai_handler` directly), InsightExtractionThread (holds `ai_handler` directly)
- Modify: `plusi/agent.py` — Thread that calls widget methods (~line 773)

**Note:** SubagentThread holds `run_fn` and `kwargs`, not a widget — it does NOT need WeakRef. Focus on AIRequestThread and InsightExtractionThread which hold direct object references that could be GC'd.

**Pattern:**
```python
import weakref

class AIRequestThread(QThread):
    def __init__(self, ai_handler, text, widget_ref, ...):
        self._handler_ref = weakref.ref(ai_handler)
        self._widget_ref = weakref.ref(widget_ref) if widget_ref else lambda: None
        ...

    def run(self):
        handler = self._handler_ref()
        widget = self._widget_ref()
        if handler is None or widget is None:
            return  # objects were destroyed, abort safely
        ...
```

- [ ] **Step 1:** Read `ui/widget.py` — find AIRequestThread, SubagentThread, InsightExtractionThread class definitions and understand what each holds
- [ ] **Step 2:** In AIRequestThread: convert `self.widget_ref` and `self.ai_handler` to `weakref.ref()` with None checks in `run()`
- [ ] **Step 3:** In InsightExtractionThread: convert `self.ai_handler` to `weakref.ref()` with None check
- [ ] **Step 4:** SubagentThread: leave as-is (holds `run_fn`/`kwargs`, not widget references)
- [ ] **Step 5:** Also update `_pipeline_signal_callback` and `_msg_event_callback` assignments (~lines 135, 143) which capture `self.ai_handler`
- [ ] **Step 6:** Read `plusi/agent.py` ~line 773 — verify if thread captures widget/mw references, apply WeakRef if needed
- [ ] **Step 7:** Run tests: `python3 run_tests.py`
- [ ] **Step 8:** Commit: `fix: use WeakRef for object references in background threads`

---

## Phase 3: React Performance

**Why third:** These changes make the UI noticeably faster. Users feel the difference, especially with long chat histories.

---

### Task 7: Add React.memo to list-rendered components

**Note:** ChatMessage.jsx is ALREADY memoized with a custom comparator (~line 1994-2010). Do NOT touch it — the existing comparator is more complete than a naive replacement. StreamingChatMessage is also already memoized. Focus on components that genuinely lack memoization.

**Files:**
- Verify: `frontend/src/components/ChatMessage.jsx` — Confirm memo exists and comparator is correct (no changes needed)
- Verify: `frontend/src/components/StreamingChatMessage.jsx` — Confirm memo exists (no changes needed)
- Modify: `frontend/src/components/DeckBrowser.jsx` — Wrap SessionRow in React.memo
- Modify: `frontend/src/components/CardListWidget.jsx` — Extract card row to named component, wrap in memo
- Modify: `frontend/src/components/AgentCard.jsx` — Wrap in React.memo

- [ ] **Step 1:** Verify ChatMessage.jsx already has React.memo with custom comparator — confirm no changes needed
- [ ] **Step 2:** Verify StreamingChatMessage.jsx already has React.memo — confirm no changes needed
- [ ] **Step 3:** Wrap SessionRow (inside DeckBrowser.jsx) in React.memo
- [ ] **Step 4:** Extract CardListWidget card row to named component, wrap in React.memo
- [ ] **Step 5:** Wrap AgentCard export in React.memo
- [ ] **Step 6:** Build and verify: `cd frontend && npm run build`
- [ ] **Step 7:** Commit: `perf: add React.memo to 3 list-rendered components`

---

### Task 8: Extract inline style objects to constants

**Files:**
- Modify: `frontend/src/App.jsx` — Extract skeleton/shimmer styles (~lines 2945-2980) to module-level constants
- Modify: `frontend/src/components/DeckBrowser.jsx` — Extract 29 inline styles to top-level consts or CSS classes
- Modify: `frontend/src/components/AgentCard.jsx` — Extract 18 inline styles
- Modify: `frontend/src/components/CardListWidget.jsx` — Extract 15 inline styles

**Pattern:**
```jsx
// Before (creates new object every render):
<div style={{ padding: '8px 0', display: 'flex', gap: 8 }}>

// After (stable reference):
const SKELETON_CONTAINER = { padding: '8px 0', display: 'flex', gap: 8 };
// ... in render:
<div style={SKELETON_CONTAINER}>
```

**Rule:** Only extract styles that use `var(--ds-*)` tokens or pure layout values. If a style has a hardcoded color, fix the color to use a design token first.

- [ ] **Step 1:** Extract App.jsx skeleton/shimmer styles (lines 2945-2980) to module constants
- [ ] **Step 2:** Extract DeckBrowser.jsx inline styles — prioritize styles inside `.map()` loops
- [ ] **Step 3:** Extract AgentCard.jsx inline styles
- [ ] **Step 4:** Extract CardListWidget.jsx inline styles
- [ ] **Step 5:** Build and verify: `cd frontend && npm run build`
- [ ] **Step 6:** Commit: `perf: extract 70+ inline style objects to stable constants`

---

### Task 9: Fix Mermaid color reference errors

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx` — Lines 752-791: References `MERMAID_NODE_BG`, `MERMAID_NODE_ALT_A`, `MERMAID_NODE_ALT_B`, `MERMAID_DEEP_BG` which are undefined

- [ ] **Step 1:** Read ChatMessage.jsx lines 450-480 — find where MERMAID_ACCENT etc. are defined
- [ ] **Step 2:** Read ChatMessage.jsx lines 750-795 — find the undefined references
- [ ] **Step 3:** Define missing constants or connect them to getMermaidPalette() return values
- [ ] **Step 4:** Build and verify: `cd frontend && npm run build`
- [ ] **Step 5:** Commit: `fix: define missing Mermaid color constants (prevents ReferenceError)`

---

## Phase 4: Design System Compliance

**Why fourth:** The design system exists and is good — but ~15 components violate it. This phase enforces the existing rules, especially for light mode correctness.

---

### Task 10: Audit and fix hardcoded colors in components

**Approach:** Start with a fresh grep audit — do NOT trust pre-counted numbers. Some files reported as violations may already be compliant.

- [ ] **Step 1:** Run full audit: `grep -rn "rgba\|rgb(\|#[0-9a-fA-F]\{3,8\}\b\|'white'\|'black'" frontend/src/components/ --include='*.jsx' --include='*.tsx'` to get actual current violations
- [ ] **Step 2:** Exclude acceptable exceptions: Mermaid palette in ChatMessage.jsx (Mermaid requires string hex values, not CSS vars — define at module top as named constants)

**Files to fix (verify violation counts with grep first):**
- `frontend/src/components/AutonomyCard.jsx` — ~12 violations
- `frontend/src/components/PersonalityGrid.jsx` — ~10 violations
- `frontend/src/components/PlusiWidget.jsx` — colorMix with hardcoded `#0a84ff` fallback
- `frontend/src/components/ImageWidget.jsx` — ~1 violation (`#ffffff`)
- `frontend/src/components/ResearchContent.jsx` — ~2 violations
- Other files found in Step 1

**Mapping reference** (from design-system.css):
- White text → `var(--ds-text-primary)` or `var(--ds-text-secondary)` or `var(--ds-text-tertiary)`
- Dark backgrounds → `var(--ds-bg-deep)` or `var(--ds-bg-canvas)` or `var(--ds-bg-frosted)`
- Accent blue → `var(--ds-accent)`
- Borders → `var(--ds-border)` or `var(--ds-border-subtle)`
- Transparent overlays → `var(--ds-hover-tint)` or `var(--ds-active-tint)`
- Semantic colors → `var(--ds-green)`, `var(--ds-red)`, `var(--ds-yellow)`, `var(--ds-purple)`

- [ ] **Step 3:** Fix each file found in Step 1, replacing hardcoded colors with `var(--ds-*)` tokens
- [ ] **Step 4:** Fix PlusiWidget.jsx — replace `#0a84ff` fallback with `var(--ds-accent)`
- [ ] **Step 5:** Build and verify: `cd frontend && npm run build`
- [ ] **Step 6:** Verify dark AND light mode in Component Viewer
- [ ] **Step 7:** Commit: `style: replace hardcoded colors with design system tokens`

---

## Phase 5: Critical Test Coverage

**Why fifth:** With the code cleaned up, we can now write tests with confidence. Focus on the highest-risk untested code: the AI/API boundary and the bridge.

---

### Task 11: Add tests for `ai/gemini.py` error handling

**Files:**
- Create: `tests/test_gemini.py`
- Read: `ai/gemini.py` — understand retry_with_backoff, error codes, streaming

**Test cases (error paths only — happy path is tested via integration):**
```python
test_gemini_retry_on_500()              # Retries on server error
test_gemini_no_retry_on_400()           # No retry on client error
test_gemini_timeout_handling()           # Request exceeds timeout
test_gemini_malformed_json_response()   # Invalid JSON in response
test_gemini_empty_response_body()       # Empty response
test_gemini_rate_limit_429()            # 429 triggers backoff
test_gemini_streaming_interrupted()     # Stream closes mid-chunk
```

- [ ] **Step 1:** Read `ai/gemini.py` — identify all error handling paths, retry logic, and public API
- [ ] **Step 2:** Write 7 tests for error paths with mocked urllib/API responses
- [ ] **Step 3:** Run tests: `python3 run_tests.py -k gemini -v`
- [ ] **Step 4:** Fix any issues found during test writing
- [ ] **Step 5:** Commit: `test: add 7 error path tests for Gemini API integration`

---

### Task 12: Add tests for `ai/auth.py` token management

**Files:**
- Create: `tests/test_auth.py`
- Read: `ai/auth.py` — understand token refresh, JWT validation, expiry

**Test cases:**
```python
test_refresh_token_expired()           # Refresh token invalid → error
test_refresh_token_missing()           # No refresh token → graceful failure
test_jwt_validation_malformed()        # Bad JWT → rejected
test_token_expiry_detection()          # Detects soon-to-expire tokens
test_get_auth_headers_no_token()       # No token → no auth header (not crash)
```

- [ ] **Step 1:** Read `ai/auth.py` — identify public API and error paths
- [ ] **Step 2:** Write 5 tests with mocked network responses
- [ ] **Step 3:** Run tests: `python3 run_tests.py -k auth -v`
- [ ] **Step 4:** Commit: `test: add 5 tests for auth token management`

---

### Task 13: Add tests for `ui/bridge.py` critical methods

**Files:**
- Create: `tests/test_bridge.py`
- Read: `ui/bridge.py` — focus on methods that parse JSON or access mw.col

**Test cases (mock Qt/Anki, test logic only):**
```python
test_send_message_valid_json()         # Valid message → processed
test_send_message_invalid_json()       # Malformed JSON → error response, no crash
test_load_card_session_missing()       # Nonexistent card → empty session
test_get_current_deck_no_collection()  # mw.col is None → graceful error
test_save_settings_validates()         # Invalid config → rejected
test_cancel_request_idempotent()       # Double cancel → no crash
```

- [ ] **Step 1:** Read `ui/bridge.py` — identify methods that handle external input
- [ ] **Step 2:** Set up mocking strategy for Qt/Anki. The existing `run_tests.py` already mocks `aqt`/PyQt module tree with a `_Mock` class. For bridge tests, extend this to mock: `QObject` (base class), `pyqtSlot` (decorator — can be identity function), and `mw.col` (mock with `get_card()`, `decks`, `find_cards()` methods). Pattern: create a `MockCollection` class with the subset of methods bridge.py actually calls.
- [ ] **Step 3:** Write 6 tests for critical bridge methods — focus on methods that parse JSON input or access mw.col
- [ ] **Step 4:** Run tests: `python3 run_tests.py -k bridge -v`
- [ ] **Step 5:** Commit: `test: add 6 tests for WebBridge critical methods`

---

### Task 14: Add edge case tests to existing test files

**Files:**
- Modify: `tests/test_card_sessions.py` — Add: concurrent access, malformed JSON, MAX_MESSAGES limit
- Modify: `tests/test_config.py` — Add: missing keys, write permission, partial config merge
- Modify: `tests/test_router.py` — Add: empty query, malformed routing result, timeout

**Test cases (3-4 per file):**

- [ ] **Step 1:** Add 3 edge case tests to `test_card_sessions.py` (empty input, 200+ messages, corrupted JSON)
- [ ] **Step 2:** Add 3 edge case tests to `test_config.py` (missing nested keys, invalid types, empty config)
- [ ] **Step 3:** Add 3 edge case tests to `test_router.py` (empty query, null agent, malformed JSON)
- [ ] **Step 4:** Run all tests: `python3 run_tests.py -v`
- [ ] **Step 5:** Commit: `test: add 9 edge case tests for sessions, config, and router`

---

## Phase 6: Code Cleanup & Dead Code Removal

**Why last:** Now that tests exist and code is safe, we can confidently remove dead code and clean up.

---

### Task 15: Remove dead code and unused variables

**Files:**
- Modify: `frontend/src/App.jsx` — Lines 3024-3028: Empty JSX fragment blocks (old chat input, card preview comments)
- Audit: All `// removed`, `// deprecated`, `// TODO` comments — remove if code is already removed
- Audit: Unused imports across frontend components

**Note:** `mermaidInitializedTheme` in ChatMessage.jsx is NOT dead code — it's a theme-change guard that prevents redundant mermaid re-initialization. Do NOT remove it.

- [ ] **Step 1:** Remove empty JSX fragment blocks from App.jsx (lines 3024-3028, 3030)
- [ ] **Step 2:** Run `cd frontend && npx eslint src/ --rule 'no-unused-vars: warn'` to find unused vars
- [ ] **Step 3:** Remove unused imports and variables (verify each is truly unused before removing)
- [ ] **Step 4:** Build and verify: `cd frontend && npm run build`
- [ ] **Step 5:** Commit: `chore: remove dead code, unused variables, and stale comments`

---

### Task 16: Extract magic numbers to named constants (Python)

**Files:**
- Modify: `ui/widget.py` — Message polling interval (200ms — note: CLAUDE.md says 100ms but code uses 200ms, update CLAUDE.md), Plusi wake timer (60000ms)
- Modify: `__init__.py` — Embedding start delay (10000ms)
- Modify: `ai/agent_loop.py` — MAX_CONTEXT_CHARS (100_000), MAX_ITERATIONS
- Modify: `storage/card_sessions.py` — MAX_MESSAGES_PER_CARD (already named, verify others)

**Pattern:**
```python
# Module-level constants with docstring
POLLING_INTERVAL_MS = 200  # JS message queue polling rate
PLUSI_WAKE_CHECK_MS = 60_000  # Plusi autonomy wake timer
EMBEDDING_INIT_DELAY_MS = 10_000  # Delay before background embedding starts
```

- [ ] **Step 1:** Read `ui/widget.py` — find all hardcoded millisecond values
- [ ] **Step 2:** Extract to named constants at module top
- [ ] **Step 3:** Read `__init__.py` — find timing constants
- [ ] **Step 4:** Extract to named constants
- [ ] **Step 5:** Verify no behavior change: `python3 run_tests.py`
- [ ] **Step 6:** Commit: `refactor: extract magic numbers to named constants`

---

## Execution Order Summary

| # | Task | Risk | Effort | Impact |
|---|------|------|--------|--------|
| 1 | Strip ALL console statements (React) + Vite auto-strip | Low | 45min | High — clean runtime |
| 3 | Specific exception types (Python) | Low | 45min | High — debuggability |
| 4 | mw.col None guards (Python) | Low | 30min | High — crash prevention |
| 5 | json.loads safety (Python) | Low | 30min | High — crash prevention |
| 6 | Thread WeakRef (Python) | Medium | 45min | Medium — rare crash prevention |
| 7 | React.memo (3 components) | Medium | 30min | High — UI performance |
| 8 | Extract inline styles | Low | 60min | Medium — render performance |
| 9 | Mermaid color fixes | Low | 15min | Medium — prevents ReferenceError |
| 10 | Design system compliance (audit-first) | Medium | 60min | High — light mode, consistency |
| 11 | Gemini API tests | Low | 45min | High — API reliability confidence |
| 12 | Auth tests | Low | 30min | Medium — auth reliability |
| 13 | Bridge tests | Medium | 45min | High — bridge reliability |
| 14 | Edge case tests | Low | 30min | Medium — robustness |
| 15 | Dead code removal | Low | 30min | Medium — cleanliness |
| 16 | Named constants | Low | 20min | Low — readability |

**Total estimated effort: ~8.5 hours of focused work**

**Parallelization:**
- Tasks 3-6 (Python safety) run independently of Tasks 1, 7-10 (React)
- Task 9 (Mermaid fixes in ChatMessage.jsx) should be done BEFORE Task 7 (they touch the same file)
- Tasks 11-14 (tests) depend on Phase 2 being complete

---

## What This Plan Does NOT Cover (Deferred)

- **App.jsx refactoring** — Separate plan after stabilization
- **Frontend React tests** (Vitest setup) — Separate plan, lower priority than Python tests
- **New features** — Frozen during stabilization
- **UI polish** — User handles in parallel
- **Build optimization** (tree shaking, code splitting) — Future
- **CI/CD pipeline** — Future
