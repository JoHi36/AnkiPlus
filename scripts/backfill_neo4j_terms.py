#!/usr/bin/env python3
"""One-time backfill: push Terms, HAS_TERM, and CO_OCCURS from SQLite to Neo4j.

Usage:
    python3 scripts/backfill_neo4j_terms.py

Requires: neo4j Python driver (pip3 install neo4j)
Reads: storage/card_sessions.db (kg_terms, kg_card_terms, kg_edges, card_embeddings)
Writes: Neo4j AuraDB (Term nodes, HAS_TERM rels, CO_OCCURS rels)
"""

import os
import sys
import sqlite3
import struct
import hashlib

# Neo4j credentials (same as functions/.env)
NEO4J_URI = "neo4j+s://1f474800.databases.neo4j.io"
NEO4J_USER = "1f474800"
NEO4J_PASSWORD = "iD_l4r2QbxjcbeTFrTcGOajZfREsc7eW7tqKN3aJ7jI"

# Hashed UID (same as kgProcessor.ts)
FIREBASE_UID = "9apQKTOJFufrb2WdcQomLagrRUs1"
HASHED_UID = hashlib.sha256(FIREBASE_UID.encode()).hexdigest()[:32]

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'storage', 'card_sessions.db')
DB_PATH = os.path.normpath(DB_PATH)

BATCH_SIZE = 100


def main():
    from neo4j import GraphDatabase

    print(f"Connecting to Neo4j: {NEO4J_URI}")
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    # Verify connection
    with driver.session() as session:
        result = session.run("MATCH (n) RETURN labels(n)[0] AS type, count(n) AS count")
        print("Current Neo4j state:")
        for r in result:
            print(f"  {r['type']}: {r['count']}")

    print(f"\nReading SQLite: {DB_PATH}")
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    # ── 1. Term nodes ──
    print("\n=== Phase 1: Term nodes ===")
    term_rows = db.execute("SELECT term, frequency, embedding FROM kg_terms").fetchall()
    print(f"Terms to push: {len(term_rows)}")

    total_terms = 0
    for i in range(0, len(term_rows), BATCH_SIZE):
        batch = term_rows[i:i + BATCH_SIZE]
        terms = []
        for row in batch:
            emb = None
            if row['embedding']:
                dim = len(row['embedding']) // 4
                if dim > 0:
                    emb = list(struct.unpack(f'<{dim}f', row['embedding']))
            terms.append({
                'name': row['term'],
                'frequency': row['frequency'] or 0,
                'embedding': emb,
            })

        with driver.session() as session:
            session.run("""
                UNWIND $terms AS t
                MERGE (term:Term {name: t.name})
                SET term.frequency = t.frequency
                WITH term, t
                WHERE t.embedding IS NOT NULL
                SET term.embedding = t.embedding
            """, terms=terms)

        total_terms += len(batch)
        if total_terms % 500 == 0:
            print(f"  Terms: {total_terms}/{len(term_rows)}")

    print(f"  Done: {total_terms} terms pushed")

    # ── 2. HAS_TERM relationships ──
    print("\n=== Phase 2: HAS_TERM relationships ===")

    # Build card_id → content_hash mapping
    hash_rows = db.execute("SELECT card_id, content_hash FROM card_embeddings").fetchall()
    card_hash_map = {row['card_id']: row['content_hash'] for row in hash_rows}
    print(f"Card→hash mapping: {len(card_hash_map)} entries")

    ct_rows = db.execute("SELECT card_id, term, is_definition FROM kg_card_terms").fetchall()
    print(f"HAS_TERM relationships to push: {len(ct_rows)}")

    total_rels = 0
    skipped = 0
    for i in range(0, len(ct_rows), BATCH_SIZE):
        batch = ct_rows[i:i + BATCH_SIZE]
        rels = []
        for row in batch:
            content_hash = card_hash_map.get(row['card_id'])
            if not content_hash:
                skipped += 1
                continue
            rels.append({
                'hash': content_hash,
                'term': row['term'],
                'is_def': bool(row['is_definition']),
            })

        if rels:
            with driver.session() as session:
                session.run("""
                    UNWIND $rels AS r
                    MATCH (c:Card {content_hash: r.hash})
                    MERGE (t:Term {name: r.term})
                    MERGE (c)-[:HAS_TERM {is_definition: r.is_def}]->(t)
                """, rels=rels)

        total_rels += len(rels)
        if total_rels % 1000 == 0:
            print(f"  HAS_TERM: {total_rels}/{len(ct_rows)} (skipped {skipped})")

    print(f"  Done: {total_rels} relationships pushed (skipped {skipped} — no content_hash)")

    # ── 3. CO_OCCURS edges ──
    print("\n=== Phase 3: CO_OCCURS edges ===")
    edge_rows = db.execute("SELECT term_a, term_b, weight FROM kg_edges").fetchall()
    print(f"CO_OCCURS edges to push: {len(edge_rows)}")

    total_edges = 0
    for i in range(0, len(edge_rows), BATCH_SIZE):
        batch = edge_rows[i:i + BATCH_SIZE]
        edges = [{'term_a': r['term_a'], 'term_b': r['term_b'], 'weight': r['weight']}
                 for r in batch]

        with driver.session() as session:
            session.run("""
                UNWIND $edges AS e
                MATCH (a:Term {name: e.term_a})
                MATCH (b:Term {name: e.term_b})
                MERGE (a)-[:CO_OCCURS {weight: e.weight}]->(b)
            """, edges=edges)

        total_edges += len(batch)
        if total_edges % 1000 == 0:
            print(f"  CO_OCCURS: {total_edges}/{len(edge_rows)}")

    print(f"  Done: {total_edges} edges pushed")

    # ── Verify ──
    print("\n=== Verification ===")
    with driver.session() as session:
        result = session.run("MATCH (n) RETURN labels(n)[0] AS type, count(n) AS count ORDER BY count DESC")
        for r in result:
            print(f"  {r['type']}: {r['count']}")

        r = session.run("MATCH ()-[r:CO_OCCURS]->() RETURN count(r) AS c").single()
        print(f"  CO_OCCURS edges: {r['c']}")

        r = session.run("MATCH ()-[r:HAS_TERM]->() RETURN count(r) AS c").single()
        print(f"  HAS_TERM rels: {r['c']}")

    driver.close()
    db.close()
    print("\nBackfill complete.")


if __name__ == '__main__':
    main()
