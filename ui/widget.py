"""
ChatbotWidget Modul
Verwaltet das Web-basierte Chat-UI über QWebEngineView
"""

import os
import re
import json
import uuid
import threading
import weakref
from aqt.qt import *
from aqt.utils import showInfo

# WebEngine / WebChannel
try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebChannel import QWebChannel
except ImportError:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
        from PyQt5.QtWebChannel import QWebChannel
    except ImportError:
        QWebEngineView = None
        QWebChannel = None

# Stelle sicher, dass QObject, pyqtSlot und pyqtSignal verfügbar sind
try:
    from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal, QThread
except ImportError:
    try:
        from PyQt5.QtCore import QObject, pyqtSlot, pyqtSignal, QThread
    except ImportError:
        QObject = object
        QThread = object
        def pyqtSlot(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        def pyqtSignal(*args, **kwargs):
            class FakeSignal:
                def connect(self, *args):
                    pass
                def emit(self, *args):
                    pass
            return FakeSignal()

# Config-Import
try:
    from ..config import get_config, update_config, AVAILABLE_MODELS
except ImportError:
    from config import get_config, update_config, AVAILABLE_MODELS

# Bridge-Import
try:
    from .bridge import WebBridge
except ImportError:
    from ui.bridge import WebBridge

# Card-Tracker-Import
try:
    from ..utils.card_tracker import CardTracker
except ImportError:
    from utils.card_tracker import CardTracker

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# NOTE: Legacy sessions_storage (JSON) removed — per-card SQLite is now used instead.

# ---------------------------------------------------------------------------
# Timing constants
# ---------------------------------------------------------------------------
POLL_INTERVAL_MS = 200          # JS→Python message queue polling rate
PLUSI_WAKE_CHECK_MS = 60_000    # Plusi autonomy wake-up check interval (every minute)
SETTINGS_RELOAD_DELAY_MS = 100  # Delay after config save before reloading models
STUDY_DECK_DELAY_MS = 100       # Delay before triggering deck study (Anki init timing)


class AIRequestThread(QThread):
    """Thread for asynchronous AI API requests with request-ID based streaming."""
    chunk_signal = pyqtSignal(str, str, bool, bool)  # requestId, chunk, done, is_function_call
    error_signal = pyqtSignal(str, str)  # requestId, error_message
    finished_signal = pyqtSignal(str)  # requestId
    metadata_signal = pyqtSignal(str, object, object, object)  # requestId, steps, citations, step_labels
    pipeline_signal = pyqtSignal(str, str, str, object)  # requestId, step, status, data
    msg_event_signal = pyqtSignal(str, str, object)  # requestId, eventType, data

    def __init__(self, ai_handler, text, widget_ref, history=None, mode='compact', request_id=None, insights=None, agent_name=None):
        super().__init__()
        self._handler_ref = weakref.ref(ai_handler) if ai_handler is not None else None
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None
        self.text = text
        self.history = history
        self.mode = mode
        self.request_id = request_id or str(uuid.uuid4())
        self._cancelled = False
        self.insights = insights
        self.agent_name = agent_name

    def cancel(self):
        """Cancel the request."""
        self._cancelled = True

    def run(self):
        handler = self._handler_ref() if self._handler_ref is not None else None
        widget = self._widget_ref() if self._widget_ref is not None else None
        if handler is None:
            logger.warning("AIRequestThread: ai_handler was destroyed before run, aborting")
            return
        try:
            context = widget.current_card_context if widget is not None else None
            if context:
                logger.debug("🔍 AIRequestThread.run: context=has cardId=%s, question='%s'", context.get('cardId'), (context.get('frontField') or context.get('question') or '')[:60])
            else:
                logger.debug("🔍 AIRequestThread.run: context=None")

            # Load card-specific history from SQLite (moved here from main thread)
            card_history = self.history
            card_ctx = getattr(self, '_card_context_for_history', None)
            if card_ctx and card_ctx.get('cardId'):
                try:
                    try:
                        from ..storage.card_sessions import load_card_session
                    except ImportError:
                        from storage.card_sessions import load_card_session
                    card_id = card_ctx['cardId']
                    session_data = load_card_session(card_id)
                    db_messages = session_data.get('messages', [])
                    if db_messages:
                        recent = db_messages[-10:]
                        card_history = [
                            {'role': 'user' if m.get('sender') == 'user' else 'assistant',
                             'content': m.get('text', '')}
                            for m in recent if m.get('text')
                        ]
                        logger.debug("📋 AIThread: Card history loaded (%s msgs from card %s)", len(card_history), card_id)
                    else:
                        card_history = []
                except Exception as e:
                    logger.error("⚠️ AIThread: Failed to load card history: %s", e)

            # Give the AI handler a callback to emit pipeline events via Qt signal
            def pipeline_callback(step, status, data):
                if self._cancelled:
                    return
                self.pipeline_signal.emit(self.request_id, step, status, data or {})

            handler._pipeline_signal_callback = pipeline_callback

            # Give the AI handler a callback to emit v2 msg events via Qt signal
            def msg_event_callback(event_type, data):
                if self._cancelled:
                    return
                self.msg_event_signal.emit(self.request_id, event_type, data or {})

            handler._msg_event_callback = msg_event_callback

            def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
                if self._cancelled:
                    return
                self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)
                if done and (steps or citations or step_labels):
                    self.metadata_signal.emit(self.request_id, steps or [], citations or [], step_labels or [])

            bot_msg = handler.get_response_with_rag(
                self.text, context=context, history=card_history,
                mode=self.mode, callback=stream_callback,
                insights=self.insights,
                agent_name=self.agent_name
            )

            if not self._cancelled:
                self.finished_signal.emit(self.request_id)
        except Exception as e:
            if not self._cancelled:
                logger.exception("AIRequestThread: Exception: %s", str(e))
                self.error_signal.emit(self.request_id, str(e))
        finally:
            if handler is not None:
                handler._pipeline_signal_callback = None
                handler._msg_event_callback = None


class VoiceThread(QThread):
    """Thread for Plusi voice pipeline: STT → Plusi agent → TTS."""
    result_signal = pyqtSignal(object)  # {"audio": base64, "mood": str, "text": str}
    mood_signal = pyqtSignal(str)       # Intermediate mood updates for dock
    error_signal = pyqtSignal(str)      # Error message

    def __init__(self, audio_base64):
        super().__init__()
        self.audio_base64 = audio_base64

    def run(self):
        try:
            try:
                from ..ai.voice import voice_chat, generate_speech
            except ImportError:
                from ai.voice import voice_chat, generate_speech

            # Single call: audio in → Plusi audio out (native)
            self.mood_signal.emit('thinking')
            result = voice_chat(self.audio_base64)
            if not result:
                self.error_signal.emit("Konnte Sprache nicht erkennen.")
                return

            plusi_text = result.get('text', '')
            mood = result.get('mood', 'neutral')
            audio_b64 = result.get('audio')

            # If native audio worked, send directly
            if audio_b64:
                self.mood_signal.emit(mood)
                logger.info("voice pipeline: native audio response, text=%d chars", len(plusi_text))
                self.result_signal.emit({
                    "audio": audio_b64,
                    "mood": mood,
                    "text": plusi_text,
                })
                return

            # Fallback: model returned text only → use TTS
            if plusi_text:
                self.mood_signal.emit(mood)
                logger.info("voice pipeline: text fallback, generating TTS for %d chars", len(plusi_text))
                audio_b64 = generate_speech(plusi_text, mood=mood)
                self.result_signal.emit({
                    "audio": audio_b64,
                    "mood": mood,
                    "text": plusi_text,
                })
            else:
                self.error_signal.emit("Keine Antwort von Plusi.")
        except Exception as e:
            logger.exception("voice pipeline error: %s", e)
            self.error_signal.emit(str(e))


class InsightExtractionThread(QThread):
    """Background thread for insight extraction via OpenRouter."""
    finished_signal = pyqtSignal(int, str)  # card_id, insights_json
    error_signal = pyqtSignal(int, str)     # card_id, error_message

    def __init__(self, card_id, card_context, messages, existing_insights, performance_data, ai_handler):
        super().__init__()
        self.card_id = card_id
        self.card_context = card_context
        self.messages = messages
        self.existing_insights = existing_insights
        self.performance_data = performance_data
        self._handler_ref = weakref.ref(ai_handler) if ai_handler is not None else None
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        if self._cancelled:
            return
        try:
            from ..storage.insights import (
                build_extraction_prompt, parse_extraction_response,
                extract_insights_via_openrouter, compute_new_indices, insight_hash
            )
            from ..storage.card_sessions import load_insights, save_insights
            from ..config import get_config

            prompt = build_extraction_prompt(
                self.card_context, self.messages,
                self.existing_insights, self.performance_data
            )

            logger.debug("InsightExtractionThread: Starting for card %s, prompt length=%s",
                         self.card_id, len(prompt))

            if self._cancelled:
                return

            # Call OpenRouter directly (fast, cheap, no Gemini handler overhead)
            api_key = get_config().get('openrouter_api_key', '')
            response = extract_insights_via_openrouter(prompt, api_key)

            if self._cancelled:
                return

            logger.debug("InsightExtractionThread: Response: %s", response[:200] if response else 'None')

            result = parse_extraction_response(response)

            if result is None:
                self.error_signal.emit(self.card_id, "Konnte die Antwort nicht verarbeiten")
                return

            # Compute new_indices before saving
            existing = load_insights(self.card_id)
            seen_hashes = existing.get('seen_hashes', [])
            new_indices = compute_new_indices(result.get('insights', []), seen_hashes)

            # Check if no new insights were found
            if not new_indices and existing.get('insights'):
                # No new insights — emit special signal
                emit_data = dict(existing)
                emit_data.pop('seen_hashes', None)
                emit_data['new_indices'] = []
                emit_data['no_new_insights'] = True
                self.finished_signal.emit(self.card_id, json.dumps(emit_data, ensure_ascii=False))
                return

            result['seen_hashes'] = seen_hashes
            save_insights(self.card_id, result)

            emit_data = dict(result)
            emit_data.pop('seen_hashes', None)
            emit_data['new_indices'] = new_indices
            self.finished_signal.emit(self.card_id, json.dumps(emit_data, ensure_ascii=False))

        except Exception as e:
            if not self._cancelled:
                logger.exception("InsightExtractionThread failed for card %s", self.card_id)
                self.error_signal.emit(self.card_id, str(e))


