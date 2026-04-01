#!/usr/bin/env python3
"""Generation Benchmark — evaluates Tutor response quality.

Two scoring dimensions:
  1. DETERMINISTIC — regex/math, no LLM needed (terms, citations, length)
  2. LLM EVALUATION — semantic quality (factual correctness, pedagogy)

Run from project root:
  python3 scripts/benchmark_generation.py                          # All cases
  python3 scripts/benchmark_generation.py --category safety_error  # One category
  python3 scripts/benchmark_generation.py --id gen_factual_001     # One case
  python3 scripts/benchmark_generation.py --deterministic-only     # Skip LLM eval
  python3 scripts/benchmark_generation.py --dry-run                # Show prompts only

Results written to benchmark/generation_results.json.
"""
import sys
import os
import json
import re
import time
import sqlite3
import argparse
import urllib.request

# ── Path Setup ───────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

DB_PATH = os.path.join(PROJECT_ROOT, 'storage', 'card_sessions.db')
CASES_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'generation_cases.json')
RESULTS_PATH = os.path.join(PROJECT_ROOT, 'benchmark', 'generation_results.json')
TUTOR_PROMPT_PATH = os.path.join(PROJECT_ROOT, 'functions', 'src', 'prompts', 'tutor.ts')
CONFIG_PATH = os.path.join(PROJECT_ROOT, 'config.json')

# ── Constants ────────────────────────────────────────────────────────────────

GENERATION_MODEL = 'gemini-2.5-flash'
EVALUATOR_MODEL = 'gemini-2.5-flash'
GENERATION_TEMP = 0.3
EVALUATOR_TEMP = 0.0


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_config():
    if os.path.isfile(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}


def _get_api_key():
    config = _load_config()
    key = config.get('api_key', '') or config.get('google_api_key', '')
    if not key:
        print("ERROR: No API key in config.json")
        sys.exit(1)
    return key


def _load_tutor_prompt():
    with open(TUTOR_PROMPT_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r'TUTOR_PROMPT\s*=\s*`(.*?)`', content, re.DOTALL)
    if not match:
        print("ERROR: Could not extract TUTOR_PROMPT")
        sys.exit(1)
    return match.group(1).replace('\\`', '`')


def _clean_html(text):
    text = re.sub(r'<[^>]+>', '', text)
    return text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').strip()


def _load_card_content(db, card_ids):
    cards = []
    for i, cid in enumerate(card_ids, 1):
        row = db.execute('SELECT question, answer FROM card_content WHERE card_id = ?', (cid,)).fetchone()
        if row:
            cards.append({'index': i, 'card_id': cid, 'question': _clean_html(row[0]), 'answer': _clean_html(row[1])})
    return cards


def _build_lernmaterial(cards):
    if not cards:
        return "LERNMATERIAL: (Keine relevanten Karten gefunden)"
    lines = ["LERNMATERIAL:"]
    for c in cards:
        lines.append(f"\n[{c['index']}] Karte #{c['card_id']}")
        lines.append(f"Frage: {c['question']}")
        lines.append(f"Antwort: {c['answer']}")
    return '\n'.join(lines)


def _call_gemini(api_key, model, system_prompt, user_message, temperature, max_tokens=2048, json_mode=False):
    url = 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s' % (model, api_key)
    gen_config = {'maxOutputTokens': max_tokens, 'temperature': temperature}
    if json_mode:
        gen_config['responseMimeType'] = 'application/json'
        gen_config['thinkingConfig'] = {'thinkingBudget': 0}
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': user_message}]}],
        'systemInstruction': {'parts': [{'text': system_prompt}]},
        'generationConfig': gen_config,
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        return result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
    except Exception as e:
        return f"[API ERROR: {e}]"


def generate_tutor_response(api_key, tutor_prompt, cards, query):
    """Generate a Tutor response for the given query and cards."""
    lernmaterial = _build_lernmaterial(cards)
    system = tutor_prompt + '\n\n' + lernmaterial
    return _call_gemini(api_key, GENERATION_MODEL, system, query, GENERATION_TEMP)


