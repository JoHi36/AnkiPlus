"""
Dev Dashboard Server — Live Test + Agent Logs + Pipeline Visualization.

Usage:
    python3 scripts/dev_serve.py [--port 8090]
"""
import json
import os
import sys
import time
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'ai'))  # For bare imports (gemini, rag, etc.)

# Mock aqt if not running inside Anki — but load real config
if 'aqt' not in sys.modules:
    from unittest.mock import MagicMock

    # Load real config from config.json BEFORE mocking
    _config_path = os.path.join(PROJECT_ROOT, 'config.json')
    _real_config = {}
    if os.path.exists(_config_path):
        with open(_config_path) as f:
            _real_config = json.load(f)

    # Create a minimal aqt mock that returns real config values
    _mw_mock = MagicMock()
    _mw_mock.col = None  # No Anki collection
    _mw_mock.taskman = None

    # Make mw._chatbot_config.get() return real config values
    _mw_mock._chatbot_config = _real_config

    _aqt_mock = MagicMock()
    _aqt_mock.mw = _mw_mock

    sys.modules['aqt'] = _aqt_mock
    sys.modules['aqt.qt'] = MagicMock()
    sys.modules['aqt.utils'] = MagicMock()
    sys.modules['anki'] = MagicMock()
    sys.modules['anki.collection'] = MagicMock()

    # Patch config module to use real config.json
    import config as _cfg
    _cfg._config = _real_config
    _cfg._config_loaded = True

_sessions = {}
_MAX_TRACES = 50


def _get_session(sid):
    if sid not in _sessions:
        _sessions[sid] = {"history": [], "traces": []}
    return _sessions[sid]


def run_live_query(agent, query, card_context=None, history=None):
    """Run a query through the full pipeline with tracing."""
    from ai.pipeline_trace import PipelineTrace
    trace = PipelineTrace(agent=agent, query=query, card_context=card_context)

    try:
        from config import get_config
        config = get_config() or {}
    except Exception:
        config = {}

    # ── 1. Router ──
    trace.step("router", "running")
    rag_analysis = None
    try:
        from ai.rag_analyzer import analyze_query
        rag_analysis = analyze_query(
            query, card_context=card_context,
            chat_history=history or [], config=config,
        )
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

    # ── 2. Tutor Agent (RAG + Reranker + Generation) ──
    # run_tutor handles the full pipeline internally:
    # retrieve_rag_context → reranker → web search → generation → citations
    try:
        from ai.tutor import run_tutor
        from ai.citation_builder import CitationBuilder

        citation_builder = CitationBuilder()

        # Get embedding manager
        emb = None
        try:
            from ai.embeddings import EmbeddingManager
            emb = EmbeddingManager()
            emb.load_index()
        except Exception:
            pass

        result = run_tutor(
            situation=query,
            emit_step=trace.step,
            stream_callback=lambda chunk, done: None,
            citation_builder=citation_builder,
            context=card_context,
            history=history or [],
            config=config,
            rag_analysis=rag_analysis,
            embedding_manager=emb,
        )

        text = result.get('text', '') if isinstance(result, dict) else str(result)
        cites = result.get('citations', []) if isinstance(result, dict) else []
        trace.set_response(text, cites)

    except Exception as e:
        import traceback
        traceback.print_exc()
        trace.step("generation", "error", {"error": str(e)[:200]})
        text = f"Error: {e}"
        cites = []

    return {"trace": trace.to_dict(), "response": text, "citations": cites}


def load_card(card_id):
    try:
        from aqt import mw
        if not mw or not mw.col:
            return {"error": "Anki not running"}
        card = mw.col.get_card(card_id)
        note = card.note()
        fields = {n: v[:500] for n, v in zip(note.keys(), note.values())}
        deck = mw.col.decks.get(card.did)
        q = fields.get(note.keys()[0], '') if note.keys() else ''
        a = fields.get(note.keys()[1], '') if len(note.keys()) > 1 else ''
        return {"cardId": card_id, "noteId": note.id, "question": q,
                "answer": a, "fields": fields,
                "deckName": deck['name'] if deck else ''}
    except ImportError:
        return {"error": "Anki not available"}
    except Exception as e:
        return {"error": str(e)}


# ── Dashboard HTML ───────────────────────────────────────────────────────────

DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>AnkiPlus Dev — Live Test</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111;color:#e0e0e0}
.container{max-width:1200px;margin:0 auto;padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;height:100vh}
h1{grid-column:1/-1;font-size:20px;color:#0A84FF;margin-bottom:0}
.panel{background:#1C1C1E;border-radius:12px;padding:16px;overflow-y:auto}
.panel h2{font-size:14px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.input-group{margin-bottom:12px}
.input-group label{display:block;font-size:12px;color:#888;margin-bottom:4px}
.input-group select,.input-group input,.input-group textarea{width:100%;padding:8px 12px;background:#2C2C2E;border:1px solid #3A3A3C;border-radius:8px;color:#e0e0e0;font-size:14px;outline:none}
.input-group textarea{min-height:60px;resize:vertical}
.input-group select:focus,.input-group input:focus,.input-group textarea:focus{border-color:#0A84FF}
button{padding:8px 20px;background:#0A84FF;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px}
button:hover{background:#0070E0}
button:disabled{background:#3A3A3C;cursor:not-allowed}
.btn-row{display:flex;gap:8px;margin-top:8px}
.btn-secondary{background:#3A3A3C}
.chat-messages{max-height:300px;overflow-y:auto;margin-bottom:12px}
.msg{padding:8px 12px;margin-bottom:8px;border-radius:8px;font-size:13px;white-space:pre-wrap}
.msg-user{background:#0A84FF22;border-left:3px solid #0A84FF}
.msg-bot{background:#1E1E1E;border-left:3px solid #30D158}
.msg-meta{font-size:11px;color:#666;margin-top:4px}
.step{display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #2C2C2E;font-size:13px}
.step-dot{width:8px;height:8px;border-radius:50%;margin-right:10px;flex-shrink:0}
.step-dot.done{background:#30D158}.step-dot.error{background:#FF453A}.step-dot.running{background:#FFD60A}
.step-name{width:130px;flex-shrink:0;font-weight:600}
.step-time{width:70px;flex-shrink:0;color:#888;text-align:right;margin-right:12px}
.step-summary{color:#aaa;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.step-detail{font-size:11px;color:#666;padding:4px 0 4px 148px;border-bottom:1px solid #2C2C2E}
.card-preview{background:#2C2C2E;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px}
.card-preview .deck{color:#FFD60A;font-size:11px}
.card-preview .q{color:#e0e0e0;margin-top:4px}
.total-bar{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;font-weight:600;border-top:2px solid #3A3A3C;margin-top:8px}
.total-bar .time{color:#0A84FF}
.loading{text-align:center;padding:40px;color:#666}
.spinner{display:inline-block;width:20px;height:20px;border:2px solid #3A3A3C;border-top-color:#0A84FF;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.expandable{cursor:pointer}.expandable:hover .step-name{color:#0A84FF}
.step-data{display:none;font-size:11px;color:#888;padding:6px 12px 6px 148px;background:#161618;border-bottom:1px solid #2C2C2E;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto}
</style></head><body>
<div class="container">
<h1>AnkiPlus Dev — Live Test</h1>
<div class="panel">
<h2>Anfrage</h2>
<div class="input-group"><label>Agent</label>
<select id="agent"><option value="tutor" selected>Tutor</option>
<option value="research" disabled>Research (coming)</option>
<option value="plusi" disabled>Plusi (coming)</option></select></div>
<div class="input-group"><label>Karten-ID (optional)</label>
<div class="btn-row"><input type="text" id="cardId" placeholder="z.B. 1584183120624">
<button onclick="loadCard()" class="btn-secondary">Laden</button></div></div>
<div id="cardPreview"></div>
<div class="input-group"><label>Frage</label>
<textarea id="query" placeholder="was ist glycin?"></textarea></div>
<div class="btn-row"><button onclick="sendQuery()" id="sendBtn">Senden</button>
<button onclick="clearChat()" class="btn-secondary">Chat leeren</button></div>
<h2 style="margin-top:20px">Chat-Verlauf</h2>
<div class="chat-messages" id="chatMessages"></div>
</div>
<div class="panel">
<h2>Pipeline Log</h2>
<div id="pipelineLog"><div class="loading">Sende eine Anfrage um die Pipeline zu sehen.</div></div>
</div>
</div>
<script>
let sessionId='dev-'+Date.now(),chatHistory=[],currentCard=null;
function el(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e}
function txt(s){return document.createTextNode(s)}

async function loadCard(){
  const id=document.getElementById('cardId').value.trim();
  if(!id)return;
  const res=await fetch('/api/card/'+id);
  const d=await res.json();
  const box=document.getElementById('cardPreview');
  box.textContent='';
  if(d.error){const p=el('div','card-preview');p.style.color='#FF453A';p.appendChild(txt('Fehler: '+d.error));box.appendChild(p);currentCard=null}
  else{currentCard=d;const p=el('div','card-preview');const dk=el('div','deck');dk.appendChild(txt(d.deckName||''));p.appendChild(dk);
    const q=el('div','q');q.appendChild(txt((d.question||'').replace(/<[^>]+>/g,'').substring(0,150)));p.appendChild(q);box.appendChild(p)}
}

async function sendQuery(){
  const query=document.getElementById('query').value.trim();
  if(!query)return;
  const agent=document.getElementById('agent').value;
  document.getElementById('sendBtn').disabled=true;
  document.getElementById('sendBtn').textContent='Läuft...';
  const log=document.getElementById('pipelineLog');
  log.textContent='';const ld=el('div','loading');const sp=el('div','spinner');ld.appendChild(sp);ld.appendChild(document.createElement('br'));ld.appendChild(txt('Pipeline läuft...'));log.appendChild(ld);
  addMsg('user',query);
  document.getElementById('query').value='';
  try{
    const res=await fetch('/api/query',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({agent,query,card_context:currentCard,history:chatHistory,session_id:sessionId})});
    const data=await res.json();
    const t=data.trace||{};
    addMsg('bot',data.response||'Keine Antwort',t.step_count+' steps, '+t.total_ms+'ms, '+t.source_count+' sources');
    chatHistory.push({role:'user',content:query},{role:'assistant',content:data.response||''});
    renderPipeline(t);
  }catch(e){addMsg('bot','Fehler: '+e.message,'error')}
  document.getElementById('sendBtn').disabled=false;
  document.getElementById('sendBtn').textContent='Senden';
}

function addMsg(role,text,meta){
  const c=document.getElementById('chatMessages');
  const d=el('div','msg msg-'+role);d.appendChild(txt(text.substring(0,500)));
  if(meta){const m=el('div','msg-meta');m.appendChild(txt(meta));d.appendChild(m)}
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}

function clearChat(){
  chatHistory=[];
  document.getElementById('chatMessages').textContent='';
  const log=document.getElementById('pipelineLog');log.textContent='';
  const ld=el('div','loading');ld.appendChild(txt('Sende eine Anfrage.'));log.appendChild(ld);
}

function renderPipeline(trace){
  const log=document.getElementById('pipelineLog');log.textContent='';
  const steps=trace.steps||[];
  steps.forEach((s,i)=>{
    const row=el('div','step expandable');
    const dot=el('div','step-dot '+s.status);row.appendChild(dot);
    const name=el('div','step-name');name.appendChild(txt(s.name));row.appendChild(name);
    const time=el('div','step-time');time.appendChild(txt(s.elapsed_ms>0?s.elapsed_ms+'ms':'—'));row.appendChild(time);
    const sum=el('div','step-summary');sum.appendChild(txt(s.summary||''));row.appendChild(sum);
    log.appendChild(row);
    // Expandable data
    if(s.data&&Object.keys(s.data).length>0){
      const detail=el('div','step-data');detail.id='detail-'+i;
      detail.appendChild(txt(JSON.stringify(s.data,null,2)));
      log.appendChild(detail);
      row.addEventListener('click',()=>{detail.style.display=detail.style.display==='block'?'none':'block'});
    }
  });
  const bar=el('div','total-bar');
  const left=el('span');left.appendChild(txt('Gesamt: '+(trace.step_count||0)+' Steps'));bar.appendChild(left);
  const right=el('span','time');right.appendChild(txt((trace.total_ms||0)+'ms'));bar.appendChild(right);
  log.appendChild(bar);
  const info=el('div');info.style.cssText='margin-top:12px;font-size:12px;color:#888';
  info.appendChild(txt('Quellen: '+(trace.source_count||0)+' · Response: '+(trace.response_length||0)+' chars'));
  log.appendChild(info);
}

document.getElementById('query').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendQuery()}});
</script></body></html>"""


class DevHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/', ''):
            body = DASHBOARD_HTML.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
        elif path.startswith('/api/card/'):
            try:
                self._json(load_card(int(path.split('/')[-1])))
            except ValueError:
                self._json({"error": "Invalid card ID"}, 400)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path == '/api/query':
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            query = body.get('query', '')
            if not query:
                return self._json({"error": "query required"}, 400)
            print(f"  [{body.get('agent', 'tutor')}] {query[:60]}...")
            try:
                result = run_live_query(
                    body.get('agent', 'tutor'), query,
                    body.get('card_context'), body.get('history', []))
                session = _get_session(body.get('session_id', 'default'))
                session["traces"].append(result.get("trace", {}))
                if len(session["traces"]) > _MAX_TRACES:
                    session["traces"] = session["traces"][-_MAX_TRACES:]
                self._json(result)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._json({"error": str(e)}, 500)
        else:
            self.send_response(404)
            self.end_headers()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8090)
    args = parser.parse_args()
    print(f"AnkiPlus Dev Dashboard → http://localhost:{args.port}")
    server = HTTPServer(('0.0.0.0', args.port), DevHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == '__main__':
    main()
