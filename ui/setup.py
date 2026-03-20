"""
UI-Setup Modul
Verwaltet Dock-Widget, Keyboard Shortcut (Cmd+I) und UI-Initialisierung
"""

from aqt import mw
from aqt.qt import *
from aqt.utils import showInfo
from aqt import gui_hooks
import sys
import json

# WebEngine / WebChannel
try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
except Exception:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except Exception:
        QWebEngineView = None

# Widget-Import
try:
    from .widget import ChatbotWidget
except ImportError:
    from ui.widget import ChatbotWidget

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Style-Funktionen
def get_dock_widget_style():
    return """
    QDockWidget {
        background-color: #1A1A1A;
        color: #e6e6e6;
    }
    /* Minimal separator - nearly invisible, matches unified background */
    QDockWidget::separator {
        background: #1E1E1E;
        width: 1px;
    }
    QDockWidget::separator:hover {
        background: #252525;
        width: 1px;
    }
    """

def show_qwebengine_warning():
    showInfo("QWebEngine ist nicht verfügbar. Bitte installieren Sie QtWebEngine (PyQt6-WebEngine).")

# Globale Variablen
_chatbot_dock = None
_chatbot_widget = None  # Widget-Instanz für Event-Hooks
_shortcut = None

def _notify_reviewer_chat_state(is_open):
    """Tell the reviewer webview to show/hide its dock based on chat panel visibility."""
    try:
        if mw and mw.reviewer and mw.reviewer.web:
            js = f'if(window.setChatOpen) setChatOpen({"true" if is_open else "false"});'
            mw.reviewer.web.eval(js)
            # Retry after short delay for reliability
            QTimer.singleShot(200, lambda: mw.reviewer.web.eval(js) if mw and mw.reviewer and mw.reviewer.web else None)
    except Exception:
        pass

