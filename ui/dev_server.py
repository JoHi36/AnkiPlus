"""
Dev Dashboard — HTTP server running inside Anki as a background thread.

Full access to embeddings, card DB, config. Only available via
Tools → Dev Dashboard menu item. Localhost only.

Usage (from Anki):
    from ui.dev_server import start_dev_server, stop_dev_server
    start_dev_server()  # Opens browser to localhost:8090
"""
import json
import os
import re
import threading
import time
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

DEV_PORT = 8090
_server = None
_thread = None


def start_dev_server():
    """Start the dev dashboard server in a background thread."""
    global _server, _thread
    if _server is not None:
        # Already running — just open browser
        webbrowser.open(f'http://localhost:{DEV_PORT}')
        return

    try:
        _server = HTTPServer(('127.0.0.1', DEV_PORT), _DevHandler)
        _thread = threading.Thread(target=_server.serve_forever, daemon=True)
        _thread.start()
        logger.info("Dev Dashboard started on http://localhost:%d", DEV_PORT)
        webbrowser.open(f'http://localhost:{DEV_PORT}')
    except OSError as e:
        logger.warning("Dev Dashboard failed to start: %s", e)
        _server = None


def stop_dev_server():
    """Stop the dev dashboard server."""
    global _server, _thread
    if _server:
        _server.shutdown()
        _server = None
        _thread = None
        logger.info("Dev Dashboard stopped")


# ── Pipeline runner (runs inside Anki — full access) ─────────────────────────

def _run_query(agent, query, card_context=None, history=None):
    """Run a query through the real pipeline with tracing.

    Runs on Anki's main thread to ensure DB access works correctly.
    """
    import threading
    from aqt import mw

    # Run on main thread (required for mw.col access)
    result_holder = [None]
    done_event = threading.Event()

    def _on_main():
        result_holder[0] = _run_query_impl(agent, query, card_context, history)
        done_event.set()

    if mw and mw.taskman:
        mw.taskman.run_on_main(_on_main)
        done_event.wait(timeout=120)  # Max 2 min
        return result_holder[0] or {"error": "Timeout", "trace": {}, "response": "", "citations": []}
    else:
        return _run_query_impl(agent, query, card_context, history)


