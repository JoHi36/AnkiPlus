"""
Globales Anki-Theming
Styled ALLE Anki-Komponenten über Qt

CRASH-FIX: Keine Timer während der Startphase!
Stattdessen werden gui_hooks verwendet, die erst feuern wenn Anki bereit ist.
"""

from aqt import mw, gui_hooks
from aqt.qt import QTimer, QApplication
import re
import time
import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from .tokens_qt import get_tokens
except ImportError:
    from tokens_qt import get_tokens

try:
    from .theme import get_resolved_theme
except ImportError:
    from theme import get_resolved_theme

# Pre-compiled regex patterns for HTML processing (hot path)
_RE_HR = re.compile(r'<hr[^>]*/?>',  re.IGNORECASE)
_RE_BOTTOM_TABLE = re.compile(
    r'<div[^>]*id=["\']bottom["\'][^>]*>.*?<table[^>]*>.*?</table>.*?</div>',
    re.DOTALL | re.IGNORECASE
)
_RE_TABLE_INNER = re.compile(r'<table[^>]*>.*?</table>', re.DOTALL | re.IGNORECASE)
_RE_AMBOSS_LINKS = re.compile(
    r'<a[^>]*(?:href|title|class|id)=[^>]*(?:amboss|meditricks)[^>]*>.*?</a>',
    re.IGNORECASE | re.DOTALL
)
_RE_AMBOSS_IMGS = re.compile(
    r'<img[^>]*(?:src|alt|title|class|id)=[^>]*(?:amboss|meditricks)[^>]*/?>',
    re.IGNORECASE
)
_RE_AMBOSS_ELEMENTS = re.compile(
    r'<[^>]*(?:class|id|title)=[^>]*(?:amboss|meditricks)[^>]*>.*?</[^>]+>',
    re.IGNORECASE | re.DOTALL
)
_RE_BUTTON = re.compile(r'<button[^>]*>', re.IGNORECASE)
_RE_BUTTON_FIND = re.compile(r'<button[^>]*>.*?</button>', re.DOTALL | re.IGNORECASE)
_RE_INPUT_BUTTON = re.compile(r'<input[^>]*type=["\']button["\'][^>]*>', re.IGNORECASE)
_RE_STYLE_ATTR = re.compile(r'style=["\']([^"\']*)["\']')

# Debug-Start-Zeit für Crash-Analyse
_startup_time = time.time()

# #region agent log
_DEBUG_LOG_PATH = None  # Disabled — set to a path to enable debug logging

def _write_debug_log(hypothesis_id, location, message, data=None):
    """Schreibt Debug-Log als NDJSON in die Log-Datei"""
    if not _DEBUG_LOG_PATH:
        return
    try:
        elapsed = time.time() - _startup_time
        log_entry = {
            "timestamp": int(time.time() * 1000),
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "elapsed_seconds": round(elapsed, 3),
            "data": data or {}
        }
        with open(_DEBUG_LOG_PATH, "a") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        logger.error("[DEBUG LOG ERROR] %s", e)
# #endregion

def _debug_log(msg):
    """Debug-Logging mit Zeitstempel seit Start"""
    elapsed = time.time() - _startup_time
    logger.debug("[THEME DEBUG %.3fs] %s", elapsed, msg)

# Globale Flagge: Ist die Anwendung noch aktiv?
_app_running = True
_app_initialized = False
_theme_applied = False  # NEU: Wurde das Theme schon angewendet?
_continuous_restyle_timer = None
_timers = []


def is_qapplication_valid():
    """
    Prüft SICHER ob QApplication noch gültig und benutzbar ist.
    """
    try:
        app = QApplication.instance()
        if app is None:
            return False
        
        try:
            name = app.applicationName()
            pid = app.applicationPid()
            widgets = app.allWidgets()
            widget_count = len(widgets) if widgets else 0
            
            if widget_count == 0:
                return False
            
            if app.closingDown():
                return False
            
            return True
        except (RuntimeError, AttributeError, TypeError, OSError):
            return False
    except Exception:
        return False


def is_main_window_valid():
    """
    Prüft SICHER ob das Main Window noch gültig und benutzbar ist.
    """
    try:
        if mw is None:
            return False
        
        try:
            visible = mw.isVisible()
            name = mw.objectName()
            width = mw.width()
            height = mw.height()
            
            if width == 0 or height == 0:
                return False
            
            return True
        except (RuntimeError, AttributeError, TypeError):
            return False
    except Exception:
        return False


