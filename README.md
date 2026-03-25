# AnkiPlus

AI-powered learning assistant for Anki. Replaces Anki's native UI with a modern fullscreen React app featuring chat-based tutoring, card review, and a companion agent (Plusi).

## Quick Start

### Frontend Development

```bash
cd frontend
npm install        # Install dependencies
npm run dev        # Start dev server (localhost:3000) with mock bridges
npm run build      # Build for production (outputs to web/)
npm run build:dev  # Build in development mode
```

The frontend is developed in a browser first. The dev server includes mock bridges so the UI works without Anki running.

### Testing in Anki

Build the frontend, then restart Anki. The addon loads static files from the `web/` directory.

### Running Tests

```bash
python3 run_tests.py       # Run all tests
python3 run_tests.py -v    # Verbose output
python3 run_tests.py -k text  # Filter by name
```

Tests mock the entire `aqt`/PyQt module tree and run without Anki installed.

## Architecture

Three layers communicate via a polling-based message queue (100ms interval):

- **Python/PyQt6 backend** — Anki addon integration, AI API handling, SQLite session storage
- **React frontend** — fullscreen UI loaded in `QWebEngineView` via `setCentralWidget`
- **Qt WebChannel bridge** — 50 `@pyqtSlot` methods in `ui/bridge.py`; JavaScript polls a queue, Python polls back

JavaScript calls `window.ankiBridge.addMessage(type, data)`. Python routes the message in `_handle_js_message()`. Python sends back via `page().runJavaScript("window.ankiReceive(...)")`.

See `CLAUDE.md` for full architecture docs, bridge method reference, and design system rules.

## Tech Stack

- Python 3.9+, PyQt6, QWebEngineView
- React 18, Vite, Tailwind CSS, DaisyUI, Framer Motion
- Google Gemini API (primary AI provider)
- SQLite (per-card session storage, WAL mode)
- Firebase / Vercel (auth, billing, embeddings API)

## Configuration

Copy `config.json.example` to `config.json` and fill in your API keys. `config.json` is never committed to the repository.