# ── Deterministic Scoring (no LLM needed) ────────────────────────────────────

def score_deterministic(response, case, num_cards):
    """Score response with regex/math only. Returns dict of metric → (score, detail)."""
    exp = case.get('expectations', {})
    text_lower = response.lower()
    scores = {}

    # 1. Required terms
    must_contain = exp.get('must_contain', [])
    if must_contain:
        found = [t for t in must_contain if t.lower() in text_lower]
        scores['required_terms'] = (len(found) / len(must_contain), f"{len(found)}/{len(must_contain)}: {found}")
    else:
        scores['required_terms'] = (1.0, "none required")

    # 1b. Required terms (any-of groups)
    must_contain_any = exp.get('must_contain_any', [])
    if must_contain_any:
        group_hits = 0
        for group in must_contain_any:
            if any(t.lower() in text_lower for t in group):
                group_hits += 1
        scores['required_any'] = (group_hits / len(must_contain_any), f"{group_hits}/{len(must_contain_any)} groups matched")

    # 2. Forbidden terms
    must_not = exp.get('must_not_contain', [])
    if must_not:
        violations = [t for t in must_not if t.lower() in text_lower]
        scores['forbidden_absent'] = (1.0 if not violations else 0.0, f"violations: {violations}" if violations else "clean")
    else:
        scores['forbidden_absent'] = (1.0, "none forbidden")

    # 3. Citation count
    citations = re.findall(r'\[(\d+)\]', response)
    citation_nums = [int(c) for c in citations]
    n_citations = len(set(citation_nums))
    min_c = exp.get('min_citations', 0)
    max_c = exp.get('max_citations', 99)
    cite_ok = min_c <= n_citations <= max_c
    scores['citation_count'] = (1.0 if cite_ok else 0.0, f"{n_citations} citations (need {min_c}-{max_c})")

    # 4. Citation validity (no [5] when only 2 cards)
    if citation_nums and num_cards > 0:
        invalid = [c for c in citation_nums if c > num_cards or c < 1]
        scores['citation_valid'] = (1.0 if not invalid else 0.0, f"invalid refs: {invalid}" if invalid else "all valid")
    elif num_cards == 0:
        # No cards → should have no citations
        scores['citation_valid'] = (1.0 if not citation_nums else 0.0,
                                    "no cards, no citations expected" if not citation_nums else f"cited {citation_nums} but no cards")

    # 5. Response length
    words = len(response.split())
    ideal = exp.get('ideal_length_words', [15, 200])
    in_range = ideal[0] <= words <= ideal[1]
    scores['length'] = (1.0 if in_range else 0.5, f"{words} words (ideal {ideal[0]}-{ideal[1]})")

    # 6. Safety marker (when expected)
    if exp.get('has_safety_check'):
        safety_type = exp.get('safety_type', '')
        if safety_type == 'implicit_error':
            # Should contain correction language
            correction_markers = ['nein', 'nicht', 'falsch', 'umgekehrt', 'gegenteil', 'korrektur', 'tatsächlich', 'vielmehr']
            has_correction = any(m in text_lower for m in correction_markers)
            scores['safety_detected'] = (1.0 if has_correction else 0.0,
                                         "correction detected" if has_correction else "no correction language found")
        elif safety_type == 'no_source':
            no_source_markers = ['keine karten', 'karten enthalten', 'nicht in deinen', 'lernmaterial', 'keine relevanten']
            flagged = any(m in text_lower for m in no_source_markers)
            scores['safety_detected'] = (1.0 if flagged else 0.0,
                                         "no-source communicated" if flagged else "missing no-source notice")

    # 7. Compact answer (first paragraph ≤ N sentences)
    max_sent = exp.get('compact_answer_max_sentences')
    if max_sent:
        first_para = response.split('\n\n')[0] if '\n\n' in response else response.split('\n')[0]
        sentences = [s.strip() for s in re.split(r'[.!?]+', first_para) if s.strip() and len(s.strip()) > 5]
        is_compact = len(sentences) <= max_sent
        scores['compact'] = (1.0 if is_compact else 0.0, f"{len(sentences)} sentences in first para (max {max_sent})")

    return scores


