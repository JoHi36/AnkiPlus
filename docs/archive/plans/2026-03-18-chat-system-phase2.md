# Chat System Phase 2 — Hybrid Retrieval Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vector embeddings and semantic search alongside existing SQL-based retrieval. Gemini Flash router decides which retrieval path to use per query.

**Architecture:** Embeddings via Gemini Embedding API, stored as BLOBs in SQLite, loaded into numpy array at startup for fast cosine similarity. Router decides SQL vs. semantic vs. both. Lazy embedding for current card + background batch job for rest.

**Tech Stack:** Python 3.9+ (numpy, Gemini API), SQLite, existing RAG pipeline in ai_handler.py

**Spec:** `docs/superpowers/specs/2026-03-18-chat-system-redesign.md`

---

### Task 1: Add card_embeddings table to SQLite

**Files:**
- Modify: `card_sessions_storage.py:32-71` (_init_schema)
- Modify: `card_sessions_storage.py:77-87` (_migrate_schema)

- [ ] **Step 1: Add card_embeddings table to schema**

In `_init_schema()`, add after existing tables:

```python
CREATE TABLE IF NOT EXISTS card_embeddings (
    card_id       INTEGER PRIMARY KEY,
    embedding     BLOB NOT NULL,
    content_hash  TEXT NOT NULL,
    model_version TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON card_embeddings(content_hash);
```

- [ ] **Step 2: Add CRUD functions for embeddings**

Add to `card_sessions_storage.py`:

```python
def save_embedding(card_id, embedding_bytes, content_hash, model_version):
    """Save or update a card's embedding."""

def load_embedding(card_id):
    """Load a single card's embedding. Returns dict or None."""

def load_all_embeddings():
    """Load all embeddings for in-memory index. Returns list of (card_id, embedding_bytes, content_hash)."""

def get_stale_card_ids(card_content_hashes):
    """Given {card_id: content_hash}, return card_ids where hash changed or embedding missing."""

def delete_embedding(card_id):
    """Delete embedding for a card."""
```

- [ ] **Step 3: Commit**

---

### Task 2: Create embedding_manager.py

**Files:**
- Create: `embedding_manager.py`

This is the core module that handles Gemini Embedding API calls, in-memory vector index, and background embedding.

- [ ] **Step 1: Create the EmbeddingManager class**

```python
"""
Manages vector embeddings for Anki cards.
- Gemini Embedding API for vector generation
- In-memory numpy index for fast cosine similarity search
- Lazy + background embedding schedule
"""
import numpy as np
import hashlib
import json
import threading
from PyQt6.QtCore import QThread, pyqtSignal

class EmbeddingManager:
    MODEL = "text-embedding-004"
    EMBEDDING_DIM = 768  # Gemini text-embedding-004 dimension
    BATCH_SIZE = 50  # Cards per API call

    def __init__(self, api_key=None, backend_url=None, auth_headers_fn=None):
        self._api_key = api_key
        self._backend_url = backend_url
        self._auth_headers_fn = auth_headers_fn
        self._index = None        # numpy array (N x 768)
        self._card_ids = []       # card_id list aligned with index rows
        self._lock = threading.Lock()
        self._background_thread = None

    def set_credentials(self, api_key=None, backend_url=None, auth_headers_fn=None):
        """Update credentials (called when config changes)."""

    # --- Embedding API ---

    def embed_texts(self, texts):
        """Call Gemini Embedding API for a batch of texts.
        Returns list of numpy arrays (one per text).
        Uses direct API with api_key, or backend with auth headers."""

    def _card_to_text(self, card_data):
        """Convert card fields to a single text for embedding.
        Concatenates question + answer + tags, strips HTML."""

    def _content_hash(self, text):
        """SHA256 hash of card text content for staleness detection."""

    # --- In-Memory Index ---

    def load_index(self):
        """Load all embeddings from SQLite into numpy array.
        Called on profile_did_open."""

    def search(self, query_embedding, top_k=10, exclude_card_ids=None):
        """Cosine similarity search. Returns [(card_id, score), ...]."""

    def add_to_index(self, card_id, embedding):
        """Add/update a single embedding in the in-memory index."""

    # --- Lazy Embedding ---

    def ensure_embedded(self, card_id, card_data):
        """Ensure a card has a current embedding.
        If missing or stale, embed immediately and add to index.
        Returns the embedding."""

    # --- Background Job ---

    def start_background_embedding(self, get_all_cards_fn):
        """Start background thread to embed all un-embedded cards.
        get_all_cards_fn: callable that returns list of {card_id, question, answer, tags, ...}"""

    def stop_background_embedding(self):
        """Stop background thread (on profile_will_close)."""
```

