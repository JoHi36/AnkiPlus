"""
UI-Setup Modul
Verwaltet Dock-Widget und UI-Initialisierung
"""

from aqt import mw
from aqt.qt import *
from aqt.utils import showInfo
from aqt import gui_hooks
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

try:
    from .tokens_qt import get_tokens
except ImportError:
    from tokens_qt import get_tokens

# Style-Funktionen
def get_dock_widget_style():
    try:
        from .theme import get_resolved_theme
    except ImportError:
        from ui.theme import get_resolved_theme
    resolved = get_resolved_theme()
    tokens = get_tokens(resolved)
    return f"""
    QDockWidget {{
        background-color: {tokens['bg_deep']};
        color: {tokens['text_primary']};
    }}
    /* Minimal separator - nearly invisible, matches unified background */
    QDockWidget::separator {{
        background: {tokens['border_subtle']};
        width: 1px;
    }}
    QDockWidget::separator:hover {{
        background: {tokens['border_medium']};
        width: 1px;
    }}
    """

def show_qwebengine_warning():
    showInfo("QWebEngine ist nicht verfügbar. Bitte installieren Sie QtWebEngine (PyQt6-WebEngine).")

# Globale Variablen
_chatbot_dock = None
_chatbot_widget = None  # Widget-Instanz für Event-Hooks

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

def _create_chatbot_dock():
    """Creates the chatbot dock widget (called on first use)."""
    global _chatbot_dock, _chatbot_widget
    if _chatbot_dock is not None:
        return

    _chatbot_dock = QDockWidget("", mw)
    _chatbot_dock.setObjectName("chatbotDock")
    _chatbot_dock.setTitleBarWidget(QWidget())
    _chatbot_dock.setStyleSheet(get_dock_widget_style())

    chatbot_widget = ChatbotWidget()
    _chatbot_widget = chatbot_widget
    _chatbot_dock.setWidget(chatbot_widget)
    mw.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, _chatbot_dock)

    DOCK_MIN_WIDTH = 350
    DOCK_MAX_WIDTH = 800
    DOCK_DEFAULT_WIDTH = 450
    _chatbot_dock.setMinimumWidth(DOCK_MIN_WIDTH)
    _chatbot_dock.setMaximumWidth(DOCK_MAX_WIDTH)
    _chatbot_dock.resize(DOCK_DEFAULT_WIDTH, mw.height())

    try:
        from .theme import get_resolved_theme
    except ImportError:
        from ui.theme import get_resolved_theme
    _resolved = get_resolved_theme()
    _sep_tokens = get_tokens(_resolved)
    mw.setStyleSheet(mw.styleSheet() + f"""
        QMainWindow::separator {{
            background: {_sep_tokens['border_subtle']};
            width: 1px !important;
            margin: 0px;
            padding: 0px;
        }}
        QMainWindow::separator:hover {{
            background: {_sep_tokens['border_medium']};
            width: 1px !important;
        }}
        QSplitter::handle {{
            background: {_sep_tokens['border_subtle']};
            width: 1px !important;
            margin: 0px;
            padding: 0px;
        }}
        QSplitter::handle:hover {{
            background: {_sep_tokens['border_medium']};
            width: 1px !important;
        }}
    """)

    _chatbot_dock.setFeatures(
        QDockWidget.DockWidgetFeature.DockWidgetClosable |
        QDockWidget.DockWidgetFeature.DockWidgetMovable |
        QDockWidget.DockWidgetFeature.DockWidgetFloatable
    )

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
    if _chatbot_dock is None:
        _create_chatbot_dock()
    if _chatbot_dock and not _chatbot_dock.isVisible():
        _chatbot_dock.show()
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
        # Send current deck info after short delay
        def check_and_send_deck():
            try:
                widget = get_chatbot_widget()
                if widget and widget.bridge and widget.web_view:
                    deck_info = widget.bridge.getCurrentDeck()
                    deck_data = json.loads(deck_info)
                    if deck_data.get("deckId") and deck_data.get("isInDeck"):
                        deck_id = deck_data["deckId"]
                        deck_name = deck_data["deckName"]
                        stats = widget.bridge._get_deck_stats(deck_id)
                        total_cards = stats.get("totalCards", 0) if stats else 0
                        is_sub_deck = "::" in deck_name if deck_name else False
                        payload = {
                            "type": "deckSelected",
                            "data": {
                                "deckId": deck_id,
                                "deckName": deck_name,
                                "totalCards": total_cards,
                                "isSubDeck": is_sub_deck
                            }
                        }
                        widget.web_view.page().runJavaScript(
                            f"window.ankiReceive({json.dumps(payload)});"
                        )
            except Exception as e:
                logger.exception("Fehler beim Senden von deckSelected: %s", e)
        QTimer.singleShot(100, check_and_send_deck)
    return get_chatbot_widget()

