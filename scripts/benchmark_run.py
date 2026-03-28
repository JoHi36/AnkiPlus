#!/usr/bin/env python3
"""Benchmark Runner — evaluates the retrieval pipeline against test cases.

Run from project root:
  python3 scripts/benchmark_run.py                    # All 80 cases
  python3 scripts/benchmark_run.py --category synonym  # One category
  python3 scripts/benchmark_run.py --id direct_001     # One case

Scores each pipeline step and writes results to benchmark/results.json.
"""
import sys
import os
import json
import struct
import math
import time
import sqlite3
import argparse

# ── Path Setup ───────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

DB_PATH = os.path.join(PROJECT_ROOT, 'storage', 'card_sessions.db')
TEST_CASES_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'test_cases.json')
RESULTS_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'results.json')

# ── Constants ────────────────────────────────────────────────────────────────

TOP_K = 10          # Semantic search top-k for scoring
SQL_TOP_K = 50      # SQL search candidates before ranking

# ── Tunable Parameters (saved with each benchmark run) ────────────────────

BENCHMARK_CONFIG = {
    'top_k': TOP_K,
    'sql_top_k': SQL_TOP_K,
    'k_precise_primary': 50,
    'k_semantic_primary': 60,
    'k_focus': 80,              # Focus lane: query rerank within candidate pool
    'k_broad_primary': 70,
    'k_precise_secondary': 90,
    'k_broad_secondary': 110,
    'k_semantic_secondary': 120,
    'confidence_high': 0.025,
    'confidence_low': 0.012,
    'focus_enabled': True,      # NEW — toggle focus lane
    'embedding_fallback': True, # NEW — combine with intent when no domain terms
    'max_context_terms': 10,    # Max terms from card_context for resolved_intent
    'lenient_validation': True, # LLM validates alternative cards on fail
    'llm_expansion': False,     # LLM generates associated terms per query (WIP — terms good, weighting needs tuning)
    'k_llm_semantic': 75,       # k-value for LLM-expanded terms semantic lane
}

# ── Config & Embedding API ───────────────────────────────────────────────────

def _load_config():
    config_path = os.path.join(PROJECT_ROOT, 'config.json')
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {}


EMBED_CACHE_PATH = os.path.join(PROJECT_ROOT, 'benchmark', '.embed_cache.json')
_embed_cache = {}

def _load_embed_cache():
    global _embed_cache
    if os.path.exists(EMBED_CACHE_PATH):
        try:
            with open(EMBED_CACHE_PATH) as f:
                _embed_cache = json.load(f)
            print("  Embed cache: %d cached queries (no API calls needed for these)" % len(_embed_cache))
        except Exception:
            _embed_cache = {}

def _save_embed_cache():
    try:
        with open(EMBED_CACHE_PATH, 'w') as f:
            json.dump(_embed_cache, f)
    except Exception:
        pass

def embed_texts(texts, config=None):
    """Call backend /embed endpoint with caching. Cached queries skip the API call."""
    global _embed_cache
    if not texts:
        return []

    # Check cache first — return cached embeddings for known texts
    results = [None] * len(texts)
    uncached_indices = []
    uncached_texts = []
    for i, text in enumerate(texts):
        if text in _embed_cache:
            results[i] = _embed_cache[text]
        else:
            uncached_indices.append(i)
            uncached_texts.append(text)

    if not uncached_texts:
        return results  # All cached — zero API calls

    # Embed only uncached texts
    if config is None:
        config = _load_config()
    import urllib.request
    backend_url = config.get('backend_url', 'https://apiv2-wrcj6dja6q-ew.a.run.app')
    auth_token = config.get('auth_token', '')
    if not auth_token:
        return results
    url = '%s/embed' % backend_url.rstrip('/')
    payload = json.dumps({'texts': uncached_texts}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', 'Bearer %s' % auth_token)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        embeddings = data.get('embeddings', [None] * len(uncached_texts))
        for j, emb in enumerate(embeddings):
            idx = uncached_indices[j]
            results[idx] = emb
            if emb:
                _embed_cache[uncached_texts[j]] = emb  # Cache for next run
        _save_embed_cache()
        return results
    except Exception as e:
        return results  # Return partial (cached) results on API failure

# ── LLM Validation Cache ─────────────────────────────────────────────────────

VALIDATION_CACHE_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'validation_cache.json')
_validation_cache = {}  # key: "case_id:card_id" → True (whitelist) or False (blacklist)

def _load_validation_cache():
    global _validation_cache
    if os.path.exists(VALIDATION_CACHE_PATH):
        try:
            with open(VALIDATION_CACHE_PATH) as f:
                _validation_cache = json.load(f)
            print("  Validation cache: %d entries (%d whitelist, %d blacklist)" % (
                len(_validation_cache),
                sum(1 for v in _validation_cache.values() if v),
                sum(1 for v in _validation_cache.values() if not v)))
        except Exception:
            _validation_cache = {}

def _save_validation_cache():
    try:
        with open(VALIDATION_CACHE_PATH, 'w') as f:
            json.dump(_validation_cache, f, indent=2)
    except Exception:
        pass

def _get_card_content(card_id, db):
    """Load card text from Anki DB (fields contain question+answer)."""
    import re as _re
    anki_db_path = os.path.join(os.path.dirname(PROJECT_ROOT), '..', 'Benutzer 1', 'collection.anki2')
    anki_db_path = os.path.normpath(anki_db_path)
    if not os.path.exists(anki_db_path):
        # Try common alternatives
        for name in ['Benutzer 1', 'User 1']:
            p = os.path.normpath(os.path.join(os.path.dirname(PROJECT_ROOT), '..', name, 'collection.anki2'))
            if os.path.exists(p):
                anki_db_path = p
                break
    if not os.path.exists(anki_db_path):
        return None, None
    try:
        import sqlite3 as _sql
        adb = _sql.connect('file:%s?mode=ro' % anki_db_path, uri=True)
        row = adb.execute(
            "SELECT n.flds FROM cards c JOIN notes n ON c.nid = n.id WHERE c.id = ?",
            (int(card_id),)
        ).fetchone()
        adb.close()
        if row and row[0]:
            # Fields are separated by \x1f; strip HTML tags
            fields = row[0].split('\x1f')
            clean = lambda s: _re.sub(r'<[^>]+>', '', s).strip()[:500]
            question = clean(fields[0]) if len(fields) > 0 else ''
            answer = clean(fields[1]) if len(fields) > 1 else ''
            return question, answer
    except Exception:
        pass
    return None, None

