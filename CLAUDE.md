# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working With The User

**Architecture verification is mandatory.** Before building anything, verify that the current architecture matches the user's stated goal. If something seems contradictory (e.g. building a sidebar widget when the goal is fullscreen), STOP and ask. The user needs proactive architectural explanations — don't assume they know the current technical state. If you see a discrepancy between what exists and what was planned, flag it immediately instead of silently working around it.

**The user is a designer/product person, not a Qt/Python expert.** Explain architectural constraints in plain terms. When Anki/Qt limitations affect what's possible in React, explain WHY before proposing solutions. Never let the user discover architectural mismatches through broken builds.

## Agentisches System — Architektonisches Grundprinzip

**AnkiPlus ist eine agentische Lernplattform.** Es gibt EIN agentisches System mit Agenten (Tutor, Research, Plusi, Help) die plattformweit operieren — nicht an Views gebunden. Jedes neue Feature MUSS als Teil des agentischen Systems gedacht werden: "Welcher Agent macht das?" → über den Agent-Loop (`ai/handler.py`) implementieren, nicht als standalone Funktion.

**Drei kognitive Modi:** Stapel = Finden (state-basiert), Session = Lernen (verlaufsbasiert), Statistik = Planen. Vollständiges Konzeptdokument: `docs/vision/product-concept.md`.

**Canvas + State-Modell:** Der Stapel-Tab ist ein Canvas auf dem Agenten visuelle Ergebnisse darstellen. Daneben ein State-basierter Bereich (kein Chat-Verlauf). Ein Zustand = die gesamte Ansicht. Neuer Zustand nur durch bewusste Vertiefung/neue Anfrage. Der Router hält unsichtbar den vollen Verlauf für kontextsensitives Routing.

**Ein-Glas-Regel:** Zu jedem Zeitpunkt gibt es maximal ein primäres Glas-Eingabeelement auf dem Screen. Ausnahme in der Stapelansicht: Suchleiste (oben, Eingabe) + Action-Dock (unten, Aktion) koexistieren als zwei Phasen eines Flows (Fragen → Handeln).

**Agent-Handoff:** Tutor kann an Research übergeben wenn Karten nicht reichen (`ai/handoff.py`). Visuell: jeder Agent als eigene `AgenticCell` mit Icon + Name. Pipeline-Steps sichtbar via `ReasoningStream`. Agent-Wechsel kommunizieren sich durch Farbübergänge des gesamten Screens.

## Overview

This is an Anki addon that provides AI-powered learning assistance through a chat interface. The addon integrates a modern React frontend (built with Vite) into Anki using PyQt6's QWebEngineView. **The goal is a fullscreen React app that replaces Anki's native UI entirely** — no native Anki views visible. Currently the React app's QWebEngineView covers the full window via setCentralWidget, hiding Anki's native web view.

## Development Commands

### Frontend Development

```bash
cd frontend
npm install                    # Install dependencies
npm run dev                    # Start development server (localhost:3000)
npm run build                  # Build for production (outputs to web/)
npm run build:dev              # Build in development mode
```

**Important**: The frontend is developed in a browser first, then built and loaded into Anki. The dev server includes mock bridges for testing without Anki running.

### Testing in Anki

After building the frontend, restart Anki to load the new UI. The addon loads the built files from the `web/` directory.

## Architecture

### High-Level Structure

This addon bridges three major technologies:

1. **Python/Qt Backend**: Anki addon integration, AI API handling, session management
2. **React Frontend**: Modern UI with Tailwind CSS + DaisyUI, markdown rendering, streaming responses
3. **Qt WebChannel Communication**: Message queue system for bidirectional Python ↔ JavaScript communication

### Key Design Patterns

**Lazy Widget Creation**: UI components are created on first use and cached globally to improve startup performance.

**Message Queue System**: Instead of QWebChannel (which has timing issues), a polling-based message queue runs every 200ms to relay messages between Python and JavaScript.

**Thread-Based AI Requests**: AI API calls run in QThread to keep the UI responsive, with support for streaming responses via signals.

