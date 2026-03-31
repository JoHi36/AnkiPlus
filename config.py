"""
Konfigurations-Management für das Anki Chatbot Addon
"""

from aqt import mw
from aqt.utils import showInfo
import json
import os
import uuid

try:
    from .utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Standard-Konfiguration
DEFAULT_CONFIG = {
    "model_provider": "google",  # Nur Google unterstützt
    "model_name": "gemini-3-flash-preview",  # Standard: Gemini 3 Flash (schnell, minimal thinking)
    "api_key": "",  # Wird vom Nutzer eingegeben (für Backward-Kompatibilität)
    "openrouter_api_key": "",  # OpenRouter API key (unified gateway for Perplexity, Gemini, etc.)
    "auth_token": "",  # Firebase Auth ID Token
    "refresh_token": "",  # Firebase Refresh Token
    "backend_url": "",  # Backend URL (Standard: Firebase Function URL)
    "auth_validated": False,  # Wurde der Token erfolgreich validiert?
    "response_style": "balanced",  # balanced, concise, detailed, friendly
    "theme": "dark",  # dark, light, system
    "ai_tools": {
        "plusi": True,       # Sub-Agent: Plusi companion
        "cards": True,       # Tool: Card search + show
        "images": True,      # Tool: Images from cards and internet
        "diagrams": True,    # Tool: Mermaid diagrams
        "stats": True,       # Tool: Learning statistics
        "molecules": False,  # Tool: Molecules (Beta)
        "compact": True,     # Tool: Chat-Zusammenfassung / Insight Extraction
        "research": True,    # Sub-Agent: Research via OpenRouter
    },
    "firebase": {
        "enabled": False,  # Firebase MCP Integration aktiviert
        "service_account_path": "",  # Pfad zur Service Account JSON (optional, kann auch über Umgebungsvariable gesetzt werden)
        "storage_bucket": ""  # Firebase Storage Bucket (optional, kann auch über Umgebungsvariable gesetzt werden)
    },
    "plusi_autonomy": {
        "budget_per_hour": 2000,
        "enabled": True,
    },
    "telegram": {
        "enabled": False,
        "bot_token": "",
        "keep_awake": False,
        "relay_url": "",
        "relay_secret": "",
    },
    "mascot_enabled": False,
    "research_enabled": True,  # Research Agent enabled
    "research_sources": {
        "pubmed": True,
        "wikipedia": True,
    },
    # Agent orchestration
    "tutor_enabled": True,           # Always True — Tutor cannot be disabled
    "help_enabled": True,            # Help agent toggle
    "default_interaction_mode": "auto",  # 'auto', 'tutor', 'research', 'help', 'plusi'
    "router_model": "gemini-2.5-flash",  # Router model selection
    "max_chain_depth": 2,            # Max agents in a handoff chain
    "system_quality": "standard",    # Response quality tier: 'standard', 'high'
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
                    elif key == "plusi_autonomy" and isinstance(value, dict):
                        default_autonomy = DEFAULT_CONFIG["plusi_autonomy"]
                        for k, v in default_autonomy.items():
                            if k not in config[key]:
                                config[key][k] = v
                    elif key == "research_sources" and isinstance(value, dict):
                        default_sources = DEFAULT_CONFIG["research_sources"]
                        for source_key, source_value in default_sources.items():
                            if source_key not in config[key]:
                                config[key][source_key] = source_value
                # Migration: Wenn ai_tools fehlt, füge Standardwerte hinzu
                if "ai_tools" not in config:
                    config["ai_tools"] = DEFAULT_CONFIG["ai_tools"].copy()
                # Migration: Wenn firebase fehlt, füge Standardwerte hinzu
                if "firebase" not in config:
                    config["firebase"] = DEFAULT_CONFIG["firebase"].copy()

                # Migration: Wenn research_sources fehlt, füge Standardwerte hinzu
                if "research_sources" not in config:
                    config["research_sources"] = DEFAULT_CONFIG["research_sources"].copy()

                # Migration: "auto" → "dark" (legacy value renamed)
                if config.get("theme") == "auto":
                    config["theme"] = "dark"

                # Migration: Backend-URL setzen falls nicht vorhanden
                if "backend_url" not in config or not config.get("backend_url"):
                    config["backend_url"] = DEFAULT_BACKEND_URL
                
                # Migration: Auth-Token-Felder hinzufügen falls nicht vorhanden
                if "auth_token" not in config:
                    config["auth_token"] = ""
                if "refresh_token" not in config:
                    config["refresh_token"] = ""
                
                # Migration: Device-ID hinzufügen falls nicht vorhanden
                if "device_id" not in config or not config.get("device_id"):
                    config["device_id"] = str(uuid.uuid4())
                    # Speichere sofort, damit Device-ID persistent ist
                    save_config(config)
                
                return config
        except Exception as e:
            showInfo(f"Fehler beim Laden der Konfiguration: {str(e)}")
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def _sanitize_config(config: dict) -> dict:
    """Sanitize config values, fixing invalid entries to safe defaults."""
    # Theme must be one of: dark, light, system
    if config.get('theme') not in ('dark', 'light', 'system'):
        logger.warning("Invalid theme %s, defaulting to dark", config.get('theme'))
        config['theme'] = 'dark'

    # response_style must be one of the known styles
    valid_styles = ('concise', 'balanced', 'detailed', 'friendly')
    if config.get('response_style') and config['response_style'] not in valid_styles:
        logger.warning("Invalid response_style %s, defaulting to balanced", config.get('response_style'))
        config['response_style'] = 'balanced'

    # API keys must be strings (not numbers, not booleans)
    for key in ('api_key', 'openai_api_key', 'anthropic_api_key'):
        if key in config and config[key] is not None and not isinstance(config[key], str):
            logger.warning("Invalid %s type, clearing", key)
            config[key] = ''

    # Plusi autonomy budget must be non-negative
    plusi = config.get('plusi_autonomy', {})
    if isinstance(plusi, dict):
        budget = plusi.get('budget_per_hour')
        if budget is not None and (not isinstance(budget, (int, float)) or budget < 0):
            logger.warning("Invalid plusi budget_per_hour %s, defaulting to 500", budget)
            plusi['budget_per_hour'] = 500

    return config


def save_config(config):
    """Speichert die Konfiguration in die Datei"""
    config = _sanitize_config(config)
    config_path = get_config_path()
    logger.debug("save_config: Versuche zu speichern nach: %s", config_path)
    logger.debug("save_config: Config enthält api_key mit Länge: %s", len(config.get('api_key', '')))
    try:
        # Stelle sicher, dass das Verzeichnis existiert
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        logger.info("save_config: ✓ Erfolgreich gespeichert nach: %s", config_path)
        
        # Verifiziere durch Zurücklesen
        with open(config_path, 'r', encoding='utf-8') as f:
            verify_config = json.load(f)
            logger.debug("save_config: Verifizierung - API-Key Länge in Datei: %s", len(verify_config.get('api_key', '')))
        
        return True
    except Exception as e:
        error_msg = f"Fehler beim Speichern der Konfiguration: {str(e)}"
        logger.error("save_config: ✗ FEHLER: %s", error_msg)
        showInfo(error_msg)
        return False

def get_config(force_reload=False):
    """Gibt die aktuelle Konfiguration zurück (thread-safe, never returns None)"""
    if mw is None:
        return dict(DEFAULT_CONFIG)
    try:
        if force_reload or not hasattr(mw, '_chatbot_config') or mw._chatbot_config is None:
            mw._chatbot_config = load_config()
            logger.info("Config geladen. API-Key vorhanden: %s (Länge: %s)", 'Ja' if mw._chatbot_config.get('api_key') else 'Nein', len(mw._chatbot_config.get('api_key', '')))
        return mw._chatbot_config
    except (RuntimeError, AttributeError):
        # Thread-safety: mw may not be accessible from worker threads
        return dict(DEFAULT_CONFIG)

def update_config(mascot_enabled=None, **kwargs):
    """Aktualisiert die Konfiguration"""
    config = get_config()
    logger.debug("update_config aufgerufen mit: %s", list(kwargs.keys()))
    
    # Trimme API-Key falls vorhanden (entferne Whitespace)
    if 'api_key' in kwargs:
        kwargs['api_key'] = kwargs['api_key'].strip() if kwargs['api_key'] else ""
        logger.debug("update_config: API-Key getrimmt, neue Länge: %s", len(kwargs['api_key']))
        if len(kwargs['api_key']) > 50:
            logger.warning("⚠️ WARNUNG: API-Key ist sehr lang (%s Zeichen)!", len(kwargs['api_key']))
    
    # Trimme Auth-Token falls vorhanden
    if 'auth_token' in kwargs:
        kwargs['auth_token'] = kwargs['auth_token'].strip() if kwargs['auth_token'] else ""
        logger.debug("update_config: Auth-Token getrimmt, neue Länge: %s", len(kwargs['auth_token']))
    
    # Trimme Refresh-Token falls vorhanden
    if 'refresh_token' in kwargs:
        kwargs['refresh_token'] = kwargs['refresh_token'].strip() if kwargs['refresh_token'] else ""
        logger.debug("update_config: Refresh-Token getrimmt, neue Länge: %s", len(kwargs['refresh_token']))
    
    # Setze Backend-URL falls nicht gesetzt
    if 'backend_url' in kwargs:
        kwargs['backend_url'] = kwargs['backend_url'].strip() if kwargs['backend_url'] else DEFAULT_BACKEND_URL
    elif not config.get('backend_url'):
        kwargs['backend_url'] = DEFAULT_BACKEND_URL
    
    if mascot_enabled is not None:
        config['mascot_enabled'] = mascot_enabled
    config.update(kwargs)
    mw._chatbot_config = config
    success = save_config(config)
    if success:
        logger.info("update_config: Config erfolgreich gespeichert")
    else:
        logger.error("update_config: FEHLER beim Speichern der Config")
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


def get_or_create_device_id():
    """Gibt die Device-ID zurück oder erstellt eine neue falls nicht vorhanden"""
    config = get_config()
    device_id = config.get('device_id', '').strip()
    
    if not device_id:
        # Generiere neue Device-ID
        device_id = str(uuid.uuid4())
        config['device_id'] = device_id
        save_config(config)
        logger.debug("Device-ID generiert: %s", device_id)
    
    return device_id

