"""
Global Anki theming — styles ALL Anki components via Qt.

Crash-safe: no timers during startup phase.
Uses gui_hooks that fire only when Anki is ready.
"""

from aqt import mw, gui_hooks
from aqt.qt import QTimer, QApplication
import re

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

# Global flags
_app_running = True
_app_initialized = False
_theme_applied = False  # NEU: Wurde das Theme schon angewendet?
_continuous_restyle_timer = None
_timers = []


def is_qapplication_valid():
    """Safely check whether QApplication is still valid and usable."""
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
    except (RuntimeError, AttributeError, TypeError):
        return False


def is_main_window_valid():
    """Safely check whether the main window is still valid and usable."""
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
    except (RuntimeError, AttributeError, TypeError):
        return False


def stop_all_timers():
    """Stop all active timers."""
    global _timers, _app_running
    _app_running = False
    for timer in _timers:
        try:
            if timer and timer.isActive():
                timer.stop()
                timer.deleteLater()
        except (RuntimeError, AttributeError):
            pass
    _timers.clear()


def create_safe_timer(ms, callback):
    """Create a timer only when the app is fully initialized — never during startup."""
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
            logger.error("Timer callback RuntimeError: %s", e)
        except Exception as e:
            logger.error("Timer callback failed: %s", e)
    
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
                except (AttributeError, RuntimeError):
                    pass
    except (AttributeError, RuntimeError):
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
    except Exception as e:
        logger.warning("remove_logo_widgets failed: %s", e)
    
    _resolved = get_resolved_theme()
    _t = get_tokens(_resolved)
    _is_light = _resolved == "light"
    # Adaptive text/border colors for light vs dark
    _text_primary = "rgba(0, 0, 0, 0.85)" if _is_light else "rgba(255, 255, 255, 0.9)"
    _text_secondary = "rgba(60, 60, 67, 0.60)" if _is_light else "rgba(255, 255, 255, 0.7)"
    _text_dim = "rgba(60, 60, 67, 0.30)" if _is_light else "rgba(255, 255, 255, 0.5)"
    _hover_bg = "rgba(0, 0, 0, 0.03)" if _is_light else "rgba(255, 255, 255, 0.05)"
    _active_bg = "rgba(0, 0, 0, 0.06)" if _is_light else "rgba(255, 255, 255, 0.08)"
    _pressed_bg = "rgba(0, 0, 0, 0.04)" if _is_light else "rgba(255, 255, 255, 0.03)"
    _border_subtle = "rgba(0, 0, 0, 0.04)" if _is_light else "rgba(255, 255, 255, 0.04)"
    _border_medium = "rgba(0, 0, 0, 0.10)" if _is_light else "rgba(255, 255, 255, 0.08)"
    _border_input = "rgba(0, 0, 0, 0.10)" if _is_light else "rgba(255, 255, 255, 0.1)"
    _input_bg = "rgba(0, 0, 0, 0.03)" if _is_light else "rgba(255, 255, 255, 0.05)"
    _input_focus_bg = "rgba(0, 0, 0, 0.05)" if _is_light else "rgba(255, 255, 255, 0.08)"
    _scrollbar_handle = "rgba(0, 0, 0, 0.15)" if _is_light else "rgba(255, 255, 255, 0.15)"
    _scrollbar_handle_hover = "rgba(0, 0, 0, 0.25)" if _is_light else "rgba(255, 255, 255, 0.25)"
    _tab_bg = "rgba(0, 0, 0, 0.02)" if _is_light else "rgba(255, 255, 255, 0.03)"
    _tab_selected_bg = "rgba(0, 0, 0, 0.06)" if _is_light else "rgba(255, 255, 255, 0.08)"
    _tab_hover_bg = "rgba(0, 0, 0, 0.04)" if _is_light else "rgba(255, 255, 255, 0.06)"
    _dock_title_bg = "rgba(0, 0, 0, 0.02)" if _is_light else "rgba(255, 255, 255, 0.03)"
    _alt_bg = "rgba(0, 0, 0, 0.02)" if _is_light else "rgba(255, 255, 255, 0.02)"
    _btn_bg = "rgba(0, 0, 0, 0.06)" if _is_light else "rgba(255, 255, 255, 0.08)"
    _btn_hover_bg = "rgba(0, 0, 0, 0.10)" if _is_light else "rgba(255, 255, 255, 0.12)"
    _btn_border = "rgba(0, 0, 0, 0.10)" if _is_light else "rgba(255, 255, 255, 0.12)"
    _btn_hover_border = "rgba(0, 0, 0, 0.15)" if _is_light else "rgba(255, 255, 255, 0.18)"
    _menu_hover = "rgba(0, 0, 0, 0.06)" if _is_light else "rgba(255, 255, 255, 0.1)"
    _menu_border = "rgba(0, 0, 0, 0.08)" if _is_light else "rgba(255, 255, 255, 0.1)"
    global_stylesheet = f"""
    /* ============================================
       GLOBAL: Alle Widgets
       ============================================ */

    QWidget {{
        background-color: {_t['bg_canvas']};
        color: {_text_primary};
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
        background: {_hover_bg} !important;
        color: {_t['text_primary']} !important;
    }}

    QToolButton:pressed {{
        background: {_pressed_bg} !important;
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
        color: {_text_primary};
        border: none;
    }}

    QMenuBar::item {{
        background-color: transparent;
        padding: 4px 12px;
    }}

    QMenuBar::item:selected {{
        background-color: {_menu_hover};
    }}

    QMenu {{
        background-color: {_t['bg_canvas']};
        color: {_text_primary};
        border: 1px solid {_menu_border};
    }}

    QMenu::item:selected {{
        background-color: {_menu_hover};
    }}

    /* ============================================
       STATUSBAR (unten)
       ============================================ */

    QStatusBar {{
        background-color: {_t['bg_canvas']};
        color: {_text_secondary};
        border: none;
    }}

    /* ============================================
       BUTTONS (alle)
       ============================================ */

    QPushButton {{
        background-color: {_btn_bg};
        border: 1px solid {_btn_border};
        border-radius: 6px;
        padding: 6px 16px;
        color: {_text_primary};
        font-weight: 500;
    }}

    QPushButton:hover {{
        background-color: {_btn_hover_bg};
        border-color: {_btn_hover_border};
    }}

    QPushButton:pressed {{
        background-color: {_pressed_bg};
    }}

    /* ============================================
       SPLITTER (Resize-Handles)
       ============================================ */

    QSplitter::handle {{
        background: {_border_subtle};
        width: 1px;
        border: none;
        margin: 0px;
        padding: 0px;
    }}

    QSplitter::handle:hover {{
        background: {_active_bg};
        width: 1px;
    }}

    QMainWindow::separator {{
        background: {_border_subtle};
        width: 1px;
        border: none;
        margin: 0px;
        padding: 0px;
    }}

    QMainWindow::separator:hover {{
        background: {_active_bg};
        width: 1px;
    }}

    /* ============================================
       DOCK WIDGETS
       ============================================ */

    QDockWidget {{
        background-color: {_t['bg_canvas']};
        color: {_text_primary};
        titlebar-close-icon: none;
        titlebar-normal-icon: none;
    }}

    QDockWidget::title {{
        background-color: {_dock_title_bg};
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
        background: {_scrollbar_handle};
        border-radius: 4px;
        min-height: 20px;
    }}

    QScrollBar::handle:vertical:hover {{
        background: {_scrollbar_handle_hover};
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
        background: {_scrollbar_handle};
        border-radius: 4px;
        min-width: 20px;
    }}

    QScrollBar::handle:horizontal:hover {{
        background: {_scrollbar_handle_hover};
    }}

    /* ============================================
       INPUT FIELDS
       ============================================ */

    QLineEdit, QTextEdit, QPlainTextEdit {{
        background-color: {_input_bg};
        border: 1px solid {_border_input};
        border-radius: 4px;
        padding: 6px;
        color: {_text_primary};
    }}

    QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus {{
        border-color: rgba(20, 184, 166, 0.5);
        background-color: {_input_focus_bg};
    }}

    /* ============================================
       TABLES & LISTS
       ============================================ */

    QTableWidget, QListWidget, QTreeWidget {{
        background-color: {_t['bg_canvas']};
        alternate-background-color: {_alt_bg};
        border: 1px solid {_border_medium};
        color: {_text_primary};
    }}

    QHeaderView::section {{
        background-color: {_input_bg};
        border: none;
        border-bottom: 1px solid {_border_input};
        padding: 6px;
        color: {_text_primary};
    }}

    /* ============================================
       TABS
       ============================================ */

    QTabWidget::pane {{
        background-color: {_t['bg_canvas']};
        border: 1px solid {_border_medium};
    }}

    QTabBar::tab {{
        background-color: {_tab_bg};
        border: 1px solid {_border_medium};
        padding: 6px 12px;
        color: {_text_secondary};
    }}

    QTabBar::tab:selected {{
        background-color: {_tab_selected_bg};
        color: {_text_primary};
    }}

    QTabBar::tab:hover {{
        background-color: {_tab_hover_bg};
    }}
    """
    
    try:
        if not _app_running:
            return

        if not is_qapplication_valid():
            _app_running = False
            return

        app = QApplication.instance()
        if not app:
            _app_running = False
            return

        try:
            app.setStyleSheet(global_stylesheet)
            _theme_applied = True
        except RuntimeError as e:
            _app_running = False
            logger.error("QApplication.setStyleSheet() RuntimeError: %s", e)
            return
        except (AttributeError, TypeError) as e:
            _app_running = False
            logger.error("QApplication.setStyleSheet() error: %s", e)
            return

        if not is_main_window_valid():
            return

        try:
            mw.setStyleSheet(global_stylesheet)
        except (RuntimeError, AttributeError) as e:
            logger.warning("mw.setStyleSheet() failed: %s", e)
        
        from aqt.qt import QToolBar, QMenuBar, QStatusBar, QWidget, QPalette, QColor

        _bg = QColor(_t['bg_canvas'])
        _fg = QColor(_t['text_primary'])

        try:
            for toolbar in mw.findChildren(QToolBar):
                try:
                    _ = toolbar.isVisible()
                    toolbar.setStyleSheet(global_stylesheet)
                    palette = toolbar.palette()
                    palette.setColor(QPalette.ColorRole.Window, _bg)
                    palette.setColor(QPalette.ColorRole.Button, _bg)
                    palette.setColor(QPalette.ColorRole.Base, _bg)
                    palette.setColor(QPalette.ColorRole.WindowText, _fg)
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
                    palette.setColor(QPalette.ColorRole.WindowText, _fg)
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
        logger.exception("Failed to apply global theme: %s", e)