**Custom Reviewer HTML Replacement**: Uses `webview_will_set_content` hook to replace Anki's native reviewer with a custom minimalist UI.

### Communication Flow

**JavaScript → Python**:
1. React calls `bridge.sendMessage(data)`
2. JavaScript adds message to queue: `window.ankiBridge.addMessage(type, data)`
3. Python polls queue every 200ms via QTimer
4. Python routes message to appropriate handler

**Python → JavaScript**:
1. Python creates JSON payload
2. Calls `web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")`
3. React's `useAnki` hook receives and processes the message

## Package Structure

```
AnkiPlus_main/
├── __init__.py              # Entry point (Anki loads this)
├── config.py                # Global configuration
├── ai/                      # AI engine (modular architecture)
│   ├── handler.py           # Orchestrator — delegates to gemini, rag, models
│   ├── gemini.py            # Google Gemini API: requests, streaming, retry
│   ├── models.py            # Model fetching, section title generation
│   ├── rag.py               # RAG pipeline: router, query analysis, keyword extraction
│   ├── auth.py              # Token management, JWT validation
│   ├── system_prompt.py     # System prompt construction
│   ├── agent_loop.py        # Agent loop for tool use
│   ├── tools.py             # Tool definitions (registry)
│   ├── tool_executor.py     # Tool execution
│   ├── retrieval.py         # Hybrid retrieval: SQL + semantic search merge
│   └── embeddings.py        # Embedding management (Gemini API, cosine similarity)
├── plusi/                   # Plusi companion subsystem
│   ├── agent.py             # Plusi personality agent
│   ├── dock.py              # Dock widget (mood display)
│   ├── panel.py             # Side panel (diary, chat)
│   └── storage.py           # Plusi data persistence
├── storage/                 # Data persistence layer
│   ├── card_sessions.py     # Per-card SQLite storage (PRIMARY session system)
│   ├── sessions.py          # Legacy JSON sessions (DEPRECATED, kept as fallback)
│   ├── mc_cache.py          # Multiple-choice cache
│   └── insights.py          # Card insight extraction
├── ui/                      # Qt UI components & communication
│   ├── widget.py            # ChatbotWidget (QWebEngineView, message queue, AI threading)
│   ├── bridge.py            # WebBridge (JS ↔ Python communication, 56 @pyqtSlot methods)
│   ├── main_view.py         # MainViewWidget (fullscreen React app container)
│   ├── addon_proxy.py       # AddonProxy (bridge method wrappers for main view)
│   ├── setup.py             # Widget creation, keyboard shortcuts
│   ├── manager.py           # Toolbar/bottom bar hide/show
│   ├── shortcut_filter.py   # GlobalShortcutFilter (all keyboard routing)
│   ├── theme.py             # Theme utilities
│   ├── global_theme.py      # Application-wide dark theme
│   ├── tokens_qt.py         # Qt-compatible design token approximations
│   └── settings_sidebar.py  # Settings sidebar Python integration
├── utils/                   # Shared utilities
│   ├── text.py              # HTML cleaning, image extraction
│   ├── anki.py              # Thread-safe Anki API helpers
│   ├── card_tracker.py      # Card tracking + JS injection
│   ├── image_search.py      # PubChem/Wikimedia image search
│   └── logging.py           # Centralized logging system
├── shared/                  # Cross-context shared resources
│   ├── styles/design-system.css  # Design token source of truth (CSS vars)
│   ├── config/tailwind.preset.js # Tailwind ↔ design token mapping
│   ├── components/          # Design system primitives (7 files, Anki-agnostic)
│   ├── plusi-renderer.js    # Unified Plusi SVG mood renderer
│   └── utils/constants.ts   # Shared constants
├── custom_reviewer/         # Custom reviewer (HTML/CSS/JS, being migrated to React)
├── frontend/                # React source code (74 components, 16 hooks)
├── web/                     # Built frontend (loaded by QWebEngineView)
├── docs/                    # Documentation + specs + plans
├── scripts/                 # Shell scripts (build, deploy, cache)
├── firebase/                # Firebase configuration
├── functions/               # Firebase Cloud Functions (subscription, tokens)
├── backend/                 # Vercel backend (embeddings API, routing)
├── Landingpage/             # Marketing website
└── Assets/                  # Logo and brand assets
```

