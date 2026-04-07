# Neo4j Knowledge Graph Migration — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Branch:** `feature/neo4j-kg` (parallel to main)

## Context

AnkiPlus stores a knowledge graph (terms, co-occurrence edges, definitions, card embeddings) in local SQLite (`card_sessions.db`). This works for a single user but doesn't scale to a multi-tenant learning platform. The goal is to move the KG to a cloud-hosted Neo4j instance so that:

1. **Shared content pool** — cards and terms are deduped across students (same card = one node)
2. **Learning analytics** — agent interactions (sessions, struggles, mastery) are stored as graph relationships, enabling cross-student insights
3. **Reinstall resilience** — a returning user's graph is already in the cloud
4. **Event-based ingestion** — all writes flow through an event queue → Cloud Function → Neo4j

The existing SQLite system continues to work unchanged. A `kg_backend` config flag (`"sqlite"` | `"neo4j"`) determines which backend is active. Both implementations live side-by-side.

## Architecture Overview

```
Local Addon (Python)                         Cloud
┌─────────────────────────┐           ┌──────────────────────────┐
│                         │           │                          │
│  BackgroundEmbedding    │  events   │  Cloud Function          │
│  Thread                 ├──────────►│  `kg-event-processor`    │
│                         │  HTTP     │                          │
│  Agent Sessions         │  POST     │  ┌────────────────────┐  │
│  (Tutor, Research...)   ├──────────►│  │  Neo4j AuraDB Pro  │  │
│                         │           │  │                    │  │
│  Card Reviews           │  events   │  │  Nodes:            │  │
│  (Anki hooks)           ├──────────►│  │  User, Card, Term  │  │
│                         │           │  │  Deck, Definition  │  │
│  ┌───────────────────┐  │           │  │  Session           │  │
│  │ event_queue table │  │           │  │                    │  │
│  │ (local SQLite)    │  │           │  │  Vector Indexes    │  │
│  └───────────────────┘  │           │  └────────────────────┘  │
│                         │           │                          │
│  ┌───────────────────┐  │  queries  │                          │
│  │ neo4j_client.py   │◄├──────────►│                          │
│  │ (read/write)      │  │  Bolt    │                          │
│  └───────────────────┘  │           │                          │
└─────────────────────────┘           └──────────────────────────┘
```

**Read path:** `kg_store.py` delegates to `neo4j_client.py` when `kg_backend == "neo4j"`.
**Write path:** Background thread → `event_queue` table → sync thread → Cloud Function → Neo4j.
**Direct reads:** RAG hot-path queries go directly to Neo4j via Bolt protocol (accept ~50-200ms latency).

## Neo4j Graph Schema

### Nodes

```cypher
// Content nodes (shared across users, deduped)
CREATE (c:Card {
    content_hash: STRING,       // SHA256[:16] — dedup key
    question: STRING,
    answer: STRING,
    embedding: LIST<FLOAT>      // 3072-dim float32
})

CREATE (t:Term {
    name: STRING,               // canonical form
    frequency: INTEGER,
    embedding: LIST<FLOAT>      // 3072-dim, card-averaged
})

CREATE (dk:Deck {
    name: STRING                // dedup key — decks shared by name, not Anki ID
})

CREATE (d:Definition {
    text: STRING,
    generated_by: STRING,       // "llm"
    sources_json: STRING,       // JSON array of content_hashes
    created_at: DATETIME,
    updated_at: DATETIME
})

// User nodes (GDPR-safe)
CREATE (u:User {
    uid: STRING                 // opaque hash of Firebase UID, never email/name
})

// Interaction nodes
CREATE (s:Session {
    agent: STRING,              // "tutor", "research", "definition", "prufer", "plusi"
    started_at: DATETIME,
    duration_seconds: INTEGER,
    depth_level: STRING         // "recall", "apply", "analyze"
})

// Agent registry
CREATE (a:Agent {
    name: STRING                // "tutor", "research", etc.
})
```

### Relationships

