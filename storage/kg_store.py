"""Knowledge Graph Storage for AnkiPlus.

Stores extracted terms, co-occurrence edges, definitions, and embeddings
for the Knowledge Graph feature. Shares the card_sessions.db SQLite file.
"""

import json
import sqlite3
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
#  Constants
# ---------------------------------------------------------------------------

DECK_COLORS = [
    "#0A84FF",  # Apple Blue
    "#30D158",  # Apple Green
    "#FF9F0A",  # Apple Orange
    "#BF5AF2",  # Apple Purple
    "#FF453A",  # Apple Red
    "#5AC8FA",  # Apple Teal
    "#FFD60A",  # Apple Yellow
    "#AC8E68",  # Apple Brown
]

_db = None


# ---------------------------------------------------------------------------
#  Schema
# ---------------------------------------------------------------------------

def _init_kg_schema(db):
    """Create KG tables and indexes if they do not exist (idempotent)."""
    db.executescript("""
        CREATE TABLE IF NOT EXISTS kg_card_terms (
            card_id        INTEGER,
            term           TEXT,
            deck_id        INTEGER,
            is_definition  BOOLEAN DEFAULT 0,
            PRIMARY KEY (card_id, term)
        );
        CREATE INDEX IF NOT EXISTS idx_kg_card_terms_term ON kg_card_terms(term);

        CREATE TABLE IF NOT EXISTS kg_terms (
            term       TEXT PRIMARY KEY,
            frequency  INTEGER,
            embedding  BLOB
        );

        CREATE TABLE IF NOT EXISTS kg_edges (
            term_a     TEXT,
            term_b     TEXT,
            weight     INTEGER,
            PRIMARY KEY (term_a, term_b)
        );

        CREATE TABLE IF NOT EXISTS kg_definitions (
            term           TEXT PRIMARY KEY,
            definition     TEXT,
            sources        TEXT,
            source_count   INTEGER,
            generated_by   TEXT,
            created_at     TEXT DEFAULT (datetime('now')),
            updated_at     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS kg_deck_links (
            deck_a       INTEGER,
            deck_b       INTEGER,
            shared_terms INTEGER,
            top_terms    TEXT,
            PRIMARY KEY (deck_a, deck_b)
        );

        CREATE TABLE IF NOT EXISTS card_content (
            card_id     INTEGER PRIMARY KEY,
            question    TEXT,
            answer      TEXT,
            deck_name   TEXT,
            updated_at  TEXT DEFAULT (datetime('now'))
        );
    """)
    db.commit()


# ---------------------------------------------------------------------------
#  DB connection
# ---------------------------------------------------------------------------

def _get_db():
    """Return (and lazily initialise) the shared SQLite connection."""
    global _db
    if _db is not None:
        return _db

    try:
        try:
            from .card_sessions import _DB_PATH
        except ImportError:
            from card_sessions import _DB_PATH
        db_path = _DB_PATH
    except ImportError:
        import os
        db_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "card_sessions.db"
        )

    _db = sqlite3.connect(db_path, check_same_thread=False)
    _db.row_factory = sqlite3.Row
    _db.execute("PRAGMA journal_mode=WAL")
    _init_kg_schema(_db)
    return _db


# ---------------------------------------------------------------------------
#  Card Terms CRUD
# ---------------------------------------------------------------------------

def save_card_terms(card_id, terms, deck_id, definition_terms=None):
    """Insert or replace terms for a card.

    Args:
        card_id: Anki card ID (int).
        terms: List of term strings.
        deck_id: Anki deck ID (int).
        definition_terms: Optional subset of terms that are definitions.
    """
    db = _get_db()
    definition_set = set(definition_terms or [])
    try:
        for term in terms:
            db.execute(
                """
                INSERT INTO kg_card_terms (card_id, term, deck_id, is_definition)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(card_id, term) DO UPDATE SET
                    deck_id       = excluded.deck_id,
                    is_definition = excluded.is_definition
                """,
                (int(card_id), term, int(deck_id), 1 if term in definition_set else 0),
            )
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error saving card terms for card %s: %s", card_id, e)
        db.rollback()


def get_card_terms(card_id):
    """Return list of term strings for a card."""
    db = _get_db()
    rows = db.execute(
        "SELECT term FROM kg_card_terms WHERE card_id = ?", (int(card_id),)
    ).fetchall()
    return [r["term"] for r in rows]


def delete_card_terms(card_id):
    """Remove all terms for a card."""
    db = _get_db()
    try:
        db.execute("DELETE FROM kg_card_terms WHERE card_id = ?", (int(card_id),))
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error deleting card terms for card %s: %s", card_id, e)
        db.rollback()


