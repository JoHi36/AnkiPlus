#!/usr/bin/env python3
"""Export cached card content from card_sessions.db to JSON for benchmark use.

Run from project root:
  python3 scripts/benchmark_cache_cards.py

Reads from: storage/card_sessions.db (card_content table)
Writes to:  benchmark/.card_cache.json

The card_content table is populated automatically when Anki runs the
BackgroundEmbeddingThread. This script simply exports that cached data
to a JSON file that the benchmark runner can use for more realistic
text-based search simulation.
"""
import json
import os
import sqlite3
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "storage", "card_sessions.db")
BENCHMARK_DIR = os.path.join(PROJECT_ROOT, "benchmark")
OUTPUT_PATH = os.path.join(BENCHMARK_DIR, ".card_cache.json")


def main():
    if not os.path.isfile(DB_PATH):
        print("ERROR: Database not found at %s" % DB_PATH)
        print("Run Anki with the addon first to populate the database.")
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    # Check if card_content table exists
    table_check = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='card_content'"
    ).fetchone()

    if not table_check:
        print("ERROR: card_content table not found in database.")
        print("Run Anki with the addon first — the background embedding thread")
        print("will populate this table automatically.")
        db.close()
        sys.exit(1)

    rows = db.execute(
        "SELECT card_id, question, answer, deck_name FROM card_content"
    ).fetchall()
    db.close()

    if not rows:
        print("WARNING: card_content table is empty.")
        print("Run Anki and wait for background embedding to complete.")
        sys.exit(1)

    # Build cache dict: card_id (as string key) -> {question, answer, deck}
    cache = {}
    for row in rows:
        cache[str(row["card_id"])] = {
            "question": row["question"] or "",
            "answer": row["answer"] or "",
            "deck": row["deck_name"] or "",
        }

    # Ensure benchmark directory exists
    os.makedirs(BENCHMARK_DIR, exist_ok=True)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2)

    print("Exported %d cards to %s" % (len(cache), OUTPUT_PATH))
    print("File size: %.1f KB" % (os.path.getsize(OUTPUT_PATH) / 1024))


if __name__ == "__main__":
    main()