```cypher
// Content graph (shared)
(:Card)-[:HAS_TERM {is_definition: BOOLEAN}]->(:Term)
(:Card)-[:IN_DECK]->(:Deck)
(:Term)-[:CO_OCCURS {weight: INTEGER}]->(:Term)
(:Term)-[:DEFINED_BY]->(:Definition)
(:Deck)-[:SHARES_TERMS {count: INTEGER, top_terms: STRING}]->(:Deck)

// Per-user relationships
(:User)-[:OWNS {anki_card_id: INTEGER, anki_deck_id: INTEGER, ease: FLOAT, lapses: INTEGER, interval: INTEGER}]->(:Card)
(:User)-[:HAD_SESSION]->(:Session)
(:User)-[:STRUGGLED_WITH {count: INTEGER, last_seen: DATETIME}]->(:Term)
(:User)-[:MASTERED {confidence: FLOAT, last_seen: DATETIME}]->(:Term)

// Session relationships
(:Session)-[:VIA_AGENT]->(:Agent)
(:Session)-[:ABOUT_CARD]->(:Card)
(:Session)-[:ABOUT_TERM]->(:Term)
```

### Indexes and Constraints

```cypher
// Uniqueness
CREATE CONSTRAINT card_hash IF NOT EXISTS FOR (c:Card) REQUIRE c.content_hash IS UNIQUE;
CREATE CONSTRAINT term_name IF NOT EXISTS FOR (t:Term) REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT user_uid IF NOT EXISTS FOR (u:User) REQUIRE u.uid IS UNIQUE;
CREATE CONSTRAINT deck_name IF NOT EXISTS FOR (d:Deck) REQUIRE d.name IS UNIQUE;
CREATE CONSTRAINT agent_name IF NOT EXISTS FOR (a:Agent) REQUIRE a.name IS UNIQUE;

// Vector indexes (Neo4j 5.x native)
CREATE VECTOR INDEX card_embedding IF NOT EXISTS
FOR (c:Card) ON (c.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 3072, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX term_embedding IF NOT EXISTS
FOR (t:Term) ON (t.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 3072, `vector.similarity_function`: 'cosine'}};

// Lookup indexes
CREATE INDEX term_name_lookup IF NOT EXISTS FOR (t:Term) ON (t.name);
CREATE INDEX card_hash_lookup IF NOT EXISTS FOR (c:Card) ON (c.content_hash);
CREATE INDEX session_agent IF NOT EXISTS FOR (s:Session) ON (s.agent);
```

## GDPR Compliance

### Principles

1. **No PII in Neo4j.** User nodes contain only `uid` (opaque SHA256 hash of Firebase UID). No email, name, IP, or device info.
2. **Educational content is not PII.** Card question/answer text is shared curriculum content.
3. **No user-generated free text in Neo4j.** Chat messages, notes, and personal annotations stay in local SQLite.
4. **Cross-user queries return aggregates only.** No API endpoint exposes individual user paths to other users.
5. **Right to erasure:** Single Cypher query deletes all user data:

```cypher
MATCH (u:User {uid: $uid})
OPTIONAL MATCH (u)-[:HAD_SESSION]->(s:Session)
DETACH DELETE u, s
// Shared Card/Term/Definition nodes survive — they belong to the content graph
```

### Data Classification

| Data | Classification | Location |
|------|---------------|----------|
| User UID (hashed) | Pseudonymized | Neo4j |
| Card content (q/a) | Educational, shared | Neo4j |
| Embeddings | Derived, non-reversible | Neo4j |
| Term names | Educational, shared | Neo4j |
| Session metadata | Behavioral, pseudonymized | Neo4j |
| Chat messages | Personal, potentially PII | Local SQLite only |
| Anki card IDs | Local identifier | Neo4j (on OWNS rel) |
| Review metrics (ease, interval) | Behavioral, pseudonymized | Neo4j (on OWNS rel) |

## Event System

### Event Queue (Local)

New SQLite table in `card_sessions.db`:

```sql
CREATE TABLE IF NOT EXISTS event_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,
    payload     TEXT NOT NULL,       -- JSON
    created_at  TEXT DEFAULT (datetime('now')),
    synced_at   TEXT,                -- NULL = pending, ISO = synced
    retry_count INTEGER DEFAULT 0,
    error       TEXT                 -- last error message if failed
);
CREATE INDEX idx_event_pending ON event_queue(synced_at) WHERE synced_at IS NULL;
```

### Event Types

| Event | Payload | Neo4j Effect |
|-------|---------|-------------|
| `card_embedded` | `{content_hash, question, answer, embedding, deck_name, deck_id, anki_card_id}` | MERGE Card node + OWNS rel + IN_DECK rel |
| `terms_extracted` | `{content_hash, terms: [{name, is_definition}], deck_id}` | MERGE Term nodes + HAS_TERM rels |
| `edges_computed` | `{edges: [{term_a, term_b, weight}]}` | MERGE CO_OCCURS rels |
| `term_embedded` | `{term, embedding}` | SET Term.embedding |
| `frequencies_updated` | `{frequencies: [{term, count}]}` | SET Term.frequency |
| `definition_generated` | `{term, text, source_hashes, generated_by}` | MERGE Definition node + DEFINED_BY rel |
| `deck_links_computed` | `{links: [{deck_a, deck_b, count, top_terms}]}` | MERGE SHARES_TERMS rels |
| `session_ended` | `{agent, card_hashes, term_names, duration, depth_level}` | CREATE Session + rels |
| `card_reviewed` | `{content_hash, anki_card_id, ease, lapses, interval}` | UPDATE OWNS rel properties |
| `term_struggled` | `{term, count}` | MERGE STRUGGLED_WITH rel |
| `term_mastered` | `{term, confidence}` | MERGE MASTERED rel |

### Sync Thread

A background `QThread` that flushes the event queue:

```python
class EventSyncThread(QThread):
    """Flushes local event queue to Cloud Function."""
    
    BATCH_SIZE = 50
    RETRY_MAX = 5
    BACKOFF_BASE = 2  # seconds, exponential
    
    def run(self):
        while not self._stop:
            pending = event_queue.get_pending(limit=self.BATCH_SIZE)
            if not pending:
                self.sleep(5)  # poll every 5 seconds
                continue
            
            try:
                response = requests.post(
                    f"{CLOUD_FUNCTION_URL}/kg-events",
                    json={"events": pending, "uid": hashed_uid},
                    headers={"Authorization": f"Bearer {auth_token}"},
                    timeout=10
                )
                if response.ok:
                    event_queue.mark_synced(pending_ids)
                else:
                    event_queue.increment_retry(pending_ids, response.text)
            except Exception as e:
                event_queue.increment_retry(pending_ids, str(e))
```

### Cloud Function: `kg-event-processor`

Firebase Cloud Function that receives batched events and writes to Neo4j:

```typescript
// functions/src/handlers/kg_events.ts
export async function handleKgEvents(req, res) {
    const { events, uid } = req.body;
    const session = neo4jDriver.session();
    
    try {
        // Ensure user exists
        await session.run('MERGE (u:User {uid: $uid})', { uid });
        
        for (const event of events) {
            switch (event.event_type) {
                case 'card_embedded':
                    await handleCardEmbedded(session, uid, event.payload);
                    break;
                case 'terms_extracted':
                    await handleTermsExtracted(session, event.payload);
                    break;
                // ... other event types
            }
        }
        res.json({ processed: events.length });
    } finally {
        await session.close();
    }
}

async function handleCardEmbedded(session, uid, payload) {
    await session.run(`
        MERGE (c:Card {content_hash: $hash})
        ON CREATE SET c.question = $q, c.answer = $a, c.embedding = $emb
        WITH c
        MERGE (u:User {uid: $uid})
        MERGE (u)-[r:OWNS]->(c)
        SET r.anki_card_id = $cardId
        WITH c
        MERGE (d:Deck {name: $deckName})
        MERGE (c)-[:IN_DECK]->(d)
    `, {
        hash: payload.content_hash,
        q: payload.question,
        a: payload.answer,
        emb: payload.embedding,
        uid: uid,
        cardId: payload.anki_card_id,
        deckId: payload.deck_id,
        deckName: payload.deck_name
    });
}
```