- [ ] **Step 2: Implement embed_texts() — Gemini API call**

```python
def embed_texts(self, texts):
    import requests

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.MODEL}:batchEmbedContents"

    if self._api_key:
        url += f"?key={self._api_key}"
        headers = {"Content-Type": "application/json"}
    elif self._auth_headers_fn:
        headers = {**self._auth_headers_fn(), "Content-Type": "application/json"}

    # Batch format for Gemini
    requests_body = {
        "requests": [
            {"model": f"models/{self.MODEL}", "content": {"parts": [{"text": t}]}}
            for t in texts
        ]
    }

    response = requests.post(url, json=requests_body, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()

    embeddings = []
    for item in data.get("embeddings", []):
        vec = np.array(item["values"], dtype=np.float32)
        embeddings.append(vec)

    return embeddings
```

- [ ] **Step 3: Implement load_index() and search()**

```python
def load_index(self):
    from card_sessions_storage import load_all_embeddings
    rows = load_all_embeddings()
    if not rows:
        self._index = np.zeros((0, self.EMBEDDING_DIM), dtype=np.float32)
        self._card_ids = []
        return

    card_ids = []
    vectors = []
    for card_id, emb_bytes, _ in rows:
        vec = np.frombuffer(emb_bytes, dtype=np.float32)
        if len(vec) == self.EMBEDDING_DIM:
            vectors.append(vec)
            card_ids.append(card_id)

    self._card_ids = card_ids
    self._index = np.array(vectors, dtype=np.float32) if vectors else np.zeros((0, self.EMBEDDING_DIM), dtype=np.float32)
    # Normalize for cosine similarity
    norms = np.linalg.norm(self._index, axis=1, keepdims=True)
    norms[norms == 0] = 1
    self._index = self._index / norms

def search(self, query_embedding, top_k=10, exclude_card_ids=None):
    with self._lock:
        if self._index is None or len(self._index) == 0:
            return []

        # Normalize query
        query = query_embedding / (np.linalg.norm(query_embedding) or 1)

        # Cosine similarity (dot product on normalized vectors)
        similarities = self._index @ query

        # Get top-k indices
        if exclude_card_ids:
            exclude_set = set(exclude_card_ids)
            mask = np.array([cid not in exclude_set for cid in self._card_ids])
            similarities = similarities * mask

        top_indices = np.argsort(similarities)[-top_k:][::-1]

        results = []
        for idx in top_indices:
            if similarities[idx] > 0.3:  # Minimum similarity threshold
                results.append((self._card_ids[idx], float(similarities[idx])))

        return results
```

- [ ] **Step 4: Implement ensure_embedded() — Lazy embedding**

```python
def ensure_embedded(self, card_id, card_data):
    from card_sessions_storage import load_embedding, save_embedding

    text = self._card_to_text(card_data)
    current_hash = self._content_hash(text)

    existing = load_embedding(card_id)
    if existing and existing['content_hash'] == current_hash:
        return np.frombuffer(existing['embedding'], dtype=np.float32)

    # Need to embed
    embeddings = self.embed_texts([text])
    if not embeddings:
        return None

    emb = embeddings[0]
    save_embedding(card_id, emb.tobytes(), current_hash, self.MODEL)
    self.add_to_index(card_id, emb)
    return emb
```