def stop_all_timers():
    """Stoppt alle aktiven Timer"""
    global _timers, _app_running
    _debug_log("🛑 stop_all_timers() aufgerufen")
    _app_running = False
    stopped_count = 0
    for timer in _timers:
        try:
            if timer and timer.isActive():
                timer.stop()
                timer.deleteLater()
                stopped_count += 1
        except (RuntimeError, AttributeError):
            pass
    _timers.clear()
    _debug_log(f"🛑 {stopped_count} Timer gestoppt")


def create_safe_timer(ms, callback):
    """
    Erstellt einen Timer NUR wenn die App komplett initialisiert ist.
    KRITISCH: Wird NICHT während der Startphase aufgerufen!
    """
    global _timers, _app_running, _app_initialized
    
    if not _app_running or not _app_initialized:
        return None
    
    if not is_qapplication_valid():
        _app_running = False
        return None
    
    timer = QTimer()
    timer.setSingleShot(True)
    
    def safe_callback():
        global _app_running
        
        if not _app_running:
            return
        
        if not is_qapplication_valid():
            _app_running = False
            return
        if not is_main_window_valid():
            return
        
        try:
            callback()
        except RuntimeError as e:
            _app_running = False
            _debug_log(f"❌ Timer callback RuntimeError: {e}")
        except Exception as e:
            _debug_log(f"❌ Timer callback failed: {e}")
    
    timer.timeout.connect(safe_callback)
    timer.start(ms)
    _timers.append(timer)
    return timer


def remove_logo_widgets():
    """Entfernt AMBOSS und Meditricks Logos aus der Toolbar"""
    if not mw:
        return
    
    try:
        from aqt.qt import QToolBar, QWidget, QToolButton, QLabel, QAction
        
        toolbars = mw.findChildren(QToolBar)
        all_widgets = mw.findChildren(QWidget)
        
        for toolbar in toolbars:
            actions = toolbar.actions()
            for action in actions:
                if action.text():
                    text_upper = action.text().upper()
                    if 'AMBOSS' in text_upper or 'MEDITRICKS' in text_upper:
                        toolbar.removeAction(action)
        
        removed_count = 0
        for widget in all_widgets:
            try:
                if not widget or not hasattr(widget, '__class__'):
                    continue
                
                text = ''
                try:
                    if hasattr(widget, 'text'):
                        text = (widget.text() or '') + ' '
                except RuntimeError:
                    continue
                try:
                    if hasattr(widget, 'toolTip'):
                        text += (widget.toolTip() or '') + ' '
                except RuntimeError:
                    continue
                try:
                    if hasattr(widget, 'objectName'):
                        text += (widget.objectName() or '') + ' '
                except RuntimeError:
                    continue
            except RuntimeError:
                continue
            except Exception:
                continue
            
            text_upper = text.upper()
            if ('AMBOSS' in text_upper or 'MEDITRICKS' in text_upper) and text.strip():
                try:
                    widget.hide()
                    widget.setVisible(False)
                    widget.setParent(None)
                    removed_count += 1
                except Exception:
                    pass
    except Exception:
        pass