## Python Client Module

### `storage/neo4j_client.py`

Provides the same read interface as `kg_store.py` but backed by Neo4j:

```python
"""Neo4j Knowledge Graph client.

Drop-in replacement for kg_store.py read functions when kg_backend == 'neo4j'.
Uses the neo4j Python driver (Bolt protocol) for direct queries.
"""

from neo4j import GraphDatabase

class Neo4jKGClient:
    def __init__(self, uri, auth):
        self._driver = GraphDatabase.driver(uri, auth=auth)
    
    def close(self):
        self._driver.close()
    
    # --- Read functions (match kg_store.py interface) ---
    
    def get_term_expansions(self, term, max_terms=5):
        """Get co-occurrence expansions for a term."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (t:Term {name: $term})-[r:CO_OCCURS]-(other:Term)
                RETURN other.name AS term, r.weight AS weight
                ORDER BY r.weight DESC
                LIMIT $max
            """, term=term, max=max_terms)
            return [(r["term"], r["weight"]) for r in result]
    
    def exact_term_lookup(self, query):
        """Case-insensitive exact match."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (t:Term)
                WHERE toLower(t.name) = toLower($query)
                RETURN t.name AS term
                LIMIT 1
            """, query=query)
            record = result.single()
            return record["term"] if record else None
    
    def get_connected_terms(self, term):
        """Terms directly connected via edges."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (t:Term {name: $term})-[:CO_OCCURS]-(other:Term)
                RETURN other.name AS connected
            """, term=term)
            return [r["connected"] for r in result]
    
    def load_term_embeddings(self):
        """Load all term embeddings."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (t:Term)
                WHERE t.embedding IS NOT NULL
                RETURN t.name AS term, t.embedding AS embedding
            """)
            return {r["term"]: r["embedding"] for r in result}
    
    def get_definition(self, term):
        """Get cached definition."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (t:Term {name: $term})-[:DEFINED_BY]->(d:Definition)
                RETURN d.text AS definition, d.sources_json AS sources,
                       d.generated_by AS generated_by,
                       d.created_at AS created_at, d.updated_at AS updated_at
            """, term=term)
            record = result.single()
            if not record:
                return None
            return {
                "term": term,
                "definition": record["definition"],
                "sources": json.loads(record["sources_json"]) if record["sources_json"] else [],
                "source_count": len(json.loads(record["sources_json"])) if record["sources_json"] else 0,
                "generated_by": record["generated_by"],
                "created_at": str(record["created_at"]),
                "updated_at": str(record["updated_at"]),
            }
    
    def get_graph_data(self):
        """Graph visualization data."""
        with self._driver.session() as session:
            nodes_result = session.run("""
                MATCH (t:Term)
                WHERE t.frequency >= 10
                RETURN t.name AS term, t.frequency AS frequency
                ORDER BY t.frequency DESC
                LIMIT 2000
            """)
            nodes = [{"id": r["term"], "label": r["term"], "frequency": r["frequency"]}
                     for r in nodes_result]
            
            node_ids = {n["id"] for n in nodes}
            edges_result = session.run("""
                MATCH (a:Term)-[r:CO_OCCURS]->(b:Term)
                WHERE a.name IN $ids AND b.name IN $ids
                RETURN a.name AS source, b.name AS target, r.weight AS weight
            """, ids=list(node_ids))
            edges = [{"source": r["source"], "target": r["target"], "weight": r["weight"]}
                     for r in edges_result]
            
            return {"nodes": nodes, "edges": edges}
    
    def get_graph_status(self):
        """Summary statistics."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (t:Term) WITH count(t) AS totalTerms
                MATCH (c:Card) WITH totalTerms, count(DISTINCT c) AS totalCards
                OPTIONAL MATCH (t2:Term) WHERE t2.embedding IS NULL
                WITH totalTerms, totalCards, count(t2) AS pending
                RETURN totalTerms, totalCards, pending
            """)
            r = result.single()
            return {
                "totalTerms": r["totalTerms"],
                "totalCards": r["totalCards"],
                "pendingUpdates": r["pending"],
                "lastUpdated": "",  # TODO: track via Definition timestamps
            }
    
    # --- Vector search (replaces brute-force EmbeddingManager) ---
    
    def vector_search_cards(self, query_embedding, top_k=10, exclude_hashes=None):
        """ANN search on Card embeddings via Neo4j vector index."""
        with self._driver.session() as session:
            result = session.run("""
                CALL db.index.vector.queryNodes('card_embedding', $k, $emb)
                YIELD node, score
                WHERE NOT node.content_hash IN $exclude
                RETURN node.content_hash AS hash, node.question AS question,
                       node.answer AS answer, score
                ORDER BY score DESC
            """, k=top_k, emb=query_embedding, exclude=exclude_hashes or [])
            return [dict(r) for r in result]
    
    def vector_search_terms(self, query_embedding, top_k=10):
        """ANN search on Term embeddings."""
        with self._driver.session() as session:
            result = session.run("""
                CALL db.index.vector.queryNodes('term_embedding', $k, $emb)
                YIELD node, score
                RETURN node.name AS term, score
                ORDER BY score DESC
            """, k=top_k, emb=query_embedding)
            return [(r["term"], r["score"]) for r in result]
    
    # --- Learning analytics ---
    
    def get_user_weak_terms(self, uid, limit=10):
        """Terms the user struggles with but hasn't mastered."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (u:User {uid: $uid})-[s:STRUGGLED_WITH]->(t:Term)
                WHERE NOT (u)-[:MASTERED]->(t)
                RETURN t.name AS term, s.count AS struggle_count, s.last_seen AS last_seen
                ORDER BY s.count DESC
                LIMIT $limit
            """, uid=uid, limit=limit)
            return [dict(r) for r in result]
    
    def get_recommended_terms(self, uid, limit=10):
        """Terms co-occurring with mastered terms but not yet in user's deck."""
        with self._driver.session() as session:
            result = session.run("""
                MATCH (u:User {uid: $uid})-[:MASTERED]->(known:Term)
                      -[:CO_OCCURS]-(next:Term)
                WHERE NOT (u)-[:OWNS]->(:Card)-[:HAS_TERM]->(next)
                RETURN next.name AS term, count(known) AS relevance
                ORDER BY relevance DESC
                LIMIT $limit
            """, uid=uid, limit=limit)
            return [dict(r) for r in result]
```

