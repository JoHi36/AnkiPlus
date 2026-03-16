# Qt/Python Integration Guide for Anki Addons

**A comprehensive guide for developers building Anki addons with Qt/Python**

---

## Table of Contents

1. [Anki's Qt Architecture Overview](#1-ankis-qt-architecture-overview)
2. [Available Qt Integration Points](#2-available-qt-integration-points)
3. [Qt Widget Possibilities](#3-qt-widget-possibilities)
4. [Communication Patterns](#4-communication-patterns)
5. [Best Practices](#5-best-practices)
6. [Code Examples](#6-code-examples)
7. [Common Pitfalls](#7-common-pitfalls)

---

## 1. Anki's Qt Architecture Overview

### 1.1 Core Structure

Anki is built on **PyQt5/PyQt6**, providing a powerful desktop application framework. The main components:

- **`mw` (Main Window)**: The global main window instance (`aqt.mw`)
  - Access via: `from aqt import mw`
  - Central hub for all UI operations
  - Contains references to all major UI components

- **Qt Event System**: Qt's signal/slot mechanism for event handling
- **State Management**: Anki uses state strings (`"deckBrowser"`, `"review"`, `"overview"`, etc.)

### 1.2 Main Qt Widgets in Anki

| Widget Type | Purpose | Access Point |
|------------|---------|--------------|
| `QMainWindow` | Top-level window | `mw` |
| `QToolBar` | Top toolbar with buttons | `mw.form.toolbar` |
| `QMenuBar` | Application menu | `mw.form.menuBar()` |
| `QStatusBar` | Bottom status bar | `mw.statusBar()` |
| `QWebEngineView` | Reviewer/Browser web content | `mw.reviewer.web` |
| `QDockWidget` | Side panels (addons) | Created by addons |

### 1.3 Anki's Module Structure

```
aqt/
├── main.py          # Main window (mw)
├── reviewer.py      # Card review interface
├── deckbrowser.py   # Deck list view
├── browser.py       # Card browser
├── editor.py        # Card editor
├── toolbar.py       # Top toolbar
└── gui_hooks.py     # Hook system for addons
```

---

## 2. Available Qt Integration Points

### 2.1 Quick Reference Table

| Integration Point | Difficulty | Visibility | Use Case |
|------------------|------------|------------|----------|
| Menu Items | Easy | Hidden in menu | Settings, actions |
| Toolbar Buttons | Easy | Always visible | Quick access |
| Dock Widgets | Medium | Toggle-able panel | Side panels, tools |
| Keyboard Shortcuts | Easy | Invisible | Power users |
| Dialogs | Medium | On-demand | Settings, forms |
| Status Bar | Easy | Bottom corner | Status messages |
| System Tray | Medium | OS level | Background tasks |
| Reviewer Modifications | Hard | During review | Custom review UI |

### 2.2 Menu Items and Actions

**Location**: `mw.form.menuTools` (or other menus)

**Use Cases**:
- Settings dialogs
- Utility functions
- Toggle features on/off

**Hook**: None needed (direct API)

### 2.3 Toolbars and Buttons

**Location**: `mw.form.toolbar` or `QToolBar` widgets

**Use Cases**:
- Quick access to addon features
- Visual presence in UI
- One-click actions

**Hook**: `gui_hooks.top_toolbar_did_init_links` for dynamic toolbar

### 2.4 Dock Widgets

**Location**: Created via `QDockWidget`, added to `mw`

**Use Cases**:
- Side panels (chat, tools, info)
- Persistent UI elements
- Resizable panels

**Hook**: None (manually managed)

### 2.5 Dialogs and Modals

**Location**: Created as `QDialog` instances

**Use Cases**:
- Settings windows
- Forms and inputs
- Confirmations

**Hook**: None (created on-demand)

### 2.6 Reviewer UI Modifications

**Location**: `mw.reviewer` and its `QWebEngineView`

**Use Cases**:
- Custom review interfaces
- Additional buttons/controls
- Modified card display

**Hooks**:
- `gui_hooks.reviewer_did_show_question`
- `gui_hooks.reviewer_did_show_answer`
- `gui_hooks.webview_will_set_content` (powerful, replaces HTML)

### 2.7 Deck Browser Modifications

**Location**: `mw.deckBrowser`

**Use Cases**:
- Custom deck list items
- Additional deck information
- Deck-level actions

**Hooks**:
- `gui_hooks.deck_browser_will_render_content`

### 2.8 Card Editor Modifications

**Location**: `mw.editor` or `Editor` instances

**Use Cases**:
- Additional fields
- Custom buttons
- Field helpers

**Hooks**:
- `gui_hooks.editor_did_init_buttons`
- `gui_hooks.editor_did_load_note`

---

## 3. Qt Widget Possibilities

### 3.1 QDockWidget

**Best for**: Side panels, persistent tools

**Key Features**:
- Resizable
- Can be docked/undocked
- Minimal/customizable title bar
- Supports any widget as content

**Properties**:
```python
dock.setObjectName("myDock")           # Unique identifier
dock.setAllowedAreas(Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea)
dock.setFeatures(QDockWidget.DockWidgetClosable | QDockWidget.DockWidgetMovable)
dock.setTitleBarWidget(QWidget())      # Hide default title bar
```

### 3.2 QToolBar

**Best for**: Quick action buttons, always-visible controls

**Key Features**:
- Horizontal/vertical orientation
- Icons and text labels
- Separators and spacers

**Methods**:
```python
toolbar.addAction(action)              # Add QAction
toolbar.insertAction(pos, action)      # Insert at position
toolbar.addWidget(widget)              # Add custom widget
toolbar.addSeparator()                 # Visual separator
```

### 3.3 QMenu and QAction

**Best for**: Menu items, context menus

**Key Features**:
- Hierarchical menus (submenus)
- Keyboard shortcuts
- Checkable items
- Icons

**Usage**:
```python
action = QAction("My Action", mw)
action.setShortcut(QKeySequence("Ctrl+Shift+M"))
action.setCheckable(True)
action.triggered.connect(my_function)
mw.form.menuTools.addAction(action)
```

### 3.4 QDialog

**Best for**: Settings windows, forms, user input

**Key Features**:
- Modal or non-modal
- Accept/reject buttons
- Custom layouts
- Form validation

**Pattern**:
```python
dialog = QDialog(mw)
dialog.setWindowTitle("Settings")
layout = QVBoxLayout()
# Add widgets...
dialog.setLayout(layout)
dialog.exec()  # Modal
dialog.show()  # Non-modal
```

### 3.5 QPushButton

**Best for**: Clickable buttons, actions

**Key Features**:
- Text and icon support
- Hover/pressed states
- Custom styling
- Signals (clicked, pressed, released)

**Styling**:
```python
button.setStyleSheet("""
    QPushButton {
        background-color: #0a84ff;
        border-radius: 6px;
        padding: 8px 16px;
    }
    QPushButton:hover {
        background-color: #0070dd;
    }
""")
```

### 3.6 QSystemTrayIcon

**Best for**: Background tasks, notifications

**Key Features**:
- System tray presence
- Context menu
- Notifications/messages
- Click actions

**Usage**:
```python
tray = QSystemTrayIcon(QIcon("icon.png"), parent=mw)
tray.setContextMenu(menu)
tray.messageClicked.connect(handler)
tray.show()
```

### 3.7 Status Bar Modifications

**Best for**: Temporary messages, small indicators

**Location**: `mw.statusBar()`

**Methods**:
```python
mw.statusBar().showMessage("Processing...", timeout_ms)
widget = QLabel("Status")
mw.statusBar().addPermanentWidget(widget)
```

### 3.8 Keyboard Shortcuts

**Best for**: Power user features, quick actions

**Implementation**:
```python
shortcut = QShortcut(QKeySequence("Ctrl+I"), mw)
shortcut.activated.connect(my_function)
```

---

## 4. Communication Patterns

### 4.1 Signals and Slots

**Qt's core communication mechanism**

```python
# Define signal
class MyWidget(QWidget):
    mySignal = pyqtSignal(str)  # Signal with string parameter
    
    def emit_signal(self):
        self.mySignal.emit("Hello")

# Connect to slot
widget = MyWidget()
widget.mySignal.connect(lambda msg: print(msg))
```

**Common Built-in Signals**:
- `clicked` (buttons)
- `textChanged` (text fields)
- `currentIndexChanged` (comboboxes)
- `triggered` (actions)

### 4.2 Qt Events

**Lower-level event handling**

```python
def eventFilter(self, obj, event):
    if event.type() == QEvent.KeyPress:
        # Handle key press
        return True  # Event handled
    return False  # Pass to parent

# Install filter
widget.installEventFilter(self)
```

### 4.3 Anki's Hooks System (`aqt.gui_hooks`)

**The primary integration point for addons**

```python
from aqt import gui_hooks

def on_profile_loaded():
    print("Profile loaded!")

gui_hooks.profile_did_open.append(on_profile_loaded)
```

**Important Hooks**:

| Hook Name | When | Use Case |
|-----------|------|----------|
| `profile_did_open` | Profile loads | Initialize addon |
| `profile_will_close` | Before profile closes | Cleanup |
| `state_did_change` | Anki state changes | React to navigation |
| `reviewer_did_show_question` | Question shown | Modify reviewer |
| `reviewer_did_show_answer` | Answer shown | Modify reviewer |
| `webview_will_set_content` | Before HTML render | Replace HTML content |
| `deck_browser_will_render_content` | Before deck list | Modify deck browser |
| `editor_did_init_buttons` | Editor buttons ready | Add editor buttons |
| `top_toolbar_did_init_links` | Toolbar ready | Add toolbar items |

**Hook Pattern**:
```python
def my_hook_handler(state, old_state):
    print(f"State changed: {old_state} -> {state}")

gui_hooks.state_did_change.append(my_hook_handler)
```

### 4.4 QWebChannel (Python ↔ JavaScript)

**For QWebEngineView communication**

**Setup (Python side)**:
```python
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtCore import QObject, pyqtSlot

class Bridge(QObject):
    @pyqtSlot(str)
    def sendMessage(self, msg):
        print(f"Received: {msg}")

bridge = Bridge()
channel = QWebChannel()
channel.registerObject("bridge", bridge)
web_view.page().setWebChannel(channel)
```

**Setup (JavaScript side)**:
```javascript
new QWebChannel(qt.webChannelTransport, function(channel) {
    const bridge = channel.objects.bridge;
    bridge.sendMessage("Hello from JS");
});
```

**Alternative: Message Queue System** (used in this addon)
```python
# Python: Create JS queue
js_code = """
window.ankiBridge = {
    messageQueue: [],
    addMessage: function(type, data) {
        this.messageQueue.push({type, data, timestamp: Date.now()});
    }
};
"""
web_view.page().runJavaScript(js_code)

# Poll for messages
def poll():
    web_view.page().runJavaScript(
        "JSON.stringify(window.ankiBridge.messageQueue.splice(0))",
        lambda result: handle_messages(json.loads(result))
    )
```

---

## 5. Best Practices

### 5.1 Theme Compatibility (Light/Dark Mode)

**Always support both themes**:

```python
def get_theme_styles():
    """Detect current theme and return appropriate colors"""
    from aqt.theme import theme_manager
    
    if theme_manager.night_mode:
        return {
            'background': '#1A1A1A',
            'text': 'rgba(255,255,255,0.9)',
            'border': 'rgba(255,255,255,0.1)'
        }
    else:
        return {
            'background': '#FFFFFF',
            'text': 'rgba(0,0,0,0.9)',
            'border': 'rgba(0,0,0,0.1)'
        }
```

**Apply to stylesheets**:
```python
styles = get_theme_styles()
widget.setStyleSheet(f"""
    QWidget {{
        background-color: {styles['background']};
        color: {styles['text']};
    }}
""")
```

### 5.2 Performance Considerations

**Lazy Loading**:
```python
_my_dialog = None  # Global cache

def show_dialog():
    global _my_dialog
    if _my_dialog is None:
        _my_dialog = MyDialog(mw)
    _my_dialog.show()
```

**Async Operations with QThread**:
```python
from PyQt6.QtCore import QThread, pyqtSignal

class WorkerThread(QThread):
    finished = pyqtSignal(str)
    
    def run(self):
        result = expensive_operation()
        self.finished.emit(result)

thread = WorkerThread()
thread.finished.connect(lambda r: print(r))
thread.start()
```

**Avoid Blocking UI**:
- Use `QTimer.singleShot()` for delays
- Use `QThread` for heavy computation
- Use `processEvents()` sparingly (can cause reentrancy issues)

### 5.3 Memory Management

**Proper Cleanup**:
```python
def cleanup():
    global _my_widget
    if _my_widget:
        _my_widget.deleteLater()  # Schedule for deletion
        _my_widget = None

gui_hooks.profile_will_close.append(cleanup)
```

**Parent-Child Relationships**:
```python
# Widget is automatically deleted when parent is deleted
widget = MyWidget(parent=mw)
```

### 5.4 Anki's Addon Lifecycle

**Initialization Order**:
1. Module imported (`__init__.py`)
2. `profile_did_open` hook fires
3. Your setup code runs
4. User interacts with UI
5. `profile_will_close` hook fires (cleanup)

**Best Practice Pattern**:
```python
from aqt import mw, gui_hooks

def init_addon():
    """Initialize after profile loads"""
    if mw is None:
        return
    
    # Setup UI components
    setup_menu()
    setup_shortcuts()
    # ... etc

def cleanup_addon():
    """Cleanup before profile closes"""
    # Close dialogs, save state, etc.
    pass

# Register hooks
gui_hooks.profile_did_open.append(init_addon)
gui_hooks.profile_will_close.append(cleanup_addon)

# Handle immediate startup (profile already loaded)
if hasattr(mw, 'col') and mw.col is not None:
    QTimer.singleShot(100, init_addon)
```

---

## 6. Code Examples

### 6.1 Basic Menu Item

```python
from aqt import mw
from aqt.qt import QAction
from aqt.utils import showInfo

def my_action():
    showInfo("Hello from menu!")

action = QAction("My Addon", mw)
action.triggered.connect(my_action)
mw.form.menuTools.addAction(action)
```

### 6.2 Toolbar Button

```python
from aqt import mw
from aqt.qt import QAction

def my_function():
    print("Toolbar button clicked!")

action = QAction("My Tool", mw)
action.setToolTip("Click me!")
action.triggered.connect(my_function)

# Add to toolbar (Anki 2.1.50+)
from aqt import gui_hooks

def add_toolbar_button(links, toolbar):
    action = QAction("My Tool", mw)
    action.triggered.connect(my_function)
    toolbar.addAction(action)

gui_hooks.top_toolbar_did_init_links.append(add_toolbar_button)
```

### 6.3 Side Panel with QDockWidget

```python
from aqt import mw
from aqt.qt import QDockWidget, QWidget, QVBoxLayout, QLabel, Qt

_dock = None

def toggle_panel():
    global _dock
    if _dock is None:
        # Create dock widget
        _dock = QDockWidget("My Panel", mw)
        _dock.setObjectName("myPanel")
        
        # Create content widget
        widget = QWidget()
        layout = QVBoxLayout()
        layout.addWidget(QLabel("Hello from dock!"))
        widget.setLayout(layout)
        
        _dock.setWidget(widget)
        mw.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, _dock)
    
    # Toggle visibility
    if _dock.isVisible():
        _dock.hide()
    else:
        _dock.show()

# Add menu item to toggle
action = QAction("Toggle My Panel", mw)
action.triggered.connect(toggle_panel)
mw.form.menuTools.addAction(action)
```

### 6.4 Keyboard Shortcut

```python
from aqt import mw
from aqt.qt import QShortcut, QKeySequence

def my_shortcut_action():
    print("Shortcut triggered!")

shortcut = QShortcut(QKeySequence("Ctrl+Shift+M"), mw)
shortcut.activated.connect(my_shortcut_action)

# Also show in menu
action = QAction("My Action (Ctrl+Shift+M)", mw)
action.setShortcut(QKeySequence("Ctrl+Shift+M"))
action.triggered.connect(my_shortcut_action)
mw.form.menuTools.addAction(action)
```

### 6.5 Settings Dialog

```python
from aqt import mw
from aqt.qt import QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton

class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumWidth(400)
        
        layout = QVBoxLayout()
        
        # API Key field
        layout.addWidget(QLabel("API Key:"))
        self.api_key_input = QLineEdit()
        layout.addWidget(self.api_key_input)
        
        # Buttons
        button_layout = QHBoxLayout()
        save_btn = QPushButton("Save")
        save_btn.clicked.connect(self.save_settings)
        cancel_btn = QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        
        button_layout.addWidget(save_btn)
        button_layout.addWidget(cancel_btn)
        layout.addLayout(button_layout)
        
        self.setLayout(layout)
    
    def save_settings(self):
        api_key = self.api_key_input.text()
        # Save to config...
        self.accept()

def show_settings():
    dialog = SettingsDialog(mw)
    dialog.exec()

action = QAction("My Addon Settings", mw)
action.triggered.connect(show_settings)
mw.form.menuTools.addAction(action)
```

### 6.6 Reviewer Hook - Add Custom Button

```python
from aqt import mw, gui_hooks

def add_custom_button():
    """Add custom button to reviewer"""
    if not mw.reviewer or not mw.reviewer.web:
        return
    
    js_code = """
    (function() {
        if (document.getElementById('myCustomBtn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'myCustomBtn';
        btn.textContent = 'Custom Action';
        btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:1000;';
        btn.onclick = function() { pycmd('myCustomAction'); };
        
        document.body.appendChild(btn);
    })();
    """
    mw.reviewer.web.eval(js_code)

def handle_custom_command(handled, cmd, context):
    """Handle custom pycmd from reviewer"""
    if cmd == "myCustomAction":
        print("Custom action triggered!")
        return True, None  # handled=True, no return value
    return handled

gui_hooks.reviewer_did_show_question.append(lambda card: add_custom_button())
gui_hooks.reviewer_did_show_answer.append(lambda card: add_custom_button())
gui_hooks.webview_did_receive_js_message.append(handle_custom_command)
```

### 6.7 Replace Reviewer HTML (Advanced)

```python
from aqt import mw, gui_hooks
from aqt.reviewer import Reviewer

def replace_reviewer_html(web_content, context):
    """Completely replace reviewer HTML"""
    if not isinstance(context, Reviewer):
        return
    
    if not context.card:
        return
    
    card = context.card
    question = card.question()
    answer = card.answer()
    
    custom_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ background: #1a1a1a; color: white; font-family: sans-serif; }}
            .card {{ max-width: 800px; margin: 50px auto; padding: 20px; }}
            .answer {{ display: none; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="question">{question}</div>
            <div class="answer">{answer}</div>
        </div>
        <script>
            function showAnswer() {{
                document.querySelector('.answer').style.display = 'block';
                pycmd('ans');
            }}
        </script>
    </body>
    </html>
    """
    
    web_content.body = custom_html

gui_hooks.webview_will_set_content.append(replace_reviewer_html)
```

### 6.8 QWebEngineView with Custom HTML

```python
from aqt.qt import QWidget, QVBoxLayout, QUrl
from PyQt6.QtWebEngineWidgets import QWebEngineView
import os

class MyWebWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        
        self.web_view = QWebEngineView()
        
        # Load local HTML file
        html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
        self.web_view.load(QUrl.fromLocalFile(html_path))
        
        # Or load HTML string
        # self.web_view.setHtml("<h1>Hello World</h1>")
        
        layout.addWidget(self.web_view)
        self.setLayout(layout)
    
    def send_to_js(self, data):
        """Send data to JavaScript"""
        import json
        js_code = f"window.receiveFromPython({json.dumps(data)});"
        self.web_view.page().runJavaScript(js_code)
```

### 6.9 Global Styling (Application-Level)

```python
from aqt import mw
from aqt.qt import QApplication

def apply_global_theme():
    """Apply stylesheet to entire application"""
    stylesheet = """
    QWidget {
        background-color: #1A1A1A;
        color: rgba(255,255,255,0.9);
    }
    
    QPushButton {
        background-color: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        padding: 6px 16px;
    }
    
    QPushButton:hover {
        background-color: rgba(255,255,255,0.12);
    }
    """
    
    QApplication.instance().setStyleSheet(stylesheet)

from aqt import gui_hooks
gui_hooks.profile_did_open.append(apply_global_theme)
```

### 6.10 State Change Hook (Navigation Detection)

```python
from aqt import gui_hooks

def on_state_change(new_state, old_state):
    """React to Anki navigation changes"""
    print(f"Navigation: {old_state} → {new_state}")
    
    if new_state == "review":
        print("Entered reviewer")
        # Show/enable reviewer-specific features
    elif new_state == "deckBrowser":
        print("Back to deck browser")
        # Hide reviewer-specific features
    elif new_state == "overview":
        print("Viewing deck overview")

gui_hooks.state_did_change.append(on_state_change)
```

---

## 7. Common Pitfalls

### 7.1 Incorrect Widget Parenting

**Problem**: Widgets disappear or crash

**Solution**: Always set proper parent
```python
# BAD
widget = MyWidget()  # No parent, may be garbage collected

# GOOD
widget = MyWidget(parent=mw)  # mw manages lifecycle
```

### 7.2 Blocking the UI Thread

**Problem**: Anki freezes during long operations

**Solution**: Use QThread
```python
# BAD
def long_operation():
    time.sleep(10)  # Blocks UI!
    return result

# GOOD
class WorkerThread(QThread):
    finished = pyqtSignal(object)
    
    def run(self):
        result = expensive_operation()
        self.finished.emit(result)

thread = WorkerThread()
thread.finished.connect(handle_result)
thread.start()  # Non-blocking
```

### 7.3 Not Cleaning Up Resources

**Problem**: Memory leaks, conflicts on profile switch

**Solution**: Use profile_will_close hook
```python
_resources = []

def cleanup():
    global _resources
    for resource in _resources:
        resource.cleanup()
    _resources.clear()

gui_hooks.profile_will_close.append(cleanup)
```

### 7.4 Hardcoded Colors (Theme Incompatibility)

**Problem**: Addon looks broken in light/dark mode

**Solution**: Detect and adapt to theme
```python
from aqt.theme import theme_manager

if theme_manager.night_mode:
    color = "white"
else:
    color = "black"
```

### 7.5 Version Compatibility Issues

**Problem**: Addon breaks on different Anki versions

**Solution**: Check versions and use fallbacks
```python
from aqt import mw

# Check Anki version
if hasattr(mw, 'pm') and hasattr(mw.pm, 'night_mode'):
    # Anki 2.1.20+
    night_mode = mw.pm.night_mode()
else:
    # Older version
    night_mode = False

# PyQt version compatibility
try:
    from PyQt6.QtCore import Qt
    DockWidgetArea = Qt.DockWidgetArea
except:
    from PyQt5.QtCore import Qt
    DockWidgetArea = Qt
```

### 7.6 JavaScript Communication Timing

**Problem**: JavaScript not ready when Python sends data

**Solution**: Wait for page load
```python
def send_when_ready():
    js_code = "window.myFunction();"
    web_view.page().runJavaScript(js_code)

web_view.loadFinished.connect(send_when_ready)
```

### 7.7 Hook Registration Timing

**Problem**: Hook fires too early, resources not ready

**Solution**: Check for readiness
```python
def my_hook():
    if not mw or not mw.col:
        return  # Collection not loaded yet
    # Safe to proceed

gui_hooks.reviewer_did_show_question.append(my_hook)
```

### 7.8 Stylesheet Conflicts

**Problem**: Your styles are overridden by Anki's styles

**Solution**: Use `!important` or apply at application level
```python
widget.setStyleSheet("""
    QWidget {
        background: #1A1A1A !important;
    }
""")

# Or apply to QApplication for highest priority
QApplication.instance().setStyleSheet(...)
```

### 7.9 QWebEngineView Security Restrictions

**Problem**: Can't load external resources (images, fonts)

**Solution**: Use local files or proxy through Python
```python
# Option 1: Load as data URL
import base64
with open("image.png", "rb") as f:
    data = base64.b64encode(f.read()).decode()
    data_url = f"data:image/png;base64,{data}"

# Option 2: Fetch via Python, send to JS
import requests
response = requests.get(url)
data_url = f"data:image/png;base64,{base64.b64encode(response.content).decode()}"
```

### 7.10 Modal Dialog Blocking

**Problem**: Modal dialogs block entire application

**Solution**: Use non-modal dialogs when appropriate
```python
# Modal (blocks)
dialog.exec()

# Non-modal (doesn't block)
dialog.show()
dialog.raise_()
dialog.activateWindow()
```

---

## Additional Resources

- **Anki Source Code**: https://github.com/ankitects/anki
- **Qt Documentation**: https://doc.qt.io/qt-6/
- **PyQt6 Documentation**: https://www.riverbankcomputing.com/static/Docs/PyQt6/
- **Anki Addon Dev Docs**: https://addon-docs.ankiweb.net/

---

**This guide was created as a comprehensive reference for Anki addon developers working with Qt/Python integration.**
