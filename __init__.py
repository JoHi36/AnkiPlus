"""
Anki Chatbot Addon
Ein Chatbot mit moderner Web-UI (HTML/CSS/JS via QWebEngineView)
"""

from aqt import mw
from aqt.qt import QTimer
from aqt import gui_hooks
import json

try:
    from .utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Timing constants
# ---------------------------------------------------------------------------
EMBEDDING_INIT_DELAY_MS = 10_000    # Delay before starting background embedding (avoids slowing startup)
STARTUP_TOKEN_REFRESH_MS = 3_000    # Delay before first token refresh check after profile load
TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000  # Periodic token refresh interval (30 minutes)
MAIN_VIEW_INIT_DELAY_MS = 200       # Delay before first MainViewWidget show (Anki init timing)
STATE_CHANGE_DECK_DELAY_MS = 300    # Delay before sending deckSelected after state change (reviewer init timing)
INIT_ADDON_LATE_DELAY_MS = 100      # Delay for init_addon when profile was already loaded at import time

# Global EmbeddingManager instance
_embedding_manager = None


def get_embedding_manager():
    return _embedding_manager

# UI-Setup Import
try:
    from .ui.setup import setup_ui, setup_menu, get_chatbot_widget
except ImportError:
    from ui.setup import setup_ui, setup_menu, get_chatbot_widget

# Global Theme Import
try:
    from .ui.global_theme import setup_global_theme
except ImportError:
    from ui.global_theme import setup_global_theme

# Custom Reviewer Import
try:
    from .custom_reviewer import custom_reviewer
except ImportError:
    from custom_reviewer import custom_reviewer

# MainViewWidget Import (replaces custom_screens)
try:
    from .ui.main_view import get_main_view, show_main_view
except ImportError:
    from ui.main_view import get_main_view, show_main_view

# ── Early class-level patches (MUST run at import time, before first render) ──
# Anki renders DeckBrowser during profile load, BEFORE profile_did_open fires.
# If we patch inside init_addon(), we're too late for the initial render.
try:
    from aqt.deckbrowser import DeckBrowser as _DB
    _DB._orig_drawButtons = _DB._drawButtons
    _DB._drawButtons = lambda self: None
except (AttributeError, ImportError) as e:
    logger.debug("DeckBrowser._drawButtons patch skipped: %s", e)

try:
    from aqt.toolbar import Toolbar as _TB, BottomBar as _BB
    _TB._orig_redraw = _TB.redraw
    def _noop_redraw(self):
        from aqt import gui_hooks
        gui_hooks.top_toolbar_did_redraw(self)
    _TB.redraw = _noop_redraw
    _TB._orig_draw = _TB.draw
    _TB.draw = lambda self, buf="", web_context=None, link_handler=None: None

    # Patch BottomBar.draw to actively HIDE the widget instead of drawing content.
    # This catches ALL bottom bars (DeckBrowser, Overview, Reviewer) and ensures
    # the Qt widget itself is invisible — not just empty.
    _BB._orig_draw = _BB.draw
    def _suppress_bottom_draw(self, buf="", web_context=None, link_handler=None):
        self.web.hide()
        self.web.setFixedHeight(0)
        self.web.setMaximumHeight(0)
    _BB.draw = _suppress_bottom_draw
except (AttributeError, ImportError) as e:
    logger.debug("Toolbar/BottomBar patch skipped: %s", e)

# Hide the Qt widgets as early as possible — state_did_change fires before first paint
def _early_hide_native_ui(*args):
    """Hide toolbar + bottomWeb at every state change."""
    try:
        if mw and hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
            mw.toolbar.web.hide()
            mw.toolbar.web.setFixedHeight(0)
            mw.toolbar.web.setMaximumHeight(0)
    except (AttributeError, RuntimeError) as e:
        logger.debug("_early_hide_native_ui toolbar error: %s", e)
    try:
        if mw and hasattr(mw, 'bottomWeb') and mw.bottomWeb:
            mw.bottomWeb.hide()
            mw.bottomWeb.setFixedHeight(0)
            mw.bottomWeb.setMaximumHeight(0)
    except (AttributeError, RuntimeError) as e:
        logger.debug("_early_hide_native_ui bottomWeb error: %s", e)