- [ ] **Step 5: Implement BackgroundEmbeddingThread**

```python
class BackgroundEmbeddingThread(QThread):
    progress_signal = pyqtSignal(int, int)  # current, total
    finished_signal = pyqtSignal(int)  # total embedded

    def __init__(self, manager, get_all_cards_fn):
        super().__init__()
        self.manager = manager
        self.get_all_cards_fn = get_all_cards_fn
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        import time
        from card_sessions_storage import load_all_embeddings, save_embedding

        # Get all cards from Anki
        all_cards = self.get_all_cards_fn()
        if not all_cards:
            self.finished_signal.emit(0)
            return

        # Find which need embedding
        existing = {row[0]: row[2] for row in load_all_embeddings()}  # card_id -> content_hash

        to_embed = []
        for card in all_cards:
            text = self.manager._card_to_text(card)
            h = self.manager._content_hash(text)
            if card['card_id'] not in existing or existing[card['card_id']] != h:
                to_embed.append((card, text, h))

        total = len(to_embed)
        embedded = 0

        # Batch embed
        for i in range(0, total, self.manager.BATCH_SIZE):
            if self._cancelled:
                break

            batch = to_embed[i:i + self.manager.BATCH_SIZE]
            texts = [t for _, t, _ in batch]

            try:
                embeddings = self.manager.embed_texts(texts)
                for j, emb in enumerate(embeddings):
                    card, _, h = batch[j]
                    save_embedding(card['card_id'], emb.tobytes(), h, self.manager.MODEL)
                    self.manager.add_to_index(card['card_id'], emb)
                embedded += len(batch)
                self.progress_signal.emit(embedded, total)
            except Exception as e:
                print(f"Background embedding error: {e}")
                time.sleep(5)  # Back off on error

            time.sleep(0.5)  # Rate limiting

        self.finished_signal.emit(embedded)
```

- [ ] **Step 6: Implement helper methods**

```python
def _card_to_text(self, card_data):
    import re
    parts = []
    for field in ['question', 'answer', 'frontField']:
        val = card_data.get(field, '')
        if val:
            clean = re.sub(r'<[^>]+>', '', val)  # Strip HTML
            clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)  # Strip entities
            clean = re.sub(r'\s+', ' ', clean).strip()
            if clean:
                parts.append(clean)
    tags = card_data.get('tags', [])
    if tags:
        parts.append(' '.join(tags) if isinstance(tags, list) else tags)
    return ' '.join(parts)[:2000]  # Limit text length

def _content_hash(self, text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

def add_to_index(self, card_id, embedding):
    with self._lock:
        vec = embedding / (np.linalg.norm(embedding) or 1)
        if card_id in self._card_ids:
            idx = self._card_ids.index(card_id)
            self._index[idx] = vec
        else:
            self._card_ids.append(card_id)
            self._index = np.vstack([self._index, vec.reshape(1, -1)]) if len(self._index) > 0 else vec.reshape(1, -1)
```

- [ ] **Step 7: Commit**

---

### Task 3: Create hybrid_retrieval.py — Router orchestration

**Files:**
- Create: `hybrid_retrieval.py`

- [ ] **Step 1: Create the HybridRetrieval class**

This class wraps the existing `_rag_retrieve_cards()` and adds semantic search:

```python
"""
Hybrid Retrieval: SQL + Semantic search orchestrated by Gemini Flash router.
"""

class HybridRetrieval:
    def __init__(self, embedding_manager, ai_handler):
        self.emb = embedding_manager
        self.ai = ai_handler

    def retrieve(self, user_message, router_result, context=None, max_notes=10):
        """
        Execute retrieval based on router decision.

        Args:
            user_message: User's question
            router_result: Dict from _rag_router() with intent, search_needed, queries, etc.
            context: Current card context
            max_notes: Max cards to return

        Returns:
            Same format as _rag_retrieve_cards(): {context_string, citations}
        """
        if not router_result.get('search_needed', False):
            return {"context_string": "", "citations": {}}

        mode = router_result.get('retrieval_mode', 'both')

        sql_results = {}
        semantic_results = {}

        # SQL retrieval (existing path)
        if mode in ('sql', 'both'):
            sql_data = self.ai._rag_retrieve_cards(
                precise_queries=router_result.get('precise_queries'),
                broad_queries=router_result.get('broad_queries'),
                search_scope=router_result.get('search_scope', 'current_deck'),
                context=context,
                max_notes=max_notes
            )
            sql_results = sql_data.get('citations', {})

        # Semantic retrieval
        if mode in ('semantic', 'both') and self.emb and self.emb._index is not None and len(self.emb._index) > 0:
            query_embeddings = self.emb.embed_texts([user_message])
            if query_embeddings:
                exclude = [context.get('cardId')] if context and context.get('cardId') else []
                matches = self.emb.search(query_embeddings[0], top_k=max_notes, exclude_card_ids=exclude)

                for card_id, score in matches:
                    semantic_results[str(card_id)] = {
                        'card_id': card_id,
                        'similarity_score': score,
                        'source': 'semantic'
                    }

        # Merge results
        merged = self._merge_results(sql_results, semantic_results, max_notes)

        # Build context string
        context_string = self._build_context_string(merged)

        return {"context_string": context_string, "citations": merged}

    def _merge_results(self, sql_results, semantic_results, max_notes):
        """Merge SQL and semantic results, prioritizing cards found by both."""
        merged = {}

        # Add SQL results
        for note_id, data in sql_results.items():
            merged[note_id] = {**data, 'sources': ['sql']}

        # Add/merge semantic results
        for card_id_str, data in semantic_results.items():
            if card_id_str in merged:
                merged[card_id_str]['sources'].append('semantic')
                merged[card_id_str]['similarity_score'] = data.get('similarity_score', 0)
            else:
                # Need to load card data for semantic-only results
                merged[card_id_str] = {
                    **data,
                    'sources': ['semantic']
                }

        # Sort: both sources first, then by score
        sorted_items = sorted(
            merged.items(),
            key=lambda x: (len(x[1].get('sources', [])), x[1].get('similarity_score', 0)),
            reverse=True
        )

        return dict(sorted_items[:max_notes])

    def _build_context_string(self, merged):
        """Build formatted context string from merged results."""
        parts = []
        for note_id, data in merged.items():
            sources = ', '.join(data.get('sources', []))
            fields = data.get('fields', {})
            if fields:
                field_strs = [f"  {k}: {v}" for k, v in fields.items() if v]
                parts.append(f"Note {note_id} (via {sources}):\n" + '\n'.join(field_strs))
        return '\n\n'.join(parts)
```

- [ ] **Step 2: Commit**

---

### Task 4: Update router to support retrieval_mode

**Files:**
- Modify: `ai_handler.py:2128-2195` (router prompt)
- Modify: `ai_handler.py:2359-2449` (response parsing)

- [ ] **Step 1: Update router prompt to output retrieval_mode**

In the router prompt (around line 2128), add `retrieval_mode` to the expected output JSON:

Add to the output format instructions:
```
"retrieval_mode": "sql" | "semantic" | "both"
// Use "sql" for structural queries (tags, decks, specific fields)
// Use "semantic" for meaning-based queries (explain, relate, why, compare)
// Use "both" for queries that benefit from both approaches
```

- [ ] **Step 2: Update response parsing to extract retrieval_mode**

In the parsing section (around line 2359-2449), extract `retrieval_mode` from the parsed JSON and include it in the return value. Default to `"both"` if not present.

- [ ] **Step 3: Commit**

---

### Task 5: Wire hybrid retrieval into get_response_with_rag()

**Files:**
- Modify: `ai_handler.py:3172-3358` (get_response_with_rag)
- Modify: `__init__.py` (initialize EmbeddingManager)

- [ ] **Step 1: Initialize EmbeddingManager in __init__.py**

In `on_profile_loaded()` / `init_addon()`, create and store EmbeddingManager:

```python
from embedding_manager import EmbeddingManager

def init_addon():
    # ... existing code ...

    # Initialize embedding manager
    config = load_config()
    emb_manager = EmbeddingManager(
        api_key=config.get('api_key'),
        backend_url=config.get('backend_url'),
        auth_headers_fn=lambda: get_ai_handler()._get_auth_headers() if get_ai_handler() else {}
    )
    emb_manager.load_index()

    # Store globally
    global _embedding_manager
    _embedding_manager = emb_manager

    # Start background embedding
    def get_all_cards():
        # Use Anki's collection to get all cards
        from aqt import mw
        card_ids = mw.col.find_cards("")
        cards = []
        for cid in card_ids:
            card = mw.col.get_card(cid)
            note = card.note()
            cards.append({
                'card_id': cid,
                'question': note.fields[0] if note.fields else '',
                'answer': note.fields[1] if len(note.fields) > 1 else '',
                'tags': note.tags,
            })
        return cards

    emb_manager.start_background_embedding(get_all_cards)
```

- [ ] **Step 2: Pass EmbeddingManager to AIHandler**

Update `get_ai_handler()` to pass the embedding manager, or let AIHandler access it globally.

- [ ] **Step 3: Update get_response_with_rag() to use hybrid retrieval**

After the router call (line 3196), check if semantic search is requested:

```python
# After router result
router_result = self._rag_router(user_message, context)

# Use hybrid retrieval if embedding manager available
if hasattr(self, '_embedding_manager') and self._embedding_manager:
    from hybrid_retrieval import HybridRetrieval
    hybrid = HybridRetrieval(self._embedding_manager, self)
    rag_data = hybrid.retrieve(user_message, router_result, context)
else:
    # Fallback to SQL-only (existing path)
    rag_data = self._rag_retrieve_cards(
        precise_queries=router_result.get('precise_queries'),
        broad_queries=router_result.get('broad_queries'),
        search_scope=router_result.get('search_scope'),
        context=context
    )
```

- [ ] **Step 4: Lazy-embed current card in card_tracker.py**

When a card is shown, ensure it has an embedding:

```python
# In card_tracker.py send_card_context(), after building card_data:
if _embedding_manager:
    try:
        _embedding_manager.ensure_embedded(card.id, card_data)
    except Exception:
        pass  # Don't block card display
```

- [ ] **Step 5: Stop background embedding on profile_will_close**

In `cleanup_addon()`:

```python
if _embedding_manager:
    _embedding_manager.stop_background_embedding()
```

- [ ] **Step 6: Commit**

---

### Task 6: Verify and build

- [ ] **Step 1: Python syntax check all new/modified files**

```bash
python3 -c "import py_compile; py_compile.compile('embedding_manager.py', doraise=True)"
python3 -c "import py_compile; py_compile.compile('hybrid_retrieval.py', doraise=True)"
python3 -c "import py_compile; py_compile.compile('ai_handler.py', doraise=True)"
python3 -c "import py_compile; py_compile.compile('card_sessions_storage.py', doraise=True)"
python3 -c "import py_compile; py_compile.compile('card_tracker.py', doraise=True)"
```

- [ ] **Step 2: Verify numpy is available or add fallback**

Check if numpy is bundled with Anki. If not, add a try/except import with a fallback message.

- [ ] **Step 3: Build frontend (no frontend changes in Phase 2)**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

---

## Summary

| Task | Description | Files | Complexity |
|------|-------------|-------|------------|
| 1 | card_embeddings table + CRUD | card_sessions_storage.py | Simple |
| 2 | EmbeddingManager (API, index, background) | embedding_manager.py (new) | Complex |
| 3 | HybridRetrieval orchestration | hybrid_retrieval.py (new) | Medium |
| 4 | Router retrieval_mode support | ai_handler.py | Simple |
| 5 | Wire everything together | ai_handler.py, __init__.py, card_tracker.py | Medium |
| 6 | Verify and build | All files | Simple |