def _run_query_impl(agent, query, card_context=None, history=None):
    """Actual pipeline execution (must run on main thread)."""
    from aqt import mw

    try:
        from ..ai.pipeline_trace import PipelineTrace
    except ImportError:
        from ai.pipeline_trace import PipelineTrace

    trace = PipelineTrace(agent=agent, query=query, card_context=card_context)

    try:
        from ..config import get_config
    except ImportError:
        from config import get_config
    config = get_config() or {}

    # ── Router ──
    trace.step("router", "running")
    rag_analysis = None
    try:
        try:
            from ..ai.rag_analyzer import analyze_query
        except ImportError:
            from ai.rag_analyzer import analyze_query
        rag_analysis = analyze_query(
            query, card_context=card_context,
            chat_history=history or [], config=config)
        trace.step("router", "done", {
            "search_needed": getattr(rag_analysis, 'search_needed', True),
            "resolved_intent": getattr(rag_analysis, 'resolved_intent', ''),
            "retrieval_mode": getattr(rag_analysis, 'retrieval_mode', 'both'),
            "precise_queries": getattr(rag_analysis, 'precise_queries', []),
            "broad_queries": getattr(rag_analysis, 'broad_queries', []),
            "associated_terms": getattr(rag_analysis, 'associated_terms', []),
        })
    except Exception as e:
        trace.step("router", "error", {"error": str(e)[:200]})

    # ── Get shared resources ──
    emb = None
    try:
        try:
            from .. import get_embedding_manager
        except ImportError:
            from __init__ import get_embedding_manager
        emb = get_embedding_manager()
    except Exception:
        pass

    rag_fn = None
    try:
        try:
            from ..ai.rag import rag_retrieve_cards
        except ImportError:
            from ai.rag import rag_retrieve_cards
        rag_fn = rag_retrieve_cards
    except Exception:
        pass

    # ── RAG Retrieval (local: KG + SQL + Semantic + Merge) ──
    rag_result = None
    rag_context = None
    source_lines = []
    confidence = 'medium'
    if rag_analysis is None or getattr(rag_analysis, 'search_needed', True):
        try:
            try:
                from ..ai.rag_pipeline import retrieve as rag_retrieve
            except ImportError:
                from ai.rag_pipeline import retrieve as rag_retrieve

            rag_result = rag_retrieve(
                agent_name=agent,
                user_message=query,
                context=card_context,
                config=config,
                routing_result=rag_analysis,
                emit_step=trace.step,
                embedding_manager=emb,
                rag_retrieve_fn=rag_fn,
                defer_post_retrieval=True,
            )
            if rag_result and rag_result.rag_context:
                rag_context = rag_result.rag_context
                source_lines = getattr(rag_result, '_deferred_lines', [])
                confidence = getattr(rag_result, '_deferred_conf', 'medium')
        except Exception as e:
            trace.step("retrieval", "error", {"error": str(e)[:200]})

    # ── Backend Pipeline (Reranker + Generation in one call) ──
    trace.step("generating", "running")
    text = ''
    cites = []
    try:
        import requests as _http
        try:
            from ..config import get_backend_url, get_auth_token
        except ImportError:
            from config import get_backend_url, get_auth_token

        backend_url = get_backend_url()
        auth_token = get_auth_token()

        if backend_url and source_lines:
            resolved = getattr(rag_analysis, 'resolved_intent', '') if rag_analysis else ''
            payload = {
                'question': query,
                'sources': source_lines,
                'resolved_intent': resolved,
                'confidence': confidence,
                'card_context': card_context,
                'history': history or [],
                'agent': agent,
                'mode': 'compact',
            }
            headers = {'Content-Type': 'application/json'}
            if auth_token:
                headers['Authorization'] = 'Bearer %s' % auth_token

            _gen_start = time.time()
            _first_token_time = [None]
            resp = _http.post(
                '%s/pipeline' % backend_url.rstrip('/'),
                json=payload, headers=headers, timeout=60,
                stream=True,
            )
            resp.raise_for_status()

            # Parse SSE stream
            rr = {}
            web_sources_data = []
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith('data: '):
                    continue
                payload_str = line[6:]
                if payload_str == '[DONE]':
                    break
                try:
                    evt = json.loads(payload_str)
                    evt_type = evt.get('type', '')
                    if evt_type == 'reranker':
                        rr = evt
                        trace.step("reranker", "done", {
                            "relevant_count": len(evt.get('relevant_indices', [])),
                            "total_count": len(source_lines),
                            "web_search": evt.get('web_search', False),
                            "elapsed_ms": evt.get('elapsed_ms', 0),
                        })
                        web_sources_data = evt.get('web_sources', [])
                    elif evt_type == 'text':
                        chunk = evt.get('text', '')
                        if chunk:
                            if _first_token_time[0] is None:
                                _first_token_time[0] = time.time()
                                ttft = int((_first_token_time[0] - _gen_start) * 1000)
                                trace.step("first_token", "done", {"ttft_ms": ttft})
                            text += chunk
                    elif evt_type == 'done':
                        pass
                except (json.JSONDecodeError, KeyError):
                    pass

            gen_ms = int((time.time() - _gen_start) * 1000)

            # Build citations from rag_result
            try:
                from ..ai.citation_builder import CitationBuilder
            except ImportError:
                from ai.citation_builder import CitationBuilder
            citation_builder = CitationBuilder()
            if rag_result and hasattr(rag_result, 'citations') and rag_result.citations:
                old_citations = rag_result.citations
                # Filter to only reranker-approved indices
                rel_set = set(rr.get('relevant_indices', []))
                sorted_cits = sorted(old_citations.values(), key=lambda c: c.get('index', 999))
                for cdata in sorted_cits:
                    if rel_set and cdata.get('index') and cdata['index'] not in rel_set:
                        continue
                    if cdata.get('type') == 'web':
                        citation_builder.add_web(
                            url=cdata.get('url', ''), title=cdata.get('title', ''),
                            domain=cdata.get('domain', ''))
                    else:
                        _fields = cdata.get('fields', {})
                        _fvals = list(_fields.values())
                        citation_builder.add_card(
                            card_id=int(cdata.get('cardId', cdata.get('noteId', 0))),
                            note_id=int(cdata.get('noteId', 0)),
                            deck_name=cdata.get('deckName', ''),
                            front=cdata.get('question', _fvals[0][:200] if _fvals else ''),
                            back=cdata.get('answer', _fvals[1][:200] if len(_fvals) > 1 else ''),
                            sources=cdata.get('sources', []))
                # Add web sources from backend
                for ws in web_sources_data:
                    citation_builder.add_web(url=ws.get('url', ''), title=ws.get('title', ''))

            cites = citation_builder.build()
            trace.set_response(text, cites)
            trace.step("sources_ready", "done", {"citations": cites})
            trace.step("generating", "done", {
                "response_length": len(text),
                "citation_count": len(cites),
                "backend_ms": gen_ms,
            })
        else:
            # Fallback: no sources or no backend — return empty
            trace.step("generating", "done", {"response_length": 0})
    except Exception as e:
        import traceback
        traceback.print_exc()
        trace.step("generating", "error", {"error": str(e)[:200]})
        text = "Error: %s" % e

    return {"trace": trace.to_dict(), "response": text, "citations": cites}