gui_hooks.state_did_change.append(_early_hide_native_ui)

# Set dark background on all webviews immediately — prevents native UI flash.
# Without this, mw.web briefly shows the native Anki content (white/gray)
# before custom_screens replaces it with our dark UI.
def _set_dark_backgrounds():
    try:
        from PyQt6.QtGui import QColor, QPalette
        dark = QColor("#1a1a1a")

        # Main webview (shows deckBrowser/overview/reviewer content)
        if hasattr(mw, 'web') and mw.web:
            mw.web.page().setBackgroundColor(dark)

        # Bottom webview
        if hasattr(mw, 'bottomWeb') and mw.bottomWeb:
            mw.bottomWeb.page().setBackgroundColor(dark)

        # Toolbar webview
        if hasattr(mw, 'toolbar') and mw.toolbar and hasattr(mw.toolbar, 'web'):
            mw.toolbar.web.page().setBackgroundColor(dark)

        # Main window + central widget background
        mw.setStyleSheet("QMainWindow { background: #1a1a1a; }")
        central = mw.centralWidget()
        if central:
            p = central.palette()
            p.setColor(QPalette.ColorRole.Window, dark)
            central.setPalette(p)
            central.setAutoFillBackground(True)
    except (AttributeError, RuntimeError, ImportError) as e:
        logger.debug("_set_dark_backgrounds error: %s", e)

QTimer.singleShot(0, _set_dark_backgrounds)

# Permanently suppress mw.bottomWeb — patch show() and adjustHeightToFit()
# so Anki can never make it visible again, regardless of timing.
def _suppress_bottom_web():
    try:
        bw = getattr(mw, 'bottomWeb', None)
        if not bw or getattr(bw, '_suppressed', False):
            return
        bw.hide()
        bw.setFixedHeight(0)
        bw.setMaximumHeight(0)
        bw.setMinimumHeight(0)
        bw.show = lambda: None
        bw.adjustHeightToFit = lambda: None
        bw._suppressed = True
    except (AttributeError, RuntimeError) as e:
        logger.debug("_suppress_bottom_web (bottomWeb) error: %s", e)
    try:
        tw = getattr(mw.toolbar, 'web', None) if hasattr(mw, 'toolbar') and mw.toolbar else None
        if tw and not getattr(tw, '_suppressed', False):
            tw.hide()
            tw.setFixedHeight(0)
            tw.setMaximumHeight(0)
            tw.setMinimumHeight(0)
            tw.show = lambda: None
            tw._suppressed = True
    except (AttributeError, RuntimeError) as e:
        logger.debug("_suppress_bottom_web (toolbar) error: %s", e)

# Burst: try at multiple early moments to catch whenever mw.bottomWeb appears
for _delay in (0, 50, 150, 300):
    QTimer.singleShot(_delay, _suppress_bottom_web)

# UI Manager Import — zentrales Management der nativen Anki-UI-Elemente
try:
    from .ui.manager import (
        hide_native_bottom_bar, show_native_bottom_bar,
        hide_deckbrowser_bottom, show_deckbrowser_bottom,
        hide_native_toolbar, show_native_toolbar,
        hide_native_top_separator, show_native_top_separator,
        hide_splitter_visuals
    )
except ImportError:
    from ui.manager import (
        hide_native_bottom_bar, show_native_bottom_bar,
        hide_deckbrowser_bottom, show_deckbrowser_bottom,
        hide_native_toolbar, show_native_toolbar,
        hide_native_top_separator, show_native_top_separator,
        hide_splitter_visuals
    )

def _init_embedding_manager():
    """Initialize EmbeddingManager for semantic search (called after profile load)"""
    global _embedding_manager
    try:
        try:
            from .ai.embeddings import EmbeddingManager
        except ImportError:
            from ai.embeddings import EmbeddingManager

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
                except (AttributeError, KeyError, IndexError) as card_err:
                    logger.debug("get_all_cards: skipping card %s: %s", cid, card_err)
                    continue
            return cards

        QTimer.singleShot(EMBEDDING_INIT_DELAY_MS, lambda: _embedding_manager.start_background_embedding(get_all_cards))

        logger.info("EmbeddingManager initialized")
    except Exception as e:
        logger.error("EmbeddingManager initialization failed: %s", e)
        _embedding_manager = None


