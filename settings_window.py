"""
SettingsWindow — Standalone native popup for AnkiPlus settings.
Opens as its own OS-level window (QDialog + QWebEngineView).
"""

import os
import json

from aqt import mw
from aqt.qt import *

try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebChannel import QWebChannel
    from PyQt6.QtCore import QObject, pyqtSlot, QUrl
    from PyQt6.QtWebEngineCore import QWebEnginePage
except ImportError:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
        from PyQt5.QtWebChannel import QWebChannel
        from PyQt5.QtCore import QObject, pyqtSlot, QUrl
    except ImportError:
        QWebEngineView = None
        QWebChannel = None

try:
    from .config import get_config, update_config
except ImportError:
    from config import get_config, update_config


# Singleton instance
_settings_window = None


class SettingsBridge(QObject):
    """JS ↔ Python bridge for the settings page."""

    @pyqtSlot(result=str)
    def getConfig(self):
        """Return full settings config as JSON."""
        try:
            config = get_config(force_reload=True)
            # Auth status
            auth_token = config.get('auth_token', '').strip()
            auth_validated = config.get('auth_validated', False)
            is_authenticated = bool(auth_token) and auth_validated

            # Profile name
            profile_name = ''
            try:
                if mw and mw.pm and mw.pm.name:
                    profile_name = mw.pm.name
            except Exception:
                pass

            return json.dumps({
                'responseStyle': config.get('response_style', 'balanced'),
                'theme': config.get('theme', 'auto'),
                'aiTools': config.get('ai_tools', {'images': True, 'diagrams': True, 'molecules': False}),
                'mascotEnabled': config.get('mascot_enabled', False),
                'isAuthenticated': is_authenticated,
                'hasToken': bool(auth_token),
                'profileName': profile_name,
                'backendUrl': config.get('backend_url', ''),
                'authToken': auth_token,
            })
        except Exception as e:
            print(f"SettingsBridge.getConfig error: {e}")
            return json.dumps({})

    @pyqtSlot(str)
    def saveResponseStyle(self, style):
        try:
            update_config(response_style=style)
        except Exception as e:
            print(f"saveResponseStyle error: {e}")

    @pyqtSlot(str)
    def saveTheme(self, theme):
        try:
            update_config(theme=theme)
        except Exception as e:
            print(f"saveTheme error: {e}")

    @pyqtSlot(bool)
    def saveMascotEnabled(self, enabled):
        try:
            update_config(mascot_enabled=bool(enabled))
        except Exception as e:
            print(f"saveMascotEnabled error: {e}")

    @pyqtSlot(str)
    def saveAITools(self, tools_json):
        try:
            tools = json.loads(tools_json)
            update_config(ai_tools=tools)
        except Exception as e:
            print(f"saveAITools error: {e}")

    @pyqtSlot(str, str)
    def authenticate(self, token, refresh_token):
        """Validate token against backend."""
        try:
            import requests
            config = get_config()
            backend_url = config.get('backend_url', '').strip()
            if not backend_url:
                from .config import DEFAULT_BACKEND_URL
                backend_url = DEFAULT_BACKEND_URL

            update_config(auth_token=token.strip(), refresh_token=refresh_token.strip(), auth_validated=False)

            resp = requests.get(
                f"{backend_url}/user/quota",
                headers={'Authorization': f'Bearer {token.strip()}'},
                timeout=10,
            )
            if resp.status_code == 200:
                update_config(auth_validated=True)
                return
            else:
                update_config(auth_validated=False)
        except Exception as e:
            print(f"authenticate error: {e}")

    @pyqtSlot(result=str)
    def getQuota(self):
        """Fetch quota from backend."""
        try:
            import requests
            config = get_config(force_reload=True)
            token = config.get('auth_token', '').strip()
            backend_url = config.get('backend_url', '').strip()
            if not token or not backend_url:
                return json.dumps(None)

            resp = requests.get(
                f"{backend_url}/user/quota",
                headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                timeout=10,
            )
            if resp.status_code == 200:
                return json.dumps(resp.json())
            return json.dumps(None)
        except Exception as e:
            print(f"getQuota error: {e}")
            return json.dumps(None)

    @pyqtSlot()
    def logout(self):
        """Clear auth token and reset auth status."""
        try:
            update_config(auth_token="", refresh_token="", auth_validated=False)
            print("SettingsBridge.logout: Auth cleared")
        except Exception as e:
            print(f"logout error: {e}")

    @pyqtSlot(str)
    def openUrl(self, url):
        import webbrowser
        webbrowser.open(url)

    @pyqtSlot()
    def openAnkiPrefs(self):
        try:
            if mw and hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        except Exception as e:
            print(f"openAnkiPrefs error: {e}")

    @pyqtSlot()
    def closeWindow(self):
        global _settings_window
        if _settings_window:
            _settings_window.close()


class SettingsWindow(QDialog):
    """Frameless popup window for AnkiPlus settings."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.setWindowTitle("AnkiPlus Einstellungen")
        self.setMinimumSize(500, 580)
        self.resize(500, 620)

        # Center on screen
        if mw:
            geo = mw.geometry()
            x = geo.x() + (geo.width() - 500) // 2
            y = geo.y() + (geo.height() - 620) // 2
            self.move(x, y)

        # Dark background (matches card bg)
        self.setStyleSheet("""
            QDialog {
                background: #1A1A1A;
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 16px;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # WebView
        self.web_view = QWebEngineView()
        self.web_view.setStyleSheet("background: transparent;")
        # Make page background transparent
        self.web_view.page().setBackgroundColor(QColor(26, 26, 26))

        # Bridge
        self.bridge = SettingsBridge()
        self.channel = QWebChannel()
        self.channel.registerObject("bridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        layout.addWidget(self.web_view)

        # Load HTML
        html_path = os.path.join(os.path.dirname(__file__), "settings.html")
        self.web_view.setUrl(QUrl.fromLocalFile(html_path))

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.close()
        super().keyPressEvent(event)


def show_settings():
    """Show the settings window (singleton)."""
    global _settings_window
    if _settings_window is None or not _settings_window.isVisible():
        _settings_window = SettingsWindow()
    _settings_window.show()
    _settings_window.raise_()
    _settings_window.activateWindow()