def apply_global_dark_theme():
    """Wendet ein globales dunkles Theme auf ALLE Anki-Komponenten an"""
    global _app_running, _app_initialized, _theme_applied
    
    if not _app_running:
        return
    
    if not _app_initialized:
        return
    
    if not is_qapplication_valid():
        _app_running = False
        return
    
    if not is_main_window_valid():
        return
    
    try:
        remove_logo_widgets()
    except Exception:
        pass
    
    _t = get_tokens(get_resolved_theme())
    global_stylesheet = f"""
    /* ============================================
       GLOBAL: Alle Widgets
       ============================================ */

    QWidget {{
        background-color: {_t['bg_canvas']};
        color: rgba(255, 255, 255, 0.9);
    }}

    QMainWindow {{
        background-color: {_t['bg_canvas']};
    }}

    /* ============================================
       TOOLBAR (oben) - ULTRA AGGRESSIV
       ============================================ */

    QToolBar,
    QToolBar *,
    QMainWindow QToolBar,
    QMainWindow QToolBar * {{
        background-color: {_t['bg_canvas']} !important;
        background: {_t['bg_canvas']} !important;
        border: none !important;
        border-top: none !important;
        border-bottom: none !important;
        spacing: 3px;
        padding: 4px;
    }}

    /* Ghost UI: Flache, transparente Buttons */
    QToolButton,
    QToolBar QToolButton,
    QMainWindow QToolBar QToolButton {{
        background: transparent !important;
        border: none !important;
        border-radius: 6px !important;
        padding: 8px 12px !important;
        color: {_t['text_secondary']} !important;
        font-size: 14px;
        font-weight: 500;
        min-width: 40px;
        min-height: 40px;
    }}

    QToolButton:hover,
    QToolBar QToolButton:hover {{
        background: rgba(255, 255, 255, 0.05) !important;
        color: #ffffff !important;
    }}

    QToolButton:pressed {{
        background: rgba(255, 255, 255, 0.03) !important;
    }}

    /* Icon-ähnliche Buttons - kompakter */
    QToolButton[text*="Stapelübersicht"],
    QToolButton[text*="Hinzufügen"],
    QToolButton[text*="Kartenverwaltung"],
    QToolButton[text*="Statistiken"],
    QToolButton[text*="Synchronisieren"] {{
        padding: 8px !important;
        min-width: 40px !important;
        min-height: 40px !important;
    }}

    /* Logos: Dimmed by default */
    QLabel[objectName*="amboss"],
    QLabel[objectName*="AMBOSS"],
    QLabel[objectName*="meditricks"],
    QLabel[objectName*="Meditricks"],
    QToolButton[text*="AMBOSS"],
    QToolButton[text*="Meditricks"] {{
        opacity: 0.5;
    }}

    QLabel[objectName*="amboss"]:hover,
    QLabel[objectName*="AMBOSS"]:hover,
    QLabel[objectName*="meditricks"]:hover,
    QLabel[objectName*="Meditricks"]:hover,
    QToolButton[text*="AMBOSS"]:hover,
    QToolButton[text*="Meditricks"]:hover {{
        opacity: 1.0;
    }}

    /* ============================================
       MENUBAR (ganz oben)
       ============================================ */

    QMenuBar {{
        background-color: {_t['bg_canvas']};
        color: rgba(255, 255, 255, 0.9);
        border: none;
    }}

    QMenuBar::item {{
        background-color: transparent;
        padding: 4px 12px;
    }}

    QMenuBar::item:selected {{
        background-color: rgba(255, 255, 255, 0.1);
    }}

    QMenu {{
        background-color: {_t['bg_canvas']};
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }}

    QMenu::item:selected {{
        background-color: rgba(255, 255, 255, 0.1);
    }}

    /* ============================================
       STATUSBAR (unten)
       ============================================ */

    QStatusBar {{
        background-color: {_t['bg_canvas']};
        color: rgba(255, 255, 255, 0.7);
        border: none;
    }}

    /* ============================================
       BUTTONS (alle)
       ============================================ */

    QPushButton {{
        background-color: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 6px 16px;
        color: rgba(255, 255, 255, 0.95);
        font-weight: 500;
    }}

    QPushButton:hover {{
        background-color: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.18);
    }}

    QPushButton:pressed {{
        background-color: rgba(255, 255, 255, 0.06);
    }}

    /* ============================================
       SPLITTER (Resize-Handles)
       ============================================ */

    QSplitter::handle {{
        background: rgba(255, 255, 255, 0.04);
        width: 1px;
        border: none;
        margin: 0px;
        padding: 0px;
    }}

    QSplitter::handle:hover {{
        background: rgba(255, 255, 255, 0.08);
        width: 1px;
    }}

    QMainWindow::separator {{
        background: rgba(255, 255, 255, 0.04);
        width: 1px;
        border: none;
        margin: 0px;
        padding: 0px;
    }}

    QMainWindow::separator:hover {{
        background: rgba(255, 255, 255, 0.08);
        width: 1px;
    }}

    /* ============================================
       DOCK WIDGETS
       ============================================ */

    QDockWidget {{
        background-color: {_t['bg_canvas']};
        color: rgba(255, 255, 255, 0.9);
        titlebar-close-icon: none;
        titlebar-normal-icon: none;
    }}

    QDockWidget::title {{
        background-color: rgba(255, 255, 255, 0.03);
        padding: 8px;
    }}

    /* ============================================
       SCROLLBARS
       ============================================ */

    QScrollBar:vertical {{
        background: {_t['bg_canvas']};
        width: 8px;
        margin: 0;
    }}

    QScrollBar::handle:vertical {{
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        min-height: 20px;
    }}

    QScrollBar::handle:vertical:hover {{
        background: rgba(255, 255, 255, 0.25);
    }}

    QScrollBar::add-line:vertical,
    QScrollBar::sub-line:vertical {{
        height: 0px;
    }}

    QScrollBar:horizontal {{
        background: {_t['bg_canvas']};
        height: 8px;
        margin: 0;
    }}

    QScrollBar::handle:horizontal {{
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        min-width: 20px;
    }}

    QScrollBar::handle:horizontal:hover {{
        background: rgba(255, 255, 255, 0.25);
    }}

    /* ============================================
       INPUT FIELDS
       ============================================ */

    QLineEdit, QTextEdit, QPlainTextEdit {{
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 6px;
        color: rgba(255, 255, 255, 0.95);
    }}

    QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus {{
        border-color: rgba(20, 184, 166, 0.5);
        background-color: rgba(255, 255, 255, 0.08);
    }}

    /* ============================================
       TABLES & LISTS
       ============================================ */

    QTableWidget, QListWidget, QTreeWidget {{
        background-color: {_t['bg_canvas']};
        alternate-background-color: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.9);
    }}

    QHeaderView::section {{
        background-color: rgba(255, 255, 255, 0.05);
        border: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px;
        color: rgba(255, 255, 255, 0.9);
    }}

    /* ============================================
       TABS
       ============================================ */

    QTabWidget::pane {{
        background-color: {_t['bg_canvas']};
        border: 1px solid rgba(255, 255, 255, 0.08);
    }}

    QTabBar::tab {{
        background-color: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.7);
    }}

    QTabBar::tab:selected {{
        background-color: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.95);
    }}

    QTabBar::tab:hover {{
        background-color: rgba(255, 255, 255, 0.06);
    }}
    """
    
    try:
        _debug_log("🎨 apply_global_dark_theme() START")
        _write_debug_log("B", "apply_global_dark_theme:entry", "Function entered", {
            "_app_running": _app_running, 
            "_app_initialized": _app_initialized,
            "_theme_applied": _theme_applied
        })
        
        if not _app_running:
            _debug_log("🎨 ABBRUCH: _app_running=False")
            return
            
        if not is_qapplication_valid():
            _debug_log("🎨 ABBRUCH: QApplication nicht valid")
            _app_running = False
            return
        
        app = QApplication.instance()
        if not app:
            _debug_log("🎨 ABBRUCH: QApplication.instance() ist None")
            _app_running = False
            return
        
        _debug_log("🎨 ALLE CHECKS BESTANDEN - setStyleSheet() wird aufgerufen...")
        _write_debug_log("B", "apply_global_dark_theme:pre_setStyleSheet", "About to call setStyleSheet", {
            "stylesheet_length": len(global_stylesheet)
        })
        
        try:
            app.setStyleSheet(global_stylesheet)
            _write_debug_log("B", "apply_global_dark_theme:post_setStyleSheet", "setStyleSheet SUCCESS", {})
            _debug_log("✅ QApplication.setStyleSheet() erfolgreich!")
            _theme_applied = True
        except RuntimeError as e:
            _app_running = False
            _debug_log(f"❌ QApplication.setStyleSheet() RuntimeError: {e}")
            _write_debug_log("B", "apply_global_dark_theme:error", f"RuntimeError: {e}", {})
            return
        except Exception as e:
            _app_running = False
            _debug_log(f"❌ QApplication.setStyleSheet() Exception: {e}")
            _write_debug_log("B", "apply_global_dark_theme:error", f"Exception: {e}", {})
            return
        
        if not is_main_window_valid():
            return
        
        try:
            mw.setStyleSheet(global_stylesheet)
        except (RuntimeError, AttributeError) as e:
            _debug_log(f"⚠️ mw.setStyleSheet() fehlgeschlagen: {e}")
        
        from aqt.qt import QToolBar, QMenuBar, QStatusBar, QWidget, QPalette, QColor

        _bg = QColor(_t['bg_canvas'])

        try:
            for toolbar in mw.findChildren(QToolBar):
                try:
                    _ = toolbar.isVisible()
                    toolbar.setStyleSheet(global_stylesheet)
                    palette = toolbar.palette()
                    palette.setColor(QPalette.ColorRole.Window, _bg)
                    palette.setColor(QPalette.ColorRole.Button, _bg)
                    palette.setColor(QPalette.ColorRole.Base, _bg)
                    palette.setColor(QPalette.ColorRole.WindowText, QColor(255, 255, 255, 230))
                    toolbar.setPalette(palette)
                    toolbar.setAutoFillBackground(True)
                except (RuntimeError, AttributeError):
                    continue
        except (RuntimeError, AttributeError):
            pass

        try:
            for menubar in mw.findChildren(QMenuBar):
                try:
                    _ = menubar.isVisible()
                    menubar.setStyleSheet(global_stylesheet)
                    palette = menubar.palette()
                    palette.setColor(QPalette.ColorRole.Window, _bg)
                    palette.setColor(QPalette.ColorRole.WindowText, QColor(255, 255, 255, 230))
                    menubar.setPalette(palette)
                    menubar.setAutoFillBackground(True)
                except (RuntimeError, AttributeError):
                    continue
        except (RuntimeError, AttributeError):
            pass

        try:
            for statusbar in mw.findChildren(QStatusBar):
                try:
                    _ = statusbar.isVisible()
                    statusbar.setStyleSheet(global_stylesheet)
                    palette = statusbar.palette()
                    palette.setColor(QPalette.ColorRole.Window, _bg)
                    statusbar.setPalette(palette)
                    statusbar.setAutoFillBackground(True)
                except (RuntimeError, AttributeError):
                    continue
        except (RuntimeError, AttributeError):
            pass

        try:
            main_palette = mw.palette()
            main_palette.setColor(QPalette.ColorRole.Window, _bg)
            main_palette.setColor(QPalette.ColorRole.Base, _bg)
            main_palette.setColor(QPalette.ColorRole.Button, _bg)
            mw.setPalette(main_palette)
            mw.setAutoFillBackground(True)
        except (RuntimeError, AttributeError):
            pass
                
    except Exception as e:
        logger.exception("❌ Fehler beim Anwenden des Themes: %s", e)