def init_addon():
    """Initialisiert das Addon nach dem Laden des Profils"""
    if mw is None:
        return

    # Migrate sessions.json → SQLite (one-time, on first load)
    try:
        from .storage.card_sessions import migrate_from_json
        migrate_from_json()
    except Exception as e:
        logger.error("Card sessions migration skipped: %s", e)

    # Proaktiver Token-Refresh beim Startup + periodischer Refresh
    def _startup_token_refresh():
        try:
            from .config import get_auth_token, get_refresh_token, is_backend_mode
            from .ai.handler import get_ai_handler
        except ImportError:
            from config import get_auth_token, get_refresh_token, is_backend_mode
            from ai.handler import get_ai_handler

        if not (is_backend_mode() and get_refresh_token()):
            return

        handler = get_ai_handler()
        if handler._ensure_valid_token():
            logger.info("✅ Startup: Token ist gültig")
        else:
            logger.warning("⚠️ Startup: Token abgelaufen, Refresh versucht")

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
                logger.info("✅ Startup: Frontend über Auth-Status benachrichtigt")

    def _periodic_token_refresh():
        """Periodischer Token-Refresh alle 30 Minuten"""
        try:
            from .config import get_refresh_token, is_backend_mode
            from .ai.handler import get_ai_handler
        except ImportError:
            from config import get_refresh_token, is_backend_mode
            from ai.handler import get_ai_handler

        if is_backend_mode() and get_refresh_token():
            handler = get_ai_handler()
            handler._ensure_valid_token()

    QTimer.singleShot(STARTUP_TOKEN_REFRESH_MS, _startup_token_refresh)

    # Periodischer Token-Refresh: alle 30 Minuten prüfen
    if not hasattr(mw, '_token_refresh_timer'):
        mw._token_refresh_timer = QTimer(mw)
        mw._token_refresh_timer.timeout.connect(_periodic_token_refresh)
        mw._token_refresh_timer.start(TOKEN_REFRESH_INTERVAL_MS)  # 30 Minuten

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

        # Initialize MainViewWidget (replaces custom_screens)
        try:
            main_view = get_main_view()
            current_state = getattr(mw, 'state', 'deckBrowser')
            QTimer.singleShot(MAIN_VIEW_INIT_DELAY_MS, lambda: show_main_view(current_state))
            logger.info("MainViewWidget: Initialized")
        except (AttributeError, RuntimeError, ImportError) as e:
            logger.error("Failed to init MainViewWidget: %s", e)

        # Hide toolbar + bottom bar on Qt level (backup to class-level patches)
        hide_native_toolbar()
        if getattr(mw, 'state', '') in ('deckBrowser', 'overview'):
            hide_deckbrowser_bottom()
            def _fix_db_margins():
                try:
                    central = mw.centralWidget()
                    if central and central.layout():
                        central.layout().setContentsMargins(0, 0, 0, 0)
                        central.layout().setSpacing(0)
                except (AttributeError, RuntimeError) as e:
                    logger.debug("_fix_db_margins error: %s", e)
            QTimer.singleShot(MAIN_VIEW_INIT_DELAY_MS, _fix_db_margins)

        # Custom reviewer disabled — ReviewerView in React replaces it
        # custom_reviewer.enable() not called — React renders cards now

        # CRITICAL: Disable Anki's native Qt keyboard shortcuts
        # Anki registers Space, Enter, 1-4 as QShortcuts which fire
        # BEFORE our event filter. React handles all keyboard interaction.
        try:
            from aqt.reviewer import Reviewer
            Reviewer._shortcutKeys = lambda self: []
            Reviewer._bottomHTML = lambda self: ""
            Reviewer._showAnswerButton = lambda self: None
            logger.info("Reviewer shortcuts + bottom bar patched for React ReviewerView")
        except (AttributeError, ImportError) as e:
            logger.error("Could not patch reviewer: %s", e)

            # Class-level patches (DeckBrowser._drawButtons, Toolbar.draw/redraw)
            # are already applied at module import time above.
            # Just hide the Qt widgets as backup for anything already rendered.
            hide_native_bottom_bar()
            hide_native_toolbar()
            
            # NOTE: Toolbar hiding moved to state_did_change hook
            # to only hide in review state, not globally
        else:
            logger.info("Custom Reviewer: Disabled by config")
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
    # Plusi's periodic self-reflection system
    # Timer opens a "window" — next interaction after window opens triggers reflect
    import threading
    import random
    from PyQt6.QtCore import QTimer

    # Global flag: when True, next Plusi interaction will trigger a reflect afterwards
    global _plusi_reflect_pending, _plusi_reflect_lock
    _plusi_reflect_pending = False
    _plusi_reflect_lock = threading.Lock()

    def _plusi_reflect_once():
        """Run one self-reflection cycle in a background thread.
        No-op if Plusi is disabled."""
        try:
            from .plusi.dock import is_plusi_enabled, sync_mood
            if not is_plusi_enabled():
                return
            from .plusi.agent import self_reflect
            sync_mood('reading')
            try:
                self_reflect()
            except (AttributeError, RuntimeError, OSError) as e:
                logger.error("Plusi self-reflect failed: %s", e)
            sync_mood('neutral')
            try:
                from .plusi.panel import notify_new_diary_entry
                notify_new_diary_entry()
            except (AttributeError, ImportError) as e:
                logger.debug("notify_new_diary_entry error: %s", e)
        except Exception as e:
            logger.error("Plusi reflect error: %s", e)

    def _run_guarded_reflect():
        """Run _plusi_reflect_once with a guard to prevent concurrent executions."""
        if not _plusi_reflect_lock.acquire(blocking=False):
            return
        try:
            _plusi_reflect_once()
        finally:
            _plusi_reflect_lock.release()

    def _open_reflect_window():
        """Open the reflection window — next interaction will trigger reflect.
        Skips if Plusi is disabled but still schedules next check."""
        global _plusi_reflect_pending
        try:
            from .plusi.dock import is_plusi_enabled
            if not is_plusi_enabled():
                _schedule_next_window()
                return
        except (AttributeError, ImportError) as e:
            logger.debug("is_plusi_enabled check error: %s", e)
        _plusi_reflect_pending = True
        logger.debug("plusi reflect: window opened, waiting for next interaction")
        # Schedule next window
        _schedule_next_window()

    def _schedule_next_window():
        """Schedule the next reflection window with random 30-60 min interval."""
        interval_ms = random.randint(30, 60) * 60 * 1000
        interval_min = interval_ms // 60000
        logger.debug("plusi reflect: next window in %s min", interval_min)
        QTimer.singleShot(interval_ms, _open_reflect_window)

    def check_and_trigger_reflect():
        """Called after each Plusi interaction. If window is open, trigger reflect."""
        global _plusi_reflect_pending
        if _plusi_reflect_pending and not _plusi_reflect_lock.locked():
            _plusi_reflect_pending = False
            logger.debug("plusi reflect: triggered by interaction")
            threading.Thread(target=_run_guarded_reflect, daemon=True).start()

    # Initial reflect on startup (always, no window needed)
    threading.Thread(target=_run_guarded_reflect, daemon=True).start()
    # Schedule first window
    _schedule_next_window()

    # Start Telegram bot if configured
    try:
        from .plusi.telegram import start_bot
        if start_bot():
            logger.info("Telegram bot started")
    except Exception as e:
        logger.error("Telegram bot start failed: %s", e)

    # Start remote relay if previously paired (auto-reconnect)
    try:
        from .relay import start as start_relay
        start_relay()
    except Exception as e:
        logger.error("Relay start failed: %s", e)

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
        logger.info("📚 Hook: deckSelected Event gesendet - Deck: %s, Cards: %s", deck_name, total_cards)
    except Exception as e:
        logger.exception("Fehler beim Senden von deckSelected Event: %s", e)

