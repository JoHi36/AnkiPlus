# LLM-Based Term Extraction & Clickable Terms

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace heuristic term extraction with LLM-based batch extraction (Gemini Flash via OpenRouter) for high-quality medical/scientific terms, and wire up clickable terms in the card reviewer.

**Architecture:** The existing pipeline stays intact — only the extraction step changes. Cards are batched (10-15 per request) and sent to Gemini Flash which returns only real Fachbegriffe. The existing `kg_card_terms` → `kg_edges` → Graph pipeline continues to work. AMBOSS remnants in ReviewerView are cleaned up — only our own KG markers remain. AMBOSS infrastructure outside ReviewerView (addon_proxy.py, App.jsx event dispatch) is left in place for now — this is a scoped cleanup of the reviewer only.

**Tech Stack:** Python (OpenRouter API), React (DOM text marking), SQLite (kg_store)

**Notes:**
- Model ID: `"gemini-2.5-flash"` (without `google/` prefix) — consistent with existing `DEFINITION_MODEL`. `_maybe_call_openrouter` handles the OpenRouter prefix mapping internally.
- The pre-computed `kg_edges` table continues to be built by `GraphIndexBuilder` and used by `get_connected_terms()` (for TermPopup). The subgraph view (`_msg_search_kg_subgraph`) switches to live co-occurrence for richer edges. This is an intentional split — pre-computed edges are sufficient for term detail views.
- Only cards that have NO terms in `kg_card_terms` yet are sent to the LLM. Already-extracted cards are skipped.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `ai/gemini.py` | Modify | Add `extract_terms_batch()` + `_parse_extraction_result()` |
| `ai/embeddings.py` | Modify | Use LLM batch extraction in BackgroundEmbeddingThread |
| `ui/widget.py` | Modify | Fix `_msg_search_kg_subgraph` to compute edges live |
| `frontend/src/components/ReviewerView.jsx` | Modify | Remove AMBOSS remnants, KG-only flow |

---

### Task 1: Add `extract_terms_batch()` to gemini.py

**Files:**
- Modify: `ai/gemini.py` (append after `generate_definition` at ~line 735)

- [ ] **Step 1: Add the batch extraction function**

```python
# ---------------------------------------------------------------------------
# extract_terms_batch — LLM-based term extraction for KG (Ansatz B)
# ---------------------------------------------------------------------------
EXTRACTION_MODEL = "gemini-2.5-flash"


def extract_terms_batch(cards, model=None):
    """Extract medical/scientific terms from a batch of cards via LLM.

    Args:
        cards: List of dicts with 'card_id', 'question', 'answer' keys.
              Batch size should be 10-15 cards.
        model: Model ID (defaults to EXTRACTION_MODEL).

    Returns:
        Dict mapping card_id → list of term strings.
        Example: {123: ["Schlagvolumen", "HZV", "Frank-Starling-Mechanismus"], ...}
    """
    if not cards:
        return {}

    if model is None:
        model = EXTRACTION_MODEL

    config = get_config() or {}

    # Build prompt with all cards
    card_blocks = []
    for i, card in enumerate(cards):
        q = card.get('question', '').strip()
        a = card.get('answer', '').strip()
        cid = card.get('card_id', i)
        card_blocks.append("KARTE_%s:\n%s\n%s" % (cid, q, a))

    cards_text = "\n\n".join(card_blocks)

    prompt = (
        "Extrahiere aus jeder Karte alle medizinischen und naturwissenschaftlichen Fachbegriffe.\n\n"
        "REGELN:\n"
        "- NUR Begriffe die in einem Lehrbuch/Lexikon als eigener Eintrag vorkommen würden\n"
        "- Multi-Word-Begriffe zusammen lassen (z.B. 'Linker Ventrikel', 'Frank-Starling-Mechanismus')\n"
        "- Abkürzungen behalten (HZV, ATP, EKG)\n"
        "- KEINE generischen Wörter (Funktion, Zelle, Therapie, Behandlung, System)\n"
        "- KEINE Verben, Adjektive, Artikel, Stoppwörter\n"
        "- KEINE Zahlen, Einheiten oder Formeln\n\n"
        "FORMAT: Eine Zeile pro Karte, exakt so:\n"
        "KARTE_<id>: Begriff1, Begriff2, Begriff3\n"
        "Falls keine Fachbegriffe: KARTE_<id>: KEINE\n\n"
        "%s" % cards_text
    )

    payload = {
        "message": prompt,
        "model": model,
        "temperature": 0.1,
        "maxOutputTokens": 2000,
    }

    # Try OpenRouter first (dev mode), then backend
    try:
        or_result = _maybe_call_openrouter(payload, config)
    except Exception:
        or_result = None
    if or_result is not None:
        return _parse_extraction_result(or_result, cards)

    url = _get_backend_chat_url()
    headers = _get_auth_headers_safe()

    backend_payload = {
        "message": prompt,
        "history": [],
        "agent": "tutor",
        "mode": "free_chat",
        "responseStyle": "compact",
        "model": model,
        "stream": False,
        "temperature": 0.1,
        "maxOutputTokens": 2000,
    }

    try:
        response = requests.post(url, json=backend_payload, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()
        text = result.get("text") or result.get("response") or ""
        if not text:
            candidates = result.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    text = parts[0].get("text", "").strip()
        if text:
            return _parse_extraction_result(text, cards)
        return {}
    except Exception as e:
        logger.error("extract_terms_batch failed: %s", e)
        return {}


def _parse_extraction_result(text, cards):
    """Parse LLM output into {card_id: [terms]} dict."""
    import re
    result = {}
    card_ids = {str(c.get('card_id', '')): c.get('card_id') for c in cards}

    for line in text.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        match = re.match(r'KARTE_(\S+):\s*(.*)', line)
        if not match:
            continue
        raw_id = match.group(1)
        terms_str = match.group(2).strip()

        cid = card_ids.get(raw_id)
        if cid is None:
            try:
                cid = int(raw_id)
            except (ValueError, TypeError):
                continue
        # Skip hallucinated card IDs not in batch
        if cid not in {c.get('card_id') for c in cards}:
            continue

        if terms_str.upper() == 'KEINE' or not terms_str:
            result[cid] = []
            continue

        terms = [t.strip() for t in terms_str.split(',') if t.strip()]
        seen = set()
        unique = []
        for t in terms:
            key = t.lower()
            if key not in seen:
                seen.add(key)
                unique.append(t)
        result[cid] = unique

    return result
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ai/gemini.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add ai/gemini.py
git commit -m "feat(kg): add LLM-based batch term extraction via OpenRouter"
```