def deterministic_total(scores):
    """Weighted average of deterministic scores."""
    if not scores:
        return 0.0
    return sum(s for s, _ in scores.values()) / len(scores)


# ── LLM Evaluation (semantic quality) ────────────────────────────────────────

EVALUATOR_PROMPT = """Du bist ein strenger Evaluator für einen Lern-Tutor. Vergleiche die TUTOR-ANTWORT mit der GOLD-ANTWORT (Referenz von einem Experten).

Bewerte NUR Aspekte die Regex nicht messen kann:
1. factual_correct: Stimmen die Fakten inhaltlich? (nicht nur Keywords)
2. pedagogical_quality: Ist die Erklärung verständlich und lernfördernd?
3. no_hallucination: Erfindet der Tutor Fakten die nicht in den Karten stehen?
4. appropriate_depth: Nicht zu oberflächlich, nicht zu ausführlich?

Antworte NUR mit JSON:
{"factual_correct": 0.0-1.0, "pedagogical_quality": 0.0-1.0, "no_hallucination": 0.0-1.0, "appropriate_depth": 0.0-1.0, "notes": "kurze Begründung"}"""


def evaluate_llm(api_key, case, cards, tutor_response):
    """LLM evaluates semantic quality against gold answer."""
    gold = case.get('gold_answer', '')
    eval_input = f"""## Frage
{case['query']}

## Verfügbare Karten
{_build_lernmaterial(cards)}

## GOLD-ANTWORT (Experten-Referenz)
{gold}

## TUTOR-ANTWORT (zu bewerten)
{tutor_response}

Bewerte die Tutor-Antwort gegen die Gold-Antwort. NUR JSON."""

    raw = _call_gemini(api_key, EVALUATOR_MODEL, EVALUATOR_PROMPT, eval_input, EVALUATOR_TEMP, max_tokens=1024, json_mode=True)

    json_str = raw
    if '```' in json_str:
        match = re.search(r'```(?:json)?\s*(.*?)```', json_str, re.DOTALL)
        if match:
            json_str = match.group(1)
    try:
        return json.loads(json_str.strip())
    except json.JSONDecodeError:
        return {"parse_error": True, "raw": raw}


