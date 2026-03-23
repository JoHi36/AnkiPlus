# Unified Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Agent Router and RAG Router into a single LLM call that decides agent + search strategy in one response.

**Architecture:** `route_message()` keeps its 3-level structure (lock → heuristic → LLM). Level 3 becomes `unified_route()` which sends one prompt containing agent descriptions + search strategy rules + complete situation context. Returns `UnifiedRoutingResult` dataclass with agent decision and optional search parameters. `handler.py` skips the separate `_rag_router()` call and goes straight to retrieval.

**Tech Stack:** Python, Gemini API (gemini-2.5-flash), JSON response format

**Spec:** `docs/superpowers/specs/2026-03-23-unified-router.md`

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `ai/router.py` | Major rewrite | `UnifiedRoutingResult` dataclass, `unified_route()` with combined prompt, updated `route_message()` |
| `ai/handler.py` | Modify ~30 lines | Pass card_context + history to `route_message()`, skip `_rag_router()`, read search params from routing result |
| `ai/rag.py` | Remove `rag_router()` | Keep `fix_router_queries()`, `extract_card_keywords()`, all retrieval logic |
| `tests/test_router.py` | Create | Unit tests for unified routing |

---

### Task 1: Create `UnifiedRoutingResult` dataclass

**Files:**
- Modify: `ai/router.py:26-32`

- [ ] **Step 1: Write test for new dataclass**

In `tests/test_router.py` (create new file):

```python
"""Tests for the unified router."""
import sys, types

# Mock aqt module tree (same pattern as other tests)
_aqt = types.ModuleType('aqt')
_aqt.mw = None
_aqt.qt = types.ModuleType('aqt.qt')
_aqt.utils = types.ModuleType('aqt.utils')
sys.modules.update({'aqt': _aqt, 'aqt.qt': _aqt.qt, 'aqt.utils': _aqt.utils})

from ai.router import UnifiedRoutingResult

def test_unified_routing_result_tutor_with_queries():
    r = UnifiedRoutingResult(
        agent='tutor', method='llm', reasoning='Lernfrage',
        search_needed=True, retrieval_mode='both',
        response_length='medium', max_sources='medium',
        search_scope='collection',
        precise_queries=['a AND b'], broad_queries=['a OR b'],
        embedding_queries=['concept search'],
    )
    assert r.agent == 'tutor'
    assert r.search_needed is True
    assert len(r.precise_queries) == 1

def test_unified_routing_result_non_tutor():
    r = UnifiedRoutingResult(agent='plusi', method='heuristic', reasoning='Name detected')
    assert r.agent == 'plusi'
    assert r.search_needed is None
    assert r.precise_queries is None
```

- [ ] **Step 2: Run test — expect FAIL (UnifiedRoutingResult not defined)**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m pytest tests/test_router.py -v
```

- [ ] **Step 3: Replace `RoutingResult` with `UnifiedRoutingResult` in router.py**

Replace the existing `RoutingResult` dataclass (lines 26-32) with:

```python
@dataclass
class UnifiedRoutingResult:
    """Result of routing a user message — agent decision + optional search strategy."""
    agent: str                              # 'tutor', 'research', 'help', 'plusi'
    method: str                             # 'lock', 'mention', 'heuristic', 'llm', 'default'
    clean_message: Optional[str] = None     # Message with @mention stripped
    reasoning: str = ''                     # Why this agent was chosen
    # Search strategy (populated when agent='tutor' and method='llm')
    search_needed: Optional[bool] = None
    retrieval_mode: Optional[str] = None    # 'sql', 'semantic', 'both'
    response_length: Optional[str] = None   # 'short', 'medium', 'long'
    max_sources: Optional[str] = None       # 'low', 'medium', 'high'
    search_scope: Optional[str] = None      # 'current_deck', 'collection'
    precise_queries: Optional[list] = None
    broad_queries: Optional[list] = None
    embedding_queries: Optional[list] = None

# Backwards-compatible alias
RoutingResult = UnifiedRoutingResult
```

The alias `RoutingResult = UnifiedRoutingResult` keeps all existing code working without changes.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Run full test suite to verify nothing broke**

```bash
python3 run_tests.py
```

- [ ] **Step 6: Commit**

```bash
git add ai/router.py tests/test_router.py
git commit -m "feat(router): add UnifiedRoutingResult dataclass with search strategy fields"
```

---

### Task 2: Write `unified_route()` with combined prompt

**Files:**
- Modify: `ai/router.py` — add `unified_route()` function, ~120 lines

- [ ] **Step 1: Write test for unified_route**

Add to `tests/test_router.py`:

```python
from unittest.mock import patch, MagicMock
from ai.router import unified_route, UnifiedRoutingResult

