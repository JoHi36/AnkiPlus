"""
Image Search: Bildersuche über PubChem und Wikimedia Commons.
Extrahiert aus bridge.py für bessere Modularität.
"""

import json
import base64
import hashlib
import requests
from urllib.parse import unquote

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


def search_image(query, image_type="general"):
    """Sucht nach Bildern basierend auf Query und Typ (molecule, anatomy, general)."""
    try:
        # 1. PubChem für Moleküle
        if image_type == "molecule" or "molecule" in query.lower() or "molecular" in query.lower():
            pubchem_url = _search_pubchem(query)
            if pubchem_url:
                return json.dumps({
                    "success": True,
                    "imageUrl": pubchem_url,
                    "source": "pubchem",
                    "description": f"Molekülstruktur: {query}",
                    "error": None
                })

        # 2. Wikimedia Commons für wissenschaftliche Bilder
        commons_url = _search_wikimedia_commons(query)
        if commons_url:
            return json.dumps({
                "success": True,
                "imageUrl": commons_url,
                "source": "wikimedia",
                "description": f"Wissenschaftliches Bild: {query}",
                "error": None
            })

        # 3. Kein Ergebnis
        return json.dumps({
            "success": False,
            "imageUrl": None,
            "source": None,
            "description": None,
            "error": f"Kein passendes Bild für '{query}' gefunden. Verwende stattdessen direkte URLs zu Wikimedia Commons oder PubChem."
        })

    except Exception as e:
        return json.dumps({
            "success": False,
            "imageUrl": None,
            "source": None,
            "description": None,
            "error": f"Fehler bei Bildsuche: {str(e)[:100]}"
        })


def _search_pubchem(query):
    """Sucht nach Molekülbildern in PubChem. Gibt Bild-URL oder None zurück."""
    try:
        search_url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{}/JSON"
        query_encoded = requests.utils.quote(query)

        response = requests.get(
            search_url.format(query_encoded),
            timeout=5,
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        )

        if response.status_code == 200:
            data = response.json()
            if 'PC_Compounds' in data and len(data['PC_Compounds']) > 0:
                cid = data['PC_Compounds'][0].get('id', {}).get('id', {}).get('cid', [None])[0]
                if cid:
                    return f"https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid={cid}&t=l"
    except Exception as e:
        logger.error(f"_search_pubchem: Fehler bei PubChem-Suche: {e}")

    return None


def _search_wikimedia_commons(query):
    """Sucht nach Bildern in Wikimedia Commons. Gibt Bild-URL oder None zurück."""
    try:
        api_url = "https://commons.wikimedia.org/w/api.php"
        params = {
            'action': 'query',
            'format': 'json',
            'list': 'search',
            'srsearch': query,
            'srnamespace': 6,
            'srlimit': 5,
            'srprop': 'size|wordcount|timestamp',
            'origin': '*'
        }

        response = requests.get(
            api_url,
            params=params,
            timeout=5,
            headers={'User-Agent': 'Anki-Chatbot-Addon/1.0 (Educational Tool)'}
        )

        if response.status_code == 200:
            data = response.json()
            if 'query' in data and 'search' in data['query']:
                results = data['query']['search']
                if results:
                    filename = results[0]['title'].replace('File:', '')
                    filename_encoded = requests.utils.quote(filename.replace(' ', '_'))
                    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{filename_encoded}?width=800"
    except Exception as e:
        logger.error(f"_search_wikimedia_commons: Fehler bei Wikimedia-Suche: {e}")

    return None


def _normalize_wikimedia_url(url):
    """Konvertiert Wikimedia Special:FilePath URLs in direkte upload.wikimedia.org URLs."""
    if 'commons.wikimedia.org' not in url or 'Special:FilePath' not in url:
        return url

    try:
        filename_part = url.split('Special:FilePath/')[-1].split('?')[0]
        filename = unquote(filename_part).replace(' ', '_')
        md5_hash = hashlib.md5(filename.encode('utf-8')).hexdigest()

        return f"https://upload.wikimedia.org/wikipedia/commons/{md5_hash[0]}/{md5_hash[:2]}/{filename}"
    except Exception as e:
        logger.error(f"fetchImage: Fehler bei URL-Normalisierung: {e}, verwende Original-URL")
        return url