## Critical File Locations

### Python Backend

- `__init__.py`: Main entry point, hook registration, addon initialization
- `ui/bridge.py`: WebBridge class with 56 `@pyqtSlot` methods for JS communication
- `ui/widget.py`: ChatbotWidget class, QWebEngineView setup, message queue polling, AI request handling
- `ui/main_view.py`: MainViewWidget — fullscreen React app container (replaces native Anki UI)
- `ui/addon_proxy.py`: AddonProxy — bridge method wrappers for main view
- `ui/setup.py`: Widget creation, keyboard shortcuts (Cmd/Ctrl+I), toolbar button, menu items
- `ui/global_theme.py`: Application-wide dark theme styling, continuous re-application logic
- `ui/shortcut_filter.py`: GlobalShortcutFilter — all keyboard routing
- `ai/handler.py`: AI orchestrator — delegates to gemini.py, rag.py, models.py
- `ai/gemini.py`: Google Gemini API requests, streaming, retry logic
- `ai/rag.py`: RAG pipeline router, query analysis
- `ai/auth.py`: Token management, JWT validation
- `ai/system_prompt.py`: System prompt construction
- `ai/agent_loop.py`: Agent loop for tool use
- `config.py`: Configuration management (API keys, model preferences, stored in config.json)
- `custom_reviewer/__init__.py`: Custom reviewer HTML/CSS/JS replacement
- `plusi/agent.py`: Plusi personality agent
- `storage/card_sessions.py`: Per-card SQLite storage (primary session system)

### React Frontend

- `frontend/src/App.jsx`: Main React component, state management, message handling
- `frontend/src/hooks/useAnki.js`: Bridge wrapper hook for Python communication
- `frontend/src/hooks/useChat.js`: Main chat state, streaming, section management
- `frontend/src/hooks/useCardContext.js`: Card context (front/back, deck info, metadata)
- `frontend/src/hooks/useCardSession.js`: Per-card session state (load/save history)
- `frontend/src/hooks/useDeckTracking.js`: Deck state tracking, state transitions
- `frontend/src/hooks/useFreeChat.js`: Card-independent chat for overlay (Stapel)
- `frontend/src/hooks/useInsights.js`: Card insights dashboard data
- `frontend/src/hooks/useMascot.js`: Plusi mood state, event-driven mood changes
- `frontend/src/hooks/useModels.js`: Model management, provider detection
- `frontend/src/hooks/useQuotaDisplay.js`: Token quota and tier limits
- `frontend/src/hooks/useReviewTrail.js`: Review history tracking
- `frontend/src/hooks/usePlusiDirect.js`: Direct Plusi personality/autonomy state
- `frontend/src/hooks/useReviewerState.js`: Reviewer state machine (question → answer → MC → rated)
- `frontend/src/hooks/useDeckTree.js`: Deck tree data structure for browser
- `frontend/src/hooks/useHoldToReset.js`: Long-press gesture handler
- `frontend/src/components/`: 74 React components (see below)
- `frontend/src/components/SettingsSidebar.jsx`: React settings panel (replaces old Python settings dialog)
- `frontend/src/components/SidebarShell.jsx`: Agent sidebar with tab navigation
- `frontend/src/components/ReviewerView.jsx`: Card reviewer (React replacement for custom_reviewer)
- `frontend/vite.config.js`: Vite build configuration (relative paths for local file loading)
- `frontend/tailwind.config.js`: Tailwind + DaisyUI styling configuration

