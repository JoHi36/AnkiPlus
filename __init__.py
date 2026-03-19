"""
Anki Chatbot Addon
Ein Chatbot mit moderner Web-UI (HTML/CSS/JS via QWebEngineView)
"""

from aqt import mw
from aqt.qt import QTimer
from aqt import gui_hooks
import json

# Global EmbeddingManager instance
_embedding_manager = None


def get_embedding_manager():
    return _embedding_manager

# UI-Setup Import
try:
    from .ui_setup import setup_ui, setup_menu, get_chatbot_widget
except ImportError:
    from ui_setup import setup_ui, setup_menu, get_chatbot_widget

# Global Theme Import
try:
    from .anki_global_theme import setup_global_theme
except ImportError:
    from anki_global_theme import setup_global_theme

# Custom Reviewer Import
try:
    from .custom_reviewer import custom_reviewer
except ImportError:
    from custom_reviewer import custom_reviewer

# Custom Screens Import (DeckBrowser + Overview)
try:
    from .custom_screens import custom_screens
except ImportError:
    from custom_screens import custom_screens

# Card Styling - Nur CSS (kein HTML-Transformer mehr)

def hide_native_bottom_bar():
    """Versteckt die native Anki Bottom Bar auf Qt-Ebene"""
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer:
            # Hide the bottom web widget (Qt level)
            if hasattr(mw.reviewer, 'bottom') and mw.reviewer.bottom:
                mw.reviewer.bottom.web.hide()
                print("✅ Native bottom bar hidden (Qt level)")

            # Alternative: Direct access via bottomWeb
            if hasattr(mw.reviewer, '_bottomWeb'):
                mw.reviewer._bottomWeb.hide()
                print("✅ Native bottomWeb hidden (Qt level)")

    except Exception as e:
        print(f"⚠️ Could not hide native bottom bar: {e}")

def hide_deckbrowser_bottom():
    """Versteckt die DeckBrowser Bottom Bar (Qt-Level, separates Widget)"""
    try:
        if mw and hasattr(mw, 'deckBrowser') and mw.deckBrowser:
            if hasattr(mw.deckBrowser, 'bottom') and mw.deckBrowser.bottom:
                if hasattr(mw.deckBrowser.bottom, 'web'):
                    web = mw.deckBrowser.bottom.web
                    web.hide()
                    web.setFixedHeight(0)
                    web.setMaximumHeight(0)
                    web.setMinimumHeight(0)
                    print("✅ DeckBrowser bottom bar hidden")
    except Exception as e:
        print(f"⚠️ Could not hide deckBrowser bottom: {e}")

def show_deckbrowser_bottom():
    """Zeigt die DeckBrowser Bottom Bar wieder an"""
    try:
        if mw and hasattr(mw, 'deckBrowser') and mw.deckBrowser:
            if hasattr(mw.deckBrowser, 'bottom') and mw.deckBrowser.bottom:
                if hasattr(mw.deckBrowser.bottom, 'web'):
                    web = mw.deckBrowser.bottom.web
                    web.setMaximumHeight(16777215)
                    web.setMinimumHeight(0)
                    if hasattr(web, 'adjustHeightToFit'):
                        web.adjustHeightToFit()
                    web.show()
                    print("✅ DeckBrowser bottom bar restored")
    except Exception as e:
        print(f"⚠️ Could not restore deckBrowser bottom: {e}")

def hide_native_toolbar():
    """Versteckt die native Anki Toolbar für Immersive Mode.

    WICHTIG: mw.toolbar ist KEIN QWidget, sondern eine Python-Wrapper-Klasse.
    Nur mw.toolbar.web (TopWebView) ist ein QWidget mit hide()/show() Methoden.
    """
    try:
        if not mw:
            return

        # Methode 1: mw.toolbar.web (die eigentliche TopWebView)
        if hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
            try:
                web = mw.toolbar.web
                # Prüfe ob Widget noch existiert
                if web and hasattr(web, 'isVisible'):
                    web.hide()
                    web.setFixedHeight(0)
                    web.setMaximumHeight(0)
                    web.setMinimumHeight(0)
                    print("✅ Toolbar.web hidden")
            except (RuntimeError, AttributeError) as e:
                print(f"⚠️ toolbar.web error: {e}")

        # Methode 2: mw.toolbarWeb (alternative Referenz, sollte gleich sein)
        if hasattr(mw, 'toolbarWeb') and mw.toolbarWeb:
            try:
                web = mw.toolbarWeb
                if hasattr(web, 'isVisible'):
                    web.hide()
                    web.setFixedHeight(0)
                    web.setMaximumHeight(0)
                    web.setMinimumHeight(0)
                    print("✅ toolbarWeb hidden")
            except (RuntimeError, AttributeError) as e:
                print(f"⚠️ toolbarWeb error: {e}")

    except Exception as e:
        print(f"⚠️ Could not hide native toolbar: {e}")

