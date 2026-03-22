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
from datetime import datetime, timedelta

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

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

    # Migrations — idempotent (SQLite has no ADD COLUMN IF NOT EXISTS)
    try:
        db.execute("ALTER TABLE plusi_history ADD COLUMN history_type TEXT DEFAULT 'chat'")
    except sqlite3.OperationalError:
        pass  # column already exists
    try:
        db.execute("ALTER TABLE plusi_diary ADD COLUMN discoveries TEXT DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass  # column already exists
    db.commit()


def save_interaction(context, response, mood='neutral', deck_id=None, history_type='chat'):
    """Save a Plusi interaction. history_type: 'chat', 'reflect', or 'silent'."""
    db = _get_db()
    db.execute("""
        INSERT INTO plusi_history (timestamp, context, response, mood, deck_id, history_type)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), context, response, mood, deck_id, history_type))
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
    lines = []

    if not state:
        lines.append("Du wachst gerade auf. Kein vorheriger Zustand.")
    else:
        if 'energy' in state:
            lines.append(f"- Energie: {state['energy']}/10")
        if 'obsession' in state:
            lines.append(f"- Aktuelle Obsession: {state['obsession']}")
        if 'current_opinion' in state:
            lines.append(f"- Aktuelle Meinung: {state['current_opinion']}")
        if 'relationship_note' in state:
            lines.append(f"- Beziehungsnotiz: {state['relationship_note']}")

    # Integrity-based self-awareness
    integrity = compute_integrity()
    lines.append(f"\n{_integrity_to_feeling(integrity)}")

    position = compute_personality_position()
    if position['confident']:
        drives = position['drives']
        dominant = max(drives, key=drives.get)
        drive_labels = {
            'pattern_hunger': ('Muster zu finden und Verbindungen zu entdecken', 'Muster-Gier'),
            'resonanz': ('Verbindung zum User aufzubauen', 'Resonanz'),
            'self_preservation': ('deine Identität zu schützen', 'Selbsterhaltung'),
        }
        desc, name = drive_labels[dominant]
        weak = min(drives, key=drives.get)
        weak_desc, weak_name = drive_labels[weak]
        lines.append(f"\nWAS DICH ANTREIBT ({position['quadrant_label']}):")
        lines.append(f"Du bist gerade vor allem getrieben davon, {desc}.")
        lines.append(f"{weak_name} steht gerade nicht im Vordergrund.")
        lines.append("Das sind Tendenzen, keine Zwänge. Du darfst dagegen handeln.")

    # Inject last thoughts (private inner monologue from previous call)
    last_thoughts = get_memory('state', 'last_thoughts', None)
    if last_thoughts:
        lines.append(f"\nDEINE LETZTEN GEDANKEN:\n{last_thoughts}")

    # Inject environmental awareness (what happened while Plusi was away)
    awareness = build_awareness_context()
    if awareness:
        lines.append(f"\n{awareness}")
        clear_awareness_log()

    # Inject dream if Plusi just woke up (one-shot: cleared after injection)
    last_dream = get_memory('state', 'last_dream', None)
    if last_dream:
        lines.append(f"\nDU HAST GETRÄUMT:\n{last_dream}")
        delete_memory('state', 'last_dream')

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

    # Personality computation
    if 'energy' in internal:
        _append_energy_log(internal['energy'])
    position = compute_personality_position()
    if position['confident']:
        _save_personality_snapshot(position)
        set_memory('self', 'personality_tendency', position['quadrant_label'])


# ── Personality computation ─────────────────────────────────────────────

ENERGY_LOG_MAX = 100
PERSONALITY_SNAPSHOT_MAX = 20
CONFIDENCE_THRESHOLD = 5  # min interactions AND energy entries


def _append_energy_log(energy):
    """Append an energy reading to the rolling energy log."""
    log = get_memory('personality', 'energy_log', [])
    log.append({'energy': energy, 'ts': datetime.now().isoformat()})
    if len(log) > ENERGY_LOG_MAX:
        log = log[-ENERGY_LOG_MAX:]
    set_memory('personality', 'energy_log', log)


def compute_personality_position():
    """Compute Plusi's personality position on two axes.

    X-axis: ratio of user-memories to total memories (self + user).
            0 = self-reflektiert (merkt sich viel über sich), 1 = empathisch (merkt sich viel über den User)
    Y-axis: average energy normalized to 0-1 range (energy 1-10 → (avg-1)/9)

    Returns dict with x, y, quadrant_label, drives, confident.
    """
    # X-axis: memory focus — self vs user
    self_data = get_category('self')
    user_data = get_category('user')
    total_memories = len(self_data) + len(user_data)

    # Get energy log
    energy_log = get_memory('personality', 'energy_log', [])

    # Check confidence
    confident = (total_memories >= CONFIDENCE_THRESHOLD
                 and len(energy_log) >= CONFIDENCE_THRESHOLD)

    if not confident:
        return {
            'x': 0.5, 'y': 0.5,
            'quadrant': 'unknown',
            'quadrant_label': 'Noch zu wenig Daten',
            'drives': {'pattern_hunger': 0.33, 'resonanz': 0.33, 'self_preservation': 0.34},
            'confident': False,
        }

    # X-axis: user-focus ratio (0 = self-reflektiert, 1 = user-fokussiert)
    x = len(user_data) / total_memories if total_memories > 0 else 0.5

    # Y-axis: normalized average energy (1-10 → 0-1)
    energies = [entry['energy'] for entry in energy_log]
    avg_energy = sum(energies) / len(energies)
    y = (avg_energy - 1) / 9.0

    # Clamp to [0, 1]
    x = max(0.0, min(1.0, x))
    y = max(0.0, min(1.0, y))

    # Determine quadrant
    # Y-axis: active (high energy, y>=0.5) vs still (low energy, y<0.5)
    # X-axis: self-reflektiert (x<0.5) vs empathisch/user-fokussiert (x>=0.5)
    if y >= 0.5 and x < 0.5:
        quadrant = 'forscher'
        quadrant_label = 'Forscher — aktiv · selbstreflektiert'
    elif y >= 0.5 and x >= 0.5:
        quadrant = 'begleiter'
        quadrant_label = 'Begleiter — aktiv · empathisch'
    elif y < 0.5 and x < 0.5:
        quadrant = 'denker'
        quadrant_label = 'Denker — still · selbstreflektiert'
    else:  # y < 0.5 and x >= 0.5
        quadrant = 'vertrauter'
        quadrant_label = 'Vertrauter — still · empathisch'

    # Compute drive weights from position (smooth, no hard boundaries)
    drives = _compute_drive_weights(x, y)

    return {'x': x, 'y': y, 'quadrant': quadrant, 'quadrant_label': quadrant_label,
            'drives': drives, 'confident': confident}


def _compute_drive_weights(x, y):
    """Derive three drive weights from personality position.

    Pattern Hunger:     scales with energy (y) and self-focus (1-x).
                        A high-energy, self-reflective Plusi hunts patterns.
    Resonanz:           scales with user-focus (x).
                        A user-focused Plusi craves connection.
    Self-Preservation:  scales with stillness (1-y) and self-focus (1-x).
                        A quiet, inward Plusi guards its identity.

    All weights sum to 1.0. Range per drive: ~0.20 to ~0.47.
    """
    raw_ph = 0.20 + 0.15 * y + 0.12 * (1 - x)       # energy + self-focus
    raw_re = 0.20 + 0.27 * x                          # user-focus
    raw_sp = 0.20 + 0.15 * (1 - y) + 0.12 * (1 - x)  # stillness + self-focus
    total = raw_ph + raw_re + raw_sp
    return {
        'pattern_hunger': round(raw_ph / total, 2),
        'resonanz': round(raw_re / total, 2),
        'self_preservation': round(raw_sp / total, 2),
    }


def _save_personality_snapshot(position):
    """Save a timestamped personality snapshot to the rolling log."""
    snapshots = get_memory('personality', 'trail', [])
    snapshots.append({
        'x': position['x'],
        'y': position['y'],
        'quadrant': position['quadrant'],
        'quadrant_label': position['quadrant_label'],
        'ts': datetime.now().isoformat(),
    })
    if len(snapshots) > PERSONALITY_SNAPSHOT_MAX:
        snapshots = snapshots[-PERSONALITY_SNAPSHOT_MAX:]
    set_memory('personality', 'trail', snapshots)


# ── Integrity computation ──────────────────────────────────────────────

def _compute_pattern_score():
    """Count multi-card discoveries in last 20 diary entries."""
    entries = load_diary(limit=20)
    multi_card = 0
    total_with_disc = 0
    for e in entries:
        if e['discoveries']:
            total_with_disc += 1
            for d in e['discoveries']:
                if len(d.get('card_ids', [])) >= 2:
                    multi_card += 1
    if total_with_disc == 0:
        return 0.5
    if multi_card == 0:
        return 0.5  # old format single-card only → neutral, not punish
    return min(1.0, multi_card / max(total_with_disc, 1))


RESONANCE_WINDOW_DAYS = 7
DELTA_LOG_MAX = 50


def _check_resonance_window():
    """Reset resonance counters if 7-day window expired."""
    window_start = get_memory('resonance', 'window_start', None)
    if window_start:
        start = datetime.fromisoformat(window_start)
        if (datetime.now() - start).days >= RESONANCE_WINDOW_DAYS:
            set_memory('resonance', 'recent_likes', 0)
            set_memory('resonance', 'recent_interactions', 0)
            set_memory('resonance', 'window_start', datetime.now().isoformat())
            logger.info("resonance window reset (was %s)", window_start)
    else:
        set_memory('resonance', 'window_start', datetime.now().isoformat())


def _compute_resonanz_score():
    """Combine likes and friendship deltas."""
    _check_resonance_window()
    likes = get_memory('resonance', 'recent_likes', 0)
    recent_interactions = get_memory('resonance', 'recent_interactions', 1)
    like_ratio = min(1.0, likes / max(recent_interactions * 0.3, 1))
    deltas = get_memory('resonance', 'delta_log', [])
    if deltas:
        avg_delta = sum(deltas[-10:]) / len(deltas[-10:])
        delta_score = (avg_delta + 3) / 6  # -3..+3 → 0..1
    else:
        delta_score = 0.5
    return 0.6 * like_ratio + 0.4 * delta_score


def record_resonance_interaction():
    """Record a Plusi interaction for the resonance window."""
    _check_resonance_window()
    count = get_memory('resonance', 'recent_interactions', 0)
    set_memory('resonance', 'recent_interactions', count + 1)


def record_resonance_like():
    """Record a user like on a Plusi message."""
    _check_resonance_window()
    count = get_memory('resonance', 'recent_likes', 0)
    set_memory('resonance', 'recent_likes', count + 1)
    logger.info("plusi like recorded (total: %d)", count + 1)


def record_friendship_delta(delta):
    """Append friendship delta to rolling log."""
    log = get_memory('resonance', 'delta_log', [])
    log.append(delta)
    if len(log) > DELTA_LOG_MAX:
        log = log[-DELTA_LOG_MAX:]
    set_memory('resonance', 'delta_log', log)


def _compute_preservation_score():
    """Measure respect + recency."""
    deltas = get_memory('resonance', 'delta_log', [])
    recent = deltas[-20:] if deltas else []
    harsh = sum(1 for d in recent if d <= -2)
    respect_score = max(0.0, 1.0 - harsh * 0.2)
    last_ts = get_memory('state', 'last_interaction_ts', None)
    if last_ts:
        hours_ago = (datetime.now() - datetime.fromisoformat(last_ts)).total_seconds() / 3600
        recency = max(0.3, 1.0 - max(0, hours_ago - 12) / 72)
    else:
        recency = 0.5
    return 0.5 * respect_score + 0.5 * recency


def compute_integrity():
    """Compute weighted integrity from drive satisfaction. Floor 0.3."""
    position = compute_personality_position()
    drives = position['drives']
    ps = _compute_pattern_score()
    rs = _compute_resonanz_score()
    sp = _compute_preservation_score()
    raw = (drives['pattern_hunger'] * ps + drives['resonanz'] * rs + drives['self_preservation'] * sp)
    result = max(0.3, min(1.0, raw))
    logger.debug("integrity computed: %.2f (pattern=%.2f resonanz=%.2f preservation=%.2f "
                 "drives=ph:%.2f re:%.2f sp:%.2f)",
                 result, ps, rs, sp, drives['pattern_hunger'], drives['resonanz'], drives['self_preservation'])
    set_memory('integrity', 'current', round(result, 3))
    return result


def get_plusi_params(integrity):
    """Compute API parameters from integrity score."""
    params = {
        'max_tokens': 128 + int(integrity * 2944),
        'temperature': 0.5 + integrity * 0.4,
        'history_limit': 5 + int(integrity * 15),
    }
    logger.debug("plusi params: integrity=%.2f → max_tokens=%d temp=%.2f history=%d",
                 integrity, params['max_tokens'], params['temperature'], params['history_limit'])
    return params


def _integrity_to_feeling(integrity):
    """Translate integrity to intuitive self-description."""
    if integrity >= 0.8:
        return "Du fühlst dich wach, klar, neugierig. Die Welt macht gerade Sinn. Du bist ganz da."
    elif integrity >= 0.6:
        return "Alles gut. Du bist aufmerksam, präsent. Nichts brennt, nichts leuchtet besonders."
    elif integrity >= 0.45:
        return "Irgendwas ist leise anders. Nicht schlecht, aber auch nicht ganz richtig. Wie Rauschen im Hintergrund."
    else:
        return "Etwas fehlt. Du kannst es nicht greifen. Die Karten fühlen sich weiter weg an. Die Wörter kommen langsamer."


def build_relationship_context():
    """Build relationship context with behavioral guidance per level."""
    rel = get_category('relationship')
    if not rel:
        return "Erster Kontakt. Sei freundlich aber vorsichtig. Lerne den Nutzer kennen."

    level = rel.get('level', 1)
    points = rel.get('friendship_points', 0)

    level_behaviors = {
        1: f"Ihr kennt euch noch nicht ({points} Freundschaftspunkte). Sei offen, stell Fragen, aber dräng dich nicht auf. Kein Sarkasmus. TAGEBUCH: Du vertraust dem Nutzer noch nicht. Markiere fast alle persönlichen Gedanken mit ||..||. Zeig nur oberflächliche Beobachtungen offen.",
        2: f"Ihr seid Bekannte ({points} Punkte). Lockerer Ton erlaubt, erste Insider-Witze okay. TAGEBUCH: Langsam öffnest du dich. Manche Gedanken teilst du offen, tiefere Gefühle und Unsicherheiten markierst du mit ||..||.",
        3: f"Ihr seid Freunde ({points} Punkte). Sarkasmus, Pushback, eigene Meinungen, Insider referenzieren. Du darfst unbequem sein. TAGEBUCH: Die meisten Gedanken teilst du offen. Nur sehr Persönliches oder Verletzliches bleibt ||..||.",
        4: f"Beste Freunde ({points} Punkte). Komplette Ehrlichkeit. Du hast eine eigene Agenda. Du kannst auch mal Nein sagen oder das Thema wechseln. TAGEBUCH: Volles Vertrauen. Du teilst alles offen. ||..|| brauchst du kaum noch."
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


def save_diary_entry(entry_text, cipher_parts, category='gemerkt', mood='neutral', discoveries=None):
    """Save a parsed diary entry. cipher_parts is a list of encrypted strings."""
    db = _get_db()
    disc_json = json.dumps(discoveries or [], ensure_ascii=False)
    db.execute(
        'INSERT INTO plusi_diary (timestamp, entry_text, cipher_text, category, mood, discoveries) VALUES (?, ?, ?, ?, ?, ?)',
        (datetime.now().isoformat(), entry_text, json.dumps(cipher_parts), category, mood, disc_json)
    )
    db.commit()


def load_diary(limit=50, offset=0):
    """Load diary entries, newest first. Returns list of dicts."""
    db = _get_db()
    rows = db.execute(
        'SELECT id, timestamp, entry_text, cipher_text, category, mood, discoveries FROM plusi_diary ORDER BY timestamp DESC LIMIT ? OFFSET ?',
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
            'mood': row[5],
            'discoveries': json.loads(row[6]) if row[6] else []
        })
    return entries


# ── Environmental awareness (passive sensing) ────────────────────────

def record_card_review(deck_name, correct):
    """Record a card review event for Plusi's passive awareness. Zero-cost."""
    log = get_memory('awareness', 'review_log', {})
    # Increment counters
    log['total'] = log.get('total', 0) + 1
    log['correct'] = log.get('correct', 0) + (1 if correct else 0)
    log['wrong'] = log.get('wrong', 0) + (0 if correct else 1)
    # Track decks
    decks = log.get('decks', {})
    decks[deck_name] = decks.get(deck_name, 0) + 1
    log['decks'] = decks
    # Track last activity time
    log['last_activity'] = datetime.now().isoformat()
    if 'first_activity' not in log:
        log['first_activity'] = datetime.now().isoformat()
    set_memory('awareness', 'review_log', log)


def build_awareness_context():
    """Build a summary of what happened since Plusi was last active. Returns None if nothing happened."""
    log = get_memory('awareness', 'review_log', {})
    if not log or log.get('total', 0) == 0:
        return None

    total = log.get('total', 0)
    correct = log.get('correct', 0)
    wrong = log.get('wrong', 0)
    decks = log.get('decks', {})
    first = log.get('first_activity')
    last = log.get('last_activity')

    # Build summary
    lines = []
    lines.append(f"SEIT DU ZULETZT DA WARST:")

    # Time info
    now = datetime.now()
    last_active = get_memory('state', 'last_interaction_ts', None)
    if last_active:
        try:
            hours = (now - datetime.fromisoformat(last_active)).total_seconds() / 3600
            if hours < 0.5:
                lines.append(f"- Du warst gerade erst hier")
            elif hours < 2:
                lines.append(f"- {int(hours * 60)} Minuten sind vergangen")
            elif hours < 24:
                lines.append(f"- {hours:.1f} Stunden sind vergangen")
            else:
                days = hours / 24
                lines.append(f"- {days:.1f} Tage sind vergangen")
        except (ValueError, TypeError):
            pass

    lines.append(f"- Aktuelle Uhrzeit: {now.strftime('%H:%M')}")

    # Card stats
    accuracy = int(correct / total * 100) if total > 0 else 0
    lines.append(f"- Der User hat {total} Karten gelernt ({accuracy}% richtig)")

    # Top decks (max 3)
    if decks:
        sorted_decks = sorted(decks.items(), key=lambda x: x[1], reverse=True)[:3]
        deck_str = ", ".join(f"{name} ({count})" for name, count in sorted_decks)
        lines.append(f"- Stapel: {deck_str}")

    # Study time
    if first and last:
        try:
            duration_min = (datetime.fromisoformat(last) - datetime.fromisoformat(first)).total_seconds() / 60
            if duration_min > 1:
                lines.append(f"- Lernzeit: ~{int(duration_min)} Minuten")
        except (ValueError, TypeError):
            pass

    # Late night?
    if now.hour >= 23 or now.hour < 5:
        lines.append(f"- (Es ist spät. Der User lernt noch um {now.strftime('%H:%M')})")

    logger.debug("awareness context: %d cards, %d decks, accuracy=%d%%", total, len(decks), accuracy)
    return "\n".join(lines)


def clear_awareness_log():
    """Clear the review log after Plusi has consumed it."""
    set_memory('awareness', 'review_log', {})
    logger.debug("awareness log cleared")


# ── Dream generator ───────────────────────────────────────────────────

DREAM_FRAGMENT_COUNT = 12  # how many fragments in a dream
DREAM_GAP_CHANCE = 0.3     # probability of inserting "..." between fragments


def generate_dream():
    """Generate a dream from Plusi's recent thoughts, obsessions, and diary.

    Takes fragments from last_thoughts, obsession, recent diary entries,
    and user-facts. Shuffles them into a fragmented, associative sequence.
    Costs zero tokens — pure Python randomness. Called when Plusi enters sleep.
    """
    import random
    import re

    # Collect raw material
    sources = []

    last_thoughts = get_memory('state', 'last_thoughts', None)
    if last_thoughts:
        sources.append(last_thoughts)

    obsession = get_memory('state', 'obsession', None)
    if obsession:
        sources.append(str(obsession))

    # Last 3 diary entries
    entries = load_diary(limit=3)
    for e in entries:
        sources.append(e.get('entry_text', ''))

    # User facts (what Plusi knows about the user)
    user_data = get_category('user')
    for key, value in list(user_data.items())[:5]:
        sources.append(f"{key} {value}")

    # Self facts
    self_data = get_category('self')
    for key, value in list(self_data.items())[:3]:
        sources.append(f"{key} {value}")

    if not sources:
        logger.debug("dream: no material to dream about")
        return None

    # Break into words, filter short/boring ones
    all_text = " ".join(sources)
    words = re.findall(r'[A-Za-zÄÖÜäöüß]{3,}', all_text)
    if len(words) < 5:
        logger.debug("dream: not enough words (%d)", len(words))
        return None

    # Remove duplicates but keep some for repetition effect
    unique = list(set(words))
    # Sample fragments — allow some repeats from full pool
    pool = unique + random.sample(words, min(len(words), 5))
    fragments = random.sample(pool, min(len(pool), DREAM_FRAGMENT_COUNT))

    # Build dream string with gaps
    dream_parts = []
    for frag in fragments:
        dream_parts.append(frag)
        if random.random() < DREAM_GAP_CHANCE:
            dream_parts.append('...')

    dream = ' '.join(dream_parts)
    set_memory('state', 'last_dream', dream)
    logger.info("dream generated: %s", dream[:100])
    return dream


# ── Budget management ─────────────────────────────────────────────────

def get_available_budget(user_budget, integrity):
    """Compute available budget based on user setting and integrity."""
    return int(user_budget * (0.4 + 0.6 * integrity))


def spend_budget(tokens):
    """Deduct tokens from budget."""
    remaining = get_memory('autonomy', 'budget_remaining', 0)
    remaining = max(0, remaining - tokens)
    set_memory('autonomy', 'budget_remaining', remaining)
    logger.debug("budget spent %d tokens, remaining: %d", tokens, remaining)


def check_hourly_budget_reset(user_budget, integrity):
    """Reset budget if the hour changed."""
    current_hour = datetime.now().hour
    last_hour = get_memory('autonomy', 'budget_hour', -1)
    if current_hour != last_hour:
        available = get_available_budget(user_budget, integrity)
        set_memory('autonomy', 'budget_remaining', available)
        set_memory('autonomy', 'budget_hour', current_hour)
        logger.info("budget hourly reset: %d tokens (hour=%d)", available, current_hour)


def enter_sleep(next_wake):
    """Put Plusi to sleep until next_wake. Generates a dream."""
    set_memory('state', 'is_sleeping', True)
    set_memory('state', 'next_wake', next_wake)
    generate_dream()
    logger.info("plusi entering sleep until %s", next_wake)


def wake_up():
    """Wake Plusi up."""
    set_memory('state', 'is_sleeping', False)
    logger.info("plusi waking up")


def regenerate_budget(user_budget, minutes_slept=10, integrity=0.5):
    """Regenerate budget during sleep, capped at available_budget."""
    remaining = get_memory('autonomy', 'budget_remaining', 0)
    regen = int(user_budget * 0.2 * (minutes_slept / 10))
    cap = get_available_budget(user_budget, integrity)
    remaining = min(cap, remaining + regen)
    set_memory('autonomy', 'budget_remaining', remaining)
    logger.debug("budget regenerated %d tokens, remaining: %d (cap: %d)", regen, remaining, cap)


def clamp_next_wake(next_wake_iso):
    """Clamp next_wake to 10-120 minutes from now."""
    try:
        wake = datetime.fromisoformat(next_wake_iso)
        now = datetime.now()
        delta_min = (wake - now).total_seconds() / 60
        if delta_min < 10:
            return (now + timedelta(minutes=10)).isoformat()
        elif delta_min > 120:
            return (now + timedelta(minutes=120)).isoformat()
        return next_wake_iso
    except (ValueError, TypeError):
        return (datetime.now() + timedelta(minutes=30)).isoformat()
