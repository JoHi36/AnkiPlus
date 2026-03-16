"""
Datei-basierter Token-Handler für Auth-Handshake
Landingpage schreibt Token in Datei, Plugin liest sie
"""

import os
import json
import time
from pathlib import Path

# Token-Datei im Anki-Addon-Verzeichnis
def get_token_file_path():
    """Gibt den Pfad zur Token-Datei zurück"""
    addon_dir = Path(__file__).parent
    return addon_dir / ".anki-auth-token"

def write_token_to_file(token, refresh_token=""):
    """
    Schreibt Token in Datei (wird von Landingpage aufgerufen)
    @param token: Firebase ID Token
    @param refresh_token: Refresh Token (optional)
    @returns: Pfad zur Datei oder None bei Fehler
    """
    try:
        token_file = get_token_file_path()
        data = {
            "token": token,
            "refreshToken": refresh_token,
            "timestamp": time.time()
        }
        
        # Schreibe in temporäre Datei zuerst (atomic write)
        temp_file = token_file.with_suffix('.tmp')
        with open(temp_file, 'w') as f:
            json.dump(data, f)
        
        # Atomar umbenennen
        temp_file.replace(token_file)
        
        print(f"✅ Token in Datei geschrieben: {token_file}")
        return str(token_file)
    except Exception as e:
        print(f"❌ Fehler beim Schreiben der Token-Datei: {e}")
        import traceback
        traceback.print_exc()
        return None

def read_token_from_file():
    """
    Liest Token aus Datei
    @returns: (token, refresh_token) oder (None, None) bei Fehler
    """
    try:
        token_file = get_token_file_path()
        if not token_file.exists():
            return None, None
        
        with open(token_file, 'r') as f:
            data = json.load(f)
        
        token = data.get('token')
        refresh_token = data.get('refreshToken', '')
        
        # Lösche Datei nach erfolgreichem Lesen
        try:
            token_file.unlink()
            print(f"✅ Token-Datei gelesen und gelöscht: {token_file}")
        except Exception as e:
            print(f"⚠️ Konnte Token-Datei nicht löschen: {e}")
        
        return token, refresh_token
    except json.JSONDecodeError as e:
        print(f"⚠️ Token-Datei enthält ungültiges JSON: {e}")
        # Versuche Datei zu löschen
        try:
            get_token_file_path().unlink()
        except:
            pass
        return None, None
    except Exception as e:
        print(f"⚠️ Fehler beim Lesen der Token-Datei: {e}")
        import traceback
        traceback.print_exc()
        return None, None

def check_token_file():
    """Prüft ob Token-Datei existiert"""
    token_file = get_token_file_path()
    return token_file.exists()