def get_term_card_ids(term):
    """Return list of card_ids that contain this term."""
    db = _get_db()
    rows = db.execute(
        "SELECT card_id FROM kg_card_terms WHERE term = ?", (term,)
    ).fetchall()
    return [r["card_id"] for r in rows]


# ---------------------------------------------------------------------------
#  Term Frequencies
# ---------------------------------------------------------------------------

def update_term_frequencies():
    """Recompute term frequencies from kg_card_terms and upsert into kg_terms."""
    db = _get_db()
    try:
        db.execute("""
            INSERT INTO kg_terms (term, frequency)
            SELECT term, COUNT(*) AS frequency
            FROM kg_card_terms
            GROUP BY term
            ON CONFLICT(term) DO UPDATE SET frequency = excluded.frequency
        """)
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error updating term frequencies: %s", e)
        db.rollback()


def get_term_frequency(term):
    """Return frequency for a single term, or 0 if not found."""
    db = _get_db()
    row = db.execute(
        "SELECT frequency FROM kg_terms WHERE term = ?", (term,)
    ).fetchone()
    return row["frequency"] if row else 0


# ---------------------------------------------------------------------------
#  Edges
# ---------------------------------------------------------------------------

def save_edges(edges_list):
    """Insert or replace edges.

    Args:
        edges_list: List of (term_a, term_b, weight) tuples.
    """
    db = _get_db()
    try:
        for term_a, term_b, weight in edges_list:
            db.execute(
                """
                INSERT INTO kg_edges (term_a, term_b, weight)
                VALUES (?, ?, ?)
                ON CONFLICT(term_a, term_b) DO UPDATE SET weight = excluded.weight
                """,
                (term_a, term_b, weight),
            )
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error saving edges: %s", e)
        db.rollback()


