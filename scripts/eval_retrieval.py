#!/usr/bin/env python3
"""Retrieval pipeline evaluation script.

Run from project root:
  python3 scripts/eval_retrieval.py "wie lang ist der dünndarm"
  python3 scripts/eval_retrieval.py "was ist das Besondere an braunem Fettgewebe"
  python3 scripts/eval_retrieval.py --all   # run all built-in test queries

Shows the full pipeline: term extraction → embedding expansion → edge expansion → queries.
No Anki needed — reads KG database directly.
"""
import sys
import os
import json
import struct
import math
import time
import sqlite3

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# ── Config ──────────────────────────────────────────────────────────────────

DB_PATH = os.path.join(PROJECT_ROOT, 'storage', 'card_sessions.db')

TEST_QUERIES = [
    "wie lang ist der dünndarm",
    "was macht ATP in der Zelle",
    "wo liegt der Plexus brachialis",
    "welche Hormone produziert die Schilddrüse",
    "Bauernfettgewebe",  # Typo test
    "wie funktioniert die Nernst-Gleichung",
    "was ist das Besondere an braunem Fettgewebe",
    "welche Hirnnerven gibt es",
]


# ── Helpers ─────────────────────────────────────────────────────────────────

def load_kg_term_index(db):
    """Load pre-computed KG term embeddings into memory."""
    rows = db.execute(
        "SELECT term, embedding FROM kg_terms WHERE embedding IS NOT NULL"
    ).fetchall()
    index = {}
    for term, emb_bytes in rows:
        if not emb_bytes:
            continue
        dim = len(emb_bytes) // 4
        if dim == 0:
            continue
        vec = list(struct.unpack('%df' % dim, emb_bytes))
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        index[term] = vec
    return index


def _load_config_direct():
    """Load config.json directly without importing aqt."""
    config_path = os.path.join(PROJECT_ROOT, 'config.json')
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {}


def embed_texts_via_backend(texts):
    """Call the backend /embed endpoint directly."""
    try:
        import urllib.request
        config = _load_config_direct()
        backend_url = config.get('backend_url', 'https://apiv2-wrcj6dja6q-ew.a.run.app')
        auth_token = config.get('auth_token', '')
        if not auth_token:
            print("  [!] No auth_token in config.json — cannot embed")
            return [None] * len(texts)

        url = '%s/embed' % backend_url.rstrip('/')
        payload = json.dumps({'texts': texts}).encode('utf-8')
        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', 'Bearer %s' % auth_token)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data.get('embeddings', [None] * len(texts))
    except Exception as e:
        print("  [!] Embedding API call failed: %s" % e)
        return [None] * len(texts)


def print_section(title):
    print()
    print("═" * 70)
    print("  %s" % title)
    print("═" * 70)


def print_step(step, detail=""):
    print("  ├─ %s%s" % (step, (" — " + detail) if detail else ""))


def print_list(items, prefix="  │  "):
    for item in items:
        print("%s• %s" % (prefix, item))


# ── Main Pipeline ───────────────────────────────────────────────────────────