def on_webview_will_set_content(web_content, context):
    """Hook: Wird aufgerufen, bevor Content in ein WebView geladen wird"""
    try:
        is_reviewer = False
        if hasattr(context, 'view'):
            view = context.view
            view_class = str(view.__class__)
            is_reviewer = 'Reviewer' in view_class
        
        has_body = hasattr(web_content, 'body') and getattr(web_content, 'body', None)
        has_html = hasattr(web_content, 'html') and getattr(web_content, 'html', None)
        
        if (is_reviewer or has_body or has_html) and (has_body or has_html):
            if has_body:
                html = web_content.body
            elif has_html:
                html = web_content.html
            else:
                html = ''
            
            html = _RE_HR.sub('', html)

            def remove_table_keep_buttons(match):
                table_content = match.group(0)
                buttons = _RE_BUTTON_FIND.findall(table_content)
                buttons += _RE_INPUT_BUTTON.findall(table_content)
                return ''.join(buttons) if buttons else ''

            html = _RE_BOTTOM_TABLE.sub(
                lambda m: _RE_TABLE_INNER.sub(remove_table_keep_buttons, m.group(0)),
                html
            )

            html = _RE_AMBOSS_LINKS.sub('', html)
            html = _RE_AMBOSS_IMGS.sub('', html)
            html = _RE_AMBOSS_ELEMENTS.sub('', html)

            def style_button(match):
                button = match.group(0)
                if 'style=' in button:
                    button = _RE_STYLE_ATTR.sub(
                        lambda m: f'style="{m.group(1)} background: transparent !important; border: none !important; color: rgba(255, 255, 255, 0.7) !important;"',
                        button
                    )
                else:
                    button = button.replace('>', ' style="background: transparent !important; border: none !important; color: rgba(255, 255, 255, 0.7) !important;">', 1)
                return button

            html = _RE_BUTTON.sub(style_button, html)
            html = _RE_INPUT_BUTTON.sub(style_button, html)
            
            if has_body:
                web_content.body = html
            elif has_html:
                web_content.html = html
        
        _resolved_theme = get_resolved_theme()
        _wt = get_tokens(_resolved_theme)
        _text_color = "rgba(255, 255, 255, 0.9)" if _resolved_theme == "dark" else "rgba(0, 0, 0, 0.85)"
        web_content.head += f"""
        <style>
        html, body {{
            background-color: {_wt['bg_canvas']} !important;
            color: {_text_color} !important;
        }}
        </style>
        """

        web_content.head += f"""
        <script>
        (function() {{
            document.documentElement.setAttribute('data-theme', '{_resolved_theme}');
        }})();
        </script>
        """

        web_content.head += """
        <script>
        (function() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initEarlyStyling);
            } else {
                initEarlyStyling();
            }
            
            function initEarlyStyling() {
                function removeLine() {
                    const bottom = document.getElementById('bottom');
                    if (bottom) {
                        bottom.style.borderTop = 'none';
                        bottom.style.paddingTop = '0';
                        bottom.style.marginTop = '0';
                    }
                    document.querySelectorAll('hr').forEach(hr => hr.remove());
                }
                
                function styleButtons() {
                    document.querySelectorAll('#bottom button, #bottom input[type="button"]').forEach(btn => {
                        btn.style.background = 'transparent';
                        btn.style.backgroundColor = 'transparent';
                        btn.style.border = 'none';
                        btn.style.color = 'rgba(255, 255, 255, 0.7)';
                        btn.style.padding = '10px 20px';
                        btn.style.borderRadius = '8px';
                    });
                }
                
                function removeLogos() {
                    document.querySelectorAll('a[href*="amboss" i], a[href*="meditricks" i], img[src*="amboss" i], img[src*="meditricks" i]').forEach(el => el.remove());
                    document.querySelectorAll('*').forEach(el => {
                        const text = el.textContent || '';
                        if ((/^amboss$/i.test(text.trim()) || /^meditricks$/i.test(text.trim())) && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.tagName === 'SPAN')) {
                            el.remove();
                        }
                    });
                }
                
                removeLine();
                styleButtons();
                removeLogos();
                
                setTimeout(() => {
                    removeLine();
                    styleButtons();
                    removeLogos();
                }, 100);
            }
        })();
        </script>
        """
    except Exception as e:
        _debug_log(f"⚠️ Fehler bei HTML-Modifikation: {e}")
        _resolved_theme = get_resolved_theme()
        _wt = get_tokens(_resolved_theme)
        _text_color = "rgba(255, 255, 255, 0.9)" if _resolved_theme == "dark" else "rgba(0, 0, 0, 0.85)"
        web_content.head += f"""
        <style>
        html, body {{
            background-color: {_wt['bg_canvas']} !important;
            color: {_text_color} !important;
        }}
        </style>
        <script>
        (function() {{ document.documentElement.setAttribute('data-theme', '{_resolved_theme}'); }})();
        </script>
        """