def setup_toolbar_button():
    """Fügt einen Button zur Anki-Toolbar hinzu (ganz links)"""
    if mw is None:
        return

    try:
        # Action erstellen
        action = QAction("AnKI+", mw)
        action.setToolTip("AnKI+ öffnen")
        action.triggered.connect(ensure_chatbot_open)

        # Verschiedene Wege versuchen, um zur Toolbar zu gelangen
        toolbar = None

        # Methode 1: mw.form.toolbar (Standard in Anki)
        if hasattr(mw, 'form') and hasattr(mw.form, 'toolbar'):
            toolbar = mw.form.toolbar
            logger.info("Toolbar gefunden via mw.form.toolbar")

        # Methode 2: mw.toolbar (direkt)
        elif hasattr(mw, 'toolbar') and mw.toolbar is not None:
            toolbar = mw.toolbar
            logger.info("Toolbar gefunden via mw.toolbar")

        # Methode 3: Toolbar im Hauptfenster suchen
        else:
            # Suche nach QToolBar im Hauptfenster
            for widget in mw.findChildren(QToolBar):
                if widget.isVisible():
                    toolbar = widget
                    logger.info("Toolbar gefunden via findChildren: %s", widget.objectName())
                    break

        if toolbar is None:
            logger.warning("Anki Toolbar nicht gefunden.")
            return

        # Debug: Alle verfügbaren Methoden/Attribute ausgeben
        logger.debug("Toolbar Typ: %s", type(toolbar))
        logger.debug("Toolbar Attribute: %s", [attr for attr in dir(toolbar) if not attr.startswith('_')])

        # Prüfe ob es eine QToolBar ist (hat insertAction)
        if isinstance(toolbar, QToolBar):
            # Standard QToolBar: insertAction verwenden für Position ganz links
            toolbar.insertAction(None, action)
            logger.info("Toolbar-Button 'AnKI+' ganz links hinzugefügt (QToolBar)")
        # Versuche verschiedene Methoden für Anki's Toolbar
        elif hasattr(toolbar, 'add_link'):
            # Anki's Toolbar hat möglicherweise add_link
            toolbar.add_link("AnKI+", ensure_chatbot_open)
            logger.info("Toolbar-Button 'AnKI+' hinzugefügt via add_link")
        elif hasattr(toolbar, 'link'):
            # Anki's Toolbar hat möglicherweise link
            toolbar.link("AnKI+", ensure_chatbot_open)
            logger.info("Toolbar-Button 'AnKI+' hinzugefügt via link")
        elif hasattr(toolbar, 'addAction'):
            # Standard addAction
            existing_actions = toolbar.actions() if hasattr(toolbar, 'actions') else []
            if existing_actions and hasattr(toolbar, 'insertAction'):
                toolbar.insertAction(existing_actions[0], action)
                logger.info("Toolbar-Button 'AnKI+' ganz links hinzugefügt (vor erster Action)")
            else:
                toolbar.addAction(action)
                logger.info("Toolbar-Button 'AnKI+' hinzugefügt")
        else:
            # Versuche, direkt ein Button-Widget hinzuzufügen
            try:
                # Erstelle einen QPushButton
                button = QPushButton("AnKI+", toolbar)
                button.setToolTip("AnKI+ öffnen")
                button.clicked.connect(ensure_chatbot_open)

                # Versuche, den Button zur Toolbar hinzuzufügen
                if hasattr(toolbar, 'addWidget'):
                    toolbar.addWidget(button)
                    logger.info("Toolbar-Button 'AnKI+' als Widget hinzugefügt")
                elif hasattr(toolbar, 'insertWidget'):
                    toolbar.insertWidget(0, button)  # Ganz links
                    logger.info("Toolbar-Button 'AnKI+' als Widget ganz links hinzugefügt")
                else:
                    logger.warning("Toolbar hat keine bekannte Methode zum Hinzufügen von Widgets/Actions")
            except Exception as widget_error:
                logger.warning("Fehler beim Hinzufügen als Widget: %s", widget_error)

    except Exception as e:
        logger.exception("Fehler beim Hinzufügen des Toolbar-Buttons: %s", e)

def setup_ui():
    """Initialisiert die Chatbot-UI mit globalem Shortcut-Filter"""
    try:
        from .shortcut_filter import install_shortcut_filter
    except ImportError:
        from ui.shortcut_filter import install_shortcut_filter
    install_shortcut_filter()
    setup_toolbar_button()
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