def show_native_bottom_bar():
    """Zeigt die native Anki Bottom Bar wieder an (für Cleanup)"""
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer:
            # Show the bottom web widget
            if hasattr(mw.reviewer, 'bottom') and mw.reviewer.bottom:
                mw.reviewer.bottom.web.show()
                print("✅ Native bottom bar restored (Qt level)")
            
            # Alternative: Direct access via bottomWeb
            if hasattr(mw.reviewer, '_bottomWeb'):
                mw.reviewer._bottomWeb.show()
                print("✅ Native bottomWeb restored (Qt level)")
                
    except Exception as e:
        print(f"⚠️ Could not restore native bottom bar: {e}")

def show_native_toolbar():
    """Zeigt die native Anki Toolbar wieder an (Cleanup).

    WICHTIG: mw.toolbar ist KEIN QWidget. Nur mw.toolbar.web ist ein QWidget.
    """
    try:
        if not mw:
            return

        # Methode 1: mw.toolbar.web
        if hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
            try:
                web = mw.toolbar.web
                if web and hasattr(web, 'isVisible'):
                    # Reset height constraints
                    web.setMaximumHeight(16777215)  # QWIDGETSIZE_MAX
                    web.setMinimumHeight(0)
                    # Trigger height recalculation
                    if hasattr(web, 'adjustHeightToFit'):
                        web.adjustHeightToFit()
                    web.show()
                    print("✅ Toolbar.web restored")
            except (RuntimeError, AttributeError) as e:
                print(f"⚠️ toolbar.web restore error: {e}")

        # Methode 2: mw.toolbarWeb
        if hasattr(mw, 'toolbarWeb') and mw.toolbarWeb:
            try:
                web = mw.toolbarWeb
                if hasattr(web, 'isVisible'):
                    web.setMaximumHeight(16777215)
                    web.setMinimumHeight(0)
                    if hasattr(web, 'adjustHeightToFit'):
                        web.adjustHeightToFit()
                    web.show()
                    print("✅ toolbarWeb restored")
            except (RuntimeError, AttributeError) as e:
                print(f"⚠️ toolbarWeb restore error: {e}")

    except Exception as e:
        print(f"⚠️ Could not restore native toolbar: {e}")

def hide_native_top_separator():
    """Versteckt eventuelle zusätzliche UI-Elemente oben im Reviewer.

    Diese Funktion ist jetzt vereinfacht - die Hauptarbeit macht hide_native_toolbar().
    """
    # Die Hauptarbeit wird von hide_native_toolbar() erledigt.
    # Diese Funktion existiert nur noch für Kompatibilität.
    pass

def show_native_top_separator():
    """Zeigt eventuelle zusätzliche UI-Elemente wieder an.

    Diese Funktion ist jetzt vereinfacht - die Hauptarbeit macht show_native_toolbar().
    """
    # Die Hauptarbeit wird von show_native_toolbar() erledigt.
    pass

def hide_splitter_visuals():
    """Macht den Resize-Handle zwischen Hauptfenster und Chat-Panel unsichtbar (Ghost Handle).

    Der Handle bleibt funktional (kann gegriffen und gezogen werden), ist aber optisch transparent.
    """
    if mw is None:
        return

    try:
        style = """
        /* 1px dezenter Trenner zwischen Dock-Widgets und Main Window */
        QMainWindow::separator {
            background: rgba(255, 255, 255, 0.04);
            width: 1px !important;
            height: 1px !important;
            border: none;
            margin: 0px;
            padding: 0px;
        }

        QMainWindow::separator:hover {
            background: rgba(255, 255, 255, 0.08);
            width: 1px !important;
        }

        /* Falls ein QSplitter verwendet wird */
        QSplitter::handle {
            background: rgba(255, 255, 255, 0.04);
            width: 1px !important;
            border: none;
            margin: 0px;
            padding: 0px;
        }

        QSplitter::handle:hover {
            background: rgba(255, 255, 255, 0.08);
            width: 1px !important;
        }
        """

        # Vorhandenes Stylesheet erweitern, nicht überschreiben
        current_style = mw.styleSheet()
        mw.setStyleSheet(current_style + style)
        print("✅ Resize Handle: 1px dezent")
    except Exception as e:
        print(f"⚠️ Fehler beim Verstecken des Splitters: {e}")

