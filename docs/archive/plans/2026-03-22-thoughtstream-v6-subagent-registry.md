# ThoughtStream v6 + Subagent Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flicker-prone ThoughtStream pipeline with an accumulating list model, and introduce a central subagent registry so new agents require only one config entry.

**Architecture:** Python subagent registry (`ai/subagents.py`) defines agents declaratively. A generic `SubagentThread` runs any agent off the main thread. Frontend mirrors the registry via bridge. `useAccumulatingPipeline` replaces `useSmartPipeline` with a simple queue + timer.

**Tech Stack:** Python 3.9+ (PyQt6, dataclasses), React 18 (TypeScript), Vite

**Spec:** `docs/superpowers/specs/2026-03-22-thoughtstream-v6-subagent-registry-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `ai/subagents.py` | SubagentDefinition dataclass, registry, router prompt gen, lazy loader | **CREATE** |
| `shared/config/subagentRegistry.ts` | Frontend registry mirror, @Name pattern builder | **CREATE** |
| `shared/components/ThoughtStream.tsx` | Replace useSmartPipeline (L149-307) with useAccumulatingPipeline, simplify main component | **MODIFY** |
| `ui/widget.py` | Replace PlusiDirectThread (L159-180) + handlers (L1113-1189) with SubagentThread + generic handlers | **MODIFY** |
| `ui/bridge.py` | Add `subagentDirect` and `getSubagentRegistry` methods | **MODIFY** |
| `frontend/src/hooks/useChat.js` | Replace hardcoded @Plusi (L361-397) with registry-based detection | **MODIFY** |
| `frontend/src/App.jsx` | Replace `plusi_direct_result` handler (L970-1023) with `subagent_result`, pass agentColor | **MODIFY** |
| `ai/rag.py` | Add `subagent:` retrieval_mode option to router prompt (L286-332) | **MODIFY** |
| `tests/test_subagents.py` | Unit tests for registry, lazy loading, prompt generation | **CREATE** |

---

### Task 1: Python Subagent Registry

**Files:**
- Create: `ai/subagents.py`
- Create: `tests/test_subagents.py`

- [ ] **Step 1: Write failing tests for registry**

Create `tests/test_subagents.py` with tests for: register_and_lookup, get_enabled_subagents (filters by config), get_router_subagent_prompt (includes agent info), router_prompt_empty_when_disabled, lazy_load_run_fn (loads json.dumps as test).

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_subagents -v`
Expected: ImportError -- `ai.subagents` does not exist yet

- [ ] **Step 3: Implement `ai/subagents.py`**

Create `ai/subagents.py` with the full implementation from the spec: `SubagentDefinition` dataclass, `SUBAGENT_REGISTRY`, `register_subagent`, `get_enabled_subagents`, `get_router_subagent_prompt`, `lazy_load_run_fn`, and the Plusi registration including `_plusi_on_finished`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_subagents -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

Message: `feat: add subagent registry with Plusi registration and tests`

---

### Task 2: Generic SubagentThread + Widget Handlers

**Files:**
- Modify: `ui/widget.py` (replace L159-180 PlusiDirectThread, L1113-1189 handlers)

- [ ] **Step 1: Add SubagentThread class**

In `ui/widget.py`, replace the `PlusiDirectThread` class (lines 159-180) with `SubagentThread` from the spec. Emits `(agent_name, result_dict)` via `finished_signal` and `(agent_name, error_msg)` via `error_signal`.

- [ ] **Step 2: Replace Plusi-specific handlers with generic ones**

Replace `_msg_plusi_direct` (L1113-1120), `_handle_plusi_direct` (L1122-1129), `_on_plusi_direct_finished` (L1131-1176), `_on_plusi_direct_error` (L1178-1189) with:
- `_msg_subagent_direct(self, data)` -- parses agent_name + text from data, calls `_handle_subagent_direct`
- `_handle_subagent_direct(self, agent_name, text, extra=None)` -- looks up registry, starts SubagentThread
- `_on_subagent_finished(self, agent_name, result)` -- emits `subagent_result` payload to JS, calls `agent.on_finished`
- `_on_subagent_error(self, agent_name, error_msg)` -- emits error payload to JS

Also update the message handler registration: replace `'plusiDirect': self._msg_plusi_direct` with `'subagentDirect': self._msg_subagent_direct` in the handler dict.

- [ ] **Step 3: Verify Python syntax**

Run: `python3 -c "import ast; ast.parse(open('ui/widget.py').read()); print('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

Message: `feat: replace PlusiDirectThread with generic SubagentThread`

---

### Task 3: Bridge Methods

**Files:**
- Modify: `ui/bridge.py`

- [ ] **Step 1: Add `subagentDirect` bridge method**

Add to WebBridge class a `@pyqtSlot(str, str, str)` method `subagentDirect(self, agent_name, text, extra_json='{}')` that parses extra_json and calls `self.widget._handle_subagent_direct(agent_name, text, extra)`.

- [ ] **Step 2: Add `getSubagentRegistry` bridge method**

Add a `@pyqtSlot(result=str)` method `getSubagentRegistry(self)` that imports `get_enabled_subagents`, builds a JSON array of `{name, label, color, enabled, pipelineLabel}` for each enabled agent, and returns the JSON string.

- [ ] **Step 3: Verify Python syntax**

Run: `python3 -c "import ast; ast.parse(open('ui/bridge.py').read()); print('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

Message: `feat: add subagentDirect and getSubagentRegistry bridge methods`

---

### Task 4: Frontend Subagent Registry

**Files:**
- Create: `shared/config/subagentRegistry.ts`

- [ ] **Step 1: Create the registry module**

