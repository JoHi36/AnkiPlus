# SP2 Conservative: Sidebar Container Migration

> **WARNUNG:** Die vorherige SP2-Spec (`react-unification-sp2-design.md`) hat zu einer gescheiterten Migration geführt. Diese Spec ersetzt sie. Siehe `memory/project_sp2_lessons_learned.md` für Details.

## Problem

Die Session-Sidebar (Chat, Agent Studio, Plusi Menu, Insights) läuft aktuell als QDockWidget — ein separates Qt-Widget das Anki an den rechten Rand dockt. Das funktioniert, hat aber Nachteile:
- Kein CSS-basiertes Slide-in/out
- Kein JS-basiertes Resizing
- Separates Qt-Widget statt Teil der React-App

## Lösung: NUR den Container tauschen

**QDockWidget → Eingebettetes QWebEngineView in MainViewWidget.**

Alles innerhalb der Sidebar bleibt EXAKT gleich:
- `App.jsx` rendert den Session-Chat (**UNVERÄNDERT**)
- `useAnki.js` bleibt der Bridge-Hook (**UNVERÄNDERT**)
- `widget.py` + `bridge.py` bleiben die Kommunikationsschicht (**UNVERÄNDERT**)
- `CardTracker` sendet Card-Context wie bisher (**UNVERÄNDERT**)
- Custom Reviewer rendert in `mw.web` (**UNVERÄNDERT**)

## Architektur

### Vorher (aktuell)

```
mw (Anki Main Window)
├── mw.web (Reviewer mit custom_reviewer HTML)
├── MainViewWidget (fullscreen, versteckt im Review)
│   └── QWebEngineView → MainApp (DeckBrowser, Overview, FreeChat)
└── QDockWidget (rechte Sidebar, nur im Review sichtbar)
    └── ChatbotWidget
        └── QWebEngineView → App.jsx (Session Chat)
```

### Nachher (SP2)

```
mw (Anki Main Window)
├── mw.web (Reviewer — UNVERÄNDERT)
├── MainViewWidget (fullscreen in deckBrowser/overview, Sidebar-Modus im Review)
│   └── Layout je nach State:
│       [deckBrowser/overview/freeChat]:
│           QWebEngineView → MainApp (fullscreen, wie bisher)
│       [review]:
│           QWebEngineView → MainApp (versteckt oder minimal)
│           SidebarWebView → App.jsx (rechte Sidebar, 450px)
└── QDockWidget — ENTFERNT
```

### Schlüsselprinzip

MainViewWidget bekommt ein **zweites QWebEngineView** (`self.sidebar_view`) das `web/index.html` lädt (ohne `?mode=main` → rendert App.jsx). Dieses zweite WebView ersetzt das QDockWidget — gleicher Inhalt, anderer Container.

## Implementierung

### 1. MainViewWidget: Zweites WebView für Sidebar

```python
class MainViewWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.web_view = None        # MainApp (DeckBrowser/Overview/FreeChat)
        self.sidebar_view = None    # App.jsx (Session Chat) — NEU
        self.sidebar_widget = None  # ChatbotWidget Instanz — NEU
        self._sidebar_width = 450
        self._sidebar_visible = False
        # ... rest bleibt gleich
```

### 2. Sidebar erstellen (lazy, beim ersten Review)

```python
def _ensure_sidebar(self):
    """Erstellt die Sidebar beim ersten Aufruf."""
    if self.sidebar_widget is not None:
        return

    # ChatbotWidget wiederverwenden — GLEICHE Klasse wie bisher im QDockWidget
    from .widget import ChatbotWidget
    self.sidebar_widget = ChatbotWidget()
    self.sidebar_view = self.sidebar_widget.web_view
```

### 3. Layout im Review-State

```python
def _position_over_main(self):
    if self._current_state == 'review':
        # MainApp verstecken oder minimal
        if self.web_view:
            self.web_view.hide()
        # Sidebar rechts positionieren
        if self.sidebar_view:
            sidebar_w = self._sidebar_width
            self.sidebar_view.setGeometry(
                mw.width() - sidebar_w, 0, sidebar_w, mw.height()
            )
            self.sidebar_view.show()
        # Widget selbst nur den Sidebar-Bereich abdecken
        self.setGeometry(mw.width() - self._sidebar_width, 0,
                         self._sidebar_width, mw.height())
    else:
        # Fullscreen für DeckBrowser/Overview/FreeChat
        if self.sidebar_view:
            self.sidebar_view.hide()
        if self.web_view:
            self.web_view.show()
        self.setGeometry(0, 0, mw.width(), mw.height())
```