def on_state_change(new_state, old_state):
    """
    Hook: Wird bei jedem State-Change aufgerufen.
    KRITISCH: Dies ist unser SICHERER Einstiegspunkt - keine Timer nötig!
    """
    global _app_running, _app_initialized, _theme_applied
    
    elapsed = time.time() - _startup_time
    _debug_log(f"🔄 State Change: {old_state} → {new_state} (nach {elapsed:.2f}s)")
    _write_debug_log("C", "on_state_change", f"State change: {old_state} -> {new_state}", {
        "elapsed": elapsed,
        "_app_initialized": _app_initialized,
        "_theme_applied": _theme_applied
    })
    
    if not _app_running:
        return
    
    # Prüfe ob Anki noch gültig ist
    if not is_qapplication_valid():
        _app_running = False
        return
    
    if not is_main_window_valid():
        return
    
    # KRITISCH: Erste echte Initialisierung beim ersten State-Change
    # Dies ist SICHER, weil state_did_change nur feuert wenn Anki bereit ist!
    if not _app_initialized:
        _debug_log("✅ ERSTE INITIALISIERUNG via state_did_change Hook")
        _write_debug_log("C", "on_state_change:first_init", "First initialization triggered", {"elapsed": elapsed})
        _app_initialized = True
    
    # Theme anwenden (sofort, ohne Timer!)
    try:
        apply_global_dark_theme()
    except Exception as e:
        _debug_log(f"⚠️ apply_global_dark_theme() failed: {e}")
    
    # Nach erfolgreicher Initialisierung: Starte kontinuierliches Restyling
    if _theme_applied and _app_initialized:
        start_continuous_restyle()