def toggle_chatbot():
    """Öffnet oder schließt das Chatbot-Panel (Cmd+I / Ctrl+I)"""
    global _chatbot_dock
    if QWebEngineView is None:
        show_qwebengine_warning()
        return

    # Don't close when user is focused in the chat panel (e.g. typing)
    if _chatbot_dock is not None and _chatbot_dock.isVisible():
        try:
            focused = QApplication.focusWidget()
            if focused and _chatbot_dock.isAncestorOf(focused):
                logger.debug("toggle_chatbot: Skipping close — focus is in chat panel")
                return
        except Exception:
            pass

    if _chatbot_dock is None:
        # Dock-Widget erstellen
        _chatbot_dock = QDockWidget("", mw)  # Leerer Titel, da wir eigenen Header haben
        _chatbot_dock.setObjectName("chatbotDock")
        _chatbot_dock.setTitleBarWidget(QWidget())  # Entferne Standard-Titlebar
        
        # Modernes Styling für Dock-Widget (Theme-basiert)
        _chatbot_dock.setStyleSheet(get_dock_widget_style())
        
        # Chatbot-Widget hinzufügen
        global _chatbot_widget
        chatbot_widget = ChatbotWidget()
        _chatbot_widget = chatbot_widget  # Global speichern für Hooks
        _chatbot_dock.setWidget(chatbot_widget)
        
        # Dock-Widget links positionieren
        mw.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, _chatbot_dock)
        
        # Resizable: Min/Max Breite setzen
        DOCK_MIN_WIDTH = 350
        DOCK_MAX_WIDTH = 800
        DOCK_DEFAULT_WIDTH = 450
        _chatbot_dock.setMinimumWidth(DOCK_MIN_WIDTH)
        _chatbot_dock.setMaximumWidth(DOCK_MAX_WIDTH)
        _chatbot_dock.resize(DOCK_DEFAULT_WIDTH, mw.height())
        
        # Style für Main Window Splitter (zwischen Dock und Reviewer)
        # 1px dezenter Trenner — kein padding, kein margin, !important überschreibt alles
        mw.setStyleSheet(mw.styleSheet() + """
            QMainWindow::separator {
                background: rgba(255, 255, 255, 0.04);
                width: 1px !important;
                margin: 0px;
                padding: 0px;
            }
            QMainWindow::separator:hover {
                background: rgba(255, 255, 255, 0.08);
                width: 1px !important;
            }
            QSplitter::handle {
                background: rgba(255, 255, 255, 0.04);
                width: 1px !important;
                margin: 0px;
                padding: 0px;
            }
            QSplitter::handle:hover {
                background: rgba(255, 255, 255, 0.08);
                width: 1px !important;
            }
        """)
        
        # Erlauben, dass das Panel geschlossen, bewegt und in der Größe geändert werden kann
        _chatbot_dock.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetClosable |
            QDockWidget.DockWidgetFeature.DockWidgetMovable |
            QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
    
    # Panel ein-/ausblenden
    if _chatbot_dock.isVisible():
        _chatbot_dock.hide()
        # Tell reviewer dock to un-hide
        _notify_reviewer_chat_state(False)
    else:
        _chatbot_dock.show()
        # Tell reviewer dock to hide (chat panel is now visible)
        _notify_reviewer_chat_state(True)
        # Trigger slide-in animation in React
        try:
            widget = get_chatbot_widget()
            if widget and widget.web_view:
                widget.web_view.page().runJavaScript(
                    "window.ankiReceive && window.ankiReceive({type:'panelOpened'});"
                )
        except Exception:
            pass
        # Prüfe aktuelles Deck beim Öffnen und sende deckSelected Event
        # Kleine Verzögerung, damit WebView bereit ist
        def check_and_send_deck():
            try:
                widget = get_chatbot_widget()
                if widget and widget.bridge and widget.web_view:
                    # Hole aktuelles Deck
                    deck_info = widget.bridge.getCurrentDeck()
                    deck_data = json.loads(deck_info)
                    
                    # Nur senden wenn wirklich ein Deck aktiv ist
                    if deck_data.get("deckId") and deck_data.get("isInDeck"):
                        deck_id = deck_data["deckId"]
                        deck_name = deck_data["deckName"]
                        
                        # Berechne totalCards
                        stats = widget.bridge._get_deck_stats(deck_id)
                        total_cards = stats.get("totalCards", 0) if stats else 0
                        
                        # Prüfe ob Sub-Deck (enthält :: im Namen)
                        is_sub_deck = "::" in deck_name if deck_name else False
                        
                        # Sende deckSelected Event
                        payload = {
                            "type": "deckSelected",
                            "data": {
                                "deckId": deck_id,
                                "deckName": deck_name,
                                "totalCards": total_cards,
                                "isSubDeck": is_sub_deck
                            }
                        }
                        widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                        logger.info("📚 toggle_chatbot: deckSelected Event gesendet - Deck: %s, Cards: %s", deck_name, total_cards)
            except Exception as e:
                logger.exception("Fehler beim Senden von deckSelected beim Öffnen: %s", e)
        
        # Verzögerung, damit WebView vollständig geladen ist
        QTimer.singleShot(100, check_and_send_deck)

def show_settings():
    """Öffnet das native AnkiPlus Settings-Popup."""
    try:
        from .settings import show_settings as _show_native_settings
        _show_native_settings()
    except Exception as e:
        logger.exception("Fehler beim Öffnen der Settings: %s", e)

def close_chatbot_panel():
    """Schließt das Dock-Panel"""
    global _chatbot_dock
    if _chatbot_dock:
        _chatbot_dock.hide()

def get_chatbot_widget():
    """Gibt die Chatbot-Widget-Instanz zurück (für Hooks)"""
    global _chatbot_widget
    return _chatbot_widget

def ensure_chatbot_open():
    """Öffnet das Chatbot-Panel falls es noch nicht sichtbar ist. Gibt das Widget zurück."""
    global _chatbot_dock
    if _chatbot_dock is None or not _chatbot_dock.isVisible():
        toggle_chatbot()
    return get_chatbot_widget()

def setup_keyboard_shortcut():
    """Erstellt den Cmd+I / Ctrl+I Shortcut zum Öffnen/Schließen des Chatbots"""
    global _shortcut
    # Shortcut erstellen: Cmd+I auf macOS, Ctrl+I auf Windows/Linux
    _shortcut = QShortcut(QKeySequence("Ctrl+I"), mw)
    _shortcut.activated.connect(toggle_chatbot)
    logger.info("Chatbot Shortcut erstellt: Cmd+I / Ctrl+I")