def _load_card(card_id):
    """Load card from Anki's live collection."""
    from aqt import mw
    try:
        if not mw or not mw.col:
            return {"error": "Anki collection not loaded"}
        card = mw.col.get_card(card_id)
        note = card.note()
        fields = {n: v[:500] for n, v in zip(note.keys(), note.values())}
        deck = mw.col.decks.get(card.did)
        q = fields.get(note.keys()[0], '') if note.keys() else ''
        a = fields.get(note.keys()[1], '') if len(note.keys()) > 1 else ''
        return {"cardId": card_id, "noteId": note.id,
                "question": q, "answer": a, "fields": fields,
                "deckName": deck['name'] if deck else ''}
    except Exception as e:
        return {"error": str(e)}


# ── API helpers for dashboard tabs ────────────────────────────────────────────

def _get_pipeline_info():
    """Return pipeline structure, agent configs, and docs for the dashboard."""
    try:
        from ..ai.rag_pipeline import CONFIGS
    except ImportError:
        from ai.rag_pipeline import CONFIGS

    configs = {}
    for name, cfg in CONFIGS.items():
        configs[name] = {
            'search_scope': cfg.search_scope,
            'max_notes': cfg.max_notes,
            'use_reranker': cfg.use_reranker,
            'web_search_enabled': cfg.web_search_enabled,
            'inject_current_card': cfg.inject_current_card,
            'context_format': cfg.context_format,
            'triggered_by': cfg.triggered_by,
        }

    # Load markdown docs
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    docs = {}
    for name, path in [
        ('agents', 'docs/agents/overview.md'),
        ('retrieval', 'docs/reference/RETRIEVAL_SYSTEM.md'),
    ]:
        try:
            with open(os.path.join(base, path), 'r') as f:
                docs[name] = f.read()[:8000]
        except (FileNotFoundError, OSError):
            docs[name] = ''

    return {
        'configs': configs,
        'docs': docs,
        'pipeline_steps': [
            {'name': 'Router', 'model': 'gemini-2.5-flash-lite', 'desc': 'Entscheidet ob Suche nötig ist, extrahiert resolved_intent und associated_terms. Läuft auf Backend /router.'},
            {'name': 'KG Enrichment', 'model': 'local + embedding API', 'desc': 'Tier 1: Terme aus User-Frage. Tier 2: Terme aus resolved_intent. Beide werden embedded und gegen Knowledge Graph gematcht. Baut SQL-Queries.'},
            {'name': 'SQL Search', 'model': 'mw.col.find_cards()', 'desc': 'Anki-Volltextsuche mit Tier-1/2-Queries. Findet Karten die exakte Begriffe enthalten.'},
            {'name': 'Semantic Search', 'model': 'Embedding cosine similarity', 'desc': 'Vektor-Ähnlichkeitssuche. Findet Karten die inhaltlich ähnlich sind, auch ohne exakte Wortübereinstimmung.'},
            {'name': 'RRF Merge', 'model': 'Reciprocal Rank Fusion', 'desc': 'Kombiniert SQL + Semantic Ergebnisse. Karten die in beiden vorkommen werden hochgestuft. Berechnet Confidence (high/medium/low).'},
            {'name': 'Reranker', 'model': 'gemini-2.5-flash-lite', 'desc': 'LLM bewertet jede Quelle auf Relevanz. Filtert irrelevante raus. Entscheidet ob Web-Suche nötig ist (aktuelle Studien, Lücken).'},
            {'name': 'Web Search', 'model': 'Perplexity Sonar', 'desc': 'Nur wenn Reranker "web_search: true" sagt. Nutzt resolved_intent + Kartenkontext als Query. Spekulativ gestartet nach Router.'},
            {'name': 'Generation', 'model': 'gemini-3-flash-preview', 'desc': 'Generiert Antwort aus gefilterten Quellen. Zitiert mit [N]. Läuft auf Backend /chat.'},
        ],
    }


