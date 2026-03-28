#!/usr/bin/env python3
"""Build card-averaged term embeddings.

Instead of embedding the bare word "Jejunum", averages the embeddings of all
cards that contain "Jejunum". The result captures the semantic context of the
term as it appears in the user's actual cards.

Zero API cost — uses existing card embeddings from card_embeddings table.
Writes results to kg_terms.embedding column.

Usage: python3 scripts/build_card_averaged_embeddings.py
"""
import sys, os, sqlite3, struct, math, time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, 'storage', 'card_sessions.db')


def main():
    db = sqlite3.connect(DB_PATH)

    # Load all card embeddings into memory
    print("Loading card embeddings...")
    t0 = time.time()
    card_embs = {}
    rows = db.execute("SELECT card_id, embedding FROM card_embeddings WHERE embedding IS NOT NULL").fetchall()
    for card_id, emb_bytes in rows:
        dim = len(emb_bytes) // 4
        if dim == 0:
            continue
        vec = list(struct.unpack('%df' % dim, emb_bytes))
        card_embs[card_id] = vec
    dim = len(next(iter(card_embs.values()))) if card_embs else 0
    print("  %d card embeddings loaded (%d-dim) in %.1fs" % (len(card_embs), dim, time.time() - t0))

    # Get term → card_ids mapping
    print("Building term → cards mapping...")
    term_cards = {}
    rows = db.execute("SELECT term, card_id FROM kg_card_terms").fetchall()
    for term, card_id in rows:
        if card_id in card_embs:
            term_cards.setdefault(term, []).append(card_id)

    print("  %d terms with embeddable cards" % len(term_cards))

    # Compute averaged embeddings
    print("Computing card-averaged embeddings...")
    t0 = time.time()
    updated = 0
    skipped = 0

    for term, card_ids in term_cards.items():
        if not card_ids:
            skipped += 1
            continue

        # Average the card embeddings
        avg = [0.0] * dim
        count = 0
        for cid in card_ids:
            vec = card_embs.get(cid)
            if vec and len(vec) == dim:
                for i in range(dim):
                    avg[i] += vec[i]
                count += 1

        if count == 0:
            skipped += 1
            continue

        # Normalize: divide by count, then L2-normalize
        for i in range(dim):
            avg[i] /= count

        norm = math.sqrt(sum(v * v for v in avg))
        if norm > 0:
            avg = [v / norm for v in avg]

        # Pack and store
        packed = struct.pack('%df' % dim, *avg)
        db.execute("UPDATE kg_terms SET embedding = ? WHERE term = ?", (packed, term))
        updated += 1

        if updated % 1000 == 0:
            db.commit()
            sys.stdout.write('\r  %d / %d terms updated...' % (updated, len(term_cards)))
            sys.stdout.flush()

    db.commit()
    elapsed = time.time() - t0

    print("\r  Done: %d terms updated, %d skipped in %.1fs" % (updated, skipped, elapsed))
    print("\n  These embeddings now represent the SEMANTIC CONTEXT of each term")
    print("  as it appears across the user's actual cards.")
    print("  'Jejunum' vector now contains context of 'Dünndarm', 'Ileum', etc.")

    db.close()


if __name__ == '__main__':
    main()
