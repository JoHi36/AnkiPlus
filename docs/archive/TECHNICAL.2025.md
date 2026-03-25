# Anki Chatbot Addon - Technische Dokumentation

## Architektur

### Komponenten

- **ChatbotPanel**: Seitliches Panel-Widget (QDockWidget) - Python/Qt
- **ChatbotWidget**: Haupt-Widget für die Chat-UI - Python/Qt
- **WebBridge**: Bridge zwischen Python und JavaScript (QWebChannel)
- **Frontend**: Moderne React-UI mit Vite + Tailwind CSS + DaisyUI
- **AIHandler**: API-Integration für OpenAI, Anthropic und Google

### Integration in Anki

- Verwendet `QDockWidget` für seitliches Panel
- `QWebEngineView` lädt die React-UI aus dem `web/` Ordner
- Floating Action Button (FAB) für schnellen Zugriff
- Menü-Eintrag als Alternative

## Dateistruktur

```
anki-chatbot-addon/
├── manifest.json          # Addon-Metadaten
├── __init__.py           # Hauptdatei, Initialisierung (Python/Qt)
├── ai_handler.py          # KI-Integration (OpenAI, Anthropic, Google)
├── config.py              # Konfiguration
├── settings_dialog.py     # Einstellungsdialog (Python)
├── theme.py               # Theme-Helfer
├── web/                   # Build-Output (statische Dateien)
│   ├── index.html         # HTML-Entry-Point (von Vite generiert)
│   ├── assets/            # JS/CSS-Dateien (von Vite generiert)
│   └── ...
├── frontend/              # Frontend-Entwicklung (React + Vite)
│   ├── src/
│   │   ├── components/    # React-Komponenten
│   │   │   ├── ChatInput.jsx
│   │   │   ├── ChatMessage.jsx
│   │   │   ├── Header.jsx
│   │   │   ├── SettingsDialog.jsx
│   │   │   └── SettingsButton.jsx
│   │   ├── hooks/         # Custom Hooks
│   │   │   └── useAnki.js  # Anki-Bridge Hook
│   │   ├── utils/         # Utilities
│   │   │   └── sessions.js # Session-Management
│   │   ├── App.jsx        # Haupt-Komponente
│   │   └── main.jsx       # Entry Point
│   ├── index.html         # HTML Template
│   ├── vite.config.js     # Vite-Konfiguration
│   ├── tailwind.config.js  # Tailwind + DaisyUI Config
│   └── package.json       # Dependencies
├── Concept.md            # Konzeptdokumentation
├── DESIGN.md             # Design-Sprache
└── TECHNICAL.md          # Diese Datei
```

## Frontend-Architektur

### Technologie-Stack

- **Vite**: Build-Tool und Development-Server (extrem schnell)
- **React 18**: UI-Framework für Komponenten-basierte Entwicklung
- **Tailwind CSS**: Utility-First CSS Framework
- **DaisyUI**: Komponenten-Bibliothek für Tailwind (schnelle UI-Entwicklung)
- **Lucide React**: Professionelle Icon-Bibliothek

### Warum dieser Stack?

1. **Entwicklungsgeschwindigkeit**: Mit Tailwind + DaisyUI kannst du hochwertige UIs in Minuten statt Stunden bauen
2. **Moderne Tools**: React ermöglicht State-Management und Komponenten-Wiederverwendung
3. **Browser-Entwicklung**: Du entwickelst die UI im normalen Browser (Chrome/Safari) und testest sie erst am Ende in Anki
4. **Build-Optimierung**: Vite erzeugt minimalen, optimierten Code für Production

### Kommunikation Python ↔ JavaScript

Die Kommunikation läuft über **QWebChannel**:

1. **Python → JavaScript**: 
   - Python ruft `web_view.page().runJavaScript()` auf
   - Sendet Daten an `window.ankiReceive()`

2. **JavaScript → Python**:
   - JavaScript ruft Methoden auf `ankiBridge` (z.B. `ankiBridge.sendMessage()`)
   - Python empfängt über `@pyqtSlot` annotierte Methoden

### Development-Workflow

1. **Entwicklung**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   - Öffnet Dev-Server auf `http://localhost:3000`
   - Mock-Bridge für Browser-Testing
   - Hot Module Replacement (Änderungen sofort sichtbar)

2. **Build**:
   ```bash
   npm run build
   ```
   - Erstellt optimierte Dateien in `web/`
   - Löscht alte Dateien automatisch
   - Verwendet relative Pfade für lokale Dateien

3. **Test in Anki**:
   - Starte Anki neu
   - UI wird aus `web/` geladen
   - Echte Anki-Bridge aktiv

### UI-Komponenten (React)

