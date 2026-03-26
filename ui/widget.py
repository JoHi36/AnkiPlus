"""
ChatbotWidget Modul
Verwaltet das Web-basierte Chat-UI über QWebEngineView
"""

import os
import json
import uuid
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

    def __init__(self, ai_handler, text, widget_ref, history=None, mode='compact', request_id=None, insights=None):
        super().__init__()
        self._handler_ref = weakref.ref(ai_handler) if ai_handler is not None else None
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None
        self.text = text
        self.history = history
        self.mode = mode
        self.request_id = request_id or str(uuid.uuid4())
        self._cancelled = False
        self.insights = insights

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
                insights=self.insights
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


class SubagentThread(QThread):
    """Generic thread for any subagent — keeps UI responsive."""
    finished_signal = pyqtSignal(str, object)   # agent_name, result dict
    error_signal = pyqtSignal(str, str)         # agent_name, error message

    def __init__(self, agent_name, run_fn, text, **kwargs):
        super().__init__()
        self.agent_name = agent_name
        self.run_fn = run_fn
        self.text = text
        self.kwargs = kwargs

    def run(self):
        try:
            result = self.run_fn(situation=self.text, **self.kwargs)
            self.finished_signal.emit(self.agent_name, result)
        except Exception as e:
            logger.exception("SubagentThread[%s] error: %s", self.agent_name, e)
            self.error_signal.emit(self.agent_name, str(e))


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

    def __init__(self, query, top_k, emb_mgr, widget_ref):
        super().__init__()
        self.query = query
        self.top_k = top_k
        self.emb_mgr = emb_mgr
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None

    def run(self):
        try:
            import re as _re

            # === HYBRID SEARCH: Vector + SQL Keyword ===

            # 1. Vector search (semantic similarity)
            vector_ids = set()
            scores = {}
            query_embs = self.emb_mgr.embed_texts([self.query])
            if query_embs and query_embs[0]:
                results = self.emb_mgr.search(query_embs[0], top_k=self.top_k * 2)
                for cid, score in (results or []):
                    vector_ids.add(cid)
                    scores[cid] = score

            # 2. SQL keyword search (exact matches)
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

            # 3. Merge: dual-match cards first, then vector-only, then sql-only
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
                            cards_data.append({
                                "id": str(cid),
                                "question": question_clean,
                                "deck": deck_name.split("::")[-1],
                                "deckFull": deck_name,
                                "score": round(scores.get(cid, 0), 3),
                                "source": sources.get(cid, "semantic"),
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

            # Adaptive threshold: find threshold that gives 3-5 clusters
            # Start high, decrease until we get enough clusters
            TARGET_CLUSTERS = min(5, max(3, len(card_ids) // 5))
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


class KGDefinitionThread(QThread):
    """Background thread for generating Knowledge Graph term definitions via LLM."""
    result_signal = pyqtSignal(str)  # JSON result string

    def __init__(self, term, widget_ref):
        super().__init__()
        self.term = term
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
            definition = generate_definition(self.term, card_texts)

            # Cache
            source_ids = [cid for cid, _ in top_cards]
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
                }
            }))
        except Exception as e:
            logger.exception("KG definition generation failed for %s", self.term)
            self.result_signal.emit(json.dumps({
                "type": "graph.termDefinition",
                "data": {"term": self.term, "error": str(e)}
            }))