def on_reviewer_did_show_question(card):
    """Wird aufgerufen, wenn eine Karte im Reviewer angezeigt wird"""
    # Ensure native bottom bar stays suppressed
    config = mw.addonManager.getConfig(__name__) or {}
    if config.get("use_custom_reviewer", True):
        hide_native_bottom_bar()

    # Send card data to React ReviewerView
    widget = get_chatbot_widget()
    if widget and hasattr(widget, '_send_card_data'):
        try:
            widget._send_card_data(card, is_question=True)
        except (AttributeError, RuntimeError) as e:
            logger.error("reviewer_did_show_question card send error: %s", e)

    # Deck-Event senden (nur wenn Widget existiert)
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
            logger.exception("Fehler beim Senden von Deck-Event: %s", e)

# Alte Logik entfernt - User fügt Token manuell in Profil-Dialog ein

def on_reviewer_did_answer_card(reviewer, card, ease):
    """Emit cardResult event to frontend for Plusi dock reactions and streak counting."""
    try:
        correct = ease >= 2  # ease 1 = Again (wrong), 2+ = correct

        # Record for Plusi's environmental awareness (zero-cost passive sensing)
        try:
            deck = mw.col.decks.get(card.did)
            deck_name = deck['name'] if deck else 'Unknown'
            try:
                from .plusi.storage import record_card_review
            except ImportError:
                from plusi.storage import record_card_review
            record_card_review(deck_name, correct)
        except (AttributeError, ImportError, KeyError) as e:
            logger.debug("plusi awareness tracking error: %s", e)

        # Send to chat panel (React)
        widget = get_chatbot_widget()
        if widget and hasattr(widget, 'web_view') and widget.web_view:
            payload = json.dumps({'type': 'cardResult', 'correct': correct, 'ease': ease})
            widget.web_view.page().runJavaScript(
                f"if (typeof window.ankiReceive === 'function') {{ window.ankiReceive({payload}); }}"
            )

        # Also update Plusi dock in the main webview (reviewer/deckBrowser/overview)
        try:
            from plusi.dock import show_bubble
            if correct:
                show_bubble(None, 'Richtig! ✨', 'happy')
            else:
                show_bubble(None, 'nächstes mal 💪', 'empathy')
        except (AttributeError, ImportError) as e:
            logger.debug("show_bubble error: %s", e)
    except Exception as e:
        logger.error("cardResult emission error: %s", e)


