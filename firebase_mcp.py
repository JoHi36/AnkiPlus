"""
Firebase MCP Integration für Anki Chatbot Addon
Ermöglicht die Nutzung von Firebase-Diensten über MCP (Model Context Protocol)
"""

import os
import json
from typing import Optional, Dict, Any, List, Tuple
import subprocess

class FirebaseMCP:
    """Wrapper für Firebase MCP-Integration"""
    
    def __init__(self):
        # Versuche zuerst aus Umgebungsvariablen zu laden
        self.service_account_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY_PATH")
        self.storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET")
        
        # Falls nicht in Umgebungsvariablen, versuche aus Config zu laden
        if not self.service_account_path or not self.storage_bucket:
            try:
                # Versuche zuerst über config.py (wenn in Anki)
                try:
                    from .config import get_config
                    config = get_config()
                except (ImportError, AttributeError):
                    # Fallback: Lade config.json direkt
                    config_path = os.path.join(os.path.dirname(__file__), "config.json")
                    if os.path.exists(config_path):
                        with open(config_path, 'r', encoding='utf-8') as f:
                            config = json.load(f)
                    else:
                        config = {}
                
                firebase_config = config.get("firebase", {})
                
                if not self.service_account_path and firebase_config.get("service_account_path"):
                    self.service_account_path = firebase_config["service_account_path"]
                
                if not self.storage_bucket and firebase_config.get("storage_bucket"):
                    self.storage_bucket = firebase_config["storage_bucket"]
            except Exception:
                # Falls Config nicht verfügbar ist, ignoriere Fehler
                pass  # Konfiguration ist optional
        
        self._config = None
    
    def is_configured(self) -> bool:
        """Prüft ob Firebase MCP konfiguriert ist"""
        return bool(self.service_account_path and self.storage_bucket)
    
    def get_config(self) -> Dict[str, Any]:
        """Lädt Firebase-Konfiguration"""
        if self._config is None:
            self._config = {
                "service_account_path": self.service_account_path,
                "storage_bucket": self.storage_bucket,
                "configured": self.is_configured()
            }
        return self._config
    
    def load_service_account(self) -> Optional[Dict[str, Any]]:
        """Lädt Service Account JSON"""
        if not self.service_account_path or not os.path.exists(self.service_account_path):
            return None
        
        try:
            with open(self.service_account_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Fehler beim Laden des Service Accounts: {e}")
            return None
    
    def get_project_id(self) -> Optional[str]:
        """Gibt die Firebase Project ID zurück"""
        service_account = self.load_service_account()
        if service_account:
            return service_account.get("project_id")
        return None
    
    def validate_config(self) -> Tuple[bool, str]:
        """Validiert die Firebase-Konfiguration"""
        if not self.service_account_path:
            return False, "FIREBASE_SERVICE_ACCOUNT_KEY_PATH ist nicht gesetzt"
        
        if not os.path.exists(self.service_account_path):
            return False, f"Service Account Datei nicht gefunden: {self.service_account_path}"
        
        if not self.storage_bucket:
            return False, "FIREBASE_STORAGE_BUCKET ist nicht gesetzt"
        
        service_account = self.load_service_account()
        if not service_account:
            return False, "Service Account konnte nicht geladen werden"
        
        return True, "Konfiguration ist gültig"
    
    @staticmethod
    def get_mcp_config_template() -> Dict[str, Any]:
        """Gibt eine Template-Konfiguration für MCP zurück"""
        return {
            "mcpServers": {
                "firebase": {
                    "command": "npx",
                    "args": [
                        "-y",
                        "firebase-tools@latest",
                        "experimental:mcp"
                    ],
                    "env": {
                        "SERVICE_ACCOUNT_KEY_PATH": "${FIREBASE_SERVICE_ACCOUNT_KEY_PATH}",
                        "FIREBASE_STORAGE_BUCKET": "${FIREBASE_STORAGE_BUCKET}"
                    }
                }
            }
        }
    
    def get_setup_instructions(self) -> str:
        """Gibt Setup-Anweisungen zurück"""
        return """
Firebase MCP Setup-Anweisungen:

1. Firebase Service Account erstellen:
   - Gehe zu Firebase Console: https://console.firebase.google.com/
   - Wähle dein Projekt aus
   - Gehe zu Einstellungen > Service Accounts
   - Klicke auf "Neuen privaten Schlüssel generieren"
   - Speichere die JSON-Datei sicher

2. Umgebungsvariablen setzen:
   - FIREBASE_SERVICE_ACCOUNT_KEY_PATH: Pfad zur Service Account JSON-Datei
   - FIREBASE_STORAGE_BUCKET: Dein Firebase Storage Bucket (z.B. projekt-id.appspot.com)

3. MCP-Konfiguration:
   - Die mcp.json Datei in diesem Projekt enthält die Konfiguration
   - Kopiere die Konfiguration in deine Cursor MCP-Einstellungen (~/.cursor/mcp.json)
   - Oder setze die Umgebungsvariablen in deinem System

4. Firebase MCP Server starten:
   - Der Server wird automatisch von Cursor gestartet, wenn MCP konfiguriert ist
   - Du kannst Firebase-Ressourcen über MCP-Tools abrufen
"""

def get_firebase_mcp() -> FirebaseMCP:
    """Factory-Funktion für FirebaseMCP Instanz"""
    return FirebaseMCP()