- **App.jsx**: Haupt-Komponente, verwaltet State und Kommunikation
- **Header.jsx**: Minimaler Header mit Session-Picker (zentriert)
- **ChatMessage.jsx**: User-Nachrichten als subtile Bubbles, Bot-Antworten als Fließtext
- **ChatInput.jsx**: Schwebendes Input-Feld mit zwei Bereichen (Input oben, Controls unten)
- **SettingsDialog.jsx**: Einstellungsdialog mit Live-Modell-Abruf
- **SettingsButton.jsx**: Settings-Button links oben im Chatfenster

### Backend-Komponenten (Python)

- **ChatbotWidget**: Lädt und verwaltet QWebEngineView
- **WebBridge**: QObject mit @pyqtSlot Methoden für JS-Kommunikation
- **AIHandler**: Implementiert API-Integration für OpenAI, Anthropic und Google
- **toggle_chatbot()**: Öffnet/schließt das Dock-Widget
- **create_floating_button()**: Erstellt den FAB

## API-Integration

### Unterstützte Provider

1. **OpenAI**
   - Modelle werden live von der API abgerufen
   - Unterstützt: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
   - API-Endpoint: `https://api.openai.com/v1/chat/completions`

2. **Anthropic (Claude)**
   - Statische Model-Liste (API bietet keine Model-Liste)
   - Unterstützt: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
   - API-Endpoint: `https://api.anthropic.com/v1/messages`

3. **Google (Gemini)**
   - Modelle werden live von der API abgerufen
   - Unterstützt: Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini Pro
   - API-Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

### Live-Modell-Abruf

- Modelle werden automatisch abgerufen wenn:
  - Settings-Dialog geöffnet wird und API-Key eingegeben wird
  - API-Key gespeichert wird
  - Addon gestartet wird (wenn API-Key vorhanden)
- Fallback auf statische Model-Liste bei Fehlern

### Konfiguration

- API-Keys werden in `config.json` gespeichert (lokal, nicht übertragen)
- Provider-Wechsel lädt automatisch die entsprechenden Modelle
- Model-Auswahl wird in der Config gespeichert

## Technische Details

### UI-Komponenten (React)
- **React Components**: Modulare, wiederverwendbare UI-Bausteine
- **Tailwind CSS**: Utility-First Styling (kein manuelles CSS nötig)
- **DaisyUI**: Fertige Komponenten (Buttons, Cards, etc.)
- **Lucide React**: Professionelle Icons

### Event-Handling
- **React State**: Verwaltet UI-State (Messages, Sessions, Models)
- **useAnki Hook**: Verwaltet Anki-Bridge Verbindung
- **QWebChannel**: Bidirektionale Kommunikation Python ↔ JS

### Session-Management
- **localStorage**: Sessions werden im Browser gespeichert
- **React State**: Aktuelle Session und Messages im State
- **Auto-Save**: Nachrichten werden automatisch gespeichert

## Qt/Python Implementation Details

### Quick Reference: Qt Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| Chatbot Dock | `QDockWidget` | `ui_setup.py:68-103` | Main side panel container |
| Chatbot Widget | `QWidget` | `widget.py:69-84` | Content widget with QWebEngineView |
| Web View | `QWebEngineView` | `widget.py:96-110` | Displays React UI |
| Web Bridge | `QObject` | `bridge.py:39-1476` | Python ↔ JavaScript communication |
| Toolbar Button | `QAction` | `ui_setup.py:201-298` | "AnKI+" button in toolbar |
| Menu Items | `QAction` | `ui_setup.py:356-381` | Tools menu entries |
| Keyboard Shortcut | `QShortcut` | `ui_setup.py:193-199` | Cmd+I / Ctrl+I |
| Global Theme | Stylesheet | `anki_global_theme.py:101-747` | Application-wide dark theme |
| Custom Reviewer | Hook System | `custom_reviewer/__init__.py` | Replace reviewer HTML |

---

### 1. QDockWidget Implementation

**Purpose**: Creates a resizable side panel that docks to Anki's main window

**Location**: `ui_setup.py` (lines 60-190)

**Implementation Details**:

```python
# Global instance
_chatbot_dock = None  # Stored globally to persist

# Creation (ui_setup.py:68-103)
_chatbot_dock = QDockWidget("", mw)  # Empty title (custom header in React)
_chatbot_dock.setObjectName("chatbotDock")
_chatbot_dock.setTitleBarWidget(QWidget())  # Remove standard titlebar
```

**Key Features**:
- **No native title bar**: Uses custom React header instead
- **Right-side docking**: `mw.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, _chatbot_dock)`
- **Resizable**: Min width 350px, max width 800px, default 450px
- **Theme-aware**: Applies dark theme via `get_dock_widget_style()`
- **Toggle-able**: `toggle_chatbot()` function shows/hides the dock

