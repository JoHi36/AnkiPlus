"""
Konfigurations-Management für das Anki Chatbot Addon
"""

from aqt import mw
from aqt.utils import showInfo
import json
import os

# Standard-Konfiguration
DEFAULT_CONFIG = {
    "model_provider": "google",  # Nur Google unterstützt
    "model_name": "gemini-3-flash-preview",  # Standard: Gemini 3 Flash (schnell, minimal thinking)
    "api_key": "",  # Wird vom Nutzer eingegeben (für Backward-Kompatibilität)
    "auth_token": "",  # Firebase Auth ID Token
    "refresh_token": "",  # Firebase Refresh Token
    "backend_url": "",  # Backend URL (Standard: Firebase Function URL)
    "auth_validated": False,  # Wurde der Token erfolgreich validiert?
    "response_style": "balanced",  # balanced, concise, detailed, friendly
    "theme": "auto",  # auto, dark, light
    "ai_tools": {
        "images": True,
        "diagrams": True,
        "molecules": False  # Beta
    },
    "firebase": {
        "enabled": False,  # Firebase MCP Integration aktiviert
        "service_account_path": "",  # Pfad zur Service Account JSON (optional, kann auch über Umgebungsvariable gesetzt werden)
        "storage_bucket": ""  # Firebase Storage Bucket (optional, kann auch über Umgebungsvariable gesetzt werden)
    }
}

# Standard Backend URL
DEFAULT_BACKEND_URL = "https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api"

# Verfügbare Modelle (nur Google) - Fallback falls API nicht erreichbar
# NUR Gemini 3 Flash für Chat (Gemini 2.0 wird nur intern für Titel verwendet)
AVAILABLE_MODELS = {
    "google": [
        {"name": "gemini-3-flash-preview", "label": "Gemini 3 Flash"},
    ],
}

# Antwortstile
RESPONSE_STYLES = {
    "concise": {
        "name": "Präzise",
        "description": "Kurze, präzise Antworten",
        "prompt_suffix": "Antworte kurz und präzise."
    },
    "balanced": {
        "name": "Ausgewogen",
        "description": "Ausgewogene Länge und Detailtiefe",
        "prompt_suffix": "Antworte ausgewogen und hilfreich."
    },
    "detailed": {
        "name": "Detailliert",
        "description": "Ausführliche, detaillierte Antworten",
        "prompt_suffix": "Antworte ausführlich und detailliert."
    },
    "friendly": {
        "name": "Freundlich",
        "description": "Freundlicher, ermutigender Ton",
        "prompt_suffix": "Antworte freundlich und ermutigend."
    },
}

def get_config_path():
    """Gibt den Pfad zur Konfigurationsdatei zurück"""
    addon_dir = os.path.dirname(__file__)
    return os.path.join(addon_dir, "config.json")

def load_config():
    """Lädt die Konfiguration aus der Datei"""
    config_path = get_config_path()
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                # Stelle sicher, dass alle Standard-Werte vorhanden sind
                for key, value in DEFAULT_CONFIG.items():
                    if key not in config:
                        config[key] = value
                    # Spezielle Behandlung für ai_tools (nested dict)
                    elif key == "ai_tools" and isinstance(value, dict):
                        # Merge mit Standardwerten für fehlende Keys
                        default_tools = DEFAULT_CONFIG["ai_tools"]
                        for tool_key, tool_value in default_tools.items():
                            if tool_key not in config[key]:
                                config[key][tool_key] = tool_value
                    # Spezielle Behandlung für firebase (nested dict)
                    elif key == "firebase" and isinstance(value, dict):
                        # Merge mit Standardwerten für fehlende Keys
                        default_firebase = DEFAULT_CONFIG["firebase"]
                        for firebase_key, firebase_value in default_firebase.items():
                            if firebase_key not in config[key]:
                                config[key][firebase_key] = firebase_value
                # Migration: Wenn ai_tools fehlt, füge Standardwerte hinzu
                if "ai_tools" not in config:
                    config["ai_tools"] = DEFAULT_CONFIG["ai_tools"].copy()
                # Migration: Wenn firebase fehlt, füge Standardwerte hinzu
                if "firebase" not in config:
                    config["firebase"] = DEFAULT_CONFIG["firebase"].copy()
                
                # Migration: Backend-URL setzen falls nicht vorhanden
                if "backend_url" not in config or not config.get("backend_url"):
                    config["backend_url"] = DEFAULT_BACKEND_URL
                
                # Migration: Auth-Token-Felder hinzufügen falls nicht vorhanden
                if "auth_token" not in config:
                    config["auth_token"] = ""
                if "refresh_token" not in config:
                    config["refresh_token"] = ""
                
                return config
        except Exception as e:
            showInfo(f"Fehler beim Laden der Konfiguration: {str(e)}")
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config(config):
    """Speichert die Konfiguration in die Datei"""
    config_path = get_config_path()
    print(f"save_config: Versuche zu speichern nach: {config_path}")
    print(f"save_config: Config enthält api_key mit Länge: {len(config.get('api_key', ''))}")
    try:
        # Stelle sicher, dass das Verzeichnis existiert
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"save_config: ✓ Erfolgreich gespeichert nach: {config_path}")
        
        # Verifiziere durch Zurücklesen
        with open(config_path, 'r', encoding='utf-8') as f:
            verify_config = json.load(f)
            print(f"save_config: Verifizierung - API-Key Länge in Datei: {len(verify_config.get('api_key', ''))}")
        
        return True
    except Exception as e:
        import traceback
        error_msg = f"Fehler beim Speichern der Konfiguration: {str(e)}"
        print(f"save_config: ✗ FEHLER: {error_msg}")
        print(traceback.format_exc())
        showInfo(error_msg)
        return False