**Key component groups** (74 total in `frontend/src/components/`):
- Chat: `ChatInput`, `ChatMessage`, `StreamingChatMessage`, `FreeChatSearchBar`, `AgenticCell`
- Cards: `CardContext`, `CardListWidget`, `CardPreviewModal`, `CardRefChip`, `CardWidget`
- Reviewer: `ReviewerView`, `ReviewerDock`, `ReviewFeedback`, `DockLoading`, `DockEvalResult`, `DockTimer`, `DockStars`
- Plusi: `PlusiWidget`, `PlusiMenu`, `PlusiDock`, `PersonalityGrid`, `MascotCharacter`, `MascotShell`, `DiaryStream`, `AutonomyCard`
- Insights: `InsightsDashboard`, `InsightBullet`
- Navigation: `Header`, `TopBar`, `DeckBrowser`, `DeckBrowserView`, `DeckProgressBar`, `DeckSearchBar`, `DeckNode`, `SectionDropdown`, `SectionNavigation`, `SectionDivider`, `DeckSectionDivider`
- Views: `OverviewView`, `StatistikView`, `SessionOverview`, `SessionView/SessionHeader`, `SessionView/SessionList`
- Research: `ResearchMenu`, `ResearchContent`, `ResearchSourceBadge`, `SourceCard`, `SourcesCarousel`, `WebCitationBadge`, `CitationBadge`
- Tools: `ToolWidgetRenderer`, `ImageWidget`, `StatsWidget`, `MultipleChoiceCard`, `ToolTogglePopup`, `ToolErrorBadge`, `ToolLoadingPlaceholder`
- Settings: `SettingsSidebar`, `SettingsButton`, `SidebarShell`, `SidebarTabBar`, `TokenBudgetSlider`, `TokenBar`
- Agents: `StandardSubMenu`, `ResizeHandle`, `ContextSurface`, `ContextTags`, `CompactWidget`
- Modals: `PaywallModal`, `QuotaLimitDialog`, `AccountBadge`

### Build Output

- `web/`: Production build output (static files loaded by QWebEngineView)
- `web/index.html`: Entry point HTML loaded by Anki

## Python ↔ JavaScript Bridge Methods

The WebBridge exposes 56 `@pyqtSlot` methods to JavaScript (all defined in `ui/bridge.py`):

**AI & Messaging**: `sendMessage()`, `cancelRequest()`, `setModel()`, `generateSectionTitle()`

**Settings & Preferences**: `openSettings()`, `closePanel()`, `saveSettings()`, `getCurrentConfig()`, `fetchModels()`, `getAITools()`, `saveAITools()`, `getResponseStyle()`, `saveResponseStyle()`, `getTheme()`, `saveTheme()`, `openAnkiPreferences()`, `saveMascotEnabled()`

**Deck Management**: `getCurrentDeck()`, `getAvailableDecks()`, `openDeck()`, `getDeckStats()`, `openDeckBrowser()`, `openStats()`, `createNewDeck()`, `openImport()`

**Card Operations**: `getCardDetails()`, `goToCard()`, `previewCard()`, `openPreview()`, `advanceCard()`, `showAnswer()`, `hideAnswer()`, `saveMultipleChoice()`, `loadMultipleChoice()`, `hasMultipleChoice()`

**Sessions & Storage** (SQLite-based): `loadCardSession()`, `saveCardSession()`, `saveCardMessage()`, `saveCardSection()`, `loadDeckMessages()`, `saveDeckMessage()`

**Authentication**: `authenticate()`, `getAuthStatus()`, `getAuthToken()`, `refreshAuth()`, `logout()`, `startLinkAuth()`, `handleAuthDeepLink()`

**Media & URLs**: `searchImage()`, `fetchImage()`, `openUrl()`

**Embeddings**: `getEmbeddingStatus()`

## Anki Integration Hooks

The addon uses these Anki hooks (registered in `__init__.py`):

- `profile_did_open`: Initialize addon UI, theme, custom reviewer
- `profile_will_close`: Cleanup (restore native UI elements)
- `reviewer_did_show_question`: Track current card, emit deck selection events
- `state_will_change`: Smart toolbar management (hide in review mode, show elsewhere)
- `webview_will_set_content`: Replace reviewer HTML with custom UI (when custom reviewer is enabled)

## Configuration

Configuration is stored in `config.json` (not in repository):

- API keys for OpenAI, Anthropic, Google
- Selected AI provider and model
- Firebase/backend authentication tokens
- AI tool settings (images, diagrams, molecules)
- Custom reviewer toggle (`use_custom_reviewer`)