**Styling** (`ui_setup.py:35-50`):
```python
def get_dock_widget_style():
    return """
    QDockWidget {
        background-color: #1A1A1A;
        color: #e6e6e6;
    }
    QDockWidget::separator {
        background: #252525;
        width: 1px;
    }
    """
```

**Integration with Anki**:
- Docked to main window, survives state changes
- Separator styling for seamless dark theme
- Persists across deck browsing and review

---

### 2. ChatbotWidget Architecture

**Purpose**: Container widget that hosts the QWebEngineView for React UI

**Location**: `widget.py` (lines 69-934)

**Class Structure**:

```python
class ChatbotWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.config = get_config()
        self.web_view = None              # QWebEngineView instance
        self.message_timer = None         # QTimer for polling
        self.bridge = WebBridge(self)     # Bridge instance
        self.card_tracker = None          # CardTracker instance
        self.current_card_context = None  # Active card context
```

**Key Methods**:

| Method | Lines | Purpose |
|--------|-------|---------|
| `setup_ui()` | 85-110 | Creates QWebEngineView, loads HTML |
| `_init_js_bridge()` | 112-136 | Sets up message queue system |
| `_poll_messages()` | 138-159 | Polls JavaScript for messages (100ms) |
| `_handle_js_message()` | 161-529 | Routes messages to handlers |
| `push_initial_state()` | 531-567 | Sends init data to React |
| `handle_message_from_ui()` | 617-825 | Processes chat messages with AI |

**QWebEngineView Setup** (`widget.py:96-110`):
```python
self.web_view = QWebEngineView()
self.web_view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)

# Load local HTML with cache busting
html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
cache_buster = f"?v={int(time.time())}"
url = QUrl.fromLocalFile(html_path)
url.setQuery(cache_buster)
self.web_view.load(url)

# Connect signals
self.web_view.loadFinished.connect(self._init_js_bridge)
self.web_view.loadFinished.connect(self.push_initial_state)
```

**Lifecycle**:
1. Widget created when dock opens
2. Web view loads React app from `web/index.html`
3. `loadFinished` signal triggers bridge initialization
4. Message polling starts (100ms timer)
5. Cleanup on dock close

---

### 3. Python ↔ JavaScript Bridge

**Purpose**: Bidirectional communication between Python backend and React frontend

**Location**: `bridge.py` (lines 39-1476) and `widget.py` (lines 112-529)

#### 3.1 Message Queue System

**Why Not QWebChannel?**
- QWebChannel has timing issues and complexity
- Message queue is simpler, more reliable
- Polling overhead is negligible (100ms)

**Implementation** (`widget.py:112-136`):

**Python Side**:
```python
# Create JavaScript queue object
js_code = """
window.ankiBridge = {
    messageQueue: [],
    addMessage: function(type, data) {
        this.messageQueue.push({type, data, timestamp: Date.now()});
    },
    getMessages: function() {
        const messages = this.messageQueue.slice();
        this.messageQueue = [];
        return messages;
    }
};
"""
web_view.page().runJavaScript(js_code)

# Poll every 100ms
self.message_timer = QTimer()
self.message_timer.timeout.connect(self._poll_messages)
self.message_timer.start(100)
```

**JavaScript Side** (`frontend/src/hooks/useAnki.js:19-367`):
```javascript
const bridgeWrapper = {
    sendMessage: (msg, history, mode) => {
        window.ankiBridge.addMessage('sendMessage', { 
            message: msg, 
            history: history,
            mode: mode
        });
    },
    cancelRequest: () => {
        window.ankiBridge.addMessage('cancelRequest', null);
    }
    // ... more methods
};
```

#### 3.2 WebBridge Methods

**All @pyqtSlot Methods** (`bridge.py`):

