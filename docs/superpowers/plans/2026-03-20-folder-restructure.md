# Folder Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize 31 flat Python files into 5 logical packages (ai/, plusi/, storage/, ui/, utils/) while preserving all functionality.

**Architecture:** Each package gets an `__init__.py` that re-exports its public API. All imports across the codebase change from `from .module` to `from .package.module`. The two root files `__init__.py` and `config.py` stay in place.

**Tech Stack:** Python, git mv, no external tools needed. No tests exist — verification via Python AST parsing + manual Anki restart.

**Risk:** Every wrong import = Anki crash on startup. Each task is verified independently before moving to the next.

**IMPORTANT — Review Findings (v2):** The initial plan was reviewed and 17 gaps were found (8 critical). All gaps below are incorporated. Key additions:
- `custom_reviewer/__init__.py` has 10+ imports of `ui_setup` and `plusi_dock` that MUST be updated (was marked "unchanged" in v1)
- `widget.py:259` loads `web/index.html` via `os.path.dirname(__file__)` — path must be fixed or UI won't load
- `plusi_dock.py` imports `plusi_storage` at 3+ locations (was missing entirely)
- `tool_registry.py` imports `plusi_agent` (cross-package, was missing)
- `settings_window.py` has 2 additional import blocks not in v1
- `custom_screens.py` has 4x `from . import ui_setup` module-level imports (not just `from .ui_setup`)
- Between Tasks 4-7 the codebase is in a BROKEN intermediate state — do NOT try to start Anki
- The implementer MUST do a global grep for EVERY moved module name (both `from .module import` AND `from . import module` AND bare `from module import` patterns) rather than relying solely on the documented import map

---

## File Movement Map

### Stays in Root
- `__init__.py` (Anki entry point)
- `config.py` (imported by everything, no circular deps)
- `manifest.json` (Anki requirement)
- `card_mc_injector.js` (loaded by card_tracker.py via file path)
- `reviewer_premium.js` (loaded by card_tracker.py via file path)
- `test_css_injection.js` (loaded by card_tracker.py via file path)
- `settings.html` (loaded by settings_window.py + plusi_panel.py via file path)

### Delete (unused)
- `card_styles.css` (not imported anywhere)
- `toolbar_icon_buttons.js` (not imported anywhere)

### Move to `ai/`
| Old Path | New Path | New Import |
|---|---|---|
| `ai_handler.py` | `ai/handler.py` | `from .ai.handler` |
| `auth_manager.py` | `ai/auth.py` | `from .ai.auth` |
| `system_prompt.py` | `ai/system_prompt.py` | `from .ai.system_prompt` |
| `agent_loop.py` | `ai/agent_loop.py` | `from .ai.agent_loop` |
| `tool_registry.py` | `ai/tools.py` | `from .ai.tools` |
| `tool_executor.py` | `ai/tool_executor.py` | `from .ai.tool_executor` |
| `hybrid_retrieval.py` | `ai/retrieval.py` | `from .ai.retrieval` |
| `embedding_manager.py` | `ai/embeddings.py` | `from .ai.embeddings` |

### Move to `plusi/`
| Old Path | New Path | New Import |
|---|---|---|
| `plusi_agent.py` | `plusi/agent.py` | `from .plusi.agent` |
| `plusi_dock.py` | `plusi/dock.py` | `from .plusi.dock` |
| `plusi_panel.py` | `plusi/panel.py` | `from .plusi.panel` |
| `plusi_storage.py` | `plusi/storage.py` | `from .plusi.storage` |

### Move to `storage/`
| Old Path | New Path | New Import |
|---|---|---|
| `card_sessions_storage.py` | `storage/card_sessions.py` | `from .storage.card_sessions` |
| `sessions_storage.py` | `storage/sessions.py` | `from .storage.sessions` |
| `mc_cache.py` | `storage/mc_cache.py` | `from .storage.mc_cache` |
| `insight_extractor.py` | `storage/insights.py` | `from .storage.insights` |

