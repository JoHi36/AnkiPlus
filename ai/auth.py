"""
Auth Manager: Token-Verwaltung, JWT-Validierung und proaktiver Refresh.
Extrahiert aus ai_handler.py für bessere Modularität.
"""

import json
import time
import base64
import requests

try:
    from ..config import (
        get_config, update_config, get_auth_token, get_refresh_token,
        get_backend_url, get_or_create_device_id
    )
except ImportError:
    from config import (
        get_config, update_config, get_auth_token, get_refresh_token,
        get_backend_url, get_or_create_device_id
    )


def get_auth_headers():
    """Gibt Authorization Headers zurück für Backend-Requests."""
    device_id = get_or_create_device_id()
    headers = {
        "Content-Type": "application/json",
        "X-Device-Id": device_id
    }

    ensure_valid_token()

    auth_token = get_auth_token()
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    return headers


def refresh_auth_token():
    """Ruft Backend Refresh-Endpoint auf und speichert neues Token."""
    try:
        refresh_token = get_refresh_token()
        if not refresh_token:
            print("_refresh_auth_token: Kein Refresh-Token vorhanden")
            return False

        backend_url = get_backend_url()
        refresh_url = f"{backend_url}/auth/refresh"

        response = requests.post(
            refresh_url,
            json={"refreshToken": refresh_token},
            headers={"Content-Type": "application/json"},
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            new_token = data.get("idToken")
            if new_token:
                new_refresh = data.get("refreshToken", "")
                update_kwargs = {
                    "auth_token": new_token,
                    "auth_validated": True,
                }
                if new_refresh:
                    update_kwargs["refresh_token"] = new_refresh
                update_config(**update_kwargs)
                print("_refresh_auth_token: Token erfolgreich erneuert")
                return True
            else:
                print("_refresh_auth_token: Kein neues Token in Response")
                return False
        elif response.status_code == 401:
            print("_refresh_auth_token: Refresh-Token ungültig (401)")
            update_config(auth_validated=False)
            return False
        else:
            print(f"_refresh_auth_token: Refresh fehlgeschlagen (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"_refresh_auth_token: Fehler beim Token-Refresh: {e}")
        return False


def ensure_valid_token():
    """Prüft Token-Gültigkeit und refresht proaktiv vor Ablauf."""
    auth_token = get_auth_token()
    if not auth_token:
        return False

    try:
        # JWT: header.payload.signature
        parts = auth_token.split('.')
        if len(parts) != 3:
            return bool(auth_token)

        # Payload base64url-decodieren
        payload_b64 = parts[1]
        payload_b64 += '=' * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))

        exp = payload.get('exp', 0)
        now = time.time()

        # Token läuft in weniger als 5 Minuten ab → proaktiv refreshen
        if exp - now < 300:
            print(f"🔄 Token läuft in {int(exp - now)}s ab, proaktiver Refresh")
            if refresh_auth_token():
                return True
            if exp < now:
                return False
        return True
    except Exception:
        return bool(auth_token)
