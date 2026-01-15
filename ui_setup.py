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
    from widget import ChatbotWidget

# Auth-Server Import
try:
    from .auth_server import get_auth_server
except ImportError:
    from auth_server import get_auth_server

# Style-Funktionen
def get_dock_widget_style():
    return """
    QDockWidget {
        background-color: #1b1b1b;
        color: #e6e6e6;
    }
    /* Extrem subtile Resize-Bar */
    QDockWidget::separator {
        background: rgba(255, 255, 255, 0.02);
        width: 1px;
    }
    QDockWidget::separator:hover {
        background: rgba(255, 255, 255, 0.05);
        width: 1px;
    }
    """

def show_qwebengine_warning():
    showInfo("QWebEngine ist nicht verfügbar. Bitte installieren Sie QtWebEngine (PyQt6-WebEngine).")

# Globale Variablen
_chatbot_dock = None
_chatbot_widget = None  # Widget-Instanz für Event-Hooks
_shortcut = None

def toggle_chatbot():
    """Öffnet oder schließt das Chatbot-Panel (Cmd+I / Ctrl+I)"""
    global _chatbot_dock
    if QWebEngineView is None:
        show_qwebengine_warning()
        return
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
        
        # Starte/aktualisiere Auth-Server für Handshake mit Landingpage
        # (Server könnte bereits gestartet sein, dann aktualisieren wir nur die Bridge)
        try:
            auth_server = get_auth_server()
            if not auth_server.running:
                # Server noch nicht gestartet - starte jetzt
                auth_server.start(chatbot_widget.bridge, chatbot_widget)
            else:
                # Server läuft bereits - aktualisiere nur die Bridge-Referenz
                from auth_server import set_bridge_instance
                set_bridge_instance(chatbot_widget.bridge, chatbot_widget)
                print("✅ Auth-Server Bridge aktualisiert")
        except Exception as e:
            print(f"⚠️ Fehler beim Starten/Aktualisieren des Auth-Servers: {e}")
            import traceback
            traceback.print_exc()
        
        # Dock-Widget links positionieren
        mw.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, _chatbot_dock)
        
        # Resizable: Min/Max Breite setzen
        _chatbot_dock.setMinimumWidth(350)
        _chatbot_dock.setMaximumWidth(800)
        _chatbot_dock.resize(450, mw.height())  # Standardbreite
        
        # Erlauben, dass das Panel geschlossen, bewegt und in der Größe geändert werden kann
        _chatbot_dock.setFeatures(
            QDockWidget.DockWidgetFeature.DockWidgetClosable |
            QDockWidget.DockWidgetFeature.DockWidgetMovable |
            QDockWidget.DockWidgetFeature.DockWidgetFloatable
        )
    
    # Panel ein-/ausblenden
    if _chatbot_dock.isVisible():
        _chatbot_dock.hide()
    else:
        _chatbot_dock.show()
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
                        print(f"📚 toggle_chatbot: deckSelected Event gesendet - Deck: {deck_name}, Cards: {total_cards}")
            except Exception as e:
                print(f"Fehler beim Senden von deckSelected beim Öffnen: {e}")
                import traceback
                traceback.print_exc()
        
        # Verzögerung, damit WebView vollständig geladen ist
        QTimer.singleShot(100, check_and_send_deck)

def close_chatbot_panel():
    """Schließt das Dock-Panel"""
    global _chatbot_dock
    if _chatbot_dock:
        _chatbot_dock.hide()

def get_chatbot_widget():
    """Gibt die Chatbot-Widget-Instanz zurück (für Hooks)"""
    global _chatbot_widget
    return _chatbot_widget