def on_webview_will_set_content(web_content, context):
    """Hook: called before content is loaded into a WebView."""
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

            _btn_text_color = "rgba(0, 0, 0, 0.7)" if get_resolved_theme() == "light" else "rgba(255, 255, 255, 0.7)"
            def style_button(match):
                button = match.group(0)
                if 'style=' in button:
                    button = _RE_STYLE_ATTR.sub(
                        lambda m: f'style="{m.group(1)} background: transparent !important; border: none !important; color: {_btn_text_color} !important;"',
                        button
                    )
                else:
                    button = button.replace('>', f' style="background: transparent !important; border: none !important; color: {_btn_text_color} !important;">', 1)
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
                    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
                    var btnColor = isLight ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)';
                    document.querySelectorAll('#bottom button, #bottom input[type="button"]').forEach(btn => {
                        btn.style.background = 'transparent';
                        btn.style.backgroundColor = 'transparent';
                        btn.style.border = 'none';
                        btn.style.color = btnColor;
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
        logger.warning("HTML modification in on_webview_will_set_content failed: %s", e)
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
    """Hook: called on every Anki state change — safe entry point, no timers needed."""
    global _app_running, _app_initialized, _theme_applied

    if not _app_running:
        return

    if not is_qapplication_valid():
        _app_running = False
        return

    if not is_main_window_valid():
        return

    # First real initialization on first state change — safe because state_did_change
    # only fires when Anki is fully ready.
    if not _app_initialized:
        _app_initialized = True

    try:
        apply_global_dark_theme()
    except Exception as e:
        logger.warning("apply_global_dark_theme failed in on_state_change: %s", e)

    if _theme_applied and _app_initialized:
        start_continuous_restyle()


def start_continuous_restyle():
    """Start the continuous restyle timer (only after successful initialization)."""
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
            logger.warning("Continuous restyle stopped due to error: %s", e)

    _continuous_restyle_timer = create_safe_timer(15000, continuous_restyle)


def setup_global_theme():
    """
    Initialize the global theme.

    Crash-safe: no timers during startup. Waits for state_did_change hook,
    which fires only when Anki is fully ready.
    """
    global _app_running, _app_initialized, _theme_applied

    _app_running = True
    _app_initialized = False
    _theme_applied = False

    try:
        gui_hooks.webview_will_set_content.append(on_webview_will_set_content)
    except (AttributeError, TypeError) as e:
        logger.warning("Could not register webview_will_set_content hook: %s", e)

    try:
        gui_hooks.state_did_change.append(on_state_change)
    except (AttributeError, TypeError) as e:
        logger.warning("Could not register state_did_change hook: %s", e)
    
    # Cleanup hook
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
    
    # Register cleanup hooks
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
    