def validate_card_llm(case_id, query, card_id, card_question, card_answer, target_question, target_answer, config):
    """Ask LLM: does this card answer the query as well as the target card?

    Returns True (whitelist) or False (blacklist).
    """
    cache_key = '%s:%s' % (case_id, card_id)
    if cache_key in _validation_cache:
        return _validation_cache[cache_key]

    api_key = config.get('api_key', '') or config.get('google_api_key', '')
    if not api_key:
        return False

    prompt = """Du bist ein strenger Benchmark-Evaluator. Beantworte NUR mit "JA" oder "NEIN".

Frage: "%s"

ZIELKARTE (korrekte Antwort):
Vorderseite: %s
Rückseite: %s

GEFUNDENE KARTE (zu bewerten):
Vorderseite: %s
Rückseite: %s

Enthält die GEFUNDENE KARTE die nötigen Informationen, um die Frage VOLLSTÄNDIG und KORREKT zu beantworten — genauso gut wie die Zielkarte? Nur "JA" wenn der Informationsgehalt wirklich gleichwertig ist. Bei Zweifel: "NEIN".""" % (
        query, target_question, target_answer, card_question, card_answer)

    import urllib.request
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s' % api_key
    payload = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'maxOutputTokens': 5, 'temperature': 0}
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        answer = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip().upper()
        result = answer.startswith('JA')
    except Exception:
        result = False

    _validation_cache[cache_key] = result
    _save_validation_cache()
    return result

def validate_top_cards(case_id, query, expected_card_id, rrf_ranked, db, config):
    """Check top-K cards for lenient matches. Returns (lenient_rank, matched_card_id) or (None, None)."""
    if not BENCHMARK_CONFIG.get('lenient_validation'):
        return None, None

    # Load target card content
    target_q, target_a = _get_card_content(expected_card_id, db)
    if not target_q and not target_a:
        return None, None

    for rank, (card_id, _) in enumerate(rrf_ranked[:TOP_K], start=1):
        if card_id == expected_card_id:
            break  # Strict pass — no need for lenient

        cache_key = '%s:%s' % (case_id, card_id)
        # Check cache first
        if cache_key in _validation_cache:
            if _validation_cache[cache_key]:
                return rank, card_id  # Whitelist hit
            continue  # Blacklist hit

        # LLM validation needed
        card_q, card_a = _get_card_content(card_id, db)
        if not card_q and not card_a:
            _validation_cache[cache_key] = False
            continue

        is_valid = validate_card_llm(
            case_id, query, card_id, card_q, card_a, target_q, target_a, config)
        if is_valid:
            return rank, card_id

    return None, None


# ── LLM Term Expansion ───────────────────────────────────────────────────────

LLM_EXPANSION_CACHE_PATH = os.path.join(PROJECT_ROOT, 'benchmark', '.llm_expansion_cache.json')
_llm_expansion_cache = {}

def _load_llm_expansion_cache():
    global _llm_expansion_cache
    if os.path.exists(LLM_EXPANSION_CACHE_PATH):
        try:
            with open(LLM_EXPANSION_CACHE_PATH) as f:
                _llm_expansion_cache = json.load(f)
            print("  LLM expansion cache: %d queries cached" % len(_llm_expansion_cache))
        except Exception:
            _llm_expansion_cache = {}

def _save_llm_expansion_cache():
    try:
        with open(LLM_EXPANSION_CACHE_PATH, 'w') as f:
            json.dump(_llm_expansion_cache, f, ensure_ascii=False)
    except Exception:
        pass

def expand_terms_llm(query, config):
    """Ask Gemini Flash for associated medical/scientific terms.

    Returns list of term strings. Cached per query.
    """
    if query in _llm_expansion_cache:
        return _llm_expansion_cache[query]

    api_key = config.get('api_key', '')
    if not api_key:
        return []

    prompt = """Nenne 5-10 medizinische/wissenschaftliche Fachbegriffe die mit dieser Frage assoziiert sind.
Nur die Begriffe, einer pro Zeile, keine Erklärungen, keine Nummerierung.

Frage: "%s"

Begriffe:""" % query

    import urllib.request
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s' % api_key
    payload = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'maxOutputTokens': 1024, 'temperature': 0}
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        terms = [t.strip().strip('-').strip('•').strip() for t in text.strip().split('\n') if t.strip()]
        terms = [t for t in terms if len(t) > 2 and len(t) < 60][:10]
    except Exception:
        terms = []

    _llm_expansion_cache[query] = terms
    _save_llm_expansion_cache()
    return terms


# ── Index Loading ────────────────────────────────────────────────────────────

def load_kg_term_index(db):
    """Load all KG term embeddings, L2-normalized, into a dict."""
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
        vec = [v / norm for v in vec] if norm > 0 else vec
        index[term] = vec
    return index


def load_card_embeddings(db):
    """Load all card embeddings, L2-normalized, into a dict {card_id: vector}."""
    rows = db.execute(
        "SELECT card_id, embedding FROM card_embeddings WHERE embedding IS NOT NULL"
    ).fetchall()
    index = {}
    for card_id, emb_bytes in rows:
        if not emb_bytes:
            continue
        dim = len(emb_bytes) // 4
        if dim == 0:
            continue
        vec = list(struct.unpack('%df' % dim, emb_bytes))
        norm = math.sqrt(sum(v * v for v in vec))
        vec = [v / norm for v in vec] if norm > 0 else vec
        index[card_id] = vec
    return index

# ── Step Scorers ─────────────────────────────────────────────────────────────

def build_query_focus(query, domain_terms):
    """Build query_focus from the non-domain parts of the query.

    Extracts the 'question direction' — everything that isn't a domain term.
    E.g. "Wie lang ist der Dünndarm?" with domain=["Dünndarm"] → "wie lang"
    """
    import re
    # Normalize: remove punctuation, lowercase
    clean = re.sub(r'[^\w\s\-]', ' ', query.lower())
    words = clean.split()
    domain_lower = {t.lower() for t in domain_terms}
    # Simple stopwords that carry no question direction
    stop = {'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'ist', 'sind',
            'von', 'dem', 'den', 'des', 'im', 'in', 'am', 'an', 'auf', 'zu',
            'für', 'mit', 'bei', 'nach', 'es', 'ich', 'du', 'er', 'sie', 'wir',
            'man', 'noch', 'auch', 'so', 'hier', 'da', 'denn', 'mal', 'nur'}
    focus_words = [w for w in words if w not in domain_lower and w not in stop and len(w) > 1]
    return ' '.join(focus_words) if focus_words else ''