def setup_keyboard_shortcut():
    """Erstellt den Cmd+I / Ctrl+I Shortcut zum Öffnen/Schließen des Chatbots"""
    global _shortcut
    # Shortcut erstellen: Cmd+I auf macOS, Ctrl+I auf Windows/Linux
    _shortcut = QShortcut(QKeySequence("Ctrl+I"), mw)
    _shortcut.activated.connect(toggle_chatbot)
    print("Chatbot Shortcut erstellt: Cmd+I / Ctrl+I")

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
            print("✅ Toolbar gefunden via mw.form.toolbar")
        
        # Methode 2: mw.toolbar (direkt)
        elif hasattr(mw, 'toolbar') and mw.toolbar is not None:
            toolbar = mw.toolbar
            print("✅ Toolbar gefunden via mw.toolbar")
        
        # Methode 3: Toolbar im Hauptfenster suchen
        else:
            # Suche nach QToolBar im Hauptfenster
            for widget in mw.findChildren(QToolBar):
                if widget.isVisible():
                    toolbar = widget
                    print(f"✅ Toolbar gefunden via findChildren: {widget.objectName()}")
                    break
        
        if toolbar is None:
            print("⚠️ Anki Toolbar nicht gefunden. Verfügbare Attribute:")
            if hasattr(mw, 'form'):
                print(f"   mw.form Attribute: {[attr for attr in dir(mw.form) if not attr.startswith('_')]}")
            print(f"   mw Attribute: {[attr for attr in dir(mw) if 'tool' in attr.lower() or 'bar' in attr.lower()]}")
            return
        
        # Debug: Alle verfügbaren Methoden/Attribute ausgeben
        print(f"🔍 Toolbar Typ: {type(toolbar)}")
        print(f"🔍 Toolbar Attribute: {[attr for attr in dir(toolbar) if not attr.startswith('_')]}")
        
        # Prüfe ob es eine QToolBar ist (hat insertAction)
        if isinstance(toolbar, QToolBar):
            # Standard QToolBar: insertAction verwenden für Position ganz links
            toolbar.insertAction(None, action)
            print(f"✅ Toolbar-Button 'AnKI+' ganz links hinzugefügt (QToolBar, Shortcut: {shortcut_text})")
        # Versuche verschiedene Methoden für Anki's Toolbar
        elif hasattr(toolbar, 'add_link'):
            # Anki's Toolbar hat möglicherweise add_link
            toolbar.add_link("AnKI+", toggle_chatbot)
            print(f"✅ Toolbar-Button 'AnKI+' hinzugefügt via add_link (Shortcut: {shortcut_text})")
        elif hasattr(toolbar, 'link'):
            # Anki's Toolbar hat möglicherweise link
            toolbar.link("AnKI+", toggle_chatbot)
            print(f"✅ Toolbar-Button 'AnKI+' hinzugefügt via link (Shortcut: {shortcut_text})")
        elif hasattr(toolbar, 'addAction'):
            # Standard addAction
            existing_actions = toolbar.actions() if hasattr(toolbar, 'actions') else []
            if existing_actions and hasattr(toolbar, 'insertAction'):
                toolbar.insertAction(existing_actions[0], action)
                print(f"✅ Toolbar-Button 'AnKI+' ganz links hinzugefügt (vor erster Action, Shortcut: {shortcut_text})")
            else:
                toolbar.addAction(action)
                print(f"✅ Toolbar-Button 'AnKI+' hinzugefügt (Shortcut: {shortcut_text})")
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
                    print(f"✅ Toolbar-Button 'AnKI+' als Widget hinzugefügt (Shortcut: {shortcut_text})")
                elif hasattr(toolbar, 'insertWidget'):
                    toolbar.insertWidget(0, button)  # Ganz links
                    print(f"✅ Toolbar-Button 'AnKI+' als Widget ganz links hinzugefügt (Shortcut: {shortcut_text})")
                else:
                    print(f"⚠️ Toolbar hat keine bekannte Methode zum Hinzufügen von Widgets/Actions")
                    print(f"   Verfügbare Methoden mit 'add' oder 'insert': {[m for m in dir(toolbar) if not m.startswith('_') and ('add' in m.lower() or 'insert' in m.lower())]}")
            except Exception as widget_error:
                print(f"⚠️ Fehler beim Hinzufügen als Widget: {widget_error}")
        
    except Exception as e:
        print(f"⚠️ Fehler beim Hinzufügen des Toolbar-Buttons: {e}")
        import traceback
        traceback.print_exc()

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
            print(f"State Change ({old_state} -> {new_state}): Deck-Update gesendet")
    except Exception as e:
        print(f"Fehler im State-Change-Hook: {e}")

def setup_menu():
    """Fügt die Chatbot-Menüeinträge zum Anki-Hauptmenü hinzu"""
    # Chatbot öffnen/schließen mit Shortcut-Anzeige
    action = QAction("Chatbot öffnen/schließen", mw)
    action.setShortcut(QKeySequence("Ctrl+I"))
    action.triggered.connect(toggle_chatbot)
    mw.form.menuTools.addAction(action)
    
    # Einstellungen werden nur über das Chat-Fenster zugänglich gemacht
    # (kein separater Menü-Eintrag mehr)

