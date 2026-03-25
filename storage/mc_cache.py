"""
MC Cache Module
Speichert und lädt Multiple-Choice-Optionen pro Karte,
damit sie nicht bei jeder Sitzung neu generiert werden müssen.
"""

import os
import json
import hashlib
import random
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


_CACHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mc_cache.json')
_cache = None


def _load_cache():
    """Lade Cache von Disk (lazy)."""
    global _cache
    if _cache is not None:
        return _cache
    try:
        if os.path.exists(_CACHE_PATH):
            with open(_CACHE_PATH, 'r', encoding='utf-8') as f:
                _cache = json.load(f)
        else:
            _cache = {}
    except (json.JSONDecodeError, IOError):
        _cache = {}
    return _cache


def _save_cache():
    """Speichere Cache auf Disk."""
    global _cache
    if _cache is None:
        return
    try:
        with open(_CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump(_cache, f, ensure_ascii=False, indent=None)
    except IOError as e:
        logger.error("MC Cache: Fehler beim Speichern: %s", e)


def _make_hash(question, answer):
    """Erstelle Hash aus Frage+Antwort zur Invalidierung bei Änderungen."""
    content = (question + '|||' + answer).encode('utf-8')
    return hashlib.sha256(content).hexdigest()[:12]


def get_cached_mc(card_id, question, answer):
    """
    Gibt gecachte MC-Optionen zurück (bereits geshuffled), oder None.
    Invalidiert automatisch wenn sich Frage/Antwort geändert hat.
    """
    cache = _load_cache()
    key = str(card_id)
    entry = cache.get(key)
    if not entry:
        return None

    # Prüfe ob Karte sich geändert hat
    current_hash = _make_hash(question, answer)
    if entry.get('question_hash') != current_hash:
        # Karte wurde geändert → Cache ungültig
        del cache[key]
        _save_cache()
        return None

    options = entry.get('options')
    if not options or not isinstance(options, list) or len(options) < 4:
        return None

    # Kopie erstellen und shufflen
    shuffled = list(options)
    random.shuffle(shuffled)
    return shuffled


def save_mc_cache(card_id, question, answer, options):
    """Speichere MC-Optionen für eine Karte."""
    cache = _load_cache()
    key = str(card_id)
    cache[key] = {
        'options': options,
        'question_hash': _make_hash(question, answer),
        'created_at': datetime.now().isoformat(),
    }
    _save_cache()


def clear_mc_cache(card_id=None):
    """Lösche Cache (komplett oder für eine Karte)."""
    global _cache
    cache = _load_cache()
    if card_id is not None:
        cache.pop(str(card_id), None)
    else:
        cache.clear()
    _save_cache()