def compute_focus_ranks(focus_embedding, candidate_card_ids, card_embeddings):
    """Compute focus similarity for candidate cards, return as ranked dict.

    Only scores cards already in the candidate pool — never introduces new cards.
    Returns dict of {card_id: {'rank': int, 'sim': float}} sorted by similarity.
    """
    if focus_embedding is None:
        return {}
    norm = math.sqrt(sum(v * v for v in focus_embedding))
    if norm == 0:
        return {}
    normed = [v / norm for v in focus_embedding]

    scored = []
    for cid in candidate_card_ids:
        card_vec = card_embeddings.get(cid)
        if card_vec:
            sim = sum(a * b for a, b in zip(normed, card_vec))
            scored.append((cid, sim))

    scored.sort(key=lambda x: x[1], reverse=True)
    return {cid: {'rank': rank, 'sim': sim}
            for rank, (cid, sim) in enumerate(scored, start=1)}


def score_term_extraction(query, expected_terms):
    """Step 1: Extract terms from query, score against expected_terms."""
    from ai.kg_enrichment import extract_query_terms
    extracted = extract_query_terms(query)
    extracted_lower = {t.lower() for t in extracted}
    found = [t for t in expected_terms if t.lower() in extracted_lower]
    missed = [t for t in expected_terms if t.lower() not in extracted_lower]
    score = len(found) / len(expected_terms) if expected_terms else 0.0
    return {
        'score': round(score, 4),
        'extracted': extracted,
        'expected': expected_terms,
        'found': found,
        'missed': missed,
    }


def score_kg_expansion(query, expected_terms, enrichment_result):
    """Step 2: Check if expected_terms appear in the expanded term set."""
    # Collect all terms produced by enrich_query
    tier1 = enrichment_result.get('tier1_terms', [])
    tier2 = enrichment_result.get('tier2_terms', [])
    kg_found = enrichment_result.get('kg_terms_found', [])
    expansions = enrichment_result.get('expansions', {})

    expanded_set = set()
    for t in tier1 + tier2 + kg_found:
        expanded_set.add(t.lower())
    for exps in expansions.values():
        for t, _ in exps:
            expanded_set.add(t.lower())

    found = [t for t in expected_terms if t.lower() in expanded_set]
    missed = [t for t in expected_terms if t.lower() not in expanded_set]
    score = len(found) / len(expected_terms) if expected_terms else 0.0
    return {
        'score': round(score, 4),
        'found': found,
        'missed': missed,
        'total_expanded': len(expanded_set),
    }


ANKI_DB_PATH = os.path.join(
    os.path.dirname(PROJECT_ROOT),  # addons21/
    '..', 'Benutzer 1', 'collection.anki2'
)
ANKI_DB_PATH = os.path.normpath(ANKI_DB_PATH)

_anki_db = None

def _get_anki_db():
    """Open Anki's native collection database (read-only)."""
    global _anki_db
    if _anki_db is None:
        if not os.path.exists(ANKI_DB_PATH):
            return None
        _anki_db = sqlite3.connect('file:%s?mode=ro' % ANKI_DB_PATH, uri=True)
    return _anki_db


def _anki_note_to_card_id(anki_db, note_id):
    """Get first card_id for a note_id from Anki's cards table."""
    row = anki_db.execute("SELECT id FROM cards WHERE nid = ? LIMIT 1", (note_id,)).fetchone()
    return row[0] if row else None


def score_sql_search(acceptable_ids, enrichment_result, db):
    """Step 3: Search Anki's NATIVE database with full-text LIKE queries.

    Falls back to KG-term proxy if Anki DB is not available.
    """
    # Collect all SQL search terms from enrichment result
    tier1_terms = enrichment_result.get('tier1_terms', [])
    tier2_terms = enrichment_result.get('tier2_terms', [])
    kg_found = enrichment_result.get('kg_terms_found', [])
    expansions = enrichment_result.get('expansions', {})

    all_search_terms = []
    seen_lower = set()
    for t in tier1_terms + tier2_terms + kg_found:
        if t.lower() not in seen_lower:
            seen_lower.add(t.lower())
            all_search_terms.append(t)
    for exps in expansions.values():
        for t, _ in exps:
            if t.lower() not in seen_lower:
                seen_lower.add(t.lower())
                all_search_terms.append(t)

    if not all_search_terms:
        return {
            'score': 0.0,
            'target_rank': None,
            'total_hits': 0,
            'note': 'no search terms',
        }

    anki_db = _get_anki_db()

    if anki_db:
        # NATIVE ANKI SEARCH: full-text LIKE on notes.flds
        note_hit_counts = {}
        for term in all_search_terms:
            rows = anki_db.execute(
                "SELECT id FROM notes WHERE flds LIKE ? COLLATE NOCASE",
                ('%' + term + '%',)
            ).fetchall()
            for (note_id,) in rows:
                note_hit_counts[note_id] = note_hit_counts.get(note_id, 0) + 1

        # Rank by hit count descending
        ranked = sorted(note_hit_counts.items(), key=lambda x: x[1], reverse=True)

        # Find any acceptable card: map card_ids to note_ids
        acceptable_note_ids = set()
        for cid in acceptable_ids:
            row = anki_db.execute("SELECT nid FROM cards WHERE id = ?", (cid,)).fetchone()
            if row:
                acceptable_note_ids.add(row[0])

        target_rank = None
        for rank, (note_id, _) in enumerate(ranked, start=1):
            if note_id in acceptable_note_ids:
                target_rank = rank
                break

        total_hits = len(ranked)
        score = 1.0 if (target_rank is not None and target_rank <= SQL_TOP_K) else 0.0
        return {
            'score': score,
            'target_rank': target_rank,
            'total_hits': total_hits,
            'search_type': 'anki_native',
        }

    else:
        # FALLBACK: KG-term proxy (when Anki DB not available)
        card_hit_counts = {}
        for term in all_search_terms:
            rows = db.execute(
                "SELECT card_id FROM kg_card_terms WHERE LOWER(term) = LOWER(?)",
                (term,)
            ).fetchall()
            for (card_id,) in rows:
                card_hit_counts[card_id] = card_hit_counts.get(card_id, 0) + 1

        ranked = sorted(card_hit_counts.items(), key=lambda x: x[1], reverse=True)

        target_rank = None
        for rank, (card_id, _) in enumerate(ranked, start=1):
            if card_id in acceptable_ids:
                target_rank = rank
                break

        total_hits = len(ranked)
        score = 1.0 if (target_rank is not None and target_rank <= SQL_TOP_K) else 0.0
        return {
            'score': score,
            'target_rank': target_rank,
            'total_hits': total_hits,
            'search_type': 'kg_proxy',
        }


