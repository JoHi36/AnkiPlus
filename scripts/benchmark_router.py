#!/usr/bin/env python3
"""Router Benchmark — tests the backend /router endpoint against test cases.

Run from project root:
  python3 scripts/benchmark_router.py                    # All eligible cases
  python3 scripts/benchmark_router.py --category context # One category
  python3 scripts/benchmark_router.py --id context_001   # One case
  python3 scripts/benchmark_router.py --force             # Re-call even cached

Scores each case on term_coverage and relevance, writes to benchmark/router_results.json.
"""
import sys
import os
import json
import math
import time
import argparse
import urllib.request
import urllib.error

# ── Path Setup ───────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_CASES_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'test_cases.json')
RESULTS_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'router_results.json')
ROUTER_CACHE_PATH = os.path.join(PROJECT_ROOT, 'benchmark', '.router_cache.json')
EMBED_CACHE_PATH = os.path.join(PROJECT_ROOT, 'benchmark', '.embed_cache.json')

# ── Config ───────────────────────────────────────────────────────────────────

def _load_config():
    config_path = os.path.join(PROJECT_ROOT, 'config.json')
    if os.path.exists(config_path):
        with open(config_path) as f:
            return json.load(f)
    return {}

# ── Embed Cache (shared with benchmark_run.py) ──────────────────────────────

_embed_cache = {}

def _load_embed_cache():
    global _embed_cache
    if os.path.exists(EMBED_CACHE_PATH):
        try:
            with open(EMBED_CACHE_PATH) as f:
                _embed_cache = json.load(f)
        except Exception:
            _embed_cache = {}

def _save_embed_cache():
    try:
        with open(EMBED_CACHE_PATH, 'w') as f:
            json.dump(_embed_cache, f)
    except Exception:
        pass

def embed_texts(texts, config):
    """Call backend /embed endpoint with caching."""
    global _embed_cache
    if not texts:
        return []

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
        return results

    backend_url = config.get('backend_url', '')
    auth_token = config.get('auth_token', '')
    if not auth_token or not backend_url:
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
                _embed_cache[uncached_texts[j]] = emb
        _save_embed_cache()
        return results
    except Exception:
        return results

# ── Router Cache ─────────────────────────────────────────────────────────────

_router_cache = {}

def _load_router_cache():
    global _router_cache
    if os.path.exists(ROUTER_CACHE_PATH):
        try:
            with open(ROUTER_CACHE_PATH) as f:
                _router_cache = json.load(f)
        except Exception:
            _router_cache = {}