## Important Implementation Details

### Qt Widget Hierarchy

```
mw (Anki Main Window)
├── toolbar.web (QWebEngineView - hidden, native toolbar suppressed)
├── centralWidget
│   └── MainViewWidget (QWidget - fullscreen, replaces entire native UI)
│       └── QWebEngineView (loads unified React app from web/index.html)
└── reviewer (native reviewer suppressed, React ReviewerView handles cards)
```

**Critical**: `mw.toolbar` is NOT a QWidget - only `mw.toolbar.web` has Qt methods like `hide()`, `show()`, `setFixedHeight()`.

### Global Theme System

The addon applies a comprehensive dark theme to ALL Anki UI elements (not just the chatbot panel). This is done via `ui/global_theme.py` which:

- Sets global stylesheet on QApplication
- Re-applies on every state change (Anki frequently resets styles)
- Uses a 2-second QTimer for continuous re-styling to ensure consistency

### Custom Reviewer

When enabled, the custom reviewer:

1. Hooks into `webview_will_set_content` before Anki renders HTML
2. Replaces `web_content.body` with custom HTML from `custom_reviewer/template.html`
3. Injects custom CSS from `custom_reviewer/styles.css` (Jony Ive-inspired minimalism)
4. Injects custom JS from `custom_reviewer/interactions.js` (keyboard shortcuts, animations)
5. Hides native Anki toolbar and bottom bar at Qt level using `hide()` and `setFixedHeight(0)`

### HTML Caching

Custom reviewer caches CSS/JS/HTML files in memory (`_css_cache`, `_js_cache`, `_html_cache`) to avoid disk I/O on every card render.

## AI Provider Support

The addon uses **Google Gemini** as its AI provider (Gemini 3 Flash). The AI module follows a modular architecture:

- **`handler.py`** — Orchestrator: public API, delegates to specialized modules
- **`gemini.py`** — Gemini API integration: request building, streaming, retry logic
- **`rag.py`** — RAG pipeline: query routing, keyword extraction, retrieval orchestration
- **`models.py`** — Model management: fetching available models, section title generation
- **`agent_loop.py`** — Multi-turn agent loop: tool call processing, context pruning
- **`retrieval.py`** — Hybrid retrieval: SQL + semantic search merge, dual-match prioritization

## Frontend Technology Stack

- **React 18**: Component-based UI framework
- **Vite**: Ultra-fast build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **DaisyUI**: Pre-built Tailwind components
- **Lucide React**: Icon library
- **react-markdown**: Markdown rendering with math support (KaTeX)
- **react-syntax-highlighter**: Code syntax highlighting
- **mermaid**: Diagram rendering
- **framer-motion**: Animations

## Common Development Patterns

### Adding a New Bridge Method

1. Add `@pyqtSlot` method in `ui/bridge.py`:
   ```python
   @pyqtSlot(str, result=str)
   def myNewMethod(self, param):
       # Implementation
       return json.dumps({"success": True})
   ```

2. Add to JavaScript bridge wrapper in `frontend/src/hooks/useAnki.js`:
   ```javascript
   myNewMethod: (param) => {
       window.ankiBridge.addMessage('myNewMethod', { param });
   }
   ```

3. Handle response in `ui/widget.py`'s `_handle_js_message()` if needed

### Design System & Styling — "Invisible Addiction"

**BEFORE creating or modifying ANY UI component**, review the Component Viewer (`npm run dev` → `localhost:3000/?view=components`) to absorb the design language. The system has two guiding philosophies:
1. **Invisible**: clean, minimal, premium, professional — the interface disappears behind the content
2. **Addiction**: smooth, magical, novel, fascinating — every interaction should feel inevitable

The Component Viewer IS the design system — not documentation about it. Match its quality bar. If a new component feels generic or template-like, it doesn't belong.

**CRITICAL — ZERO TOLERANCE: The "Invisible Addiction" design system MUST be used everywhere. No exceptions.**

