"""
Theme-Management für das Anki Chatbot Addon
"""

from .config import get_config

def get_theme_styles():
    """Gibt die Styles basierend auf dem aktuellen Theme zurück"""
    config = get_config()
    theme = config.get("theme", "auto")
    
    # Auto-Theme: Erkenne System-Theme
    if theme == "auto":
        # Versuche System-Theme zu erkennen (vereinfacht - könnte verbessert werden)
        theme = "dark"  # Default zu dark, könnte später System-Theme erkennen
    
    if theme == "light":
        return LIGHT_THEME
    else:
        return DARK_THEME

# Dark Theme Styles - Edles Teal/Türkis-Blau
DARK_THEME = {
    "background": "#1e1e1e",
    "background_medium": "#252525",
    "background_light": "#2d2d2d",
    "background_input": "#2d2d2d",
    "text_primary": "#e0e0e0",
    "text_secondary": "#888888",
    "text_accent": "#14b8a6",  # Teal-500
    "text_user": "#2dd4bf",  # Teal-400
    "border": "#333333",
    "border_input": "#3a3a3a",
    "border_focus": "#14b8a6",  # Teal-500
    "button_primary": "#14b8a6",  # Teal-500 - edles Grün-Blau
    "button_hover": "#2dd4bf",  # Teal-400 - heller
    "button_pressed": "#0d9488",  # Teal-600 - dunkler
    "bot_message": "#1e3a3a",  # Dunkles Teal
    "user_message": "#134e4a",  # Dunkles Teal-Blau
}

# Light Theme Styles - Edles Teal/Türkis-Blau
LIGHT_THEME = {
    "background": "#ffffff",
    "background_medium": "#f5f5f5",
    "background_light": "#fafafa",
    "background_input": "#ffffff",
    "text_primary": "#1a1a1a",
    "text_secondary": "#666666",
    "text_accent": "#0d9488",  # Teal-600
    "text_user": "#14b8a6",  # Teal-500
    "border": "#e0e0e0",
    "border_input": "#d0d0d0",
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

