# plusi_storage.py
"""
Persistent storage for Plusi sub-agent.

Two tables in a separate SQLite database (plusi.db):
- plusi_history: conversation log (tutor context + Plusi response + mood)
- plusi_memory: key-value store for user knowledge (future-ready)
"""
import sqlite3
import json
import os
from datetime import datetime

_db = None
_db_path = None


def _get_db():
    global _db, _db_path
    if _db is None:
        _db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plusi.db')
        _db = sqlite3.connect(_db_path, check_same_thread=False)
        _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("PRAGMA foreign_keys=ON")
        _init_tables(_db)
    return _db


def _init_tables(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS plusi_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            context TEXT NOT NULL,
            response TEXT NOT NULL,
            mood TEXT NOT NULL DEFAULT 'neutral',
            deck_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS plusi_memory (
            category TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (category, key)
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_plusi_history_time ON plusi_history(timestamp)")
    db.commit()


def save_interaction(context, response, mood='neutral', deck_id=None):
    """Save a Plusi interaction (tutor context + Plusi response)."""
    db = _get_db()
    db.execute("""
        INSERT INTO plusi_history (timestamp, context, response, mood, deck_id)
        VALUES (?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), context, response, mood, deck_id))
    db.commit()


def load_history(limit=10):
    """Load recent Plusi interactions as conversation pairs for the AI context."""
    db = _get_db()
    cursor = db.execute("""
        SELECT context, response FROM plusi_history
        ORDER BY timestamp DESC LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    rows.reverse()  # chronological order

    history = []
    for context, response in rows:
        history.append({"role": "user", "content": context})
        history.append({"role": "assistant", "content": response})
    return history


def get_memory(category, key, default=None):
    """Get a value from Plusi's memory store."""
    db = _get_db()
    cursor = db.execute("SELECT value FROM plusi_memory WHERE category = ? AND key = ?", (category, key))
    row = cursor.fetchone()
    if row:
        try:
            return json.loads(row[0])
        except (json.JSONDecodeError, TypeError):
            return row[0]
    return default


def set_memory(category, key, value):
    """Set a value in Plusi's memory store."""
    db = _get_db()
    val_str = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    db.execute("""
        INSERT OR REPLACE INTO plusi_memory (category, key, value, updated_at)
        VALUES (?, ?, ?, ?)
    """, (category, key, val_str, datetime.now().isoformat()))
    db.commit()


def get_category(category):
    """Get all entries in a memory category as a dict."""
    db = _get_db()
    cursor = db.execute("SELECT key, value FROM plusi_memory WHERE category = ?", (category,))
    result = {}
    for key, value in cursor.fetchall():
        try:
            result[key] = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            result[key] = value
    return result


def build_memory_context():
    """Build the memory context string for Plusi's system prompt."""
    sections = []

    # User profile
    profile = get_category('user_profile')
    if profile:
        lines = [f"- {k}: {v}" for k, v in profile.items()]
        sections.append("ÜBER DEN NUTZER:\n" + "\n".join(lines))

    # Relationship
    rel = get_category('relationship')
    if rel:
        level = rel.get('level', 1)
        level_desc = {1: 'Fremde — sei freundlich aber vorsichtig',
                      2: 'Bekannte — lockerer, erste Insider erlaubt',
                      3: 'Freunde — Sarkasmus, Pushback, Meinungen',
                      4: 'Beste Freunde — komplette Ehrlichkeit, eigene Agenda'}
        lines = [f"- Interactions: {rel.get('interactions', 0)}",
                 f"- Kennen uns seit: {rel.get('days_known', 0)} Tagen",
                 f"- Level: {level} ({level_desc.get(level, '')})"]
        sections.append("BEZIEHUNG:\n" + "\n".join(lines))

    # Language mirror
    lang = get_category('language')
    if lang:
        words = lang.get('mirror_words', [])
        if words:
            sections.append(f"SPRACH-MIRROR: User nutzt diese Wörter oft: {', '.join(words)} — du darfst sie auch nutzen, aber auf deine Art")

    # Milestones
    milestones = get_category('milestones')
    if milestones:
        lines = [f"- {k}: {v}" for k, v in list(milestones.items())[-5:]]  # last 5
        sections.append("WICHTIGE MOMENTE:\n" + "\n".join(lines))

    # Subjects
    subjects = get_category('subjects')
    if subjects:
        lines = [f"- {k}: {v}" for k, v in subjects.items()]
        sections.append("FÄCHER:\n" + "\n".join(lines))

    if not sections:
        return ""

    return "\n\nDEIN GEDÄCHTNIS (nutze es natürlich, referenziere Momente wenn es passt):\n" + "\n\n".join(sections)


def increment_interaction_count():
    """Increment the interaction counter and update relationship level."""
    db = _get_db()
    count = get_memory('relationship', 'interactions', 0)
    count += 1
    set_memory('relationship', 'interactions', count)

    # Auto-level based on interaction count
    if count >= 100:
        set_memory('relationship', 'level', 4)
    elif count >= 30:
        set_memory('relationship', 'level', 3)
    elif count >= 10:
        set_memory('relationship', 'level', 2)
    else:
        set_memory('relationship', 'level', 1)