def _save_router_cache():
    try:
        with open(ROUTER_CACHE_PATH, 'w') as f:
            json.dump(_router_cache, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

# ── Router Call ──────────────────────────────────────────────────────────────

def call_router(message, card_context, config):
    """Call the backend /router endpoint. Returns response dict or error dict."""
    backend_url = config.get('backend_url', '')
    auth_token = config.get('auth_token', '')
    if not backend_url:
        return {'error': 'no backend_url configured'}
    if not auth_token:
        return {'error': 'no auth_token configured'}

    url = '%s/router' % backend_url.rstrip('/')
    body = {
        'message': message + ' (Antworte auf Deutsch)',
        'cardContext': card_context,
        'lastAssistantMessage': '',
    }
    payload = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', 'Bearer %s' % auth_token)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body_text = ''
        try:
            body_text = e.read().decode('utf-8')[:500]
        except Exception:
            pass
        return {'error': 'HTTP %d: %s' % (e.code, body_text)}
    except Exception as e:
        return {'error': str(e)}

# ── Scoring ──────────────────────────────────────────────────────────────────

def cosine_similarity(a, b):
    """Compute cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def score_term_coverage(router_response, expected_terms):
    """What fraction of expected_terms appear in the router's output text?

    Checks resolved_intent first, falls back to reasoning, precise_queries,
    and broad_queries combined.
    """
    if not expected_terms:
        return 1.0, []

    # Build the text to search in — combine all available fields
    search_parts = []
    if router_response.get('resolved_intent'):
        search_parts.append(router_response['resolved_intent'])
    if router_response.get('reasoning'):
        search_parts.append(router_response['reasoning'])
    for q in router_response.get('precise_queries', []):
        search_parts.append(q)
    for q in router_response.get('broad_queries', []):
        search_parts.append(q)
    for q in router_response.get('embedding_queries', []):
        search_parts.append(q)

    search_text = ' '.join(search_parts).lower()

    found = []
    missed = []
    for term in expected_terms:
        if term.lower() in search_text:
            found.append(term)
        else:
            missed.append(term)

    coverage = len(found) / len(expected_terms)
    return round(coverage, 4), missed


def score_relevance(router_response, expected_terms, config):
    """Embed the router's output text and compare to expected card content.

    Uses the combined text from resolved_intent/reasoning/queries as the
    router's 'understanding', and the expected_terms joined as the target.
    Returns cosine similarity.
    """
    # Build router text
    parts = []
    if router_response.get('resolved_intent'):
        parts.append(router_response['resolved_intent'])
    if router_response.get('reasoning'):
        parts.append(router_response['reasoning'])
    for q in router_response.get('precise_queries', []):
        parts.append(q)
    for q in router_response.get('broad_queries', []):
        parts.append(q)
    router_text = ' '.join(parts)

    if not router_text.strip():
        return 0.0

    # Build target text from expected terms
    target_text = ' '.join(expected_terms)

    # Embed both
    embeddings = embed_texts([router_text, target_text], config)
    if not embeddings or len(embeddings) < 2:
        return 0.0
    if embeddings[0] is None or embeddings[1] is None:
        return 0.0

    return round(cosine_similarity(embeddings[0], embeddings[1]), 4)

# ── Build Card Context ───────────────────────────────────────────────────────

def build_card_context(case):
    """Build cardContext from test case — uses real card text for context cases."""
    import re as _re
    import sqlite3 as _sql
    metadata = case.get('metadata', {})
    source_terms = metadata.get('source_terms', [])
    deck_id = metadata.get('deck_id', '')

    # For context cases that have card_context with a card_id, load real card text
    card_ctx = case.get('card_context')
    if card_ctx and card_ctx.get('card_id'):
        card_id = card_ctx['card_id']
        deck_id = card_ctx.get('deck_id', deck_id)
        # Try loading real card text from Anki DB
        for profile in ['Benutzer 1', 'User 1']:
            anki_path = os.path.join(os.path.dirname(PROJECT_ROOT), '..', profile, 'collection.anki2')
            anki_path = os.path.normpath(anki_path)
            if os.path.exists(anki_path):
                try:
                    adb = _sql.connect('file:%s?mode=ro' % anki_path, uri=True)
                    row = adb.execute(
                        "SELECT n.flds FROM cards c JOIN notes n ON c.nid = n.id WHERE c.id = ?",
                        (int(card_id),)
                    ).fetchone()
                    adb.close()
                    if row and row[0]:
                        fields = row[0].split('\x1f')
                        clean = lambda s: _re.sub(r'<[^>]+>', '', s).strip()[:500]
                        return {
                            'cardId': str(card_id),
                            'question': clean(fields[0]) if fields else '',
                            'answer': clean(fields[1]) if len(fields) > 1 else '',
                            'deckName': str(deck_id),
                            'tags': [],
                        }
                except Exception:
                    pass

    # Fallback: use source terms
    if card_ctx and card_ctx.get('terms'):
        source_terms = card_ctx['terms']
        deck_id = card_ctx.get('deck_id', deck_id)

    return {
        'question': ' '.join(source_terms[:3]),
        'answer': ' '.join(source_terms[3:6]),
        'deckName': str(deck_id),
        'tags': [],
    }

# ── Single Case Runner ───────────────────────────────────────────────────────

def run_case(case, config, force=False):
    """Run the router for one test case. Returns result dict."""
    case_id = case['id']
    query = case['query']
    expected_terms = case.get('expected_terms', [])

    # Check cache
    if not force and case_id in _router_cache:
        cached = _router_cache[case_id]
        # Re-score from cache (scoring may have changed)
        router_response = cached.get('router_response', {})
        term_coverage, missed_terms = score_term_coverage(router_response, expected_terms)
        relevance = score_relevance(router_response, expected_terms, config)
        cached['term_coverage'] = term_coverage
        cached['missed_terms'] = missed_terms
        cached['relevance'] = relevance
        return cached

    # Build card context
    card_context = build_card_context(case)

    # Call router
    router_response = call_router(query, card_context, config)

    if 'error' in router_response:
        result = {
            'id': case_id,
            'category': case.get('category', 'unknown'),
            'query': query,
            'card_context': card_context,
            'router_response': router_response,
            'term_coverage': 0.0,
            'missed_terms': expected_terms,
            'relevance': 0.0,
            'error': router_response['error'],
        }
        return result

    # Score
    term_coverage, missed_terms = score_term_coverage(router_response, expected_terms)
    relevance = score_relevance(router_response, expected_terms, config)

    result = {
        'id': case_id,
        'category': case.get('category', 'unknown'),
        'query': query,
        'card_context': card_context,
        'router_response': router_response,
        'term_coverage': term_coverage,
        'missed_terms': missed_terms,
        'relevance': relevance,
    }

    # Cache the result
    _router_cache[case_id] = result
    _save_router_cache()

    return result

# ── Aggregate ────────────────────────────────────────────────────────────────

def compute_aggregate(results):
    """Compute aggregate metrics from router test results."""
    if not results:
        return {}

    total = len(results)
    errors = sum(1 for r in results if 'error' in r)
    successful = total - errors

    coverages = [r['term_coverage'] for r in results if 'error' not in r]
    relevances = [r['relevance'] for r in results if 'error' not in r]

    avg_coverage = round(sum(coverages) / len(coverages), 4) if coverages else 0.0
    avg_relevance = round(sum(relevances) / len(relevances), 4) if relevances else 0.0

    # By category
    by_category = {}
    for r in results:
        cat = r.get('category', 'unknown')
        if cat not in by_category:
            by_category[cat] = {'cases': 0, 'errors': 0, 'coverages': [], 'relevances': []}
        by_category[cat]['cases'] += 1
        if 'error' in r:
            by_category[cat]['errors'] += 1
        else:
            by_category[cat]['coverages'].append(r['term_coverage'])
            by_category[cat]['relevances'].append(r['relevance'])

    for cat in by_category:
        c = by_category[cat]
        covs = c.pop('coverages')
        rels = c.pop('relevances')
        c['avg_coverage'] = round(sum(covs) / len(covs), 4) if covs else 0.0
        c['avg_relevance'] = round(sum(rels) / len(rels), 4) if rels else 0.0

    return {
        'overall': {
            'total_cases': total,
            'successful': successful,
            'errors': errors,
            'avg_term_coverage': avg_coverage,
            'avg_relevance': avg_relevance,
        },
        'by_category': by_category,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
    }

# ── Print Summary ────────────────────────────────────────────────────────────

def print_summary(aggregate):
    """Print formatted results summary."""
    overall = aggregate.get('overall', {})
    by_cat = aggregate.get('by_category', {})

    total = overall.get('total_cases', 0)
    successful = overall.get('successful', 0)
    errors = overall.get('errors', 0)
    avg_cov = overall.get('avg_term_coverage', 0.0)
    avg_rel = overall.get('avg_relevance', 0.0)

    print()
    print('=' * 50)
    print('ROUTER TEST RESULTS')
    print('  Cases: %d (%d successful, %d errors)' % (total, successful, errors))
    print('  Avg Term Coverage: %d%%' % int(avg_cov * 100))
    print('  Avg Relevance:     %d%%' % int(avg_rel * 100))

    if by_cat:
        print()
        print('  By Category:')
        for cat, stats in sorted(by_cat.items()):
            print('    %-12s: coverage %3d%%  relevance %3d%%  (%d cases, %d errors)' % (
                cat, int(stats['avg_coverage'] * 100), int(stats['avg_relevance'] * 100),
                stats['cases'], stats['errors']))

    print('=' * 50)
    print()

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='AnkiPlus Router Benchmark')
    parser.add_argument('--category', help='Run only cases in this category')
    parser.add_argument('--id', help='Run only the case with this ID')
    parser.add_argument('--force', action='store_true', help='Force re-call router (ignore cache)')
    args = parser.parse_args()

    # Load test cases
    if not os.path.exists(TEST_CASES_PATH):
        print('ERROR: test_cases.json not found at %s' % TEST_CASES_PATH)
        sys.exit(1)
    with open(TEST_CASES_PATH) as f:
        all_cases = json.load(f)

    # Filter cases — context cases + a selection from other categories
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
    else:
        # Default: all context cases + first 5 from each other category
        context_cases = [c for c in cases if c['category'] == 'context']
        other_by_cat = {}
        for c in cases:
            if c['category'] != 'context':
                other_by_cat.setdefault(c['category'], []).append(c)
        sample = []
        for cat_cases in other_by_cat.values():
            sample.extend(cat_cases[:5])
        cases = context_cases + sample

    # Load config
    config = _load_config()
    if not config.get('backend_url'):
        print('ERROR: No backend_url in config.json')
        sys.exit(1)
    if not config.get('auth_token'):
        print('ERROR: No auth_token in config.json')
        sys.exit(1)

    # Load caches
    _load_router_cache()
    _load_embed_cache()
    print('  Router cache: %d cached responses' % len(_router_cache))
    print('  Embed cache: %d cached embeddings' % len(_embed_cache))

    print('Running %d router test cases...' % len(cases))
    print()

    results = []
    for i, case in enumerate(cases, start=1):
        case_id = case['id']
        query = case['query']
        cached = not args.force and case_id in _router_cache
        tag = '(cached)' if cached else '(calling router...)'
        sys.stdout.write('\r  [%d/%d] %s — %s %s' % (
            i, len(cases), case_id, query[:35], tag))
        sys.stdout.flush()

        try:
            result = run_case(case, config, force=args.force)
        except Exception as e:
            result = {
                'id': case_id,
                'category': case.get('category', 'unknown'),
                'query': query,
                'card_context': {},
                'router_response': {},
                'term_coverage': 0.0,
                'missed_terms': [],
                'relevance': 0.0,
                'error': str(e),
            }
        results.append(result)

    sys.stdout.write('\n')

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
