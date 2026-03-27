#!/usr/bin/env python3
"""Retrieval Benchmark Test Case Generator.

Generates ~80 test cases from the KG database across 5 categories:
  direct (40%), synonym (20%), context (15%), cross_deck (15%), typo (10%)

Run from project root:
  python3 scripts/benchmark_generate.py

Output: benchmark/test_cases.json
"""

import json
import os
import random
import re
import sqlite3
import sys

# ── Constants ────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "storage", "card_sessions.db")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "benchmark")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "test_cases.json")

TARGET_TOTAL = 80

# Category distribution (proportions → exact counts resolved below)
CATEGORY_RATIOS = {
    "direct": 0.40,
    "synonym": 0.20,
    "context": 0.15,
    "cross_deck": 0.15,
    "typo": 0.10,
}

# Direct query templates — {t1}, {t2}, {t3} refer to terms from the card
DIRECT_TEMPLATES = [
    "Was ist {t1}?",
    "Erkläre {t1}.",
    "Erkläre {t1} und {t2}.",
    "Was ist der Unterschied zwischen {t1} und {t2}?",
    "Wie hängen {t1} und {t2} zusammen?",
    "Welche Funktion hat {t1}?",
    "Was versteht man unter {t1} und {t2}?",
    "Beschreibe {t1}.",
    "Warum ist {t1} wichtig?",
    "Was passiert bei {t1}?",
    "Wo liegt {t1}?",
    "Nenne die Eigenschaften von {t1}.",
    "Wie funktioniert {t1}?",
    "Was sind {t1} und {t2}?",
    "Was verbindet {t1} mit {t2}?",
    "Erkläre den Zusammenhang von {t1}, {t2} und {t3}.",
    "Welche Rolle spielt {t1}?",
    "Wie ist {t1} aufgebaut?",
    "Was löst {t1} aus?",
    "Welche Bedeutung hat {t1} in Bezug auf {t2}?",
]

# Synonym/replacement query templates
SYNONYM_TEMPLATES = [
    "Was ist {t1}?",
    "Erkläre {t1}.",
    "Welche Funktion hat {t1}?",
    "Wie hängen {t1} und {t2} zusammen?",
    "Was verbindet {t1} mit {t2}?",
    "Was ist der Zusammenhang zwischen {t1} und {t2}?",
    "Beschreibe {t1}.",
    "Was macht {t1}?",
]

# Context (vague) query templates
CONTEXT_TEMPLATES = [
    "Erkläre das genauer.",
    "Was bedeutet das?",
    "Kannst du das ausführlicher erklären?",
    "Wie hängt das zusammen?",
    "Was ist dabei wichtig zu wissen?",
    "Welche Zusammenhänge gibt es hier?",
    "Erkläre mir das nochmal.",
    "Was sollte ich darüber wissen?",
    "Gibt es weitere relevante Aspekte?",
    "Was steckt dahinter?",
    "Kannst du das vertiefen?",
    "Welche Konzepte sind hier zentral?",
]

# Cross-deck query templates
CROSS_DECK_TEMPLATES = [
    "Was ist {t1}?",
    "Erkläre {t1}.",
    "Welche Bedeutung hat {t1}?",
    "Was versteht man unter {t1}?",
    "Wie funktioniert {t1}?",
    "Was sind die wichtigsten Aspekte von {t1}?",
    "Nenne Beispiele für {t1}.",
    "Welche Rolle spielt {t1} im Körper?",
]

# Difficulty mapping by category
CATEGORY_DIFFICULTY = {
    "direct": "easy",
    "synonym": "medium",
    "context": "medium",
    "cross_deck": "easy",
    "typo": "hard",
}


# ── Database Helpers ─────────────────────────────────────────────────────────