def get_all_edges(min_weight=1):
    """Return all edges with weight >= min_weight as list of dicts."""
    db = _get_db()
    rows = db.execute(
        "SELECT term_a, term_b, weight FROM kg_edges WHERE weight >= ?",
        (min_weight,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_connected_terms(term):
    """Return terms directly connected to this term via kg_edges (both directions)."""
    db = _get_db()
    rows = db.execute(
        """
        SELECT term_b AS connected FROM kg_edges WHERE term_a = ?
        UNION
        SELECT term_a AS connected FROM kg_edges WHERE term_b = ?
        """,
        (term, term),
    ).fetchall()
    return [r["connected"] for r in rows]


def get_term_expansions(term, max_terms=5, db=None):
    """Get co-occurrence expansions for a term, sorted by edge weight.

    Returns list of (term, weight) tuples sorted by weight descending.
    """
    conn = db or _get_db()
    rows = conn.execute(
        "SELECT term_b, weight FROM kg_edges WHERE term_a = ? "
        "UNION "
        "SELECT term_a, weight FROM kg_edges WHERE term_b = ? "
        "ORDER BY weight DESC LIMIT ?",
        (term, term, max_terms)
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def exact_term_lookup(query, db=None):
    """Case-insensitive exact match in kg_terms.

    Returns the canonical term string if found, None otherwise.
    """
    conn = db or _get_db()
    row = conn.execute(
        "SELECT term FROM kg_terms WHERE LOWER(term) = LOWER(?) LIMIT 1",
        (query,)
    ).fetchone()
    return row[0] if row else None


def load_term_embeddings(db=None):
    """Load all term embeddings from kg_terms.

    Returns dict of {term: embedding_bytes} for terms with non-NULL embeddings.
    """
    conn = db or _get_db()
    rows = conn.execute(
        "SELECT term, embedding FROM kg_terms WHERE embedding IS NOT NULL"
    ).fetchall()
    return {r[0]: r[1] for r in rows}


# ---------------------------------------------------------------------------
#  Definitions
# ---------------------------------------------------------------------------

def save_definition(term, definition, source_card_ids, generated_by):
    """Insert or replace a term definition.

    Args:
        term: The term being defined.
        definition: Definition text string.
        source_card_ids: List of card IDs the definition was derived from.
        generated_by: Model/agent identifier string.
    """
    db = _get_db()
    now = datetime.now().isoformat()
    sources_json = json.dumps(source_card_ids, ensure_ascii=False)
    try:
        db.execute(
            """
            INSERT INTO kg_definitions
                (term, definition, sources, source_count, generated_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(term) DO UPDATE SET
                definition   = excluded.definition,
                sources      = excluded.sources,
                source_count = excluded.source_count,
                generated_by = excluded.generated_by,
                updated_at   = excluded.updated_at
            """,
            (term, definition, sources_json, len(source_card_ids), generated_by, now, now),
        )
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error saving definition for term '%s': %s", term, e)
        db.rollback()


def get_definition(term):
    """Return definition dict for a term, or None if not found.

    Returns dict with keys: term, definition, sources (list), source_count,
    generated_by, created_at, updated_at.
    """
    db = _get_db()
    row = db.execute(
        "SELECT * FROM kg_definitions WHERE term = ?", (term,)
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    if result.get("sources"):
        try:
            result["sources"] = json.loads(result["sources"])
        except (json.JSONDecodeError, TypeError):
            pass
    return result


# ---------------------------------------------------------------------------
#  Term Search
# ---------------------------------------------------------------------------

def search_terms_exact(query):
    """Return terms matching exact or prefix match against kg_card_terms.

    Args:
        query: Search string.

    Returns:
        List of distinct matching term strings.
    """
    db = _get_db()
    rows = db.execute(
        "SELECT DISTINCT term FROM kg_card_terms WHERE term = ? OR term LIKE ?",
        (query, query + "%"),
    ).fetchall()
    return [r["term"] for r in rows]


# ---------------------------------------------------------------------------
#  Embeddings
# ---------------------------------------------------------------------------

def get_unembedded_terms():
    """Return list of term strings where embedding IS NULL in kg_terms."""
    db = _get_db()
    rows = db.execute(
        "SELECT term FROM kg_terms WHERE embedding IS NULL"
    ).fetchall()
    return [r["term"] for r in rows]


def save_term_embedding(term, embedding_bytes):
    """Save embedding BLOB for a term (upserts the kg_terms row if needed).

    Args:
        term: Term string.
        embedding_bytes: Raw bytes of the embedding vector.
    """
    db = _get_db()
    try:
        db.execute(
            """
            INSERT INTO kg_terms (term, frequency, embedding)
            VALUES (?, 0, ?)
            ON CONFLICT(term) DO UPDATE SET embedding = excluded.embedding
            """,
            (term, embedding_bytes),
        )
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error saving embedding for term '%s': %s", term, e)
        db.rollback()


# ---------------------------------------------------------------------------
#  Graph Data
# ---------------------------------------------------------------------------

def get_graph_data():
    """Return nodes and edges for 3D graph rendering.

    Each node dict:
        {"id": term, "label": term, "frequency": int,
         "deckColor": "#hex", "deckName": str}

    Each edge dict:
        {"term_a": str, "term_b": str, "weight": int}
    """
    db = _get_db()

    # Build primary deck mapping: term → (deck_id, deck_count)
    deck_rows = db.execute(
        """
        SELECT term, deck_id, COUNT(*) AS cnt
        FROM kg_card_terms
        WHERE deck_id IS NOT NULL
        GROUP BY term, deck_id
        ORDER BY term, cnt DESC
        """
    ).fetchall()

    primary_deck = {}  # term → deck_id with highest card count
    for row in deck_rows:
        term = row["term"]
        if term not in primary_deck:
            primary_deck[term] = row["deck_id"]

    # Fetch terms with reasonable frequency (top ~1500 for performance)
    # Too many nodes kills WebGL performance
    term_rows = db.execute(
        "SELECT term, COALESCE(frequency, 0) AS frequency FROM kg_terms "
        "WHERE frequency >= 10 ORDER BY frequency DESC LIMIT 2000"
    ).fetchall()

    nodes = []
    for r in term_rows:
        term = r["term"]
        deck_id = primary_deck.get(term, 0)
        color_index = int(deck_id) % len(DECK_COLORS)
        nodes.append(
            {
                "id": term,
                "label": term,
                "frequency": r["frequency"],
                "deckColor": DECK_COLORS[color_index],
                "deckName": f"Deck {deck_id}",
            }
        )

    # Only include edges where both terms exist as nodes
    node_ids = {n["id"] for n in nodes}
    raw_edges = get_all_edges(min_weight=1)
    edges = [
        {"source": e["term_a"], "target": e["term_b"], "weight": e["weight"]}
        for e in raw_edges
        if e["term_a"] in node_ids and e["term_b"] in node_ids
    ]

    return {"nodes": nodes, "edges": edges}


def get_graph_status():
    """Return summary statistics for the KG.

    Returns dict:
        {
            "totalCards": int,   — distinct cards with terms
            "totalTerms": int,   — distinct terms in kg_terms
            "lastUpdated": str,  — ISO timestamp of most recently added term or ""
            "pendingUpdates": int — terms in kg_terms with NULL embedding
        }
    """
    db = _get_db()

    total_cards = db.execute(
        "SELECT COUNT(DISTINCT card_id) FROM kg_card_terms"
    ).fetchone()[0]

    total_terms = db.execute(
        "SELECT COUNT(*) FROM kg_terms"
    ).fetchone()[0]

    # Approximate "last updated" from most recent card term insertion is not
    # tracked with a timestamp; fall back to definitions table or empty string.
    last_row = db.execute(
        "SELECT MAX(updated_at) AS last_updated FROM kg_definitions"
    ).fetchone()
    last_updated = last_row["last_updated"] if last_row and last_row["last_updated"] else ""

    pending = db.execute(
        "SELECT COUNT(*) FROM kg_terms WHERE embedding IS NULL"
    ).fetchone()[0]

    return {
        "totalCards": total_cards,
        "totalTerms": total_terms,
        "lastUpdated": last_updated,
        "pendingUpdates": pending,
    }


# ---------------------------------------------------------------------------
#  Deck Cross-Links
# ---------------------------------------------------------------------------

def compute_deck_links(min_shared=3, max_links=200):
    """Compute cross-links between decks based on shared terms.

    Returns the number of links computed.
    """
    db = _get_db()
    db.execute("DELETE FROM kg_deck_links")

    rows = db.execute("""
        SELECT a.deck_id AS deck_a, b.deck_id AS deck_b,
               COUNT(DISTINCT a.term) AS shared_terms,
               GROUP_CONCAT(DISTINCT a.term) AS terms
        FROM kg_card_terms a
        JOIN kg_card_terms b ON a.term = b.term AND a.deck_id < b.deck_id
        WHERE a.deck_id IS NOT NULL AND b.deck_id IS NOT NULL
        GROUP BY a.deck_id, b.deck_id
        HAVING shared_terms >= ?
        ORDER BY shared_terms DESC
        LIMIT ?
    """, (min_shared, max_links)).fetchall()

    for r in rows:
        all_terms = r["terms"].split(",") if r["terms"] else []
        top = all_terms[:5]
        db.execute(
            "INSERT OR REPLACE INTO kg_deck_links VALUES (?, ?, ?, ?)",
            (r["deck_a"], r["deck_b"], r["shared_terms"], json.dumps(top))
        )
    db.commit()
    logger.info("compute_deck_links: %d links computed (min_shared=%d)", len(rows), min_shared)
    return len(rows)


def get_deck_cross_links():
    """Return all deck cross-links for graph rendering."""
    db = _get_db()
    rows = db.execute(
        "SELECT deck_a, deck_b, shared_terms, top_terms FROM kg_deck_links"
    ).fetchall()
    return [
        {
            "source": str(r["deck_a"]),
            "target": str(r["deck_b"]),
            "weight": r["shared_terms"],
            "topTerms": json.loads(r["top_terms"]) if r["top_terms"] else [],
            "type": "crosslink",
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
#  Card Content Cache
# ---------------------------------------------------------------------------

def save_card_content(card_id, question, answer, deck_name):
    """Cache card question/answer text for offline search and benchmark use.

    Args:
        card_id: Anki card ID (int).
        question: Cleaned question text.
        answer: Cleaned answer text.
        deck_name: Deck name string.
    """
    db = _get_db()
    now = datetime.now().isoformat()
    try:
        db.execute(
            """
            INSERT INTO card_content (card_id, question, answer, deck_name, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(card_id) DO UPDATE SET
                question   = excluded.question,
                answer     = excluded.answer,
                deck_name  = excluded.deck_name,
                updated_at = excluded.updated_at
            """,
            (int(card_id), question, answer, deck_name, now),
        )
        db.commit()
    except sqlite3.Error as e:
        logger.error("kg_store: Error saving card content for card %s: %s", card_id, e)
        db.rollback()


def search_card_content(query_text, limit=20):
    """Simple LIKE search on cached card question+answer fields.

    Args:
        query_text: Search string (partial match).
        limit: Max results to return.

    Returns:
        List of dicts with keys: card_id, question, answer, deck_name.
    """
    db = _get_db()
    pattern = "%%%s%%" % query_text.replace("%", "\\%")
    rows = db.execute(
        """
        SELECT card_id, question, answer, deck_name
        FROM card_content
        WHERE question LIKE ? OR answer LIKE ?
        LIMIT ?
        """,
        (pattern, pattern, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def get_card_content(card_id):
    """Return cached content for a single card, or None."""
    db = _get_db()
    row = db.execute(
        "SELECT card_id, question, answer, deck_name FROM card_content WHERE card_id = ?",
        (int(card_id),)
    ).fetchone()
    return dict(row) if row else None


def get_all_card_content():
    """Return all cached card content as a list of dicts."""
    db = _get_db()
    rows = db.execute(
        "SELECT card_id, question, answer, deck_name FROM card_content"
    ).fetchall()
    return [dict(r) for r in rows]


def search_decks_by_term(query):
    """Find deck_ids that contain cards with the given term (exact or partial match)."""
    db = _get_db()
    rows = db.execute(
        "SELECT DISTINCT deck_id FROM kg_card_terms WHERE term LIKE ?",
        (f"%{query}%",)
    ).fetchall()
    return [r["deck_id"] for r in rows if r["deck_id"]]