### Move to `ui/`
| Old Path | New Path | New Import |
|---|---|---|
| `widget.py` | `ui/widget.py` | `from .ui.widget` |
| `bridge.py` | `ui/bridge.py` | `from .ui.bridge` |
| `ui_setup.py` | `ui/setup.py` | `from .ui.setup` |
| `ui_manager.py` | `ui/manager.py` | `from .ui.manager` |
| `settings_window.py` | `ui/settings.py` | `from .ui.settings` |
| `theme.py` | `ui/theme.py` | `from .ui.theme` |
| `anki_global_theme.py` | `ui/global_theme.py` | `from .ui.global_theme` |
| `overlay_chat.py` | `ui/overlay_chat.py` | `from .ui.overlay_chat` |
| `custom_screens.py` | `ui/custom_screens.py` | `from .ui.custom_screens` |

### Move to `utils/`
| Old Path | New Path | New Import |
|---|---|---|
| `text_utils.py` | `utils/text.py` | `from .utils.text` |
| `anki_utils.py` | `utils/anki.py` | `from .utils.anki` |
| `card_tracker.py` | `utils/card_tracker.py` | `from .utils.card_tracker` |
| `image_search.py` | `utils/image_search.py` | `from .utils.image_search` |

---

## Import Rewriting Rules

Every import follows this pattern (try/except for Anki compatibility):

**Old pattern:**
```python
try:
    from .old_module import Thing
except ImportError:
    from old_module import Thing
```

**New pattern:**
```python
try:
    from .package.new_module import Thing
except ImportError:
    from package.new_module import Thing
```

### Complete Import Change Map

#### `__init__.py` (root) — 12 import blocks to update

| Line(s) | Old | New |
|---|---|---|
| 19-22 | `from .ui_setup import ...` | `from .ui.setup import ...` |
| 25-28 | `from .anki_global_theme import ...` | `from .ui.global_theme import ...` |
| 31-34 | `from .custom_reviewer import ...` | stays (custom_reviewer/ unchanged) |
| 37-40 | `from .custom_screens import ...` | `from .ui.custom_screens import ...` |
| 128-136 | `from .ui_manager import ...` | `from .ui.manager import ...` |
| 149-151 | `from .embedding_manager import ...` | `from .ai.embeddings import ...` |
| 154-156 | `from .config import ...` | stays (config.py unchanged) |
| 209 | `from .card_sessions_storage import ...` | `from .storage.card_sessions import ...` |
| 217-221 | `from .config / .ai_handler import ...` | `from .ai.handler import ...` |
| 378+ | `from .plusi_agent / .plusi_dock / .plusi_panel` | `from .plusi.agent / .plusi.dock / .plusi.panel` |
| 525 | `from plusi_dock import show_bubble` | `from plusi.dock import show_bubble` |
| 596 | `from .ui_setup import close_chatbot_panel` | `from .ui.setup import close_chatbot_panel` |

#### `ai/handler.py` (was ai_handler.py) — 8 import blocks

| Old | New |
|---|---|
| `from .config import ...` | stays (config.py still at root) |
| `from .system_prompt import ...` | `from .ai.system_prompt import ...` → but since handler.py is IN ai/, use `from .system_prompt import ...` |
| `from .tool_registry import ...` | `from .tools import ...` (same package) |
| `from .agent_loop import ...` | `from .agent_loop import ...` (same package) |
| `from .auth_manager import ...` | `from .auth import ...` (same package) |
| `from .text_utils import ...` | `from ..utils.text import ...` |
| `from .card_sessions_storage import ...` | `from ..storage.card_sessions import ...` |
| `from .hybrid_retrieval import ...` | `from ..ai.retrieval import ...` → `from .retrieval import ...` (same package) |
| `from .embedding_manager import ...` | `from .embeddings import ...` (same package) |

**Key rule for intra-package imports:** Files within the same package (e.g., `ai/handler.py` importing `ai/tools.py`) use `from .module import ...` (single dot). Files importing from a sibling package use `from ..package.module import ...` (double dot). Files importing from root use `from ..config import ...`.

#### `ui/bridge.py` (was bridge.py) — 6 import blocks

| Old | New |
|---|---|
| `from .config import ...` | `from ..config import ...` |
| `from .ai_handler import ...` | `from ..ai.handler import ...` |
| `from .custom_reviewer import ...` | `from ..custom_reviewer import ...` |
| `from .card_sessions_storage import ...` | `from ..storage.card_sessions import ...` |
| `from .image_search import ...` | `from ..utils.image_search import ...` |
| `from .plusi_panel import ...` | `from ..plusi.panel import ...` |
| `from .overlay_chat import ...` | `from .overlay_chat import ...` (same package) |

#### `ui/widget.py` (was widget.py) — 14 import blocks