def on_state_will_change(new_state, old_state):
    """Wird aufgerufen, wenn sich der Anki-State ändert (z.B. review -> deckBrowser)"""
    _preview_state = None
    try:
        from .custom_reviewer import _preview_state as _ps
        _preview_state = _ps
        # Auto-close preview if user manually navigates away (not our own transition)
        if _preview_state.get('active', False) and not _preview_state.get('_transitioning', False):
            from .custom_reviewer import close_preview
            close_preview(notify_frontend=True)
            # Don't return — let normal state_will_change logic run
    except (AttributeError, ImportError, KeyError) as e:
        logger.error("Preview state check error: %s", e)

    # Update MainViewWidget for the new state
    try:
        show_main_view(new_state)
    except (AttributeError, RuntimeError) as e:
        logger.warning("MainView state update failed: %s", e)

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
                except (AttributeError, RuntimeError):
                    pass

                # Try to hide menubar
                try:
                    if hasattr(mw, 'menuBar') and mw.menuBar():
                        mw.menuBar().setVisible(False)
                except (AttributeError, RuntimeError):
                    pass

                # Bottom bars: class-level patches prevent drawing,
                # but also suppress the Qt widget as backup
                if new_state == "deckBrowser":
                    hide_deckbrowser_bottom()

                if new_state == "review":
                    hide_native_bottom_bar()

                logger.debug("🎨 State: %s → Toolbar hidden", new_state)
            except (AttributeError, RuntimeError) as e:
                logger.error("⚠️ Error hiding toolbar: %s", e)
        # Hide chat panel when leaving review state
        if new_state != "review":
            # Skip chat panel close if we're in a preview transition
            if not (_preview_state and _preview_state.get('_transitioning', False)):
                try:
                    from .ui.setup import close_chatbot_panel
                    close_chatbot_panel()
                except (AttributeError, RuntimeError, ImportError) as e:
                    logger.debug("close_chatbot_panel error: %s", e)

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
                except (AttributeError, RuntimeError):
                    pass

                logger.debug("State: %s -> Toolbar restored", new_state)
            except (AttributeError, RuntimeError) as e:
                logger.error("⚠️ Error restoring toolbar: %s", e)
    
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
                    except (AttributeError, RuntimeError, json.JSONDecodeError) as e:
                        logger.error("Fehler beim Senden von deckSelected in state_will_change: %s", e)
                
                QTimer.singleShot(STATE_CHANGE_DECK_DELAY_MS, send_deck_selected)
            
            # Wenn State zu "deckBrowser" wechselt, sende deckExited Event
            elif new_state == "deckBrowser":
                payload = {"type": "deckExited", "data": {}}
                widget.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                logger.info("📚 Hook: State zu deckBrowser gewechselt, deckExited Event gesendet")
        except Exception as e:
            logger.exception("Fehler beim Senden von State-Change-Event: %s", e)