def get_cards_with_min_terms(db, min_terms=4):
    """Return list of (card_id, deck_id, [term, ...]) for cards with >= min_terms."""
    rows = db.execute(
        """
        SELECT card_id, deck_id, GROUP_CONCAT(term, '||') as terms
        FROM kg_card_terms
        GROUP BY card_id
        HAVING COUNT(*) >= ?
        ORDER BY card_id
        """,
        (min_terms,)
    ).fetchall()

    result = []
    for card_id, deck_id, terms_str in rows:
        terms = [t.strip() for t in terms_str.split("||") if t.strip()]
        if len(terms) >= min_terms:
            result.append({
                "card_id": card_id,
                "deck_id": deck_id,
                "terms": terms,
            })
    return result


def get_edges_for_term(db, term):
    """Return list of (connected_term, weight) for a given term, sorted by weight desc."""
    rows = db.execute(
        """
        SELECT term_b as connected, weight FROM kg_edges WHERE term_a = ?
        UNION
        SELECT term_a as connected, weight FROM kg_edges WHERE term_b = ?
        ORDER BY weight DESC
        """,
        (term, term)
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def find_synonym_terms(db, card_terms):
    """Find edge-connected terms for a card's terms, excluding the card's own terms."""
    own_terms_lower = {t.lower() for t in card_terms}
    synonyms = {}  # term -> list of (connected_term, weight)

    for term in card_terms:
        edges = get_edges_for_term(db, term)
        candidates = [
            (connected, w)
            for connected, w in edges
            if connected.lower() not in own_terms_lower
        ]
        if candidates:
            synonyms[term] = candidates

    return synonyms


# ── Typo Generator ───────────────────────────────────────────────────────────

def is_meaningful_term(term):
    """Return True if term is a suitable query subject (not a bare number or too short)."""
    stripped = term.strip()
    if len(stripped) < 3:
        return False
    # Pure integer or float
    if re.match(r'^[0-9]+(\.[0-9]+)?$', stripped):
        return False
    # Greek-letter-only abbreviations like "Δ5", "Δ6"
    if re.match(r'^[ΔΩαβγδ][0-9]*$', stripped):
        return False
    return True


def introduce_typo(term, rng):
    """Introduce a single-character typo: swap, delete, insert, or replace."""
    if len(term) < 3:
        return term  # Too short to safely mangle

    # Don't typo very short tokens or pure numbers
    if re.match(r'^[0-9]+$', term):
        return term

    op = rng.choice(["swap", "delete", "insert", "replace"])

    chars = list(term)
    # Pick a position in the "body" of the word (avoid first/last for swap)
    max_pos = len(chars) - 1

    if op == "swap" and len(chars) >= 3:
        # Swap two adjacent characters (not at boundaries to keep recognisable)
        pos = rng.randint(1, max_pos - 1)
        chars[pos], chars[pos + 1] = chars[pos + 1], chars[pos]
        return "".join(chars)

    elif op == "delete" and len(chars) >= 4:
        pos = rng.randint(1, max_pos - 1)
        del chars[pos]
        return "".join(chars)

    elif op == "insert":
        # Insert a vowel or common consonant near the middle
        pos = rng.randint(1, max_pos)
        insert_char = rng.choice("aeiounrst")
        chars.insert(pos, insert_char)
        return "".join(chars)

    else:  # replace
        pos = rng.randint(1, max_pos - 1)
        replacement = rng.choice("aeiounrstlmhbdgkpwzäöü")
        chars[pos] = replacement
        return "".join(chars)


def has_meaningful_typo(original, typo):
    """Ensure the typo actually differs from the original."""
    return typo != original and len(typo) > 0


# ── Template Rendering ───────────────────────────────────────────────────────

def render_template(template, terms):
    """Fill a query template with up to 3 terms from the given list."""
    t = terms if len(terms) >= 3 else (terms + terms + terms)[:3]
    query = template
    query = query.replace("{t1}", t[0])
    query = query.replace("{t2}", t[1])
    query = query.replace("{t3}", t[2])
    return query


# ── Category Generators ──────────────────────────────────────────────────────

def generate_direct(pool, count, rng):
    """Generate 'direct' test cases: query uses the card's own terms."""
    cases = []
    cards = rng.sample(pool, min(count, len(pool)))

    for i, card in enumerate(cards):
        terms = card["terms"]
        # Prefer meaningful terms for query slots
        meaningful = [t for t in terms if is_meaningful_term(t)]
        query_terms = meaningful if meaningful else terms

        # Pick a template requiring ≤ available query terms
        valid_templates = [
            t for t in DIRECT_TEMPLATES
            if t.count("{t3}") == 0 or len(query_terms) >= 3
        ]
        template = rng.choice(valid_templates)

        # Pick the query terms (shuffle for variety)
        shuffled = list(query_terms)
        rng.shuffle(shuffled)
        query = render_template(template, shuffled)

        cases.append({
            "id": "direct_%03d" % (i + 1),
            "category": "direct",
            "query": query,
            "card_context": None,
            "expected_card_id": card["card_id"],
            "expected_terms": terms,
            "expected_in_top_k": 3,
            "difficulty": "easy",
            "metadata": {
                "source_terms": terms,
                "deck_id": card["deck_id"],
                "template": template,
            },
        })

    return cases


def generate_synonym(pool, count, db, rng):
    """Generate 'synonym' cases: query uses edge-connected terms instead of card's terms."""
    cases = []
    rng.shuffle(pool)
    generated = 0

    for card in pool:
        if generated >= count:
            break

        synonyms = find_synonym_terms(db, card["terms"])
        if not synonyms:
            continue

        # Build a list of available substitute terms (meaningful only, no duplicates)
        own_terms_lower = {t.lower() for t in card["terms"]}
        sub_terms = []
        for orig_term, candidates in synonyms.items():
            # Pick highest-weight meaningful neighbour, avoiding card's own terms
            meaningful_candidates = [
                (c, w) for c, w in candidates
                if is_meaningful_term(c) and c.lower() not in own_terms_lower
            ]
            if not meaningful_candidates:
                continue
            best = sorted(meaningful_candidates, key=lambda x: x[1], reverse=True)[0][0]
            if best not in sub_terms:
                sub_terms.append(best)

        if not sub_terms:
            continue

        # Ensure at least 1 substitute term available
        rng.shuffle(sub_terms)
        query_terms = sub_terms[:min(2, len(sub_terms))]

        valid_templates = [
            t for t in SYNONYM_TEMPLATES
            if t.count("{t2}") == 0 or len(query_terms) >= 2
        ]
        template = rng.choice(valid_templates)
        query = render_template(template, query_terms)

        generated += 1
        cases.append({
            "id": "synonym_%03d" % generated,
            "category": "synonym",
            "query": query,
            "card_context": None,
            "expected_card_id": card["card_id"],
            "expected_terms": card["terms"],
            "expected_in_top_k": 5,
            "difficulty": "medium",
            "metadata": {
                "source_terms": card["terms"],
                "deck_id": card["deck_id"],
                "substitute_terms": query_terms,
                "template": template,
            },
        })

    return cases


def generate_context(pool, count, rng):
    """Generate 'context' cases: vague query + card as explicit context."""
    cases = []
    cards = rng.sample(pool, min(count, len(pool)))

    for i, card in enumerate(cards):
        query = rng.choice(CONTEXT_TEMPLATES)

        cases.append({
            "id": "context_%03d" % (i + 1),
            "category": "context",
            "query": query,
            "card_context": {
                "card_id": card["card_id"],
                "terms": card["terms"],
                "deck_id": card["deck_id"],
            },
            "expected_card_id": card["card_id"],
            "expected_terms": card["terms"],
            "expected_in_top_k": 5,
            "difficulty": "medium",
            "metadata": {
                "source_terms": card["terms"],
                "deck_id": card["deck_id"],
            },
        })

    return cases


def generate_cross_deck(pool, count, db, rng):
    """Generate 'cross_deck' cases: query about a term, testing collection-wide search.

    The card's term appears in multiple decks — we pick a term that spans > 1 deck
    and use a generic query, so the retrieval must search across decks.
    """
    # Find terms appearing in multiple decks
    multi_deck_terms = db.execute(
        """
        SELECT term, COUNT(DISTINCT deck_id) as n_decks, GROUP_CONCAT(DISTINCT deck_id) as decks
        FROM kg_card_terms
        GROUP BY term
        HAVING n_decks > 1
        ORDER BY n_decks DESC
        """
    ).fetchall()

    # Build lookup: term -> list of (card_id, deck_id)
    term_cards = {}
    for term, n_decks, _ in multi_deck_terms:
        rows = db.execute(
            "SELECT card_id, deck_id FROM kg_card_terms WHERE term = ?", (term,)
        ).fetchall()
        term_cards[term] = rows

    # For cross_deck we pick a card from `pool`, find one of its terms that spans
    # multiple decks, and form a query using that term.
    cases = []
    pool_shuffled = list(pool)
    rng.shuffle(pool_shuffled)
    generated = 0

    multi_deck_term_set = {r[0] for r in multi_deck_terms}

    for card in pool_shuffled:
        if generated >= count:
            break

        # Find terms on this card that also appear in other decks and are meaningful
        cross_terms = [
            t for t in card["terms"]
            if t in multi_deck_term_set and is_meaningful_term(t)
        ]
        if not cross_terms:
            continue

        focus_term = rng.choice(cross_terms)
        template = rng.choice(CROSS_DECK_TEMPLATES)
        query = template.replace("{t1}", focus_term)

        generated += 1
        cases.append({
            "id": "cross_deck_%03d" % generated,
            "category": "cross_deck",
            "query": query,
            "card_context": None,
            "expected_card_id": card["card_id"],
            "expected_terms": card["terms"],
            "expected_in_top_k": 5,
            "difficulty": "easy",
            "metadata": {
                "source_terms": card["terms"],
                "deck_id": card["deck_id"],
                "focus_term": focus_term,
                "template": template,
            },
        })

    return cases


def generate_typo(pool, count, rng):
    """Generate 'typo' cases: key domain term is misspelled in the query."""
    cases = []
    pool_shuffled = list(pool)
    rng.shuffle(pool_shuffled)
    generated = 0

    for card in pool_shuffled:
        if generated >= count:
            break

        terms = card["terms"]

        # Pick a term long enough to typo (>= 5 chars)
        candidates = [t for t in terms if len(t) >= 5 and not re.match(r'^[0-9]+$', t)]
        if not candidates:
            continue

        target_term = rng.choice(candidates)
        typo_term = introduce_typo(target_term, rng)

        if not has_meaningful_typo(target_term, typo_term):
            continue

        # Build query with the typo'd term
        template = rng.choice([
            "Was ist {t1}?",
            "Erkläre {t1}.",
            "Welche Funktion hat {t1}?",
            "Was versteht man unter {t1}?",
        ])
        query = template.replace("{t1}", typo_term)

        generated += 1
        cases.append({
            "id": "typo_%03d" % generated,
            "category": "typo",
            "query": query,
            "card_context": None,
            "expected_card_id": card["card_id"],
            "expected_terms": terms,
            "expected_in_top_k": 10,
            "difficulty": "hard",
            "metadata": {
                "source_terms": terms,
                "deck_id": card["deck_id"],
                "original_term": target_term,
                "typo_term": typo_term,
            },
        })

    return cases


# ── Pool Splitter ────────────────────────────────────────────────────────────

def split_pools(cards, ratios, rng):
    """Split a shuffled card list into non-overlapping pools by ratio."""
    shuffled = list(cards)
    rng.shuffle(shuffled)
    total = len(shuffled)

    pools = {}
    offset = 0
    categories = list(ratios.keys())

    for i, cat in enumerate(categories):
        # Last category gets the remainder
        if i == len(categories) - 1:
            pools[cat] = shuffled[offset:]
        else:
            n = max(1, int(total * ratios[cat]))
            pools[cat] = shuffled[offset:offset + n]
            offset += n

    return pools


# ── Main ─────────────────────────────────────────────────────────────────────

def compute_category_counts(total, ratios):
    """Convert ratios to exact counts summing to total."""
    counts = {}
    allocated = 0
    cats = list(ratios.keys())

    for i, cat in enumerate(cats):
        if i == len(cats) - 1:
            counts[cat] = total - allocated
        else:
            n = round(total * ratios[cat])
            counts[cat] = n
            allocated += n

    return counts


def main():
    rng = random.Random(42)

    # ── Validate database ────────────────────────────────────────────────────
    if not os.path.exists(DB_PATH):
        print("ERROR: Database not found at %s" % DB_PATH)
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    # ── Load qualifying cards ────────────────────────────────────────────────
    print("Loading cards with 4+ KG terms...")
    all_cards = get_cards_with_min_terms(db, min_terms=4)
    print("  Found %d qualifying cards" % len(all_cards))

    if len(all_cards) < 20:
        print("ERROR: Not enough cards (need >= 20, got %d)" % len(all_cards))
        sys.exit(1)

    # ── Compute per-category counts ──────────────────────────────────────────
    counts = compute_category_counts(TARGET_TOTAL, CATEGORY_RATIOS)
    print("Target counts per category:")
    for cat, n in counts.items():
        print("  %s: %d" % (cat, n))

    # ── Split into non-overlapping pools ────────────────────────────────────
    # Use a larger ratio for pools so we have headroom for filtering
    pool_ratios = {
        "direct": 0.30,
        "synonym": 0.20,
        "context": 0.15,
        "cross_deck": 0.20,
        "typo": 0.15,
    }
    pools = split_pools(all_cards, pool_ratios, rng)

    # ── Generate test cases ──────────────────────────────────────────────────
    all_cases = []

    print("Generating direct cases...")
    direct = generate_direct(pools["direct"], counts["direct"], rng)
    all_cases.extend(direct)
    print("  Generated %d direct cases" % len(direct))

    print("Generating synonym cases...")
    synonym = generate_synonym(pools["synonym"], counts["synonym"], db, rng)
    all_cases.extend(synonym)
    print("  Generated %d synonym cases" % len(synonym))

    print("Generating context cases...")
    context = generate_context(pools["context"], counts["context"], rng)
    all_cases.extend(context)
    print("  Generated %d context cases" % len(context))

    print("Generating cross_deck cases...")
    cross_deck = generate_cross_deck(pools["cross_deck"], counts["cross_deck"], db, rng)
    all_cases.extend(cross_deck)
    print("  Generated %d cross_deck cases" % len(cross_deck))

    print("Generating typo cases...")
    typo = generate_typo(pools["typo"], counts["typo"], rng)
    all_cases.extend(typo)
    print("  Generated %d typo cases" % len(typo))

    db.close()

    # ── Write output ─────────────────────────────────────────────────────────
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_cases, f, ensure_ascii=False, indent=2)

    # ── Summary ──────────────────────────────────────────────────────────────
    print()
    print("═" * 60)
    print("  Benchmark Test Cases Summary")
    print("═" * 60)
    print("  Total cases: %d" % len(all_cases))
    print("  Output:      %s" % OUTPUT_PATH)
    print()

    by_category = {}
    by_difficulty = {}
    for case in all_cases:
        cat = case["category"]
        diff = case["difficulty"]
        by_category[cat] = by_category.get(cat, 0) + 1
        by_difficulty[diff] = by_difficulty.get(diff, 0) + 1

    print("  By category:")
    for cat, n in sorted(by_category.items()):
        pct = 100.0 * n / len(all_cases) if all_cases else 0
        print("    %-12s %2d  (%.0f%%)" % (cat, n, pct))

    print()
    print("  By difficulty:")
    for diff, n in sorted(by_difficulty.items()):
        print("    %-8s %2d" % (diff, n))

    print()
    print("  Sample cases:")
    for cat in ["direct", "synonym", "context", "cross_deck", "typo"]:
        sample = next((c for c in all_cases if c["category"] == cat), None)
        if sample:
            print('    [%s] "%s"' % (cat, sample["query"]))
            if cat == "typo":
                print('      original_term: "%s" → typo: "%s"' % (
                    sample["metadata"].get("original_term", "?"),
                    sample["metadata"].get("typo_term", "?"),
                ))

    print()
    print("Done.")


if __name__ == "__main__":
    main()