| Old | New |
|---|---|
| `from .config import ...` | `from ..config import ...` |
| `from .bridge import ...` | `from .bridge import ...` (same package) |
| `from .card_tracker import ...` | `from ..utils.card_tracker import ...` |
| `from .card_sessions_storage import ...` | `from ..storage.card_sessions import ...` |
| `from .insight_extractor import ...` | `from ..storage.insights import ...` |
| `from .custom_reviewer import ...` | `from ..custom_reviewer import ...` |
| `from .ai_handler import ...` | `from ..ai.handler import ...` |
| `from .plusi_agent import ...` | `from ..plusi.agent import ...` |
| `from .plusi_dock import ...` | `from ..plusi.dock import ...` |
| `from .plusi_panel import ...` | `from ..plusi.panel import ...` |
| `from .plusi_storage import ...` | `from ..plusi.storage import ...` |
| `from .tool_executor import ...` | `from ..ai.tool_executor import ...` |
| `from .ui_setup import ...` | `from .setup import ...` (same package) |
| `from .settings_window import ...` | `from .settings import ...` (same package) |
| `from .text_utils import ...` | `from ..utils.text import ...` |
| `from .image_search import ...` | `from ..utils.image_search import ...` |

#### `ui/custom_screens.py` (was custom_screens.py)

| Old | New |
|---|---|
| `from .plusi_dock import ...` | `from ..plusi.dock import ...` |
| `from .config import ...` | `from ..config import ...` |
| `from .overlay_chat import ...` | `from .overlay_chat import ...` (same package) |
| `from .ui_setup import ...` | `from .setup import ...` (same package) |

#### `ui/overlay_chat.py` (was overlay_chat.py)

| Old | New |
|---|---|
| `from .card_sessions_storage import ...` | `from ..storage.card_sessions import ...` |
| `from .config import ...` | `from ..config import ...` |
| `from .ai_handler import ...` | `from ..ai.handler import ...` |

#### `ui/setup.py` (was ui_setup.py)

| Old | New |
|---|---|
| `from .widget import ...` | `from .widget import ...` (same package) |
| `from .settings_window import ...` | `from .settings import ...` (same package) |
| `from .custom_reviewer import ...` | `from ..custom_reviewer import ...` |

#### `ui/settings.py` (was settings_window.py)

| Old | New |
|---|---|
| `from .config import ...` | `from ..config import ...` |

NOTE: `settings.html` is loaded via `os.path.dirname(__file__)`. Since the file moves to `ui/`, we need to update the path to `os.path.join(os.path.dirname(__file__), '..', 'settings.html')`.

#### `utils/card_tracker.py` (was card_tracker.py)

| Old | New |
|---|---|
| `from .embedding_manager import ...` / `from . import get_embedding_manager` | `from ..ai.embeddings import ...` / `from .. import get_embedding_manager` |

NOTE: `card_mc_injector.js`, `reviewer_premium.js`, `test_css_injection.js` are loaded via `addon_dir = os.path.dirname(os.path.dirname(__file__))` pattern — but since card_tracker moves to `utils/`, `os.path.dirname(__file__)` changes. Must update to `os.path.join(os.path.dirname(os.path.dirname(__file__)), 'card_mc_injector.js')`.

#### `plusi/agent.py` (was plusi_agent.py)

| Old | New |
|---|---|
| `from .plusi_storage import ...` | `from .storage import ...` (same package) |
| `from .config import ...` | `from ..config import ...` |

#### `plusi/panel.py` (was plusi_panel.py)

| Old | New |
|---|---|
| `from .plusi_dock import ...` | `from .dock import ...` (same package) |
| `from .plusi_storage import ...` | `from .storage import ...` (same package) |
| `from .settings_window import ...` | `from ..ui.settings import ...` |

NOTE: `settings.html` is loaded in plusi_panel.py via `os.path.dirname(__file__)` — must update path to `os.path.join(os.path.dirname(os.path.dirname(__file__)), 'settings.html')`.

#### `ai/handler.py` internal imports (within ai/)

These become simple same-package imports:
- `from .system_prompt import ...`
- `from .tools import registry as tool_registry`
- `from .agent_loop import ...`
- `from .auth import ...`
- `from .retrieval import ...`
- `from .embeddings import ...`

Cross-package:
- `from ..config import ...`
- `from ..utils.text import ...`
- `from ..storage.card_sessions import ...`

