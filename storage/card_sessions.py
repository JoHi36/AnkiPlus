"""
Per-Card Session Storage für AnkiPlus
Speichert Chat-Sessions pro Karte in einer SQLite-Datenbank.
Jede Karte hat ihre eigene persistente Session mit Review-Historie.
"""

import os
import json
import sqlite3
import uuid
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'card_sessions.db')
_db = None

MAX_MESSAGES_PER_CARD = 200  # Maximum chat messages retained per card (prevents unbounded growth)


# ---------------------------------------------------------------------------
#  Serialization helpers (avoid duplicated JSON encode/decode logic)
# ---------------------------------------------------------------------------

def _to_json(value):
    """Serialize a non-string value to JSON string. Pass through strings and None."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False) if value else None


def _parse_json_fields(row_dict: dict, fields: tuple) -> dict:
    """Parse JSON strings for specified fields in a row dict (in-place)."""
    for field in fields:
        if row_dict.get(field):
            try:
                row_dict[field] = json.loads(row_dict[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return row_dict


def _get_db():
    """Lazy-init SQLite connection (one per process)."""
    global _db
    if _db is not None:
        return _db
    _db = sqlite3.connect(_DB_PATH, check_same_thread=False)
    _db.row_factory = sqlite3.Row
    _db.execute("PRAGMA journal_mode=WAL")
    _db.execute("PRAGMA foreign_keys=ON")
    _init_schema(_db)
    _migrate_schema(_db)
    return _db


def _init_schema(db):
    """Create tables if they don't exist."""
    db.executescript("""
        CREATE TABLE IF NOT EXISTS card_sessions (
            card_id   INTEGER PRIMARY KEY,
            note_id   INTEGER,
            deck_id   INTEGER,
            deck_name TEXT,
            created_at TEXT,
            updated_at TEXT,
            summary   TEXT
        );

        CREATE TABLE IF NOT EXISTS review_sections (
            id              TEXT PRIMARY KEY,
            card_id         INTEGER NOT NULL,
            title           TEXT,
            created_at      TEXT,
            performance_type TEXT,
            performance_data TEXT,
            previous_score  REAL,
            type            TEXT DEFAULT 'review',
            FOREIGN KEY (card_id) REFERENCES card_sessions(card_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS messages (
            id         TEXT PRIMARY KEY,
            card_id    INTEGER NOT NULL,
            section_id TEXT,
            text       TEXT NOT NULL,
            sender     TEXT NOT NULL,
            created_at TEXT,
            steps      TEXT,
            citations  TEXT,
            request_id TEXT,
            pipeline_data TEXT,
            FOREIGN KEY (card_id) REFERENCES card_sessions(card_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS card_embeddings (
            card_id       INTEGER PRIMARY KEY,
            embedding     BLOB NOT NULL,
            content_hash  TEXT NOT NULL,
            model_version TEXT NOT NULL,
            created_at    TEXT DEFAULT (datetime('now')),
            updated_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_messages_card   ON messages(card_id);
        CREATE INDEX IF NOT EXISTS idx_sections_card   ON review_sections(card_id);
        CREATE INDEX IF NOT EXISTS idx_card_sessions_deck ON card_sessions(deck_id);
        CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON card_embeddings(content_hash);
    """)
    db.commit()

    # KG tables live in the same database file
    try:
        from .kg_store import _init_kg_schema
    except ImportError:
        from kg_store import _init_kg_schema
    _init_kg_schema(db)


