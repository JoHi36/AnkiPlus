"""
Theme-Management für das Anki Chatbot Addon
"""

from ..config import get_config

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from .tokens_qt import DARK_TOKENS, LIGHT_TOKENS
except ImportError:
    from tokens_qt import DARK_TOKENS, LIGHT_TOKENS


def _detect_system_theme() -> str:
    """Detect the OS/Qt palette theme. Returns 'light' or 'dark'."""
    try:
        from aqt import mw
        if mw and mw.pm and hasattr(mw.pm, 'night_mode'):
            return "dark" if mw.pm.night_mode() else "light"
    except Exception:
        pass
    try:
        from aqt.qt import QApplication, QPalette
        app = QApplication.instance()
        if app:
            color = app.palette().color(QPalette.ColorRole.Window)
            return "dark" if color.lightness() < 128 else "light"
    except Exception:
        pass
    return "dark"


def get_resolved_theme() -> str:
    """
    Returns the effective theme string ('dark' or 'light'), resolving
    'system' by querying the OS/Qt palette.
    """
    config = get_config()
    theme = config.get("theme", "dark")
    # Legacy value guard
    if theme == "auto":
        theme = "dark"
    if theme == "system":
        return _detect_system_theme()
    if theme in ("dark", "light"):
        return theme
    return "dark"


def get_theme_attribute() -> str:
    """
    Returns the HTML attribute string to apply to <html> for light mode,
    or an empty string for dark mode (dark is the CSS default).

    Usage in HTML templates:
        <html {get_theme_attribute()}>
    """
    return 'data-theme="light"' if get_resolved_theme() == "light" else ""


def get_theme_styles():
    """Gibt die Styles basierend auf dem aktuellen Theme zurück"""
    if get_resolved_theme() == "light":
        return LIGHT_THEME
    return DARK_THEME

# Dark Theme Styles - Edles Teal/Türkis-Blau
DARK_THEME = {
    "background": DARK_TOKENS["bg_canvas"],
    "background_medium": DARK_TOKENS["bg_overlay"],
    "background_light": DARK_TOKENS["bg_overlay"],
    "background_input": DARK_TOKENS["bg_overlay"],
    "text_primary": DARK_TOKENS["text_primary"],
    "text_secondary": DARK_TOKENS["text_secondary"],
    "text_accent": "#14b8a6",  # Teal-500
    "text_user": "#2dd4bf",  # Teal-400
    "border": DARK_TOKENS["border_medium"],
    "border_input": DARK_TOKENS["border_medium"],
    "border_focus": "#14b8a6",  # Teal-500
    "button_primary": "#14b8a6",  # Teal-500 - edles Grün-Blau
    "button_hover": "#2dd4bf",  # Teal-400 - heller
    "button_pressed": "#0d9488",  # Teal-600 - dunkler
    "bot_message": "#1e3a3a",  # Dunkles Teal
    "user_message": "#134e4a",  # Dunkles Teal-Blau
}

# Light Theme Styles - Edles Teal/Türkis-Blau
LIGHT_THEME = {
    "background": LIGHT_TOKENS["bg_canvas"],
    "background_medium": LIGHT_TOKENS["bg_deep"],
    "background_light": LIGHT_TOKENS["bg_canvas"],
    "background_input": LIGHT_TOKENS["bg_canvas"],
    "text_primary": LIGHT_TOKENS["text_primary"],
    "text_secondary": LIGHT_TOKENS["text_secondary"],
    "text_accent": "#0d9488",  # Teal-600
    "text_user": "#14b8a6",  # Teal-500
    "border": LIGHT_TOKENS["border_subtle"],
    "border_input": LIGHT_TOKENS["border_medium"],
    "border_focus": "#14b8a6",  # Teal-500
    "button_primary": "#14b8a6",  # Teal-500
    "button_hover": "#2dd4bf",  # Teal-400
    "button_pressed": "#0d9488",  # Teal-600
    "bot_message": "#ccfbf1",  # Teal-100
    "user_message": "#99f6e4",  # Teal-200
}

def get_chat_display_style():
    """Gibt das Styling für den Chat-Display zurück"""
    styles = get_theme_styles()
    return f"""
        QTextEdit {{
            background-color: {styles['background']};
            color: {styles['text_primary']};
            border: none;
            padding: 16px;
            font-size: 14px;
            line-height: 1.5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }}
    """

def get_input_container_style():
    """Gibt das Styling für den Input-Container zurück"""
    styles = get_theme_styles()
    return f"""
        QWidget {{
            background-color: {styles['background_medium']};
            border-top: 1px solid {styles['border']};
        }}
    """

def get_input_field_style():
    """Gibt das Styling für das Input-Feld zurück"""
    styles = get_theme_styles()
    return f"""
        QLineEdit {{
            background-color: {styles['background_input']};
            color: {styles['text_primary']};
            border: 1px solid {styles['border_input']};
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }}
        QLineEdit:focus {{
            border: 1px solid {styles['border_focus']};
            background-color: {styles['background_light']};
        }}
        QLineEdit::placeholder {{
            color: {styles['text_secondary']};
        }}
    """

def get_send_button_style():
    """Gibt das Styling für den Send-Button zurück"""
    styles = get_theme_styles()
    return f"""
        QPushButton {{
            background-color: {styles['button_primary']};
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
        }}
        QPushButton:hover {{
            background-color: {styles['button_hover']};
        }}
        QPushButton:pressed {{
            background-color: {styles['button_pressed']};
        }}
    """

def get_dock_widget_style():
    """Gibt das Styling für das Dock-Widget zurück"""
    styles = get_theme_styles()
    return f"""
        QDockWidget {{
            background-color: {styles['background']};
            color: {styles['text_primary']};
            titlebar-close-icon: none;
            titlebar-normal-icon: none;
        }}
        QDockWidget::title {{
            background-color: {styles['background_medium']};
            padding: 8px;
            font-weight: 600;
            font-size: 13px;
        }}
    """

def get_fab_button_style():
    """Gibt das Styling für den Floating Action Button zurück"""
    styles = get_theme_styles()
    return f"""
        QPushButton {{
            background-color: {styles['button_primary']};
            color: white;
            border: none;
            border-radius: 28px;
            font-size: 24px;
            font-weight: 600;
        }}
        QPushButton:hover {{
            background-color: {styles['button_hover']};
        }}
        QPushButton:pressed {{
            background-color: {styles['button_pressed']};
        }}
    """

def format_bot_message(message):
    """Plain Text Darstellung ohne farbigen Hintergrund"""
    styles = get_theme_styles()
    return f'''
    <div style="
        margin: 10px 0;
        padding: 0;
        color: {styles['text_primary']};
        font-size: 15px;
        line-height: 1.55;
        word-wrap: break-word;
    ">{message}</div>
    '''

def format_user_message(message):
    """Plain Text Darstellung ohne farbigen Hintergrund"""
    styles = get_theme_styles()
    return f'''
    <div style="
        margin: 10px 0;
        padding: 0;
        color: {styles['text_primary']};
        font-size: 15px;
        line-height: 1.55;
        word-wrap: break-word;
        text-align: right;
    ">{message}</div>
    '''