#### `ai/agent_loop.py` (was agent_loop.py)

| Old | New |
|---|---|
| `from .tool_executor import ...` | `from .tool_executor import ...` (same package) |
| `from .tool_registry import ...` | `from .tools import ...` (same package, renamed) |

#### `ai/tools.py` (was tool_registry.py) — internal imports

| Old | New |
|---|---|
| `from .anki_utils import ...` | `from ..utils.anki import ...` |

#### `ai/auth.py` (was auth_manager.py)

| Old | New |
|---|---|
| `from .config import ...` | `from ..config import ...` |

#### `storage/card_sessions.py` — no local imports (leaf node)
#### `storage/sessions.py` — no local imports (leaf node)
#### `storage/mc_cache.py` — no local imports (leaf node)
#### `storage/insights.py` — no local imports (leaf node)
#### `ai/embeddings.py` (was embedding_manager.py)

| Old | New |
|---|---|
| `from .card_sessions_storage import ...` | `from ..storage.card_sessions import ...` |

---

## Tasks

### Task 1: Create package directories with __init__.py files

**Files:**
- Create: `ai/__init__.py`, `plusi/__init__.py`, `storage/__init__.py`, `ui/__init__.py`, `utils/__init__.py`

- [ ] **Step 1: Create directories and __init__.py files**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
for pkg in ai plusi storage ui utils; do
  mkdir -p "$pkg"
  touch "$pkg/__init__.py"
done
```

- [ ] **Step 2: Delete unused files**

```bash
git rm card_styles.css toolbar_icon_buttons.js
```

- [ ] **Step 3: Commit**

```bash
git add ai/ plusi/ storage/ ui/ utils/
git commit -m "chore: create package directories for folder restructure"
```

---

### Task 2: Move storage/ files (leaf nodes, no local imports)

**Files:**
- Move: `card_sessions_storage.py` → `storage/card_sessions.py`
- Move: `sessions_storage.py` → `storage/sessions.py`
- Move: `mc_cache.py` → `storage/mc_cache.py`
- Move: `insight_extractor.py` → `storage/insights.py`

- [ ] **Step 1: Move files**

```bash
git mv card_sessions_storage.py storage/card_sessions.py
git mv sessions_storage.py storage/sessions.py
git mv mc_cache.py storage/mc_cache.py
git mv insight_extractor.py storage/insights.py
```

- [ ] **Step 2: Update storage/__init__.py with re-exports**

```python
"""Storage layer: Card sessions, insights, caches."""
```

- [ ] **Step 3: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('storage/card_sessions.py').read()); print('OK')"
python3 -c "import ast; ast.parse(open('storage/sessions.py').read()); print('OK')"
python3 -c "import ast; ast.parse(open('storage/mc_cache.py').read()); print('OK')"
python3 -c "import ast; ast.parse(open('storage/insights.py').read()); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add storage/
git commit -m "refactor: move storage modules to storage/ package"
```

---

### Task 3: Move utils/ files (leaf nodes + card_tracker)

**Files:**
- Move: `text_utils.py` → `utils/text.py`
- Move: `anki_utils.py` → `utils/anki.py`
- Move: `card_tracker.py` → `utils/card_tracker.py`
- Move: `image_search.py` → `utils/image_search.py`

- [ ] **Step 1: Move files**

```bash
git mv text_utils.py utils/text.py
git mv anki_utils.py utils/anki.py
git mv card_tracker.py utils/card_tracker.py
git mv image_search.py utils/image_search.py
```

- [ ] **Step 2: Update utils/__init__.py**

```python
"""Shared utilities: text processing, Anki helpers, image search."""
```

- [ ] **Step 3: Update card_tracker.py internal imports**

In `utils/card_tracker.py`, change:
- `from .embedding_manager import ...` → `from ..ai.embeddings import ...`
- `from . import get_embedding_manager` → `from .. import get_embedding_manager`
- Fix `addon_dir` paths: since file is now in `utils/`, add one more `os.path.dirname()` level to reach root for JS file loading.

- [ ] **Step 4: Verify syntax**

```bash
for f in utils/text.py utils/anki.py utils/card_tracker.py utils/image_search.py; do
  python3 -c "import ast; ast.parse(open('$f').read()); print('$f OK')"
done
```

- [ ] **Step 5: Commit**

```bash
git add utils/
git commit -m "refactor: move utility modules to utils/ package"
```