class QuickAnswerThread(QThread):
    """Background thread for generating quick AI answers from card search results."""
    result_signal = pyqtSignal(str)

    def __init__(self, query, cards_data, cluster_info):
        super().__init__()
        self.query = query
        self.cards_data = cards_data
        self.cluster_info = cluster_info

    def run(self):
        try:
            try:
                from ..ai.gemini import generate_quick_answer
            except ImportError:
                from ai.gemini import generate_quick_answer
            result = generate_quick_answer(self.query, self.cards_data, self.cluster_info)
            self.result_signal.emit(json.dumps({
                "type": "graph.quickAnswer",
                "data": result
            }))
        except Exception:
            logger.exception("QuickAnswer failed for: %s", self.query)
            self.result_signal.emit(json.dumps({
                "type": "graph.quickAnswer",
                "data": {"answer": "", "answerable": False, "clusterLabels": {}}
            }))


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
        self._freechat_was_open = False  # preserve FreeChat state across state changes
        self.setup_ui()
        # Card-Tracking wird nach UI-Setup initialisiert
        if self.web_view:
            self.card_tracker = CardTracker(self)

        # Plusi autonomous wake timer — checks every minute
        self._plusi_wake_timer = QTimer()
        self._plusi_wake_timer.timeout.connect(self._check_plusi_wake)
        self._plusi_wake_timer.start(PLUSI_WAKE_CHECK_MS)
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
        self.web_view.load(url)

        layout.addWidget(self.web_view)
        self.setLayout(layout)
    
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

    def _check_plusi_wake(self):
        """Check if Plusi should wake up for autonomous action."""
        try:
            from ..plusi.storage import get_memory
            is_sleeping = get_memory('state', 'is_sleeping', False)
            next_wake = get_memory('state', 'next_wake', None)

            if not is_sleeping or not next_wake:
                return

            from datetime import datetime
            wake_time = datetime.fromisoformat(next_wake)
            if datetime.now() >= wake_time:
                logger.info("plusi wake timer: triggering autonomous chain")
                from ..plusi.agent import run_autonomous_chain
                import threading
                t = threading.Thread(target=run_autonomous_chain, daemon=True)
                t.start()
        except Exception as e:
            logger.exception("plusi wake timer error: %s", e)

    def _send_to_frontend(self, payload_type, data, extra=None):
        """Helper: Sendet Payload an das React-Frontend via ankiReceive."""
        payload = {"type": payload_type, "data": data}
        if extra:
            payload.update(extra)
        self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")

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
            'loadDeckMessages': self._msg_load_deck_messages,
            'saveDeckMessage': self._msg_save_deck_message,
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
            # Utilities
            'openUrl': lambda d: self.bridge.openUrl(d.get('url', '') if isinstance(d, dict) else d),
            'pycmd': self._msg_pycmd,
            'debugLog': self._msg_debug_log,
            'plusiPanel': self._msg_plusi_settings,
            'plusiSettings': self._msg_plusi_settings,
            'subagentDirect': self._msg_subagent_direct,
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
            # Deck-level chat (FreeChat persistence)
            'chat.load': self._msg_load_deck_messages,
            'chat.save': self._msg_save_deck_message,
            'chat.clear': self._msg_clear_deck_messages,
            'chat.stateChanged': self._msg_freechat_state,
            # Stats
            'stats.open': self._msg_open_stats,
            # Card review (React ReviewerView)
            'card.flip': self._msg_flip_card,
            'card.rate': self._msg_rate_card,
            'card.evaluate': self._msg_evaluate_answer,
            'card.mc.generate': self._msg_generate_mc,
            'card.requestCurrent': self._msg_request_current_card,
            # Settings sidebar actions (forwarded from main bridge)
            'sidebarCopyLogs': self._msg_copy_logs,
            'sidebarGetStatus': self._msg_get_sidebar_status,
            'sidebarSetTheme': self._msg_set_theme,
            'sidebarOpenNativeSettings': lambda d: __import__('aqt', fromlist=['mw']).mw.onPrefs(),
            'sidebarOpenUpgrade': self._msg_sidebar_upgrade,
            'sidebarConnect': self._msg_sidebar_connect,
            'sidebarLogout': self._msg_sidebar_logout,
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
                request_id=data.get('requestId'))

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

    def _msg_load_deck_messages(self, data):
        deck_id = data if isinstance(data, (int, str)) else data.get('deckId')
        try:
            deck_id = int(deck_id)
        except (ValueError, TypeError):
            logger.warning("_msg_load_deck_messages: Ungültige deckId: %s", deck_id)
            return
        try:
            from ..storage.card_sessions import load_deck_messages
        except ImportError:
            from storage.card_sessions import load_deck_messages
        messages = load_deck_messages(deck_id, limit=50)
        self._send_to_frontend("deckMessagesLoaded", None, {"type": "deckMessagesLoaded", "deckId": deck_id, "messages": messages})

    def _msg_save_deck_message(self, data):
        msg_data = json.loads(data) if isinstance(data, str) else data
        deck_id = msg_data.get('deckId')
        if deck_id is None:
            logger.warning("_msg_save_deck_message: Missing deckId")
            return
        try:
            deck_id = int(deck_id)
        except (ValueError, TypeError):
            logger.warning("_msg_save_deck_message: Ungültige deckId: %s", deck_id)
            return
        try:
            from ..storage.card_sessions import save_deck_message
        except ImportError:
            from storage.card_sessions import save_deck_message
        save_deck_message(deck_id, msg_data.get('message', {}))

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
        """Return all data needed for the Plusi Menu view."""
        try:
            try:
                from ..plusi.storage import (
                    compute_personality_position, get_memory,
                    get_friendship_data, load_diary, get_category
                )
                from ..config import get_config
            except ImportError:
                from plusi.storage import (
                    compute_personality_position, get_memory,
                    get_friendship_data, load_diary, get_category
                )
                from config import get_config

            # Personality
            position = compute_personality_position()
            trail = get_memory('personality', 'trail', default=[])

            # Current state — mood from most recent diary entry
            state_data = get_category('state')
            last_mood = 'neutral'
            try:
                diary_entries = load_diary(limit=1)
                if diary_entries:
                    last_mood = diary_entries[0].get('mood', 'neutral')
            except Exception as e:
                logger.debug("Could not load last diary mood: %s", e)

            state = {
                'energy': state_data.get('energy', 5),
                'mood': last_mood,
                'obsession': state_data.get('obsession', None),
            }

            # Friendship
            friendship = get_friendship_data()

            # Diary (full list)
            diary = load_diary(limit=50)

            # Autonomy config
            config = get_config()
            autonomy = config.get('plusi_autonomy', {})

            result = {
                'personality': {
                    'position': {'x': position['x'], 'y': position['y']},
                    'quadrant': position['quadrant'],
                    'quadrant_label': position['quadrant_label'],
                    'confident': position['confident'],
                    'trail': trail,
                },
                'state': state,
                'friendship': friendship,
                'diary': diary,
                'autonomy': autonomy,
            }

            self._send_to_frontend_with_event(
                'plusiMenuData', result, 'ankiPlusiMenuDataLoaded'
            )
        except Exception:
            logger.exception("Failed to load Plusi menu data")
            self._send_to_frontend_with_event(
                'plusiMenuData', {}, 'ankiPlusiMenuDataLoaded'
            )

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

        # 2-4. Push theme to all Anki webviews (reviewer, deck browser, overview)
        # NOTE: AnkiWebView.eval() is Anki's built-in JS execution method (not Python eval).
        try:
            from aqt import mw as _mw
            if _mw:
                for wv_source in [
                    lambda: _mw.reviewer.web if _mw.reviewer else None,
                    lambda: _mw.deckBrowser.web if hasattr(_mw, 'deckBrowser') and _mw.deckBrowser else None,
                    lambda: _mw.overview.web if hasattr(_mw, 'overview') and _mw.overview else None,
                ]:
                    try:
                        wv = wv_source()
                        if wv:
                            wv.page().runJavaScript(set_theme_js)
                    except (AttributeError, RuntimeError):
                        pass
        except (AttributeError, RuntimeError):
            pass

        # 5. Plusi panel webview
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

    def _msg_subagent_direct(self, data):
        """Handle @Name subagent direct call from frontend."""
        msg_data = data if isinstance(data, dict) else json.loads(data) if isinstance(data, str) else {}
        agent_name = msg_data.get('agent_name', '')
        text = msg_data.get('text', '')
        extra = {k: v for k, v in msg_data.items() if k not in ('agent_name', 'text')}
        if agent_name and text:
            self._handle_subagent_direct(agent_name, text, extra)

    def _handle_subagent_direct(self, agent_name, text, extra=None):
        """Route @Name messages to the appropriate subagent in a background thread."""
        try:
            from ..ai.agents import AGENT_REGISTRY, lazy_load_run_fn
        except ImportError:
            from ai.agents import AGENT_REGISTRY, lazy_load_run_fn
        agent = AGENT_REGISTRY.get(agent_name)
        if not agent:
            logger.warning("Unknown subagent: %s", agent_name)
            return
        if not self.config.get(agent.enabled_key, False):
            logger.info("Subagent %s is disabled", agent_name)
            return
        run_fn = lazy_load_run_fn(agent)
        kwargs = {**agent.extra_kwargs, **(extra or {})}
        thread = SubagentThread(agent_name, run_fn, text, **kwargs)
        thread.finished_signal.connect(self._on_subagent_finished)
        thread.error_signal.connect(self._on_subagent_error)
        self._active_subagent_thread = thread
        thread.start()

    def _on_subagent_finished(self, agent_name, result):
        """Handle subagent result on main thread — emit to JS + run agent-specific side effects."""
        try:
            payload = {
                'type': 'subagent_result',
                'agent_name': agent_name,
                'result': result,  # Pass full result dict — agent-specific
                # Legacy Plusi fields for backwards compatibility
                'text': result.get('text', ''),
                'mood': result.get('mood', 'neutral'),
                'meta': result.get('meta', ''),
                'friendship': result.get('friendship', {}),
                'silent': result.get('silent', False),
                'error': result.get('error', False),
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(payload)});"
            )
            # Run agent-specific post-processing (mood sync, panel notify, etc.)
            try:
                from ..ai.agents import AGENT_REGISTRY
            except ImportError:
                from ai.agents import AGENT_REGISTRY
            agent = AGENT_REGISTRY.get(agent_name)
            if agent and agent.on_finished:
                try:
                    agent.on_finished(self, agent_name, result)
                except Exception as e:
                    logger.error("Subagent[%s] on_finished error: %s", agent_name, e)
        except Exception as e:
            logger.error("Subagent[%s] finished handler error: %s", agent_name, e)

    def _on_subagent_error(self, agent_name, error_msg):
        """Handle subagent error on main thread."""
        logger.error("Subagent[%s] error: %s", agent_name, error_msg)
        payload = {
            'type': 'subagent_result',
            'agent_name': agent_name,
            'text': '',
            'error': True,
        }
        self.web_view.page().runJavaScript(
            f"window.ankiReceive({json.dumps(payload)});"
        )

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

    def handle_message_from_ui(self, message: str, history=None, mode='compact', request_id=None):
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
            self._ai_thread = AIRequestThread(ai, text, self, history=history, mode=mode, request_id=request_id, insights=card_insights)
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

    def on_msg_event(self, request_id, event_type, data):
        """Handle v2 structured message events from the AI thread — delivered via Qt signal."""
        if event_type in ('msg_start', 'agent_cell', 'msg_done', 'text_chunk'):
            chunk_preview = ''
            if event_type == 'text_chunk' and isinstance(data, dict):
                chunk_preview = ' chunk=%d' % len(data.get('chunk', ''))
            logger.info("[v2-signal] on_msg_event: type=%s, data_is_dict=%s%s",
                        event_type, isinstance(data, dict), chunk_preview)
        payload = {"type": event_type}
        if isinstance(data, dict):
            payload.update(data)
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

    # ── Deck/Overview/FreeChat Action Handlers (SP2 unification) ──

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

    def _msg_clear_deck_messages(self, data=None):
        try:
            try:
                from ..storage.card_sessions import clear_deck_messages
            except ImportError:
                from storage.card_sessions import clear_deck_messages
            count = clear_deck_messages()
            self._send_to_frontend("chat.messagesCleared", {"count": count})
        except (ImportError, AttributeError, RuntimeError) as e:
            logger.error("clear_deck_messages error: %s", e)

    def _msg_freechat_state(self, data):
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            self._freechat_was_open = parsed.get('open', False)
        except (json.JSONDecodeError, AttributeError, TypeError) as e:
            logger.debug("Could not parse freechat state: %s", e)

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
            self._send_to_frontend(event_type, {
                "cardId": card.id,
                "frontHtml": front_html,
                "backHtml": back_html,
                "frontField": front_field,
                "backField": back_field,
                "deckId": card.did,
                "deckName": mw.col.decks.name(card.did),
                "isQuestion": is_question,
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
        """Set theme preference."""
        try:
            theme = data if isinstance(data, str) else (json.loads(data) if data else 'dark')
            update_config({'theme': theme})
            self._send_to_frontend('themeChanged', {'theme': theme})
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

    def _msg_sidebar_logout(self, data=None):
        """Clear auth tokens."""
        try:
            update_config({'auth_token': '', 'auth_validated': False})
            self._send_to_frontend('authStatusLoaded', {'isAuthenticated': False})
        except (AttributeError, RuntimeError) as e:
            logger.warning("sidebar_logout: %s", e)

    def _msg_copy_logs(self, data=None):
        """Copy recent logs + system info to clipboard."""
        import platform
        try:
            from ..utils.logging import get_recent_logs
        except ImportError:
            from utils.logging import get_recent_logs
        try:
            from ..config import get_config
        except ImportError:
            from config import get_config
        try:
            config = get_config()
            header = (
                f"AnkiPlus Debug Report\n"
                f"Platform: {platform.platform()}\n"
                f"Python: {platform.python_version()}\n"
                f"Theme: {config.get('theme', 'dark')}\n"
                f"Tier: {config.get('tier', 'free')}\n"
                f"Auth: {config.get('auth_validated', False)}\n"
                f"{'=' * 60}\n"
            )
            logs = get_recent_logs(max_age_seconds=600)
            text = header + "\n".join(logs) if logs else header + "(keine Logs)"
            clipboard = QApplication.clipboard()
            if clipboard:
                clipboard.setText(text)
                logger.info("Logs copied to clipboard (%d lines)", len(logs))
                self._send_to_frontend('sidebarLogsCopied', {})
        except Exception:
            logger.exception("_msg_copy_logs failed")

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
            self._send_to_js({"type": "kg.cardTerms", "data": {"cardId": card_id, "terms": terms}})
        except Exception:
            logger.exception("getCardKGTerms failed")
            self._send_to_js({"type": "kg.cardTerms", "data": {"terms": []}})

    def _msg_get_term_definition(self, data):
        """Check cache first; if miss, launch QThread to generate definition."""
        try:
            term = data.get("term", "") if isinstance(data, dict) else str(data)
            try:
                from ..storage.kg_store import get_definition, get_connected_terms
            except ImportError:
                from storage.kg_store import get_definition, get_connected_terms
            cached = get_definition(term)
            if cached:
                cached["connectedTerms"] = get_connected_terms(term)
                self._send_to_js({"type": "graph.termDefinition", "data": cached})
                return
            self._start_kg_definition(term)
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

    def _msg_search_cards(self, data):
        """Find top-N cards by embedding similarity. Runs in QThread to avoid blocking."""
        query = data.get("query", "") if isinstance(data, dict) else str(data)
        top_k = data.get("topK", 25) if isinstance(data, dict) else 25

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
            cards = data.get("cards", [])[:10]
            clusters = data.get("clusters", [])
            if query and cards:
                self._start_quick_answer(query, cards, clusters)
        except Exception:
            logger.exception("Failed to send search cards result")

    def _start_quick_answer(self, query, cards_data, clusters):
        """Launch QuickAnswerThread after search completes (must be called on main thread)."""
        logger.info("Starting quick answer for: %s (%d cards, %d clusters)", query, len(cards_data), len(clusters))
        cluster_info = {}
        for c in clusters:
            cluster_info[c["id"]] = [card.get("question", "")[:40] for card in c.get("cards", [])[:3]]
        self._quick_answer_thread = QuickAnswerThread(query, cards_data, cluster_info)
        self._quick_answer_thread.result_signal.connect(self._on_quick_answer_result)
        self._quick_answer_thread.start()

    def _on_quick_answer_result(self, result_json):
        """Handle QuickAnswerThread result."""
        try:
            self._send_to_js(json.loads(result_json))
        except Exception:
            logger.exception("Failed to send quick answer")

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

    def _start_kg_definition(self, term):
        """Launch background thread for definition generation."""
        self._kg_def_thread = KGDefinitionThread(term, self)
        self._kg_def_thread.result_signal.connect(self._on_kg_result)
        self._kg_def_thread.start()

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

    def _msg_evaluate_answer(self, data):
        """Evaluate user's text answer against correct answer via AI."""
        import threading
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            question = parsed.get('question', '')
            user_answer = parsed.get('userAnswer', '')
            correct_answer = parsed.get('correctAnswer', '')

            def _run():
                try:
                    self._send_reviewer_step('analyzing', 'Analysiere Antwort…')
                    self._send_reviewer_step('comparing', 'Vergleiche mit korrekter Antwort…')
                    self._send_reviewer_step('evaluating', 'KI bewertet…')

                    from ..custom_reviewer import _call_ai_evaluation
                    result = _call_ai_evaluation(question, user_answer, correct_answer)

                    self._send_reviewer_step('done', 'Bewertung abgeschlossen')

                    def _inject():
                        self._send_to_frontend('reviewer.evaluationResult', result)
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
        from aqt import mw
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            question = parsed.get('question', '')
            correct_answer = parsed.get('correctAnswer', '')
            card_id = parsed.get('cardId', None)

            # Get deck context on main thread (Anki collection is not thread-safe)
            from ..custom_reviewer import _get_deck_context_answers_sync
            deck_answers = _get_deck_context_answers_sync(card_id)

            def _run():
                try:
                    self._send_reviewer_step('cache', 'Prüfe gespeicherte Optionen…')

                    # Check cache
                    from ..storage.mc_cache import get_cached_mc, save_mc_cache
                    cached = get_cached_mc(card_id, question, correct_answer) if card_id else None
                    if cached:
                        self._send_reviewer_step('done', 'Aus Cache geladen')
                        def _inject():
                            self._send_to_frontend('reviewer.mcOptions', cached)
                        mw.taskman.run_on_main(_inject)
                        return

                    self._send_reviewer_step('generating', 'Generiere Multiple-Choice-Optionen…')

                    from ..custom_reviewer import _call_ai_mc_generation
                    result = _call_ai_mc_generation(question, correct_answer, deck_answers)

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

                    import random
                    random.shuffle(result)

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