class SearchCardsThread(QThread):
    """Background thread for embedding-based card search."""
    result_signal = pyqtSignal(str)  # JSON result string
    pipeline_signal = pyqtSignal(str, str, str, object)  # requestId, step, status, data

    def __init__(self, query, top_k, emb_mgr, widget_ref):
        super().__init__()
        self.query = query
        self.top_k = top_k
        self.emb_mgr = emb_mgr
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None
        self._request_id = "search_%s" % id(self)

    def _emit_step(self, step, status, data=None):
        """Emit pipeline step — same format as session AI pipeline."""
        self.pipeline_signal.emit(self._request_id, step, status, data or {})

    def _expand_query(self, query):
        """Use LLM to generate 3-4 expanded search queries for better recall."""
        try:
            try:
                from ..ai.gemini import _get_backend_chat_url
                from ..ai.auth import get_auth_headers
            except ImportError:
                from ai.gemini import _get_backend_chat_url
                from ai.auth import get_auth_headers

            import requests
            url = _get_backend_chat_url()
            if not url:
                return []

            prompt = (
                "Generiere 3 alternative Suchbegriffe für diese Lernkarten-Suche: \"%s\"\n"
                "Die Begriffe sollen verschiedene Aspekte und Synonyme abdecken.\n"
                "Antworte NUR mit den 3 Begriffen, einer pro Zeile, ohne Nummerierung."
            ) % query

            resp = requests.post(
                url, headers=get_auth_headers(), timeout=8,
                json={"message": prompt, "model": "gemini-2.5-flash", "mode": "compact",
                      "history": [], "stream": False}
            )
            if resp.status_code == 200:
                text = resp.json().get("text") or resp.json().get("response") or ""
                expanded = [line.strip() for line in text.strip().split("\n") if line.strip() and len(line.strip()) > 2]
                logger.info("Query expansion for '%s': %d queries generated", query, len(expanded))
                return expanded[:4]
        except Exception as e:
            logger.debug("Query expansion failed (non-critical): %s", e)
        return []

    def run(self):
        try:
            import re as _re

            # === MULTI-QUERY HYBRID SEARCH ===
            self._emit_step("orchestrating", "active", {"query": self.query})
            self._emit_step("orchestrating", "done", {"agent": "tutor"})

            # 1. Embed original query + expanded queries
            self._emit_step("semantic_search", "active", {"query": self.query})
            expanded_queries = self._expand_query(self.query)
            all_queries = [self.query] + expanded_queries
            logger.info("SearchCards: Searching with %d queries for '%s'", len(all_queries), self.query)

            # Embed all queries in one batch
            query_embs = self.emb_mgr.embed_texts(all_queries)

            # 2. Vector search — each query contributes results
            vector_ids = set()
            scores = {}
            hit_count = {}  # how many queries found each card
            for qi, emb in enumerate(query_embs or []):
                if not emb:
                    continue
                results = self.emb_mgr.search(emb, top_k=self.top_k * 2)
                for cid, score in (results or []):
                    vector_ids.add(cid)
                    # Keep the best score across all queries
                    if score > scores.get(cid, 0):
                        scores[cid] = score
                    hit_count[cid] = hit_count.get(cid, 0) + 1

            # Multi-query boost: cards found by multiple queries get boosted
            for cid, count in hit_count.items():
                if count > 1:
                    scores[cid] = scores.get(cid, 0) + 0.05 * (count - 1)

            self._emit_step("semantic_search", "done", {"total_hits": len(vector_ids)})

            # 2. SQL keyword search (exact matches)
            self._emit_step("sql_search", "active")
            sql_ids = set()
            try:
                try:
                    from ..storage.kg_store import _get_db as kg_get_db
                except ImportError:
                    from storage.kg_store import _get_db as kg_get_db
                db = kg_get_db()
                # Search card text via kg_card_terms (terms contain keywords)
                keywords = [w for w in self.query.split() if len(w) >= 3]
                for kw in keywords:
                    rows = db.execute(
                        "SELECT DISTINCT card_id FROM kg_card_terms WHERE term LIKE ?",
                        (f"%{kw}%",)
                    ).fetchall()
                    for r in rows:
                        sql_ids.add(r[0])
            except Exception as e:
                logger.debug("SQL keyword search failed (non-critical): %s", e)

            self._emit_step("sql_search", "done", {"total_hits": len(sql_ids)})

            # 3. Merge: dual-match cards first, then vector-only, then sql-only
            self._emit_step("merge", "active")
            dual = vector_ids & sql_ids
            vector_only = vector_ids - sql_ids
            sql_only = sql_ids - vector_ids

            # Score: dual matches get boosted, sql-only get base score
            for cid in dual:
                scores[cid] = scores.get(cid, 0.5) + 0.2  # boost
            for cid in sql_only:
                scores[cid] = 0.4  # base relevance for keyword matches

            # Rank all candidates by score, take top-K
            all_candidates = list(dual) + sorted(vector_only, key=lambda c: scores.get(c, 0), reverse=True) + sorted(sql_only, key=lambda c: scores.get(c, 0), reverse=True)
            card_ids = list(dict.fromkeys(all_candidates))[:self.top_k]  # dedupe, limit
            self._emit_step("merge", "done", {"total": len(card_ids), "keyword_count": len(sql_ids), "semantic_count": len(vector_ids)})

            if not card_ids:
                self.result_signal.emit(json.dumps({"type": "graph.searchCards", "data": {
                    "cards": [], "edges": [], "query": self.query,
                    "error": "Keine Karten gefunden" if not query_embs or not query_embs[0] else None}}))
                return

            # Tag source for each card
            sources = {}
            for cid in card_ids:
                if cid in dual:
                    sources[cid] = 'both'
                elif cid in vector_ids:
                    sources[cid] = 'semantic'
                else:
                    sources[cid] = 'keyword'

            # Get card details from Anki (must run on main thread)
            import threading
            try:
                from ..utils.anki import run_on_main_thread
            except ImportError:
                from utils.anki import run_on_main_thread

            cards_data = []
            event = threading.Event()

            def _fetch():
                try:
                    from aqt import mw
                    for cid in card_ids:
                        try:
                            card = mw.col.get_card(cid)
                            note = card.note()
                            fields = note.fields
                            deck = mw.col.decks.get(card.did)
                            deck_name = deck["name"] if deck else "Unknown"
                            question = fields[0] if fields else ""
                            question_clean = _re.sub(r'<[^>]+>', '', question)[:80]
                            # Card review state: 0=new, 1=learning, 2=review(mature)
                            is_due = card.queue > 0 and card.due <= mw.col.sched.today
                            cards_data.append({
                                "id": str(cid),
                                "question": question_clean,
                                "deck": deck_name.split("::")[-1],
                                "deckFull": deck_name,
                                "score": round(scores.get(cid, 0), 3),
                                "source": sources.get(cid, "semantic"),
                                "cardType": card.type,  # 0=new, 1=learn, 2=review
                                "isDue": is_due,
                            })
                        except Exception:
                            pass
                finally:
                    event.set()

            run_on_main_thread(_fetch)
            event.wait(timeout=10)

            # Create star topology: all cards connect to central query node
            edges = []
            for card in cards_data:
                edges.append({
                    "source": "__query__",
                    "target": card["id"],
                    "similarity": card["score"],
                })

            # === CLUSTER COMPUTATION ===
            # Compute pairwise similarity to find semantic clusters
            card_embs = {}
            with self.emb_mgr._lock:
                for cid in card_ids:
                    if cid in self.emb_mgr._card_ids:
                        idx = self.emb_mgr._card_ids.index(cid)
                        card_embs[cid] = self.emb_mgr._index[idx]

            # Compute all pairwise similarities
            cids_list = list(card_embs.keys())
            all_sims = {}
            for i in range(len(cids_list)):
                for j in range(i + 1, len(cids_list)):
                    a = card_embs[cids_list[i]]
                    b = card_embs[cids_list[j]]
                    dot = sum(x * y for x, y in zip(a, b))
                    na = sum(x * x for x in a) ** 0.5
                    nb = sum(x * x for x in b) ** 0.5
                    if na > 0 and nb > 0:
                        all_sims[(cids_list[i], cids_list[j])] = dot / (na * nb)

            # Dynamic clustering — find the NATURAL number of clusters
            # Instead of forcing a fixed target, find the threshold that gives
            # the best cluster structure (reasonable size, not too many singletons).
            # Range: 3-8 clusters for varied, interesting graphs.
            n_cards = len(card_ids)
            if n_cards < 6:
                TARGET_CLUSTERS = 1
            else:
                # Dynamic: aim for clusters of avg 8-15 cards
                # This gives 3 clusters for 30 cards, 5 for 60, 8 for 100
                TARGET_CLUSTERS = max(3, min(8, round(n_cards / 12)))
            best_threshold = 0.95
            best_clusters = None

            for threshold_10x in range(95, 40, -5):  # 0.95, 0.90, 0.85, ...
                threshold = threshold_10x / 100.0
                sim_pairs = {}
                for (ci, cj), sim in all_sims.items():
                    if sim > threshold:
                        sim_pairs.setdefault(ci, set()).add(cj)
                        sim_pairs.setdefault(cj, set()).add(ci)

                # Connected components
                assigned = set()
                trial_clusters = []
                for cid in card_ids:
                    if cid in assigned:
                        continue
                    cluster = []
                    queue = [cid]
                    assigned.add(cid)
                    while queue:
                        current = queue.pop(0)
                        cluster.append(current)
                        for neighbor in sim_pairs.get(current, set()):
                            if neighbor not in assigned:
                                assigned.add(neighbor)
                                queue.append(neighbor)
                    trial_clusters.append(cluster)

                # Filter out singleton clusters (merge into nearest)
                real_clusters = [c for c in trial_clusters if len(c) >= 2]
                singletons = [c[0] for c in trial_clusters if len(c) == 1]

                if len(real_clusters) >= TARGET_CLUSTERS:
                    best_clusters = real_clusters
                    best_threshold = threshold
                    # Assign singletons to nearest cluster
                    for s in singletons:
                        if s in card_embs:
                            best_sim = -1
                            best_ci = 0
                            for ci, cluster in enumerate(best_clusters):
                                for member in cluster:
                                    key = (min(s, member), max(s, member))
                                    sim = all_sims.get(key, 0)
                                    if sim > best_sim:
                                        best_sim = sim
                                        best_ci = ci
                            best_clusters[best_ci].append(s)
                    break

            # Merge smallest clusters if we have too many (cap at TARGET_CLUSTERS)
            if best_clusters and len(best_clusters) > TARGET_CLUSTERS:
                # Sort by size ascending, merge smallest into their nearest neighbor
                while len(best_clusters) > TARGET_CLUSTERS:
                    best_clusters.sort(key=lambda c: len(c))
                    smallest = best_clusters.pop(0)
                    # Find most similar cluster
                    best_sim = -1
                    best_ci = 0
                    for ci, cluster in enumerate(best_clusters):
                        total_sim = 0
                        count = 0
                        for s in smallest:
                            for member in cluster:
                                key = (min(s, member), max(s, member))
                                total_sim += all_sims.get(key, 0)
                                count += 1
                        avg = total_sim / max(1, count)
                        if avg > best_sim:
                            best_sim = avg
                            best_ci = ci
                    best_clusters[best_ci].extend(smallest)

            # Fallback: if no good split found, split evenly
            if not best_clusters or len(best_clusters) < 2:
                chunk_size = max(2, len(card_ids) // TARGET_CLUSTERS)
                best_clusters = []
                for i in range(0, len(card_ids), chunk_size):
                    best_clusters.append(card_ids[i:i + chunk_size])

            clusters = best_clusters
            logger.debug("Clustering: %d clusters at threshold %.2f", len(clusters), best_threshold)

            # Build cluster output
            cards_by_id = {c["id"]: c for c in cards_data}
            cluster_output = []
            for i, cluster_cids in enumerate(clusters):
                cluster_cards = [cards_by_id[str(cid)] for cid in cluster_cids if str(cid) in cards_by_id]
                if not cluster_cards:
                    continue
                # Label: use original deck path (skip "KG:" filtered decks)
                deck_counts = {}
                for c in cluster_cards:
                    d = c.get("deckFull", c.get("deck", ""))
                    # Skip filtered deck names
                    if d.startswith("KG:") or d.startswith("KG "):
                        d = c.get("deck", "")
                    # Use deepest sub-deck name
                    parts = d.split("::")
                    leaf = parts[-1].strip() if parts else d
                    if leaf and not leaf.startswith("KG"):
                        deck_counts[leaf] = deck_counts.get(leaf, 0) + 1
                # Best label: use card content for uniqueness
                # First try deck name, but if duplicate → use card snippet
                best_card = max(cluster_cards, key=lambda c: c.get("score", 0))
                q = best_card.get("question", "")
                # Clean question text: strip cloze markers, take first meaningful words
                import re as _re
                q_clean = _re.sub(r'\{\{c\d+::', '', q)
                q_clean = _re.sub(r'\}\}', '', q_clean)
                q_clean = q_clean.strip()
                card_snippet = " ".join(q_clean.split()[:3]) if q_clean else "Cluster %d" % (i + 1)

                if deck_counts:
                    deck_label = max(deck_counts, key=deck_counts.get)
                    label = deck_label
                else:
                    label = card_snippet
                # Truncate label to max 3 words
                label_words = label.split()
                if len(label_words) > 3:
                    label = " ".join(label_words[:3])
                cluster_output.append({
                    "id": "cluster_%d" % i,
                    "label": label,
                    "cards": cluster_cards,
                })

            # Deduplicate cluster labels — if multiple clusters have same label, add card snippet
            seen_labels = {}
            for co in cluster_output:
                if co["label"] in seen_labels:
                    # Both the duplicate and the original get card-based labels
                    orig = seen_labels[co["label"]]
                    if orig.get("_snippet"):
                        orig["label"] = orig["_snippet"]
                    best = max(co["cards"], key=lambda c: c.get("score", 0))
                    q = best.get("question", "")
                    q = _re.sub(r'\{\{c\d+::', '', q)
                    q = _re.sub(r'\}\}', '', q).strip()
                    co["label"] = " ".join(q.split()[:3]) or co["label"]
                else:
                    seen_labels[co["label"]] = co
                    co["_snippet"] = card_snippet  # store for potential dedup

            # Clean up temp fields
            for co in cluster_output:
                co.pop("_snippet", None)

            # Compute inter-cluster similarity (avg pairwise similarity between clusters)
            cluster_links = []
            for ci in range(len(clusters)):
                for cj in range(ci + 1, len(clusters)):
                    total_sim = 0
                    count = 0
                    for a in clusters[ci]:
                        for b in clusters[cj]:
                            key = (min(a, b), max(a, b))
                            s = all_sims.get(key, 0)
                            if s > 0:
                                total_sim += s
                                count += 1
                    if count > 0:
                        avg_sim = total_sim / count
                        if avg_sim > 0.35:  # only show meaningful connections
                            cluster_links.append({
                                "source": "cluster_%d" % ci,
                                "target": "cluster_%d" % cj,
                                "value": round(avg_sim, 3),
                                "type": "inter_cluster",
                            })

            self.result_signal.emit(json.dumps({
                "type": "graph.searchCards",
                "data": {
                    "clusters": cluster_output,
                    "clusterLinks": cluster_links,
                    "cards": cards_data,
                    "edges": edges,
                    "query": self.query,
                    "totalFound": len(cards_data),
                }
            }))

        except Exception as e:
            logger.exception("SearchCardsThread failed for query: %s", self.query)
            self.result_signal.emit(json.dumps({"type": "graph.searchCards", "data": {
                "cards": [], "edges": [], "error": str(e)}}))


# DEPRECATED: Replaced by Definition agent dispatch. Kept for reference.
class KGDefinitionThread(QThread):
    """Background thread for generating Knowledge Graph term definitions via LLM."""
    result_signal = pyqtSignal(str)  # JSON result string

    def __init__(self, term, widget_ref, search_query=None):
        super().__init__()
        self.term = term
        self.search_query = search_query
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None

    def run(self):
        try:
            try:
                from ..storage.kg_store import get_definition, get_term_card_ids, save_definition, get_connected_terms
                from .. import get_embedding_manager
            except ImportError:
                from storage.kg_store import get_definition, get_term_card_ids, save_definition, get_connected_terms
                from __init__ import get_embedding_manager

            # Check cache first
            cached = get_definition(self.term)
            if cached:
                cached["connectedTerms"] = get_connected_terms(self.term)
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": cached
                }))
                return

            # Use existing search() method for finding relevant cards
            emb_mgr = get_embedding_manager()
            if emb_mgr is None:
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": {"term": self.term, "error": "Embedding-Manager nicht verfügbar"}
                }))
                return

            query = "Was ist %s? Definition" % self.term
            query_emb = emb_mgr.embed_texts([query])
            if not query_emb:
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": {"term": self.term, "error": "Embedding fehlgeschlagen"}
                }))
                return

            # Find top cards by similarity, filtered to this term's cards
            card_ids_set = set(get_term_card_ids(self.term))
            all_results = emb_mgr.search(query_emb[0], top_k=50)
            top_cards = [(cid, score) for cid, score in all_results if cid in card_ids_set][:8]

            if len(top_cards) < 2:
                connected = get_connected_terms(self.term)
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": {"term": self.term, "error": "Nicht genug Quellen", "connectedTerms": connected}
                }))
                return

            # Get card texts (must happen on main thread)
            import threading
            try:
                from ..utils.anki import run_on_main_thread
            except ImportError:
                from utils.anki import run_on_main_thread
            card_texts = []
            event = threading.Event()

            def _fetch_texts():
                try:
                    from aqt import mw
                    for cid, _ in top_cards:
                        try:
                            card = mw.col.get_card(cid)
                            note = card.note()
                            fields = note.fields
                            card_texts.append({
                                "question": fields[0] if fields else "",
                                "answer": fields[1] if len(fields) > 1 else "",
                            })
                        except Exception:
                            pass
                finally:
                    event.set()

            run_on_main_thread(_fetch_texts)
            event.wait(timeout=10)

            # Generate definition via Gemini Flash
            try:
                from ..ai.gemini import generate_definition
            except ImportError:
                from ai.gemini import generate_definition
            definition = generate_definition(self.term, card_texts, search_query=self.search_query)

            # Build card refs for inline [1], [2] rendering
            source_ids = [cid for cid, _ in top_cards]
            card_refs = {}
            for i, (cid, _) in enumerate(top_cards):
                q = card_texts[i].get("question", "") if i < len(card_texts) else ""
                card_refs[str(i + 1)] = {"id": str(cid), "question": q[:60]}

            # Cache
            save_definition(self.term, definition, source_ids, "llm")

            connected = get_connected_terms(self.term)
            self.result_signal.emit(json.dumps({
                "type": "graph.termDefinition",
                "data": {
                    "term": self.term,
                    "definition": definition,
                    "sourceCount": len(source_ids),
                    "generatedBy": "llm",
                    "connectedTerms": connected,
                    "cardRefs": card_refs,
                }
            }))
        except Exception as e:
            logger.exception("KG definition generation failed for %s", self.term)
            self.result_signal.emit(json.dumps({
                "type": "graph.termDefinition",
                "data": {"term": self.term, "error": str(e)}
            }))


class SmartSearchAgentThread(QThread):
    """Dispatch Research agent for Smart Search answer + parallel cluster labeling."""
    result_signal = pyqtSignal(str)  # JSON for graph.quickAnswer (cluster labels only)
    pipeline_signal = pyqtSignal(str, str, str, object)
    msg_event_signal = pyqtSignal(str, str, object)
    finished_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str, str)

    def __init__(self, query, cards_data, cluster_info, ai_handler, widget_ref):
        super().__init__()
        self.query = query
        self.cards_data = cards_data
        self.cluster_info = cluster_info
        self._handler_ref = weakref.ref(ai_handler) if ai_handler is not None else None
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None
        self._request_id = "search_%s" % id(self)
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def _generate_cluster_labels(self):
        """Generate cluster labels via LLM (runs in parallel with Tutor)."""
        try:
            try:
                from ..ai.gemini import generate_quick_answer
            except ImportError:
                from ai.gemini import generate_quick_answer
            return generate_quick_answer(
                self.query, self.cards_data, cluster_labels=self.cluster_info
            )
        except Exception:
            logger.exception("Cluster labeling failed for: %s", self.query)
            return {"clusterLabels": {}, "clusterSummaries": {}, "cardRefs": {}}

    def run(self):
        handler = self._handler_ref() if self._handler_ref else None
        if handler is None:
            logger.warning("SmartSearchAgentThread: handler destroyed, aborting")
            return

        try:
            # Wire up pipeline/msg_event callbacks (same pattern as AIRequestThread)
            def pipeline_callback(step, status, data):
                if not self._cancelled:
                    self.pipeline_signal.emit(self._request_id, step, status, data or {})

            def msg_event_callback(event_type, data):
                if not self._cancelled:
                    self.msg_event_signal.emit(self._request_id, event_type, data or {})

            handler._pipeline_signal_callback = pipeline_callback
            handler._msg_event_callback = msg_event_callback

            # Run Research agent + cluster labeling in parallel
            from concurrent.futures import ThreadPoolExecutor

            with ThreadPoolExecutor(max_workers=2) as pool:
                # 1. Research agent answer (blocking, streams via callbacks)
                tutor_future = pool.submit(
                    handler.dispatch_smart_search,
                    query=self.query,
                    cards_data=self.cards_data,
                    cluster_info=self.cluster_info,
                    request_id=self._request_id,
                )

                # 2. Cluster labels (parallel LLM call)
                label_future = None
                if self.cluster_info:
                    label_future = pool.submit(self._generate_cluster_labels)

                # Wait for both
                tutor_future.result()  # raises on error

                if label_future and not self._cancelled:
                    label_result = label_future.result()
                    self.result_signal.emit(json.dumps({
                        "type": "graph.quickAnswer",
                        "data": {
                            "clusterLabels": label_result.get("clusterLabels", {}),
                            "clusterSummaries": label_result.get("clusterSummaries", {}),
                            "cardRefs": label_result.get("cardRefs", {}),
                        }
                    }))

            if not self._cancelled:
                self.finished_signal.emit(self._request_id)

        except Exception as e:
            if not self._cancelled:
                logger.exception("SmartSearchAgentThread failed: %s", self.query)
                self.error_signal.emit(self._request_id, str(e))
                # Emit error to frontend so user sees feedback
                self.result_signal.emit(json.dumps({
                    "type": "graph.quickAnswer",
                    "data": {"answer": "", "answerable": False, "clusterLabels": {}}
                }))
        finally:
            if handler:
                handler._pipeline_signal_callback = None
                handler._msg_event_callback = None