def start_continuous_restyle():
    """Startet das kontinuierliche Restyling (nur nach erfolgreicher Initialisierung)"""
    global _continuous_restyle_timer, _app_running, _app_initialized
    
    # Nur einmal starten
    if _continuous_restyle_timer is not None:
        return
    
    if not _app_running or not _app_initialized:
        return
    
    def continuous_restyle():
        global _app_running, _app_initialized, _continuous_restyle_timer
        
        if not _app_running or not _app_initialized:
            return
        
        if not is_qapplication_valid() or not is_main_window_valid():
            _app_running = False
            return
        
        try:
            apply_global_dark_theme()
            
            if _app_running and _app_initialized:
                _continuous_restyle_timer = create_safe_timer(15000, continuous_restyle)
        except Exception as e:
            _app_running = False
            _debug_log(f"❌ Continuous restyle stopped: {e}")
    
    _debug_log("🎨 Starte kontinuierliches Restyling...")
    _continuous_restyle_timer = create_safe_timer(15000, continuous_restyle)


def setup_global_theme():
    """
    Initialisiert das globale Theme.
    
    CRASH-FIX: Wir erstellen KEINE Timer während der Startphase!
    Stattdessen warten wir auf den state_did_change Hook, der erst feuert
    wenn Anki wirklich bereit ist.
    """
    global _app_running, _app_initialized, _startup_time, _theme_applied
    
    _startup_time = time.time()
    _app_running = True
    _app_initialized = False  # Wird erst bei state_did_change auf True gesetzt
    _theme_applied = False
    
    _write_debug_log("C", "setup_global_theme:entry", "Theme setup started - NO TIMERS", {})
    _debug_log("🎨 ===== GLOBAL THEME SETUP (CRASH-SAFE) =====")
    _debug_log("🎨 KEINE Timer während Startphase - warte auf state_did_change Hook")
    
    # Hook für WebView-Content
    try:
        gui_hooks.webview_will_set_content.append(on_webview_will_set_content)
        _debug_log("  ✅ webview_will_set_content Hook registriert")
    except Exception as e:
        _debug_log(f"  ⚠️ webview_will_set_content Hook fehlgeschlagen: {e}")
    
    # Hook für State-Changes - DAS ist unser sicherer Einstiegspunkt!
    try:
        gui_hooks.state_did_change.append(on_state_change)
        _debug_log("  ✅ state_did_change Hook registriert (HAUPTEINSTIEGSPUNKT)")
    except Exception as e:
        _debug_log(f"  ⚠️ state_did_change Hook fehlgeschlagen: {e}")
    
    # Hook für Cleanup beim Schließen
    def cleanup_theme():
        """Stoppt alle Timer und setzt Flagge beim Schließen der Anwendung"""
        global _app_running, _app_initialized, _continuous_restyle_timer
        
        _app_running = False
        _app_initialized = False
        
        stop_all_timers()
        
        if _continuous_restyle_timer:
            try:
                _continuous_restyle_timer.stop()
                _continuous_restyle_timer.deleteLater()
            except (RuntimeError, AttributeError):
                pass
            _continuous_restyle_timer = None
        
        _debug_log("🛑 Global Theme Cleanup: Alle Timer gestoppt")
    
    # Registriere Cleanup-Hook
    try:
        if hasattr(gui_hooks, 'profile_will_close'):
            gui_hooks.profile_will_close.append(cleanup_theme)
    except (AttributeError,):
        pass

    try:
        if hasattr(gui_hooks, 'unload_profile_cleanup'):
            gui_hooks.unload_profile_cleanup.append(cleanup_theme)
    except (AttributeError,):
        pass

    try:
        if hasattr(gui_hooks, 'main_window_will_close'):
            gui_hooks.main_window_will_close.append(cleanup_theme)
    except (AttributeError,):
        pass
    
    _debug_log("✅ Global Theme Setup abgeschlossen (wartend auf ersten State-Change)")
