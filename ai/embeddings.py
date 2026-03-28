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
        self._index = []       # list of normalized float lists
        self._card_ids = []    # card_id list aligned with index rows
        self._lock = threading.Lock()
        self._background_thread = None
        self._index_loaded = False  # lazy-load flag

    def set_credentials(self, api_key=None, backend_url=None, auth_headers_fn=None):
        if api_key is not None:
            self._api_key = api_key
        if backend_url is not None:
            self._backend_url = backend_url
        if auth_headers_fn is not None:
            self._auth_headers_fn = auth_headers_fn

    # ── Embedding API ──

    MODEL = "text-embedding-004"

    def embed_texts(self, texts):
        """Embed texts via backend /embed endpoint."""
        if not texts:
            return []

        import requests as http_requests
        try:
            from ..config import get_backend_url, get_auth_token
        except ImportError:
            from config import get_backend_url, get_auth_token

        backend_url = get_backend_url()
        auth_token = get_auth_token()

        if not backend_url or not auth_token:
            logger.warning("EmbeddingManager: No backend URL or auth token configured")
            return []

        try:
            response = http_requests.post(
                '%s/embed' % backend_url.rstrip('/'),
                headers={
                    'Authorization': 'Bearer %s' % auth_token,
                    'Content-Type': 'application/json',
                },
                json={'texts': [t[:2000] for t in texts]},
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            embeddings = data.get('embeddings', [])
            if embeddings:
                logger.debug("EmbeddingManager: %d texts embedded via backend", len(embeddings))
                return embeddings
            logger.warning("EmbeddingManager: Backend returned empty embeddings")
            return []
        except Exception as e:
            logger.error("EmbeddingManager: Backend embed failed: %s", e)
            return []

    def _card_to_text(self, card_data):
        """Build embedding text from card content.

        Strategy:
        - Tags are NOT included (keyword search handles tag-based discovery)
        - Answer/content fields are weighted higher (appear first, carry the knowledge)
        - Cloze markers are resolved to reveal hidden text
        - All content fields are included, not just question/answer
        - HTML and entities are stripped
        """
        def _clean(val):
            if not val:
                return ''
            # Remove sound references: [sound:filename.mp3]
            clean = re.sub(r'\[sound:[^\]]+\]', '', val)
            # Remove image references: <img src="..."> (already caught by HTML strip, but be safe)
            clean = re.sub(r'\[image:[^\]]+\]', '', clean)
            # Remove LaTeX: \(...\) and \[...\] and $...$ — keep the content inside
            clean = re.sub(r'\\\((.+?)\\\)', r'\1', clean)
            clean = re.sub(r'\\\[(.+?)\\\]', r'\1', clean)
            # Remove MathJax/LaTeX commands but keep text content
            clean = re.sub(r'\\(?:text|mathrm|textbf|textit)\{([^}]*)\}', r'\1', clean)
            clean = re.sub(r'\\[a-zA-Z]+', ' ', clean)  # remaining LaTeX commands
            clean = re.sub(r'[{}]', '', clean)  # leftover braces
            # Strip HTML tags and entities
            clean = re.sub(r'<[^>]+>', '', clean)
            clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
            clean = re.sub(r'&#?\w+;', ' ', clean)  # numeric entities too
            # Resolve cloze markers: {{c1::answer}} → answer, {{c1::answer::hint}} → answer
            clean = re.sub(r'\{\{c\d+::(.*?)(?:::[^}]*)?\}\}', r'\1', clean)
            # Remove URLs (not semantic content)
            clean = re.sub(r'https?://\S+', '', clean)
            # Normalize whitespace
            clean = re.sub(r'\s+', ' ', clean).strip()
            return clean

        # Prefer answer fields first (they contain the actual knowledge)
        answer = _clean(card_data.get('answer', ''))
        question = _clean(card_data.get('question', ''))

        # Extra fields — supports both array (get_all_cards) and dict (card_tracker)
        extra_fields = card_data.get('extra_fields', [])
        fields_dict = card_data.get('fields', {})
        if isinstance(fields_dict, dict) and not extra_fields:
            # card_tracker format: dict of field_name → value
            # Skip question/answer equivalents, keep the rest
            skip_names = {'Front', 'Vorderseite', 'Question', 'Frage', 'Back', 'Rückseite', 'Answer', 'Antwort'}
            extra_fields = [v for k, v in fields_dict.items() if k not in skip_names and v]

        extras = ' '.join(_clean(f) for f in extra_fields if f)

        # Build embedding: answer first (weighted), then question, then extras
        parts = []
        if answer:
            parts.append(answer)
        if question:
            parts.append(question)
        if extras:
            parts.append(extras)

        text = ' '.join(parts)[:2000]

        # Skip cards with too little content (e.g., image-only cards)
        if len(text) < 10:
            return ''

        return text

    def _content_hash(self, text):
        return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

    # ── In-Memory Index ──

    def load_index(self):
        """Load all embeddings from DB into memory. Safe to call multiple times."""
        if self._index_loaded:
            return
        try:
            from storage.card_sessions import load_all_embeddings
        except ImportError:
            from ..storage.card_sessions import load_all_embeddings

        rows = load_all_embeddings()
        with self._lock:
            if not rows:
                self._index = []
                self._card_ids = []
            else:
                card_ids = []
                vectors = []
                for card_id, emb_bytes, _ in rows:
                    vec = _unpack_floats(emb_bytes, self.EMBEDDING_DIM)
                    if len(vec) == self.EMBEDDING_DIM:
                        vectors.append(_normalize(vec))
                        card_ids.append(card_id)
                self._card_ids = card_ids
                self._index = vectors
            self._index_loaded = True

        logger.info("EmbeddingManager: Loaded %d embeddings into index", len(self._card_ids))

    def _ensure_index(self):
        """Lazy-load the index on first use."""
        if not self._index_loaded:
            self.load_index()

    def search(self, query_embedding, top_k=10, exclude_card_ids=None):
        self._ensure_index()
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

    def load_kg_term_index(self):
        """Load pre-computed KG term embeddings into memory for fuzzy matching.

        Returns:
            Dict of {term: normalized_vector (list of float)} or empty dict.
        """
        import struct
        import math

        try:
            try:
                from ..storage.kg_store import load_term_embeddings
            except ImportError:
                from storage.kg_store import load_term_embeddings

            raw = load_term_embeddings()
            if not raw:
                return {}

            index = {}
            for term, emb_bytes in raw.items():
                dim = len(emb_bytes) // 4
                if dim == 0:
                    continue
                vec = list(struct.unpack('%df' % dim, emb_bytes))
                norm = math.sqrt(sum(v * v for v in vec))
                if norm > 0:
                    vec = [v / norm for v in vec]
                index[term] = vec

            logger.info("Loaded %d KG term embeddings for fuzzy matching", len(index))
            return index
        except Exception as e:
            logger.warning("Failed to load KG term index: %s", e)
            return {}

    def fuzzy_term_search(self, term_embedding, kg_term_index, top_k=3, min_similarity=0.60):
        """Find nearest KG terms by cosine similarity.

        Args:
            term_embedding: Embedding vector for the query term.
            kg_term_index: Dict of {term: normalized_vector} from load_kg_term_index().
            top_k: Max number of matches to return.
            min_similarity: Minimum cosine similarity threshold.

        Returns:
            List of (term, score) tuples sorted by similarity descending.
        """
        if not kg_term_index or not term_embedding:
            return []

        import math
        norm = math.sqrt(sum(v * v for v in term_embedding))
        if norm > 0:
            normed = [v / norm for v in term_embedding]
        else:
            return []

        scored = []
        for kg_term, kg_vec in kg_term_index.items():
            score = sum(a * b for a, b in zip(normed, kg_vec))
            if score >= min_similarity:
                scored.append((kg_term, score))

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
            from storage.kg_store import save_card_content
        except ImportError:
            try:
                from ..storage.kg_store import save_card_content
            except ImportError:
                save_card_content = None

        try:
            all_cards = self.get_all_cards_fn()
        except Exception as e:
            logger.error("BackgroundEmbedding: Failed to get cards: %s", e)
            self.finished_signal.emit(0)
            return

        if not all_cards:
            self.finished_signal.emit(0)
            return

        # Cache card content (question/answer/deck) for benchmark and offline search
        if save_card_content:
            cached_count = 0
            for card in all_cards:
                cid = card.get('card_id') or card.get('cardId')
                if not cid:
                    continue
                question = card.get('question', '') or ''
                answer = card.get('answer', '') or ''
                deck_name = card.get('deckName', '') or card.get('deck_name', '') or ''
                if question or answer:
                    try:
                        save_card_content(cid, question, answer, deck_name)
                        cached_count += 1
                    except Exception as e:
                        logger.debug("BackgroundEmbedding: save_card_content failed for %s: %s", cid, e)
            if cached_count > 0:
                logger.info("BackgroundEmbedding: Cached content for %d cards", cached_count)

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

        # --- LLM-based batch term extraction (rate-limited: max 1 full run per 24h) ---
        if all_cards and not self._cancelled:
            try:
                try:
                    from ..ai.gemini import extract_terms_batch
                except ImportError:
                    from ai.gemini import extract_terms_batch
                try:
                    from ..storage.kg_store import save_card_terms, get_card_terms
                except ImportError:
                    from storage.kg_store import save_card_terms, get_card_terms

                # Rate limit: prevent quota exploit by limiting full extractions
                import os
                _ts_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                        '..', 'storage', '.kg_extraction_ts')
                _ts_path = os.path.normpath(_ts_path)
                MIN_EXTRACTION_INTERVAL = 3600  # 1 hour minimum between full extractions
                try:
                    if os.path.exists(_ts_path):
                        last_ts = float(open(_ts_path).read().strip())
                        if time.time() - last_ts < MIN_EXTRACTION_INTERVAL:
                            logger.info("KG extraction skipped: last run was %d min ago (min interval: %d min)",
                                        int((time.time() - last_ts) / 60), MIN_EXTRACTION_INTERVAL // 60)
                            raise StopIteration("rate limited")
                except (ValueError, OSError):
                    pass
                except StopIteration:
                    raise  # Re-raise to skip extraction


                BATCH_SIZE_LLM = 15
                extracted_count = 0
                skipped_count = 0

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

                    # LLM-only extraction — NO heuristic fallback
                    try:
                        llm_result = extract_terms_batch(batch)
                    except Exception as e:
                        err_str = str(e)
                        if '403' in err_str or '429' in err_str or 'quota' in err_str.lower():
                            logger.warning("KG extraction stopped: quota/auth error. %d cards extracted, %d remaining.",
                                           extracted_count, len(kg_cards_to_extract) - i)
                            break  # Stop entirely — retry on next startup
                        logger.warning("KG batch extraction failed, skipping batch: %s", e)
                        skipped_count += len(batch)
                        continue

                    if not llm_result:
                        skipped_count += len(batch)
                        continue

                    for card in batch:
                        cid = card['card_id']
                        terms = llm_result.get(cid)

                        # No fallback — if LLM didn't return terms, skip this card
                        if not terms:
                            skipped_count += 1
                            continue

                        save_card_terms(cid, terms, deck_id=card.get('deck_id', 0))
                        extracted_count += 1

                    time.sleep(0.3)

                logger.info("KG term extraction: %d cards extracted, %d skipped (LLM-only, no fallback)",
                            extracted_count, skipped_count)

                # Save timestamp to prevent re-extraction within rate limit window
                if extracted_count > 0:
                    try:
                        with open(_ts_path, 'w') as f:
                            f.write(str(time.time()))
                    except OSError:
                        pass
            except StopIteration:
                pass  # Rate limited — skip silently
            except Exception as e:
                logger.warning("Batch KG term extraction failed: %s", e)

        # KG graph build (runs after all cards are processed)
        try:
            try:
                from .term_extractor import compute_collocations
            except ImportError:
                from ai.term_extractor import compute_collocations
            try:
                from .kg_builder import GraphIndexBuilder
            except ImportError:
                from ai.kg_builder import GraphIndexBuilder

            all_texts = [self.manager._card_to_text(c) for c in all_cards]
            collocations = compute_collocations(all_texts)
            if hasattr(self, '_term_extractor') and collocations:
                self._term_extractor.set_collocations(collocations)

            builder = GraphIndexBuilder()
            builder.build()
            logger.info("Knowledge Graph built successfully")

            try:
                try:
                    from ..storage.kg_store import compute_deck_links
                except ImportError:
                    from storage.kg_store import compute_deck_links
                link_count = compute_deck_links()
                logger.info("Computed %d deck cross-links", link_count)
            except Exception as e:
                logger.warning("Deck cross-link computation failed: %s", e)
        except Exception as e:
            logger.warning("KG graph build failed: %s", e)

        # Embed unembedded KG terms
        try:
            try:
                from ..storage.kg_store import get_unembedded_terms, save_term_embedding
            except ImportError:
                from storage.kg_store import get_unembedded_terms, save_term_embedding
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