def fetch_image(url):
    """Lädt ein Bild von URL und gibt Base64-Data-URL zurück."""
    try:
        # URL-Validierung
        if not url or not isinstance(url, str) or len(url.strip()) == 0:
            return json.dumps({"success": False, "dataUrl": None, "error": "Ungültige URL: Leere oder ungültige URL"})

        url = url.strip()

        if not url.startswith(('http://', 'https://')):
            return json.dumps({"success": False, "dataUrl": None, "error": "Ungültige URL: Nur HTTP/HTTPS URLs erlaubt"})

        if any(char in url for char in ['<', '>', '"', "'", '\n', '\r', '\t']):
            return json.dumps({"success": False, "dataUrl": None, "error": "Ungültige URL: Enthält unerlaubte Zeichen"})

        # URL-Struktur validieren
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            if not parsed.hostname or len(parsed.hostname) < 4:
                return json.dumps({"success": False, "dataUrl": None, "error": "Ungültige URL: Keine gültige Domain"})
            if parsed.hostname in ['localhost', '127.0.0.1', '0.0.0.0']:
                return json.dumps({"success": False, "dataUrl": None, "error": "Ungültige URL: Lokale Adressen nicht erlaubt"})
        except Exception as parse_error:
            return json.dumps({"success": False, "dataUrl": None, "error": f"Ungültige URL: {str(parse_error)[:50]}"})

        # URL-Normalisierung für Wikimedia Commons
        original_url = url
        url = _normalize_wikimedia_url(url)

        # Bild laden
        try:
            response = requests.get(url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            })
            response.raise_for_status()
        except requests.exceptions.HTTPError as e:
            if url != original_url and e.response.status_code == 404:
                try:
                    response = requests.get(original_url, timeout=10, headers={
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    })
                    response.raise_for_status()
                    url = original_url
                except Exception:
                    status_code = e.response.status_code if hasattr(e, 'response') else 'Unknown'
                    return json.dumps({"success": False, "dataUrl": None, "error": f"Bild nicht verfügbar (HTTP {status_code})"})
            else:
                status_code = e.response.status_code if hasattr(e, 'response') else 'Unknown'
                return json.dumps({"success": False, "dataUrl": None, "error": f"Bild nicht verfügbar (HTTP {status_code})"})
        except requests.exceptions.Timeout:
            return json.dumps({"success": False, "dataUrl": None, "error": "Das Bild konnte nicht rechtzeitig geladen werden (Timeout)"})
        except requests.exceptions.RequestException:
            return json.dumps({"success": False, "dataUrl": None, "error": "Bild konnte nicht geladen werden (Netzwerkfehler)"})

        # Größenprüfung
        max_size = 10 * 1024 * 1024  # 10 MB
        content_length = response.headers.get('content-length')
        if content_length and int(content_length) > max_size:
            return json.dumps({"success": False, "dataUrl": None, "error": "Bild zu groß: Maximale Größe 10 MB"})
        if len(response.content) > max_size:
            return json.dumps({"success": False, "dataUrl": None, "error": "Bild zu groß: Maximale Größe 10 MB"})

        # Content-Type bestimmen
        content_type = response.headers.get('content-type', 'image/jpeg')
        if ';' in content_type:
            content_type = content_type.split(';')[0].strip()

        valid_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
        if not any(content_type.startswith(t) for t in valid_types):
            # Aus URL erkennen
            ext_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                       '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'}
            detected = None
            for ext, mime in ext_map.items():
                if ext in url.lower():
                    detected = mime
                    break

            if not detected:
                # Magic Bytes prüfen
                magic = response.content[:4]
                if magic.startswith(b'\xff\xd8\xff'):
                    detected = 'image/jpeg'
                elif magic.startswith(b'\x89PNG'):
                    detected = 'image/png'
                elif magic.startswith(b'GIF8'):
                    detected = 'image/gif'
                elif magic.startswith(b'RIFF') and b'WEBP' in response.content[:12]:
                    detected = 'image/webp'

            if not detected:
                return json.dumps({"success": False, "dataUrl": None, "error": "Ungültiger Dateityp: Kein unterstütztes Bildformat"})
            content_type = detected

        # Base64 konvertieren
        base64_data = base64.b64encode(response.content).decode('utf-8')
        data_url = f"data:{content_type};base64,{base64_data}"

        return json.dumps({"success": True, "dataUrl": data_url, "error": None})

    except Exception as e:
        return json.dumps({"success": False, "dataUrl": None, "error": f"Fehler beim Laden des Bildes: {str(e)[:100]}"})