def _mock_gemini_response(json_text):
    """Create a mock requests.post response returning json_text."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        'candidates': [{'content': {'parts': [{'text': json_text}]}}]
    }
    return mock_resp

@patch('ai.router._requests.post')
def test_unified_route_tutor_with_search(mock_post):
    mock_post.return_value = _mock_gemini_response('{"agent":"tutor","search_needed":true,"retrieval_mode":"both","response_length":"medium","max_sources":"medium","search_scope":"collection","precise_queries":["a AND b"],"broad_queries":["a OR b"],"embedding_queries":["concept"]}')
    result = unified_route(
        user_message='warum ist die banane krumm',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={'api_key': 'test-key'},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'tutor'
    assert result.search_needed is True
    assert result.precise_queries == ['a AND b']

@patch('ai.router._requests.post')
def test_unified_route_plusi(mock_post):
    mock_post.return_value = _mock_gemini_response('{"agent":"plusi","reasoning":"Persoenliche Ansprache"}')
    result = unified_route(
        user_message='hey plusi wie gehts',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={'api_key': 'test-key'},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'plusi'
    assert result.search_needed is None

@patch('ai.router._requests.post')
def test_unified_route_fallback_on_error(mock_post):
    mock_post.side_effect = Exception('API error')
    result = unified_route(
        user_message='some question',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={'api_key': 'test-key'},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'tutor'
    assert result.method == 'default'
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `unified_route()`**

Add after the existing `_llm_route()` function in `router.py`. The function:

1. Checks for API key (fallback to tutor if missing)
2. Builds agent descriptions from registry
3. Builds card context string (if card_context provided)
4. Builds chat history string (last 4 messages)
5. Constructs the unified prompt with:
   - Role + decision framework
   - Complete situation (message, card, history, mode)
   - Agent descriptions with routing hints
   - Search strategy rules (from current RAG router prompt in rag.py:290-340)
   - JSON output schema with examples
6. Makes one API call to gemini-2.5-flash (JSON mode, temp 0.1, 1024 tokens)
7. Parses JSON response into `UnifiedRoutingResult`
8. Falls back to tutor + fallback queries on any error

Key: Copy the search strategy rules and context detection logic VERBATIM from the existing RAG router prompt in `rag.py` (lines 290-400). This ensures identical query quality.

```python
def unified_route(user_message: str, session_context: dict, config: dict,
                  card_context=None, chat_history=None) -> UnifiedRoutingResult:
    """Level 3: Unified LLM routing — agent selection + search strategy in one call."""
    try:
        import requests as _requests
    except ImportError:
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='requests module not available')

    api_key = config.get('api_key', '')
    if not api_key:
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='No API key')

    router_model = config.get('router_model', 'gemini-2.5-flash')

    # Build agent descriptions
    try:
        from ..ai.agents import get_non_default_agents
    except ImportError:
        from ai.agents import get_non_default_agents

    enabled = get_non_default_agents(config)
    agent_descriptions = '\n'.join(
        '- %s: %s' % (a.name, a.router_hint) for a in enabled if a.router_hint
    )

    # Build card context string
    card_str = 'Keine Karte aktiv.'
    if card_context and card_context.get('cardId'):
        import re as _re
        q = card_context.get('question') or card_context.get('frontField') or ''
        a = card_context.get('answer') or ''
        q_clean = _re.sub(r'<[^>]+>', ' ', q).strip()[:500]
        a_clean = _re.sub(r'<[^>]+>', ' ', a).strip()[:500]
        deck = card_context.get('deckName', '')
        tags = ', '.join(card_context.get('tags', [])) or 'keine'
        card_str = (
            'Aktuelle Karte:\n'
            '- Frage: %s\n'
            '- Antwort: %s\n'
            '- Deck: %s\n'
            '- Tags: %s'
        ) % (q_clean or 'LEER', a_clean or 'LEER', deck or 'unbekannt', tags)

    # Build chat history string (last 4 messages)
    history_str = 'Kein Chatverlauf.'
    if chat_history:
        recent = chat_history[-4:]
        lines = []
        for msg in recent:
            role = msg.get('role', 'user')
            text = (msg.get('content') or msg.get('text') or '')[:200]
            if text:
                lines.append('%s: %s' % (role, text))
        if lines:
            history_str = 'Letzter Chatverlauf:\n' + '\n'.join(lines)

    mode = session_context.get('mode', 'free_chat')
    deck_name = session_context.get('deck_name', '')

    prompt = '''Du bist der Router eines agentischen Lernsystems. Du triffst ZWEI Entscheidungen in einer Antwort:
1. Welcher Agent bearbeitet die Nachricht?
2. Falls Tutor: Welche Suchstrategie und Queries?

Verfuegbare Agenten:
- tutor: Default. Beantwortet Lernfragen basierend auf Anki-Karten. Waehle tutor wenn unklar.
%s

Aktuelle Situation:
- Modus: %s
- Deck: %s
%s

%s

Nachricht: "%s"

AGENT-REGELN:
1. Tutor ist der Default. Waehle einen anderen Agent NUR wenn klar ist, dass die Anfrage NICHT ins Lerngebiet faellt.
2. Research NUR wenn User explizit nach externen Quellen/Papers/Recherche fragt.
3. Help NUR fuer App-Bedienung und Einstellungen.
4. Plusi NUR fuer persoenliche/emotionale Interaktion ohne Fachfrage.
5. Im Zweifel: tutor.

SUCH-REGELN (nur relevant wenn agent=tutor):
Entscheide ob und wie die Kartensammlung durchsucht werden soll.

DECISION TREE:
1. Smalltalk, Dank, Begruessung, Meta-Frage ueber die App? -> search_needed=false
2. Faktische/Lernfrage? -> search_needed=true (weiter unten)
3. Kann die aktuelle Karte ALLEIN die Frage beantworten? -> search_needed=false (selten)

KONTEXT-ERKENNUNG:
Bestimme zuerst: Bezieht sich die Frage auf die aktuelle Karte/Konversation oder ist es ein eigenstaendiges Thema?

Kontextabhaengige Signale: "was bedeutet das", "erklaer das", "ich verstehe nicht", Pronomen ("das", "es", "dieser")
-> Verwende Karten-Keywords + letzten Response fuer spezifische Queries.
  embedding_queries MUESSEN die Schluesselwoerter der Karte aus VERSCHIEDENEN Perspektiven enthalten.

Eigenstaendige Signale: Enthaelt Fachbegriffe die NICHT auf der Karte stehen.
-> Ignoriere Kartenkontext, erstelle Queries nur aus der Frage.

QUERY-REGELN:
- embedding_queries: 2-3 semantische Suchtexte aus VERSCHIEDENEN Perspektiven. NIEMALS die Nutzerfrage woertlich kopieren. Immer zu fachspezifischen Suchbegriffen erweitern.
- precise_queries: 2-3 AND-Queries aus relevanten Keywords
- broad_queries: 2-3 OR-Queries fuer breitere Suche
- search_scope: "current_deck" bei kartenbezogenen Fragen, "collection" bei fachuebergreifenden
- retrieval_mode: "both" als Default, "sql" fuer exakte Fakten/Namen, "semantic" fuer konzeptuelle Fragen
- max_sources: "low" (3-5, einfache Fakten), "medium" (8-10, Erklaerungen), "high" (bis 15, Vergleiche)
- response_length: "short" fuer einfache Fakten, "medium" fuer Erklaerungen, "long" fuer Vergleiche

Antworte mit JSON:

Wenn agent=tutor UND search_needed=true:
{"agent":"tutor","reasoning":"...","search_needed":true,"retrieval_mode":"both","response_length":"medium","max_sources":"medium","search_scope":"collection","precise_queries":["..."],"broad_queries":["..."],"embedding_queries":["..."]}

Wenn agent=tutor UND search_needed=false:
{"agent":"tutor","reasoning":"...","search_needed":false}

Wenn agent!=tutor:
{"agent":"plusi","reasoning":"..."}''' % (
        agent_descriptions,
        mode,
        deck_name or 'keins',
        card_str,
        history_str,
        user_message[:500],
    )

    try:
        url = (
            'https://generativelanguage.googleapis.com/v1beta/models/'
            '%s:generateContent?key=%s' % (router_model, api_key)
        )
        data = {
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {
                'temperature': 0.1,
                'maxOutputTokens': 1024,
                'responseMimeType': 'application/json',
            },
        }
        response = _requests.post(url, json=data,
                                   headers={'Content-Type': 'application/json'},
                                   timeout=10)
        response.raise_for_status()
        result = response.json()

        text = ''
        if 'candidates' in result and result['candidates']:
            parts = result['candidates'][0].get('content', {}).get('parts', [])
            if parts:
                text = parts[0].get('text', '').strip()

        if not text:
            logger.warning("Unified router: empty LLM response")
            return UnifiedRoutingResult(agent='tutor', method='default',
                                        reasoning='Empty LLM response')

        import json
        parsed = json.loads(text)
        agent = parsed.get('agent', 'tutor').lower()

        # Validate agent
        try:
            from ..ai.agents import get_agent
        except ImportError:
            from ai.agents import get_agent

        agent_def = get_agent(agent)
        if not agent_def:
            agent = 'tutor'

        return UnifiedRoutingResult(
            agent=agent,
            method='llm',
            reasoning=parsed.get('reasoning', ''),
            search_needed=parsed.get('search_needed'),
            retrieval_mode=parsed.get('retrieval_mode'),
            response_length=parsed.get('response_length'),
            max_sources=parsed.get('max_sources'),
            search_scope=parsed.get('search_scope'),
            precise_queries=parsed.get('precise_queries'),
            broad_queries=parsed.get('broad_queries'),
            embedding_queries=parsed.get('embedding_queries'),
        )

    except Exception as e:
        logger.warning("Unified router LLM call failed: %s", e)
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='LLM routing failed: %s' % e)
```

Also add `import requests as _requests` at module level (lazy, inside the function).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add ai/router.py tests/test_router.py
git commit -m "feat(router): implement unified_route() with combined agent+search prompt"
```

---

### Task 3: Wire `unified_route()` into `route_message()`

**Files:**
- Modify: `ai/router.py:253-304` — update `route_message()` signature and Level 3 call

- [ ] **Step 1: Write test**

Add to `tests/test_router.py`:

```python
@patch('ai.router.unified_route')
def test_route_message_passes_context_to_unified(mock_unified):
    mock_unified.return_value = UnifiedRoutingResult(
        agent='tutor', method='llm', search_needed=True,
        retrieval_mode='both', precise_queries=['test'],
        broad_queries=['test'], embedding_queries=['test'],
    )
    from ai.router import route_message
    result = route_message(
        'some question',
        {'mode': 'card_session', 'deck_name': 'Bio', 'has_card': True},
        {'api_key': 'test'},
        card_context={'cardId': 123, 'question': 'What is DNA?'},
        chat_history=[{'role': 'user', 'content': 'hello'}],
    )
    assert result.agent == 'tutor'
    assert result.search_needed is True
    # Verify card_context and chat_history were passed through
    mock_unified.assert_called_once()
    call_kwargs = mock_unified.call_args
    assert call_kwargs[1].get('card_context') or call_kwargs[0][3]  # positional or kwarg

def test_route_message_heuristic_plusi():
    """Plusi keyword heuristic should bypass LLM entirely."""
    from ai.router import route_message
    result = route_message(
        'plusi wie gehts',
        {'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        {},
    )
    assert result.agent == 'plusi'
    assert result.method == 'heuristic'
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Update `route_message()` signature and Level 3 call**

Change `route_message()` to accept optional `card_context` and `chat_history`:

```python
def route_message(user_message: str, session_context: dict, config: dict,
                  card_context=None, chat_history=None) -> UnifiedRoutingResult:
```

Replace the Level 3 block (lines ~293-303):

```python
    # Level 3: Unified LLM routing (agent + search strategy)
    try:
        from ..ai.agents import get_non_default_agents
    except ImportError:
        from ai.agents import get_non_default_agents

    if get_non_default_agents(config):
        result = unified_route(user_message, session_context, config,
                               card_context=card_context,
                               chat_history=chat_history)
        return result

    # Default: Tutor (no non-default agents enabled)
    return UnifiedRoutingResult(agent='tutor', method='default')
```

Note: The old code only returned the LLM result if `agent != 'tutor'`, then fell through to default. Now we always return the unified result because it contains search strategy even for tutor.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Remove old `_llm_route()` function** (it's now replaced by `unified_route()`)

- [ ] **Step 6: Run full test suite**

```bash
python3 run_tests.py
```

- [ ] **Step 7: Commit**

```bash
git add ai/router.py tests/test_router.py
git commit -m "feat(router): wire unified_route into route_message, remove old _llm_route"
```

---

### Task 4: Update `handler.py` to use unified routing result

**Files:**
- Modify: `ai/handler.py:395-530` — pass context to route_message, skip _rag_router, read from routing result

- [ ] **Step 1: Update `route_message()` call to pass card_context and chat_history**

In `get_response_with_rag()`, find the `route_message()` call (~line 406) and change:

```python
# OLD:
routing_result = route_message(user_message, session_context, self.config)

# NEW:
routing_result = route_message(user_message, session_context, self.config,
                               card_context=context, chat_history=history)
```

- [ ] **Step 2: Skip `_rag_router()` when unified result has search params**

Find where `_rag_router` is called (~line 485) and add a gate:

```python
# OLD:
router_result = self._rag_router(user_message, context=context)

# NEW: Use search params from unified routing if available
if routing_result.search_needed is not None:
    # Unified router already determined search strategy
    router_result = {
        'search_needed': routing_result.search_needed,
        'retrieval_mode': routing_result.retrieval_mode or 'both',
        'response_length': routing_result.response_length or 'medium',
        'max_sources': routing_result.max_sources or 'medium',
        'search_scope': routing_result.search_scope or 'current_deck',
        'precise_queries': routing_result.precise_queries or [],
        'broad_queries': routing_result.broad_queries or [],
        'embedding_queries': routing_result.embedding_queries or [],
    }
else:
    # Fallback: heuristic/lock routing without search params — call RAG router
    router_result = self._rag_router(user_message, context=context)
```

This preserves backwards compatibility: if Level 1/2 routing was used (no search params), the old RAG router is still called as fallback.

- [ ] **Step 3: Update pipeline step data for orchestrating**

Update the `orchestrating done` pipeline step (~line 458) to include search strategy info:

```python
self._emit_pipeline_step("orchestrating", "done", {
    'agent': routing_result.agent,
    'retrieval_mode': routing_result.retrieval_mode or 'agent:%s' % routing_result.agent,
    'method': routing_result.method,
    'search_needed': routing_result.search_needed if routing_result.search_needed is not None else True,
    'scope_label': routing_result.search_scope or '',
    'response_length': routing_result.response_length or 'medium',
})
```

- [ ] **Step 4: Run full test suite**

```bash
python3 run_tests.py
```

- [ ] **Step 5: Commit**

```bash
git add ai/handler.py
git commit -m "feat(router): use unified routing result in handler, skip separate RAG router call"
```

---

### Task 5: Clean up — remove `_rag_router()` call path

**Files:**
- Modify: `ai/rag.py` — mark `rag_router()` as deprecated (don't delete yet, it's the fallback)
- Modify: `ai/handler.py:154-159` — add deprecation comment to `_rag_router` wrapper

- [ ] **Step 1: Add deprecation docstring to `rag_router()` in rag.py**

```python
def rag_router(user_message, context=None, config=None, emit_step=None):
    """DEPRECATED: Use unified_route() in router.py instead.
    Kept as fallback for Level 1/2 routing (lock/heuristic) where search
    strategy is not included in the routing result.
    """
```

- [ ] **Step 2: Add deprecation comment to handler wrapper**

```python
def _rag_router(self, user_message, context=None):
    """DEPRECATED: Only used as fallback when unified router didn't provide search params."""
    return rag_router(...)
