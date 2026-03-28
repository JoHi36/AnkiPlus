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


def score_sql_search(expected_card_id, enrichment_result, db):
    """Step 3: Search kg_card_terms with extracted terms, find rank of expected card."""
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

    # Count how many search terms match each card
    card_hit_counts = {}
    for term in all_search_terms:
        rows = db.execute(
            "SELECT card_id FROM kg_card_terms WHERE LOWER(term) = LOWER(?)",
            (term,)
        ).fetchall()
        for (card_id,) in rows:
            card_hit_counts[card_id] = card_hit_counts.get(card_id, 0) + 1

    # Rank by hit count descending
    ranked = sorted(card_hit_counts.items(), key=lambda x: x[1], reverse=True)

    target_rank = None
    for rank, (card_id, _) in enumerate(ranked, start=1):
        if card_id == expected_card_id:
            target_rank = rank
            break

    total_hits = len(ranked)
    score = 1.0 if (target_rank is not None and target_rank <= SQL_TOP_K) else 0.0
    return {
        'score': score,
        'target_rank': target_rank,
        'total_hits': total_hits,
    }


def score_semantic_search(expected_card_id, query_embedding, card_embeddings):
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
        if card_id == expected_card_id:
            target_rank = rank
            break

    total_hits = len(scored)
    score = 1.0 if (target_rank is not None and target_rank <= TOP_K) else 0.0
    return {
        'score': score,
        'target_rank': target_rank,
        'total_hits': total_hits,
    }


def score_rrf_ranking(expected_card_id, sql_result, semantic_result,
                      card_embeddings, enrichment_result, query_embedding, db):
    """Step 5: Compute RRF scores and rank expected card."""
    from ai.rrf import compute_rrf

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

    rrf_ranked = compute_rrf(sql_results, semantic_results)

    target_rank = None
    for rank, (card_id, _) in enumerate(rrf_ranked, start=1):
        if card_id == expected_card_id:
            target_rank = rank
            break

    total_merged = len(rrf_ranked)
    score = 1.0 if (target_rank is not None and target_rank <= TOP_K) else 0.0
    return {
        'score': score,
        'target_rank': target_rank,
        'total_merged': total_merged,
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

    # ── Embedding Call ───────────────────────────────────────────────────────
    # Embed: individual terms + full sentence query
    extracted_terms = step1.get('extracted', [])
    texts_to_embed = list(extracted_terms) + [query]

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
        # Sentence embedding is the last one
        sent_offset = len(extracted_terms)
        if sent_offset < len(all_embs) and all_embs[sent_offset] is not None:
            query_embedding = all_embs[sent_offset]
            sentence_embeddings[query] = query_embedding
    else:
        embedding_available = False
        emb_error = 'unexpected embedding response'

    # ── Enrichment (enrich_query) ────────────────────────────────────────────
    try:
        enrichment_result = enrich_query(
            query,
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
        'precise_primary': enrichment_result.get('precise_primary', []),
        'broad_primary': enrichment_result.get('broad_primary', []),
        'tier1_terms': enrichment_result.get('tier1_terms', []),
        'kg_terms_found': enrichment_result.get('kg_terms_found', []),
    }

    # ── Step 2: KG Expansion ─────────────────────────────────────────────────
    try:
        step2 = score_kg_expansion(query, expected_terms, enrichment_result)
    except Exception as e:
        step2 = {'score': 0.0, 'error': str(e)}
    result['steps']['kg_expansion'] = step2

    # ── Step 3: SQL Search ───────────────────────────────────────────────────
    try:
        step3 = score_sql_search(expected_card_id, enrichment_result, db)
    except Exception as e:
        step3 = {'score': 0.0, 'error': str(e)}
    result['steps']['sql_search'] = step3

    # ── Step 4: Semantic Search ──────────────────────────────────────────────
    if not embedding_available:
        step4 = {'score': 0, 'error': 'embedding unavailable', 'target_rank': None, 'total_hits': 0}
    else:
        try:
            step4 = score_semantic_search(expected_card_id, query_embedding, card_embeddings)
        except Exception as e:
            step4 = {'score': 0.0, 'error': str(e), 'target_rank': None, 'total_hits': 0}
    result['steps']['semantic_search'] = step4

    # ── Step 5: RRF Ranking ──────────────────────────────────────────────────
    if not embedding_available:
        step5 = {'score': 0, 'error': 'embedding unavailable', 'target_rank': None, 'total_merged': 0}
    else:
        try:
            step5 = score_rrf_ranking(
                expected_card_id, step3, step4,
                card_embeddings, enrichment_result, query_embedding, db)
        except Exception as e:
            step5 = {'score': 0.0, 'error': str(e), 'target_rank': None, 'total_merged': 0}
    result['steps']['rrf_ranking'] = step5

    # Remove internal rrf_ranked list from output (too large)
    if 'rrf_ranked' in result['steps'].get('rrf_ranking', {}):
        del result['steps']['rrf_ranking']['rrf_ranked']

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

    # Rank tier for color-coded display: green (1-3), yellow (4-10), red (>10)
    if target_rank is not None and target_rank <= 3:
        result['rank_tier'] = 'green'
    elif target_rank is not None and target_rank <= 10:
        result['rank_tier'] = 'yellow'
    else:
        result['rank_tier'] = 'red'

    # Aggregate pass/fail uses Recall@10 (TOP_K=10)
    if target_rank is not None and target_rank <= TOP_K:
        result['overall_pass'] = True
    elif not embedding_available and step3.get('target_rank') is not None and step3['target_rank'] <= TOP_K:
        result['overall_pass'] = True

    return result

# ── Aggregate Stats ───────────────────────────────────────────────────────────

def compute_aggregate(results):
    """Compute aggregate metrics from list of case results."""
    if not results:
        return {}

    total = len(results)
    passed = sum(1 for r in results if r.get('overall_pass', False))

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
            by_category[cat] = {'cases': 0, 'passed': 0}
        by_category[cat]['cases'] += 1
        if r.get('overall_pass', False):
            by_category[cat]['passed'] += 1
    for cat in by_category:
        c = by_category[cat]
        c['recall'] = round(c['passed'] / c['cases'], 4) if c['cases'] > 0 else 0.0

    # By step
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

    return {
        'overall': {
            'recall_at_k': round(passed / total, 4) if total > 0 else 0.0,
            'recall_at_3': round(top3_passed / total, 4) if total > 0 else 0.0,
            'top3_passed': top3_passed,
            'mrr': round(mrr, 4),
            'total_cases': total,
            'passed': passed,
        },
        'by_category': by_category,
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

    print()
    print('=' * 50)
    print('RESULTS')
    print('  Recall@10: %d%% (%d/%d passed)' % (int(recall * 100), passed, total))
    print('  Top-3:     %d%% (%d/%d)' % (int(recall3 * 100), top3_passed, total))
    print('  MRR: %.3f' % mrr)

    if by_cat:
        print()
        print('  By Category:')
        for cat, stats in sorted(by_cat.items()):
            bar = '#' * int(stats['recall'] * 10)
            print('    %-12s: %3d%% (%d/%d)' % (
                cat, int(stats['recall'] * 100),
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

    # Build output
    output = {
        'aggregate': aggregate,
        'cases': results,
    }

    # Save results
    os.makedirs(os.path.dirname(RESULTS_PATH), exist_ok=True)
    with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print('Results saved to %s' % RESULTS_PATH)

    # Print summary
    print_summary(aggregate)


if __name__ == '__main__':
    main()
