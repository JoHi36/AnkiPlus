# AnkiPlus — Release Checklist

Everything that needs to happen before v1.0 release. Items are grouped by priority.

## Blocking (must fix before release)

- [ ] **3 failing Python tests** — `test_kg_store.py` (graph data structure, deck color validation). Fix or remove if KG feature isn't shipping in v1.
- [ ] **Tutor rendering bug** — text_chunk events arrive but React doesn't render (documented in memory as BLOCKER since 2026-03-25). Verify if still present.
- [ ] **Build verification** — full clean build (`npm run build`) + restart Anki + test all views (DeckBrowser, Reviewer, Chat, Settings, Graph)

## High Priority (should fix before release)

- [ ] **App.jsx decomposition** — 3,082 lines. Extract ChatView, ReviewerContainer, FreeChatContainer, useAnkiReceive hook, useGlobalShortcuts hook. Target: ~500 line shell. Separate plan needed.
- [ ] **Bundle lazy loading** — Mermaid (1.9MB), 3d-force-graph (1.9MB), KaTeX are loaded upfront. Use `React.lazy()` + `Suspense` for components that use them. Reduces initial load significantly.
- [ ] **Light mode testing** — Design system tokens support light mode, but no systematic verification done. Test every view in `data-theme="light"`.

## Medium Priority (polish before release)

- [ ] **Remaining inline styles** — ~672 `style={{}}` instances. Top offenders already extracted, but many remain in smaller components.
- [ ] **More React.memo** — Only 12/82 components memoized. Add to any component that receives stable props but re-renders due to parent state changes.
- [ ] **Frontend test coverage** — 107 tests cover hooks/utils. No component render tests yet. Add for: ChatInput, ChatMessage, SettingsSidebar, DeckBrowserView.
- [ ] **Custom reviewer cleanup** — `custom_reviewer/` is 1,727 lines, largely replaced by React ReviewerView. Decide: archive or keep as fallback. Remove if ReviewerView is stable.

## Low Priority (nice to have for v1.0)

- [ ] **CI/CD pipeline** — Automated `python3 run_tests.py` + `npm test` on push. GitHub Actions or similar.
- [ ] **Dependency audit** — `npm audit` for security vulnerabilities, update outdated packages.
- [ ] **Accessibility** — Screen reader support, keyboard navigation beyond what GlobalShortcutFilter provides.
- [ ] **Error reporting** — Ship errors to a backend (Sentry-style) instead of only local logging.

## Completed (stabilization, 2026-03-25/26)

- [x] Python error handling: 135 bare except → specific types + logging
- [x] mw.col None guards (12 access points)
- [x] json.loads safety (_safe_json_loads helper)
- [x] Thread WeakRef (AIRequestThread, InsightExtractionThread)
- [x] Magic numbers → named constants (12 timing values)
- [x] 136 f-string loggers → %s format
- [x] Config sanitization (_sanitize_config)
- [x] 47 custom_reviewer silent exceptions → logged
- [x] 303 console statements removed + Vite auto-strip
- [x] React.memo on list components (SessionRow, CardRow, WorkflowCard)
- [x] Granular Error Boundaries (Mermaid, Molecule, ToolWidget, Views)
- [x] Vitest setup + 107 frontend tests
- [x] Callback registry (replaces window._ globals)
- [x] Inline style extraction (65+ constants)
- [x] Design system compliance (100+ hardcoded colors fixed)
- [x] Dead code removal (7 unused imports)
- [x] CLAUDE.md fully updated (56 slots, 74 components, Qt hierarchy)
- [x] AGENTS.md created (agent architecture documentation)
- [x] Documentation: English, archived 107 stale plans/specs
- [x] 592 total tests (485 Python + 107 Frontend)
- [x] Debug log spam in global_theme.py removed (37 calls every 15s)
- [x] GraphView WebGL color fix (CSS vars → hex for 3d-force-graph)