| Method | Lines | Purpose | Returns |
|--------|-------|---------|---------|
| `sendMessage(str)` | 47-51 | Send chat message | void |
| `cancelRequest()` | 53-73 | Cancel ongoing AI request | void |
| `setModel(str)` | 75-77 | Change AI model | void |
| `openSettings()` | 79-81 | Open settings dialog | void |
| `closePanel()` | 83-85 | Close chatbot panel | void |
| `saveSettings(str,str,str)` | 87-107 | Save config | void |
| `getCurrentConfig()` | 109-120 | Get current config | JSON |
| `fetchModels(str,str)` | 122-155 | Get available models | JSON |
| `getCurrentDeck()` | 157-216 | Get active deck info | JSON |
| `getAvailableDecks()` | 218-238 | Get all decks | JSON |
| `openDeck(int)` | 240-257 | Open deck in reviewer | void |
| `goToCard(str)` | 259-275 | Open card in browser | void |
| `getCardDetails(str)` | 277-347 | Get card HTML | JSON |
| `previewCard(str)` | 349-389 | Show card preview | void |
| `openDeckBrowser()` | 391-406 | Open deck browser | void |
| `getDeckStats(int)` | 440-523 | Get deck statistics | JSON |
| `showAnswer()` | 525-537 | Show answer in reviewer | void |
| `hideAnswer()` | 539-568 | Hide answer, show question | void |
| `generateSectionTitle(str,str)` | 570-631 | Generate AI title | JSON |
| `loadSessions()` | 633-649 | Load chat sessions | JSON |
| `saveSessions(str)` | 651-678 | Save chat sessions | JSON |
| `searchImage(str,str)` | 680-742 | Search for images | JSON |
| `fetchImage(str)` | 910-1111 | Fetch image as base64 | JSON |
| `getAITools()` | 822-844 | Get AI tool settings | JSON |
| `saveAITools(str)` | 846-863 | Save AI tool settings | JSON |
| `authenticate(str,str)` | 1113-1210 | Authenticate user | JSON |
| `getAuthStatus()` | 1212-1240 | Get auth status | JSON |
| `getAuthToken()` | 1242-1253 | Get auth token | JSON |
| `refreshAuth()` | 1255-1274 | Refresh auth token | JSON |
| `openUrl(str)` | 1276-1283 | Open URL in browser | JSON |
| `handleAuthDeepLink(str)` | 1285-1326 | Handle auth deep link | JSON |
| `saveMultipleChoice(int,str)` | 1328-1398 | Save quiz data to card | JSON |
| `loadMultipleChoice(int)` | 1400-1444 | Load quiz data from card | JSON |
| `hasMultipleChoice(int)` | 1446-1475 | Check if card has quiz | JSON |

#### 3.3 Message Flow

**JavaScript → Python**:
1. React calls `bridge.sendMessage("Hello")`
2. JavaScript adds to queue: `ankiBridge.addMessage('sendMessage', 'Hello')`
3. Python polls (100ms): `_poll_messages()`
4. Python reads queue: `getMessages()` returns `[{type:'sendMessage', data:'Hello'}]`
5. Python routes: `_handle_js_message('sendMessage', 'Hello')`
6. Handler executes appropriate logic

**Python → JavaScript**:
1. Python creates payload: `{"type": "bot", "message": "Hi!"}`
2. Python calls: `web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")`
3. JavaScript receives in `useAnki` hook
4. React updates UI

#### 3.4 Async Operations with QThread

**For non-blocking AI requests** (`widget.py:659-825`):

```python
class AIRequestThread(QThread):
    finished_signal = pyqtSignal(str, str)
    error_signal = pyqtSignal(str, str)
    streaming_signal = pyqtSignal(str, bool, bool)
    
    def run(self):
        # Execute AI request in background
        bot_msg = self.ai_handler.get_response_with_rag(
            self.text, 
            context=context,
            history=self.history,
            mode=self.mode,
            callback=stream_callback
        )
        self.finished_signal.emit(self.message_ref, bot_msg)

# Usage
thread = AIRequestThread(ai, text, message, self, history, mode)
thread.streaming_signal.connect(on_streaming_chunk)
thread.finished_signal.connect(on_finished)
thread.error_signal.connect(on_error)
thread.start()  # Non-blocking
```

**Benefits**:
- UI stays responsive during API calls
- Streaming support via signals
- Cancellable via `thread.cancel()`

---

### 4. Anki Integration Points

#### 4.1 Hooks Used

**All Active Hooks** (`__init__.py`):

| Hook | Line | Handler | Purpose |
|------|------|---------|---------|
| `profile_did_open` | 353 | `on_profile_loaded()` | Initialize addon |
| `profile_will_close` | 356-357 | `cleanup_addon()` | Cleanup resources |
| `reviewer_did_show_question` | 361-365 | `on_reviewer_did_show_question()` | Track card changes |
| `state_will_change` | 367-371 | `on_state_will_change()` | Handle state transitions |
| `state_did_change` | 308 | `on_state_did_change()` | UI updates on navigation |
| `webview_will_set_content` | 39 | `_on_webview_content()` | Replace reviewer HTML |

**Hook Details**:

**1. Profile Lifecycle** (`__init__.py:120-122, 342-349`):
```python
def on_profile_loaded():
    init_addon()  # Setup UI, menu, theme, custom reviewer

def cleanup_addon():
    # Close auth server, cleanup resources
    auth_server = get_auth_server()
    auth_server.stop()
```