### Backend Switch in `kg_store.py`

```python
def _get_backend():
    """Return 'neo4j' or 'sqlite' based on config."""
    try:
        from ..config import get_config
    except ImportError:
        from config import get_config
    return get_config().get('kg_backend', 'sqlite')

def get_term_expansions(term, max_terms=5, db=None):
    if _get_backend() == 'neo4j':
        return _neo4j_client().get_term_expansions(term, max_terms)
    # existing SQLite implementation unchanged
    conn = db or _get_db()
    ...
```

## Config Changes

New keys in `config.json`:

```json
{
    "kg_backend": "sqlite",
    "neo4j_uri": "neo4j+s://xxxx.databases.neo4j.io",
    "neo4j_user": "neo4j",
    "neo4j_password": "...",
    "kg_event_endpoint": "https://us-central1-ankiplus.cloudfunctions.net/kg-events"
}
```

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `storage/neo4j_client.py` | Neo4j read/write client (Cypher queries) |
| `storage/event_queue.py` | Local event queue (SQLite table + enqueue/dequeue) |
| `storage/event_sync.py` | Background sync thread (flushes queue to Cloud Function) |
| `functions/src/handlers/kg_events.ts` | Cloud Function: event processor → Neo4j writes |

### Modified Files

| File | Change |
|------|--------|
| `storage/kg_store.py` | Add backend switch (`_get_backend()`) to each read function |
| `ai/embeddings.py` | `BackgroundEmbeddingThread.run()` emits events after each write step |
| `ai/retrieval.py` | Replace raw `_get_db()` KG lookups with `kg_store` function calls |
| `config.py` | Add `kg_backend`, `neo4j_uri`, `neo4j_user`, `neo4j_password`, `kg_event_endpoint` defaults |
| `functions/src/index.ts` | Register `kg-events` endpoint |
| `functions/src/handlers/router.ts` | Route to kg_events handler |
| `requirements.txt` / `setup.py` | Add `neo4j` Python driver dependency |