def cleanup_addon():
    """Cleanup when addon is disabled or Anki closes"""
    global _embedding_manager
    try:
        if _embedding_manager:
            _embedding_manager.stop_background_embedding()
            _embedding_manager = None

        # Restore addon proxy (uninstall eval wrapper)
        try:
            from .ui.addon_proxy import get_proxy
            get_proxy().uninstall()
        except (AttributeError, ImportError) as e:
            logger.debug("addon_proxy uninstall error: %s", e)

        # Stop remote relay
        try:
            from .relay import stop as stop_relay
            stop_relay()
        except Exception:
            pass

        # Stop Telegram bot
        try:
            from .plusi.telegram import stop_bot
            stop_bot()
        except Exception:
            pass

        show_native_bottom_bar()
        show_native_top_separator()
        show_native_toolbar()
        logger.debug("Addon cleanup: Native UI restored")
    except Exception as e:
        logger.error("Cleanup error: %s", e)

# Hook registrieren (mit Fallback falls Hooks nicht verfügbar sind)
if mw is not None:
    # Addon Proxy — capture JS/CSS injected by other addons (AMBOSS, etc.)
    # Must be registered BEFORE profile_did_open so it captures from first reviewer load
    try:
        from .ui.addon_proxy import get_capture
        gui_hooks.webview_will_set_content.append(get_capture().on_webview_will_set_content)
        logger.info("Addon proxy: content capture hook registered")
    except (AttributeError, ImportError) as e:
        logger.warning("Addon proxy registration failed: %s", e)

    gui_hooks.profile_did_open.append(on_profile_loaded)

    # Register cleanup hook
    if hasattr(gui_hooks, 'profile_will_close'):
        gui_hooks.profile_will_close.append(cleanup_addon)
        logger.info("✅ Hook: cleanup_addon registriert")
    
    # Verwende die korrekten Hook-Namen (wie in card_tracker.py)
    if hasattr(gui_hooks, 'reviewer_did_show_question'):
        gui_hooks.reviewer_did_show_question.append(on_reviewer_did_show_question)
        logger.info("✅ Hook: reviewer_did_show_question registriert")
    else:
        logger.warning("⚠️ WARNUNG: reviewer_did_show_question Hook nicht verfügbar")

    # Emit cardResult event after card is answered (for Plusi dock reactions)
    if hasattr(gui_hooks, 'reviewer_did_answer_card'):
        gui_hooks.reviewer_did_answer_card.append(on_reviewer_did_answer_card)
        logger.info("✅ Hook: reviewer_did_answer_card registriert (cardResult events)")
    else:
        logger.warning("⚠️ WARNUNG: reviewer_did_answer_card Hook nicht verfügbar")

    if hasattr(gui_hooks, 'state_will_change'):
        gui_hooks.state_will_change.append(on_state_will_change)
        logger.info("✅ Hook: state_will_change registriert")
    else:
        logger.warning("⚠️ WARNUNG: state_will_change Hook nicht verfügbar")
    
    # Premium UI: CSS-Only Styling (robust & kompatibel mit allen Decks)
    # CSS wird in card_tracker.py injiziert
    logger.info("✅ Premium UI: CSS-Only Styling aktiv")
    
    # Falls Profil bereits geladen ist, sofort initialisieren
    if hasattr(mw, 'col') and mw.col is not None:
        QTimer.singleShot(INIT_ADDON_LATE_DELAY_MS, init_addon)
