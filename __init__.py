"""
Anki Chatbot Addon
Ein Chatbot mit moderner Web-UI (HTML/CSS/JS via QWebEngineView)
"""

from aqt import mw
from aqt.qt import QTimer
from aqt import gui_hooks
import json

# UI-Setup Import
try:
    from .ui_setup import setup_ui, setup_menu, get_chatbot_widget
except ImportError:
    from ui_setup import setup_ui, setup_menu, get_chatbot_widget

def init_addon():
    """Initialisiert das Addon nach dem Laden des Profils"""
    if mw is None:
        return
    
    try:
        mw.addonManager.setWebExports(__name__, r"(web|icons)/.*")
        setup_ui()
        setup_menu()
        # Keine automatischen Server/Monitoring mehr - User fügt Token manuell ein
    except Exception as e:
        from aqt.utils import showInfo
        showInfo(f"Fehler beim Laden des Chatbot-Addons: {str(e)}")

def on_profile_loaded():
    """Wird aufgerufen, wenn das Profil geladen ist"""
    init_addon()

def _emit_deck_selected(widget, deck_id, deck_name):
    """Helper: Emittiert deckSelected Event mit totalCards"""
    if not widget or not widget.bridge or not widget.web_view:
        return
    
    try:
        # Berechne totalCards
        stats = widget.bridge._get_deck_stats(deck_id)
        total_cards = stats.get("totalCards", 0) if stats else 0
        
        # Prüfe ob Sub-Deck (enthält :: im Namen)
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
        widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        print(f"📚 Hook: deckSelected Event gesendet - Deck: {deck_name}, Cards: {total_cards}")
    except Exception as e:
        print(f"Fehler beim Senden von deckSelected Event: {e}")
        import traceback
        traceback.print_exc()

def on_reviewer_did_show_question(card):
    """Wird aufgerufen, wenn eine Karte im Reviewer angezeigt wird - sendet deckSelected Event"""
    widget = get_chatbot_widget()
    if widget and widget.bridge and widget.web_view:
        try:
            deck_info = widget.bridge.getCurrentDeck()
            deck_data = json.loads(deck_info)
            
            # Nur senden wenn wirklich ein Deck aktiv ist
            if deck_data.get("deckId") and deck_data.get("isInDeck"):
                _emit_deck_selected(
                    widget,
                    deck_data["deckId"],
                    deck_data["deckName"]
                )
        except Exception as e:
            print(f"Fehler beim Senden von Deck-Event: {e}")
            import traceback
            traceback.print_exc()

# Alte Logik entfernt - User fügt Token manuell in Profil-Dialog ein

def on_state_will_change(new_state, old_state):
    """Wird aufgerufen, wenn sich der Anki-State ändert (z.B. review -> deckBrowser)"""
    widget = get_chatbot_widget()
    if widget and widget.bridge and widget.web_view:
        try:
            # Wenn State zu "review" wechselt, sende deckSelected Event
            if new_state == "review":
                # Kleine Verzögerung, damit Reviewer vollständig initialisiert ist
                def send_deck_selected():
                    try:
                        deck_info = widget.bridge.getCurrentDeck()
                        deck_data = json.loads(deck_info)
                        if deck_data.get("deckId"):
                            _emit_deck_selected(
                                widget,
                                deck_data["deckId"],
                                deck_data["deckName"]
                            )
                    except Exception as e:
                        print(f"Fehler beim Senden von deckSelected in state_will_change: {e}")
                
                QTimer.singleShot(300, send_deck_selected)
            
            # Wenn State zu "deckBrowser" wechselt, sende deckExited Event
            elif new_state == "deckBrowser":
                payload = {"type": "deckExited", "data": {}}
                widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                print("📚 Hook: State zu deckBrowser gewechselt, deckExited Event gesendet")
        except Exception as e:
            print(f"Fehler beim Senden von State-Change-Event: {e}")
            import traceback
            traceback.print_exc()

# Hook registrieren (mit Fallback falls Hooks nicht verfügbar sind)
if mw is not None:
    gui_hooks.profile_did_open.append(on_profile_loaded)
    
    # Verwende die korrekten Hook-Namen (wie in card_tracker.py)
    if hasattr(gui_hooks, 'reviewer_did_show_question'):
        gui_hooks.reviewer_did_show_question.append(on_reviewer_did_show_question)
        print("✅ Hook: reviewer_did_show_question registriert")
    else:
        print("⚠️ WARNUNG: reviewer_did_show_question Hook nicht verfügbar")
    
    if hasattr(gui_hooks, 'state_will_change'):
        gui_hooks.state_will_change.append(on_state_will_change)
        print("✅ Hook: state_will_change registriert")
    else:
        print("⚠️ WARNUNG: state_will_change Hook nicht verfügbar")
    
    # Falls Profil bereits geladen ist, sofort initialisieren
    if hasattr(mw, 'col') and mw.col is not None:
        QTimer.singleShot(100, init_addon)