def evaluate_query(query, db, kg_term_index, resolved_intent=None):
    """Run the full enrichment pipeline for a query and print results."""

    from ai.kg_enrichment import extract_query_terms, enrich_query

    print_section("Query: \"%s\"" % query)
    if resolved_intent:
        print("  Resolved intent: \"%s\"" % resolved_intent)

    t0 = time.time()

    # Step 1: Extract terms
    terms = extract_query_terms(query)
    print_step("1. Term Extraction", "%d terms" % len(terms))
    print_list(terms)

    # Step 2: Embed terms + sentence
    print_step("2. Embedding", "calling API...")
    texts_to_embed = list(terms) + [query]
    if resolved_intent:
        texts_to_embed.append(resolved_intent)

    t_emb = time.time()
    all_embeddings = embed_texts_via_backend(texts_to_embed)
    emb_time = (time.time() - t_emb) * 1000
    print_step("   Embedding done", "%.0fms, %d vectors" % (emb_time, len([e for e in all_embeddings if e])))

    # Build dicts
    term_embeddings = {}
    for i, term in enumerate(terms):
        if i < len(all_embeddings) and all_embeddings[i]:
            term_embeddings[term] = all_embeddings[i]

    sentence_embeddings = {}
    sem_offset = len(terms)
    if sem_offset < len(all_embeddings) and all_embeddings[sem_offset]:
        sentence_embeddings[query] = all_embeddings[sem_offset]
    if resolved_intent and sem_offset + 1 < len(all_embeddings) and all_embeddings[sem_offset + 1]:
        sentence_embeddings[resolved_intent] = all_embeddings[sem_offset + 1]

    # Step 3: Sentence-level KG expansion (manual, for visibility)
    print_step("3. Sentence-Level KG Expansion")
    sentence_emb = sentence_embeddings.get(query)
    if sentence_emb and kg_term_index:
        norm = math.sqrt(sum(v * v for v in sentence_emb))
        normed = [v / norm for v in sentence_emb] if norm > 0 else sentence_emb
        terms_lower = {t.lower() for t in terms}

        scored = []
        for kg_term, kg_vec in kg_term_index.items():
            if kg_term.lower() in terms_lower:
                continue
            score = sum(a * b for a, b in zip(normed, kg_vec))
            if score >= 0.55:
                scored.append((kg_term, score))
        scored.sort(key=lambda x: x[1], reverse=True)

        if scored:
            print_list(["%s (%.3f)" % (t, s) for t, s in scored[:15]])
        else:
            print("  │  (no matches above threshold 0.55)")
    else:
        print("  │  (no sentence embedding available)")

    # Step 4: Term-level KG expansion (manual, for visibility)
    print_step("4. Term-Level KG Expansion (threshold 0.75)")
    for term in terms:
        emb = term_embeddings.get(term)
        if not emb or not kg_term_index:
            continue
        norm = math.sqrt(sum(v * v for v in emb))
        if norm == 0:
            continue
        normed = [v / norm for v in emb]
        scored = []
        for kg_term, kg_vec in kg_term_index.items():
            if kg_term.lower() == term.lower():
                continue
            score = sum(a * b for a, b in zip(normed, kg_vec))
            if score >= 0.75:
                scored.append((kg_term, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        if scored:
            print("  │  '%s' → %s" % (term, [(t, round(s, 3)) for t, s in scored[:5]]))

    # Step 5: Edge expansion
    print_step("5. Graph Edge Expansion")
    all_expansion_terms = set()
    if sentence_emb and kg_term_index:
        # Collect terms from sentence expansion
        for kg_term, score in scored[:10]:
            all_expansion_terms.add(kg_term)

    all_edge_terms = list(terms) + list(all_expansion_terms)
    for term in all_edge_terms:
        # Try exact, then canonical case-insensitive lookup
        lookup_term = term
        rows = db.execute(
            "SELECT term_b, weight FROM kg_edges WHERE term_a = ? "
            "UNION "
            "SELECT term_a, weight FROM kg_edges WHERE term_b = ? "
            "ORDER BY weight DESC LIMIT 5",
            (lookup_term, lookup_term)
        ).fetchall()
        if not rows:
            canonical = db.execute(
                "SELECT term FROM kg_terms WHERE LOWER(term) = LOWER(?) LIMIT 1",
                (term,)).fetchone()
            if canonical and canonical[0] != term:
                lookup_term = canonical[0]
                rows = db.execute(
                    "SELECT term_b, weight FROM kg_edges WHERE term_a = ? "
                    "UNION "
                    "SELECT term_a, weight FROM kg_edges WHERE term_b = ? "
                    "ORDER BY weight DESC LIMIT 5",
                    (lookup_term, lookup_term)
                ).fetchall()
        if rows:
            print("  │  '%s' edges → %s" % (term, [(r[0], r[1]) for r in rows]))

    # Step 6: Full enrich_query() call
    print_step("6. enrich_query() — Full Pipeline Result")
    t_enrich = time.time()
    result = enrich_query(
        query,
        resolved_intent=resolved_intent,
        kg_term_index=kg_term_index,
        term_embeddings=term_embeddings,
        sentence_embeddings=sentence_embeddings,
    )
    enrich_time = (time.time() - t_enrich) * 1000

    print("  │")
    print("  │  Tier 1 terms: %s" % result.get('tier1_terms', []))
    print("  │  Tier 2 terms: %s" % result.get('tier2_terms', []))
    print("  │  KG found:     %s" % result.get('kg_terms_found', []))
    print("  │")
    print("  │  Precise Primary:")
    for q in result.get('precise_primary', []):
        print("  │    SQL: %s" % q)
    print("  │  Broad Primary:")
    for q in result.get('broad_primary', []):
        print("  │    SQL: %s" % q)
    if result.get('precise_secondary'):
        print("  │  Precise Secondary:")
        for q in result.get('precise_secondary', []):
            print("  │    SQL: %s" % q)
    if result.get('broad_secondary'):
        print("  │  Broad Secondary:")
        for q in result.get('broad_secondary', []):
            print("  │    SQL: %s" % q)
    print("  │")
    print("  │  Embedding Primary: %s" % (result.get('embedding_primary', '')[:80] + '...'))
    if result.get('embedding_secondary'):
        print("  │  Embedding Secondary: %s" % (result.get('embedding_secondary', '')[:80] + '...'))

    total_time = (time.time() - t0) * 1000
    print("  │")
    print("  └─ Total: %.0fms (embed: %.0fms, enrich: %.0fms)" % (total_time, emb_time, enrich_time))

    # Step 7: Expansion detail
    print()
    print("  Expansions detail:")
    for term, exps in result.get('expansions', {}).items():
        if exps:
            print("    %s → %s" % (term, [(t, round(w, 3)) for t, w in exps[:5]]))

    return result


# ── Entry Point ─────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/eval_retrieval.py \"query\"")
        print("       python3 scripts/eval_retrieval.py --all")
        sys.exit(1)

    # Load KG database
    if not os.path.exists(DB_PATH):
        print("ERROR: KG database not found at %s" % DB_PATH)
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    # Stats
    term_count = db.execute("SELECT COUNT(*) FROM kg_terms").fetchone()[0]
    edge_count = db.execute("SELECT COUNT(*) FROM kg_edges").fetchone()[0]
    embedded_count = db.execute("SELECT COUNT(*) FROM kg_terms WHERE embedding IS NOT NULL").fetchone()[0]
    print("KG Stats: %d terms, %d edges, %d embedded (%.0f%%)" % (
        term_count, edge_count, embedded_count,
        (embedded_count / term_count * 100) if term_count > 0 else 0))

    # Load term index
    print("Loading KG term index...")
    t0 = time.time()
    kg_term_index = load_kg_term_index(db)
    print("Loaded %d term embeddings in %.0fms" % (len(kg_term_index), (time.time() - t0) * 1000))

    if sys.argv[1] == '--all':
        for query in TEST_QUERIES:
            evaluate_query(query, db, kg_term_index)
            print()
    else:
        query = ' '.join(sys.argv[1:])
        evaluate_query(query, db, kg_term_index)

    db.close()


if __name__ == '__main__':
    main()