def score_semantic_search(acceptable_ids, query_embedding, card_embeddings):
    """Step 4: Cosine similarity of query embedding vs card embeddings."""
    if query_embedding is None:
        return {
            'score': 0,
            'error': 'embedding unavailable',
            'target_rank': None,
            'total_hits': 0,
        }

    norm = math.sqrt(sum(v * v for v in query_embedding))
    if norm == 0:
        return {
            'score': 0,
            'error': 'zero norm embedding',
            'target_rank': None,
            'total_hits': 0,
        }
    normed_query = [v / norm for v in query_embedding]

    # Compute cosine similarity for all cards
    scored = []
    for card_id, card_vec in card_embeddings.items():
        sim = sum(a * b for a, b in zip(normed_query, card_vec))
        scored.append((card_id, sim))
    scored.sort(key=lambda x: x[1], reverse=True)

    target_rank = None
    for rank, (card_id, _) in enumerate(scored, start=1):
        if card_id in acceptable_ids:
            target_rank = rank
            break

    total_hits = len(scored)
    score = 1.0 if (target_rank is not None and target_rank <= TOP_K) else 0.0
    return {
        'score': score,
        'target_rank': target_rank,
        'total_hits': total_hits,
    }


def score_rrf_ranking(acceptable_ids, sql_result, semantic_result,
                      card_embeddings, enrichment_result, query_embedding, db,
                      focus_embedding=None, llm_embedding=None):
    """Step 5: Compute RRF scores and rank expected card."""
    from ai.rrf import compute_rrf, _get_k

    # Build sql_results dict for compute_rrf
    tier1_terms = enrichment_result.get('tier1_terms', [])
    tier2_terms = enrichment_result.get('tier2_terms', [])
    kg_found = enrichment_result.get('kg_terms_found', [])
    expansions = enrichment_result.get('expansions', {})

    all_search_terms = []
    seen_lower = set()
    for t in tier1_terms + tier2_terms + kg_found:
        if t.lower() not in seen_lower:
            seen_lower.add(t.lower())
            all_search_terms.append(t)
    for exps in expansions.values():
        for t, _ in exps:
            if t.lower() not in seen_lower:
                seen_lower.add(t.lower())
                all_search_terms.append(t)

    # Compute SQL card hit counts
    card_hit_counts = {}
    for term in all_search_terms:
        rows = db.execute(
            "SELECT card_id FROM kg_card_terms WHERE LOWER(term) = LOWER(?)",
            (term,)
        ).fetchall()
        for (card_id,) in rows:
            card_hit_counts[card_id] = card_hit_counts.get(card_id, 0) + 1

    sql_ranked = sorted(card_hit_counts.items(), key=lambda x: x[1], reverse=True)

    # Build sql_results dict for compute_rrf
    sql_results = {}
    for rank, (card_id, _) in enumerate(sql_ranked, start=1):
        sql_results[card_id] = {
            'rank': rank,
            'query_type': 'precise',
            'tier': 'primary',
        }

    # LLM-expanded SQL: search for LLM-generated terms (secondary tier)
    llm_sql_terms = enrichment_result.get('llm_sql_terms', [])
    if llm_sql_terms:
        llm_rank = len(sql_results) + 1
        for term in llm_sql_terms:
            rows = db.execute(
                "SELECT card_id FROM kg_card_terms WHERE LOWER(term) = LOWER(?)",
                (term,)
            ).fetchall()
            for (card_id,) in rows:
                if card_id not in sql_results:
                    sql_results[card_id] = {
                        'rank': llm_rank,
                        'query_type': 'broad',
                        'tier': 'secondary',
                    }
                    llm_rank += 1

    # Build semantic_results dict for compute_rrf
    semantic_results = {}
    if query_embedding is not None:
        norm = math.sqrt(sum(v * v for v in query_embedding))
        if norm > 0:
            normed_query = [v / norm for v in query_embedding]
            scored = []
            for card_id, card_vec in card_embeddings.items():
                sim = sum(a * b for a, b in zip(normed_query, card_vec))
                scored.append((card_id, sim))
            scored.sort(key=lambda x: x[1], reverse=True)
            for rank, (card_id, _) in enumerate(scored, start=1):
                semantic_results[card_id] = {'rank': rank, 'tier': 'primary'}

    # Semantic-informed SQL Expansion (Feedback Loop)
    # Re-enabled now that primary metric is Recall@10.
    if semantic_results:
        top_sem_cards = sorted(semantic_results.items(), key=lambda x: x[1]['rank'])[:5]
        feedback_terms = set()
        for card_id, _ in top_sem_cards:
            rows = db.execute("SELECT term FROM kg_card_terms WHERE card_id = ?", (int(card_id),)).fetchall()
            for r in rows:
                feedback_terms.add(r[0])
        # Remove terms already in SQL queries
        existing_lower = {t.lower() for t in all_search_terms}
        new_fb_terms = [t for t in feedback_terms if t.lower() not in existing_lower]
        if new_fb_terms:
            fb_rank = len(sql_results) + 1
            for term in new_fb_terms[:10]:
                rows = db.execute("SELECT card_id FROM kg_card_terms WHERE LOWER(term) = LOWER(?)", (term,)).fetchall()
                for r in rows:
                    cid = r[0]  # Keep as int — consistent with sql_results keys
                    if cid not in sql_results:
                        sql_results[cid] = {'rank': fb_rank, 'query_type': 'broad', 'tier': 'secondary'}
                        fb_rank += 1

    # ── Focus Lane: compute focus ranks for candidate pool ──────────────
    # LLM lane only boosts existing candidates — never introduces new cards
    candidate_ids = set(sql_results.keys()) | set(semantic_results.keys())
    focus_results = {}
    if focus_embedding is not None and BENCHMARK_CONFIG.get('focus_enabled'):
        focus_results = compute_focus_ranks(focus_embedding, candidate_ids, card_embeddings)

    # ── LLM Semantic Lane: LLM-generated terms embedding vs all cards ──
    llm_semantic_results = {}
    if llm_embedding is not None:
        ln = math.sqrt(sum(v * v for v in llm_embedding))
        if ln > 0:
            normed_llm = [v / ln for v in llm_embedding]
            l_scored = []
            for card_id, card_vec in card_embeddings.items():
                sim = sum(a * b for a, b in zip(normed_llm, card_vec))
                l_scored.append((card_id, sim))
            l_scored.sort(key=lambda x: x[1], reverse=True)
            for rank, (card_id, _) in enumerate(l_scored, start=1):
                llm_semantic_results[card_id] = {'rank': rank}

    # ── RRF with Focus + LLM ─────────────────────────────────────────
    k_focus = BENCHMARK_CONFIG.get('k_focus', 80)
    k_llm = BENCHMARK_CONFIG.get('k_llm_semantic', 75)
    scores = {}
    for cid in candidate_ids:
        s = 0.0
        if cid in sql_results:
            sql = sql_results[cid]
            k = _get_k(sql['query_type'], sql['tier'])
            s += 1.0 / (k + sql['rank'])
        if cid in semantic_results:
            sem = semantic_results[cid]
            k = _get_k('semantic', sem['tier'])
            s += 1.0 / (k + sem['rank'])
        if cid in llm_semantic_results:
            s += 1.0 / (k_llm + llm_semantic_results[cid]['rank'])
        if cid in focus_results:
            s += 1.0 / (k_focus + focus_results[cid]['rank'])
        scores[cid] = s

    rrf_ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    target_rank = None
    for rank, (card_id, _) in enumerate(rrf_ranked, start=1):
        if card_id in acceptable_ids:
            target_rank = rank
            break

    total_merged = len(rrf_ranked)
    score = 1.0 if (target_rank is not None and target_rank <= TOP_K) else 0.0
    return {
        'score': score,
        'target_rank': target_rank,
        'total_merged': total_merged,
        'focus_candidates': len(focus_results),
        'rrf_ranked': rrf_ranked,  # pass through for confidence step
    }