def _init_embedding_manager():
    """Initialize EmbeddingManager for semantic search (called after profile load)"""
    global _embedding_manager
    try:
        try:
            from .embedding_manager import EmbeddingManager
        except ImportError:
            from embedding_manager import EmbeddingManager

        try:
            from .config import is_backend_mode, get_backend_url, get_auth_token
        except ImportError:
            from config import is_backend_mode, get_backend_url, get_auth_token

        config = mw.addonManager.getConfig(__name__) or {}
        api_key = config.get('api_key', '')

        backend_url = None
        auth_headers_fn = None
        if is_backend_mode() and get_auth_token():
            backend_url = get_backend_url()
            auth_headers_fn = lambda: {"Authorization": f"Bearer {get_auth_token()}"}

        _embedding_manager = EmbeddingManager(
            api_key=api_key,
            backend_url=backend_url,
            auth_headers_fn=auth_headers_fn
        )
        _embedding_manager.load_index()

        # Start background embedding after a delay to not slow down startup
        def get_all_cards():
            if not mw or not mw.col:
                return []
            card_ids = mw.col.find_cards("")
            cards = []
            for cid in card_ids[:10000]:  # Limit to prevent memory issues
                try:
                    card = mw.col.get_card(cid)
                    note = card.note()
                    cards.append({
                        'card_id': cid,
                        'question': note.fields[0] if note.fields else '',
                        'answer': note.fields[1] if len(note.fields) > 1 else '',
                        'tags': note.tags,
                    })
                except Exception:
                    continue
            return cards

        QTimer.singleShot(10000, lambda: _embedding_manager.start_background_embedding(get_all_cards))

        print(f"EmbeddingManager initialized")
    except Exception as e:
        print(f"EmbeddingManager initialization failed: {e}")
        _embedding_manager = None