**2. State Management** (`ui_setup.py:310-322`):
```python
def on_state_did_change(new_state, old_state):
    """Hide/show custom reviewer toolbar based on state"""
    if new_state == "review":
        # In reviewer - hide native toolbar if custom reviewer active
        if custom_reviewer.active:
            hide_native_toolbar()
    else:
        # Not in reviewer - show native toolbar
        show_native_toolbar()
```

**3. Card Tracking** (`__init__.py:124-229`):
```python
def on_reviewer_did_show_question(card):
    """Track which card is being reviewed"""
    if mw.state != "review":
        return
    
    # Get card context
    card_id = card.id
    deck_id = card.did
    question = card.question()
    
    # Send to ChatbotWidget
    widget = get_chatbot_widget()
    if widget:
        widget.current_card_context = {
            "cardId": card_id,
            "deckId": deck_id,
            "question": question
        }
```

**4. Custom Reviewer** (`custom_reviewer/__init__.py:59-88`):
```python
def _on_webview_content(self, web_content, context):
    """Replace Anki's reviewer HTML with custom UI"""
    if not self.active or not isinstance(context, Reviewer):
        return
    
    card = context.card
    if not card:
        return
    
    # Build custom HTML
    custom_html = self._build_reviewer_html(card, context)
    web_content.body = custom_html  # Replace entire body
```

#### 4.2 Initialization Sequence

**Startup Flow** (`__init__.py:83-118`):

```
1. Anki loads addon (__init__.py imported)
2. Hooks registered immediately (lines 352-379)
3. User opens profile
4. profile_did_open fires
5. init_addon() executes:
   - mw.addonManager.setWebExports() (line 89)
   - setup_ui() - creates shortcuts, toolbar (line 90)
   - setup_menu() - adds menu items (line 91)
   - setup_global_theme() - applies dark theme (line 92)
   - Enable custom reviewer if configured (lines 96-113)
6. User interacts with UI
7. User closes profile
8. profile_will_close fires
9. cleanup_addon() executes
```

#### 4.3 Configuration Storage

**Location**: `config.json` in addon folder

**Managed by**: `config.py` (lines 1-200+)

**Stored Data**:
- API keys (Google, OpenAI, Anthropic)
- Model preferences
- Auth tokens (Firebase)
- AI tool settings (images, diagrams, molecules)
- Backend URL
- Custom reviewer toggle

**Access Pattern**:
```python
from config import get_config, update_config

# Read
config = get_config(force_reload=True)
api_key = config.get("api_key", "")

# Write
success = update_config(api_key="new_key", model_name="gemini-1.5-pro")
```

---

### 5. UI Component Details

#### 5.1 Toolbar Button

**Purpose**: Quick access button in Anki's top toolbar

**Location**: `ui_setup.py` (lines 201-298)

**Implementation**:
```python
def setup_toolbar_button():
    # Create action
    action = QAction("AnKI+", mw)
    action.setToolTip(f"Chatbot öffnen/schließen ({shortcut_text})")
    action.triggered.connect(toggle_chatbot)
    
    # Find toolbar
    toolbar = mw.form.toolbar  # or mw.findChildren(QToolBar)
    
    # Insert at beginning (leftmost position)
    if isinstance(toolbar, QToolBar):
        toolbar.insertAction(None, action)
```

**Features**:
- Platform-specific tooltip (Cmd+I on macOS, Ctrl+I elsewhere)
- Positioned at far left of toolbar
- Toggles chatbot dock visibility
- Fallback logic for different Anki versions

#### 5.2 Menu Items

**Purpose**: Menu access for all addon features

**Location**: `ui_setup.py` (lines 356-381)

**Menu Structure**:
```
Tools
├── Chatbot öffnen/schließen (Ctrl+I)
└── Use Custom Reviewer (checkable)
```

**Implementation**:
```python
def setup_menu():
    # Toggle chatbot
    action = QAction("Chatbot öffnen/schließen", mw)
    action.setShortcut(QKeySequence("Ctrl+I"))
    action.triggered.connect(toggle_chatbot)
    mw.form.menuTools.addAction(action)
    
    # Toggle custom reviewer
    toggle_action = QAction("Use Custom Reviewer", mw)
    toggle_action.setCheckable(True)
    toggle_action.setChecked(use_custom_reviewer)
    toggle_action.triggered.connect(toggle_custom_reviewer)
    mw.form.menuTools.addAction(toggle_action)
```

#### 5.3 Keyboard Shortcuts

**Purpose**: Power user access via keyboard

**Location**: `ui_setup.py` (lines 193-199)

**Shortcuts**:
- **Cmd+I / Ctrl+I**: Toggle chatbot panel

**Implementation**:
```python
def setup_keyboard_shortcut():
    shortcut = QShortcut(QKeySequence("Ctrl+I"), mw)
    shortcut.activated.connect(toggle_chatbot)
```