---

### Task 2: Integrate LLM extraction into BackgroundEmbeddingThread

**Files:**
- Modify: `ai/embeddings.py` (lines 315-453 — `BackgroundEmbeddingThread.run()`)

The key change: instead of extracting terms per-card with the heuristic `TermExtractor` inside the card loop, we collect cards and batch-extract after embedding. Only cards WITHOUT existing terms in `kg_card_terms` are sent to the LLM. The heuristic remains as fallback.

- [ ] **Step 1: Remove the per-card heuristic extraction block**

Delete lines 351-371 (the entire `# KG term extraction (runs for every card...)` block inside the `for card in all_cards` loop).

- [ ] **Step 2: Add batch LLM extraction after the embedding loop**

Insert the following block **after** the embedding batch loop (after line 398 `time.sleep(0.5)`) but **before** the KG graph build section (line 400 `# KG graph build`):

```python
        # --- LLM-based batch term extraction ---
        if all_cards and not self._cancelled:
            try:
                try:
                    from .term_extractor import TermExtractor
                except ImportError:
                    from ai.term_extractor import TermExtractor
                try:
                    from ..ai.gemini import extract_terms_batch
                except ImportError:
                    from ai.gemini import extract_terms_batch
                try:
                    from ..storage.kg_store import save_card_terms, get_card_terms
                except ImportError:
                    from storage.kg_store import save_card_terms, get_card_terms

                heuristic_extractor = TermExtractor()
                BATCH_SIZE_LLM = 12
                extracted_count = 0

                # Only extract terms for cards that don't have terms yet
                kg_cards_to_extract = []
                for card in all_cards:
                    cid = card.get('card_id') or card.get('cardId')
                    if not cid:
                        continue
                    existing_terms = get_card_terms(cid)
                    if existing_terms:
                        continue  # Already extracted
                    kg_text = ' '.join(filter(None, [card.get('question', ''), card.get('answer', '')]))
                    if kg_text.strip():
                        kg_cards_to_extract.append({
                            'card_id': cid,
                            'question': card.get('question', ''),
                            'answer': card.get('answer', ''),
                            'deck_id': card.get('deck_id', 0),
                        })

                logger.info("KG term extraction: %d cards need extraction (of %d total)",
                            len(kg_cards_to_extract), len(all_cards))

                for i in range(0, len(kg_cards_to_extract), BATCH_SIZE_LLM):
                    if self._cancelled:
                        break
                    batch = kg_cards_to_extract[i:i + BATCH_SIZE_LLM]

                    try:
                        llm_result = extract_terms_batch(batch)
                    except Exception as e:
                        logger.warning("LLM batch extraction failed, using heuristic: %s", e)
                        llm_result = {}

                    for card in batch:
                        cid = card['card_id']
                        terms = llm_result.get(cid)

                        if not terms:
                            kg_text = '%s %s' % (card.get('question', ''), card.get('answer', ''))
                            terms = heuristic_extractor.extract(kg_text)

                        if terms:
                            question = card.get('question', '')
                            answer = card.get('answer', '')
                            definition_terms = [t for t in terms
                                                if heuristic_extractor.is_definition_card(t, question, answer)]
                            save_card_terms(cid, terms, deck_id=card.get('deck_id', 0),
                                            definition_terms=definition_terms)
                            extracted_count += 1

                    time.sleep(0.5)  # Rate limit between batches

                logger.info("KG term extraction: %d cards processed (LLM batch)", extracted_count)
            except Exception as e:
                logger.warning("Batch KG term extraction failed: %s", e)
```