def setup_toolbar_button():
    """Fügt einen Button zur Anki-Toolbar hinzu (ganz links)"""
    if mw is None:
        return
    
    try:
        # Plattformspezifischen Shortcut-Text bestimmen
        if sys.platform == 'darwin':  # macOS
            shortcut_text = "Cmd+I"
        else:  # Windows/Linux
            shortcut_text = "Ctrl+I"
        
        # Action erstellen
        action = QAction("AnKI+", mw)
        action.setToolTip(f"Chatbot öffnen/schließen ({shortcut_text})")
        action.triggered.connect(toggle_chatbot)
        
        # Verschiedene Wege versuchen, um zur Toolbar zu gelangen
        toolbar = None
        
        # Methode 1: mw.form.toolbar (Standard in Anki)
        if hasattr(mw, 'form') and hasattr(mw.form, 'toolbar'):
            toolbar = mw.form.toolbar
            logger.info("✅ Toolbar gefunden via mw.form.toolbar")
        
        # Methode 2: mw.toolbar (direkt)
        elif hasattr(mw, 'toolbar') and mw.toolbar is not None:
            toolbar = mw.toolbar
            logger.info("✅ Toolbar gefunden via mw.toolbar")
        
        # Methode 3: Toolbar im Hauptfenster suchen
        else:
            # Suche nach QToolBar im Hauptfenster
            for widget in mw.findChildren(QToolBar):
                if widget.isVisible():
                    toolbar = widget
                    logger.info("✅ Toolbar gefunden via findChildren: %s", widget.objectName())
                    break
        
        if toolbar is None:
            logger.warning("⚠️ Anki Toolbar nicht gefunden.")
            return
        
        # Debug: Alle verfügbaren Methoden/Attribute ausgeben
        logger.debug("🔍 Toolbar Typ: %s", type(toolbar))
        logger.debug("🔍 Toolbar Attribute: %s", [attr for attr in dir(toolbar) if not attr.startswith('_')])
        
        # Prüfe ob es eine QToolBar ist (hat insertAction)
        if isinstance(toolbar, QToolBar):
            # Standard QToolBar: insertAction verwenden für Position ganz links
            toolbar.insertAction(None, action)
            logger.info("✅ Toolbar-Button 'AnKI+' ganz links hinzugefügt (QToolBar, Shortcut: %s)", shortcut_text)
        # Versuche verschiedene Methoden für Anki's Toolbar
        elif hasattr(toolbar, 'add_link'):
            # Anki's Toolbar hat möglicherweise add_link
            toolbar.add_link("AnKI+", toggle_chatbot)
            logger.info("✅ Toolbar-Button 'AnKI+' hinzugefügt via add_link (Shortcut: %s)", shortcut_text)
        elif hasattr(toolbar, 'link'):
            # Anki's Toolbar hat möglicherweise link
            toolbar.link("AnKI+", toggle_chatbot)
            logger.info("✅ Toolbar-Button 'AnKI+' hinzugefügt via link (Shortcut: %s)", shortcut_text)
        elif hasattr(toolbar, 'addAction'):
            # Standard addAction
            existing_actions = toolbar.actions() if hasattr(toolbar, 'actions') else []
            if existing_actions and hasattr(toolbar, 'insertAction'):
                toolbar.insertAction(existing_actions[0], action)
                logger.info("✅ Toolbar-Button 'AnKI+' ganz links hinzugefügt (vor erster Action, Shortcut: %s)", shortcut_text)
            else:
                toolbar.addAction(action)
                logger.info("✅ Toolbar-Button 'AnKI+' hinzugefügt (Shortcut: %s)", shortcut_text)
        else:
            # Versuche, direkt ein Button-Widget hinzuzufügen
            try:
                # Erstelle einen QPushButton
                button = QPushButton("AnKI+", toolbar)
                button.setToolTip(f"Chatbot öffnen/schließen ({shortcut_text})")
                button.clicked.connect(toggle_chatbot)
                
                # Versuche, den Button zur Toolbar hinzuzufügen
                if hasattr(toolbar, 'addWidget'):
                    toolbar.addWidget(button)
                    logger.info("✅ Toolbar-Button 'AnKI+' als Widget hinzugefügt (Shortcut: %s)", shortcut_text)
                elif hasattr(toolbar, 'insertWidget'):
                    toolbar.insertWidget(0, button)  # Ganz links
                    logger.info("✅ Toolbar-Button 'AnKI+' als Widget ganz links hinzugefügt (Shortcut: %s)", shortcut_text)
                else:
                    logger.warning("⚠️ Toolbar hat keine bekannte Methode zum Hinzufügen von Widgets/Actions")
            except Exception as widget_error:
                logger.warning("⚠️ Fehler beim Hinzufügen als Widget: %s", widget_error)
        
    except Exception as e:
        logger.exception("⚠️ Fehler beim Hinzufügen des Toolbar-Buttons: %s", e)

