<div align="center">

# AnkiPlus

**AI-powered learning assistant for Anki**

Replaces Anki's native UI with a modern fullscreen React app featuring chat-based tutoring, intelligent card review, and Plusi — your personal study companion.

</div>

## Features

- **AI Tutor** — Context-aware chat that understands your cards, deck, and learning history
- **Smart Reviewer** — Modern card review UI with multiple-choice generation, feedback, and insights
- **Plusi Companion** — An AI companion with personality, mood, and a private diary
- **Research Agent** — Web-powered deep research with citations and source cards
- **RAG Pipeline** — Retrieval-augmented generation using your own card collection
- **Agentic Architecture** — Modular agent system with tool use, handoffs, and reasoning display
- **Design System** — Premium dark/light UI built on a custom token-based design system

## Quick Start

### Frontend Development

```bash
cd frontend
npm install        # Install dependencies
npm run dev        # Start dev server (localhost:3000) with mock bridges
npm run build      # Build for production (outputs to web/)
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

## Architecture

Three layers communicate via a polling-based message queue:

- **Python/PyQt6 backend** — Anki addon integration, AI API handling, SQLite session storage
- **React frontend** — Fullscreen UI loaded in `QWebEngineView` via `setCentralWidget`
- **Bridge layer** — `@pyqtSlot` methods in `ui/bridge.py`; bidirectional JS ↔ Python messaging

## Tech Stack

- Python 3.9+, PyQt6, QWebEngineView
- React 18, Vite, Tailwind CSS, DaisyUI, Framer Motion
- Google Gemini API (primary AI provider)
- SQLite (per-card session storage, WAL mode)
- Firebase / Vercel (auth, billing, embeddings API)

## Configuration

Copy `config.json.example` to `config.json` and fill in your API keys. Configuration files containing secrets are never committed to the repository.

## License

This project uses a split license model:

**Anki Integration Layer** (`__init__.py`, `ui/`) — Licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html) (AGPL-3.0), consistent with Anki's own license.

**All Other Components** — Proprietary. All rights reserved.

```
Copyright (c) 2026 Johannes Hinkel. All rights reserved.

The React frontend (frontend/), AI modules (ai/), backend services (backend/,
functions/), design system (shared/), Plusi companion (plusi/), and all associated
assets are proprietary software. Unauthorized copying, modification, distribution,
or use of these components is strictly prohibited without prior written permission
from the copyright holder.

The Anki integration layer (ui/, __init__.py) is licensed under AGPL-3.0 to comply
with Anki's licensing requirements. This does not extend to the rest of the codebase.
```

For licensing inquiries, contact the author.