### 4. setup.py: QDockWidget entfernen

```python
# ENTFERNEN: _create_chatbot_dock(), QDockWidget-Erstellung
# ÄNDERN: ensure_chatbot_open() → MainViewWidget.show_sidebar()
# ÄNDERN: toggle_chatbot_panel() → MainViewWidget.toggle_sidebar()
# ÄNDERN: on_state_did_change() → show_main_view(state) + Sidebar-Logik
```

### 5. Card-Context Routing

CardTracker sendet aktuell an `ChatbotWidget.web_view`. Nach Migration sendet er an `MainViewWidget.sidebar_widget.web_view` — gleicher Code, anderes Widget.

```python
# In __init__.py oder CardTracker:
def get_chat_webview():
    """Gibt das WebView für den Session-Chat zurück."""
    view = get_main_view()
    if view.sidebar_widget and view.sidebar_widget.web_view:
        return view.sidebar_widget.web_view
    return None
```

### 6. Custom Reviewer ↔ Sidebar Kommunikation

Bleibt EXAKT gleich:
- Custom Reviewer → `pycmd()` → Python `handle_custom_pycmd()` → `sidebar_widget.web_view.runJavaScript("window.ankiReceive(...)")`
- Die Python-Bridge ist der Vermittler — kein direkter JS↔JS Kontakt nötig

### 7. Resize Handle

JS-basiertes Resizing im MainApp-React-Code (oder als eigenes kleines Widget). Sendet `sidebar.resize` Action → Python passt Geometrie an.

Alternativ: Resize als QSplitter zwischen mw.web und sidebar_view (Qt-nativ, kein Lag).

## Dateien

### Modifizieren

| Datei | Änderung |
|-------|----------|
| `ui/main_view.py` | Zweites WebView (sidebar_view), Layout-Logik, show/hide Sidebar |
| `ui/setup.py` | QDockWidget entfernen, Sidebar über MainViewWidget steuern |
| `__init__.py` | CardTracker/Widget-Referenzen auf MainViewWidget.sidebar_widget umleiten |

### NICHT Anfassen

| Datei | Grund |
|-------|-------|
| `ui/widget.py` | ChatbotWidget wird wiederverwendet, nicht gelöscht |
| `ui/bridge.py` | WebBridge bleibt exakt gleich |
| `frontend/src/App.jsx` | Session-Chat bleibt exakt gleich |
| `frontend/src/hooks/useAnki.js` | Bridge-Hook bleibt exakt gleich |
| `frontend/src/MainApp.jsx` | Nur minimale Änderungen (kein Review-State nötig) |
| `custom_reviewer/*` | Komplett unverändert |
| `utils/card_tracker.py` | Nur Widget-Referenz ändert sich |

### Löschen

| Datei | Grund |
|-------|-------|
| Nichts | Kein Code wird gelöscht |

## Edge Cases

### Sidebar Toggle (Cmd+I)
- `toggle_chatbot_panel()` ruft `MainViewWidget.toggle_sidebar()` auf
- Sidebar gleitet rein/raus (CSS-Transition oder Qt-Animation)

### State-Wechsel Review → DeckBrowser
- Sidebar wird versteckt
- MainApp wird wieder fullscreen
- ChatbotWidget bleibt im Speicher (lazy, nicht zerstört)

### Fenster-Resize
- `eventFilter` in MainViewWidget passt Sidebar-Position an
- Gleiche Logik wie aktuell für das fullscreen WebView

## Risikobewertung

| Risiko | Wahrscheinlichkeit | Auswirkung |
|--------|-------------------|------------|
| Bridge-Kommunikation bricht | NIEDRIG | ChatbotWidget ist die gleiche Klasse |
| CardTracker sendet an falsches WebView | NIEDRIG | Einfache Referenz-Umleitung |
| Custom Reviewer Konflikte | KEINE | Wird nicht angefasst |
| Layout-Probleme | MITTEL | Qt-Geometrie kann trickig sein |

## Nicht in Scope

- Reviewer-Migration zu React (NICHT in SP2, vielleicht nie)
- Bridge-Konsolidierung (useAnki bleibt)
- Neue Features im Session-Chat
