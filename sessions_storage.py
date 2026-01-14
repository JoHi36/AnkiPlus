"""
Session-Storage für das Anki Chatbot Addon
Speichert Chat-Sessions persistent als JSON-Datei
"""

import json
import os
from datetime import datetime

# Maximale Anzahl an Nachrichten pro Session
MAX_MESSAGES_PER_SESSION = 100

# Maximale Anzahl an Sessions
MAX_SESSIONS = 50

def get_sessions_path():
    """Gibt den Pfad zur Sessions-Datei zurück"""
    addon_dir = os.path.dirname(__file__)
    return os.path.join(addon_dir, "sessions.json")

def load_sessions():
    """
    Lädt Sessions aus der JSON-Datei
    
    Returns:
        list: Liste der Sessions oder leere Liste bei Fehler
    """
    sessions_path = get_sessions_path()
    # #region agent log
    try:
        log_path = os.path.join(os.path.dirname(__file__), '.cursor', 'debug.log')
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, 'a', encoding='utf-8') as f:
            import time
            log_entry = {"location": "sessions_storage.py:28", "message": "load_sessions called", "data": {"sessionsPath": sessions_path, "fileExists": os.path.exists(sessions_path)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        pass
    # #endregion
    
    if not os.path.exists(sessions_path):
        print("sessions_storage: Keine Sessions-Datei vorhanden, starte mit leerer Liste")
        # #region agent log
        try:
            with open(log_path, 'a', encoding='utf-8') as f:
                import time
                log_entry = {"location": "sessions_storage.py:31", "message": "Sessions file does not exist", "data": {}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                f.write(json.dumps(log_entry) + "\n")
        except Exception as e:
            pass
        # #endregion
        return []
    
    try:
        with open(sessions_path, 'r', encoding='utf-8') as f:
            sessions = json.load(f)
            
        # Validierung: Stelle sicher dass es ein Array ist
        if not isinstance(sessions, list):
            print("sessions_storage: Sessions-Daten sind kein Array, setze zurück")
            # #region agent log
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    import time
                    log_entry = {"location": "sessions_storage.py:40", "message": "Sessions data is not an array", "data": {"sessionsType": type(sessions).__name__}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                    f.write(json.dumps(log_entry) + "\n")
            except Exception as e:
                pass
            # #endregion
            return []
        
        print(f"sessions_storage: {len(sessions)} Sessions geladen")
        # #region agent log
        try:
            with open(log_path, 'a', encoding='utf-8') as f:
                import time
                log_entry = {"location": "sessions_storage.py:44", "message": "Sessions loaded successfully", "data": {"sessionsCount": len(sessions)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                f.write(json.dumps(log_entry) + "\n")
        except Exception as e:
            pass
        # #endregion
        return sessions
        
    except json.JSONDecodeError as e:
        print(f"sessions_storage: JSON-Fehler beim Laden: {e}")
        return []
    except Exception as e:
        print(f"sessions_storage: Fehler beim Laden der Sessions: {e}")
        return []

def save_sessions(sessions):
    """
    Speichert Sessions in die JSON-Datei
    
    Args:
        sessions: Liste der Sessions zum Speichern
        
    Returns:
        bool: True bei Erfolg, False bei Fehler
    """
    sessions_path = get_sessions_path()
    
    # #region agent log
    log_path = os.path.join(os.path.dirname(__file__), '.cursor', 'debug.log')
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, 'a', encoding='utf-8') as f:
            import json as json_module
            import time
            log_entry = {"location": "sessions_storage.py:101", "message": "save_sessions called", "data": {"sessionsCount": len(sessions), "sessionsIsArray": isinstance(sessions, list)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
            f.write(json_module.dumps(log_entry) + "\n")
    except Exception as e:
        pass
    # #endregion
    
    try:
        # Validierung
        if not isinstance(sessions, list):
            print("sessions_storage: Ungültige Daten (kein Array)")
            # #region agent log
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    import json as json_module
                    import time
                    log_entry = {"location": "sessions_storage.py:107", "message": "save_sessions validation failed", "data": {"sessionsType": type(sessions).__name__}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                    f.write(json_module.dumps(log_entry) + "\n")
            except Exception as e:
                pass
            # #endregion
            return False
        
        # CRITICAL FIX: Prevent overwriting existing sessions with empty array
        # This prevents race conditions where the frontend sends empty arrays
        # before sessions are properly loaded
        if len(sessions) == 0 and os.path.exists(sessions_path):
            try:
                existing_sessions = load_sessions()
                if len(existing_sessions) > 0:
                    print(f"sessions_storage: Verhindere Überschreibung von {len(existing_sessions)} Sessions mit leerem Array")
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            import json as json_module
                            import time
                            log_entry = {"location": "sessions_storage.py:120", "message": "Prevented overwrite with empty array", "data": {"existingSessionsCount": len(existing_sessions)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                            f.write(json_module.dumps(log_entry) + "\n")
                    except Exception as e:
                        pass
                    # #endregion
                    return True  # Return success to avoid error messages, but don't overwrite
            except Exception as e:
                # If we can't load existing sessions, proceed with save (might be first save)
                pass
        
        # Limitiere Anzahl der Sessions
        limited_sessions = sessions[-MAX_SESSIONS:]
        
        # Limitiere Nachrichten pro Session
        cleaned_sessions = []
        for session in limited_sessions:
            cleaned_session = dict(session)
            if 'messages' in cleaned_session:
                cleaned_session['messages'] = cleaned_session['messages'][-MAX_MESSAGES_PER_SESSION:]
            cleaned_sessions.append(cleaned_session)
        
        # Stelle sicher, dass das Verzeichnis existiert
        os.makedirs(os.path.dirname(sessions_path), exist_ok=True)
        
        with open(sessions_path, 'w', encoding='utf-8') as f:
            json.dump(cleaned_sessions, f, indent=2, ensure_ascii=False)
        
        print(f"sessions_storage: {len(cleaned_sessions)} Sessions gespeichert nach {sessions_path}")
        return True
        
    except Exception as e:
        print(f"sessions_storage: Fehler beim Speichern: {e}")
        
        # Bei Speicherfehler: Versuche mit reduzierten Daten
        try:
            print("sessions_storage: Versuche mit reduzierten Daten...")
            reduced = sessions[-10:]
            reduced_cleaned = []
            for session in reduced:
                cleaned = dict(session)
                if 'messages' in cleaned:
                    cleaned['messages'] = cleaned['messages'][-20:]
                reduced_cleaned.append(cleaned)
            
            with open(sessions_path, 'w', encoding='utf-8') as f:
                json.dump(reduced_cleaned, f, indent=2, ensure_ascii=False)
            
            print("sessions_storage: Reduzierte Sessions gespeichert")
            return True
        except Exception as e2:
            print(f"sessions_storage: Auch reduziertes Speichern fehlgeschlagen: {e2}")
            return False

def delete_all_sessions():
    """
    Löscht alle Sessions
    
    Returns:
        bool: True bei Erfolg
    """
    sessions_path = get_sessions_path()
    
    try:
        if os.path.exists(sessions_path):
            os.remove(sessions_path)
        print("sessions_storage: Alle Sessions gelöscht")
        return True
    except Exception as e:
        print(f"sessions_storage: Fehler beim Löschen: {e}")
        return False