def score_confidence(rrf_result):
    """Step 6: Check confidence level."""
    from ai.rrf import check_confidence

    rrf_ranked = rrf_result.get('rrf_ranked', [])
    level = check_confidence(rrf_ranked)

    # Expected: if target is in top 1-3 → high, else medium/low
    target_rank = rrf_result.get('target_rank')
    if target_rank is not None and target_rank <= 3:
        expected = 'high'
    elif target_rank is not None and target_rank <= 10:
        expected = 'medium'
    else:
        expected = 'low'

    score = 1.0 if level == expected else (0.5 if level in ('medium', 'high') and expected in ('medium', 'high') else 0.0)
    return {
        'score': score,
        'level': level,
        'expected': expected,
    }

# ── Single Case Runner ────────────────────────────────────────────────────────

def run_case(case, db, kg_term_index, card_embeddings, config):
    """Run all pipeline steps for one test case. Returns result dict."""
    from ai.kg_enrichment import extract_query_terms, enrich_query

    case_id = case['id']
    query = case['query']
    expected_card_id = case['expected_card_id']
    acceptable_ids = {expected_card_id}
    expected_terms = case.get('expected_terms', [])
    expected_in_top_k = case.get('expected_in_top_k', TOP_K)

    result = {
        'id': case_id,
        'category': case['category'],
        'query': query,
        'overall_pass': False,
        'target_rank': None,
        'steps': {},
        'enrichment_detail': {},
    }

    # ── Step 1: Term Extraction ──────────────────────────────────────────────
    try:
        step1 = score_term_extraction(query, expected_terms)
    except Exception as e:
        step1 = {'score': 0.0, 'error': str(e)}
    result['steps']['term_extraction'] = step1

    # ── Resolve intent: synthetic from card_context.terms ───────────────
    # Synthetic (pure German terms) outperforms Router intents (91% vs 66%)
    # because term extraction works better with clean terms than LLM sentences.
    resolved_intent = None
    card_context = case.get('card_context')
    if card_context and card_context.get('terms'):
        context_terms = card_context['terms'][:10]
        resolved_intent = ' und '.join(context_terms)

    extracted_terms = step1.get('extracted', [])

    # ── Embedding fallback: enrich query with intent when no domain terms ─
    # extract_query_terms finds ALL capitalized words — KG membership is checked here.
    kg_lower = {k.lower() for k in kg_term_index}
    domain_terms = [t for t in extracted_terms if t.lower() in kg_lower]
    embed_query = query
    if BENCHMARK_CONFIG.get('embedding_fallback') and len(domain_terms) == 0 and resolved_intent:
        embed_query = query + ' ' + resolved_intent

    # ── Embedding Call ───────────────────────────────────────────────────────
    # Embed: individual terms + sentence query + resolved_intent
    # Focus uses the query_embedding directly (no extra embed needed)
    texts_to_embed = list(extracted_terms) + [embed_query]
    if resolved_intent:
        texts_to_embed.append(resolved_intent)

    embedding_available = True
    query_embedding = None
    term_embeddings = {}
    sentence_embeddings = {}

    emb_result = embed_texts(texts_to_embed, config=config)

    if isinstance(emb_result, dict) and 'error' in emb_result:
        embedding_available = False
        emb_error = emb_result['error']
    elif isinstance(emb_result, list):
        all_embs = emb_result
        # Assign term embeddings
        for i, term in enumerate(extracted_terms):
            if i < len(all_embs) and all_embs[i] is not None:
                term_embeddings[term] = all_embs[i]
        # Sentence embedding for the query (or enriched query if fallback)
        sent_offset = len(extracted_terms)
        if sent_offset < len(all_embs) and all_embs[sent_offset] is not None:
            query_embedding = all_embs[sent_offset]
            sentence_embeddings[query] = query_embedding
            if embed_query != query:
                sentence_embeddings[embed_query] = query_embedding
        # Sentence embedding for resolved_intent (if present)
        if resolved_intent:
            ri_offset = sent_offset + 1
            if ri_offset < len(all_embs) and all_embs[ri_offset] is not None:
                sentence_embeddings[resolved_intent] = all_embs[ri_offset]
    else:
        embedding_available = False
        emb_error = 'unexpected embedding response'

    # ── Enrichment (enrich_query) ────────────────────────────────────────────
    try:
        enrichment_result = enrich_query(
            query,
            resolved_intent=resolved_intent,
            kg_term_index=kg_term_index,
            term_embeddings=term_embeddings,
            sentence_embeddings=sentence_embeddings,
        )
    except Exception as e:
        enrichment_result = {
            'tier1_terms': extracted_terms,
            'tier2_terms': [],
            'kg_terms_found': [],
            'expansions': {},
            'precise_primary': [],
            'broad_primary': [],
            'precise_secondary': [],
            'broad_secondary': [],
            'embedding_primary': query,
            'embedding_secondary': '',
            'unmatched_terms': [],
        }

    # Store enrichment detail
    result['enrichment_detail'] = {
        'resolved_intent': resolved_intent or '',
        'focus_mode': 'query_rerank',
        'embedding_fallback_used': embed_query != query,
        'precise_primary': enrichment_result.get('precise_primary', []),
        'broad_primary': enrichment_result.get('broad_primary', []),
        'precise_secondary': enrichment_result.get('precise_secondary', []),
        'broad_secondary': enrichment_result.get('broad_secondary', []),
        'tier1_terms': enrichment_result.get('tier1_terms', []),
        'tier2_terms': enrichment_result.get('tier2_terms', []),
        'kg_terms_found': enrichment_result.get('kg_terms_found', []),
    }

    # ── LLM Term Expansion (Tier 3: associated terms from LLM) ──────────
    llm_terms = []
    llm_embedding = None
    if BENCHMARK_CONFIG.get('llm_expansion') and embedding_available:
        llm_terms = expand_terms_llm(query, config)
        if llm_terms:
            llm_text = ' '.join(llm_terms)
            llm_emb_result = embed_texts([llm_text], config=config)
            if isinstance(llm_emb_result, list) and llm_emb_result and llm_emb_result[0]:
                llm_embedding = llm_emb_result[0]
            result['enrichment_detail']['llm_terms'] = llm_terms

    # ── LLM Terms → SQL Search (find cards via LLM-generated terms) ─────
    if llm_terms and BENCHMARK_CONFIG.get('llm_expansion'):
        enrichment_result['llm_sql_terms'] = llm_terms

    # ── Step 2: KG Expansion ─────────────────────────────────────────────────
    try:
        step2 = score_kg_expansion(query, expected_terms, enrichment_result)
    except Exception as e:
        step2 = {'score': 0.0, 'error': str(e)}
    result['steps']['kg_expansion'] = step2

    # ── Step 3: SQL Search ───────────────────────────────────────────────────
    try:
        step3 = score_sql_search(acceptable_ids, enrichment_result, db)
    except Exception as e:
        step3 = {'score': 0.0, 'error': str(e)}
    result['steps']['sql_search'] = step3

    # ── Step 4: Semantic Search ──────────────────────────────────────────────
    if not embedding_available:
        step4 = {'score': 0, 'error': 'embedding unavailable', 'target_rank': None, 'total_hits': 0}
    else:
        try:
            step4 = score_semantic_search(acceptable_ids, query_embedding, card_embeddings)
        except Exception as e:
            step4 = {'score': 0.0, 'error': str(e), 'target_rank': None, 'total_hits': 0}
    result['steps']['semantic_search'] = step4

    # ── Step 5: RRF Ranking ──────────────────────────────────────────────────
    if not embedding_available:
        step5 = {'score': 0, 'error': 'embedding unavailable', 'target_rank': None, 'total_merged': 0}
    else:
        try:
            step5 = score_rrf_ranking(
                acceptable_ids, step3, step4,
                card_embeddings, enrichment_result, query_embedding, db,
                focus_embedding=query_embedding,
                llm_embedding=llm_embedding)
        except Exception as e:
            step5 = {'score': 0.0, 'error': str(e), 'target_rank': None, 'total_merged': 0}
    result['steps']['rrf_ranking'] = step5
    _rrf_ranked_for_lenient = step5.get('rrf_ranked', [])

    # ── Step 6: Confidence ───────────────────────────────────────────────────
    if not embedding_available:
        step6 = {'score': 0, 'error': 'embedding unavailable', 'level': 'low', 'expected': 'high'}
    else:
        try:
            # We need to re-run RRF to get rrf_ranked for confidence check
            # Recompute quietly
            from ai.rrf import compute_rrf, check_confidence

            tier1_terms = enrichment_result.get('tier1_terms', [])
            tier2_terms = enrichment_result.get('tier2_terms', [])
            kg_found = enrichment_result.get('kg_terms_found', [])
            expansions = enrichment_result.get('expansions', {})

            all_search_terms = []
            seen_lower = set()
            for t in tier1_terms + tier2_terms + kg_found:
                if t.lower() not in seen_lower:
                    seen_lower.add(t.lower())
                    all_search_terms.append(t)
            for exps in expansions.values():
                for t, _ in exps:
                    if t.lower() not in seen_lower:
                        seen_lower.add(t.lower())
                        all_search_terms.append(t)

            card_hit_counts = {}
            for term in all_search_terms:
                rows = db.execute(
                    "SELECT card_id FROM kg_card_terms WHERE LOWER(term) = LOWER(?)",
                    (term,)
                ).fetchall()
                for (card_id,) in rows:
                    card_hit_counts[card_id] = card_hit_counts.get(card_id, 0) + 1

            sql_ranked_conf = sorted(card_hit_counts.items(), key=lambda x: x[1], reverse=True)
            sql_results_conf = {}
            for rank, (card_id, _) in enumerate(sql_ranked_conf, start=1):
                sql_results_conf[card_id] = {'rank': rank, 'query_type': 'precise', 'tier': 'primary'}

            semantic_results_conf = {}
            if query_embedding is not None:
                norm = math.sqrt(sum(v * v for v in query_embedding))
                if norm > 0:
                    normed_query = [v / norm for v in query_embedding]
                    scored_conf = []
                    for card_id, card_vec in card_embeddings.items():
                        sim = sum(a * b for a, b in zip(normed_query, card_vec))
                        scored_conf.append((card_id, sim))
                    scored_conf.sort(key=lambda x: x[1], reverse=True)
                    for rank, (card_id, _) in enumerate(scored_conf, start=1):
                        semantic_results_conf[card_id] = {'rank': rank, 'tier': 'primary'}

            rrf_ranked_conf = compute_rrf(sql_results_conf, semantic_results_conf)
            level = check_confidence(rrf_ranked_conf)

            # Expected confidence based on actual RRF rank of target
            target_rank_rrf = step5.get('target_rank')
            if target_rank_rrf is not None and target_rank_rrf <= 3:
                expected_conf = 'high'
            elif target_rank_rrf is not None and target_rank_rrf <= 10:
                expected_conf = 'medium'
            else:
                expected_conf = 'low'

            conf_score = 1.0 if level == expected_conf else (
                0.5 if level in ('medium', 'high') and expected_conf in ('medium', 'high') else 0.0)
            step6 = {'score': conf_score, 'level': level, 'expected': expected_conf}
        except Exception as e:
            step6 = {'score': 0.0, 'error': str(e), 'level': 'unknown', 'expected': 'high'}
    result['steps']['confidence'] = step6

    # ── Overall Pass & Rank ──────────────────────────────────────────────────
    target_rank = step5.get('target_rank') if embedding_available else step3.get('target_rank')
    result['target_rank'] = target_rank
    result['pass_type'] = 'fail'

    # Rank tier for color-coded display: green (1-3), yellow (4-10), red (>10)
    if target_rank is not None and target_rank <= 3:
        result['rank_tier'] = 'green'
    elif target_rank is not None and target_rank <= 10:
        result['rank_tier'] = 'yellow'
    else:
        result['rank_tier'] = 'red'

    # Strict pass: exact target card in Top-K
    if target_rank is not None and target_rank <= TOP_K:
        result['overall_pass'] = True
        result['pass_type'] = 'strict'
    elif not embedding_available and step3.get('target_rank') is not None and step3['target_rank'] <= TOP_K:
        result['overall_pass'] = True
        result['pass_type'] = 'strict'

    # ── Lenient validation: LLM checks top-K cards on strict fail ─────────
    result['lenient_pass'] = result['overall_pass']
    result['lenient_rank'] = target_rank
    result['lenient_card_id'] = None

    if not result['overall_pass'] and BENCHMARK_CONFIG.get('lenient_validation'):
        if _rrf_ranked_for_lenient:
            lenient_rank, matched_id = validate_top_cards(
                case_id, query, expected_card_id, _rrf_ranked_for_lenient, db, config)
            if lenient_rank is not None:
                result['lenient_pass'] = True
                result['lenient_rank'] = lenient_rank
                result['lenient_card_id'] = matched_id
                result['pass_type'] = 'lenient'

    # Clean up large internal data before returning
    if 'rrf_ranked' in result['steps'].get('rrf_ranking', {}):
        del result['steps']['rrf_ranking']['rrf_ranked']

    return result

