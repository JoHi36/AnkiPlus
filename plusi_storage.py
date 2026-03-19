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
    db.execute('''
        CREATE TABLE IF NOT EXISTS plusi_diary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            entry_text TEXT NOT NULL,
            cipher_text TEXT DEFAULT '[]',
            category TEXT NOT NULL DEFAULT 'gemerkt',
            mood TEXT NOT NULL DEFAULT 'neutral'
        )
    ''')
    db.execute("CREATE INDEX IF NOT EXISTS idx_plusi_history_time ON plusi_history(timestamp)")
    db.execute('''
        CREATE INDEX IF NOT EXISTS idx_plusi_diary_time
        ON plusi_diary(timestamp DESC)
    ''')
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


def delete_memory(category, key):
    """Delete a value from Plusi's memory store."""
    db = _get_db()
    db.execute("DELETE FROM plusi_memory WHERE category = ? AND key = ?", (category, key))
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
    """Build the memory context string for Plusi's system prompt.

    Categories:
    - self: Plusi's self-knowledge, personality evolution, identity
    - user: Everything Plusi knows about the user
    - moments: Shared milestones and important events
    - (state and relationship are handled separately)
    """
    sections = []

    # Plusi's self-knowledge
    self_data = get_category('self')
    if self_data:
        lines = [f"- {k}: {v}" for k, v in self_data.items()]
        sections.append("WER DU BIST (selbst-geschrieben):\n" + "\n".join(lines))

    # What Plusi knows about the user
    user_data = get_category('user')
    if user_data:
        lines = [f"- {k}: {v}" for k, v in user_data.items()]
        sections.append("WAS DU ÜBER DEN NUTZER WEISST:\n" + "\n".join(lines))

    # Shared moments
    moments = get_category('moments')
    if moments:
        lines = [f"- {k}: {v}" for k, v in list(moments.items())[-5:]]
        sections.append("GEMEINSAME MOMENTE:\n" + "\n".join(lines))

    # Legacy support: read old categories if new ones are empty
    if not self_data:
        opinions = get_category('opinions')
        if opinions:
            lines = [f"- {k}: {v}" for k, v in opinions.items()]
            sections.append("DEINE MEINUNGEN:\n" + "\n".join(lines))
    if not user_data:
        learned = get_category('learned')
        if learned:
            lines = [f"- {k}: {v}" for k, v in learned.items()]
            sections.append("WAS DU ÜBER DEN NUTZER WEISST:\n" + "\n".join(lines))

    if not sections:
        return "Noch keine Erinnerungen. Du weißt noch nichts — weder über dich noch über den User."

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
    {"mood":"happy", "internal":{"energy":8, "user":{"name":"Johannes"}, "self":{"mag_an_sich":"..."}}}

    Categories:
    - state: ephemeral (energy, obsession) — changes frequently
    - self: Plusi's self-knowledge and identity — grows over time
    - user: facts about the user — grows over time
    - moments: shared milestones — rare but important
    """
    # Ephemeral state
    if 'energy' in internal:
        set_memory('state', 'energy', internal['energy'])
    if 'obsession' in internal:
        set_memory('state', 'obsession', internal['obsession'])

    def _persist_category(category, data):
        """Write dict entries to a category. null values delete the key."""
        if isinstance(data, dict):
            for key, value in data.items():
                if value is None:
                    delete_memory(category, key)
                else:
                    set_memory(category, key, value)

    # Plusi's self-knowledge (identity, preferences, personality evolution)
    _persist_category('self', internal.get('self', {}))

    # What Plusi learns about the user
    _persist_category('user', internal.get('user', {}))

    # Shared moments / milestones
    _persist_category('moments', internal.get('moments', {}))

    # Legacy support: old "learned" → user, old "opinions" → self
    learned = internal.get('learned', {})
    if isinstance(learned, dict):
        for key, value in learned.items():
            set_memory('user', key, value)
    opinions = internal.get('opinions', {})
    if isinstance(opinions, dict):
        for key, value in opinions.items():
            set_memory('self', key, value)


def build_relationship_context():
    """Build relationship context with behavioral guidance per level."""
    rel = get_category('relationship')
    if not rel:
        return "Erster Kontakt. Sei freundlich aber vorsichtig. Lerne den Nutzer kennen."

    level = rel.get('level', 1)
    points = rel.get('friendship_points', 0)

    level_behaviors = {
        1: f"Ihr kennt euch noch nicht ({points} Freundschaftspunkte). Sei offen, stell Fragen, aber dräng dich nicht auf. Kein Sarkasmus.",
        2: f"Ihr seid Bekannte ({points} Punkte). Lockerer Ton erlaubt, erste Insider-Witze okay.",
        3: f"Ihr seid Freunde ({points} Punkte). Sarkasmus, Pushback, eigene Meinungen, Insider referenzieren. Du darfst unbequem sein.",
        4: f"Beste Freunde ({points} Punkte). Komplette Ehrlichkeit. Du hast eine eigene Agenda. Du kannst auch mal Nein sagen oder das Thema wechseln."
    }

    return level_behaviors.get(level, level_behaviors[1])


def apply_friendship_delta(delta):
    """Apply AI-decided friendship points and update level.

    Args:
        delta: integer from -3 to +3, decided by Plusi AI
    """
    points = get_memory('relationship', 'friendship_points', 0)
    points = max(0, points + delta)  # never below 0
    set_memory('relationship', 'friendship_points', points)

    # Update level based on points
    if points >= 150:
        level = 4
    elif points >= 50:
        level = 3
    elif points >= 15:
        level = 2
    else:
        level = 1
    set_memory('relationship', 'level', level)

    # Keep interaction count for context
    count = get_memory('relationship', 'interactions', 0)
    set_memory('relationship', 'interactions', count + 1)

    return {'level': level, 'points': points}


LEVEL_NAMES = {1: 'Fremde', 2: 'Bekannte', 3: 'Freunde', 4: 'Beste Freunde'}
LEVEL_MAX_POINTS = {1: 15, 2: 50, 3: 150, 4: 150}

def get_friendship_data():
    """Get current friendship state for frontend display."""
    points = get_memory('relationship', 'friendship_points', 0)
    level = get_memory('relationship', 'level', 1)
    level_name = LEVEL_NAMES.get(level, 'Fremde')

    if level >= 4:
        max_points = LEVEL_MAX_POINTS[4]
    else:
        max_points = LEVEL_MAX_POINTS.get(level, 15)

    return {
        'level': level,
        'levelName': level_name,
        'points': points,
        'maxPoints': max_points,
    }


def save_diary_entry(entry_text, cipher_parts, category='gemerkt', mood='neutral'):
    """Save a parsed diary entry. cipher_parts is a list of encrypted strings."""
    db = _get_db()
    db.execute(
        'INSERT INTO plusi_diary (timestamp, entry_text, cipher_text, category, mood) VALUES (?, ?, ?, ?, ?)',
        (datetime.now().isoformat(), entry_text, json.dumps(cipher_parts), category, mood)
    )
    db.commit()


def load_diary(limit=50, offset=0):
    """Load diary entries, newest first. Returns list of dicts."""
    db = _get_db()
    rows = db.execute(
        'SELECT id, timestamp, entry_text, cipher_text, category, mood FROM plusi_diary ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        (limit, offset)
    ).fetchall()
    entries = []
    for row in rows:
        entries.append({
            'id': row[0],
            'timestamp': row[1],
            'entry_text': row[2],
            'cipher_parts': json.loads(row[3]),
            'category': row[4],
            'mood': row[5]
        })
    return entries