def init_addon():
    """Initialisiert das Addon nach dem Laden des Profils"""
    if mw is None:
        return

    # Migrate sessions.json → SQLite (one-time, on first load)
    try:
        from .card_sessions_storage import migrate_from_json
        migrate_from_json()
    except Exception as e:
        print(f"Card sessions migration skipped: {e}")

    # Proaktiver Token-Refresh beim Startup + periodischer Refresh
    def _startup_token_refresh():
        try:
            from .config import get_auth_token, get_refresh_token, is_backend_mode
            from .ai_handler import get_ai_handler
        except ImportError:
            from config import get_auth_token, get_refresh_token, is_backend_mode
            from ai_handler import get_ai_handler

        if not (is_backend_mode() and get_refresh_token()):
            return

        handler = get_ai_handler()
        if handler._ensure_valid_token():
            print("✅ Startup: Token ist gültig")
        else:
            print("⚠️ Startup: Token abgelaufen, Refresh versucht")

        # Benachrichtige Frontend über aktuellen Auth-Status
        _notify_frontend_auth_status()

    def _notify_frontend_auth_status():
        """Sendet Auth-Status an Frontend (falls WebView bereit)"""
        try:
            from .config import get_auth_token, get_config
        except ImportError:
            from config import get_auth_token, get_config
        config = get_config()
        auth_token = get_auth_token()
        auth_validated = config.get('auth_validated', False)
        if auth_token and auth_validated:
            widget = get_chatbot_widget()
            if widget and getattr(widget, 'web_view', None):
                payload = {"type": "auth_success", "message": "Auto-Login erfolgreich"}
                js_code = f"if (window.ankiReceive) {{ window.ankiReceive({json.dumps(payload)}); }}"
                widget.web_view.page().runJavaScript(js_code)
                print("✅ Startup: Frontend über Auth-Status benachrichtigt")

    def _periodic_token_refresh():
        """Periodischer Token-Refresh alle 30 Minuten"""
        try:
            from .config import get_refresh_token, is_backend_mode
            from .ai_handler import get_ai_handler
        except ImportError:
            from config import get_refresh_token, is_backend_mode
            from ai_handler import get_ai_handler

        if is_backend_mode() and get_refresh_token():
            handler = get_ai_handler()
            handler._ensure_valid_token()

    QTimer.singleShot(3000, _startup_token_refresh)

    # Periodischer Token-Refresh: alle 30 Minuten prüfen
    if not hasattr(mw, '_token_refresh_timer'):
        mw._token_refresh_timer = QTimer(mw)
        mw._token_refresh_timer.timeout.connect(_periodic_token_refresh)
        mw._token_refresh_timer.start(30 * 60 * 1000)  # 30 Minuten

    try:
        mw.addonManager.setWebExports(__name__, r"(web|icons)/.*")
        setup_ui()
        setup_menu()
        setup_global_theme()  # Globales Theme anwenden (styled ALLES)
        hide_splitter_visuals()  # Macht Resize-Handle transparent (Ghost Handle)

        # Enable Custom Reviewer (replaces native Anki reviewer with custom UI)
        # Check config for toggle state
        config = mw.addonManager.getConfig(__name__) or {}
        use_custom_reviewer = config.get("use_custom_reviewer", True)

        # Enable Custom Screens (DeckBrowser + Overview)
        custom_screens.enable()
        QTimer.singleShot(80, custom_screens.refresh_if_visible)
        print("Custom Screens: Enabled on addon init")

        # Fix: If Anki starts directly in deckBrowser state, no state_will_change fires.
        # Explicitly hide toolbar + bottom bar now.
        if getattr(mw, 'state', '') in ('deckBrowser', 'overview'):
            QTimer.singleShot(200, hide_native_toolbar)
            QTimer.singleShot(200, hide_deckbrowser_bottom)
            def _fix_db_margins():
                try:
                    central = mw.centralWidget()
                    if central and central.layout():
                        central.layout().setContentsMargins(0, 0, 0, 0)
                        central.layout().setSpacing(0)
                except Exception:
                    pass
            QTimer.singleShot(200, _fix_db_margins)

        if use_custom_reviewer:
            custom_reviewer.enable()
            print("Custom Reviewer: Enabled on addon init")

            # Patch Reviewer to prevent bottom bar from ever showing
            # This eliminates the flash completely
            try:
                from aqt.reviewer import Reviewer
                _orig_bottom_html = getattr(Reviewer, '_bottomHTML', None)
                def _patched_bottom_html(self):
                    # Return empty bottom — our custom dock replaces it
                    return ""
                Reviewer._bottomHTML = _patched_bottom_html

                # Also patch _showAnswerButton to prevent bottom bar updates
                _orig_show_answer = getattr(Reviewer, '_showAnswerButton', None)
                def _patched_show_answer(self):
                    pass  # No-op — our custom UI handles this
                Reviewer._showAnswerButton = _patched_show_answer

                # CRITICAL: Disable Anki's native Qt keyboard shortcuts
                # Anki registers Space, Enter, 1-4 etc. as QShortcuts which fire
                # BEFORE JavaScript keydown events, stealing all key presses.
                # Our custom JS handles all keyboard interaction.
                _orig_shortcut_keys = getattr(Reviewer, '_shortcutKeys', None)
                def _patched_shortcut_keys(self):
                    # Only keep Ctrl+Z (undo) at Qt level, everything else handled by JS
                    return []
                Reviewer._shortcutKeys = _patched_shortcut_keys

                print("✅ Reviewer bottom bar + shortcuts patched (no flash, JS handles keys)")
            except Exception as e:
                print(f"⚠️ Could not patch reviewer bottom: {e}")

            # Hide native bottom bar on Qt level (backup)
            QTimer.singleShot(500, hide_native_bottom_bar)

            # Hide native top separator on Qt level
            QTimer.singleShot(500, hide_native_top_separator)
            
            # NOTE: Toolbar hiding moved to state_did_change hook
            # to only hide in review state, not globally
        else:
            print("Custom Reviewer: Disabled by config")
            # Ensure native bottom bar is visible if custom reviewer is off
            show_native_bottom_bar()
            show_native_top_separator()
            show_native_toolbar()

        # Keine automatischen Server/Monitoring mehr - User fügt Token manuell ein

        # Initialize EmbeddingManager for semantic search (after other init is done)
        _init_embedding_manager()
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
        # Safe call: Check if window.ankiReceive exists before calling
        js_code = f"""
        (function() {{
          if (typeof window !== 'undefined' && typeof window.ankiReceive === 'function') {{
            try {{
              window.ankiReceive({json.dumps(payload)});
            }} catch (e) {{
              console.error('Error calling window.ankiReceive for deckSelected', e);
            }}
          }} else {{
            // Queue the event if window.ankiReceive is not ready yet
            if (typeof window !== 'undefined') {{
              if (!window._ankiReceiveQueue) {{
                window._ankiReceiveQueue = [];
              }}
              window._ankiReceiveQueue.push({json.dumps(payload)});
            }}
          }}
        }})();
        """
        widget.web_view.page().runJavaScript(js_code)
        print(f"📚 Hook: deckSelected Event gesendet - Deck: {deck_name}, Cards: {total_cards}")
    except Exception as e:
        print(f"Fehler beim Senden von deckSelected Event: {e}")
        import traceback
        traceback.print_exc()