Create `shared/config/subagentRegistry.ts` with: `SubagentConfig` interface (name, label, color, enabled, pipelineLabel), `registry` Map, `getRegistry()`, `setRegistry(agents)`, `getDirectCallPattern()` (builds regex from enabled agent names), `findAgent(name)`.

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds (file imported but not yet used)

- [ ] **Step 3: Commit**

Message: `feat: add frontend subagent registry module`

---

### Task 5: useAccumulatingPipeline Hook

**Files:**
- Modify: `shared/components/ThoughtStream.tsx` (replace L149-307)

- [ ] **Step 1: Replace `useSmartPipeline` with `useAccumulatingPipeline`**

Delete lines 149-307 (the entire `useSmartPipeline` function). Replace with `useAccumulatingPipeline` from the spec. Key changes:
- `DisplayStep` interface replaces `ActiveEntry` + `DoneEntry`
- Single `queueRef` + `timerRef` + `knownStepsRef` + `lastShowTimeRef` replaces 6 old refs
- `flushQueue`/`showNextStep` replaces `promote`/`schedulePromotion`
- Returns `{ displaySteps, isProcessing }` instead of `{ activeEntry, doneStack, isProcessing }`

- [ ] **Step 2: Update the main ThoughtStream component**

1. Add `pipelineGeneration` and `agentColor` to the `ThoughtStreamProps` interface
2. Change hook call to `useAccumulatingPipeline(pipelineSteps, pipelineGeneration)`
3. Remove `chronologicalDone` useMemo
4. Replace two-container rendering (chronologicalDone.map + activeEntry) with single `displaySteps.map()` calling `PhaseRow`
5. Update SourcesCarousel condition: show when no active steps remain
6. Update `hasContent`, `totalSteps` to use `displaySteps`
7. Remove loading skeleton fallback (accumulating pipeline handles first-step display)
8. Apply `ts-containerFadeIn` only when `isStreaming`
9. Remove unused keyframes: `ts-routerScan`, `ts-routerDotFloat`

- [ ] **Step 3: Add `agentColor` to PhaseRow**

Add optional `agentColor?: string` prop. Use for active dot background and done dot color, falling back to existing defaults.

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

Message: `feat: replace useSmartPipeline with useAccumulatingPipeline`

---

### Task 6: useChat.js -- Registry-Based Subagent Detection

**Files:**
- Modify: `frontend/src/hooks/useChat.js` (replace L361-397)

- [ ] **Step 1: Import registry functions**

Add at top: `import { getDirectCallPattern, findAgent } from '../../shared/config/subagentRegistry';`

- [ ] **Step 2: Replace hardcoded @Plusi detection**

Replace lines 360-397 with registry-based detection: build pattern from `getDirectCallPattern()`, match text, look up agent via `findAgent()`, emit synthetic router pipeline step, call `bridge.subagentDirect(agentName, cleanText, JSON.stringify({}))`.

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

Message: `feat: replace hardcoded @Plusi with registry-based subagent detection`

---

### Task 7: App.jsx -- Unified Subagent Result Handler

**Files:**
- Modify: `frontend/src/App.jsx` (replace L970-1023, update ThoughtStream props)

- [ ] **Step 1: Import and load registry**

Import `setRegistry` and `findAgent`. Add `subagent_registry` payload handler in ankiReceive. Call `bridge.getSubagentRegistry()` on init and pass result to `setRegistry()`.

- [ ] **Step 2: Replace `plusi_direct_result` with `subagent_result` handler**

Replace lines 970-1023 with a generic handler: reads `payload.agent_name`, marks pipeline steps done, handles error/silent cases, creates message with `pipeline_data`, appends via `appendMessageRef`.

- [ ] **Step 3: Pass agentColor to live ThoughtStream**

Add `activeAgentColor` state. Set it when a subagent pipeline is detected. Pass to the live ThoughtStream as `agentColor={activeAgentColor}`.

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

Message: `feat: unified subagent_result handler, load registry on init`

---

### Task 8: Router Prompt Integration

**Files:**
- Modify: `ai/rag.py` (L286-332)

- [ ] **Step 1: Inject subagent options into router prompt**

Import `get_router_subagent_prompt` from `ai.subagents`. In the `rag_router` function where the router prompt is built, append the subagent section to the prompt. Add `subagent:<name>` as a valid `retrieval_mode` value.

- [ ] **Step 2: Handle `subagent:` retrieval_mode in response parsing**

In the router response parsing, detect `retrieval_mode` values starting with `subagent:`. Extract agent name, emit pipeline step, and route to `_handle_subagent_direct` via the widget reference.

- [ ] **Step 3: Verify Python syntax**

Run: `python3 -c "import ast; ast.parse(open('ai/rag.py').read()); print('OK')"`
Expected: OK

- [ ] **Step 4: Commit**

Message: `feat: inject subagent options into router prompt`

---

### Task 9: Build, Test, Verify

**Files:** All modified files

- [ ] **Step 1: Full frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds, `web/index.html` exists

- [ ] **Step 2: Run Python tests**

Run: `python3 run_tests.py -v`
Expected: All tests pass including new test_subagents.py

- [ ] **Step 3: Manual test checklist**

Restart Anki and verify:
- [ ] Normal message: pipeline steps appear smoothly, no flicker
- [ ] `@Plusi hello`: synthetic router step shows immediately, Plusi responds, no UI freeze
- [ ] Pipeline steps accumulate (each stays in place, status changes inline)
- [ ] Source cards appear after all steps are done
- [ ] ThoughtStream collapses when streaming text begins
- [ ] Saved messages show collapsed ThoughtStream with correct step count
- [ ] Cmd+I toggles chatbot panel

- [ ] **Step 4: Final commit if any fixes needed**

Message: `fix: post-integration adjustments for ThoughtStream v6`