def _get_benchmarks():
    """Return benchmark history and latest results."""
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    result = {'history': [], 'latest': None}

    # Load history
    hist_dir = os.path.join(base, 'benchmark', 'history')
    if os.path.isdir(hist_dir):
        for fname in sorted(os.listdir(hist_dir)):
            if fname.endswith('.json'):
                try:
                    with open(os.path.join(hist_dir, fname), 'r') as f:
                        data = json.loads(f.read())
                    pct = fname.split('_')[-1].replace('.json', '').replace('pct', '')
                    date = fname[:10]
                    result['history'].append({
                        'date': date, 'recall_pct': pct, 'file': fname,
                    })
                except (json.JSONDecodeError, OSError):
                    pass

    # Load latest results
    results_path = os.path.join(base, 'benchmark', 'results.json')
    if os.path.isfile(results_path):
        try:
            with open(results_path, 'r') as f:
                result['latest'] = json.loads(f.read())
        except (json.JSONDecodeError, OSError):
            pass

    return result


# ── HTTP Handler ─────────────────────────────────────────────────────────────

class _DevHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/', ''):
            body = _get_dashboard_html().encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
        elif path.startswith('/api/card/'):
            try:
                self._json(_load_card(int(path.split('/')[-1])))
            except ValueError:
                self._json({"error": "Invalid card ID"}, 400)
        elif path == '/api/pipeline-info':
            self._json(_get_pipeline_info())
        elif path == '/api/benchmarks':
            self._json(_get_benchmarks())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path == '/api/query':
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            query = body.get('query', '')
            if not query:
                return self._json({"error": "query required"}, 400)
            logger.info("Dev query [%s]: %s", body.get('agent', 'tutor'), query[:60])
            try:
                result = _run_query(
                    body.get('agent', 'tutor'), query,
                    body.get('card_context'), body.get('history', []))
                self._json(result)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._json({"error": str(e)}, 500)
        else:
            self.send_response(404)
            self.end_headers()


def _get_dashboard_html():
    """Return the dashboard HTML — responsive, tabbed layout.

    NOTE: This is a localhost-only dev tool (127.0.0.1), not user-facing.
    All data comes from trusted local APIs. DOM construction uses textContent
    for untrusted card data; structural HTML uses safe static templates.
    """
    # Load from external file if it exists, otherwise use embedded
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ext = os.path.join(base, 'ui', 'dev_dashboard.html')
    if os.path.isfile(ext):
        with open(ext, 'r') as f:
            return f.read()
    return '<html><body><h1>dev_dashboard.html not found</h1></body></html>'