**Color tokens:** NEVER use hardcoded `#hex`, `rgba()`, `rgb()`, or named colors (`white`, `black`) in any `.jsx`, `.tsx`, or `.css` file. EVERY color must come from `var(--ds-*)` tokens. This includes backgrounds, text, borders, shadows, gradients, and opacity values. Hardcoded colors break light mode and create maintenance debt.

**Materials:** Use `.ds-deep`, `.ds-canvas`, `.ds-frosted` CSS classes for surfaces. NEVER rebuild frosted glass with inline rgba gradients — the class handles everything including light mode.

**Shadows:** Use `var(--ds-shadow-sm)`, `var(--ds-shadow-md)`, `var(--ds-shadow-lg)`. Never write `box-shadow: 0 4px 24px rgba(0,0,0,0.35)` inline.

**Tints:** Use `var(--ds-hover-tint)`, `var(--ds-active-tint)`, `var(--ds-green-tint)`, `var(--ds-red-tint)`, or the numbered tint tokens (`var(--ds-accent-10)`, `var(--ds-green-20)`, etc.) for transparent color overlays.

**If you find existing code with hardcoded colors while modifying a file, fix them.** Every touch should leave the file more compliant, not less.

**Source of truth:** `shared/styles/design-system.css` — defines ALL colors, typography, spacing, and component classes as CSS custom properties.

**Core Principle — Material = Function:**
- **Frosted Glass** (`.ds-frosted`): for action elements (input docks, search fields). Uses `var(--ds-bg-frosted)` + `backdrop-filter: blur(20px)`.
- **Borderless** (`.ds-borderless`): for content (card display, deck lists). Uses `var(--ds-bg-canvas)` + subtle border. No distinct background.