- [ ] **Step 3: Verify no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ai/embeddings.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add ai/embeddings.py
git commit -m "feat(kg): use LLM batch extraction in background thread with heuristic fallback"
```

---

### Task 3: Fix KG subgraph to compute edges live

**Files:**
- Modify: `ui/widget.py` (method `_msg_search_kg_subgraph`, ~lines 3009-3015)

The current code queries the pre-computed `kg_edges` table which is often empty. Instead, compute co-occurrence edges on-the-fly from `kg_card_terms` using a SQL self-join across ALL cards.

- [ ] **Step 1: Replace the edge query**

Find this block (~line 3009-3015):
```python
            # 2. Get edges between these terms
            term_placeholders = ','.join('?' * len(terms))
            edge_rows = db.execute(
                "SELECT term_a, term_b, weight FROM kg_edges "
                "WHERE term_a IN (%s) AND term_b IN (%s)" % (term_placeholders, term_placeholders),
                terms + terms
            ).fetchall()
```

Replace with:
```python
            # 2. Compute co-occurrence edges LIVE from kg_card_terms (all cards, not just search)
            term_placeholders = ','.join('?' * len(terms))
            edge_rows = db.execute(
                "SELECT a.term, b.term, COUNT(DISTINCT a.card_id) as weight "
                "FROM kg_card_terms a "
                "JOIN kg_card_terms b ON a.card_id = b.card_id AND a.term < b.term "
                "WHERE a.term IN (%s) AND b.term IN (%s) "
                "GROUP BY a.term, b.term "
                "HAVING weight >= 2 "
                "ORDER BY weight DESC "
                "LIMIT 200" % (term_placeholders, term_placeholders),
                terms + terms
            ).fetchall()
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/widget.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add ui/widget.py
git commit -m "feat(kg): compute co-occurrence edges live from kg_card_terms for richer graph"
```

---

### Task 4: Clean up AMBOSS remnants in ReviewerView

**Files:**
- Modify: `frontend/src/components/ReviewerView.jsx`

**Scope:** Only ReviewerView cleanup. AMBOSS infrastructure in `addon_proxy.py` and `App.jsx` event dispatch stays for now — this is a scoped cleanup to remove AMBOSS-specific UI code from the reviewer and keep only our KG marking system.

- [ ] **Step 1: Update marker class in applyPhraseMarkers**

Change line ~130:
```javascript
const markerClass = source === 'knowledge-graph' ? 'kg-marker' : 'amboss-marker';
```
To:
```javascript
const markerClass = 'kg-marker';
```

- [ ] **Step 2: Clean up skip terms (keep branding filter)**

Change line ~133:
```javascript
const SKIP_TERMS = new Set(['amboss', 'meditricks', 'ankihub']);
```
To:
```javascript
const SKIP_TERMS = new Set(['amboss', 'meditricks', 'ankihub']);
```
(Keep as-is — these branding terms should never appear as KG markers regardless.)

- [ ] **Step 3: Remove amboss-marker check in text node skip logic**

In the text node walking logic (~line 158), change:
```javascript
parent.classList.contains('amboss-marker') ||
parent.classList.contains('kg-marker')) continue;
```
To:
```javascript
parent.classList.contains('kg-marker')) continue;
```

- [ ] **Step 4: Remove the `addon.phrases` event listener**

Remove the entire useEffect block (~lines 196-207) that listens for `addon.phrases`.

- [ ] **Step 5: Remove AMBOSS tooltip listener**

Remove the useEffect that listens for `addon.tooltip` (~line 237-241 area).

- [ ] **Step 6: Remove AMBOSS marker click handler**

In the click handler (~lines 273-289), remove the `.amboss-marker` click block and the `pycmd amboss:reviewer:tooltip:` call. Keep only the `.kg-marker` click handler.

- [ ] **Step 7: Remove AMBOSS tooltip rendering JSX**

Remove the tooltip state (`tooltip`, `setTooltip`) and the tooltip overlay JSX (`{/* Addon tooltip (AMBOSS article popup) */}` block).

- [ ] **Step 8: Update comments**

Update the file-level comment (line 10):
```
 * Knowledge Graph terms are marked after render via DOM manipulation.
```

Update `applyPhraseMarkers` docstring (lines 121-124) to remove AMBOSS references.

- [ ] **Step 9: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ReviewerView.jsx
git commit -m "refactor(reviewer): remove AMBOSS remnants from reviewer, KG markers only"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py`
Expected: All tests pass

- [ ] **Step 2: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual test checklist**

1. Restart Anki → wait 10-15s for background thread
2. Check console: "KG term extraction: N cards need extraction" + "N cards processed (LLM batch)"
3. Search in Stapel tab → graph should show terms with visible edges between them
4. Go to a card in reviewer → Fachbegriffe should be underlined with `.kg-marker`
5. Click a marked term → TermPopup should appear with definition (or loading state)
6. Second restart → "0 cards need extraction" (already-extracted cards skipped)