### Unchanged

| File | Why |
|------|-----|
| All frontend components | No frontend changes — same data shape from bridge |
| `ui/widget.py` | Bridge methods call `kg_store.py` which handles the switch |
| `ai/kg_enrichment.py` | Calls `kg_store` functions which handle the switch |
| `ai/definition.py` | Same — goes through `kg_store` |

## Initial Data Population

When a user enables Neo4j (`kg_backend: "neo4j"`), a one-time sync emits all existing SQLite KG data as events:

```python
def populate_neo4j_from_sqlite():
    """One-time: emit events for all existing local KG data."""
    from storage.card_sessions import load_all_embeddings
    from storage.kg_store import get_all_edges, ...
    
    # Cards + embeddings
    for card in load_all_embeddings():
        event_queue.enqueue('card_embedded', {
            'content_hash': card['content_hash'],
            'embedding': unpack_embedding(card['embedding']),
            'question': ..., 'answer': ...,
        })
    
    # Terms
    for card_id in all_card_ids_with_terms():
        terms = get_card_terms(card_id)
        event_queue.enqueue('terms_extracted', {...})
    
    # Edges
    edges = get_all_edges()
    event_queue.enqueue('edges_computed', {'edges': edges})
    
    # Definitions, deck links, etc.
    ...
```

This runs in a background thread. The event sync thread flushes it to Neo4j over minutes.

## Cost Model

### Per-Student Marginal Cost

~1.5 MB storage per student (relationships only; shared content is fixed cost).

### Projected AuraDB Pro Costs

| Students | Total Storage | RAM Needed | AuraDB Pro Est. | Per-Student/mo |
|----------|--------------|------------|-----------------|----------------|
| 50 | ~600 MB | 1 GB | $65/mo | $1.30 |
| 100 | ~1 GB | 1 GB | $65/mo | $0.65 |
| 500 | ~2.3 GB | 2 GB | $130/mo | $0.26 |
| 1,000 | ~3.5 GB | 4 GB | $260/mo | $0.26 |
| 5,000 | ~12 GB | 8 GB | $520/mo | $0.10 |
| 10,000 | ~21 GB | 12 GB | $800-1,200/mo | $0.08-0.12 |

Vector storage (embeddings on Card/Term nodes) accounts for ~85% of the shared base cost.

## Verification Plan

1. **Schema creation:** Deploy Neo4j schema, verify constraints and indexes via `SHOW INDEXES`
2. **Event round-trip:** Emit a `card_embedded` event locally → verify Card node appears in Neo4j
3. **Read parity:** For 100 sample terms, compare `get_term_expansions()` results between SQLite and Neo4j backends
4. **Vector search:** Compare top-10 results from Neo4j ANN vs current brute-force — expect >90% overlap
5. **GDPR erasure:** Create test user, populate data, run erasure query, verify no orphaned relationships
6. **Latency benchmark:** Measure RAG hot-path functions (`get_term_expansions`, `exact_term_lookup`) against 50ms target
7. **Initial population:** Run `populate_neo4j_from_sqlite()`, verify node/relationship counts match SQLite
8. **Offline resilience:** Disconnect network, verify events queue locally, reconnect, verify flush