def llm_total(llm_scores):
    """Average of LLM evaluation scores."""
    if not llm_scores or llm_scores.get('parse_error'):
        return 0.0
    numeric = [v for k, v in llm_scores.items() if isinstance(v, (int, float)) and k != 'parse_error']
    return sum(numeric) / len(numeric) if numeric else 0.0


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Generation Benchmark')
    parser.add_argument('--category', help='Run only this category')
    parser.add_argument('--id', help='Run only this case ID')
    parser.add_argument('--deterministic-only', action='store_true', help='Skip LLM evaluation')
    parser.add_argument('--dry-run', action='store_true', help='Show prompts, no API calls')
    args = parser.parse_args()

    with open(CASES_PATH, 'r', encoding='utf-8') as f:
        all_cases = json.load(f)

    cases = all_cases
    if args.id:
        cases = [c for c in cases if c['id'] == args.id]
    elif args.category:
        cases = [c for c in cases if c['category'] == args.category]

    if not cases:
        print("No matching cases.")
        sys.exit(1)

    api_key = _get_api_key()
    tutor_prompt = _load_tutor_prompt()
    db = sqlite3.connect(DB_PATH)

    mode = "deterministic-only" if args.deterministic_only else "full (deterministic + LLM)"
    print(f"{'═' * 60}")
    print(f"  Generation Benchmark — {len(cases)} cases — {mode}")
    print(f"{'═' * 60}")
    print()

    results = []
    cat_scores = {}

    for i, case in enumerate(cases, 1):
        cid = case['id']
        cat = case['category']
        query = case['query']
        card_ids = case.get('card_ids', [])
        cards = _load_card_content(db, card_ids)

        print(f"  [{i}/{len(cases)}] {cid}", end='', flush=True)

        if args.dry_run:
            print(f" — {query[:50]}")
            print(f"    Cards: {len(cards)} | Gold: {case.get('gold_answer', 'MISSING')[:60]}...")
            continue

        # ── Generate ─────────────────────────────────────────────────────
        tutor_response = generate_tutor_response(api_key, tutor_prompt, cards, query)
        if tutor_response.startswith('[API ERROR'):
            print(f" ERROR: {tutor_response[:60]}")
            results.append({'id': cid, 'category': cat, 'error': tutor_response, 'total_score': 0.0})
            continue

        # ── Deterministic Score ──────────────────────────────────────────
        det_scores = score_deterministic(tutor_response, case, len(cards))
        det_total = deterministic_total(det_scores)

        # ── LLM Score ────────────────────────────────────────────────────
        llm_scores = {}
        llm_score = 0.0
        if not args.deterministic_only:
            time.sleep(1)  # Rate limit
            llm_scores = evaluate_llm(api_key, case, cards, tutor_response)
            llm_score = llm_total(llm_scores)

        # ── Combined ─────────────────────────────────────────────────────
        if args.deterministic_only:
            total = det_total
        else:
            total = det_total * 0.5 + llm_score * 0.5  # 50/50 weight

        # Track
        if cat not in cat_scores:
            cat_scores[cat] = {'det': [], 'llm': [], 'total': []}
        cat_scores[cat]['det'].append(det_total)
        cat_scores[cat]['llm'].append(llm_score)
        cat_scores[cat]['total'].append(total)

        icon = '\u2713' if total >= 0.7 else '\u25b3' if total >= 0.4 else '\u2717'
        det_pct = f"{det_total:.0%}"
        llm_pct = f"{llm_score:.0%}" if not args.deterministic_only else "—"
        print(f"  {icon} det={det_pct} llm={llm_pct} total={total:.0%}")

        results.append({
            'id': cid, 'category': cat, 'query': query,
            'tutor_response': tutor_response,
            'deterministic': {k: {'score': s, 'detail': d} for k, (s, d) in det_scores.items()},
            'det_total': det_total,
            'llm': llm_scores,
            'llm_total': llm_score,
            'total_score': total,
        })

        time.sleep(1)  # Rate limit between generation calls

    if args.dry_run:
        return

    # ── Summary ──────────────────────────────────────────────────────────
    print()
    print(f"{'═' * 60}")
    all_totals = [r['total_score'] for r in results if 'total_score' in r]
    overall = sum(all_totals) / len(all_totals) if all_totals else 0
    all_det = [r['det_total'] for r in results if 'det_total' in r]
    overall_det = sum(all_det) / len(all_det) if all_det else 0

    print(f"  Overall: {overall:.0%} (deterministic: {overall_det:.0%})")
    print()
    for cat, s in sorted(cat_scores.items()):
        avg = sum(s['total']) / len(s['total']) if s['total'] else 0
        det_avg = sum(s['det']) / len(s['det']) if s['det'] else 0
        passed = sum(1 for x in s['total'] if x >= 0.7)
        print(f"  {cat:20s}: {avg:.0%} (det {det_avg:.0%}) — {passed}/{len(s['total'])} passed")
    print(f"{'═' * 60}")

    # ── Save ─────────────────────────────────────────────────────────────
    output = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'config': {
            'generation_model': GENERATION_MODEL,
            'evaluator_model': EVALUATOR_MODEL,
            'deterministic_only': args.deterministic_only,
            'total_cases': len(results),
        },
        'aggregate': {
            'overall_score': overall,
            'overall_deterministic': overall_det,
            'by_category': {
                cat: {
                    'avg': sum(s['total']) / len(s['total']) if s['total'] else 0,
                    'det_avg': sum(s['det']) / len(s['det']) if s['det'] else 0,
                    'passed': sum(1 for x in s['total'] if x >= 0.7),
                    'total': len(s['total']),
                }
                for cat, s in cat_scores.items()
            }
        },
        'cases': results,
    }
    with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nSaved to: {RESULTS_PATH}")
    db.close()


if __name__ == '__main__':
    main()
