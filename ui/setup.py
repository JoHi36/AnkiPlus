"""
UI-Setup Modul
Sidebar via MainViewWidget (replaces QDockWidget)
"""

from aqt import mw
from aqt.qt import *
from aqt.utils import showInfo
from aqt import gui_hooks
import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Sidebar state
_panel_user_closed = False  # True wenn User das Panel manuell geschlossen hat

def _notify_reviewer_chat_state(is_open):
    """Tell the reviewer webview to show/hide its dock based on chat panel visibility."""
    val = "true" if is_open else "false"
    js = 'if(window.setChatOpen) setChatOpen(%s);' % val

    def _send():
        try:
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.page().runJavaScript(js)
        except Exception:
            pass

    _send()
    for delay in [200, 500, 1000]:
        QTimer.singleShot(delay, _send)

def _get_main_view():
    """Get MainViewWidget singleton."""
    try:
        from .main_view import get_main_view
    except ImportError:
        from ui.main_view import get_main_view
    return get_main_view()

def show_settings():
    """Opens Anki's native preferences dialog."""
    try:
        if mw:
            mw.onPrefs()
    except Exception as e:
        logger.exception("Fehler beim Öffnen der Settings: %s", e)

def toggle_chatbot_panel():
    """Toggle sidebar visibility."""
    global _panel_user_closed
    mv = _get_main_view()
    if mv._sidebar_visible:
        mv.hide_sidebar()
        _panel_user_closed = True
        _notify_reviewer_chat_state(False)
    else:
        _panel_user_closed = False
        ensure_chatbot_open()

# Alias for backwards compatibility
toggle_chatbot = toggle_chatbot_panel

def close_chatbot_panel():
    """Close the sidebar."""
    global _panel_user_closed
    mv = _get_main_view()
    mv.hide_sidebar()
    _panel_user_closed = True
    _notify_reviewer_chat_state(False)

def get_chatbot_widget():
    """Return the ChatbotWidget instance (sidebar in MainViewWidget)."""
    mv = _get_main_view()
    return mv.get_sidebar_widget()

def ensure_chatbot_open():
    """Open the sidebar. Returns the ChatbotWidget."""
    mv = _get_main_view()
    mv.show_sidebar()
    _notify_reviewer_chat_state(True)
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
                        "window.ankiReceive(%s);" % json.dumps(payload)
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
    global _panel_user_closed
    if new_state == 'review':
        # Respect user's choice — only auto-open if user hasn't manually closed it
        if not _panel_user_closed:
            ensure_chatbot_open()
        else:
            _notify_reviewer_chat_state(False)
    # Sidebar cleanup for non-review is handled by show_for_state() — don't call
    # hide_sidebar() here, it would hide the fullscreen MainViewWidget too.

    # Send deck update to sidebar widget (only if it exists and is initialized)
    try:
        mv = _get_main_view()
        widget = mv.get_sidebar_widget()
        if widget and widget.web_view and hasattr(widget, 'bridge') and widget.bridge:
            deck_json = widget.bridge.getCurrentDeck()
            js = "window.ankiReceive({type: 'currentDeck', data: %s});" % deck_json
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
    # Chatbot panel toggle (no keyboard shortcut)
    toggle_action = QAction("Chatbot öffnen/schließen", mw)
    toggle_action.triggered.connect(toggle_chatbot_panel)
    mw.form.menuTools.addAction(toggle_action)

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


def toggle_settings_sidebar():
    """Toggle the settings sidebar."""
    try:
        from .settings_sidebar import toggle_settings_sidebar as _toggle
    except ImportError:
        from ui.settings_sidebar import toggle_settings_sidebar as _toggle
    _toggle()

