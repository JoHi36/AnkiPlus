"""
Manages vector embeddings for Anki cards.
- Gemini Embedding API for vector generation
- In-memory index for fast cosine similarity search (pure Python, no numpy required)
- Lazy + background embedding schedule
"""
import hashlib
import math
import re
import struct
import threading
import time

from PyQt6.QtCore import QThread, pyqtSignal

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


def _dot(a, b):
    """Dot product of two float lists."""
    return sum(x * y for x, y in zip(a, b))


def _norm(a):
    """L2 norm of a float list."""
    return math.sqrt(sum(x * x for x in a))


def _normalize(a):
    """Normalize a float list to unit length."""
    n = _norm(a)
    if n > 0:
        return [x / n for x in a]
    return a


def _pack_floats(floats):
    """Pack list of floats into bytes (little-endian float32)."""
    return struct.pack(f'<{len(floats)}f', *floats)


def _unpack_floats(data, dim):
    """Unpack bytes into list of floats (little-endian float32)."""
    return list(struct.unpack(f'<{dim}f', data))


class EmbeddingManager:
    MODEL = "gemini-embedding-001"
    EMBEDDING_DIM = 3072
    BATCH_SIZE = 50
    MIN_SIMILARITY = 0.3

    def __init__(self, api_key=None, backend_url=None, auth_headers_fn=None):
        self._api_key = api_key
        self._backend_url = backend_url
        self._auth_headers_fn = auth_headers_fn
        self._backend_failed = False  # Skip backend after first auth failure
        self._index = []       # list of normalized float lists
        self._card_ids = []    # card_id list aligned with index rows
        self._lock = threading.Lock()
        self._background_thread = None

    def set_credentials(self, api_key=None, backend_url=None, auth_headers_fn=None):
        if api_key is not None:
            self._api_key = api_key
        if backend_url is not None:
            self._backend_url = backend_url
        if auth_headers_fn is not None:
            self._auth_headers_fn = auth_headers_fn

    # ── Embedding API ──

    def embed_texts(self, texts):
        if not texts:
            return []

        import requests as http_requests

        # Backend-Modus: Embeddings über Cloud Function (skip if previously failed)
        if self._backend_url and self._auth_headers_fn and not self._backend_failed:
            try:
                embed_url = f"{self._backend_url}/embed"
                headers = {**self._auth_headers_fn(), "Content-Type": "application/json"}
                body = {"texts": [t[:2000] for t in texts]}

                response = http_requests.post(embed_url, json=body, headers=headers, timeout=5)
                response.raise_for_status()
                data = response.json()
                return data.get("embeddings", [])
            except (OSError, ValueError, KeyError) as e:
                logger.warning("EmbeddingManager: Backend-Fehler: %s, Fallback auf direkte API (Backend wird übersprungen)", e)
                self._backend_failed = True

        # Direkter Gemini API Modus (Fallback)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.MODEL}:batchEmbedContents"

        if self._api_key:
            url += f"?key={self._api_key}"
            headers = {"Content-Type": "application/json"}
        else:
            logger.warning("EmbeddingManager: No credentials configured")
            return []

        body = {
            "requests": [
                {
                    "model": f"models/{self.MODEL}",
                    "content": {"parts": [{"text": t[:2000]}]}
                }
                for t in texts
            ]
        }

        response = http_requests.post(url, json=body, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()

        embeddings = []
        for item in data.get("embeddings", []):
            vec = item["values"]
            embeddings.append(vec)

        return embeddings

    def _card_to_text(self, card_data):
        parts = []
        for field in ['question', 'answer', 'frontField']:
            val = card_data.get(field, '')
            if val:
                clean = re.sub(r'<[^>]+>', '', val)
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = re.sub(r'\s+', ' ', clean).strip()
                if clean:
                    parts.append(clean)
        tags = card_data.get('tags', [])
        if tags:
            parts.append(' '.join(tags) if isinstance(tags, list) else str(tags))
        return ' '.join(parts)[:2000]

    def _content_hash(self, text):
        return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

    # ── In-Memory Index ──

    def load_index(self):
        try:
            from storage.card_sessions import load_all_embeddings
        except ImportError:
            from ..storage.card_sessions import load_all_embeddings

        rows = load_all_embeddings()
        with self._lock:
            if not rows:
                self._index = []
                self._card_ids = []
                return

            card_ids = []
            vectors = []
            for card_id, emb_bytes, _ in rows:
                vec = _unpack_floats(emb_bytes, self.EMBEDDING_DIM)
                if len(vec) == self.EMBEDDING_DIM:
                    vectors.append(_normalize(vec))
                    card_ids.append(card_id)

            self._card_ids = card_ids
            self._index = vectors

        logger.info("EmbeddingManager: Loaded %d embeddings into index", len(self._card_ids))

    def search(self, query_embedding, top_k=10, exclude_card_ids=None):
        with self._lock:
            if not self._index:
                return []

            query = _normalize(query_embedding)
            exclude_set = set(exclude_card_ids) if exclude_card_ids else set()

            scored = []
            for i, vec in enumerate(self._index):
                cid = self._card_ids[i]
                if cid in exclude_set:
                    continue
                score = _dot(query, vec)
                if score >= self.MIN_SIMILARITY:
                    scored.append((cid, score))

            scored.sort(key=lambda x: x[1], reverse=True)
            return scored[:top_k]

    def add_to_index(self, card_id, embedding):
        with self._lock:
            vec = _normalize(embedding)

            if card_id in self._card_ids:
                idx = self._card_ids.index(card_id)
                self._index[idx] = vec
            else:
                self._card_ids.append(card_id)
                self._index.append(vec)

    # ── Lazy Embedding ──

    def ensure_embedded(self, card_id, card_data):
        try:
            from storage.card_sessions import load_embedding, save_embedding
        except ImportError:
            from ..storage.card_sessions import load_embedding, save_embedding

        text = self._card_to_text(card_data)
        if not text.strip():
            return None

        current_hash = self._content_hash(text)

        existing = load_embedding(card_id)
        if existing and existing['content_hash'] == current_hash:
            emb = _unpack_floats(existing['embedding'], self.EMBEDDING_DIM)
            if len(emb) == self.EMBEDDING_DIM:
                if card_id not in self._card_ids:
                    self.add_to_index(card_id, emb)
                return emb

        embeddings = self.embed_texts([text])
        if not embeddings:
            return None

        emb = embeddings[0]
        save_embedding(card_id, _pack_floats(emb), current_hash, self.MODEL)
        self.add_to_index(card_id, emb)
        return emb

    # ── Background Embedding ──

    def start_background_embedding(self, get_all_cards_fn):
        if self._background_thread and self._background_thread.isRunning():
            return

        self._background_thread = BackgroundEmbeddingThread(self, get_all_cards_fn)
        self._background_thread.progress_signal.connect(
            lambda cur, tot: logger.debug("Embedding progress: %d/%d", cur, tot)
        )
        self._background_thread.finished_signal.connect(
            lambda n: logger.info("Background embedding complete: %d cards embedded", n)
        )
        self._background_thread.start()

    def stop_background_embedding(self):
        if self._background_thread and self._background_thread.isRunning():
            self._background_thread.cancel()
            self._background_thread.wait(5000)
            self._background_thread = None


class BackgroundEmbeddingThread(QThread):
    progress_signal = pyqtSignal(int, int)
    finished_signal = pyqtSignal(int)

    def __init__(self, manager, get_all_cards_fn):
        super().__init__()
        self.manager = manager
        self.get_all_cards_fn = get_all_cards_fn
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        try:
            from storage.card_sessions import load_all_embeddings, save_embedding
        except ImportError:
            from ..storage.card_sessions import load_all_embeddings, save_embedding

        try:
            all_cards = self.get_all_cards_fn()
        except Exception as e:
            logger.error("BackgroundEmbedding: Failed to get cards: %s", e)
            self.finished_signal.emit(0)
            return

        if not all_cards:
            self.finished_signal.emit(0)
            return

        existing = {}
        try:
            for card_id, _, content_hash in load_all_embeddings():
                existing[card_id] = content_hash
        except (AttributeError, OSError, ValueError) as e:
            logger.debug("BackgroundEmbedding: load_all_embeddings error: %s", e)

        to_embed = []
        for card in all_cards:
            if self._cancelled:
                break
            text = self.manager._card_to_text(card)
            if not text.strip():
                continue
            h = self.manager._content_hash(text)
            cid = card.get('card_id') or card.get('cardId')
            if cid and (cid not in existing or existing[cid] != h):
                to_embed.append({'card_id': cid, 'text': text, 'hash': h})

            # KG term extraction (runs for every card, independent of embedding status)
            try:
                from .term_extractor import TermExtractor
                from ..storage.kg_store import save_card_terms
                if not hasattr(self, '_term_extractor'):
                    self._term_extractor = TermExtractor()
                terms = self._term_extractor.extract(text)
                if terms:
                    question = card.get('question', '')
                    definition_terms = [t for t in terms if self._term_extractor.is_definition_card(t, question, card.get('answer', ''))]
                    save_card_terms(cid, terms, deck_id=card.get('deck_id', 0), definition_terms=definition_terms)
            except Exception as e:
                logger.warning("KG term extraction failed for card %s: %s", card.get('card_id'), e)

        total = len(to_embed)
        embedded = 0

        for i in range(0, total, self.manager.BATCH_SIZE):
            if self._cancelled:
                break

            batch = to_embed[i:i + self.manager.BATCH_SIZE]
            texts = [item['text'] for item in batch]

            try:
                embeddings = self.manager.embed_texts(texts)
                if not embeddings:
                    logger.warning("BackgroundEmbedding: No embeddings returned, stopping (credentials issue?)")
                    break
                for j, emb in enumerate(embeddings):
                    item = batch[j]
                    save_embedding(item['card_id'], _pack_floats(emb), item['hash'], self.manager.MODEL)
                    self.manager.add_to_index(item['card_id'], emb)
                embedded += len(embeddings)
                self.progress_signal.emit(embedded, total)
            except (OSError, ValueError, KeyError) as e:
                logger.error("BackgroundEmbedding batch error: %s, stopping background embedding", e)
                break  # Stop on error instead of continuing to spam API

            time.sleep(0.5)

        # KG graph build (runs after all cards are processed)
        try:
            from .term_extractor import compute_collocations
            from .kg_builder import GraphIndexBuilder

            all_texts = [self.manager._card_to_text(c) for c in all_cards]
            collocations = compute_collocations(all_texts)
            if hasattr(self, '_term_extractor') and collocations:
                self._term_extractor.set_collocations(collocations)

            builder = GraphIndexBuilder()
            builder.build()
            logger.info("Knowledge Graph built successfully")
        except Exception as e:
            logger.warning("KG graph build failed: %s", e)

        # Embed unembedded KG terms
        try:
            from ..storage.kg_store import get_unembedded_terms, save_term_embedding
            unembedded = get_unembedded_terms()
            if unembedded and self.manager:
                BATCH = 50
                for i in range(0, len(unembedded), BATCH):
                    batch = unembedded[i:i + BATCH]
                    embeddings = self.manager.embed_texts(batch)
                    if embeddings:
                        for term, emb in zip(batch, embeddings):
                            if emb is not None:
                                emb_bytes = struct.pack(f'{len(emb)}f', *emb)
                                save_term_embedding(term, emb_bytes)
                logger.info("Embedded %d KG terms", len(unembedded))
        except Exception as e:
            logger.warning("KG term embedding failed: %s", e)

        self.finished_signal.emit(embedded)