---

### Task 4: Move plusi/ files

**Files:**
- Move: `plusi_agent.py` → `plusi/agent.py`
- Move: `plusi_dock.py` → `plusi/dock.py`
- Move: `plusi_panel.py` → `plusi/panel.py`
- Move: `plusi_storage.py` → `plusi/storage.py`

- [ ] **Step 1: Move files**

```bash
git mv plusi_agent.py plusi/agent.py
git mv plusi_dock.py plusi/dock.py
git mv plusi_panel.py plusi/panel.py
git mv plusi_storage.py plusi/storage.py
```

- [ ] **Step 2: Update plusi/__init__.py**

```python
"""Plusi companion: personality agent, dock widget, panel, storage."""
```

- [ ] **Step 3: Update imports within plusi/**

In `plusi/agent.py`:
- `from .plusi_storage import ...` → `from .storage import ...`
- `from .config import ...` → `from ..config import ...`

In `plusi/panel.py`:
- `from .plusi_dock import ...` → `from .dock import ...`
- `from .plusi_storage import ...` → `from .storage import ...`
- `from .settings_window import ...` → `from ..ui.settings import ...`
- Fix `settings.html` path: `os.path.join(os.path.dirname(os.path.dirname(__file__)), 'settings.html')`

- [ ] **Step 4: Verify syntax**

```bash
for f in plusi/agent.py plusi/dock.py plusi/panel.py plusi/storage.py; do
  python3 -c "import ast; ast.parse(open('$f').read()); print('$f OK')"
done
```

- [ ] **Step 5: Commit**

```bash
git add plusi/
git commit -m "refactor: move plusi modules to plusi/ package"
```

---

### Task 5: Move ai/ files

**Files:**
- Move: `ai_handler.py` → `ai/handler.py`
- Move: `auth_manager.py` → `ai/auth.py`
- Move: `system_prompt.py` → `ai/system_prompt.py`
- Move: `agent_loop.py` → `ai/agent_loop.py`
- Move: `tool_registry.py` → `ai/tools.py`
- Move: `tool_executor.py` → `ai/tool_executor.py`
- Move: `hybrid_retrieval.py` → `ai/retrieval.py`
- Move: `embedding_manager.py` → `ai/embeddings.py`

- [ ] **Step 1: Move files**

```bash
git mv ai_handler.py ai/handler.py
git mv auth_manager.py ai/auth.py
git mv system_prompt.py ai/system_prompt.py
git mv agent_loop.py ai/agent_loop.py
git mv tool_registry.py ai/tools.py
git mv tool_executor.py ai/tool_executor.py
git mv hybrid_retrieval.py ai/retrieval.py
git mv embedding_manager.py ai/embeddings.py
```

- [ ] **Step 2: Update ai/__init__.py**

```python
"""AI engine: API handler, tools, RAG retrieval, embeddings, auth."""
```

- [ ] **Step 3: Update imports within ai/**

In `ai/handler.py` (the largest file, most imports):
- `from .config import ...` → `from ..config import ...`
- `from .system_prompt import ...` → `from .system_prompt import ...` (same package)
- `from .tool_registry import registry as tool_registry` → `from .tools import registry as tool_registry`
- `from .agent_loop import ...` → `from .agent_loop import ...` (same package)
- `from .auth_manager import ...` → `from .auth import ...` (same package)
- `from .text_utils import ...` → `from ..utils.text import ...`
- `from .card_sessions_storage import ...` → `from ..storage.card_sessions import ...`
- `from .hybrid_retrieval import ...` → `from .retrieval import ...` (same package)
- `from .embedding_manager import ...` → `from .embeddings import ...` (same package)
- `from . import get_embedding_manager` → `from .. import get_embedding_manager`

In `ai/auth.py`:
- `from .config import ...` → `from ..config import ...`

In `ai/agent_loop.py`:
- `from .tool_executor import ...` → stays (same package)
- `from .tool_registry import ...` → `from .tools import ...`

In `ai/tools.py`:
- `from .anki_utils import ...` → `from ..utils.anki import ...`

In `ai/embeddings.py`:
- `from .card_sessions_storage import ...` → `from ..storage.card_sessions import ...`

- [ ] **Step 4: Verify syntax**

```bash
for f in ai/handler.py ai/auth.py ai/system_prompt.py ai/agent_loop.py ai/tools.py ai/tool_executor.py ai/retrieval.py ai/embeddings.py; do
  python3 -c "import ast; ast.parse(open('$f').read()); print('$f OK')"
done
```

- [ ] **Step 5: Commit**

```bash
git add ai/
git commit -m "refactor: move AI modules to ai/ package"
```

---

### Task 6: Move ui/ files

**Files:**
- Move: `widget.py` → `ui/widget.py`
- Move: `bridge.py` → `ui/bridge.py`
- Move: `ui_setup.py` → `ui/setup.py`
- Move: `ui_manager.py` → `ui/manager.py`
- Move: `settings_window.py` → `ui/settings.py`
- Move: `theme.py` → `ui/theme.py`
- Move: `anki_global_theme.py` → `ui/global_theme.py`
- Move: `overlay_chat.py` → `ui/overlay_chat.py`
- Move: `custom_screens.py` → `ui/custom_screens.py`

- [ ] **Step 1: Move files**

```bash
git mv widget.py ui/widget.py
git mv bridge.py ui/bridge.py
git mv ui_setup.py ui/setup.py
git mv ui_manager.py ui/manager.py
git mv settings_window.py ui/settings.py
git mv theme.py ui/theme.py
git mv anki_global_theme.py ui/global_theme.py
git mv overlay_chat.py ui/overlay_chat.py
git mv custom_screens.py ui/custom_screens.py
```

- [ ] **Step 2: Update ui/__init__.py**

```python
"""UI layer: Qt widgets, bridge, theming, settings, custom screens."""
```

- [ ] **Step 3: Update imports within ui/**

In `ui/widget.py` (most imports):
- `from .config import ...` → `from ..config import ...`
- `from .bridge import ...` → stays (same package)
- `from .card_tracker import ...` → `from ..utils.card_tracker import ...`
- `from .card_sessions_storage import ...` → `from ..storage.card_sessions import ...`
- `from .insight_extractor import ...` → `from ..storage.insights import ...`
- `from .custom_reviewer import ...` → `from ..custom_reviewer import ...`
- `from .ai_handler import ...` → `from ..ai.handler import ...`
- `from .plusi_agent import ...` → `from ..plusi.agent import ...`
- `from .plusi_dock import ...` → `from ..plusi.dock import ...`
- `from .plusi_panel import ...` → `from ..plusi.panel import ...`
- `from .plusi_storage import ...` → `from ..plusi.storage import ...`
- `from .tool_executor import ...` → `from ..ai.tool_executor import ...`
- `from .ui_setup import ...` → `from .setup import ...` (same package)
- `from .settings_window import ...` → `from .settings import ...` (same package)
- `from .text_utils import ...` → `from ..utils.text import ...`
- `from .image_search import ...` → `from ..utils.image_search import ...`
- `from . import check_and_trigger_reflect` → `from .. import check_and_trigger_reflect`

In `ui/bridge.py`:
- `from .config import ...` → `from ..config import ...`
- `from .ai_handler import ...` → `from ..ai.handler import ...`
- `from .custom_reviewer import ...` → `from ..custom_reviewer import ...`
- `from .card_sessions_storage import ...` → `from ..storage.card_sessions import ...`
- `from .image_search import ...` → `from ..utils.image_search import ...`
- `from .plusi_panel import ...` → `from ..plusi.panel import ...`
- `from .overlay_chat import ...` → `from .overlay_chat import ...` (same package)

In `ui/setup.py`:
- `from .widget import ...` → stays (same package)
- `from .settings_window import ...` → `from .settings import ...`
- `from .custom_reviewer import ...` → `from ..custom_reviewer import ...`

In `ui/settings.py`:
- `from .config import ...` → `from ..config import ...`
- Fix `settings.html` path: add `os.path.dirname()` level

In `ui/custom_screens.py`:
- `from .plusi_dock import ...` → `from ..plusi.dock import ...`
- `from .config import ...` → `from ..config import ...`
- `from .overlay_chat import ...` → stays (same package)
- `from .ui_setup import ...` → `from .setup import ...`

In `ui/overlay_chat.py`:
- `from .card_sessions_storage import ...` → `from ..storage.card_sessions import ...`
- `from .config import ...` → `from ..config import ...`
- `from .ai_handler import ...` → `from ..ai.handler import ...`

In `ui/theme.py`:
- `from .config import ...` → `from ..config import ...`

- [ ] **Step 4: Verify syntax**

```bash
for f in ui/widget.py ui/bridge.py ui/setup.py ui/manager.py ui/settings.py ui/theme.py ui/global_theme.py ui/overlay_chat.py ui/custom_screens.py; do
  python3 -c "import ast; ast.parse(open('$f').read()); print('$f OK')"
done
```

- [ ] **Step 5: Commit**

```bash
git add ui/
git commit -m "refactor: move UI modules to ui/ package"
```

---

### Task 7: Update __init__.py (root entry point)

**Files:**
- Modify: `__init__.py`

This is the most critical step — the file that Anki loads first.

- [ ] **Step 1: Update all import statements**

Apply the import map from the "Import Change Map" section above. Every `from .old_module` becomes `from .package.new_module`.

Key changes:
```python
# UI
from .ui.setup import setup_ui, setup_menu, get_chatbot_widget
from .ui.global_theme import setup_global_theme
from .ui.custom_screens import custom_screens
from .ui.manager import (hide_native_bottom_bar, show_native_bottom_bar, ...)

# AI
from .ai.handler import get_ai_handler
from .ai.embeddings import EmbeddingManager

# Storage
from .storage.card_sessions import migrate_from_json

# Plusi
from .plusi.agent import self_reflect
from .plusi.dock import sync_mood, show_bubble
from .plusi.panel import notify_new_diary_entry

# Config stays
from .config import ...

# Custom Reviewer stays
from .custom_reviewer import custom_reviewer
```

- [ ] **Step 2: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('__init__.py').read()); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add __init__.py
git commit -m "refactor: update root __init__.py imports for new package structure"
```

---

### Task 8: Update CLAUDE.md with new structure

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the "Critical File Locations" section**

Update the entire file structure section to reflect the new package layout. Add a "Package Structure" section near the top:

```markdown
## Package Structure

AnkiPlus_main/
├── __init__.py              # Entry point (Anki loads this)
├── config.py                # Global configuration
├── ai/                      # AI engine: API, tools, RAG, embeddings
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
├── ui/                      # Qt UI components
│   ├── widget.py            # ChatbotWidget (QWebEngineView)
│   ├── bridge.py            # WebBridge (JS ↔ Python)
│   ├── setup.py             # DockWidget creation, shortcuts
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

- [ ] **Step 2: Update import examples in CLAUDE.md**

Update the "Adding a New Bridge Method" section to use new import paths.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new package structure"
```

---

### Task 9: Verify everything works

- [ ] **Step 1: Verify no .py files remain in root (except __init__.py and config.py)**

```bash
ls *.py
# Expected: __init__.py config.py (only these two)
```

- [ ] **Step 2: Verify all Python files parse correctly**

```bash
find . -name "*.py" -not -path "*/node_modules/*" -not -path "*/__pycache__/*" -not -path "*/frontend/*" -not -path "*/Landingpage/*" | while read f; do
  python3 -c "import ast; ast.parse(open('$f').read())" 2>&1 && echo "OK: $f" || echo "FAIL: $f"
done
```

- [ ] **Step 3: Verify no broken import references**

```bash
# Check that no imports reference old module names at root level
grep -rn "from \.ai_handler\b\|from \.bridge\b\|from \.widget\b\|from \.ui_setup\b\|from \.plusi_agent\b\|from \.plusi_dock\b\|from \.plusi_panel\b\|from \.plusi_storage\b\|from \.card_sessions_storage\b\|from \.embedding_manager\b\|from \.tool_registry\b\|from \.text_utils\b\|from \.anki_utils\b\|from \.image_search\b\|from \.auth_manager\b\|from \.ui_manager\b\|from \.settings_window\b\|from \.anki_global_theme\b\|from \.overlay_chat\b\|from \.custom_screens\b\|from \.sessions_storage\b\|from \.mc_cache\b\|from \.insight_extractor\b\|from \.hybrid_retrieval\b\|from \.system_prompt\b\|from \.agent_loop\b\|from \.tool_executor\b\|from \.theme\b\|from \.card_tracker\b" --include="*.py" .
# Expected: NO matches (all old imports should be updated)
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: complete folder restructure — 31 files into 5 packages"
```

---

## Fallback Import Pattern

Every import in the codebase uses try/except for Anki compatibility. The new pattern for cross-package imports:

```python
# From a file in ai/ importing from storage/
try:
    from ..storage.card_sessions import load_card_session
except ImportError:
    from storage.card_sessions import load_card_session
```

For same-package imports:
```python
# From ai/handler.py importing ai/tools.py
try:
    from .tools import registry as tool_registry
except ImportError:
    from tools import registry as tool_registry
```

For root-level imports:
```python
# From any package importing config.py
try:
    from ..config import get_config
except ImportError:
    from config import get_config
```

---

## Review Findings — Additional Import Changes (CRITICAL)

These were missing from the initial plan and MUST be applied during the relevant tasks.

### Task 4 additions: plusi/dock.py

`plusi_dock.py` imports `plusi_storage` at 3+ locations. These must become:
- `from .plusi_storage import set_memory` → `from .storage import set_memory`
- `from .plusi_storage import get_memory` → `from .storage import get_memory`
- All fallbacks: `from plusi_storage import ...` → `from storage import ...`

### Task 5 additions: ai/tools.py (was tool_registry.py)

Missing cross-package import at ~line 283:
- `from .plusi_agent import run_plusi` → `from ..plusi.agent import run_plusi`
- Fallback: `from plusi_agent import run_plusi` → `from plusi.agent import run_plusi`

### Task 5 additions: ai/handler.py

- Line 2031: `from . import card_sessions_storage` → must search for exact usage and replace with `from ..storage import card_sessions` or `from ..storage.card_sessions import <specific_function>`
- Lines 286, 794, 2732: THREE separate `from .text_utils import ...` → `from ..utils.text import ...` (all three!)
- Line 3113: `from . import get_embedding_manager` → `from .. import get_embedding_manager`

### Task 6 additions: ui/widget.py

**CRITICAL PATH FIX (line ~259):**
```python
# OLD:
html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
# NEW (must go up one directory since we're now in ui/):
html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", "index.html")
```
Without this fix, the entire chat UI will not load.

**Debug log path fix (line ~679):**
```python
# OLD:
log_path = os.path.join(os.path.dirname(__file__), '.cursor', 'debug.log')
# NEW:
log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.cursor', 'debug.log')
```

**Bare fallback imports (no dot prefix) that must also be updated:**
- Line 872: `from plusi_dock import sync_mood` → `from plusi.dock import sync_mood`
- Line 728: `from .plusi_panel import ...` (no try/except — add one or it crashes)

### Task 6 additions: ui/settings.py (was settings_window.py)

Missing imports:
- `from .card_sessions_storage import count_embeddings` → `from ..storage.card_sessions import count_embeddings`
- `from . import get_embedding_manager` → `from .. import get_embedding_manager`

### Task 6 additions: ui/custom_screens.py

Missing 4x module-level imports at lines 1224, 1235, 1248, 1262:
- `from . import ui_setup` → `from . import setup` (same package, but module renamed)
- `from . import ui_setup` (fallback) → `from . import setup`

### Task 6 addition: custom_reviewer/__init__.py (NOT "unchanged"!)

**CRITICAL:** `custom_reviewer/__init__.py` imports from moved modules:
- ~10 occurrences of `from .. import ui_setup` → `from ..ui import setup as ui_setup`
  OR update all references to use `from ..ui.setup import <function>`
- `from ..plusi_dock import get_plusi_dock_injection` → `from ..plusi.dock import get_plusi_dock_injection`
- Fallback: `from plusi_dock import get_plusi_dock_injection` → `from plusi.dock import get_plusi_dock_injection`

### Task 9 additions: Enhanced verification grep

Add these patterns to the verification grep:
```bash
# Also check module-import pattern and bare fallback imports
grep -rn "from \. import ui_setup\|from \. import card_sessions_storage\|from \. import plusi_dock\|from plusi_dock import\|from plusi_agent import\|from plusi_storage import\|from card_sessions_storage import\|from ai_handler import\|from widget import\|from bridge import\|from tool_registry import\|from embedding_manager import\|from ui_setup import\|from settings_window import\|from anki_global_theme import\|from overlay_chat import\|from custom_screens import\|from text_utils import\|from anki_utils import\|from image_search import\|from auth_manager import\|from ui_manager import" --include="*.py" .
```

### General implementation guidance

**DO NOT rely solely on the import map above.** For EACH moved file, run:
```bash
grep -rn "old_module_name" --include="*.py" .
```
to find ALL references (including `from . import module`, bare `from module import`, string references, etc.).