def get_config(force_reload=False):
    """Gibt die aktuelle Konfiguration zurück"""
    if force_reload or not hasattr(mw, '_chatbot_config'):
        mw._chatbot_config = load_config()
        print(f"Config geladen. API-Key vorhanden: {'Ja' if mw._chatbot_config.get('api_key') else 'Nein'} (Länge: {len(mw._chatbot_config.get('api_key', ''))})")
    return mw._chatbot_config

def update_config(**kwargs):
    """Aktualisiert die Konfiguration"""
    config = get_config()
    print(f"update_config aufgerufen mit: {list(kwargs.keys())}")
    
    # Trimme API-Key falls vorhanden (entferne Whitespace)
    if 'api_key' in kwargs:
        kwargs['api_key'] = kwargs['api_key'].strip() if kwargs['api_key'] else ""
        print(f"update_config: API-Key getrimmt, neue Länge: {len(kwargs['api_key'])}")
        if len(kwargs['api_key']) > 50:
            print(f"⚠️ WARNUNG: API-Key ist sehr lang ({len(kwargs['api_key'])} Zeichen)!")
    
    # Trimme Auth-Token falls vorhanden
    if 'auth_token' in kwargs:
        kwargs['auth_token'] = kwargs['auth_token'].strip() if kwargs['auth_token'] else ""
        print(f"update_config: Auth-Token getrimmt, neue Länge: {len(kwargs['auth_token'])}")
    
    # Trimme Refresh-Token falls vorhanden
    if 'refresh_token' in kwargs:
        kwargs['refresh_token'] = kwargs['refresh_token'].strip() if kwargs['refresh_token'] else ""
        print(f"update_config: Refresh-Token getrimmt, neue Länge: {len(kwargs['refresh_token'])}")
    
    # Setze Backend-URL falls nicht gesetzt
    if 'backend_url' in kwargs:
        kwargs['backend_url'] = kwargs['backend_url'].strip() if kwargs['backend_url'] else DEFAULT_BACKEND_URL
    elif not config.get('backend_url'):
        kwargs['backend_url'] = DEFAULT_BACKEND_URL
    
    config.update(kwargs)
    mw._chatbot_config = config
    success = save_config(config)
    if success:
        print("update_config: Config erfolgreich gespeichert")
    else:
        print("update_config: FEHLER beim Speichern der Config")
    return success


def is_backend_mode():
    """Prüft ob Backend-Modus aktiv ist (backend_url gesetzt)"""
    config = get_config()
    backend_url = config.get('backend_url', '').strip()
    return bool(backend_url)


def get_backend_url():
    """Gibt die Backend-URL zurück"""
    config = get_config()
    backend_url = config.get('backend_url', '').strip()
    if not backend_url:
        return DEFAULT_BACKEND_URL
    return backend_url


def get_auth_token():
    """Gibt das Auth-Token zurück"""
    config = get_config()
    return config.get('auth_token', '').strip()


def get_refresh_token():
    """Gibt das Refresh-Token zurück"""
    config = get_config()
    return config.get('refresh_token', '').strip()