**Cross-platform**:
- macOS: Cmd+I (Qt automatically converts Ctrl → Cmd)
- Windows/Linux: Ctrl+I

#### 5.4 Global Theme System

**Purpose**: Apply consistent dark theme to entire Anki UI

**Location**: `anki_global_theme.py` (lines 101-747)

**Architecture**:

```python
def apply_global_dark_theme():
    """Applies to QApplication (highest priority)"""
    global_stylesheet = """
    QWidget { background-color: #1A1A1A; color: rgba(255,255,255,0.9); }
    QToolBar { background-color: #1A1A1A !important; }
    QPushButton { background-color: rgba(255,255,255,0.08); }
    QDockWidget { background-color: #1A1A1A; }
    /* ... 400+ lines of styles ... */
    """
    QApplication.instance().setStyleSheet(global_stylesheet)
```

**Styled Components**:
- QToolBar (lines 127-194)
- QMenuBar (lines 199-223)
- QStatusBar (lines 228-233)
- QPushButton (lines 238-255)
- QSplitter (lines 260-291)
- QDockWidget (lines 296-307)
- QScrollBar (lines 312-348)
- QLineEdit/QTextEdit (lines 353-365)
- QTableWidget/QListWidget (lines 370-384)
- QTabWidget (lines 389-409)

**Re-apply Strategy** (`anki_global_theme.py:702-747`):
```python
def on_state_change(new_state, old_state):
    """Re-apply theme on every state change"""
    QTimer.singleShot(10, apply_global_dark_theme)

def setup_global_theme():
    # Initial apply
    apply_global_dark_theme()
    
    # Re-apply on state changes (survives Anki's style resets)
    gui_hooks.state_did_change.append(on_state_change)
    
    # Continuous re-styling (every 2 seconds)
    timer = QTimer()
    timer.timeout.connect(apply_global_dark_theme)
    timer.start(2000)
```

**Why Continuous Re-styling?**
- Anki frequently resets styles when switching states
- Ensures consistent dark theme across all views
- Minimal performance impact (stylesheet application is fast)

#### 5.5 Custom Reviewer Implementation

**Purpose**: Replace Anki's native reviewer with custom HTML/CSS/JS

**Location**: `custom_reviewer/__init__.py` (430 lines)

**Architecture**:

```python
class CustomReviewer:
    def __init__(self):
        self.active = False
        self._hook_registered = False
        self._css_cache = None  # Cached from styles.css
        self._js_cache = None   # Cached from interactions.js
        self._html_cache = None # Cached from template.html
```

**Hook Integration** (lines 36-88):
```python
def enable(self):
    if not self._hook_registered:
        gui_hooks.webview_will_set_content.append(self._on_webview_content)
        self._hook_registered = True
    self.active = True

def _on_webview_content(self, web_content, context):
    """Fires BEFORE Anki renders HTML"""
    if not self.active or not isinstance(context, Reviewer):
        return
    
    card = context.card
    if not card:
        return
    
    # Build custom HTML
    custom_html = self._build_reviewer_html(card, context)
    web_content.body = custom_html  # Replace entire HTML
```

**Custom UI Components** (lines 219-344):
- **Stats Bar**: Shows new/learning/review counts (top)
- **Card Content**: Question/answer with clean styling
- **Rating Buttons**: Again/Hard/Good/Easy with shortcuts
- **Action Buttons**: Undo, Mark, Edit (icons)
- **Progress Info**: Calculated from scheduler

**Styling** (`custom_reviewer/styles.css`):
- Jony Ive-inspired minimalism
- Ghost UI (transparent buttons with subtle hover)
- 1px separators in #252525
- Smooth transitions
- Responsive layout

**Interactions** (`custom_reviewer/interactions.js`):
- Keyboard shortcuts (Space, 1-4, E, M, Z)
- State management (question/answer)
- pycmd() integration for Anki commands
- Animation on answer reveal

---

### 6. Performance Optimizations

#### 6.1 Lazy Widget Creation

**Pattern**: Create widgets on first use, cache globally

```python
_chatbot_dock = None  # Global cache

def toggle_chatbot():
    global _chatbot_dock
    if _chatbot_dock is None:
        # Create on first use
        _chatbot_dock = QDockWidget("", mw)
        # ... setup ...
    
    # Toggle visibility
    _chatbot_dock.show() if not _chatbot_dock.isVisible() else _chatbot_dock.hide()
```

**Benefits**:
- Faster addon startup (no UI creation overhead)
- Memory efficient (only create when needed)
- Survives state changes

#### 6.2 Message Polling Optimization

**Frequency**: 100ms (10 times per second)

**Why Not Faster?**
- 100ms latency imperceptible to users
- Reduces CPU usage
- Allows batching of multiple messages

