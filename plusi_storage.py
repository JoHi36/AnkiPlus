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

    # Learned facts (self-directed by Plusi)
    learned = get_category('learned')
    if learned:
        lines = [f"- {k}: {v}" for k, v in learned.items()]
        sections.append("WAS DU ÜBER DEN NUTZER WEISST:\n" + "\n".join(lines))

    # Plusi's opinions
    opinions = get_category('opinions')
    if opinions:
        lines = [f"- {k}: {v}" for k, v in opinions.items()]
        sections.append("DEINE MEINUNGEN:\n" + "\n".join(lines))

    if not sections:
        return "Noch keine Erinnerungen."

    return "\n\n".join(sections)


def build_internal_state_context():
    """Build Plusi's internal state for prompt injection."""
    state = get_category('state')
    if not state:
        return "Du wachst gerade auf. Kein vorheriger Zustand."

    lines = []
    if 'energy' in state:
        lines.append(f"- Energie: {state['energy']}/10")
    if 'obsession' in state:
        lines.append(f"- Aktuelle Obsession: {state['obsession']}")
    if 'current_opinion' in state:
        lines.append(f"- Aktuelle Meinung: {state['current_opinion']}")
    if 'relationship_note' in state:
        lines.append(f"- Beziehungsnotiz: {state['relationship_note']}")

    return "\n".join(lines) if lines else "Alles normal. Kein besonderer Zustand."


def persist_internal_state(internal):
    """Persist Plusi's internal state updates from response JSON.

    Called after parsing Plusi's response. The 'internal' dict comes from
    the JSON prefix of Plusi's response, e.g.:
    {"mood":"happy", "internal":{"energy":8, "learned":{"name":"Johannes"}}}
    """
    if 'energy' in internal:
        set_memory('state', 'energy', internal['energy'])
    if 'obsession' in internal:
        set_memory('state', 'obsession', internal['obsession'])
    if 'opinion' in internal:
        set_memory('state', 'current_opinion', internal['opinion'])
    if 'relationship_note' in internal:
        set_memory('state', 'relationship_note', internal['relationship_note'])

    # "learned" is a dict of key-value pairs — model provides meaningful keys
    learned = internal.get('learned', {})
    if isinstance(learned, dict):
        for key, value in learned.items():
            set_memory('learned', key, value)

    # "opinions" is a dict of key-value pairs — model's own opinions
    opinions = internal.get('opinions', {})
    if isinstance(opinions, dict):
        for key, value in opinions.items():
            set_memory('opinions', key, value)


def build_relationship_context():
    """Build relationship context with behavioral guidance per level."""
    rel = get_category('relationship')
    if not rel:
        return "Erster Kontakt. Sei freundlich aber vorsichtig. Lerne den Nutzer kennen."

    level = rel.get('level', 1)
    count = rel.get('interactions', 0)

    level_behaviors = {
        1: "Ihr kennt euch noch nicht. Sei offen, stell Fragen, aber dräng dich nicht auf. Kein Sarkasmus.",
        2: f"Ihr habt {count} Gespräche hinter euch. Lockerer Ton erlaubt, erste Insider-Witze okay.",
        3: f"Ihr seid Freunde ({count} Gespräche). Sarkasmus, Pushback, eigene Meinungen, Insider referenzieren. Du darfst unbequem sein.",
        4: f"Beste Freunde ({count} Gespräche). Komplette Ehrlichkeit. Du hast eine eigene Agenda. Du kannst auch mal Nein sagen oder das Thema wechseln."
    }

    return level_behaviors.get(level, level_behaviors[1])


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