# ── Aggregate Stats ───────────────────────────────────────────────────────────

def compute_aggregate(results):
    """Compute aggregate metrics from list of case results."""
    if not results:
        return {}

    total = len(results)
    passed = sum(1 for r in results if r.get('overall_pass', False))
    lenient_passed = sum(1 for r in results if r.get('lenient_pass', False))

    # Top-3 recall (quality reference)
    top3_passed = sum(
        1 for r in results
        if r.get('target_rank') is not None and r['target_rank'] <= 3
    )

    # MRR
    reciprocal_ranks = []
    for r in results:
        rank = r.get('target_rank')
        if rank is not None and rank > 0:
            reciprocal_ranks.append(1.0 / rank)
        else:
            reciprocal_ranks.append(0.0)
    mrr = sum(reciprocal_ranks) / len(reciprocal_ranks) if reciprocal_ranks else 0.0

    # By category
    by_category = {}
    for r in results:
        cat = r.get('category', 'unknown')
        if cat not in by_category:
            by_category[cat] = {'cases': 0, 'passed': 0, 'lenient_passed': 0}
        by_category[cat]['cases'] += 1
        if r.get('overall_pass', False):
            by_category[cat]['passed'] += 1
        if r.get('lenient_pass', False):
            by_category[cat]['lenient_passed'] += 1
    for cat in by_category:
        c = by_category[cat]
        c['recall'] = round(c['passed'] / c['cases'], 4) if c['cases'] > 0 else 0.0
        c['lenient_recall'] = round(c['lenient_passed'] / c['cases'], 4) if c['cases'] > 0 else 0.0

    # By step (legacy 6 steps)
    step_names = ['term_extraction', 'kg_expansion', 'sql_search',
                  'semantic_search', 'rrf_ranking', 'confidence']
    by_step = {}
    for step in step_names:
        scores = []
        for r in results:
            step_data = r.get('steps', {}).get(step, {})
            if 'error' not in step_data or step_data.get('score') is not None:
                scores.append(step_data.get('score', 0.0))
        by_step[step] = round(sum(scores) / len(scores), 4) if scores else 0.0

    # ── Simplified 4 indicators ──────────────────────────────────────
    def _compute_indicators(case_list):
        """Compute 4 simplified indicators for a list of cases."""
        if not case_list:
            return {}
        n = len(case_list)

        # 1. Begriffe: combined term extraction + kg expansion (max of both)
        begriffe_scores = []
        for r in case_list:
            te = r.get('steps', {}).get('term_extraction', {}).get('score', 0)
            kg = r.get('steps', {}).get('kg_expansion', {}).get('score', 0)
            begriffe_scores.append(max(te, kg))

        # 2. SQL: target card found by SQL? Score based on rank
        sql_scores = []
        for r in case_list:
            rank = r.get('steps', {}).get('sql_search', {}).get('target_rank')
            if rank is not None and rank <= 10:
                sql_scores.append(1.0)
            elif rank is not None and rank <= 50:
                sql_scores.append(0.5)
            elif rank is not None:
                sql_scores.append(0.2)
            else:
                sql_scores.append(0.0)

        # 3. Semantic: target card found by semantic? Score based on rank
        sem_scores = []
        for r in case_list:
            rank = r.get('steps', {}).get('semantic_search', {}).get('target_rank')
            if rank is not None and rank <= 10:
                sem_scores.append(1.0)
            elif rank is not None and rank <= 50:
                sem_scores.append(0.5)
            elif rank is not None and rank <= 200:
                sem_scores.append(0.2)
            else:
                sem_scores.append(0.0)

        # 4. Ergebnis: final RRF rank in top 10
        result_scores = [1.0 if r.get('overall_pass') else 0.0 for r in case_list]

        return {
            'begriffe': round(sum(begriffe_scores) / n, 4),
            'sql': round(sum(sql_scores) / n, 4),
            'semantic': round(sum(sem_scores) / n, 4),
            'ergebnis': round(sum(result_scores) / n, 4),
        }

    # Overall indicators
    indicators = _compute_indicators(results)

    # Per-category indicators (for drill-down)
    by_category_indicators = {}
    for cat in by_category:
        cat_cases = [r for r in results if r.get('category') == cat]
        by_category_indicators[cat] = _compute_indicators(cat_cases)

    return {
        'overall': {
            'recall_at_k': round(passed / total, 4) if total > 0 else 0.0,
            'lenient_recall_at_k': round(lenient_passed / total, 4) if total > 0 else 0.0,
            'recall_at_3': round(top3_passed / total, 4) if total > 0 else 0.0,
            'top3_passed': top3_passed,
            'mrr': round(mrr, 4),
            'total_cases': total,
            'passed': passed,
            'lenient_passed': lenient_passed,
        },
        'by_category': by_category,
        'indicators': indicators,
        'by_category_indicators': by_category_indicators,
        'by_step': by_step,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
    }