**Implementation** (`widget.py:133-136`):
```python
self.message_timer = QTimer()
self.message_timer.timeout.connect(self._poll_messages)
self.message_timer.start(100)  # 100ms interval
```

#### 6.3 HTML Caching

**Custom Reviewer** (`custom_reviewer/__init__.py:90-128`):
```python
def _load_css(self) -> str:
    if self._css_cache is None:
        css_path = os.path.join(self._addon_dir, 'styles.css')
        with open(css_path, 'r', encoding='utf-8') as f:
            self._css_cache = f.read()
    return self._css_cache
```

**Benefits**:
- Load files once, reuse multiple times
- Eliminates disk I/O on every card
- Speeds up reviewer HTML generation

#### 6.4 Thread-Based AI Requests

**Purpose**: Keep UI responsive during API calls

**Implementation** (`widget.py:659-825`):
- Uses `QThread` for background processing
- Signals for streaming updates
- Cancellable via flag
- Error handling with signal

---

### 7. Error Handling & Edge Cases

#### 7.1 Missing QWebEngineView

**Problem**: PyQt6-WebEngine not installed

**Handling** (`widget.py:90-94`):
```python
if QWebEngineView is None:
    fallback = QLabel("QWebEngineView nicht verfügbar...")
    layout.addWidget(fallback)
    return
```

#### 7.2 Hook Registration Timing

**Problem**: Hooks fire before resources ready

**Handling** (`__init__.py:377-379`):
```python
# If profile already loaded, initialize immediately
if hasattr(mw, 'col') and mw.col is not None:
    QTimer.singleShot(100, init_addon)
```

#### 7.3 Reviewer State Detection

**Problem**: Determine if user is in deck or review mode

**Handling** (`bridge.py:157-216`):
```python
def getCurrentDeck():
    # Check Anki state
    if mw.state == "review" or mw.state == "overview":
        is_in_reviewer = True
    elif mw.state == "deckBrowser":
        return {"isInDeck": False}  # No active deck
```

#### 7.4 API Request Cancellation

**Problem**: User navigates away during API call

**Handling** (`widget.py:196-213`):
```python
if msg_type == 'cancelRequest':
    if self.current_request:
        # Set cancellation flag
        if self._ai_thread:
            self._ai_thread.cancel()
            self._ai_thread.quit()
            self._ai_thread.wait(1000)
```

---

### 8. Cross-References

**Related Sections**:
- Frontend Architecture → See "Frontend-Architektur" above
- API Integration → See "API-Integration" above
- React Components → See "UI-Komponenten (React)" above
- Session Management → See "Session-Management" above

**External Documentation**:
- Full Qt integration guide → See `QT_INTEGRATION_GUIDE.md`
- Build instructions → See `BUILD_INSTRUCTIONS.md`
- Design language → See `DESIGN.md`

---

---

## 9. Toolbar Hiding: Key Insights & Challenges

### 9.1 Critical Understanding: mw.toolbar vs mw.toolbar.web

**The most important insight for Anki addon developers:**

```
mw.toolbar       → Python class (Toolbar) - NOT a QWidget!
mw.toolbar.web   → QWebEngineView (TopWebView) - IS a QWidget
mw.toolbarWeb    → Same as mw.toolbar.web (alternative reference)
```

**Common Crash:**
```python
# WRONG - causes AttributeError
mw.toolbar.isVisible()  # Toolbar has no isVisible()
mw.toolbar.hide()       # Toolbar has no hide()
mw.toolbar.setFixedHeight(0)  # Toolbar has no setFixedHeight()

# CORRECT - works because web IS a QWidget
mw.toolbar.web.isVisible()
mw.toolbar.web.hide()
mw.toolbar.web.setFixedHeight(0)
```

### 9.2 Anki's Main Layout Structure

From Anki source (`qt/aqt/main.py`):

```python
self.mainLayout = QVBoxLayout()
self.mainLayout.setContentsMargins(0, 0, 0, 0)
self.mainLayout.setSpacing(0)
self.mainLayout.addWidget(tweb)      # TopWebView (toolbar)
self.mainLayout.addWidget(self.web)   # MainWebView (content)
self.mainLayout.addWidget(sweb)       # BottomWebView (status)
self.form.centralwidget.setLayout(self.mainLayout)
```

**Key Points:**
- Layout already has 0 margins and 0 spacing
- Three WebViews stacked vertically
- `tweb` = `mw.toolbarWeb` = `mw.toolbar.web`

### 9.3 Toolbar Hiding Approaches