def focus_reviewer_webview():
    """Force focus back to the reviewer webview so keyboard shortcuts work.

    Anki's Qt operations (showing answer, rating) can steal focus from the webview,
    causing JS keydown events to not fire. This forces focus back.
    """
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer and hasattr(mw.reviewer, 'web'):
            web = mw.reviewer.web
            if web and hasattr(web, 'setFocus'):
                web.setFocus()
                # Also ensure the page itself has focus via JS
                web.eval('document.body.focus(); window.focus();')
    except Exception as e:
        print(f"⚠️ Could not focus reviewer webview: {e}")

def on_reviewer_did_show_question(card):
    """Wird aufgerufen, wenn eine Karte im Reviewer angezeigt wird"""
    # Ensure native bottom bar stays hidden (Qt level)
    config = mw.addonManager.getConfig(__name__) or {}
    if config.get("use_custom_reviewer", True):
        hide_native_bottom_bar()
        hide_native_top_separator()
        # CRITICAL: Force focus to webview so keyboard shortcuts work
        QTimer.singleShot(50, focus_reviewer_webview)
        QTimer.singleShot(200, focus_reviewer_webview)

    # Deck-Event senden (nur wenn Widget existiert)
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

def on_reviewer_did_answer_card(reviewer, card, ease):
    """Emit cardResult event to frontend for Plusi dock reactions and streak counting."""
    try:
        correct = ease >= 2  # ease 1 = Again (wrong), 2+ = correct

        # Send to chat panel (React)
        widget = get_chatbot_widget()
        if widget and hasattr(widget, 'web_view') and widget.web_view:
            payload = json.dumps({'type': 'cardResult', 'correct': correct, 'ease': ease})
            widget.web_view.page().runJavaScript(
                f"if (typeof window.ankiReceive === 'function') {{ window.ankiReceive({payload}); }}"
            )

        # Also update Plusi dock in the main webview (reviewer/deckBrowser/overview)
        try:
            from plusi_dock import show_bubble
            if correct:
                show_bubble(None, 'Richtig! ✨', 'happy')
            else:
                show_bubble(None, 'nächstes mal 💪', 'empathy')
        except Exception:
            pass
    except Exception as e:
        print(f"cardResult emission error: {e}")