```

- [ ] **Step 3: Run full test suite**

```bash
python3 run_tests.py
```

- [ ] **Step 4: Build frontend (unchanged, but verify)**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add ai/rag.py ai/handler.py
git commit -m "refactor(router): mark rag_router as deprecated, unified router is primary path"
```

---

### Task 6: Integration test — verify end-to-end in Anki

**No code changes — manual testing.**

- [ ] **Step 1: Restart Anki**

- [ ] **Step 2: Test tutor routing with search**

Send: "warum ist die banane krumm"
Expected: Orchestrating shows immediately, single router call (check logs for NO separate `rag_router` call), then retrieval + response.

- [ ] **Step 3: Test plusi routing (heuristic)**

Send: "plusi wie geht es dir"
Expected: Routes to Plusi via heuristic (Level 2), no LLM call at all.

- [ ] **Step 4: Test card-context search**

Open a card, send: "erklaer das mal"
Expected: Router uses card context for queries (embedding_queries should contain card keywords).

- [ ] **Step 5: Test no-search routing**

Send: "danke" or "hallo"
Expected: Router returns `search_needed=false`, no retrieval phase.

- [ ] **Step 6: Check logs for timing improvement**

Compare timestamps: old flow had ~5s between message send and first retrieval. New flow should be ~2-3s.