**Approach 1: Simple hide() (steveaw's addon)**
```python
def hide_toolbar_reviewing(self, oldState):
    self.toolbar.web.hide()

def show_toolbar_not_reviewing(self, state, *args):
    self.toolbar.web.show()
```
- Wraps `AnkiQt._reviewState` and `AnkiQt.moveToState`
- Simple but may leave residual space

**Approach 2: setFixedHeight(0) + hide()**
```python
web = mw.toolbar.web
web.hide()
web.setFixedHeight(0)
web.setMaximumHeight(0)
web.setMinimumHeight(0)
```
- More aggressive
- Should collapse the layout space

**Approach 3: Remove from layout**
```python
central = mw.centralWidget()
if central and central.layout():
    central.layout().removeWidget(mw.toolbar.web)
```
- Most aggressive
- Requires re-adding on restore

### 9.4 The "Dark Bar" Problem

**Symptom:** A dark bar (~40px) remains at the top of the reviewer even after hiding the toolbar.

**Possible Causes:**
1. **TopWebView background** - Even hidden, the web view may have a background color
2. **Layout spacing** - Qt layout may still reserve space
3. **Timer-based show** - Anki has a 2000ms timer that can auto-show the toolbar
4. **State-specific behavior** - Toolbar behavior differs between review/overview/deckBrowser

**Anki's Built-in Hiding (from `qt/aqt/toolbar.py`):**
```python
def hide_if_allowed(self) -> None:
    if self.mw.state != "review":
        return
    # Checks fullscreen and user preferences
    if self.mw.pm.hide_top_bar():
        self.hide()
```

**Timer Mechanism:**
```python
self.hide_timer = QTimer()
self.hide_timer.setSingleShot(True)
self.hide_timer.setInterval(2000)  # 2 seconds
```

### 9.5 What Has Been Tried

| Approach | Result |
|----------|--------|
| `mw.toolbar.web.hide()` | Toolbar hides but dark bar remains |
| `setFixedHeight(0)` | Same as above |
| `removeWidget()` from layout | Crashes or dark bar persists |
| Hiding toolbar parent | No effect or crash |
| `setUnifiedTitleAndToolBarOnMac(False)` | No visible effect |
| Layout margin adjustments | Dark bar persists |
| CSS styling (`background: transparent`) | Not effective |

### 9.6 Known Working Addons

**"No Distractions Full Screen"** - Most comprehensive solution
- GitHub: https://github.com/ccz-2/No-Distractions-Full-Screen
- Approach: "Rewrote the display widget to be one unified webpage with iFrames"
- This is a complete UI rewrite, not just hiding

**"FULLER SCREEN"** / **"FULLEST SCREEN"** - AnkiWeb addons
- Uses similar hide() approach
- May have timing/hook differences that make it work

### 9.7 Current Implementation (Safe, Crash-Free)

**Location:** `__init__.py:48-86`

```python
def hide_native_toolbar():
    """Hides toolbar - ONLY works with mw.toolbar.web (the QWidget)"""
    if not mw:
        return

    # mw.toolbar.web is the actual QWidget
    if hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
        web = mw.toolbar.web
        if web and hasattr(web, 'isVisible'):
            web.hide()
            web.setFixedHeight(0)
            web.setMaximumHeight(0)
            web.setMinimumHeight(0)

    # Alternative reference
    if hasattr(mw, 'toolbarWeb') and mw.toolbarWeb:
        web = mw.toolbarWeb
        if hasattr(web, 'isVisible'):
            web.hide()
            web.setFixedHeight(0)
            web.setMaximumHeight(0)
            web.setMinimumHeight(0)
```

### 9.8 Future Investigation Areas

1. **Inspect actual widget hierarchy** - Use Qt debug tools to see what's rendering
2. **CSS injection into TopWebView** - Make background transparent via JavaScript
3. **Hook timing** - Try `state_did_change` vs `state_will_change`
4. **Anki preferences** - Check if `mw.pm.hide_top_bar()` can be leveraged
5. **Complete UI rewrite** - Like "No Distractions" addon, create unified reviewer

### 9.9 Resources

- **Anki Source (toolbar.py)**: https://github.com/ankitects/anki/blob/main/qt/aqt/toolbar.py
- **Anki Source (main.py)**: https://github.com/ankitects/anki/blob/main/qt/aqt/main.py
- **steveaw's Hide Toolbar**: https://github.com/steveaw/anki_addons/blob/master/reviewer_hide_toolbar.py
- **No Distractions Full Screen**: https://github.com/ccz-2/No-Distractions-Full-Screen

---

## Zukünftige Erweiterungen

- Anki-Datenbank-Zugriff
- Kontextanalyse (aktuelle Karte erkennen)
- Agent-Logik (proaktive Unterstützung)
- Markdown-Rendering in Nachrichten
- Code-Syntax-Highlighting
- Animierte Übergänge (Framer Motion)
- Typing-Indicator
- Message-Timestamps