def on_state_will_change(new_state, old_state):
    """Wird aufgerufen, wenn sich der Anki-State ändert (z.B. review -> deckBrowser)"""
    # Smart Toolbar Management: Hide in Review, Show elsewhere
    config = mw.addonManager.getConfig(__name__) or {}
    if config.get("use_custom_reviewer", True):
        if new_state in ("review", "deckBrowser", "overview"):
            # Entering Review/DeckBrowser/Overview Mode - hide toolbar
            try:
                # Verwende zentrale Funktion (arbeitet nur mit mw.toolbar.web)
                hide_native_toolbar()

                # Force layout recalculation
                central = mw.centralWidget()
                if central and central.layout():
                    central.layout().setContentsMargins(0, 0, 0, 0)
                    central.layout().setSpacing(0)
                    central.layout().update()
                    central.layout().activate()

                # macOS specific: disable unified toolbar
                try:
                    mw.setUnifiedTitleAndToolBarOnMac(False)
                except:
                    pass

                # Try to hide menubar
                try:
                    if hasattr(mw, 'menuBar') and mw.menuBar():
                        mw.menuBar().setVisible(False)
                except:
                    pass

                # Hide DeckBrowser bottom bar when entering deckBrowser
                # Multiple delays: Anki re-shows the bar after full render
                if new_state == "deckBrowser":
                    QTimer.singleShot(150, hide_deckbrowser_bottom)
                    QTimer.singleShot(400, hide_deckbrowser_bottom)
                    QTimer.singleShot(800, hide_deckbrowser_bottom)

                # Hide reviewer bottom bar immediately when entering review
                # Multiple delays because Anki re-creates the bar after render
                if new_state == "review":
                    QTimer.singleShot(50, hide_native_bottom_bar)
                    QTimer.singleShot(200, hide_native_bottom_bar)
                    QTimer.singleShot(500, hide_native_bottom_bar)
                    QTimer.singleShot(1000, hide_native_bottom_bar)

                print(f"🎨 State: {new_state} → Toolbar hidden")
            except Exception as e:
                print(f"⚠️ Error hiding toolbar: {e}")
        # Hide chat panel when leaving review state
        if new_state != "review":
            try:
                from .ui_setup import close_chatbot_panel
                close_chatbot_panel()
            except Exception:
                pass

        if new_state not in ("review", "deckBrowser", "overview"):
            # Leaving custom state - Restore toolbar
            try:
                show_native_toolbar()
                show_native_bottom_bar()
                show_deckbrowser_bottom()

                # Restore layout margins
                central = mw.centralWidget()
                if central and central.layout():
                    central.layout().setContentsMargins(6, 6, 6, 6)  # Anki defaults
                    central.layout().setSpacing(6)
                    central.layout().update()
                    central.layout().activate()

                # Restore menubar
                try:
                    if hasattr(mw, 'menuBar') and mw.menuBar():
                        mw.menuBar().setVisible(True)
                except:
                    pass

                print("🎨 State: {} → Toolbar restored".format(new_state))
            except Exception as e:
                print(f"⚠️ Error restoring toolbar: {e}")
    
    # Original deck-event logic
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

def cleanup_addon():
    """Cleanup when addon is disabled or Anki closes"""
    global _embedding_manager
    try:
        if _embedding_manager:
            _embedding_manager.stop_background_embedding()
            _embedding_manager = None

        show_native_bottom_bar()
        show_native_top_separator()
        show_native_toolbar()
        print("Addon cleanup: Native UI restored")
    except Exception as e:
        print(f"Cleanup error: {e}")

# Hook registrieren (mit Fallback falls Hooks nicht verfügbar sind)
if mw is not None:
    gui_hooks.profile_did_open.append(on_profile_loaded)
    
    # Register cleanup hook
    if hasattr(gui_hooks, 'profile_will_close'):
        gui_hooks.profile_will_close.append(cleanup_addon)
        print("✅ Hook: cleanup_addon registriert")
    
    # Verwende die korrekten Hook-Namen (wie in card_tracker.py)
    if hasattr(gui_hooks, 'reviewer_did_show_question'):
        gui_hooks.reviewer_did_show_question.append(on_reviewer_did_show_question)
        print("✅ Hook: reviewer_did_show_question registriert")
    else:
        print("⚠️ WARNUNG: reviewer_did_show_question Hook nicht verfügbar")

    # Emit cardResult event after card is answered (for Plusi dock reactions)
    if hasattr(gui_hooks, 'reviewer_did_answer_card'):
        gui_hooks.reviewer_did_answer_card.append(on_reviewer_did_answer_card)
        print("✅ Hook: reviewer_did_answer_card registriert (cardResult events)")
    else:
        print("⚠️ WARNUNG: reviewer_did_answer_card Hook nicht verfügbar")

    # Also refocus webview after answer is shown
    if hasattr(gui_hooks, 'reviewer_did_show_answer'):
        def on_reviewer_did_show_answer(card):
            config = mw.addonManager.getConfig(__name__) or {}
            if config.get("use_custom_reviewer", True):
                QTimer.singleShot(50, focus_reviewer_webview)
        gui_hooks.reviewer_did_show_answer.append(on_reviewer_did_show_answer)
        print("✅ Hook: reviewer_did_show_answer registriert (refocus)")
    
    if hasattr(gui_hooks, 'state_will_change'):
        gui_hooks.state_will_change.append(on_state_will_change)
        print("✅ Hook: state_will_change registriert")
    else:
        print("⚠️ WARNUNG: state_will_change Hook nicht verfügbar")
    
    # Premium UI: CSS-Only Styling (robust & kompatibel mit allen Decks)
    # CSS wird in card_tracker.py injiziert
    print("✅ Premium UI: CSS-Only Styling aktiv")
    
    # Falls Profil bereits geladen ist, sofort initialisieren
    if hasattr(mw, 'col') and mw.col is not None:
        QTimer.singleShot(100, init_addon)
