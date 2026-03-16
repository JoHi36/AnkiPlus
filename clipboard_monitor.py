"""
Clipboard-Monitor für automatische Token-Erkennung
Überwacht Clipboard und erkennt Firebase ID Tokens automatisch
"""

import json
import base64
from aqt.qt import QClipboard, QApplication

# Globale Variable für letzten Clipboard-Inhalt (verhindert doppelte Verarbeitung)
_last_clipboard_content = None

def is_firebase_token(text):
    """
    Prüft ob Text ein Firebase ID Token ist
    Firebase ID Tokens sind JWT (JSON Web Tokens) mit 3 Teilen (header.payload.signature)
    """
    if not text or len(text) < 100:
        return False
    
    # JWT Format: header.payload.signature (alle Base64-encoded)
    parts = text.split('.')
    if len(parts) != 3:
        return False
    
    try:
        # Versuche Header zu dekodieren
        header = parts[0]
        # Base64 URL-safe decode
        header += '=' * (4 - len(header) % 4)  # Padding
        header_decoded = base64.urlsafe_b64decode(header)
        header_json = json.loads(header_decoded)
        
        # Prüfe ob es ein JWT ist
        if header_json.get('typ') == 'JWT' and 'alg' in header_json:
            # Prüfe Payload für Firebase-spezifische Felder
            payload = parts[1]
            payload += '=' * (4 - len(payload) % 4)  # Padding
            payload_decoded = base64.urlsafe_b64decode(payload)
            payload_json = json.loads(payload_decoded)
            
            # Firebase ID Tokens haben typischerweise diese Felder
            if 'iss' in payload_json and 'firebase' in payload_json.get('iss', '').lower():
                return True
            # Oder prüfe auf andere Firebase-Indikatoren
            if 'aud' in payload_json and 'user_id' in payload_json:
                return True
            # Oder prüfe auf sub (user ID) - Firebase hat immer sub
            if 'sub' in payload_json and 'iat' in payload_json:
                # Sehr wahrscheinlich ein Firebase Token
                return True
            # Oder einfach: sehr langer Token (typisch für Firebase ID Tokens)
            if len(text) > 500:
                return True
    except:
        # Wenn Dekodierung fehlschlägt, ist es wahrscheinlich kein JWT
        pass
    
    return False

def check_clipboard_for_token():
    """
    Prüft Clipboard auf Firebase ID Token
    @returns: (token, True) wenn Token gefunden, (None, False) sonst
    """
    global _last_clipboard_content
    
    try:
        clipboard = QApplication.clipboard()
        if not clipboard:
            return None, False
        
        clipboard_text = clipboard.text()
        
        # Prüfe ob Clipboard-Inhalt sich geändert hat
        if clipboard_text == _last_clipboard_content:
            return None, False
        
        _last_clipboard_content = clipboard_text
        
        # Prüfe ob es ein Firebase Token ist
        if is_firebase_token(clipboard_text):
            print(f"🔐 Firebase Token im Clipboard erkannt (Länge: {len(clipboard_text)})")
            return clipboard_text, True
        
        return None, False
    except Exception as e:
        print(f"⚠️ Fehler beim Prüfen des Clipboards: {e}")
        return None, False