**Key tokens (dark / light):**
- `--ds-bg-deep` (#141416 / #ECECF0) — Chat panel, Plusi diary
- `--ds-bg-canvas` (#1C1C1E / #FFFFFF) — Main working surface
- `--ds-bg-frosted` (#161618 / #F9F9FB) — Frosted glass material
- `--ds-bg-overlay` (#3A3A3C / #E5E5EA) — Tooltips, popovers
- `--ds-accent` (#0A84FF / #007AFF) — Primary actions
- `--ds-green`, `--ds-yellow`, `--ds-red`, `--ds-purple` — Semantic colors (Apple HIG)

**Theme switching:** `data-theme="light"` on `<html>`. Config: `theme` = "dark" | "light" | "system".

**How tokens reach each context:**
- **React/Tailwind**: `design-system.css` imported in `index.css`. Tailwind preset (`shared/config/tailwind.preset.js`) maps all utilities to CSS vars.
- **Custom Reviewer/Deck Browser**: `design-system.css` injected via `_get_design_tokens_css()` at runtime.
- **Plusi**: CSS vars available in host webviews; panel injects its own `:root` block.
- **Qt/QSS**: `ui/tokens_qt.py` provides solid-hex approximations (Qt doesn't support CSS vars).

**Component classes** (`.ds-*`): Shared between React and native HTML for duplicated components — `.ds-input-dock`, `.ds-thought-step`, `.ds-mc-option`, `.ds-review-result`, `.ds-tab-bar`, `.ds-kbd`.

**Fonts:** SF Pro (system font) for all UI. Space Grotesk (`--ds-font-brand`) exclusively for Plusi and brand.

**Rules (MANDATORY — no exceptions):**
1. No component may define its own colors — use `var(--ds-*)` tokens exclusively
2. Frosted Glass for action, Borderless for content
3. Chat body text is 15px (`--ds-text-lg`)
4. Every new React component MUST be tested in both dark and light mode
5. Inline styles in JSX: use `var(--ds-text-primary)` not `rgba(255,255,255,0.9)`, use `var(--ds-bg-overlay)` not `#3A3A3C`
6. Spec: `docs/superpowers/specs/2026-03-20-unified-design-system.md`
7. Every new component MUST be added to the Component Viewer (`frontend/src/ComponentViewer.jsx`) with all variants
8. Reuse components — NEVER rebuild what already exists. ChatInput (in `frontend/src/components/`) is THE input dock for everything (reviewer, chat, freechat) via different action props.
9. Full design reference: `docs/reference/DESIGN.md`
10. Component Viewer: `npm run dev` → `http://localhost:3000/?view=components`

**Shared/Product boundary:**
- `shared/components/` = design system primitives (Button, Card, TreeList, MultipleChoiceCard, QuizCard, ResponsiveContainer, ReviewResult). MUST be Anki-agnostic. No bridge, no cardContext, no deckName, no sessions. Props are generic.
- `frontend/src/components/` = product components. Import and compose shared primitives. May use bridge, hooks, Anki-specific state.
- Before adding a component to `shared/`, verify it has zero Anki imports or props. When a second consumer needs the same pattern, extract the generic part to shared.
9. Full design reference: `docs/reference/DESIGN.md`
10. Component Viewer: `npm run dev` → `http://localhost:3000/?view=components`

Global Qt theme styles are in `ui/global_theme.py` (imports from `ui/tokens_qt.py`).

### Building for Production

Always run `npm run build` from the `frontend/` directory before testing in Anki. The build process:
- Clears old files in `web/`
- Bundles React app with optimizations
- Uses relative paths (configured in `vite.config.js`) for local file loading
- Generates cache-busted filenames

### Global Shortcut System

All keyboard shortcuts are routed through a single `GlobalShortcutFilter` (`ui/shortcut_filter.py`) installed on `QApplication`. Never register shortcuts via `QShortcut` or local `document.addEventListener('keydown', ...)` — the filter handles all routing. Text field focus state is tracked via `focusin`/`focusout` messages from JavaScript. See spec: `docs/superpowers/specs/2026-03-20-global-shortcut-filter.md`.

## Known Issues & Quirks

### Dark Bar Above Reviewer

When custom reviewer is enabled and native toolbar is hidden, a ~40px dark bar may remain at the top of the reviewer. This is a Qt layout issue where the hidden `mw.toolbar.web` widget still reserves space despite `setFixedHeight(0)`. Investigation ongoing.

### Message Queue Polling

The 200ms polling interval (`POLL_INTERVAL_MS` in `ui/widget.py`) is a deliberate trade-off:
- Fast enough to feel instant to users
- Slow enough to avoid CPU overhead
- More reliable than QWebChannel's timing issues

### State Change Timing

Some operations require `QTimer.singleShot()` delays (typically 100-500ms) to ensure Anki components are fully initialized before accessing them. This is especially important for reviewer state transitions.

## Testing

### Unit Tests

```bash
python3 run_tests.py          # Run all tests
python3 run_tests.py -v       # Verbose output
python3 run_tests.py -k text  # Only tests matching "text"
```

`run_tests.py` mocks the entire `aqt`/PyQt module tree so tests run without Anki installed. Tests use in-memory SQLite databases for storage tests.

Test files:
- `tests/test_text.py` — HTML cleaning, image extraction
- `tests/test_system_prompt.py` — Prompt construction, insights injection
- `tests/test_card_sessions.py` — SQLite CRUD, sessions, messages, embeddings, insights
- `tests/test_config.py` — Config loading, merging, defaults, save/load

When adding new pure-logic functions (no Qt/Anki dependency), add corresponding unit tests.

### Manual Testing

1. **Browser Development**: Use `npm run dev` to develop UI in browser with mock bridges
2. **Anki Integration Testing**: Build with `npm run build`, restart Anki, test in real environment
3. **State Testing**: Test transitions between deck browser, overview, and review states
4. **API Testing**: Test with actual API keys for Google Gemini
5. **Error Scenarios**: Test network failures, API errors, missing dependencies

## Performance Considerations

- **Lazy Loading**: Widgets created only when first accessed
- **HTML Caching**: Reviewer templates cached in memory
- **Message Batching**: Polling allows multiple messages to be processed together
- **Thread-Based AI**: Long-running API calls don't block UI
- **Minimal Re-renders**: React components use proper memoization where needed

## Security Notes

- API keys stored in `config.json` (never committed to repository)
- No automatic credential transmission
- Firebase authentication tokens managed locally
- User must manually add authentication tokens in profile dialog

## Code Quality Standards

### Logging

Every module uses the centralized logging system:

```python
try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)
```

Log levels:
- `logger.debug()` — Trace details only relevant during development (variable values, flow tracing)
- `logger.info()` — Important state changes (config loaded, request started, session saved)
- `logger.warning()` — Recoverable issues (fallback used, token expiring, missing optional feature)
- `logger.error()` — Failures that affect functionality (API error, DB write failed, missing required data)
- `logger.exception()` — Same as error but auto-includes the full traceback

Rules:
- Never log API keys, tokens, or secrets (logging their length is OK)
- Use `%s` format placeholders, not f-strings, in logger calls: `logger.info("Loaded %s cards", count)`
- All exceptions must be logged — never use bare `except: pass`

### Error Handling

- Always catch specific exception types, not bare `except:`
- Always check `mw.col` is not `None` before accessing Anki's database
- Use `try/except` with logging inside `run_on_main_thread()` callbacks
- Return structured error dicts from tool functions: `{"error": "Description"}`
- Bridge methods (`ui/bridge.py`) use `logger.exception()` for errors with tracebacks

### Threading

- UI operations MUST run on the main thread — use `run_on_main_thread()` from `utils/anki.py`
- AI API calls run in `QThread` subclasses with signal/slot communication
- SQLite uses WAL mode for concurrent read safety
- Use `threading.Lock()` for shared mutable state accessed from multiple threads

### Constants

- No magic numbers — define named constants at module level
- Example: `MAX_MESSAGES_PER_CARD = 200`, `POLL_INTERVAL_MS = 200`

### Imports

All modules use the dual try/except pattern for compatibility (running as Anki addon vs standalone):

```python
try:
    from ..config import get_config    # As Anki addon (relative import)
except ImportError:
    from config import get_config      # Standalone / testing
```

### React Code Standards

**Console statements:** NEVER add `console.log/error/warn` to production code. Vite's `esbuild.drop` strips them from builds, but they clutter source. If you need debugging, use it temporarily and remove before committing.

**React.memo:** Components rendered inside `.map()` loops MUST be wrapped in `React.memo`. Extract inline JSX to named components first, then wrap.

**Inline styles:** Static `style={{}}` objects MUST be extracted to module-level constants (UPPER_SNAKE_CASE). Dynamic styles (depending on props/state) may remain inline.
```jsx
// Wrong (new object every render):
<div style={{ padding: 8, display: 'flex' }}>

// Right (stable reference):
const ROW_STYLE = { padding: 8, display: 'flex' };
<div style={ROW_STYLE}>
```

**Error Boundaries:** Risky renderers (Mermaid, Molecule, Tool Widgets) MUST be wrapped in `<ComponentErrorBoundary>`. Major views in App.jsx MUST be wrapped.

**Callback registration:** Use `callbackRegistry.ts` (`registerCallback`, `invokeAndRemove`) for bridge response callbacks. NEVER use `window._*` globals for callbacks. Caches (`window._cachedConfig`, `window._cachedModels`) are the only acceptable window globals.

**TypeScript:** New files MUST be `.tsx`/`.ts`. Existing `.jsx` files stay as-is until touched for significant changes.

### Testing Requirements

**Python:** Run `python3 run_tests.py` before committing. All tests must pass (currently 481+). When adding new pure-logic functions, add corresponding tests.

**Frontend:** Run `cd frontend && npm test` before committing. All tests must pass (currently 107+). When adding new hooks or utility functions, add corresponding tests in `__tests__/` directories.

**Test isolation:** If a test file stubs `sys.modules`, restore originals IMMEDIATELY after import (see `test_gemini.py` pattern). Never leave stubs for subsequent test files.

## References

See `docs/archive/TECHNICAL.2025.md` for historical implementation details (pre-2026-03 architecture, largely superseded by this file).

See `docs/reference/QT_INTEGRATION_GUIDE.md` for:
- General Qt/Anki addon development patterns
- Available integration points (menus, toolbars, docks)
- Best practices and common pitfalls
- Code examples for common tasks
