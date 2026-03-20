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
    from ..config import get_config, update_config
except ImportError:
    from config import get_config, update_config

try:
    from .tokens_qt import get_tokens
except ImportError:
    from tokens_qt import get_tokens

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


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

            # Profile name from Anki
            profile_name = ''
            try:
                if mw and mw.pm and mw.pm.name:
                    profile_name = mw.pm.name
            except Exception:
                pass

            # Extract email from JWT token (Firebase ID tokens contain email in payload)
            user_email = ''
            if auth_token:
                try:
                    import base64
                    parts = auth_token.split('.')
                    if len(parts) == 3:
                        payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
                        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                        user_email = payload.get('email', '')
                except Exception:
                    pass

            return json.dumps({
                'responseStyle': config.get('response_style', 'balanced'),
                'theme': config.get('theme', 'dark'),
                'aiTools': config.get('ai_tools', {'images': True, 'diagrams': True, 'molecules': False}),
                'mascotEnabled': config.get('mascot_enabled', False),
                'isAuthenticated': is_authenticated,
                'hasToken': bool(auth_token),
                'profileName': profile_name,
                'userEmail': user_email,
                'backendUrl': config.get('backend_url', ''),
                'authToken': auth_token,
            })
        except Exception as e:
            logger.error("SettingsBridge.getConfig error: %s", e)
            return json.dumps({})

    @pyqtSlot(str)
    def saveResponseStyle(self, style):
        try:
            update_config(response_style=style)
        except Exception as e:
            logger.error("saveResponseStyle error: %s", e)

    @pyqtSlot(str)
    def saveTheme(self, theme):
        try:
            update_config(theme=theme)
        except Exception as e:
            logger.error("saveTheme error: %s", e)

    @pyqtSlot(bool)
    def saveMascotEnabled(self, enabled):
        try:
            update_config(mascot_enabled=bool(enabled))
        except Exception as e:
            logger.error("saveMascotEnabled error: %s", e)

    @pyqtSlot(result=str)
    def getEmbeddingStatus(self):
        """Return embedding progress: {total_cards, embedded_cards, is_running}"""
        try:
            try:
                from ..storage.card_sessions import count_embeddings
            except ImportError:
                from storage.card_sessions import count_embeddings

            embedded = count_embeddings()

            total = 0
            try:
                if mw and mw.col:
                    total = len(mw.col.find_cards(""))
            except Exception:
                pass

            is_running = False
            try:
                try:
                    from .. import get_embedding_manager
                except ImportError:
                    from __init__ import get_embedding_manager
                mgr = get_embedding_manager()
                if mgr and mgr._background_thread and mgr._background_thread.isRunning():
                    is_running = True
            except Exception:
                pass

            return json.dumps({
                'totalCards': total,
                'embeddedCards': embedded,
                'isRunning': is_running,
            })
        except Exception as e:
            logger.error("getEmbeddingStatus error: %s", e)
            return json.dumps({'totalCards': 0, 'embeddedCards': 0, 'isRunning': False})

    @pyqtSlot(str)
    def saveAITools(self, tools_json):
        try:
            tools = json.loads(tools_json)
            update_config(ai_tools=tools)
        except Exception as e:
            logger.error("saveAITools error: %s", e)

    @pyqtSlot(str, str)
    def authenticate(self, token, refresh_token=""):
        """Validate token against backend. Accepts plain token or JSON format."""
        try:
            import requests

            # Support JSON format: {"token": "...", "refreshToken": "..."}
            token_str = token.strip()
            if token_str.startswith('{'):
                try:
                    token_data = json.loads(token_str)
                    token = token_data.get('token', '') or token_data.get('idToken', '')
                    refresh_token = token_data.get('refreshToken', '') or refresh_token
                except json.JSONDecodeError:
                    pass

            if not token or not token.strip():
                return

            config = get_config()
            backend_url = config.get('backend_url', '').strip()
            if not backend_url:
                try:
                    from ..config import DEFAULT_BACKEND_URL
                except ImportError:
                    from config import DEFAULT_BACKEND_URL
                backend_url = DEFAULT_BACKEND_URL

            update_config(
                auth_token=token.strip(),
                refresh_token=refresh_token.strip() if refresh_token else "",
                backend_url=backend_url,
                backend_mode=True,
                auth_validated=False
            )

            resp = requests.get(
                f"{backend_url}/user/quota",
                headers={'Authorization': f'Bearer {token.strip()}'},
                timeout=15,
            )
            if resp.status_code == 200:
                update_config(auth_validated=True)
                logger.info("SettingsBridge.authenticate: Token validiert!")
            else:
                update_config(auth_validated=False)
                logger.warning("SettingsBridge.authenticate: Validierung fehlgeschlagen (%s)", resp.status_code)
        except Exception as e:
            logger.error("SettingsBridge.authenticate error: %s", e)

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
            logger.error("getQuota error: %s", e)
            return json.dumps(None)

    @pyqtSlot()
    def logout(self):
        """Clear auth token and reset auth status."""
        try:
            update_config(auth_token="", refresh_token="", auth_validated=False)
            logger.info("SettingsBridge.logout: Auth cleared")
        except Exception as e:
            logger.error("logout error: %s", e)

    @pyqtSlot(str)
    def openUrl(self, url):
        import webbrowser
        webbrowser.open(url)

    @pyqtSlot(result=str)
    def startLinkAuth(self):
        """Start the Link-Code auth flow: generate code, open browser, poll for tokens."""
        import secrets
        import threading
        import webbrowser

        try:
            link_code = secrets.token_urlsafe(24)
            logger.info("SettingsBridge.startLinkAuth: Code generiert (%s...)", link_code[:8])

            login_url = f"https://anki-plus.vercel.app/login?link={link_code}"
            webbrowser.open(login_url)

            def poll_for_tokens():
                import time
                import requests as req
                config = get_config()
                backend_url = config.get('backend_url', '').strip()
                if not backend_url:
                    try:
                        from ..config import DEFAULT_BACKEND_URL
                    except ImportError:
                        from config import DEFAULT_BACKEND_URL
                    backend_url = DEFAULT_BACKEND_URL

                max_attempts = 150  # 5 min at 2s interval

                for attempt in range(max_attempts):
                    time.sleep(2)
                    try:
                        response = req.get(
                            f"{backend_url}/auth/link/{link_code}",
                            headers={"Content-Type": "application/json"},
                            timeout=5
                        )
                        if response.status_code == 200:
                            data = response.json()
                            id_token = data.get("idToken", "")
                            refresh_token = data.get("refreshToken", "")
                            if id_token:
                                logger.info("SettingsBridge.startLinkAuth: Tokens empfangen! (Attempt %d)", attempt+1)
                                # Save and validate on main thread
                                mw.taskman.run_on_main(
                                    lambda t=id_token, r=refresh_token: self._complete_link_auth(t, r)
                                )
                                return
                        elif response.status_code == 410:
                            logger.warning("SettingsBridge.startLinkAuth: Link-Code abgelaufen")
                            return
                    except Exception as e:
                        if attempt % 10 == 0:
                            logger.warning("SettingsBridge.startLinkAuth: Polling-Fehler (%d): %s", attempt+1, e)

                logger.warning("SettingsBridge.startLinkAuth: Timeout nach 5 Min")

            thread = threading.Thread(target=poll_for_tokens, daemon=True, name="SettingsLinkAuthPoll")
            thread.start()

            return json.dumps({"success": True, "linkCode": link_code})
        except Exception as e:
            logger.error("SettingsBridge.startLinkAuth error: %s", e)
            return json.dumps({"success": False, "error": str(e)})

    def _complete_link_auth(self, id_token, refresh_token):
        """Called on main thread when link auth tokens are received."""
        try:
            import requests as req
            config = get_config()
            backend_url = config.get('backend_url', '').strip()
            if not backend_url:
                try:
                    from ..config import DEFAULT_BACKEND_URL
                except ImportError:
                    from config import DEFAULT_BACKEND_URL
                backend_url = DEFAULT_BACKEND_URL

            update_config(
                auth_token=id_token.strip(),
                refresh_token=refresh_token.strip() if refresh_token else "",
                backend_url=backend_url,
                backend_mode=True,
                auth_validated=False
            )

            resp = req.get(
                f"{backend_url}/user/quota",
                headers={"Authorization": f"Bearer {id_token.strip()}"},
                timeout=15,
            )
            if resp.status_code == 200:
                update_config(auth_validated=True)
                logger.info("SettingsBridge._complete_link_auth: Token validiert!")
            else:
                logger.warning("SettingsBridge._complete_link_auth: Validierung fehlgeschlagen (%s)", resp.status_code)
        except Exception as e:
            logger.error("SettingsBridge._complete_link_auth: Fehler: %s", e)

    @pyqtSlot(result=str)
    def copyLogs(self):
        """Copy recent logs + debug info to clipboard."""
        try:
            import platform
            try:
                from ..utils.logging import get_recent_logs
            except ImportError:
                from utils.logging import get_recent_logs

            # Header with system info
            lines = ["AnkiPlus Debug Info", "=" * 40]

            # Anki version
            try:
                from anki import version as anki_version
                lines.append(f"Anki: {anki_version}")
            except Exception:
                lines.append("Anki: unknown")

            lines.append(f"OS: {platform.system()} {platform.release()}")
            lines.append(f"Python: {platform.python_version()}")

            # Addon version (from manifest if available)
            try:
                manifest_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "manifest.json")
                if os.path.exists(manifest_path):
                    with open(manifest_path) as f:
                        manifest = json.load(f)
                        lines.append(f"Addon: {manifest.get('name', '?')} v{manifest.get('version', '?')}")
            except Exception:
                pass

            # Auth status (no tokens!)
            config = get_config()
            lines.append(f"Auth: {'yes' if config.get('auth_validated') else 'no'}")
            lines.append(f"Backend: {'connected' if config.get('backend_mode') else 'local'}")

            lines.append("")
            lines.append("Recent Logs (last 20 min)")
            lines.append("-" * 40)

            log_lines = get_recent_logs(max_age_seconds=1200)
            if log_lines:
                lines.extend(log_lines)
            else:
                lines.append("(keine Logs vorhanden)")

            text = "\n".join(lines)

            # Copy to clipboard
            clipboard = QApplication.clipboard()
            clipboard.setText(text)

            logger.info("Logs copied to clipboard (%d lines)", len(log_lines))
            return json.dumps({"success": True, "lineCount": len(log_lines)})
        except Exception as e:
            logger.error("copyLogs error: %s", e)
            return json.dumps({"success": False, "error": str(e)})

    @pyqtSlot()
    def openDiary(self):
        """Open the Plusi diary panel."""
        try:
            try:
                from ..plusi.panel import toggle_panel
            except ImportError:
                from plusi.panel import toggle_panel
            toggle_panel()
        except Exception as e:
            logger.error("openDiary error: %s", e)

    @pyqtSlot()
    def openAnkiPrefs(self):
        try:
            if mw and hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        except Exception as e:
            logger.error("openAnkiPrefs error: %s", e)

    @pyqtSlot()
    def closeWindow(self):
        """Close settings window, or go back to diary when embedded in panel."""
        if hasattr(self, '_panel_back') and self._panel_back:
            self._panel_back()
            return
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
        _tokens = get_tokens("dark")
        self.setStyleSheet(f"""
            QDialog {{
                background: {_tokens['bg_canvas']};
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 16px;
            }}
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # WebView
        self.web_view = QWebEngineView()
        self.web_view.setStyleSheet("background: transparent;")
        # Make page background transparent
        self.web_view.page().setBackgroundColor(QColor(_tokens['bg_canvas']))

        # Bridge
        self.bridge = SettingsBridge()
        self.channel = QWebChannel()
        self.channel.registerObject("bridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        layout.addWidget(self.web_view)

        # Load HTML
        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "settings.html")
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