def _migrate_schema(db):
    """Add columns that may be missing in older databases."""
    # Legacy column migrations (keep for safety)
    try:
        db.execute("SELECT request_id FROM messages LIMIT 1")
    except sqlite3.OperationalError:
        db.execute("ALTER TABLE messages ADD COLUMN request_id TEXT")
    try:
        db.execute("SELECT previous_score FROM review_sections LIMIT 1")
    except sqlite3.OperationalError:
        db.execute("ALTER TABLE review_sections ADD COLUMN previous_score REAL")

    # Two-level chat migration: add deck_id and source columns to messages.
    # Check if deck_id already exists; if not, recreate the table with new schema.
    cols = {row[1] for row in db.execute("PRAGMA table_info(messages)").fetchall()}
    if 'deck_id' not in cols:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS messages_new (
                id         TEXT PRIMARY KEY,
                card_id    INTEGER,
                deck_id    INTEGER,
                section_id TEXT,
                text       TEXT NOT NULL,
                sender     TEXT NOT NULL,
                source     TEXT DEFAULT 'tutor',
                created_at TEXT,
                steps      TEXT,
                citations  TEXT,
                request_id TEXT,
                FOREIGN KEY (card_id)    REFERENCES card_sessions(card_id)  ON DELETE CASCADE,
                FOREIGN KEY (section_id) REFERENCES review_sections(id)     ON DELETE SET NULL
            );

            INSERT INTO messages_new
                (id, card_id, deck_id, section_id, text, sender, created_at, steps, citations, request_id)
            SELECT
                m.id,
                m.card_id,
                cs.deck_id,
                m.section_id,
                m.text,
                m.sender,
                m.created_at,
                m.steps,
                m.citations,
                m.request_id
            FROM messages m
            LEFT JOIN card_sessions cs ON m.card_id = cs.card_id;

            DROP TABLE messages;
            ALTER TABLE messages_new RENAME TO messages;

            CREATE INDEX IF NOT EXISTS idx_messages_card      ON messages(card_id);
            CREATE INDEX IF NOT EXISTS idx_messages_deck_time ON messages(deck_id, created_at);
        """)

    # Type column migration: add type column to review_sections for preview marker
    try:
        cursor = db.execute("PRAGMA table_info(review_sections)")
        section_cols = {row[1] for row in cursor.fetchall()}
        if 'type' not in section_cols:
            db.execute("ALTER TABLE review_sections ADD COLUMN type TEXT DEFAULT 'review'")
            db.commit()
    except (sqlite3.Error, KeyError, ValueError):
        pass  # Column already exists

    # Pipeline data migration: add pipeline_data column for full ThoughtStream persistence
    if 'pipeline_data' not in cols:
        try:
            db.execute("ALTER TABLE messages ADD COLUMN pipeline_data TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists

    db.commit()


# ──────────────────────────────────────────────
#  Card Session CRUD
# ──────────────────────────────────────────────

def load_card_session(card_id):
    """
    Load a card's full session (session meta + sections + messages).

    Returns:
        dict with keys 'session' (dict|None), 'sections' (list), 'messages' (list)
    """
    db = _get_db()
    card_id = int(card_id)

    # Session meta
    row = db.execute("SELECT * FROM card_sessions WHERE card_id = ?", (card_id,)).fetchone()
    session = dict(row) if row else None

    # Sections ordered by creation time
    rows = db.execute(
        "SELECT * FROM review_sections WHERE card_id = ? ORDER BY created_at ASC",
        (card_id,)
    ).fetchall()
    sections = []
    for r in rows:
        s = dict(r)
        if s.get('performance_data'):
            try:
                s['performance_data'] = json.loads(s['performance_data'])
            except (json.JSONDecodeError, TypeError):
                pass
        sections.append(s)

    # Messages ordered by creation time
    rows = db.execute(
        "SELECT * FROM messages WHERE card_id = ? ORDER BY created_at ASC",
        (card_id,)
    ).fetchall()
    messages = []
    for r in rows:
        m = _parse_json_fields(dict(r), ('steps', 'citations', 'pipeline_data'))
        messages.append(m)

    return {
        'session': session,
        'sections': sections,
        'messages': messages,
    }


def save_card_session(card_id, data):
    """
    Save/update a full card session (session meta + sections + messages).

    Args:
        card_id: Anki card ID
        data: dict with optional keys 'session', 'sections', 'messages'

    Returns:
        bool success
    """
    db = _get_db()
    card_id = int(card_id)
    now = datetime.now().isoformat()

    try:
        # Upsert session meta
        session = data.get('session', {})
        db.execute("""
            INSERT INTO card_sessions (card_id, note_id, deck_id, deck_name, created_at, updated_at, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(card_id) DO UPDATE SET
                note_id   = COALESCE(excluded.note_id, note_id),
                deck_id   = COALESCE(excluded.deck_id, deck_id),
                deck_name = COALESCE(excluded.deck_name, deck_name),
                updated_at = excluded.updated_at,
                summary   = COALESCE(excluded.summary, summary)
        """, (
            card_id,
            session.get('note_id') or session.get('noteId'),
            session.get('deck_id') or session.get('deckId'),
            session.get('deck_name') or session.get('deckName'),
            session.get('created_at') or session.get('createdAt') or now,
            now,
            session.get('summary'),
        ))

        # Upsert sections
        for sec in data.get('sections', []):
            perf = _to_json(sec.get('performance_data') or sec.get('performanceData'))
            previous_score = sec.get('previous_score') if sec.get('previous_score') is not None else sec.get('previousScore')
            db.execute("""
                INSERT INTO review_sections (id, card_id, title, created_at, performance_type, performance_data, previous_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title            = COALESCE(excluded.title, title),
                    performance_type = COALESCE(excluded.performance_type, performance_type),
                    performance_data = COALESCE(excluded.performance_data, performance_data),
                    previous_score   = COALESCE(excluded.previous_score, previous_score)
            """, (
                sec.get('id'),
                card_id,
                sec.get('title'),
                sec.get('created_at') or sec.get('createdAt') or now,
                sec.get('performance_type') or sec.get('performanceType'),
                perf,
                previous_score,
            ))

        # Upsert messages
        for msg in data.get('messages', []):
            steps = _to_json(msg.get('steps'))
            citations = _to_json(msg.get('citations'))
            request_id = msg.get('request_id') or msg.get('requestId')
            db.execute("""
                INSERT OR REPLACE INTO messages (id, card_id, section_id, text, sender, created_at, steps, citations, request_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                msg.get('id'),
                card_id,
                msg.get('section_id') or msg.get('sectionId'),
                msg.get('text', ''),
                msg.get('sender') or msg.get('from', 'user'),
                msg.get('created_at') or msg.get('createdAt') or msg.get('timestamp') or now,
                steps,
                citations,
                request_id,
            ))

        # Enforce message limit
        _enforce_message_limit(db, card_id)

        db.commit()
        return True

    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("CardSessionsDB: Error saving session for card %s: %s", card_id, e)
        db.rollback()
        return False


def _get_deck_for_card(card_id):
    """Get deck_id and deck_name from Anki for a card. Returns (deck_id, deck_name) or (None, None)."""
    try:
        import aqt
        if aqt.mw and aqt.mw.col:
            card = aqt.mw.col.get_card(card_id)
            if card:
                return card.did, aqt.mw.col.decks.name(card.did)
    except (sqlite3.Error, KeyError, ValueError, AttributeError):
        pass
    return None, None


def save_message(card_id, message):
    """Append a single message to a card's session."""
    db = _get_db()
    card_id = int(card_id)
    now = datetime.now().isoformat()

    try:
        # Ensure card session exists — include deck_id from Anki
        deck_id, deck_name = _get_deck_for_card(card_id)
        db.execute("""
            INSERT OR IGNORE INTO card_sessions (card_id, deck_id, deck_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (card_id, deck_id, deck_name, now, now))

        # Backfill deck_id on existing entries that are missing it
        if deck_id:
            db.execute("""
                UPDATE card_sessions SET deck_id = ?, deck_name = ?
                WHERE card_id = ? AND deck_id IS NULL
            """, (deck_id, deck_name, card_id))

        steps = _to_json(message.get('steps'))
        citations = _to_json(message.get('citations'))
        pipeline_data = _to_json(message.get('pipeline_data'))
        request_id = message.get('request_id') or message.get('requestId')

        msg_id = message.get('id') or str(uuid.uuid4())
        db.execute("""
            INSERT OR REPLACE INTO messages (id, card_id, section_id, text, sender, created_at, steps, citations, request_id, deck_id, source, pipeline_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            msg_id,
            card_id,
            message.get('section_id') or message.get('sectionId'),
            message.get('text', ''),
            message.get('sender') or message.get('from', 'user'),
            message.get('created_at') or message.get('createdAt') or now,
            steps,
            citations,
            request_id,
            deck_id,
            message.get('source', 'tutor'),
            pipeline_data,
        ))

        db.execute("UPDATE card_sessions SET updated_at = ? WHERE card_id = ?", (now, card_id))

        _enforce_message_limit(db, card_id)
        db.commit()
        return True

    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("CardSessionsDB: Error saving message for card %s: %s", card_id, e)
        db.rollback()
        return False


def load_deck_messages(deck_id, limit=50):
    """
    Load recent messages for a deck (both card-level and deck-level).

    Returns list of message dicts in chronological order (oldest first).
    """
    db = _get_db()
    deck_id = int(deck_id)

    if deck_id == 0:
        # Global Free Chat: load ALL messages across all decks chronologically
        rows = db.execute("""
            SELECT m.id, m.card_id, m.deck_id, m.section_id, m.text, m.sender,
                   m.source, m.created_at, m.steps, m.citations, m.request_id,
                   cs.deck_name
            FROM messages m
            LEFT JOIN card_sessions cs ON m.card_id = cs.card_id
            ORDER BY m.created_at DESC
            LIMIT ?
        """, (limit,)).fetchall()
    else:
        # Deck-specific: load only messages for this deck
        rows = db.execute("""
            SELECT m.id, m.card_id, m.deck_id, m.section_id, m.text, m.sender,
                   m.source, m.created_at, m.steps, m.citations, m.request_id,
                   cs.deck_name
            FROM messages m
            LEFT JOIN card_sessions cs ON m.card_id = cs.card_id
            WHERE m.deck_id = ?
            ORDER BY m.created_at DESC
            LIMIT ?
        """, (deck_id, limit)).fetchall()

    messages = []
    for r in rows:
        m = _parse_json_fields(dict(r), ('steps', 'citations', 'pipeline_data'))
        messages.append(m)

    # Reverse to get chronological (oldest first) order
    messages.reverse()

    # Enrich with card front-text snippets
    card_ids = [m['card_id'] for m in messages if m.get('card_id')]
    if card_ids:
        front_texts = _get_card_front_texts(list(set(card_ids)))
        for m in messages:
            cid = m.get('card_id')
            if cid and cid in front_texts:
                m['card_front'] = front_texts[cid]

    return messages


def _get_card_front_texts(card_ids):
    """Fetch front-text snippets for a list of card IDs from Anki's DB."""
    import re
    try:
        from aqt import mw
        if not mw or not mw.col:
            return {}
        result = {}
        for cid in card_ids:
            try:
                card = mw.col.get_card(cid)
                if card and card.note():
                    fields = card.note().fields
                    front = fields[0] if fields else ''
                    front = re.sub(r'<[^>]+>', '', front).strip()
                    if len(front) > 60:
                        front = front[:57] + '…'
                    result[cid] = front
            except (sqlite3.Error, KeyError, ValueError):
                pass
        return result
    except (sqlite3.Error, KeyError, ValueError):
        return {}


def save_deck_message(deck_id, message):
    """Append a deck-level message (no associated card)."""
    db = _get_db()
    deck_id = int(deck_id)
    now = datetime.now().isoformat()

    try:
        steps = _to_json(message.get('steps'))
        citations = _to_json(message.get('citations'))
        request_id = message.get('request_id') or message.get('requestId')
        source = message.get('source', 'tutor')
        msg_id = message.get('id') or str(uuid.uuid4())

        db.execute("""
            INSERT OR REPLACE INTO messages
                (id, card_id, deck_id, section_id, text, sender, source, created_at, steps, citations, request_id)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            msg_id,
            deck_id,
            message.get('section_id') or message.get('sectionId'),
            message.get('text', ''),
            message.get('sender') or message.get('from', 'user'),
            source,
            message.get('created_at') or message.get('createdAt') or now,
            steps,
            citations,
            request_id,
        ))

        db.commit()
        return True

    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("CardSessionsDB: Error saving deck message for deck %s: %s", deck_id, e)
        db.rollback()
        return False


def clear_deck_messages():
    """Delete all free-chat messages (card_id IS NULL). Returns count of deleted rows."""
    db = _get_db()
    try:
        cursor = db.execute("DELETE FROM messages WHERE card_id IS NULL")
        db.commit()
        count = cursor.rowcount
        logger.info("Cleared %s free-chat messages", count)
        return count
    except sqlite3.Error as e:
        logger.error("Failed to clear deck messages: %s", e)
        db.rollback()
        return 0


def save_section(card_id, section):
    """Create or update a review section for a card."""
    db = _get_db()
    card_id = int(card_id)
    now = datetime.now().isoformat()

    try:
        # Ensure card session exists
        db.execute("""
            INSERT OR IGNORE INTO card_sessions (card_id, created_at, updated_at)
            VALUES (?, ?, ?)
        """, (card_id, now, now))

        perf = _to_json(section.get('performance_data') or section.get('performanceData'))
        previous_score = section.get('previous_score') if section.get('previous_score') is not None else section.get('previousScore')
        section_type = section.get('type', 'review')

        db.execute("""
            INSERT INTO review_sections (id, card_id, title, created_at, performance_type, performance_data, previous_score, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title            = COALESCE(excluded.title, title),
                performance_type = COALESCE(excluded.performance_type, performance_type),
                performance_data = COALESCE(excluded.performance_data, performance_data),
                previous_score   = COALESCE(excluded.previous_score, previous_score),
                type             = excluded.type
        """, (
            section.get('id'),
            card_id,
            section.get('title'),
            section.get('created_at') or section.get('createdAt') or now,
            section.get('performance_type') or section.get('performanceType'),
            perf,
            previous_score,
            section_type,
        ))

        db.execute("UPDATE card_sessions SET updated_at = ? WHERE card_id = ?", (now, card_id))
        db.commit()
        return True

    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("CardSessionsDB: Error saving section for card %s: %s", card_id, e)
        db.rollback()
        return False


def update_summary(card_id, summary):
    """Update the compressed summary for a card."""
    db = _get_db()
    try:
        db.execute(
            "UPDATE card_sessions SET summary = ?, updated_at = ? WHERE card_id = ?",
            (summary, datetime.now().isoformat(), int(card_id))
        )
        db.commit()
        return True
    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("CardSessionsDB: Error updating summary for card %s: %s", card_id, e)
        return False


def load_insights(card_id):
    """Load insights JSON from card_sessions.summary"""
    try:
        db = _get_db()
        row = db.execute(
            "SELECT summary FROM card_sessions WHERE card_id = ?",
            (card_id,)
        ).fetchone()
        if row and row['summary']:
            return json.loads(row['summary'])
        return {"version": 1, "insights": []}
    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("[card_sessions_storage] Error loading insights for card %s: %s", card_id, e)
        return {"version": 1, "insights": []}


def save_insights(card_id, insights_data):
    """Save insights JSON to card_sessions.summary"""
    try:
        db = _get_db()
        summary_str = json.dumps(insights_data, ensure_ascii=False)
        existing = db.execute(
            "SELECT card_id FROM card_sessions WHERE card_id = ?",
            (card_id,)
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE card_sessions SET summary = ?, updated_at = ? WHERE card_id = ?",
                (summary_str, datetime.now().isoformat(), card_id)
            )
        else:
            db.execute(
                "INSERT INTO card_sessions (card_id, summary, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (card_id, summary_str, datetime.now().isoformat(), datetime.now().isoformat())
            )
        db.commit()
        return True
    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("[card_sessions_storage] Error saving insights for card %s: %s", card_id, e)
        return False


def get_card_revlog(card_id, max_points=50):
    """Fetch review history from Anki's revlog table. Must run on main thread."""
    try:
        from aqt import mw
        if not mw or not mw.col:
            return []
        rows = mw.col.db.all(
            "SELECT id, ease, ivl, time FROM revlog WHERE cid = ? ORDER BY id ASC",
            card_id
        )
        if not rows:
            return []
        # Aggregate if too many points
        if len(rows) > max_points:
            step = len(rows) / max_points
            rows = [rows[int(i * step)] for i in range(max_points)]
        return [
            {
                "timestamp": row[0] // 1000,  # ms to seconds
                "ease": row[1],               # 1-4
                "ivl": row[2],                # interval after review
                "time": row[3]                # time spent in ms
            }
            for row in rows
        ]
    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("[card_sessions_storage] Error fetching revlog for card %s: %s", card_id, e)
        return []


def delete_card_session(card_id):
    """Delete a card's entire session (cascade deletes sections + messages)."""
    db = _get_db()
    try:
        db.execute("DELETE FROM card_sessions WHERE card_id = ?", (int(card_id),))
        db.commit()
        return True
    except (sqlite3.Error, KeyError, ValueError) as e:
        logger.error("CardSessionsDB: Error deleting session for card %s: %s", card_id, e)
        return False


def get_card_ids_with_sessions(deck_id=None):
    """List card IDs that have sessions, optionally filtered by deck."""
    db = _get_db()
    if deck_id:
        rows = db.execute(
            "SELECT card_id FROM card_sessions WHERE deck_id = ? ORDER BY updated_at DESC",
            (int(deck_id),)
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT card_id FROM card_sessions ORDER BY updated_at DESC"
        ).fetchall()
    return [r['card_id'] for r in rows]


# ──────────────────────────────────────────────
#  Migration from sessions.json
# ──────────────────────────────────────────────

def migrate_from_json(sessions_json_path=None):
    """
    One-time migration: convert deck-based sessions.json to per-card SQLite.
    After migration, renames sessions.json → sessions.json.bak.
    """
    if sessions_json_path is None:
        sessions_json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sessions.json')

    if not os.path.exists(sessions_json_path):
        logger.debug("CardSessionsDB: No sessions.json to migrate")
        return False

    # Don't migrate if DB already has data
    db = _get_db()
    count = db.execute("SELECT COUNT(*) FROM card_sessions").fetchone()[0]
    if count > 0:
        logger.info("CardSessionsDB: DB already has %s sessions, skipping migration", count)
        return False

    try:
        with open(sessions_json_path, 'r', encoding='utf-8') as f:
            sessions = json.load(f)

        if not isinstance(sessions, list) or len(sessions) == 0:
            logger.debug("CardSessionsDB: sessions.json is empty, nothing to migrate")
            return False

        migrated_cards = 0
        migrated_messages = 0
        migrated_sections = 0

        for session in sessions:
            deck_id = session.get('deckId')
            deck_name = session.get('deckName', '')
            sections = session.get('sections', [])
            messages = session.get('messages', [])

            # Build section_id → cardId mapping
            section_card_map = {}
            for sec in sections:
                sec_id = sec.get('id')
                card_id = sec.get('cardId')
                if sec_id and card_id:
                    section_card_map[sec_id] = card_id

            # Create card sessions from sections
            for sec in sections:
                card_id = sec.get('cardId')
                if not card_id:
                    continue

                # Ensure card session exists
                db.execute("""
                    INSERT OR IGNORE INTO card_sessions (card_id, deck_id, deck_name, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (card_id, deck_id, deck_name, sec.get('createdAt', ''), sec.get('createdAt', '')))

                # Insert section
                perf = _to_json(sec.get('performanceData'))
                perf_type = None
                if isinstance(sec.get('performanceData'), dict):
                    perf_type = sec['performanceData'].get('type')

                db.execute("""
                    INSERT OR IGNORE INTO review_sections (id, card_id, title, created_at, performance_type, performance_data)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    sec.get('id'),
                    card_id,
                    sec.get('title'),
                    sec.get('createdAt', ''),
                    perf_type,
                    perf,
                ))
                migrated_sections += 1

            # Migrate messages
            for msg in messages:
                section_id = msg.get('sectionId')
                card_id = section_card_map.get(section_id)
                if not card_id:
                    continue

                steps = _to_json(msg.get('steps'))
                citations = _to_json(msg.get('citations'))

                db.execute("""
                    INSERT OR IGNORE INTO messages (id, card_id, section_id, text, sender, created_at, steps, citations)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    msg.get('id', f"migrated-{msg.get('timestamp', 0)}"),
                    card_id,
                    section_id,
                    msg.get('text', ''),
                    msg.get('from', 'user'),
                    msg.get('timestamp', ''),
                    steps,
                    citations,
                ))
                migrated_messages += 1

            migrated_cards += len(set(section_card_map.values()))

        db.commit()

        # Rename old file
        backup_path = sessions_json_path + '.bak'
        os.rename(sessions_json_path, backup_path)

        logger.info("CardSessionsDB: Migration complete — %s cards, %s sections, %s messages", migrated_cards, migrated_sections, migrated_messages)
        logger.debug("CardSessionsDB: sessions.json renamed to %s", backup_path)
        return True

    except (sqlite3.Error, KeyError, ValueError, OSError) as e:
        logger.exception("CardSessionsDB: Migration error: %s", e)
        db.rollback()
        return False


# ──────────────────────────────────────────────
#  Internal helpers
# ──────────────────────────────────────────────

def _enforce_message_limit(db, card_id):
    """Delete oldest messages if card exceeds MAX_MESSAGES_PER_CARD."""
    count = db.execute(
        "SELECT COUNT(*) FROM messages WHERE card_id = ?", (card_id,)
    ).fetchone()[0]

    if count > MAX_MESSAGES_PER_CARD:
        excess = count - MAX_MESSAGES_PER_CARD
        db.execute("""
            DELETE FROM messages WHERE id IN (
                SELECT id FROM messages WHERE card_id = ?
                ORDER BY created_at ASC LIMIT ?
            )
        """, (card_id, excess))


# ──────────────────────────────────────────────
#  Card Embeddings CRUD
# ──────────────────────────────────────────────

def save_embedding(card_id, embedding_bytes, content_hash, model_version):
    """Save or update a card's vector embedding."""
    db = _get_db()
    db.execute(
        """INSERT INTO card_embeddings (card_id, embedding, content_hash, model_version, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(card_id) DO UPDATE SET
               embedding = excluded.embedding,
               content_hash = excluded.content_hash,
               model_version = excluded.model_version,
               updated_at = excluded.updated_at""",
        (card_id, embedding_bytes, content_hash, model_version)
    )
    db.commit()

def load_embedding(card_id):
    """Load a single card's embedding. Returns dict with card_id, embedding, content_hash, model_version or None."""
    db = _get_db()
    row = db.execute(
        "SELECT card_id, embedding, content_hash, model_version FROM card_embeddings WHERE card_id = ?",
        (card_id,)
    ).fetchone()
    if row:
        return {"card_id": row[0], "embedding": row[1], "content_hash": row[2], "model_version": row[3]}
    return None

def load_all_embeddings():
    """Load all embeddings for building in-memory index.
    Returns list of (card_id, embedding_bytes, content_hash)."""
    db = _get_db()
    rows = db.execute(
        "SELECT card_id, embedding, content_hash FROM card_embeddings"
    ).fetchall()
    return [(row[0], row[1], row[2]) for row in rows]

def get_stale_card_ids(card_content_hashes):
    """Given {card_id: content_hash}, return card_ids where hash changed or embedding missing.
    card_content_hashes: dict of {card_id: current_content_hash}"""
    db = _get_db()
    existing = {}
    rows = db.execute("SELECT card_id, content_hash FROM card_embeddings").fetchall()
    for row in rows:
        existing[row[0]] = row[1]

    stale = []
    for card_id, current_hash in card_content_hashes.items():
        if card_id not in existing or existing[card_id] != current_hash:
            stale.append(card_id)
    return stale

def delete_embedding(card_id):
    """Delete embedding for a card."""
    db = _get_db()
    db.execute("DELETE FROM card_embeddings WHERE card_id = ?", (card_id,))
    db.commit()


def count_embeddings():
    """Return total number of embedded cards."""
    db = _get_db()
    return db.execute("SELECT COUNT(*) FROM card_embeddings").fetchone()[0]


def close_db():
    """Close DB connection (call on addon unload)."""
    global _db
    if _db:
        _db.close()
        _db = None
