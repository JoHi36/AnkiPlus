# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an Anki addon that provides AI-powered learning assistance through a chat interface. The addon integrates a modern React frontend (built with Vite) into Anki using PyQt6's QWebEngineView, creating a seamless side panel experience within the Anki desktop application.

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

**Message Queue System**: Instead of QWebChannel (which has timing issues), a polling-based message queue runs every 100ms to relay messages between Python and JavaScript.

**Thread-Based AI Requests**: AI API calls run in QThread to keep the UI responsive, with support for streaming responses via signals.

**Custom Reviewer HTML Replacement**: Uses `webview_will_set_content` hook to replace Anki's native reviewer with a custom minimalist UI.

### Communication Flow

**JavaScript → Python**:
1. React calls `bridge.sendMessage(data)`
2. JavaScript adds message to queue: `window.ankiBridge.addMessage(type, data)`
3. Python polls queue every 100ms via QTimer
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
├── ai/                      # AI engine
│   ├── handler.py           # Google Gemini API integration (main AI handler)
│   ├── auth.py              # Token management, JWT validation
│   ├── system_prompt.py     # System prompt construction
│   ├── agent_loop.py        # Agent loop for tool use
│   ├── tools.py             # Tool definitions (registry)
│   ├── tool_executor.py     # Tool execution
│   ├── retrieval.py         # RAG/hybrid retrieval
│   └── embeddings.py        # Embedding management
├── plusi/                   # Plusi companion subsystem
│   ├── agent.py             # Plusi personality agent
│   ├── dock.py              # Dock widget (mood display)
│   ├── panel.py             # Side panel (diary, chat)
│   └── storage.py           # Plusi data persistence
├── storage/                 # Data persistence layer
│   ├── card_sessions.py     # Per-card session SQLite storage
│   ├── sessions.py          # Legacy session storage
│   ├── mc_cache.py          # Multiple-choice cache
│   └── insights.py          # Card insight extraction
├── ui/                      # Qt UI components & communication
│   ├── widget.py            # ChatbotWidget (QWebEngineView)
│   ├── bridge.py            # WebBridge (JS ↔ Python communication)
│   ├── setup.py             # DockWidget creation, keyboard shortcuts
│   ├── manager.py           # Toolbar/bottom bar hide/show
│   ├── settings.py          # Settings dialog
│   ├── theme.py             # Theme utilities
│   ├── global_theme.py      # Application-wide dark theme
│   ├── overlay_chat.py      # Free chat overlay
│   └── custom_screens.py    # DeckBrowser + Overview replacement
├── utils/                   # Shared utilities
│   ├── text.py              # HTML cleaning, image extraction
│   ├── anki.py              # Thread-safe Anki API helpers
│   ├── card_tracker.py      # Card tracking + JS injection
│   └── image_search.py      # PubChem/Wikimedia image search
├── custom_reviewer/         # Custom reviewer (HTML/CSS/JS replacement)
├── frontend/                # React source code
├── web/                     # Built frontend (loaded by QWebEngineView)
├── docs/                    # Documentation + specs + plans
├── scripts/                 # Shell scripts (build, deploy, cache)
└── firebase/                # Firebase configuration
```

## Critical File Locations

### Python Backend

- `__init__.py`: Main entry point, hook registration, addon initialization
- `ui/bridge.py`: WebBridge class with 35+ `@pyqtSlot` methods for JS communication
- `ui/widget.py`: ChatbotWidget class, QWebEngineView setup, message queue polling, AI request handling
- `ui/setup.py`: QDockWidget creation, keyboard shortcuts (Cmd/Ctrl+I), toolbar button, menu items
- `ui/global_theme.py`: Application-wide dark theme styling, continuous re-application logic
- `ai/handler.py`: API integration for Google (Gemini)
- `ai/auth.py`: Token management, JWT validation
- `ai/system_prompt.py`: System prompt construction
- `ai/agent_loop.py`: Agent loop for tool use
- `ai/retrieval.py`: RAG/hybrid retrieval
- `config.py`: Configuration management (API keys, model preferences, stored in config.json)
- `custom_reviewer/__init__.py`: Custom reviewer HTML/CSS/JS replacement
- `plusi/agent.py`: Plusi personality agent
- `storage/card_sessions.py`: Per-card session SQLite storage

### React Frontend

- `frontend/src/App.jsx`: Main React component, state management, message handling
- `frontend/src/hooks/useAnki.js`: Bridge wrapper hook for Python communication
- `frontend/src/components/`: React UI components (Header, ChatMessage, ChatInput, etc.)
- `frontend/vite.config.js`: Vite build configuration (relative paths for local file loading)
- `frontend/tailwind.config.js`: Tailwind + DaisyUI styling configuration

### Build Output

- `web/`: Production build output (static files loaded by QWebEngineView)
- `web/index.html`: Entry point HTML loaded by Anki

## Python ↔ JavaScript Bridge Methods

The WebBridge exposes these methods to JavaScript (all defined in `ui/bridge.py`):

**AI & Messaging**: `sendMessage()`, `cancelRequest()`, `setModel()`, `generateSectionTitle()`

**Settings**: `openSettings()`, `closePanel()`, `saveSettings()`, `getCurrentConfig()`, `fetchModels()`, `getAITools()`, `saveAITools()`

**Deck Management**: `getCurrentDeck()`, `getAvailableDecks()`, `openDeck()`, `getDeckStats()`, `openDeckBrowser()`

**Card Operations**: `getCardDetails()`, `goToCard()`, `previewCard()`, `showAnswer()`, `hideAnswer()`, `saveMultipleChoice()`, `loadMultipleChoice()`, `hasMultipleChoice()`

**Sessions**: `loadSessions()`, `saveSessions()`

**Authentication**: `authenticate()`, `getAuthStatus()`, `getAuthToken()`, `refreshAuth()`, `handleAuthDeepLink()`

**Media**: `searchImage()`, `fetchImage()`, `openUrl()`

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
├── toolbar.web (QWebEngineView - the actual toolbar widget)
├── centralWidget
│   └── QDockWidget (chatbot panel - right side)
│       └── ChatbotWidget (QWidget)
│           └── QWebEngineView (loads React app)
└── reviewer (when in review state)
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

The addon uses **Google Gemini** as its AI provider (Gemini 3 Flash). API calls are handled in `ai/handler.py` with streaming support, and the agent loop in `ai/agent_loop.py` handles tool use cycles.

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

### Design System & Styling

**Source of truth:** `shared/styles/design-system.css` — defines ALL colors, typography, spacing, and component classes as CSS custom properties. Never hardcode colors anywhere.

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

**Rules:**
1. No component may define its own colors — use tokens
2. Frosted Glass for action, Borderless for content
3. Chat body text is 15px (`--ds-text-lg`)
4. Spec: `docs/superpowers/specs/2026-03-20-unified-design-system.md`

Global Qt theme styles are in `ui/global_theme.py` (imports from `ui/tokens_qt.py`).

### Building for Production

Always run `npm run build` from the `frontend/` directory before testing in Anki. The build process:
- Clears old files in `web/`
- Bundles React app with optimizations
- Uses relative paths (configured in `vite.config.js`) for local file loading
- Generates cache-busted filenames

## Known Issues & Quirks

### Dark Bar Above Reviewer

When custom reviewer is enabled and native toolbar is hidden, a ~40px dark bar may remain at the top of the reviewer. This is a Qt layout issue where the hidden `mw.toolbar.web` widget still reserves space despite `setFixedHeight(0)`. Investigation ongoing - see `TECHNICAL.md` section 9 for details.

### Message Queue Polling

The 100ms polling interval is a deliberate trade-off:
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
- Example: `MAX_MESSAGES_PER_CARD = 200`, `DOCK_DEFAULT_WIDTH = 450`

### Imports

All modules use the dual try/except pattern for compatibility (running as Anki addon vs standalone):

```python
try:
    from ..config import get_config    # As Anki addon (relative import)
except ImportError:
    from config import get_config      # Standalone / testing
```

## References

See `TECHNICAL.md` for exhaustive implementation details including:
- Line-by-line Qt component documentation
- All 35 WebBridge methods with signatures
- Complete hook integration documentation
- Error handling patterns
- Toolbar hiding investigation (section 9)

See `QT_INTEGRATION_GUIDE.md` for:
- General Qt/Anki addon development patterns
- Available integration points (menus, toolbars, docks)
- Best practices and common pitfalls
- Code examples for common tasks