class ChatbotWidget(QWidget):
    """Web-basierte Chat-UI über QWebEngineView"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.config = get_config()
        self.web_view = None
        self.current_request = None  # Für Cancel-Funktionalität
        self.message_timer = None  # Timer für Message-Polling
        self.bridge = WebBridge(self)  # Bridge-Instanz für Deck-Zugriff
        self.card_tracker = None  # Card-Tracker wird später initialisiert
        self.current_card_context = None  # Aktueller Karten-Kontext
        self._active_subagent_thread = None
        self.setup_ui()
        # Card-Tracking wird nach UI-Setup initialisiert
        if self.web_view:
            self.card_tracker = CardTracker(self)

        # Idle detection timer — emits app_idle event to EventBus every minute
        self._idle_timer = QTimer()
        self._idle_timer.timeout.connect(self._emit_idle)
        self._idle_timer.start(PLUSI_WAKE_CHECK_MS)
    def _safe_json_loads(self, data, default=None, context=""):
        """Parse JSON safely, returning default on failure."""
        try:
            return json.loads(data) if data else (default if default is not None else {})
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("JSON parse error in %s: %s", context, e)
            return default if default is not None else {}

    def setup_ui(self):
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        if QWebEngineView is None:
            fallback = QLabel("QWebEngineView nicht verfügbar. Bitte installieren Sie QtWebEngine.")
            layout.addWidget(fallback)
            self.setLayout(layout)
            return

        self.web_view = QWebEngineView()
        self.web_view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)

        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", "index.html")
        import time
        url = QUrl.fromLocalFile(html_path)
        url.setQuery(f"v={int(time.time())}")
        self.web_view.loadFinished.connect(self._init_js_bridge)
        self.web_view.loadFinished.connect(self.push_initial_state)
        self.web_view.page().featurePermissionRequested.connect(self._handle_permission_request)
        self.web_view.load(url)

        layout.addWidget(self.web_view)
        self.setLayout(layout)
    
    def _handle_permission_request(self, origin, feature):
        """Auto-grant microphone permission for Plusi voice."""
        try:
            from PyQt6.QtWebEngineCore import QWebEnginePage
        except ImportError:
            try:
                from PyQt5.QtWebEngineWidgets import QWebEnginePage
            except ImportError:
                return
        if feature == QWebEnginePage.Feature.MediaAudioCapture:
            self.web_view.page().setFeaturePermission(
                origin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser
            )
            logger.info("Granted microphone permission for Plusi voice")
        else:
            self.web_view.page().setFeaturePermission(
                origin, feature, QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
            )

    def _init_js_bridge(self):
        """Initialisiert die JavaScript-Bridge mit Message-Queue System"""
        # Erstelle globales JavaScript-Objekt für Message-Queue
        js_code = """
        window.ankiBridge = {
            messageQueue: [],
            addMessage: function(type, data) {
                this.messageQueue.push({type: type, data: data, timestamp: Date.now()});
            },
            getMessages: function() {
                const messages = this.messageQueue.slice();
                this.messageQueue = [];
                return messages;
            }
        };
        console.log('ankiBridge initialisiert (Message-Queue System)');
        """
        self.web_view.page().runJavaScript(js_code)
        logger.info("JavaScript Bridge initialisiert (Message-Queue System)")
        
        # Starte Polling für Nachrichten
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self._poll_messages)
        self.message_timer.start(POLL_INTERVAL_MS)
        logger.info("Message-Polling gestartet (%sms Intervall)", POLL_INTERVAL_MS)

    def _poll_messages(self):
        """Pollt JavaScript nach neuen Nachrichten"""
        js_code = """
        (function() {
            if (window.ankiBridge && window.ankiBridge.getMessages) {
                return JSON.stringify(window.ankiBridge.getMessages());
            }
            return '[]';
        })();
        """
        
        def handle_messages(result):
            try:
                messages = json.loads(result) if result else []
                for msg in messages:
                    self._handle_js_message(msg.get('type'), msg.get('data'))
            except Exception as e:
                logger.exception("Fehler beim Verarbeiten von Nachrichten: %s", e)
        
        self.web_view.page().runJavaScript(js_code, handle_messages)

    def _emit_idle(self):
        """Emit app_idle event to EventBus if the app has been inactive."""
        try:
            from ..plusi.event_bus import EventBus
            bus = EventBus.get()
            idle = bus.idle_minutes()
            if idle >= 1:
                bus.emit("app_idle", {"idle_minutes": int(idle)})
        except Exception:
            pass

    def _send_to_frontend(self, payload_type, data, extra=None):
        """Helper: Sendet Payload an das React-Frontend via ankiReceive."""
        payload = {"type": payload_type, "data": data}
        if extra:
            payload.update(extra)
        payload_json = json.dumps(payload)
        js = f"""(function() {{
            var p = {payload_json};
            if (typeof window.ankiReceive === 'function') {{
                window.ankiReceive(p);
            }} else {{
                console.error('[_send_to_frontend] window.ankiReceive NOT FOUND for type:', '{payload_type}');
            }}
        }})();"""
        self.web_view.page().runJavaScript(js)

    def _send_to_frontend_with_event(self, payload_type, payload_dict, event_name):
        """Helper: Sendet via ankiReceive UND CustomEvent (für Reliability)."""
        payload_json = json.dumps(payload_dict, ensure_ascii=False)
        js = f"""(function() {{
            var p = {payload_json};
            if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
            window.dispatchEvent(new CustomEvent('{event_name}', {{detail: p}}));
        }})();"""
        self.web_view.page().runJavaScript(js)

    def _handle_js_message(self, msg_type, data):
        """Verarbeitet Nachrichten von JavaScript — dispatcht an Handler-Methoden."""
        handler = self._get_message_handler(msg_type)
        if handler:
            try:
                handler(data)
            except Exception as e:
                logger.exception("_handle_js_message: Fehler bei %s: %s", msg_type, e)
        else:
            logger.debug("_handle_js_message: Unbekannter Typ: %s", msg_type)

    def _get_message_handler(self, msg_type):
        """Gibt den Handler für einen Message-Typ zurück."""
        handlers = {
            # AI & Chat
            'sendMessage': self._msg_send_message,
            'cancelRequest': self._msg_cancel_request,
            'extractInsights': self._msg_extract_insights,
            'fetchModels': self._msg_fetch_models,
            # Panel & Navigation
            'closePanel': self._msg_close_panel,
            'advanceCard': self._msg_advance_card,
            'openSettings': self._msg_toggle_settings,
            'settings.toggle': self._msg_toggle_settings,
            'setModel': lambda d: self.set_model_from_ui(d) if isinstance(d, str) else None,
            # Card Operations
            'previewCard': self._msg_preview_card,
            'openPreview': self._msg_open_preview,
            'goToCard': lambda d: self._go_to_card(int(d)) if d else None,
            'showAnswer': lambda d: self.bridge.showAnswer(),
            'hideAnswer': lambda d: self.bridge.hideAnswer(),
            'navigateToCard': self._msg_navigate_to_card,
            'getCardDetails': self._msg_get_card_details,
            # Multiple Choice
            'saveMultipleChoice': self._msg_save_multiple_choice,
            'loadMultipleChoice': self._msg_load_multiple_choice,
            'hasMultipleChoice': self._msg_has_multiple_choice,
            # Deck Operations
            'getCurrentDeck': lambda d: self._send_to_frontend("currentDeck", self._safe_json_loads(self.bridge.getCurrentDeck(), default={}, context="getCurrentDeck")),
            'getAvailableDecks': lambda d: self._send_to_frontend("availableDecks", self._safe_json_loads(self.bridge.getAvailableDecks(), default=[], context="getAvailableDecks")),
            'openDeck': lambda d: self.bridge.openDeck(int(d)) if isinstance(d, (int, float)) else None,
            'openDeckBrowser': lambda d: self.bridge.openDeckBrowser(),
            'getDeckStats': self._msg_get_deck_stats,
            'generateSectionTitle': self._msg_generate_section_title,
            # Card Sessions (SQLite)
            'loadCardSession': self._msg_load_card_session,
            'saveCardSession': self._msg_save_card_session,
            'saveCardMessage': self._msg_save_card_message,
            'saveCardSection': self._msg_save_card_section,
            'getCardInsights': self._msg_get_card_insights,
            'saveCardInsights': self._msg_save_card_insights,
            'getCardRevlog': self._msg_get_card_revlog,
            'markInsightsSeen': self._msg_mark_insights_seen,
            # Config & Settings
            'saveSettings': self._msg_save_settings,
            'getCurrentConfig': self._msg_get_current_config,
            'getAITools': self._msg_get_ai_tools,
            'saveAITools': self._msg_save_ai_tools,
            'saveMascotEnabled': self._msg_save_mascot_enabled,
            'saveSubagentEnabled': self._msg_save_subagent_enabled,
            'saveWorkflowConfig': self._msg_save_workflow_config,
            'getResearchSources': self._msg_get_research_sources,
            'saveResearchSources': self._msg_save_research_sources,
            'getEmbeddingStatus': self._msg_get_embedding_status,
            'getPlusiMenuData': self._msg_get_plusi_menu_data,
            'savePlusiAutonomy': self._msg_save_plusi_autonomy,
            'saveTheme': self._msg_save_theme,
            'getTheme': self._msg_get_theme,
            'saveSystemQuality': self._msg_save_system_quality,
            'getToolRegistry': self._msg_get_tool_registry,
            # Auth
            'authenticate': self._msg_authenticate,
            'getAuthStatus': lambda d: self._send_to_frontend("authStatusLoaded", self._safe_json_loads(self.bridge.getAuthStatus(), default={}, context="getAuthStatus")),
            'getAuthToken': lambda d: self._send_to_frontend("authTokenLoaded", self._safe_json_loads(self.bridge.getAuthToken(), default={}, context="getAuthToken")),
            'refreshAuth': lambda d: self._send_to_frontend("authRefreshResult", self._safe_json_loads(self.bridge.refreshAuth(), default={}, context="refreshAuth")),
            'logout': lambda d: self.bridge.logout(),
            'startLinkAuth': lambda d: self.bridge.startLinkAuth(),
            'handleAuthDeepLink': self._msg_handle_auth_deep_link,
            # Media
            'fetchImage': self._msg_fetch_image,
            # Voice
            'voiceAudio': self._msg_voice_audio,
            # Utilities
            'openUrl': lambda d: self.bridge.openUrl(d.get('url', '') if isinstance(d, dict) else d),
            'pycmd': self._msg_pycmd,
            'debugLog': self._msg_debug_log,
            'plusiPanel': self._msg_plusi_settings,
            'plusiSettings': self._msg_plusi_settings,
            # subagentDirect removed — agents use sendMessage with agent param (agent-kanal-paradigma)
            'plusiLike': self._msg_plusi_like,
            'resetPlusi': self._msg_reset_plusi,
            'textFieldFocus': self._msg_text_field_focus,
            'jsError': self._msg_js_error,
            # Deck actions (from MainViewWidget — SP2 unification)
            'deck.study': self._msg_study_deck,
            'deck.select': self._msg_select_deck,
            'deck.create': self._msg_create_deck,
            'deck.import': self._msg_import_deck,
            'deck.options': self._msg_open_deck_options,
            # View actions
            'view.navigate': self._msg_navigate,
            # Stats
            'stats.open': self._msg_open_stats,
            'getStatistikData': self._msg_get_statistik_data,
            'getDeckTrajectory': self._msg_get_deck_trajectory,
            'getDeckSessionSuggestion': self._msg_get_deck_session_suggestion,
            'getDeckMastery': self._msg_get_deck_mastery,
            # Focus CRUD
            'saveFocus': self._msg_save_focus,
            'getFocuses': self._msg_get_focuses,
            'deleteFocus': self._msg_delete_focus,
            # Card review (React ReviewerView)
            'card.flip': self._msg_flip_card,
            'card.rate': self._msg_rate_card,
            'card.evaluate': self._msg_evaluate_answer,
            'card.mc.generate': self._msg_generate_mc,
            'card.requestCurrent': self._msg_request_current_card,
            # Settings sidebar actions (forwarded from main bridge)
            'sidebarCopyLogs': self._msg_copy_logs,
            'sidebarGetStatus': self._msg_get_sidebar_status,
            'sidebarGetIndexingStatus': self._msg_get_indexing_status,
            'sidebarGetKgMetrics': self._msg_get_kg_metrics,
            'sidebarSetTheme': self._msg_set_theme,
            'sidebarOpenNativeSettings': lambda d: __import__('aqt', fromlist=['mw']).mw.onPrefs(),
            'sidebarOpenUpgrade': self._msg_sidebar_upgrade,
            'sidebarConnect': self._msg_sidebar_connect,
            'sidebarLogout': self._msg_sidebar_logout,
            'sidebarGetRemoteQR': self._msg_get_remote_qr,
            'sidebarRefreshRemoteQR': self._msg_refresh_remote_qr,
            'sidebarGetRemoteStatus': self._msg_get_remote_status,
            # Knowledge Graph
            'getGraphData': self._msg_get_graph_data,
            'getTermCards': self._msg_get_term_cards,
            'getGraphStatus': self._msg_get_graph_status,
            'getCardKGTerms': self._msg_get_card_kg_terms,
            'getTermDefinition': self._msg_get_term_definition,
            'searchGraph': self._msg_search_graph,
            'getDeckCrossLinks': self._msg_get_deck_cross_links,
            'startTermStack': self._msg_start_term_stack,
            'searchCards': self._msg_search_cards,
            'getCardImages': self._msg_get_card_images,
            'searchKgSubgraph': self._msg_search_kg_subgraph,
            'subClusterCards': self._msg_sub_cluster,
            'quickAnswer': lambda data: None,  # Reserved — triggered internally by searchCards
        }
        return handlers.get(msg_type)

    # --- Message Handler Methods ---

    def _msg_send_message(self, data):
        if isinstance(data, str):
            self.current_request = data
            self.handle_message_from_ui(data, history=None, mode='compact')
        elif isinstance(data, dict):
            message = data.get('message', '')
            self.current_request = message
            self.handle_message_from_ui(
                message, history=data.get('history'), mode=data.get('mode', 'compact'),
                request_id=data.get('requestId'),
                agent_name=data.get('agent'))

    def _msg_cancel_request(self, data):
        if not self.current_request:
            return
        self.current_request = None
        if hasattr(self, '_ai_thread') and self._ai_thread:
            if hasattr(self._ai_thread, 'cancel'):
                self._ai_thread.cancel()
            self._ai_thread.quit()
            self._ai_thread.wait(1000)
            self._ai_thread = None
        self._send_to_frontend("bot", None, {"message": "Anfrage abgebrochen.", "type": "bot"})

    def _msg_close_panel(self, data):
        self.close_panel()
        try:
            from aqt import mw
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval('if(window.setChatOpen) setChatOpen(false);')
        except (AttributeError, RuntimeError):
            pass

    def _msg_advance_card(self, data):
        self.close_panel()
        try:
            from aqt import mw
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval(
                    'if(window.setChatOpen) setChatOpen(false);'
                    'if(window.rateCard) rateCard(window.autoRateEase || 3);')
        except (AttributeError, RuntimeError) as e:
            logger.error("advanceCard error: %s", e)

    def _msg_preview_card(self, data):
        if data and self.bridge and hasattr(self.bridge, 'previewCard'):
            self.bridge.previewCard(str(data))

    def _msg_open_preview(self, data):
        card_id = data.get('cardId') if isinstance(data, dict) else data
        try:
            card_id = int(card_id)
        except (ValueError, TypeError):
            logger.warning("_msg_open_preview: Ungültige card_id: %s", card_id)
            return
        from ..custom_reviewer import open_preview
        open_preview(card_id)

    def _msg_navigate_to_card(self, data):
        if isinstance(data, str) and data in ('prev', 'next'):
            if mw and mw.reviewer and hasattr(mw.reviewer, 'web'):
                mw.reviewer.web.eval(f"pycmd('navigate:{data}');")
        else:
            card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
            if card_id and mw and mw.reviewer:
                mw.reviewer.web.eval(f"pycmd('navigate:{card_id}');")

    def _msg_get_card_details(self, data):
        if isinstance(data, dict) and data.get('cardId'):
            result = self.bridge.getCardDetails(str(data['cardId']))
            try:
                parsed = json.loads(result)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse bridge response for getCardDetails: %s", e)
                parsed = {}
            self._send_to_frontend("cardDetails", parsed, {"callbackId": data.get('callbackId')})

    def _msg_save_multiple_choice(self, data):
        if isinstance(data, dict) and data.get('cardId') and data.get('quizDataJson'):
            result = self.bridge.saveMultipleChoice(int(data['cardId']), data['quizDataJson'])
            try:
                parsed = json.loads(result)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse bridge response for saveMultipleChoice: %s", e)
                parsed = {}
            self._send_to_frontend("saveMultipleChoiceResult", parsed, {"callbackId": data.get('callbackId')})

    def _msg_load_multiple_choice(self, data):
        if isinstance(data, dict) and data.get('cardId'):
            result = self.bridge.loadMultipleChoice(int(data['cardId']))
            try:
                parsed = json.loads(result)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse bridge response for loadMultipleChoice: %s", e)
                parsed = {}
            self._send_to_frontend("loadMultipleChoiceResult", parsed, {"callbackId": data.get('callbackId')})

    def _msg_has_multiple_choice(self, data):
        if isinstance(data, dict) and data.get('cardId'):
            result = self.bridge.hasMultipleChoice(int(data['cardId']))
            try:
                parsed = json.loads(result)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse bridge response for hasMultipleChoice: %s", e)
                parsed = {}
            self._send_to_frontend("hasMultipleChoiceResult", parsed, {"callbackId": data.get('callbackId')})

    def _msg_get_deck_stats(self, data):
        if isinstance(data, (int, float)):
            deck_id = int(data)
            result = self.bridge.getDeckStats(deck_id)
            try:
                parsed = json.loads(result)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse bridge response for getDeckStats: %s", e)
                parsed = {}
            self._send_to_frontend("deckStats", parsed, {"deckId": deck_id})

    def _msg_generate_section_title(self, data):
        if isinstance(data, dict):
            result = self.bridge.generateSectionTitle(data.get('question', ''), data.get('answer', ''))
            try:
                parsed = json.loads(result)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse bridge response for generateSectionTitle: %s", e)
                parsed = {}
            self._send_to_frontend("sectionTitleGenerated", parsed)

    def _msg_load_card_session(self, data):
        from ..storage.card_sessions import load_card_session
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = load_card_session(card_id)
        payload = {"type": "cardSessionLoaded", "cardId": card_id, "data": result}
        self._send_to_frontend_with_event("cardSessionLoaded", payload, "ankiCardSessionLoaded")

    def _msg_save_card_session(self, data):
        from ..storage.card_sessions import save_card_session
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse data for saveCardSession: %s", e)
                return
        card_id = data.get('cardId') or data.get('card_id')
        if card_id:
            save_card_session(int(card_id), data)

    def _msg_save_card_message(self, data):
        from ..storage.card_sessions import save_message
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse data for saveCardMessage: %s", e)
                return
        card_id = data.get('cardId') or data.get('card_id')
        if card_id:
            save_message(int(card_id), data.get('message', data))

    def _msg_save_card_section(self, data):
        from ..storage.card_sessions import save_section
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning("Failed to parse data for saveCardSection: %s", e)
                return
        card_id = data.get('cardId') or data.get('card_id')
        if card_id:
            save_section(int(card_id), data.get('section', data))

    def _msg_get_card_insights(self, data):
        from ..storage.card_sessions import load_insights
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = load_insights(card_id)
        payload = {"type": "cardInsightsLoaded", "cardId": card_id, "success": True, "data": result}
        self._send_to_frontend_with_event("cardInsightsLoaded", payload, "ankiCardInsightsLoaded")

    def _msg_save_card_insights(self, data):
        from ..storage.card_sessions import save_insights
        card_id = data.get('cardId')
        insights_data = data.get('insights')
        if card_id and insights_data:
            save_insights(int(card_id), insights_data)

    def _msg_get_card_revlog(self, data):
        from ..storage.card_sessions import get_card_revlog
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = get_card_revlog(card_id)
        payload = {"type": "cardRevlogLoaded", "cardId": card_id, "success": True, "data": result}
        self._send_to_frontend_with_event("cardRevlogLoaded", payload, "ankiCardRevlogLoaded")

    def _msg_extract_insights(self, data):
        card_id = data.get('cardId')
        card_context = data.get('cardContext', {})
        messages = data.get('messages', [])
        existing_insights = data.get('existingInsights', {"version": 1, "insights": []})
        performance_data = data.get('performanceData')

        if hasattr(self, '_extraction_thread') and self._extraction_thread and self._extraction_thread.isRunning():
            if self._extraction_thread.card_id == card_id:
                self._extraction_thread.cancel()
                self._extraction_thread.wait(1000)

        def _on_done(cid, result_json):
            payload = {"type": "insightExtractionComplete", "cardId": cid, "success": True, "insights": json.loads(result_json)}
            self._send_to_frontend_with_event("insightExtractionComplete", payload, "ankiInsightExtractionComplete")

        def _on_error(cid, err):
            payload = {"type": "insightExtractionComplete", "cardId": cid, "success": False, "error": err}
            self._send_to_frontend_with_event("insightExtractionComplete", payload, "ankiInsightExtractionComplete")

        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        self._extraction_thread = InsightExtractionThread(
            card_id, card_context, messages, existing_insights, performance_data, get_ai_handler())
        self._extraction_thread.finished_signal.connect(_on_done)
        self._extraction_thread.error_signal.connect(_on_error)
        self._extraction_thread.start()

    def _msg_mark_insights_seen(self, data):
        """Mark all current insights as seen (update seen_hashes)."""
        from ..storage.card_sessions import load_insights, save_insights
        from ..storage.insights import insight_hash
        card_id = data.get('cardId') if isinstance(data, dict) else int(data)
        if not card_id:
            return
        current = load_insights(int(card_id))
        hashes = [insight_hash(ins.get('text', '')) for ins in current.get('insights', [])]
        current['seen_hashes'] = hashes
        save_insights(int(card_id), current)

    def _msg_save_settings(self, data):
        if isinstance(data, dict):
            self._save_settings(data.get('api_key', ''), data.get('provider', 'google'), data.get('model_name', ''))

    def _msg_get_current_config(self, data):
        config = get_config(force_reload=True)
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        config_data = {
            "api_key": config.get("api_key", "").strip(),
            "provider": "google",
            "model": config.get("model_name", ""),
            "mascot_enabled": config.get("mascot_enabled", False),
            "ai_tools": config.get("ai_tools", {
                "images": True, "diagrams": True, "card_search": True,
                "statistics": True, "molecules": False, "compact": True,
            }),
            "theme": config.get("theme", "dark"),
            "resolvedTheme": get_resolved_theme(),
        }
        self._send_to_frontend_with_event(
            "configLoaded", {"type": "configLoaded", "data": config_data},
            "ankiConfigLoaded")

        # Also push subagent registry (frontend is guaranteed ready at this point)
        try:
            try:
                from ..ai.agents import get_registry_for_frontend
            except ImportError:
                from ai.agents import get_registry_for_frontend
            registry_payload = {
                'type': 'subagent_registry',
                'agents': get_registry_for_frontend(config)
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(registry_payload)});"
            )
        except Exception as e:
            logger.error("Failed to push subagent registry on config: %s", e)

    def _msg_fetch_models(self, data):
        if not isinstance(data, dict):
            return
        provider = data.get('provider', 'google')
        api_key = data.get('api_key', '').strip()
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        try:
            models = get_ai_handler().fetch_available_models(provider, api_key)
            self._send_to_frontend("modelsLoaded", {
                "success": True, "models": models or [],
                "error": None if models else "Keine Modelle gefunden. Bitte API-Key prüfen."})
        except Exception as e:
            self._send_to_frontend("modelsLoaded", {"success": False, "models": [], "error": str(e)})

    def _msg_get_ai_tools(self, data):
        tools = json.loads(self.bridge.getAITools())
        self._send_to_frontend_with_event(
            "aiToolsLoaded", {"type": "aiToolsLoaded", "data": tools},
            "ankiAiToolsLoaded")
        self.web_view.page().runJavaScript(f"window._cachedAITools = {json.dumps(tools)};")

    def _msg_save_ai_tools(self, data):
        if isinstance(data, str):
            self.bridge.saveAITools(data)
            try:
                tools = json.loads(data)
                self.web_view.page().runJavaScript(f"window._cachedAITools = {json.dumps(tools)};")
            except json.JSONDecodeError:
                pass

    def _msg_save_mascot_enabled(self, data):
        enabled = bool(data)
        update_config(mascot_enabled=enabled)
        self.config = get_config(force_reload=True)
        self._send_to_frontend("mascotEnabledSaved", {"enabled": enabled})
        # Dynamically hide/show the native Plusi dock in reviewer/deckBrowser webviews
        try:
            try:
                from ..plusi.dock import hide_dock, get_plusi_dock_injection, _get_active_webview
            except ImportError:
                from plusi.dock import hide_dock, get_plusi_dock_injection, _get_active_webview
            if not enabled:
                hide_dock()
            else:
                # Re-inject dock into active webview when Plusi is turned back on
                web = _get_active_webview()
                if web:
                    injection = get_plusi_dock_injection()
                    if injection:
                        # Check if dock already exists before injecting
                        js = (
                            "if(!document.getElementById('plusi-dock')){"
                            "var _r=document.createRange();"
                            "var _f=_r.createContextualFragment(%s);"
                            "document.body.appendChild(_f);}"
                        ) % json.dumps(injection)
                        web.page().runJavaScript(js)
        except (ImportError, AttributeError, RuntimeError) as e:
            logger.warning("Failed to toggle Plusi dock: %s", e)

    def _msg_save_subagent_enabled(self, data):
        """Toggle any subagent on/off by its enabled_key."""
        try:
            name = data.get('name', '') if isinstance(data, dict) else ''
            enabled = bool(data.get('enabled', False)) if isinstance(data, dict) else False
            # Map subagent name to its config enabled_key
            try:
                from ..ai.agents import AGENT_REGISTRY
            except ImportError:
                from ai.agents import AGENT_REGISTRY
            agent = AGENT_REGISTRY.get(name)
            if agent:
                update_config(**{agent.enabled_key: enabled})
                self.config = get_config(force_reload=True)
                logger.info("Subagent %s %s", name, "enabled" if enabled else "disabled")
            else:
                logger.warning("Unknown subagent: %s", name)
        except Exception as e:
            logger.exception("saveSubagentEnabled error: %s", e)

    def _msg_save_workflow_config(self, data):
        """Save workflow or slot mode change to config."""
        try:
            agent_name = data.get('agent') if isinstance(data, dict) else None
            workflow_name = data.get('workflow') if isinstance(data, dict) else None
            slot_ref = data.get('slot')  # None if toggling whole workflow
            mode = data.get('mode') if isinstance(data, dict) else None

            if not agent_name or not workflow_name:
                logger.warning("saveWorkflowConfig: missing agent or workflow in data: %s", data)
                return

            config = get_config()
            wf_config = config.get('workflow_config', {})
            agent_wf = wf_config.setdefault(agent_name, {})
            wf = agent_wf.setdefault(workflow_name, {})

            if slot_ref:
                wf[slot_ref] = mode
            else:
                wf['_enabled'] = (mode != 'off')

            update_config(workflow_config=wf_config)
            logger.info("Saved workflow config: %s/%s/%s = %s", agent_name, workflow_name, slot_ref or '_enabled', mode)
        except Exception as e:
            logger.exception("saveWorkflowConfig error: %s", e)

    def _msg_get_research_sources(self, data):
        """Return current research source toggles."""
        config = get_config()
        sources = config.get('research_sources', {'pubmed': True, 'wikipedia': True})
        self._send_to_frontend('researchSourcesLoaded', sources)

    def _msg_save_research_sources(self, data):
        """Save research source toggles to config."""
        try:
            if isinstance(data, dict):
                update_config(research_sources=data)
                self.config = get_config(force_reload=True)
                logger.info("Research sources updated: %s", data)
        except Exception as e:
            logger.exception("saveResearchSources error: %s", e)

    def _msg_get_embedding_status(self, data):
        """Return embedding indexing progress to frontend."""
        try:
            try:
                from ..storage.card_sessions import count_embeddings
            except ImportError:
                from storage.card_sessions import count_embeddings

            embedded = count_embeddings()

            total = 0
            try:
                from aqt import mw as _mw
                if _mw and _mw.col:
                    total = len(_mw.col.find_cards(""))
            except (AttributeError, RuntimeError) as e:
                logger.debug("Could not get total card count for embedding status: %s", e)

            is_running = False
            try:
                try:
                    from .. import get_embedding_manager
                except ImportError:
                    from __init__ import get_embedding_manager
                mgr = get_embedding_manager()
                if mgr and mgr._background_thread and mgr._background_thread.isRunning():
                    is_running = True
            except (ImportError, AttributeError, RuntimeError) as e:
                logger.debug("Could not get embedding manager status: %s", e)

            result = {"totalCards": total, "embeddedCards": embedded, "isRunning": is_running}
            self._send_to_frontend_with_event(
                "embeddingStatusLoaded", {"type": "embeddingStatusLoaded", "data": result},
                "ankiEmbeddingStatusLoaded")
        except Exception as e:
            logger.exception("_msg_get_embedding_status error: %s", e)
            result = {"totalCards": 0, "embeddedCards": 0, "isRunning": False}
            self._send_to_frontend_with_event(
                "embeddingStatusLoaded", {"type": "embeddingStatusLoaded", "data": result},
                "ankiEmbeddingStatusLoaded")

    def _msg_get_plusi_menu_data(self, data=None):
        """Return Plusi menu data: diary + subscriptions + budget."""
        try:
            from ..plusi.memory import PlusiMemory
            from ..plusi.budget import PlusicBudget
            from ..plusi.event_bus import EventBus

            mem = PlusiMemory()
            budget = PlusicBudget()
            bus = EventBus.get()

            diary = mem.load_diary(limit=50)
            subs = bus.list_subscriptions()
            budget_status = budget.status()

            # Get last mood from diary or default
            last_mood = diary[0]['mood'] if diary else 'neutral'

            result = {
                'diary': diary,
                'subscriptions': [{'name': s.get('name', ''), 'event': s.get('event', ''),
                                   'condition': str(s.get('condition', '')),
                                   'prompt': s.get('wake_prompt', s.get('prompt', ''))}
                                  for s in subs],
                'budget': budget_status,
                'mood': last_mood,
            }

            self._send_to_frontend_with_event('plusiMenuData', result, 'ankiPlusiMenuDataLoaded')
        except Exception as e:
            logger.exception("plusi menu data failed: %s", e)
            self._send_to_frontend_with_event('plusiMenuData', {
                'diary': [], 'subscriptions': [], 'budget': {'used': 0, 'cap': 20, 'remaining': 20},
                'mood': 'neutral',
            }, 'ankiPlusiMenuDataLoaded')

    def _msg_save_plusi_autonomy(self, data):
        """Save Plusi autonomy config (token budget, capabilities)."""
        try:
            try:
                from ..config import update_config
            except ImportError:
                from config import update_config
            if isinstance(data, dict):
                update_config(plusi_autonomy=data)
        except Exception:
            logger.exception("Failed to save Plusi autonomy config")

    def _msg_save_theme(self, data):
        """Save theme setting and push it back to all web views."""
        if isinstance(data, dict):
            theme = data.get("theme", data.get("value", str(data)))
        else:
            theme = str(data) if data else "dark"
        theme = theme.strip().lower()
        if theme not in ("dark", "light", "system"):
            logger.warning("Invalid theme value: %s, falling back to dark", theme)
            theme = "dark"
        logger.info("Saving theme: %s", theme)
        update_config(theme=theme)
        self.config = get_config(force_reload=True)
        self._apply_theme_to_webview()

    def _msg_get_theme(self, data):
        """Return current (resolved) theme to the frontend."""
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        resolved = get_resolved_theme()
        config = get_config(force_reload=True)
        stored = config.get("theme", "dark")
        self._send_to_frontend("themeLoaded", {"theme": stored, "resolvedTheme": resolved})

    def _msg_save_system_quality(self, data):
        """Save system quality mode (standard/deep)."""
        quality = data.get('quality', 'standard') if isinstance(data, dict) else data
        self.bridge.saveSystemQuality(quality if isinstance(quality, str) else 'standard')

    def _msg_get_tool_registry(self, data):
        """Return all tools from all agents for the frontend registry."""
        try:
            try:
                from ..ai.tools import registry as tool_registry
                from ..ai.agents import AGENT_REGISTRY
            except ImportError:
                from ai.tools import registry as tool_registry
                from ai.agents import AGENT_REGISTRY
            config = get_config()
            all_tools = set()
            for agent in AGENT_REGISTRY.values():
                all_tools.update(agent.tools)
            tools_data = tool_registry.get_tools_for_frontend(list(all_tools), config)
            payload = json.dumps(tools_data)
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({{type:'ankiToolRegistryLoaded', data:{payload}}});"
            )
        except Exception as e:
            logger.exception("getToolRegistry error: %s", e)

    def _apply_theme_to_webview(self):
        """Push the current theme to ALL active webviews and refresh Qt stylesheet."""
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        config = get_config(force_reload=True)
        stored_theme = config.get("theme", "dark")
        resolved = get_resolved_theme()

        # JS to set data-theme attribute on any webview + force CSS repaint
        set_theme_js = f"""(function() {{
            document.documentElement.setAttribute('data-theme', '{resolved}');
            document.documentElement.style.colorScheme = '{resolved}';
            document.body && (document.body.style.transition = 'none');
            void document.body?.offsetHeight;
        }})();"""

        # JS for the chat panel (also notifies React)
        chat_js = f"""
        (function() {{
            document.documentElement.setAttribute('data-theme', '{resolved}');
            if (typeof window.ankiReceive === 'function') {{
                window.ankiReceive({{
                    type: 'themeChanged',
                    data: {{ theme: '{stored_theme}', resolvedTheme: '{resolved}' }}
                }});
            }}
        }})();
        """

        # 1. Chat panel webview
        if self.web_view:
            self.web_view.page().runJavaScript(chat_js)

        # 2. MainViewWidget (fullscreen React app)
        try:
            from .main_view import get_main_view
            mv = get_main_view()
            if mv and mv.web_view and mv.web_view is not self.web_view:
                mv.web_view.page().runJavaScript(chat_js)
        except (ImportError, AttributeError, RuntimeError):
            pass

        # 3. Plusi panel webview
        try:
            from ..plusi import panel as plusi_panel
            if hasattr(plusi_panel, '_panel_widget') and plusi_panel._panel_widget:
                pw = plusi_panel._panel_widget
                if hasattr(pw, 'web_view') and pw.web_view:
                    pw.web_view.page().runJavaScript(set_theme_js)
        except (ImportError, AttributeError, RuntimeError):
            pass

        # 6. Re-apply Qt global theme stylesheet with new token colors
        try:
            from .global_theme import apply_global_dark_theme, _app_initialized
            if _app_initialized:
                apply_global_dark_theme()
        except (ImportError, AttributeError, RuntimeError) as e:
            logger.debug("Could not re-apply global theme on theme change: %s", e)

        # 7. QDockWidget removed — sidebar is now inside MainViewWidget

    def _msg_authenticate(self, data):
        if isinstance(data, dict):
            result = self.bridge.authenticate(data.get('token', ''), data.get('refreshToken', ''))
            if json.loads(result).get('success'):
                self._send_to_frontend("auth_success", None, {"type": "auth_success", "message": "Authentifizierung erfolgreich"})

    def _msg_handle_auth_deep_link(self, data):
        if isinstance(data, str):
            result = self.bridge.handleAuthDeepLink(data)
            if json.loads(result).get('success'):
                self._send_to_frontend("auth_success", None, {"type": "auth_success", "message": "Authentifizierung erfolgreich"})

    def _msg_fetch_image(self, data):
        if isinstance(data, str):
            result = self.bridge.fetchImage(data)
            payload = {"type": "imageLoaded", "url": data, "data": json.loads(result)}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")

    def _msg_debug_log(self, data):
        import os
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.cursor', 'debug.log')
        try:
            os.makedirs(os.path.dirname(log_path), exist_ok=True)
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(data + '\n')
        except (OSError, IOError) as e:
            logger.debug("Could not write debug log: %s", e)

    def _msg_plusi_panel(self, data):
        """Legacy: redirects to settings."""
        self._msg_plusi_settings(data)

    def _msg_plusi_settings(self, data):
        try:
            from aqt import mw
            if mw:
                mw.onPrefs()
        except (AttributeError, RuntimeError) as e:
            logger.warning("Could not open Anki preferences: %s", e)

    def _msg_plusi_like(self, data):
        """Handle like on Plusi message."""
        try:
            try:
                from ..plusi.storage import record_resonance_like
            except ImportError:
                from plusi.storage import record_resonance_like
            record_resonance_like()
            logger.info("plusi like recorded from UI")
        except Exception as e:
            logger.exception("plusi like error: %s", e)

    def _msg_reset_plusi(self, data):
        """Reset Plusi — clear all memories, diary, and history."""
        try:
            try:
                from ..plusi.storage import _get_db
            except ImportError:
                from plusi.storage import _get_db
            db = _get_db()
            db.execute("DELETE FROM plusi_memory")
            db.execute("DELETE FROM plusi_diary")
            db.execute("DELETE FROM plusi_history")
            db.commit()
            logger.info("plusi RESET: all memories, diary, and history cleared")
        except Exception as e:
            logger.exception("plusi reset error: %s", e)

    def _msg_voice_audio(self, data):
        """Handle voice audio from React: run STT → Plusi → TTS pipeline."""
        if not data or not isinstance(data, str):
            logger.warning("voice: invalid audio data")
            return

        # Prevent concurrent voice requests
        if hasattr(self, '_voice_thread') and self._voice_thread and self._voice_thread.isRunning():
            logger.warning("voice: already processing, ignoring new request")
            return

        # Show thinking state on Plusi dock
        try:
            try:
                from ..plusi.dock import sync_mood
            except ImportError:
                from plusi.dock import sync_mood
            sync_mood('thinking')
        except (ImportError, AttributeError):
            pass

        thread = VoiceThread(data)
        thread.mood_signal.connect(self._on_voice_mood)
        thread.result_signal.connect(self._on_voice_result)
        thread.error_signal.connect(self._on_voice_error)
        thread.finished.connect(lambda: self._cleanup_voice_thread())
        self._voice_thread = thread
        thread.start()

    def _on_voice_mood(self, mood):
        """Update Plusi dock mood during voice pipeline."""
        try:
            try:
                from ..plusi.dock import sync_mood
            except ImportError:
                from plusi.dock import sync_mood
            sync_mood(mood)
        except (ImportError, AttributeError):
            pass

    def _on_voice_result(self, result):
        """Send voice response audio to React frontend."""
        self._send_to_frontend_with_event(
            "plusiVoiceResponse",
            {"type": "plusiVoiceResponse", "data": result},
            "plusiVoiceResponse"
        )
        # Sync final mood
        mood = result.get('mood', 'neutral') if result else 'neutral'
        self._on_voice_mood(mood)

    def _on_voice_error(self, error_msg):
        """Handle voice pipeline error."""
        logger.error("voice pipeline error: %s", error_msg)
        self._send_to_frontend_with_event(
            "plusiVoiceResponse",
            {"type": "plusiVoiceResponse", "data": {"audio": None, "mood": "neutral", "text": ""}},
            "plusiVoiceResponse"
        )
        # Reset Plusi mood
        self._on_voice_mood('neutral')

    def _cleanup_voice_thread(self):
        """Cleanup after voice thread completes."""
        if hasattr(self, '_voice_thread'):
            self._voice_thread = None

    # subagentDirect, SubagentThread, _on_subagent_finished removed.
    # All agents now go through sendMessage with agent param (agent-kanal-paradigma).

    def _sync_plusi_integrity(self):
        """Sync integrity glow and sleep state to dock."""
        try:
            try:
                from ..plusi.storage import compute_integrity, get_memory
            except ImportError:
                from plusi.storage import compute_integrity, get_memory
            try:
                from ..plusi.dock import _get_active_webview
            except ImportError:
                from plusi.dock import _get_active_webview
            integrity = compute_integrity()
            is_sleeping = get_memory('state', 'is_sleeping', False)

            web = _get_active_webview()
            if web:
                web.page().runJavaScript(
                    f"if(window._plusiSetIntegrity) window._plusiSetIntegrity({integrity});"
                )
                sleeping_str = 'true' if is_sleeping else 'false'
                web.page().runJavaScript(
                    f"if(window._plusiSetSleeping) window._plusiSetSleeping({sleeping_str});"
                )
        except Exception as e:
            logger.exception("plusi integrity sync error: %s", e)

    def _msg_js_error(self, data):
        """Log JavaScript errors from the React frontend."""
        if isinstance(data, dict):
            logger.error("Frontend JS Error: %s\nStack: %s\nComponent: %s",
                          data.get('message', '?'), data.get('stack', ''), data.get('component', ''))
        else:
            logger.error("Frontend JS Error: %s", data)

    def _msg_text_field_focus(self, data):
        """Handle text field focus state changes from JavaScript."""
        try:
            from .shortcut_filter import get_shortcut_filter
        except ImportError:
            from ui.shortcut_filter import get_shortcut_filter
        filt = get_shortcut_filter()
        if filt:
            focused = data.get('focused', False) if isinstance(data, dict) else False
            filt.set_text_field_focus(focused, self.web_view)

    def push_initial_state(self):
        """Sendet Start-Config an die Web-UI"""
        self.config = get_config(force_reload=True)
        api_key = self.config.get("api_key", "")
        provider = "google"  # Immer Google

        # Lade Modelle live wenn API-Key vorhanden
        models = []
        if api_key.strip():
            try:
                from ..ai.handler import get_ai_handler
                ai = get_ai_handler()
                models = ai.fetch_available_models(provider, api_key)
            except Exception as e:
                logger.error("Fehler beim Laden der Modelle: %s", e)
                models = self._build_model_list()  # Fallback
        else:
            models = self._build_model_list()  # Fallback wenn kein API-Key

        # Hole aktuelles Deck-Info
        try:
            deck_info = self.bridge.getCurrentDeck()
            deck_data = json.loads(deck_info)
        except (AttributeError, RuntimeError, json.JSONDecodeError) as e:
            logger.error("Fehler beim Abrufen des Decks: %s", e)
            deck_data = {"deckId": None, "deckName": None, "isInDeck": False}

        # Resolve current theme
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        stored_theme = self.config.get("theme", "dark")
        resolved_theme = get_resolved_theme()

        payload = {
            "type": "init",
            "models": models,
            "currentModel": self.config.get("model_name", ""),
            "provider": provider,
            "hasApiKey": bool(api_key.strip()),
            "message": "Hallo! Ich bin der Anki Chatbot. Wie kann ich Ihnen helfen?",
            "currentDeck": deck_data,
            "theme": stored_theme,
            "resolvedTheme": resolved_theme,
        }
        js = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js)
        # Also apply data-theme attribute immediately
        self._apply_theme_to_webview()

        # Push subagent registry to frontend
        try:
            try:
                from ..ai.agents import get_registry_for_frontend
            except ImportError:
                from ai.agents import get_registry_for_frontend
            registry_payload = {
                'type': 'subagent_registry',
                'agents': get_registry_for_frontend(self.config)
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(registry_payload)});"
            )
        except Exception as e:
            logger.error("Failed to push subagent registry: %s", e)

        # Register our webview with addon proxy so it can inject assets when captured
        # Assets may not be captured yet (reviewer hasn't loaded), but when they are,
        # the capture hook will immediately inject into this webview
        try:
            from .addon_proxy import set_target_webview, inject_addon_assets
            set_target_webview(self.web_view)
            inject_addon_assets(self.web_view)  # inject now if assets already captured
        except (ImportError, AttributeError, RuntimeError) as e:
            logger.warning("Addon proxy setup failed: %s", e)

    def push_updated_models(self):
        """Sendet aktualisierte Model-Liste an die Web-UI"""
        api_key = self.config.get("api_key", "")
        provider = "google"  # Immer Google
        
        # Lade Modelle live wenn API-Key vorhanden
        models = []
        error = None
        if api_key.strip():
            try:
                from ..ai.handler import get_ai_handler
                ai = get_ai_handler()
                models = ai.fetch_available_models(provider, api_key)
                logger.info("push_updated_models: %s Modelle geladen", len(models) if models else 0)
                # Wenn keine Modelle zurückgegeben wurden, verwende Fallback
                if not models:
                    logger.debug("push_updated_models: Keine Modelle, verwende Fallback")
                    models = self._build_model_list()
            except Exception as e:
                error_msg = str(e)
                logger.exception("Fehler beim Laden der Modelle in push_updated_models: %s", error_msg)
                error = error_msg
                models = self._build_model_list()  # Fallback
        else:
            logger.debug("push_updated_models: Kein API-Key, verwende Fallback")
            models = self._build_model_list()  # Fallback wenn kein API-Key
        
        payload = {
            "type": "models_updated",
            "models": models,
            "currentModel": self.config.get("model_name", ""),
            "provider": provider,
            "hasApiKey": bool(api_key.strip()),
            "error": error
        }
        logger.debug("push_updated_models: Sende %s Modelle an Frontend", len(models))
        js = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js)

    def _build_model_list(self):
        """Baut Model-Liste aus statischen Daten (Fallback)"""
        items = []
        for m in AVAILABLE_MODELS.get("google", []):
            items.append({"name": m["name"], "label": m["label"]})
        return items

    def handle_message_from_ui(self, message: str, history=None, mode='compact', request_id=None, agent_name=None):
        """
        Verarbeitet Nachrichten von der UI

        Args:
            message: Die Nachricht des Benutzers
            history: Optional - Liste von vorherigen Nachrichten [{role: 'user'|'assistant', content: 'text'}]
            mode: Optional - 'compact' oder 'detailed' (Standard: 'compact')
            request_id: Optional - UUID for tracking this request
        """
        text = message.strip()
        if not text:
            return

        # Set frontend callback for tools that need to push events (e.g. spawn_plusi)
        try:
            from ..ai.tool_executor import set_frontend_callback
        except ImportError:
            from ai.tool_executor import set_frontend_callback

        import json as _json
        from PyQt6.QtCore import QTimer

        def _push_to_frontend(payload):
            # Must run on main Qt thread — tool executor runs in AI thread
            js_code = f"window.ankiReceive({_json.dumps(payload)});"
            QTimer.singleShot(0, lambda: self.web_view.page().runJavaScript(js_code))

            # Sync Plusi mood to main window dock
            if payload.get('type') == 'plusiResult' or (isinstance(payload.get('mood'), str)):
                mood = payload.get('mood', 'neutral')
                try:
                    from plusi.dock import sync_mood
                    QTimer.singleShot(0, lambda: sync_mood(mood))
                except (ImportError, AttributeError, RuntimeError):
                    pass
                QTimer.singleShot(0, lambda: self._sync_plusi_integrity())

        set_frontend_callback(_push_to_frontend)

        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        ai = get_ai_handler(widget=self)  # Pass widget reference for UI state emission
        ai._current_request_id = request_id  # Store for pipeline_step events
        if not ai.is_configured():
            # Unterschiedliche Fehlermeldungen je nach Modus
            from ..config import is_backend_mode
            if is_backend_mode():
                bot_msg = "Bitte verbinden Sie sich zuerst mit Ihrem Account in den Einstellungen."
            else:
                bot_msg = "Bitte konfigurieren Sie zuerst den API-Schlüssel in den Einstellungen."
            payload = {"type": "bot", "message": bot_msg}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            # Lösche Referenz nach Fehler
            if self.current_request == message:
                self.current_request = None
        else:
            # Sende Loading-Indikator sofort (vor der API-Anfrage)
            loading_payload = {"type": "loading"}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(loading_payload)});")

            # Load insights for the current card (if any) to inject into system prompt
            card_insights = None
            if self.current_card_context and self.current_card_context.get('cardId'):
                try:
                    try:
                        from ..storage.card_sessions import load_insights
                    except ImportError:
                        from storage.card_sessions import load_insights
                    card_id = self.current_card_context['cardId']
                    card_insights = load_insights(int(card_id))
                except Exception as e:
                    logger.error("⚠️ Failed to load insights for card context: %s", e)

            # Start AI request thread immediately — card history loading happens inside the thread
            # to avoid blocking the main Qt thread
            self._ai_thread = AIRequestThread(ai, text, self, history=history, mode=mode, request_id=request_id, insights=card_insights, agent_name=agent_name)
            self._ai_thread._card_context_for_history = self.current_card_context
            self._ai_thread.chunk_signal.connect(self.on_streaming_chunk)
            self._ai_thread.finished_signal.connect(self.on_streaming_finished)
            self._ai_thread.error_signal.connect(self.on_streaming_error)
            self._ai_thread.metadata_signal.connect(self.on_streaming_metadata)
            self._ai_thread.pipeline_signal.connect(self.on_pipeline_step)
            self._ai_thread.msg_event_signal.connect(self.on_msg_event)
            self._ai_thread.start()

    def _send_to_js(self, payload):
        """Send a JSON payload to the frontend via ankiReceive."""
        js_code = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js_code)

    # ── Streaming delivery queue ─────────────────────────────────────
    # When the backend buffers SSE responses, all text_chunk events arrive
    # in a single burst. Without spacing, React renders them as one block.
    # This queue delivers events with ~30ms gaps so the UI streams visibly.
    STREAM_DELIVERY_MS = 30  # ms between queued event deliveries

    def _init_stream_queue(self):
        """Lazy-init the streaming delivery queue."""
        if not hasattr(self, '_stream_queue'):
            self._stream_queue = []
            self._stream_timer = QTimer()
            self._stream_timer.setSingleShot(True)
            self._stream_timer.timeout.connect(self._deliver_next_stream_event)

    def _enqueue_stream_event(self, payload):
        """Add event to the delivery queue and start draining if idle.

        IMPORTANT: Never deliver synchronously here. All Qt signals from the AI
        thread burst arrive in one event-loop tick. A 0ms timer ensures the queue
        is fully populated before the first delivery fires.

        NOTE: This queue spaces out delivery but does NOT create real streaming.
        Google Cloud Functions (1st gen) buffer the entire SSE response — all
        chunks arrive as one burst. Real streaming requires migrating to Cloud
        Run (2nd gen) or another provider that supports HTTP streaming.
        """
        self._init_stream_queue()
        self._stream_queue.append(payload)
        if not self._stream_timer.isActive():
            # 0ms timer fires after all pending signals are processed
            self._stream_timer.start(0)

    def _deliver_next_stream_event(self):
        """Deliver the next queued event to JS and schedule the following one."""
        if not self._stream_queue:
            return
        payload = self._stream_queue.pop(0)
        if payload.get('type') == 'msg_done':
            logger.info("📤 DELIVERING msg_done to JS (queue had %s remaining)", len(self._stream_queue))
        self._send_to_js(payload)
        if self._stream_queue:
            self._stream_timer.start(self.STREAM_DELIVERY_MS)

    def on_msg_event(self, request_id, event_type, data):
        """Handle v2 structured message events from the AI thread — delivered via Qt signal.

        text_chunk events (and events that follow them like agent_cell/done and msg_done)
        are queued with spacing so the frontend renders streaming progressively.
        """
        payload = {"type": event_type}
        if isinstance(data, dict):
            payload.update(data)

        if event_type == 'text_chunk':
            # Queue for progressive delivery
            self._enqueue_stream_event(payload)
        elif event_type in ('agent_cell', 'msg_done'):
            # If streaming is in progress, queue behind text chunks
            self._init_stream_queue()
            if self._stream_queue:
                self._enqueue_stream_event(payload)
            else:
                self._send_to_js(payload)
        else:
            # msg_start, orchestration — deliver immediately
            self._send_to_js(payload)

    def on_pipeline_step(self, request_id, step, status, data):
        """Handle pipeline step events from the AI thread — delivered via Qt signal for real-time UI."""
        payload = {
            "type": "pipeline_step",
            "requestId": request_id,
            "step": step,
            "status": status,
            "data": data if isinstance(data, dict) else {}
        }
        self._send_to_js(payload)

    def on_streaming_chunk(self, request_id, chunk, done, is_function_call):
        payload = {
            "type": "streaming",
            "requestId": request_id,
            "chunk": chunk,
            "done": done,
            "isFunctionCall": is_function_call
        }
        self._send_to_js(payload)

    def on_streaming_error(self, request_id, error_message):
        payload = {
            "type": "error",
            "requestId": request_id,
            "message": error_message
        }
        self._send_to_js(payload)
        self.current_request = None
        if hasattr(self, '_ai_thread'):
            self._ai_thread = None

    def on_streaming_metadata(self, request_id, steps, citations, step_labels):
        payload = {
            "type": "metadata",
            "requestId": request_id,
            "steps": steps,
            "citations": [c if isinstance(c, dict) else c for c in (citations or [])],
            "stepLabels": step_labels or []
        }
        self._send_to_js(payload)

    def on_streaming_finished(self, request_id):
        self.current_request = None
        if hasattr(self, '_ai_thread') and self._ai_thread is not None:
            self._ai_thread.quit()
            self._ai_thread.wait(1000)
            self._ai_thread = None

    def set_model_from_ui(self, model_name: str):
        if not model_name:
            return
        self.config["model_name"] = model_name
        update_config(model_name=model_name)

    def close_panel(self):
        """Schließt das Dock-Widget"""
        # Wird von ui_setup.py verwaltet
        try:
            from .setup import close_chatbot_panel
            close_chatbot_panel()
        except ImportError:
            from setup import close_chatbot_panel
            close_chatbot_panel()

    def open_settings_dialog(self):
        """Wird nicht mehr verwendet - Settings werden nur über React-Dialog geöffnet"""
        pass

    def _save_settings(self, api_key, provider, model_name):
        """Speichert Einstellungen (wird von JavaScript aufgerufen)"""
        logger.debug("_save_settings AUFGERUFEN:")
        logger.debug("  - api_key Länge: %s", len(api_key) if api_key else 0)
        logger.debug("  - api_key erste 10 Zeichen: %s", api_key[:10] if api_key and len(api_key) >= 10 else api_key)
        logger.debug("  - provider: %s", provider)
        logger.debug("  - model_name: %s", model_name)
        
        success = update_config(api_key=api_key, model_provider=provider, model_name=model_name or "")
        if success:
            logger.info("_save_settings: ✓ Config erfolgreich gespeichert")
            self.config = get_config(force_reload=True)
            logger.info("_save_settings: Config neu geladen, API-Key Länge: %s", len(self.config.get('api_key', '')))
            # Warte kurz, damit Config gespeichert ist, dann lade Modelle
            QTimer.singleShot(SETTINGS_RELOAD_DELAY_MS, self.push_updated_models)
        else:
            logger.error("_save_settings: ✗ FEHLER beim Speichern der Config!")
    
    def _go_to_card(self, card_id):
        """Springt zu einer bestimmten Lernkarte - öffnet sie im Vorschau-Modus"""
        try:
            from aqt import mw
            from aqt.previewer import Previewer
            
            if mw is None or mw.col is None:
                logger.debug("_go_to_card: mw oder mw.col ist None")
                return
            
            # Suche die Karte
            card = mw.col.get_card(card_id)
            if not card:
                logger.debug("_go_to_card: Karte %s nicht gefunden", card_id)
                return
            
            # Erstelle eine einfache Previewer-Funktion
            def get_cards():
                return [card_id]
            
            def get_card(idx):
                return mw.col.get_card(card_id)
            
            # Öffne den Previewer
            # Der Previewer benötigt einen Parent und Callback-Funktionen
            class CardProvider:
                def __init__(self, card_id, col):
                    self._card_id = card_id
                    self._col = col
                    self._card = col.get_card(card_id)
                
                def card(self, idx=0):
                    return self._card
                
                def card_changed(self):
                    return False
            
            provider = CardProvider(card_id, mw.col)
            
            # Versuche den Single Card Previewer zu erstellen
            try:
                from aqt.previewer import SingleCardPreviewer
                previewer = SingleCardPreviewer(
                    parent=mw,
                    mw=mw,
                    on_close=lambda: None
                )
                previewer.card = lambda: provider.card()
                previewer.open()
                logger.info("_go_to_card: Karte %s im SingleCardPreviewer geöffnet", card_id)
            except ImportError:
                # Fallback: Öffne im Browser mit Vorschau
                from aqt.browser import Browser
                browser = Browser(mw)
                browser.show()
                browser.search_for(f"cid:{card_id}")
                if browser.table.len():
                    browser.table.select_single(0)
                    # Öffne Vorschau-Fenster
                    browser.onTogglePreview()
                logger.info("_go_to_card: Karte %s im Browser mit Vorschau geöffnet", card_id)
                
        except Exception as e:
            logger.exception("Fehler in _go_to_card: %s", e)

    # ── Deck/Overview Data Gathering (SP2 unification) ────────────

    def _get_deck_browser_data(self):
        """Build complete deck tree data for React."""
        from aqt import mw
        if not mw or not mw.col:
            logger.warning("mw.col not available, skipping _get_deck_browser_data")
            return {'roots': [], 'totalNew': 0, 'totalLearn': 0, 'totalReview': 0, 'totalDue': 0, 'isPremium': False}
        try:
            all_decks = mw.col.decks.all_names_and_ids()

            # Due counts
            due_counts = {}
            tree = mw.col.sched.deck_due_tree()
            def traverse(node):
                did = getattr(node, 'deck_id', None)
                if did:
                    due_counts[did] = {
                        'new': getattr(node, 'new_count', 0),
                        'learning': getattr(node, 'learn_count', 0),
                        'review': getattr(node, 'review_count', 0),
                    }
                for child in getattr(node, 'children', []):
                    traverse(child)
            traverse(tree)

            # Card distribution
            card_dist = {}
            try:
                rows = mw.col.db.all("SELECT did, ivl, queue FROM cards")
                for did, ivl, queue in rows:
                    if did not in card_dist:
                        card_dist[did] = [0, 0, 0, 0]
                    card_dist[did][3] += 1
                    if queue == 0:
                        card_dist[did][2] += 1
                    elif ivl >= 21:
                        card_dist[did][0] += 1
                    else:
                        card_dist[did][1] += 1
            except Exception as e:
                logger.warning("Could not load card distribution data: %s", e)

            # Build tree
            by_name = {}
            for deck in sorted(all_decks, key=lambda d: d.name):
                parts = deck.name.split('::')
                due = due_counts.get(deck.id, {'new': 0, 'learning': 0, 'review': 0})
                cd = card_dist.get(deck.id, [0, 0, 0, 0])
                by_name[deck.name] = {
                    'id': deck.id,
                    'name': deck.name,
                    'display': parts[-1],
                    'dueNew': due['new'],
                    'dueLearn': due['learning'],
                    'dueReview': due['review'],
                    'mature': cd[0],
                    'young': cd[1],
                    'new': cd[2],
                    'total': cd[3],
                    'children': [],
                }

            roots = []
            for name, node in by_name.items():
                parts = name.split('::')
                if len(parts) == 1:
                    roots.append(node)
                else:
                    parent = '::'.join(parts[:-1])
                    if parent in by_name:
                        by_name[parent]['children'].append(node)
                    else:
                        roots.append(node)

            # Aggregate child counts upward
            def aggregate(node):
                for child in node['children']:
                    aggregate(child)
                    node['mature'] += child['mature']
                    node['young'] += child['young']
                    node['new'] += child['new']
                    node['total'] += child['total']

            for root in roots:
                aggregate(root)

            roots.sort(key=lambda n: n['name'])

            # Total dues
            total_new = sum(n.new_count for n in tree.children)
            total_lrn = sum(n.learn_count for n in tree.children)
            total_rev = sum(n.review_count for n in tree.children)

            # Premium status
            cfg = get_config()
            is_premium = bool(cfg.get('auth_token', '').strip()) and cfg.get('auth_validated', False)

            return {
                'roots': roots,
                'totalNew': total_new,
                'totalLearn': total_lrn,
                'totalReview': total_rev,
                'totalDue': total_new + total_lrn + total_rev,
                'isPremium': is_premium,
            }
        except Exception as e:
            logger.error("_get_deck_browser_data error: %s", e)
            return {'roots': [], 'totalNew': 0, 'totalLearn': 0, 'totalReview': 0, 'totalDue': 0, 'isPremium': False}

    def _get_overview_data(self):
        """Get data for the overview screen."""
        from aqt import mw
        if not mw or not mw.col:
            logger.warning("mw.col not available, skipping _get_overview_data")
            return {'deckId': 0, 'deckName': '', 'dueNew': 0, 'dueLearning': 0, 'dueReview': 0}
        try:
            deck_id = mw.col.decks.get_current_id()
            deck_name = mw.col.decks.name(deck_id)
            counts = mw.col.sched.counts()
            return {
                'deckId': deck_id,
                'deckName': deck_name,
                'dueNew': counts[0],
                'dueLearning': counts[1],
                'dueReview': counts[2],
            }
        except Exception as e:
            logger.error("_get_overview_data error: %s", e)
            return {'deckId': 0, 'deckName': '', 'dueNew': 0, 'dueLearning': 0, 'dueReview': 0}

    # ── Deck/Overview Action Handlers (SP2 unification) ──

    def _msg_study_deck(self, data):
        from aqt import mw
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            did = int(parsed.get('deckId', 0))
            if did:
                mw.col.decks.select(did)
                mw.onOverview()
                QTimer.singleShot(STUDY_DECK_DELAY_MS, lambda: mw.overview._linkHandler('study'))
        except (AttributeError, RuntimeError, ValueError) as e:
            logger.error("study_deck error: %s", e)

    def _msg_select_deck(self, data):
        from aqt import mw
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            did = int(parsed.get('deckId', 0))
            if did:
                mw.col.decks.select(did)
                mw.onOverview()
        except (AttributeError, RuntimeError, ValueError) as e:
            logger.error("select_deck error: %s", e)

    def _msg_navigate(self, data):
        from aqt import mw
        try:
            state = data if isinstance(data, str) else str(data)
            if state == 'deckBrowser':
                mw.moveToState('deckBrowser')
            elif state == 'overview':
                mw.onOverview()
            elif state == 'review':
                # Always try to enter review — Anki will resume or start fresh
                try:
                    mw.moveToState('review')
                except (AttributeError, RuntimeError):
                    mw.onOverview()
        except (AttributeError, RuntimeError) as e:
            logger.error("navigate error: %s", e)

    def _msg_create_deck(self, data=None):
        from aqt import mw
        try:
            if hasattr(mw, 'onAddDeck'):
                mw.onAddDeck()
        except (AttributeError, RuntimeError) as e:
            logger.warning("create_deck error: %s", e)

    def _msg_import_deck(self, data=None):
        from aqt import mw
        try:
            if hasattr(mw, 'handleImport'):
                mw.handleImport()
            elif hasattr(mw, 'onImport'):
                mw.onImport()
        except (AttributeError, RuntimeError) as e:
            logger.warning("import_deck error: %s", e)

    def _msg_open_deck_options(self, data=None):
        from aqt import mw
        try:
            mw.overview._linkHandler('opts')
        except (AttributeError, RuntimeError) as e:
            logger.warning("open_deck_options error: %s", e)

    def _msg_open_stats(self, data=None):
        from aqt import mw
        try:
            mw.onStats()
        except (AttributeError, RuntimeError) as e:
            logger.warning("open_stats error: %s", e)

    def _msg_get_statistik_data(self, data=None):
        """Fetch all statistics data and send to frontend as 'statistikData'."""
        result = self.bridge.getStatistikData()
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse bridge response for getStatistikData: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("statistikData", parsed)

    def _msg_get_deck_trajectory(self, data=None):
        """Fetch per-deck trajectory data and send to frontend."""
        deck_id = data.get("deckId") if data else None
        if not deck_id:
            self._send_to_frontend("deckTrajectory", {"error": "No deckId"})
            return
        result = self.bridge.getDeckTrajectory(str(deck_id))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse getDeckTrajectory response: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("deckTrajectory", parsed)

    def _msg_get_deck_session_suggestion(self, data=None):
        """Fetch per-deck session suggestion and send to frontend."""
        deck_id = data.get("deckId") if data else None
        if not deck_id:
            self._send_to_frontend("deckSessionSuggestion", {"error": "No deckId"})
            return
        result = self.bridge.getDeckSessionSuggestion(str(deck_id))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse getDeckSessionSuggestion response: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("deckSessionSuggestion", parsed)

    def _msg_get_deck_mastery(self, data=None):
        """Fetch deck mastery and send to frontend."""
        deck_id = data.get("deckId") if data else None
        if not deck_id:
            self._send_to_frontend("deckMastery", {"error": "No deckId"})
            return
        result = self.bridge.getDeckMastery(str(deck_id))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse getDeckMastery response: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("deckMastery", parsed)

    def _msg_save_focus(self, data=None):
        result = self.bridge.saveFocus(json.dumps(data or {}))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            parsed = {"error": "Parse error"}
        self._send_to_frontend("focusSaved", parsed)

    def _msg_get_focuses(self, data=None):
        result = self.bridge.getFocuses()
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            parsed = []
        self._send_to_frontend("focusList", parsed)

    def _msg_delete_focus(self, data=None):
        focus_id = data.get("focusId") if data else None
        if focus_id:
            self.bridge.deleteFocus(focus_id)
        self._msg_get_focuses()

    def _msg_toggle_settings(self, data=None):
        try:
            from .settings_sidebar import toggle_settings_sidebar
            toggle_settings_sidebar()
        except (ImportError, AttributeError, RuntimeError) as e:
            logger.warning("toggle_settings error: %s", e)

    # ── Card Review Handlers (React ReviewerView) ─────────────────────

    @staticmethod
    def _clean_card_html(html):
        """Strip script tags and Anki template JS from card HTML.

        Note: <style> tags are intentionally kept — they carry card formatting.
        For clean display content, use note fields (frontField/backField) instead.
        """
        import re
        # Remove <script>...</script> blocks
        html = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', html, flags=re.IGNORECASE)
        # Remove inline JS that Anki card templates sometimes leave as text
        html = re.sub(r'//\s*BUTTON SHORTCUTS[\s\S]*?(?=<|$)', '', html)
        return html

    def _send_card_data(self, card, is_question=True):
        """Send card HTML + metadata to React."""
        import re
        from aqt import mw
        if not mw or not mw.col:
            logger.warning("mw.col not available, skipping _send_card_data")
            return

        # Install addon proxy on first card (reviewer is now available)
        if not getattr(self, '_addon_proxy_installed', False):
            try:
                from .addon_proxy import get_proxy
                get_proxy().install(self.web_view)
                self._addon_proxy_installed = True
            except (ImportError, AttributeError, RuntimeError) as e:
                logger.warning("Addon proxy install failed: %s", e)

        try:
            front_html = card.question()
            back_html = card.answer()

            # Strip content before <hr id=answer> from back (Anki answer includes question)
            back_html = re.sub(r'^[\s\S]*?<hr[^>]*id\s*=\s*["\']?answer["\']?[^>]*>', '', back_html, count=1)

            media_dir = mw.col.media.dir()
            front_html = re.sub(r'src="([^":/]+)"', 'src="file://%s/\\1"' % media_dir, front_html)
            back_html = re.sub(r'src="([^":/]+)"', 'src="file://%s/\\1"' % media_dir, back_html)

            # Strip <script> tags (keeps <style> — they carry card formatting)
            front_html = self._clean_card_html(front_html)
            back_html = self._clean_card_html(back_html)

            # Read raw note fields — clean content without template garbage
            # Used for display (no Tags/Errata/NoteID) and for evaluate/MC text
            note = card.note()
            front_field = note.fields[0] if note and note.fields else ''
            back_field = note.fields[1] if note and len(note.fields) > 1 else ''
            # Resolve media paths in fields too (they can contain <img> tags)
            front_field = re.sub(r'src="([^":/]+)"', 'src="file://%s/\\1"' % media_dir, front_field)
            back_field = re.sub(r'src="([^":/]+)"', 'src="file://%s/\\1"' % media_dir, back_field)

            event_type = "card.shown" if is_question else "card.answerShown"
            # Session deck = the deck the user selected to study (not the card's own deck)
            try:
                session_deck_id = mw.col.decks.get_current_id()
                session_deck_name = mw.col.decks.name(session_deck_id)
            except Exception:
                session_deck_id = card.did
                session_deck_name = mw.col.decks.name(card.did)
            # Live scheduler counts for the current review session
            try:
                counts = mw.col.sched.counts(card)
                due_new, due_learning, due_review = counts[0], counts[1], counts[2]
            except Exception:
                due_new, due_learning, due_review = 0, 0, 0
            self._send_to_frontend(event_type, {
                "cardId": card.id,
                "frontHtml": front_html,
                "backHtml": back_html,
                "frontField": front_field,
                "backField": back_field,
                "deckId": card.did,
                "deckName": mw.col.decks.name(card.did),
                "sessionDeckName": session_deck_name,
                "isQuestion": is_question,
                "dueNew": due_new,
                "dueLearning": due_learning,
                "dueReview": due_review,
            })
        except Exception as e:
            logger.error("_send_card_data error: %s", e)

    def _msg_get_sidebar_status(self, data=None):
        """Send settings status to React — fetches quota from backend."""
        try:
            config = get_config()
            auth_token = config.get('auth_token', '')
            is_authenticated = bool(auth_token and config.get('auth_validated', False))
            # Use cached tier as default so it survives restarts
            tier = config.get('tier', 'free') if is_authenticated else 'free'
            token_used = 0
            token_limit = 0

            # Send cached status immediately so UI doesn't flash "Starter"
            self._send_to_frontend('sidebarStatus', {
                'tier': tier,
                'theme': config.get('theme', 'dark'),
                'isAuthenticated': is_authenticated,
                'tokenUsed': token_used,
                'tokenLimit': token_limit,
            })

            # Then fetch live quota in background and update
            if is_authenticated:
                import threading
                def _fetch_quota():
                    try:
                        try:
                            from ..config import get_backend_url
                        except ImportError:
                            from config import get_backend_url
                        backend_url = get_backend_url()
                        if not backend_url or not auth_token:
                            return
                        import requests as _req
                        resp = _req.get(
                            '%s/user/quota' % backend_url.rstrip('/'),
                            headers={'Authorization': 'Bearer %s' % auth_token.strip()},
                            timeout=8,
                        )
                        if resp.status_code == 200:
                            qdata = resp.json()
                            live_tier = qdata.get('tier', 'free')
                            tokens = qdata.get('tokens', {})
                            daily = tokens.get('daily', {})
                            live_used = daily.get('used', 0)
                            live_limit = daily.get('limit', 0)
                            update_config(tier=live_tier)
                            # Update UI on main thread
                            from aqt import mw
                            if mw:
                                mw.taskman.run_on_main(lambda: self._send_to_frontend('sidebarStatus', {
                                    'tier': live_tier,
                                    'theme': config.get('theme', 'dark'),
                                    'isAuthenticated': True,
                                    'tokenUsed': live_used,
                                    'tokenLimit': live_limit,
                                }))
                    except Exception as e:
                        logger.warning("sidebar quota fetch: %s", e)

                threading.Thread(target=_fetch_quota, daemon=True, name="SidebarQuota").start()

        except (AttributeError, RuntimeError) as e:
            logger.warning("get_sidebar_status: %s", e)

    def _msg_set_theme(self, data=None):
        """Set theme preference — delegates to _msg_save_theme (single path)."""
        try:
            theme = data if isinstance(data, str) else (json.loads(data) if data else 'dark')
            self._msg_save_theme({"theme": theme})
        except (AttributeError, RuntimeError, json.JSONDecodeError) as e:
            logger.warning("set_theme: %s", e)

    def _msg_sidebar_upgrade(self, data=None):
        """Open upgrade or account management page."""
        import webbrowser
        config = get_config()
        tier = config.get('tier', 'free')
        is_auth = bool(config.get('auth_token') and config.get('auth_validated'))
        if is_auth and tier != 'free':
            webbrowser.open('https://anki-plus.vercel.app/account')
        else:
            webbrowser.open('https://anki-plus.vercel.app/login')

    def _msg_sidebar_connect(self, data=None):
        """Start link-auth flow."""
        if self.bridge and hasattr(self.bridge, 'startLinkAuth'):
            self.bridge.startLinkAuth()
        else:
            import webbrowser
            webbrowser.open('https://anki-plus.vercel.app/login')

    def _msg_get_indexing_status(self, data=None):
        """Return embedding + KG term extraction progress to sidebar."""
        try:
            try:
                from ..storage.kg_store import get_graph_status
            except ImportError:
                from storage.kg_store import get_graph_status

            try:
                from ..storage.card_sessions import load_all_embeddings
            except ImportError:
                from storage.card_sessions import load_all_embeddings

            kg_status = get_graph_status()

            embedded_count = 0
            try:
                for _ in load_all_embeddings():
                    embedded_count += 1
            except Exception:
                pass

            total_cards = 0
            try:
                if mw and mw.col and mw.col.db:
                    total_cards = mw.col.db.scalar("SELECT COUNT() FROM cards") or 0
            except Exception as e:
                logger.debug("card count failed: %s", e)
                # Fallback: use embedded count as approximation
                total_cards = max(embedded_count, kg_status.get('totalCards', 0))

            # KG term embeddings count (for fuzzy matching indicator)
            kg_total_terms = kg_status.get('totalTerms', 0)
            kg_embedded_terms = 0
            try:
                try:
                    from ..storage.kg_store import get_unembedded_terms
                except ImportError:
                    from storage.kg_store import get_unembedded_terms
                unembedded = len(get_unembedded_terms())
                kg_embedded_terms = max(0, kg_total_terms - unembedded)
            except Exception:
                pass

            self._send_to_frontend('indexingStatus', {
                'embeddings': {'total': total_cards, 'done': embedded_count},
                'kgTerms': {
                    'total': total_cards,
                    'done': kg_status.get('totalCards', 0),
                    'totalTerms': kg_total_terms,
                },
                'kgTermEmbeddings': {
                    'total': kg_total_terms,
                    'done': kg_embedded_terms,
                },
            })
        except Exception:
            logger.exception("_msg_get_indexing_status failed")

    def _msg_get_kg_metrics(self, data=None):
        """Return KG metrics from Neo4j (or signal sqlite backend)."""
        try:
            config = get_config()
            if config.get('kg_backend') != 'neo4j':
                self._send_to_frontend('kgMetrics', {'backend': 'sqlite'})
                return

            try:
                try:
                    from ..storage.kg_client import get_kg_metrics
                except ImportError:
                    from storage.kg_client import get_kg_metrics
                metrics = get_kg_metrics()
                metrics['backend'] = 'neo4j'
                self._send_to_frontend('kgMetrics', metrics)
            except Exception as e:
                logger.debug("_msg_get_kg_metrics cloud query failed: %s", e)
                self._send_to_frontend('kgMetrics', {
                    'backend': 'neo4j', 'offline': True,
                    'totalCards': 0, 'reviewedCards': 0, 'avgEase': 0, 'avgInterval': 0,
                })
        except Exception:
            logger.exception("_msg_get_kg_metrics failed")

    def _msg_sidebar_logout(self, data=None):
        """Clear auth tokens."""
        try:
            update_config({'auth_token': '', 'auth_validated': False})
            self._send_to_frontend('authStatusLoaded', {'isAuthenticated': False})
        except (AttributeError, RuntimeError) as e:
            logger.warning("sidebar_logout: %s", e)

    def _msg_copy_logs(self, data=None):
        """Copy recent logs + system info to clipboard, including frontend logs."""
        import platform
        try:
            from ..utils.logging import get_recent_logs
        except ImportError:
            from utils.logging import get_recent_logs
        try:
            from ..config import get_config
        except ImportError:
            from config import get_config

        def _build_and_copy(frontend_log_text):
            """Assemble full report and copy to clipboard."""
            import re
            try:
                config = get_config()
                sep = '=' * 60
                header = (
                    f"AnkiPlus Debug Report\n"
                    f"Platform: {platform.platform()}\n"
                    f"Python: {platform.python_version()}\n"
                    f"Theme: {config.get('theme', 'dark')}\n"
                    f"Tier: {config.get('tier', 'free')}\n"
                    f"Auth: {config.get('auth_validated', False)}\n"
                    f"{sep}\n"
                )
                # --- Parse Python logs ---
                # Format: "21:32:07 INFO  [module]  message"
                py_re = re.compile(r'^(\d{2}:\d{2}:\d{2})\s+(.*)$')
                merged = []
                for line in get_recent_logs(max_age_seconds=600):
                    m = py_re.match(line)
                    if m:
                        ts = m.group(1) + '.000'
                        merged.append((ts, f"{ts} [PY]  {m.group(2)}"))
                    else:
                        # Non-timestamped continuation line
                        merged.append(('', f"              [PY]  {line}"))

                # --- Parse Frontend logs ---
                # Format: "21:32:07.170 [source] message"
                fe_re = re.compile(r'^(\d{2}:\d{2}:\d{2}\.\d{3})\s+(.*)$')
                if frontend_log_text:
                    for line in frontend_log_text.split('\n'):
                        line = line.strip()
                        if not line:
                            continue
                        m = fe_re.match(line)
                        if m:
                            ts = m.group(1)
                            merged.append((ts, f"{ts} [JS]  {m.group(2)}"))
                        else:
                            merged.append(('', f"              [JS]  {line}"))

                # --- Sort chronologically ---
                merged.sort(key=lambda x: x[0])
                log_body = "\n".join(entry[1] for entry in merged) if merged else "(keine Logs)"

                text = header + log_body + "\n"
                clipboard = QApplication.clipboard()
                if clipboard:
                    clipboard.setText(text)
                    py_count = sum(1 for _, l in merged if '[PY]' in l)
                    js_count = sum(1 for _, l in merged if '[JS]' in l)
                    logger.info("Logs copied to clipboard (%d PY + %d JS lines, merged)",
                                py_count, js_count)
                    self._send_to_frontend('sidebarLogsCopied', {})
            except Exception:
                logger.exception("_msg_copy_logs _build_and_copy failed")

        try:
            js = "window._frontendLogs ? window._frontendLogs.join('\\n') : ''"
            self.web_view.page().runJavaScript(js, _build_and_copy)
        except Exception:
            logger.exception("_msg_copy_logs failed")
            # Fallback: copy without frontend logs
            _build_and_copy("")

    def _msg_get_remote_qr(self, data=None):
        """Get or create pairing session (reuses existing). Called on sidebar mount."""
        logger.info("_msg_get_remote_qr: called")
        try:
            try:
                from ..relay import create_pair
            except ImportError:
                from relay import create_pair

            result = create_pair()
            logger.info("_msg_get_remote_qr: result=%s", result)

            if "error" in result:
                self._send_to_frontend("sidebarRemoteQR", result)
                return

            payload = {"pair_code": result["pair_code"], "pair_url": result["pair_url"]}
            self._send_to_frontend("sidebarRemoteQR", payload)
        except Exception:
            logger.exception("_msg_get_remote_qr failed")
            self._send_to_frontend("sidebarRemoteQR", {"error": "Unbekannter Fehler"})

    def _msg_refresh_remote_qr(self, data=None):
        """Force-create a fresh pair code. Called on explicit QR click."""
        logger.info("_msg_refresh_remote_qr: called")
        try:
            try:
                from ..relay import refresh_pair
            except ImportError:
                from relay import refresh_pair

            result = refresh_pair()
            logger.info("_msg_refresh_remote_qr: result=%s", result)

            if "error" in result:
                self._send_to_frontend("sidebarRemoteQR", result)
                return

            payload = {"pair_code": result["pair_code"], "pair_url": result["pair_url"]}
            self._send_to_frontend("sidebarRemoteQR", payload)
        except Exception:
            logger.exception("_msg_refresh_remote_qr failed")
            self._send_to_frontend("sidebarRemoteQR", {"error": "Unbekannter Fehler"})

    def _msg_get_remote_status(self, data=None):
        """Get current remote connection status."""
        try:
            try:
                from ..relay import get_client
            except ImportError:
                from relay import get_client

            client = get_client()
            if not client:
                self._send_to_frontend("sidebarRemoteStatus", {"connected": False, "peer_connected": False})
                return

            try:
                from ..relay import _get_remote_config, DEFAULTS
            except ImportError:
                from relay import _get_remote_config, DEFAULTS
            remote_cfg = _get_remote_config()
            app_url = remote_cfg.get("app_url", DEFAULTS["app_url"])
            # Build open URL: use token for direct reconnect
            open_url = app_url
            if client.session_token:
                open_url = f"{app_url}?token={client.session_token}"
            elif client.pair_code:
                open_url = f"{app_url}?pair={client.pair_code}"

            self._send_to_frontend("sidebarRemoteStatus", {
                "connected": client.is_connected,
                "peer_connected": client.is_peer_connected,
                "pair_code": client.pair_code,
                "mode": client.mode,
                "app_url": app_url,
                "open_url": open_url,
            })
        except Exception:
            logger.exception("_msg_get_remote_status failed")
            self._send_to_frontend("sidebarRemoteStatus", {"connected": False, "peer_connected": False})


    def _msg_request_current_card(self, data=None):
        """Send current card data to React (called when entering review from tab)."""
        from aqt import mw
        try:
            rev = mw.reviewer
            if rev and rev.card:
                is_q = rev.state == 'question'
                logger.info("request_current_card: sending card %s (is_question=%s, rev.state=%s)", rev.card.id, is_q, rev.state)
                self._send_card_data(rev.card, is_question=is_q)
            else:
                logger.warning("request_current_card: no reviewer or no card (rev=%s, card=%s)", rev, rev.card if rev else None)
        except (AttributeError, RuntimeError) as e:
            logger.warning("request_current_card: %s", e)

    def _msg_pycmd(self, data):
        """Forward a pycmd to Anki's native reviewer for addon interop.

        Other addons (e.g. AMBOSS) register pycmd handlers on Anki's
        native reviewer webview. We relay the command string so their
        popups/overlays work from our React ReviewerView.

        Note: rev.web.eval() is Anki's standard API for running JS in the
        reviewer webview — it's how all addons communicate. The command is
        JSON-serialized (not interpolated) to prevent injection.
        """
        from aqt import mw
        try:
            cmd = data if isinstance(data, str) else str(data)
            rev = mw.reviewer
            if rev and rev.web:
                safe_cmd = json.dumps(cmd)
                rev.web.eval("pycmd(%s);" % safe_cmd)
                logger.info("pycmd relayed: %s", cmd[:80])
            else:
                # Fallback: try opening as URL if it looks like one
                if cmd.startswith('http'):
                    import webbrowser
                    webbrowser.open(cmd)
                else:
                    logger.warning("pycmd: no reviewer to relay to: %s", cmd[:80])
        except Exception as e:
            logger.exception("pycmd error: %s", e)

    # --- Knowledge Graph Handlers ---

    def _msg_get_graph_data(self, data):
        """Return full graph data for 3D rendering."""
        try:
            from ..storage.kg_store import get_graph_data
        except ImportError:
            from storage.kg_store import get_graph_data
        try:
            result = get_graph_data()
            self._send_to_js({"type": "graph.data", "data": result})
        except Exception:
            logger.exception("getGraphData failed")
            self._send_to_js({"type": "graph.data", "data": {"nodes": [], "edges": []}})

    def _msg_get_term_cards(self, data):
        """Return card IDs for a term."""
        try:
            from ..storage.kg_store import get_term_card_ids
        except ImportError:
            from storage.kg_store import get_term_card_ids
        try:
            term = data.get("term", "") if isinstance(data, dict) else ""
            card_ids = get_term_card_ids(term)
            self._send_to_js({"type": "graph.termCards", "data": {"term": term, "cardIds": card_ids}})
        except Exception:
            logger.exception("getTermCards failed")
            self._send_to_js({"type": "graph.termCards", "data": {"cardIds": []}})

    def _msg_get_graph_status(self, data):
        """Return graph build status."""
        try:
            from ..storage.kg_store import get_graph_status
        except ImportError:
            from storage.kg_store import get_graph_status
        try:
            self._send_to_js({"type": "graph.status", "data": get_graph_status()})
        except Exception:
            logger.exception("getGraphStatus failed")
            self._send_to_js({"type": "graph.status", "data": {"totalCards": 0, "totalTerms": 0}})

    def _msg_get_card_kg_terms(self, data):
        """Return KG terms for a specific card (for reviewer marking)."""
        try:
            from ..storage.kg_store import get_card_terms
        except ImportError:
            from storage.kg_store import get_card_terms
        try:
            card_id = int(data.get("cardId", 0)) if isinstance(data, dict) else 0
            terms = get_card_terms(card_id)
            logger.info("getCardKGTerms: card_id=%s → %d terms: %s",
                        card_id, len(terms), terms[:5] if terms else "[]")
            self._send_to_js({"type": "kg.cardTerms", "data": {"cardId": card_id, "terms": terms}})
        except Exception:
            logger.exception("getCardKGTerms failed")
            self._send_to_js({"type": "kg.cardTerms", "data": {"terms": []}})

    def _msg_get_term_definition(self, data):
        """Check cache first; if miss, launch QThread to generate definition."""
        try:
            term = data.get("term", "") if isinstance(data, dict) else str(data)
            search_query = data.get("searchQuery", "") if isinstance(data, dict) else ""
            try:
                from ..storage.kg_store import get_definition, get_connected_terms
            except ImportError:
                from storage.kg_store import get_definition, get_connected_terms
            cached = get_definition(term)
            if cached:
                cached["connectedTerms"] = get_connected_terms(term)
                self._send_to_js({"type": "graph.termDefinition", "data": cached})
                return
            self._start_kg_definition(term, search_query=search_query)
        except Exception:
            logger.exception("getTermDefinition handler failed")

    def _msg_search_graph(self, data):
        """Deck-based search: find decks containing cards with the given term."""
        try:
            query = data.get("query", "") if isinstance(data, dict) else str(data)
            try:
                from ..storage.kg_store import search_decks_by_term
            except ImportError:
                from storage.kg_store import search_decks_by_term
            deck_ids = search_decks_by_term(query)
            self._send_to_js({
                "type": "graph.searchResult",
                "data": {"matchedDeckIds": [str(d) for d in deck_ids], "query": query}
            })
        except Exception as e:
            logger.exception("searchGraph failed")

    def _msg_get_deck_cross_links(self, data):
        """Return deck cross-link edges for graph rendering."""
        try:
            try:
                from ..storage.kg_store import get_deck_cross_links
            except ImportError:
                from storage.kg_store import get_deck_cross_links
            links = get_deck_cross_links()
            self._send_to_js({"type": "graph.crossLinks", "data": links})
        except Exception:
            logger.exception("getDeckCrossLinks failed")
            self._send_to_js({"type": "graph.crossLinks", "data": []})

    def _msg_search_kg_subgraph(self, data):
        """Build a Knowledge Graph subgraph from search result card IDs."""
        try:
            card_ids_str = data.get("cardIds", "[]") if isinstance(data, dict) else "[]"
            card_ids = json.loads(card_ids_str)
            query = data.get("query", "") if isinstance(data, dict) else ""

            if not card_ids:
                self._send_to_js({"type": "graph.kgSubgraph", "data": {"nodes": [], "edges": [], "query": query}})
                return

            try:
                from ..storage.kg_store import _get_db as kg_get_db
            except ImportError:
                from storage.kg_store import _get_db as kg_get_db

            db = kg_get_db()

            # 1. Get all terms from these cards with counts
            placeholders = ','.join('?' * len(card_ids))
            term_rows = db.execute(
                "SELECT term, COUNT(DISTINCT card_id) as card_count "
                "FROM kg_card_terms WHERE card_id IN (%s) "
                "GROUP BY term ORDER BY card_count DESC" % placeholders,
                card_ids
            ).fetchall()

            if not term_rows:
                self._send_to_js({"type": "graph.kgSubgraph", "data": {"nodes": [], "edges": [], "query": query}})
                return

            # Filter: only terms that appear in at least 2 cards (reduces noise)
            terms = [r[0] for r in term_rows if r[1] >= 2]
            term_counts = {r[0]: r[1] for r in term_rows if r[1] >= 2}

            # Limit to top 40 terms by card count (keeps graph readable)
            terms = terms[:40]

            if not terms:
                self._send_to_js({"type": "graph.kgSubgraph", "data": {"nodes": [], "edges": [], "query": query}})
                return

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

            # 3. Get global frequencies for node sizing
            freq_rows = db.execute(
                "SELECT term, frequency FROM kg_terms WHERE term IN (%s)" % term_placeholders,
                terms
            ).fetchall()
            global_freqs = {r[0]: r[1] for r in freq_rows}

            # 4. Assign colors by clustering (simple: group by dominant deck)
            deck_rows = db.execute(
                "SELECT term, deck_id, COUNT(*) as cnt FROM kg_card_terms "
                "WHERE card_id IN (%s) AND term IN (%s) "
                "GROUP BY term, deck_id ORDER BY cnt DESC" % (placeholders, term_placeholders),
                card_ids + terms
            ).fetchall()

            term_deck = {}
            for r in deck_rows:
                if r[0] not in term_deck:
                    term_deck[r[0]] = r[1]

            deck_colors = ['#3B6EA5', '#4A8C5C', '#B07D3A', '#7B5EA7', '#A0524B', '#4A9BAE', '#A69550', '#7A6B5D']
            unique_decks = list(set(term_deck.values()))
            deck_to_color = {d: deck_colors[i % len(deck_colors)] for i, d in enumerate(unique_decks)}

            # Resolve deck names
            from aqt import mw
            deck_to_name = {}
            for did in unique_decks:
                try:
                    name = mw.col.decks.name(did)
                    deck_to_name[did] = name.split('::')[-1]  # short name
                except Exception:
                    deck_to_name[did] = "Deck %d" % did

            # 5. Get card IDs per term (for the "kreuzen" feature)
            term_card_ids = {}
            card_rows = db.execute(
                "SELECT term, card_id FROM kg_card_terms "
                "WHERE card_id IN (%s) AND term IN (%s)" % (placeholders, term_placeholders),
                card_ids + terms
            ).fetchall()
            for r in card_rows:
                term_card_ids.setdefault(r[0], []).append(r[1])

            # Build response
            nodes = []
            for term in terms:
                did = term_deck.get(term, 0)
                nodes.append({
                    "id": term,
                    "label": term,
                    "frequency": global_freqs.get(term, 0),
                    "subsetCount": term_counts.get(term, 0),
                    "color": deck_to_color.get(did, '#7A6B5D'),
                    "deckName": deck_to_name.get(did, ''),
                    "deckId": did,
                    "cardIds": list(set(term_card_ids.get(term, [])))[:50],
                })

            edges = [{"source": r[0], "target": r[1], "weight": r[2]} for r in edge_rows]

            logger.info("KG subgraph for '%s': %d nodes, %d edges from %d cards",
                        query, len(nodes), len(edges), len(card_ids))

            self._send_to_js({"type": "graph.kgSubgraph", "data": {
                "nodes": nodes, "edges": edges, "query": query, "totalCards": len(card_ids)}})

        except Exception:
            logger.exception("KG subgraph failed")
            self._send_to_js({"type": "graph.kgSubgraph", "data": {"nodes": [], "edges": [], "query": query if 'query' in dir() else ""}})

    def _msg_search_cards(self, data):
        """Find top-N cards by embedding similarity. Runs in QThread to avoid blocking."""
        query = data.get("query", "") if isinstance(data, dict) else str(data)
        top_k = int(data.get("topK", 100)) if isinstance(data, dict) else 100

        try:
            from .. import get_embedding_manager
        except ImportError:
            try:
                from __init__ import get_embedding_manager
            except ImportError:
                self._send_to_js({"type": "graph.searchCards", "data": {
                    "cards": [], "edges": [], "error": "Import fehler"}})
                return

        emb_mgr = get_embedding_manager()
        if not emb_mgr:
            self._send_to_js({"type": "graph.searchCards", "data": {
                "cards": [], "edges": [], "error": "Embedding nicht verfügbar"}})
            return

        # Launch in background thread so embed_texts() doesn't block the UI
        thread = SearchCardsThread(query, top_k, emb_mgr, self)
        thread.result_signal.connect(self._on_search_cards_result)
        thread.pipeline_signal.connect(self.on_pipeline_step)
        self._search_cards_thread = thread  # prevent GC
        thread.start()

    def _on_search_cards_result(self, result_json):
        """Handle SearchCardsThread result — runs on main thread via signal."""
        try:
            payload = json.loads(result_json)
            self._send_to_js(payload)
            # Trigger quick answer from main thread (QThread must be created on main thread)
            data = payload.get("data", {})
            query = data.get("query", "")
            cards = data.get("cards", [])[:50]
            clusters = data.get("clusters", [])
            if query and cards:
                self._start_quick_answer(query, cards, clusters)
        except Exception:
            logger.exception("Failed to send search cards result")

    def _start_quick_answer(self, query, cards_data, clusters):
        """Launch SmartSearchAgentThread after search completes (must be called on main thread)."""
        logger.info("Starting smart search agent for: %s (%d cards, %d clusters)", query, len(cards_data), len(clusters))

        # Cancel any in-flight search agent thread
        if hasattr(self, '_quick_answer_thread') and self._quick_answer_thread and self._quick_answer_thread.isRunning():
            self._quick_answer_thread.cancel()

        cluster_info = {}
        for c in clusters:
            cluster_info[c["id"]] = [card.get("question", "")[:40] for card in c.get("cards", [])[:3]]

        # Get AI handler
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        ai_handler = get_ai_handler(self)

        # Ensure cards have an 'answer' field for Research agent context
        for card in cards_data:
            if 'answer' not in card:
                card['answer'] = card.get('deck', '')

        self._quick_answer_thread = SmartSearchAgentThread(
            query, cards_data, cluster_info, ai_handler, self
        )
        self._quick_answer_thread.result_signal.connect(self._on_quick_answer_result)
        self._quick_answer_thread.pipeline_signal.connect(self.on_pipeline_step)
        self._quick_answer_thread.msg_event_signal.connect(self.on_msg_event)
        self._quick_answer_thread.error_signal.connect(
            lambda req_id, err: logger.error("SmartSearch agent error: %s", err)
        )
        self._quick_answer_thread.start()

    def _on_quick_answer_result(self, result_json):
        """Handle QuickAnswerThread result."""
        try:
            self._send_to_js(json.loads(result_json))
        except Exception:
            logger.exception("Failed to send quick answer")

    def _msg_get_card_images(self, data):
        """Batch-extract deduplicated images from card HTML fields.

        Runs synchronously on main thread (called from polling timer).
        Request: { cardIds: JSON string of int array }
        Response: graph.cardImages event with deduplicated image list.
        """
        try:
            from ..utils.text import extract_images_from_html
        except ImportError:
            from utils.text import extract_images_from_html

        card_ids_raw = data.get("cardIds", "[]") if isinstance(data, dict) else "[]"
        try:
            card_ids = json.loads(card_ids_raw)
        except (ValueError, TypeError):
            card_ids = []

        if not card_ids:
            self._send_to_js({"type": "graph.cardImages", "data": {"images": []}})
            return

        try:
            from aqt import mw
            if mw is None or mw.col is None:
                self._send_to_js({"type": "graph.cardImages", "data": {"images": []}})
                return

            media_dir = mw.col.media.dir()
            seen = {}  # filename -> entry dict

            for cid in card_ids[:30]:  # Cap at 30
                try:
                    card = mw.col.get_card(int(cid))
                    note = card.note()
                    deck = mw.col.decks.get(card.did)
                    deck_name = deck["name"].split("::")[-1] if deck else "Unknown"
                    question = re.sub(r'<[^>]+>', '', note.fields[0])[:80] if note.fields else ""

                    for field in note.fields:
                        for raw_src in extract_images_from_html(field):
                            # Skip remote URLs and absolute paths — only local media
                            if raw_src.startswith(('http://', 'https://', 'file://', '/')):
                                continue
                            filename = os.path.basename(raw_src)
                            if not filename:
                                continue
                            # Check file actually exists in media dir
                            filepath = os.path.join(media_dir, filename)
                            if not os.path.isfile(filepath):
                                continue

                            if filename not in seen:
                                seen[filename] = {
                                    "filename": filename,
                                    "src": "file://" + filepath,
                                    "cardIds": [],
                                    "questions": {},
                                    "decks": {},
                                }
                            entry = seen[filename]
                            cid_int = int(cid)
                            if cid_int not in entry["cardIds"]:
                                entry["cardIds"].append(cid_int)
                                entry["questions"][str(cid_int)] = question
                                entry["decks"][str(cid_int)] = deck_name
                except Exception:
                    logger.debug("getCardImages: skipping card %s", cid, exc_info=True)

            self._send_to_js({
                "type": "graph.cardImages",
                "data": {"images": list(seen.values())}
            })
        except Exception as e:
            logger.exception("_msg_get_card_images failed: %s", e)
            self._send_to_js({"type": "graph.cardImages", "data": {"images": []}})

    def _msg_sub_cluster(self, data):
        """Re-cluster a subset of cards into finer sub-clusters."""
        try:
            card_ids_str = data.get("cardIds", "[]") if isinstance(data, dict) else "[]"
            card_ids = json.loads(card_ids_str)
            cluster_id = data.get("clusterId", "") if isinstance(data, dict) else ""
            parent_query = data.get("query", "") if isinstance(data, dict) else ""

            if not card_ids or len(card_ids) < 4:
                self._send_to_js({"type": "graph.subClusters", "data": {
                    "clusterId": cluster_id, "subClusters": [], "tooFew": True}})
                return

            try:
                from .. import get_embedding_manager
            except ImportError:
                from __init__ import get_embedding_manager

            emb_mgr = get_embedding_manager()
            if not emb_mgr:
                self._send_to_js({"type": "graph.subClusters", "data": {
                    "clusterId": cluster_id, "subClusters": [], "error": "No embeddings"}})
                return

            # Load embeddings for these cards
            card_embs = {}
            with emb_mgr._lock:
                for i, cid in enumerate(emb_mgr._card_ids):
                    if cid in card_ids:
                        card_embs[cid] = emb_mgr._index[i]

            if len(card_embs) < 4:
                self._send_to_js({"type": "graph.subClusters", "data": {
                    "clusterId": cluster_id, "subClusters": [], "tooFew": True}})
                return

            # Compute pairwise similarities
            cids_list = list(card_embs.keys())
            all_sims = {}
            for i in range(len(cids_list)):
                for j in range(i + 1, len(cids_list)):
                    a, b = card_embs[cids_list[i]], card_embs[cids_list[j]]
                    dot = sum(x * y for x, y in zip(a, b))
                    na = sum(x * x for x in a) ** 0.5
                    nb = sum(x * x for x in b) ** 0.5
                    if na > 0 and nb > 0:
                        all_sims[(cids_list[i], cids_list[j])] = dot / (na * nb)

            # Target 2-4 sub-clusters
            n = len(cids_list)
            target = max(2, min(4, n // 4))

            best_clusters = None
            for threshold_10x in range(95, 40, -5):
                threshold = threshold_10x / 100.0
                sim_pairs = {}
                for (ci, cj), sim in all_sims.items():
                    if sim > threshold:
                        sim_pairs.setdefault(ci, set()).add(cj)
                        sim_pairs.setdefault(cj, set()).add(ci)

                assigned = set()
                trial_clusters = []
                for cid in cids_list:
                    if cid in assigned:
                        continue
                    cluster = []
                    queue = [cid]
                    assigned.add(cid)
                    while queue:
                        current = queue.pop(0)
                        cluster.append(current)
                        for neighbor in sim_pairs.get(current, set()):
                            if neighbor not in assigned:
                                assigned.add(neighbor)
                                queue.append(neighbor)
                    trial_clusters.append(cluster)

                real = [c for c in trial_clusters if len(c) >= 2]
                if len(real) >= target:
                    best_clusters = real
                    # Merge singletons
                    for c in trial_clusters:
                        if len(c) == 1:
                            s = c[0]
                            best_sim = -1
                            best_ci = 0
                            for ci, cl in enumerate(best_clusters):
                                for m in cl:
                                    key = (min(s, m), max(s, m))
                                    sim = all_sims.get(key, 0)
                                    if sim > best_sim:
                                        best_sim = sim
                                        best_ci = ci
                            best_clusters[best_ci].append(s)
                    break

            if not best_clusters or len(best_clusters) < 2:
                # Can't sub-cluster meaningfully
                self._send_to_js({"type": "graph.subClusters", "data": {
                    "clusterId": cluster_id, "subClusters": [], "tooFew": True}})
                return

            # Cap at target
            while len(best_clusters) > target:
                best_clusters.sort(key=lambda c: len(c))
                smallest = best_clusters.pop(0)
                best_sim = -1
                best_ci = 0
                for ci, cl in enumerate(best_clusters):
                    total_sim = sum(all_sims.get((min(s, m), max(s, m)), 0)
                                    for s in smallest for m in cl) / max(1, len(smallest) * len(cl))
                    if total_sim > best_sim:
                        best_sim = total_sim
                        best_ci = ci
                best_clusters[best_ci].extend(smallest)

            # Build response with card data
            from aqt import mw
            sub_output = []
            for si, sub_cids in enumerate(best_clusters):
                cards = []
                label_parts = []
                for cid in sub_cids:
                    try:
                        card = mw.col.get_card(cid)
                        note = card.note()
                        q = note.fields[0] if note.fields else ''
                        import re as _re
                        q_clean = _re.sub(r'<[^>]+>', '', q)[:60]
                        deck = mw.col.decks.name(card.did).split('::')[-1]
                        cards.append({"id": str(cid), "question": q_clean, "deck": deck})
                        if len(label_parts) < 2:
                            label_parts.append(q_clean[:25])
                    except Exception:
                        cards.append({"id": str(cid), "question": "", "deck": ""})

                sub_output.append({
                    "id": "sub_%d" % si,
                    "label": " / ".join(label_parts) if label_parts else "Sub %d" % (si + 1),
                    "cards": cards,
                })

            logger.info("Sub-clustering for %s: %d cards → %d sub-clusters",
                        cluster_id, len(card_ids), len(sub_output))

            self._send_to_js({"type": "graph.subClusters", "data": {
                "clusterId": cluster_id,
                "subClusters": sub_output,
                "query": parent_query,
            }})

        except Exception:
            logger.exception("Sub-clustering failed")
            self._send_to_js({"type": "graph.subClusters", "data": {
                "clusterId": cluster_id if 'cluster_id' in dir() else "",
                "subClusters": [], "error": "Sub-clustering failed"}})

    def _msg_start_term_stack(self, data):
        """Create filtered deck from card IDs and enter reviewer."""
        try:
            term = data.get("term", "KG Stack") if isinstance(data, dict) else "KG Stack"
            card_ids_str = data.get("cardIds", "[]") if isinstance(data, dict) else "[]"
            card_ids = json.loads(card_ids_str)
            if not card_ids:
                return
            try:
                from ..utils.anki import run_on_main_thread
            except ImportError:
                from utils.anki import run_on_main_thread

            def _create_stack():
                try:
                    from aqt import mw
                    # Clean up old KG filtered decks
                    for d in mw.col.decks.all_names_and_ids():
                        if d.name.startswith("KG: "):
                            mw.col.decks.remove([d.id])
                    # Create filtered deck
                    search = " OR ".join("cid:%d" % cid for cid in card_ids[:100])
                    did = mw.col.decks.new_filtered("KG: %s" % term)
                    deck = mw.col.decks.get(did)
                    deck["terms"] = [{"search": search, "limit": len(card_ids), "order": 0}]
                    mw.col.decks.save(deck)
                    mw.col.sched.rebuild_filtered_deck(did)
                    mw.moveToState("review")
                except Exception:
                    logger.exception("Failed to create KG stack")

            run_on_main_thread(_create_stack)
        except Exception:
            logger.exception("startTermStack handler failed")

    def _start_kg_definition(self, term, search_query=None):
        """Launch definition agent via standard dispatch."""
        if not self._handler:
            logger.warning("No AI handler for definition agent")
            return

        try:
            from .agents import get_agent
        except ImportError:
            from agents import get_agent

        agent_def = get_agent('definition')
        if not agent_def:
            logger.warning("Definition agent not registered")
            return

        import importlib
        mod = importlib.import_module(agent_def.run_module, package='AnkiPlus_main')
        run_fn = getattr(mod, agent_def.run_function)

        def _on_finished(widget, agent_name, result):
            try:
                data = {
                    'term': term,
                    'definition': result.get('text', ''),
                    'sourceCount': result.get('sourceCount', 0),
                    'generatedBy': result.get('generatedBy', 'llm'),
                    'connectedTerms': result.get('connectedTerms', []),
                    'citations': result.get('citations', []),
                }
                if result.get('error'):
                    data['error'] = result['error']
                widget._send_to_js({'type': 'graph.termDefinition', 'data': data})
            except Exception:
                logger.exception("Failed to send definition result")

        self._handler._dispatch_agent(
            agent_name='definition',
            run_fn=run_fn,
            situation=term,
            request_id='definition_%s' % id(self),
            on_finished=_on_finished,
            extra_kwargs={'search_query': search_query},
            agent_def=agent_def,
        )

    def _on_kg_result(self, result_json):
        """Handle KG thread result — push to frontend."""
        try:
            payload = json.loads(result_json)
            self._send_to_js(payload)
        except Exception:
            logger.exception("Failed to send KG result to frontend")

    def _msg_flip_card(self, data=None):
        """Show answer side. Swallow web.eval to prevent mw.web DOM writes."""
        from aqt import mw
        try:
            rev = mw.reviewer
            if not rev or not rev.card:
                logger.warning("flip_card: no reviewer or card")
                return
            if rev.web:
                _orig = rev.web.eval
                rev.web.eval = lambda js: None
            try:
                rev._showAnswer()
            finally:
                if rev.web:
                    rev.web.eval = _orig
            self._send_card_data(rev.card, is_question=False)
        except Exception as e:
            logger.exception("flip_card error: %s", e)

    def _msg_rate_card(self, data):
        """Rate current card and advance to next."""
        from aqt import mw
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            ease = int(parsed.get('ease', 2)) if isinstance(parsed, dict) else 2
            rev = mw.reviewer
            if not rev or not rev.card:
                return
            if rev.web:
                _orig = rev.web.eval
                rev.web.eval = lambda js: None
            try:
                rev._answerCard(ease)
            finally:
                if rev.web:
                    rev.web.eval = _orig
            if rev.card:
                self._send_card_data(rev.card, is_question=True)
        except Exception as e:
            logger.exception("rate_card error: %s", e)

    # --- Reviewer: Text Evaluation & MC Generation ---

    def _send_reviewer_step(self, phase, label):
        """Send a ThoughtStream step to the React ReviewerView (from background thread)."""
        import time
        import threading as _threading
        try:
            done = _threading.Event()
            def _inject():
                try:
                    self._send_to_frontend('reviewer.aiStep', {"phase": phase, "label": label})
                finally:
                    done.set()
            from aqt import mw
            mw.taskman.run_on_main(_inject)
            done.wait(timeout=2.0)
            time.sleep(0.5)
        except (AttributeError, RuntimeError) as e:
            logger.debug("Could not send reviewer step %s: %s", phase, e)

    def _send_prufer_pipeline_step(self, request_id, step, status, data=None):
        """Emit a unified pipeline_step event for the Prüfer ThinkingIndicator."""
        import json as _json
        payload = {
            'type': 'pipeline_step',
            'step': step,
            'status': status,
            'agent': 'prufer',
            'requestId': request_id,
            'data': data or {},
        }
        try:
            js = "window.dispatchEvent(new CustomEvent('reviewer.pipeline_step', {detail: %s}));" % _json.dumps(payload)
            from aqt import mw
            mw.taskman.run_on_main(lambda js=js: self.web_view.page().runJavaScript(js))
        except (AttributeError, RuntimeError) as e:
            logger.debug("Could not send prufer pipeline step %s: %s", step, e)

    def _msg_evaluate_answer(self, data):
        """Evaluate user's text answer against correct answer via AI."""
        import threading
        import uuid
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            question = parsed.get('question', '')
            user_answer = parsed.get('userAnswer', '')
            correct_answer = parsed.get('correctAnswer', '')

            eval_request_id = str(uuid.uuid4())

            def _run():
                try:
                    # Unified pipeline steps for ThinkingIndicator
                    self._send_prufer_pipeline_step(eval_request_id, 'orchestrating', 'active')
                    self._send_prufer_pipeline_step(eval_request_id, 'orchestrating', 'done', {'agent': 'prufer'})

                    # Legacy reviewer steps (kept for DockLoading)
                    self._send_reviewer_step('analyzing', 'Analysiere Antwort…')
                    self._send_reviewer_step('comparing', 'Vergleiche mit korrekter Antwort…')

                    self._send_prufer_pipeline_step(eval_request_id, 'generating', 'active')
                    self._send_reviewer_step('evaluating', 'KI bewertet…')

                    from ..ai.prufer import evaluate_answer
                    result = evaluate_answer(question, user_answer, correct_answer)

                    self._send_prufer_pipeline_step(eval_request_id, 'generating', 'done')
                    self._send_reviewer_step('done', 'Bewertung abgeschlossen')

                    def _inject():
                        self._send_to_frontend('reviewer.evaluationResult', {**result, '_requestId': eval_request_id})
                    from aqt import mw
                    mw.taskman.run_on_main(_inject)
                except Exception as e:
                    logger.exception("evaluate_answer thread error: %s", e)
                    def _error():
                        self._send_to_frontend('reviewer.evaluationResult', {
                            "score": 50, "feedback": "Fehler bei der Bewertung."
                        })
                    from aqt import mw
                    mw.taskman.run_on_main(_error)

            threading.Thread(target=_run, daemon=True).start()
        except Exception as e:
            logger.exception("_msg_evaluate_answer error: %s", e)

    def _msg_generate_mc(self, data):
        """Generate multiple choice options via AI."""
        import threading
        import uuid
        from aqt import mw
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            question = parsed.get('question', '')
            correct_answer = parsed.get('correctAnswer', '')
            card_id = parsed.get('cardId', None)

            # Get deck context on main thread (Anki collection is not thread-safe)
            from ..custom_reviewer import _get_deck_context_answers_sync
            deck_answers = _get_deck_context_answers_sync(card_id)

            mc_request_id = str(uuid.uuid4())

            def _run():
                try:
                    # Unified pipeline steps for ThinkingIndicator
                    self._send_prufer_pipeline_step(mc_request_id, 'orchestrating', 'active')
                    self._send_prufer_pipeline_step(mc_request_id, 'orchestrating', 'done', {'agent': 'prufer'})

                    # Legacy
                    self._send_reviewer_step('cache', 'Prüfe gespeicherte Optionen…')

                    # Check cache
                    from ..storage.mc_cache import get_cached_mc, save_mc_cache
                    cached = get_cached_mc(card_id, question, correct_answer) if card_id else None
                    if cached:
                        self._send_prufer_pipeline_step(mc_request_id, 'generating', 'done')
                        self._send_reviewer_step('done', 'Aus Cache geladen')
                        def _inject():
                            self._send_to_frontend('reviewer.mcOptions', cached)
                        mw.taskman.run_on_main(_inject)
                        return

                    self._send_prufer_pipeline_step(mc_request_id, 'generating', 'active')
                    self._send_reviewer_step('generating', 'Generiere Multiple-Choice-Optionen…')

                    from ..ai.prufer import generate_mc
                    result = generate_mc(question, correct_answer, deck_answers)

                    # Cache (skip fallbacks)
                    is_fallback = any(
                        opt.get('text', '') in (
                            'Keine der genannten Optionen',
                            'Alle genannten Optionen sind richtig',
                            'Die Frage kann nicht beantwortet werden',
                        ) for opt in result
                    )
                    if card_id and result and len(result) >= 4 and not is_fallback:
                        save_mc_cache(card_id, question, correct_answer, result)

                    self._send_prufer_pipeline_step(mc_request_id, 'generating', 'done')
                    self._send_reviewer_step('done', 'Optionen erstellt')

                    def _inject():
                        self._send_to_frontend('reviewer.mcOptions', result)
                    mw.taskman.run_on_main(_inject)
                except Exception as e:
                    logger.exception("generate_mc thread error: %s", e)
                    def _error():
                        self._send_to_frontend('reviewer.mcOptions', [])
                    mw.taskman.run_on_main(_error)

            threading.Thread(target=_run, daemon=True).start()
        except Exception as e:
            logger.exception("_msg_generate_mc error: %s", e)