def setup_ui():
    """Initialisiert die Chatbot-UI mit Keyboard Shortcut"""
    # Keyboard Shortcut erstellen (Cmd+I / Ctrl+I)
    setup_keyboard_shortcut()
    # Toolbar-Button hinzufügen
    setup_toolbar_button()
    
    # State-Change Hook registrieren
    gui_hooks.state_did_change.append(on_state_did_change)

def on_state_did_change(new_state, old_state):
    """Wird aufgerufen, wenn sich der Anki-Status ändert"""
    try:
        widget = get_chatbot_widget()
        if widget and widget.web_view and hasattr(widget, 'bridge') and widget.bridge:
            # Hole Deck-Daten proaktiv und sende sie an das Frontend
            deck_json = widget.bridge.getCurrentDeck()
            js = f"window.ankiReceive({{type: 'currentDeck', data: {deck_json}}});"
            widget.web_view.page().runJavaScript(js)
            logger.debug("State Change (%s -> %s): Deck-Update gesendet", old_state, new_state)
    except Exception as e:
        logger.error("Fehler im State-Change-Hook: %s", e)

def toggle_custom_reviewer(checked):
    """Toggle between custom and native reviewer"""
    try:
        # Import custom_reviewer
        try:
            from ..custom_reviewer import custom_reviewer
        except ImportError:
            from custom_reviewer import custom_reviewer

        if checked:
            custom_reviewer.enable()
        else:
            custom_reviewer.disable()

        # Save to config
        config = mw.addonManager.getConfig(__name__) or {}
        config["use_custom_reviewer"] = checked
        mw.addonManager.writeConfig(__name__, config)

        # Show confirmation
        from aqt.utils import tooltip
        if checked:
            tooltip("Custom Reviewer enabled. Changes will apply to the next card.")
        else:
            tooltip("Custom Reviewer disabled. Using native Anki reviewer.")

    except Exception as e:
        from aqt.utils import showInfo
        showInfo(f"Error toggling custom reviewer: {e}")


def setup_menu():
    """Fügt die Chatbot-Menüeinträge zum Anki-Hauptmenü hinzu"""
    # Chatbot öffnen/schließen mit Shortcut-Anzeige
    action = QAction("Chatbot öffnen/schließen", mw)
    action.setShortcut(QKeySequence("Ctrl+I"))
    action.triggered.connect(toggle_chatbot)
    mw.form.menuTools.addAction(action)

    # Custom Reviewer toggle
    try:
        from ..custom_reviewer import custom_reviewer
    except ImportError:
        from custom_reviewer import custom_reviewer

    # Get current config state
    config = mw.addonManager.getConfig(__name__) or {}
    use_custom_reviewer = config.get("use_custom_reviewer", True)

    toggle_reviewer_action = QAction("Use Custom Reviewer", mw)
    toggle_reviewer_action.setCheckable(True)
    toggle_reviewer_action.setChecked(use_custom_reviewer)
    toggle_reviewer_action.triggered.connect(toggle_custom_reviewer)
    mw.form.menuTools.addAction(toggle_reviewer_action)

    # Einstellungen werden nur über das Chat-Fenster zugänglich gemacht
    # (kein separater Menü-Eintrag mehr)