# ── Print Summary ─────────────────────────────────────────────────────────────

def print_summary(aggregate):
    """Print formatted results summary."""
    overall = aggregate.get('overall', {})
    by_cat = aggregate.get('by_category', {})
    by_step = aggregate.get('by_step', {})

    passed = overall.get('passed', 0)
    total = overall.get('total_cases', 0)
    recall = overall.get('recall_at_k', 0.0)
    mrr = overall.get('mrr', 0.0)

    top3_passed = overall.get('top3_passed', 0)
    recall3 = overall.get('recall_at_3', 0.0)

    lenient_passed = overall.get('lenient_passed', passed)
    lenient_recall = overall.get('lenient_recall_at_k', recall)

    print()
    print('=' * 50)
    print('RESULTS')
    print('  Strict  Recall@10: %d%% (%d/%d passed)' % (int(recall * 100), passed, total))
    print('  Lenient Recall@10: %d%% (%d/%d passed)' % (int(lenient_recall * 100), lenient_passed, total))
    print('  Top-3:             %d%% (%d/%d)' % (int(recall3 * 100), top3_passed, total))
    print('  MRR: %.3f' % mrr)

    if by_cat:
        print()
        print('  By Category:          strict  lenient')
        for cat, stats in sorted(by_cat.items()):
            lr = stats.get('lenient_recall', stats['recall'])
            print('    %-12s: %3d%%     %3d%%   (%d/%d)' % (
                cat, int(stats['recall'] * 100), int(lr * 100),
                stats['passed'], stats['cases']))

    if by_step:
        print()
        print('  By Step (avg score):')
        step_labels = {
            'term_extraction': 'term_extraction',
            'kg_expansion': 'kg_expansion',
            'sql_search': 'sql_search',
            'semantic_search': 'semantic_search',
            'rrf_ranking': 'rrf_ranking',
            'confidence': 'confidence',
        }
        for step, label in step_labels.items():
            score = by_step.get(step, 0.0)
            bar = '#' * int(score * 10)
            print('    %-22s: %3d%% %-10s' % (label, int(score * 100), bar))

    print('=' * 50)
    print()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='AnkiPlus Retrieval Benchmark Runner')
    parser.add_argument('--category', help='Run only cases in this category')
    parser.add_argument('--id', help='Run only the case with this ID')
    args = parser.parse_args()

    # Load test cases
    if not os.path.exists(TEST_CASES_PATH):
        print('ERROR: test_cases.json not found at %s' % TEST_CASES_PATH)
        sys.exit(1)
    with open(TEST_CASES_PATH) as f:
        all_cases = json.load(f)

    # Filter cases
    cases = all_cases
    if args.id:
        cases = [c for c in cases if c['id'] == args.id]
        if not cases:
            print('ERROR: No case with id=%s found' % args.id)
            sys.exit(1)
    elif args.category:
        cases = [c for c in cases if c['category'] == args.category]
        if not cases:
            print('ERROR: No cases in category=%s' % args.category)
            sys.exit(1)

    # Load DB
    if not os.path.exists(DB_PATH):
        print('ERROR: DB not found at %s' % DB_PATH)
        sys.exit(1)
    db = sqlite3.connect(DB_PATH)

    # Load config
    config = _load_config()

    # Load embedding cache (skips API calls for previously embedded queries)
    _load_embed_cache()
    _load_validation_cache()
    _load_llm_expansion_cache()

    # Load KG term index
    print('Loading KG term index...')
    t0 = time.time()
    kg_term_index = load_kg_term_index(db)
    print('  Loaded %d term embeddings in %.0fms' % (len(kg_term_index), (time.time() - t0) * 1000))

    # Load card embeddings
    print('Loading card embeddings...')
    t0 = time.time()
    card_embeddings = load_card_embeddings(db)
    print('  Loaded %d card embeddings in %.0fms' % (len(card_embeddings), (time.time() - t0) * 1000))

    print('Running %d test cases...' % len(cases))
    print()

    results = []
    for i, case in enumerate(cases, start=1):
        case_id = case['id']
        query = case['query']
        # Progress indicator
        sys.stdout.write('\r  [%d/%d] %s — %s' % (
            i, len(cases), case_id, query[:40]))
        sys.stdout.flush()

        try:
            result = run_case(case, db, kg_term_index, card_embeddings, config)
        except Exception as e:
            result = {
                'id': case_id,
                'category': case.get('category', 'unknown'),
                'query': query,
                'overall_pass': False,
                'target_rank': None,
                'steps': {},
                'enrichment_detail': {},
                'error': str(e),
            }
        results.append(result)

    sys.stdout.write('\n')

    db.close()

    # Compute aggregate
    aggregate = compute_aggregate(results)

    # Load docs snapshot for versioning
    docs_path = os.path.join(PROJECT_ROOT, 'docs', 'reference', 'RETRIEVAL_SYSTEM.md')
    docs_content = ''
    if os.path.exists(docs_path):
        with open(docs_path, 'r', encoding='utf-8') as f:
            docs_content = f.read()

    # Build output
    output = {
        'config': BENCHMARK_CONFIG,
        'aggregate': aggregate,
        'cases': results,
        'docs_snapshot': docs_content,
    }

    # Save results
    os.makedirs(os.path.dirname(RESULTS_PATH), exist_ok=True)
    with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # Save to history only if new highscore (Recall@10)
    history_dir = os.path.join(os.path.dirname(RESULTS_PATH), 'history')
    os.makedirs(history_dir, exist_ok=True)
    current_recall = aggregate.get('overall', {}).get('recall_at_k', 0)
    prev_best = 0
    for fname in os.listdir(history_dir):
        if not fname.endswith('.json'):
            continue
        try:
            with open(os.path.join(history_dir, fname), 'r') as fh:
                prev = json.load(fh)
            r = prev.get('aggregate', {}).get('overall', {}).get('recall_at_k', 0)
            if r > prev_best:
                prev_best = r
        except Exception:
            continue

    print('Results saved to %s' % RESULTS_PATH)
    if current_recall > prev_best:
        ts = aggregate.get('timestamp', time.strftime('%Y-%m-%d_%H-%M-%S'))
        safe_ts = ts.replace(' ', '_').replace(':', '-')
        recall_pct = int(round(current_recall * 100))
        history_path = os.path.join(history_dir, '%s_%dpct.json' % (safe_ts, recall_pct))
        with open(history_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print('NEW HIGHSCORE! %d%% > %d%% — saved to %s' % (recall_pct, int(round(prev_best * 100)), history_path))
    else:
        print('No new highscore (%d%% <= %d%% best)' % (int(round(current_recall * 100)), int(round(prev_best * 100))))

    # Print summary
    print_summary(aggregate)


if __name__ == '__main__':
    main()
