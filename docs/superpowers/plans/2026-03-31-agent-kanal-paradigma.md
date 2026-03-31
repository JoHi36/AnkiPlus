# Agent-Kanal-Paradigma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Agents Are Everywhere" routing with channel-bound agents — each channel IS its agent, symbiotically fused. No generic agent interface, no routing. The Stapel pipeline IS Research, the Session pipeline IS Tutor.

**Architecture:** Each channel has its own custom pipeline — there is no standardized "agent interface" that all channels implement. The shared infrastructure is minimal: RAG analysis (`rag_analyzer.py`), tools, v2 event protocol, and agent registry (name/color/icon for UI). Everything else is channel-specific.

The router currently serves two jobs: (1) agent routing → REMOVED (channel = agent) and (2) RAG query analysis → extracted to `rag_analyzer.py`. The backend `/router` endpoint stays unchanged — we just ignore the `agent` field.

**Tech Stack:** Python 3.9+ (PyQt6), React 18, TypeScript

**Paradigm: Kanal = Agent (symbiotische Verschmelzung)**
| Kanal | Pipeline | Was es IST |
|-------|----------|-----------|
| Stapel | SearchCardsThread + Clustering + KG + Canvas + Quick Answer | Research Agent |
| Session | RAG + Streaming + Fallback-Chain + Chat-UI + Kartenkontext | Tutor Agent |
| Plusi-Bubble (künftig) | Personality + Help-Tools + Mood-Sync | Plusi/Help Agent |
| Reviewer-Input (künftig) | Antwort-Evaluation + MC-Generierung | Prüfungs-Agent |

**Kein BaseAgent-Vertrag.** Jeder Kanal ist organisch um seinen Zweck gebaut. Die Stapel-Pipeline hat Graph-Search und Clustering. Die Session-Pipeline hat Chat-History und Fallback-Chains. Verschiedene Architekturen, gleiche geteilte Infrastruktur (RAG-Analyse, Tools, Events).

---

## File Structure

### New files
- `ai/rag_analyzer.py` — RAG query analysis extracted from router (the backend `/router` call + `RagAnalysis` dataclass)

### Modified files
- `ai/agents.py` — Add `channel`, `uses_rag` fields; remove `can_handoff_to`, `router_hint`
- `ai/handler.py:640-711` — Accept `agent_name` param directly, call `analyze_query()` for RAG agents
- `ai/tutor.py:75,147-160` — Use `rag_analysis` kwarg instead of `routing_result`
- `research/__init__.py` — Deprecate (Stapel pipeline IS Research, run_research() is legacy chat path)
- `ui/widget.py:1303-1312,2097-2116,2330` — Add `agent` param to message flow, remove `_handle_subagent_direct`
- `ui/bridge.py:1392-1398` — Remove `subagentDirect` slot
- `frontend/src/hooks/useChat.js:335-384` — Remove @mention detection, accept `agent` prop, pass in sendMessage
- `frontend/src/App.jsx:476,1781-1846` — Remove `stickyAgent`, views pass agent to chat
- `shared/config/subagentRegistry.ts:83-107` — Remove `getDirectCallPattern`, `canHandoffTo`
- `docs/vision/product-concept.md:73-116` — Rewrite Principle #4 + Agent Model section
- `CLAUDE.md:11-21` — Rewrite "Agentisches System" section
- `tests/test_router.py` — Rewrite tests for `rag_analyzer`

### Archived files (moved, not deleted)
- `ai/router.py` → kept but agent-routing functions removed (only `RagAnalysis` re-export for compat)
- `ai/handoff.py` → archived (no longer used)

---

## Phase 1: Konzept festschreiben

### Task 1: Update product-concept.md

**Files:**
- Modify: `docs/vision/product-concept.md:59-116`

- [ ] **Step 1: Rewrite Principle #4 "Agents Are Everywhere" → "Jeder Agent hat einen Kanal"**

Replace lines 73-75:
```markdown
### 4. Agents Are Everywhere

Agents are not bound to views. They are bound to capabilities. The Tutor agent can answer questions in Stapel (state-based result on canvas), assist during Session (chat-based explanation), and suggest study plans in Statistik. The agent adapts its output format to the view it's operating in, but its knowledge and personality remain consistent.
```

With:
```markdown
### 4. Every Agent Has a Channel

Each agent owns exactly one UI channel. The channel determines the agent — no routing needed, no @mentions, no agent-switching mid-conversation. The user interacts with the right agent by using the right part of the interface:

- **Research Agent → Stapel** (search bar → canvas + sidebar). State-based: one query = one result.
- **Tutor Agent → Session** (chat sidebar during card review). History-based: conversation builds over cards.
- **Plusi → Plusi bubble** (click Plusi icon → speech bubble). Compact: personality + app help.
- **Prüfungs-Agent → Reviewer input** (inline during card answer). Evaluates answers, generates MC.

Agents share capabilities (RAG, web search) but differ in prompt, context, and output format. The Tutor auto-triggers web search when card similarity is low (cos < 0.60); the Research Agent leads with web research and uses more cards as context references. Both use the same RAG pipeline — differentiated by orchestration, not by toolset.
```

- [ ] **Step 2: Update "The Agent Model in Stapel" section**

Replace lines 88-116 (the section starting with `## The Agent Model in Stapel (Detail)`) with:
```markdown
## The Agent Model in Stapel (Detail)

The Stapel view is the **Research Agent's channel**. Every search query goes to Research — no routing decision needed.

```
1. DEFAULT STATE
   - Deck list visible (standard Anki hierarchy)
   - Search bar at top (frosted glass, centered)
   - Plusi in corner (optional, ambient)

2. USER TYPES QUERY → Search bar
   - Search bar slides up, becomes compact (shows last query)
   - Research Agent activates: canvas fills with visual content (left ~65%)
   - Sidebar appears with structured text (right ~35%)
   - Action dock slides in from bottom-right
   - Agent identity visible (Research green, icon in sidebar header)

3. USER TYPES FOLLOW-UP → Same search bar (now at top)
   - Research Agent processes with invisible history context
   - Canvas + sidebar update (state replacement)
   - No agent switching — always Research in this view

4. USER ACTS → Action dock (e.g., "100 Karten kreuzen")
   - Transitions to Session view (→ Tutor Agent takes over)
   - Or closes agent state, returns to deck list
```

The search bar is the universal entry point. After the first query, it doubles as the follow-up input. The dock is for actions, not text input. Transitioning from Stapel to Session is a natural channel switch — Research hands off context to Tutor by opening a prepared card set.
```

- [ ] **Step 3: Commit**

```bash
git add docs/vision/product-concept.md
git commit -m "docs: rewrite Principle #4 — agents bound to channels, not views"
```

---

### Task 2: Update CLAUDE.md "Agentisches System" section

**Files:**
- Modify: `CLAUDE.md:11-21`

- [ ] **Step 1: Replace the "Agentisches System" block**

Replace the entire section from `## Agentisches System — Architektonisches Grundprinzip` through the `**Agent-Handoff:**` paragraph with:

```markdown
## Agentisches System — Architektonisches Grundprinzip

**AnkiPlus ist eine agentische Lernplattform.** Jeder Agent hat einen eigenen Kanal (UI-Bereich). Der Kanal bestimmt den Agenten — kein Router, kein @mention, kein Agent-Wechsel im Gespräch.

| Agent | Kanal | Modus |
|-------|-------|-------|
| Research | Stapel (Suchleiste → Canvas + Sidebar) | State-basiert |
| Tutor | Session (Seitenfenster-Chat) | Chat-basiert, kartengebunden |
| Plusi/Help | Plusi-Sprechblase | Kompakt, Personality + App-Hilfe |
| Prüfungs-Agent | Reviewer-Input (künftig) | Inline-Bewertung |

**Drei kognitive Modi:** Stapel = Finden (state-basiert), Session = Lernen (verlaufsbasiert), Statistik = Planen. Vollständiges Konzeptdokument: `docs/vision/product-concept.md`.

**Canvas + State-Modell:** Der Stapel-Tab ist ein Canvas auf dem der Research Agent visuelle Ergebnisse darstellt. Daneben ein State-basierter Bereich (kein Chat-Verlauf). Ein Zustand = die gesamte Ansicht. Neuer Zustand nur durch bewusste Vertiefung/neue Anfrage.

**Ein-Glas-Regel:** Zu jedem Zeitpunkt gibt es maximal ein primäres Glas-Eingabeelement auf dem Screen. Ausnahme in der Stapelansicht: Suchleiste (oben, Eingabe) + Action-Dock (unten, Aktion) koexistieren als zwei Phasen eines Flows (Fragen → Handeln).

**RAG-Analyse:** Agenten die RAG nutzen (Tutor, Research) rufen `analyze_query()` (`ai/rag_analyzer.py`) auf — extrahiert aus dem alten Router. Liefert `search_needed`, `resolved_intent`, `retrieval_mode`, `search_scope`. Der Backend-`/router`-Endpoint bleibt, das `agent`-Feld wird ignoriert.

**Agenten-Fusion:** Tutor und Research teilen dieselbe RAG-Pipeline und Web-Search-Tools. Unterschied: Tutor erklärt kartenbasiert (Web-Search als Fallback bei cos < 0.60), Research recherchiert web-first mit mehr Kartenreferenzen. Gleiche Tools, verschiedene Orchestrierung.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — agent-kanal-paradigma, RAG-analyse section"
```

---

## Phase 2: Backend — RAG-Analyse extrahieren, Agent-Routing entfernen

### Task 3: Create `ai/rag_analyzer.py`

**Files:**
- Create: `ai/rag_analyzer.py`
- Test: `tests/test_rag_analyzer.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_rag_analyzer.py`:
```python
"""Tests for RAG query analyzer (extracted from router)."""
import sys
import types

_aqt = types.ModuleType('aqt')
_aqt.mw = None
_aqt.qt = types.ModuleType('aqt.qt')
_aqt.utils = types.ModuleType('aqt.utils')
sys.modules.update({'aqt': _aqt, 'aqt.qt': _aqt.qt, 'aqt.utils': _aqt.utils})

from ai.rag_analyzer import RagAnalysis, analyze_query


def test_rag_analysis_defaults():
    r = RagAnalysis()
    assert r.search_needed is True
    assert r.resolved_intent == ''
    assert r.retrieval_mode == 'both'
    assert r.search_scope == 'current_deck'
    assert r.response_length == 'medium'


def test_rag_analysis_custom():
    r = RagAnalysis(
        search_needed=False,
        resolved_intent='Herzklappen Funktion',
        retrieval_mode='semantic',
        search_scope='collection',
        response_length='long',
    )
    assert r.search_needed is False
    assert r.resolved_intent == 'Herzklappen Funktion'


from unittest.mock import patch, MagicMock


def _mock_backend_response(json_dict):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = json_dict
    return mock_resp


@patch('ai.rag_analyzer.get_auth_token', return_value='test-token')
@patch('ai.rag_analyzer.get_backend_url', return_value='https://backend.example.com')
@patch('ai.rag_analyzer._requests')
def test_analyze_query_returns_rag_fields(mock_requests, mock_url, mock_token):
    mock_requests.post.return_value = _mock_backend_response({
        'agent': 'research',  # Agent field exists but should be IGNORED
        'search_needed': True,
        'resolved_intent': 'Laenge des Duenndarms',
        'retrieval_mode': 'both',
        'response_length': 'medium',
        'search_scope': 'collection',
    })
    result = analyze_query(
        user_message='wie lang ist der',
        card_context={'cardId': 1, 'question': 'Duenndarm?', 'deckName': 'Anatomie'},
    )
    assert isinstance(result, RagAnalysis)
    assert result.search_needed is True
    assert result.resolved_intent == 'Laenge des Duenndarms'
    # Agent field must NOT be present on RagAnalysis
    assert not hasattr(result, 'agent')


@patch('ai.rag_analyzer.get_auth_token', return_value='test-token')
@patch('ai.rag_analyzer.get_backend_url', return_value='https://backend.example.com')
@patch('ai.rag_analyzer._requests')
def test_analyze_query_fallback_on_error(mock_requests, mock_url, mock_token):
    mock_requests.post.side_effect = Exception('Network error')
    result = analyze_query(user_message='some question')
    assert isinstance(result, RagAnalysis)
    assert result.search_needed is True  # Safe default
    assert result.retrieval_mode == 'both'


@patch('ai.rag_analyzer.get_auth_token', return_value=None)
@patch('ai.rag_analyzer.get_backend_url', return_value=None)
def test_analyze_query_no_backend(mock_url, mock_token):
    result = analyze_query(user_message='test')
    assert isinstance(result, RagAnalysis)
    assert result.search_needed is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_rag_analyzer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ai.rag_analyzer'`

- [ ] **Step 3: Implement `ai/rag_analyzer.py`**

```python
"""RAG Query Analyzer — determines HOW to search, not WHO answers.

Extracted from router.py. Calls the backend /router endpoint but only uses
the RAG-relevant fields (search_needed, resolved_intent, retrieval_mode,
search_scope). The agent field from the backend response is ignored.
"""

import re
import json
from dataclasses import dataclass
from typing import Optional

try:
    import requests as _requests
except ImportError:
    _requests = None

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

try:
    from ..config import get_backend_url, get_auth_token
except ImportError:
    from config import get_backend_url, get_auth_token

logger = get_logger(__name__)

_LLM_TIMEOUT_SECONDS = 10


@dataclass
class RagAnalysis:
    """RAG pipeline parameters — how to search the user's cards and web."""
    search_needed: bool = True
    resolved_intent: str = ''           # Disambiguated question in card context
    retrieval_mode: str = 'both'        # 'sql', 'semantic', 'both'
    search_scope: str = 'current_deck'  # 'current_deck', 'collection'
    response_length: str = 'medium'     # 'short', 'medium', 'long'


# Backwards compat: code that still imports UnifiedRoutingResult gets RagAnalysis
UnifiedRoutingResult = RagAnalysis


def analyze_query(user_message, card_context=None, chat_history=None,
                  config=None, auth_token=None) -> RagAnalysis:
    """Analyze a user query for RAG parameters via backend LLM call.

    Calls the backend /router endpoint and extracts only RAG-relevant fields.
    The agent field from the response is intentionally ignored.

    Args:
        user_message: The user's question.
        card_context: Optional card data dict (cardId, question, deckName).
        chat_history: Optional list of recent message dicts.
        config: Optional config dict (unused currently, reserved).
        auth_token: Optional override for auth token.

    Returns:
        RagAnalysis with search parameters.
    """
    _default = RagAnalysis()

    if _requests is None:
        return _default

    backend_url = get_backend_url()
    _token = auth_token or get_auth_token()
    if not backend_url or not _token:
        return _default

    # Build compact card context
    compact_card = {}
    if card_context and card_context.get('cardId'):
        q = card_context.get('frontField') or card_context.get('question') or ''
        q_clean = re.sub(r'<[^>]+>', ' ', q).strip()[:500]
        compact_card = {
            'question': q_clean,
            'deckName': card_context.get('deckName', ''),
        }

    # Extract last assistant message
    last_assistant = ''
    if chat_history:
        for msg in reversed(chat_history):
            if msg.get('role') == 'assistant':
                last_assistant = (msg.get('content') or msg.get('text') or '')[:300]
                break

    try:
        url = '%s/router' % backend_url.rstrip('/')
        payload = {
            'message': (user_message or '')[:500],
            'cardContext': compact_card,
            'lastAssistantMessage': last_assistant,
        }
        response = _requests.post(
            url,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer %s' % _token,
            },
            timeout=_LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        parsed = response.json()

        return RagAnalysis(
            search_needed=parsed.get('search_needed', True),
            resolved_intent=parsed.get('resolved_intent') or '',
            retrieval_mode=parsed.get('retrieval_mode') or 'both',
            search_scope=parsed.get('search_scope') or 'current_deck',
            response_length=parsed.get('response_length') or 'medium',
        )

    except Exception as e:
        logger.warning("RAG analyze_query failed: %s", e)
        return _default
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_rag_analyzer.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/rag_analyzer.py tests/test_rag_analyzer.py
git commit -m "feat: extract RagAnalysis from router — RAG query analysis without agent routing"
```

---

### Task 4: Add `channel` and `uses_rag` to agent definitions

**Files:**
- Modify: `ai/agents.py:26-100` (AgentDef dataclass)
- Modify: `ai/agents.py:335-649` (4 agent registrations)
- Test: `tests/test_agents.py` (add channel assertions)

- [ ] **Step 1: Add fields to AgentDef dataclass**

In `ai/agents.py`, add two fields to the `AgentDef` dataclass (after the existing fields, before model slots):

```python
    # Channel binding (new: agent-kanal-paradigma)
    channel: str = ''                  # 'stapel', 'session', 'plusi', 'reviewer-inline'
    uses_rag: bool = False             # Whether this agent calls analyze_query()
```

- [ ] **Step 2: Remove routing-specific fields from AgentDef**

Remove these fields from the dataclass (they are no longer used):
- `can_handoff_to: list` (if it exists)
- `router_hint: str` (the docstring hint for routing)

Note: `router_hint` is referenced in the agent definitions. Remove it from the dataclass AND from each agent's registration kwargs. Also remove `main_model_hint` references to routing.

- [ ] **Step 3: Update the 4 agent registrations**

Add `channel` and `uses_rag` to each agent definition:

**Tutor** (line ~335):
```python
    channel='session',
    uses_rag=True,
```

**Research** (line ~433):
```python
    channel='stapel',
    uses_rag=True,
```

**Help** (line ~509):
```python
    channel='plusi',   # Merged into Plusi channel
    uses_rag=False,
```

**Plusi** (line ~568):
```python
    channel='plusi',
    uses_rag=False,
```

- [ ] **Step 4: Run existing agent tests + add channel assertions**

In `tests/test_agents.py`, add:
```python
def test_agent_channel_binding():
    from ai.agents import AGENT_REGISTRY
    assert AGENT_REGISTRY['tutor'].channel == 'session'
    assert AGENT_REGISTRY['research'].channel == 'stapel'
    assert AGENT_REGISTRY['plusi'].channel == 'plusi'
    assert AGENT_REGISTRY['help'].channel == 'plusi'

def test_rag_agents():
    from ai.agents import AGENT_REGISTRY
    assert AGENT_REGISTRY['tutor'].uses_rag is True
    assert AGENT_REGISTRY['research'].uses_rag is True
    assert AGENT_REGISTRY['plusi'].uses_rag is False
    assert AGENT_REGISTRY['help'].uses_rag is False
```

Run: `python3 -m pytest tests/test_agents.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai/agents.py tests/test_agents.py
git commit -m "feat: add channel + uses_rag fields to agent definitions"
```

---

### Task 5: Update handler.py — accept agent directly

**Files:**
- Modify: `ai/handler.py:640-711` (`get_response_with_rag`)

- [ ] **Step 1: Add `agent_name` parameter to `get_response_with_rag`**

Change the method signature (line ~625) to accept `agent_name=None`:
```python
def get_response_with_rag(self, user_message, context=None, history=None,
                          mode='compact', insights=None, callback=None,
                          agent_name=None):
```

- [ ] **Step 2: Replace routing with direct agent loading + RAG analysis**

Replace lines 642-662 (the `msg_start` emission through `route_message` call) with:
```python
        request_id = getattr(self, '_current_request_id', None)
        agent_name = agent_name or 'tutor'

        # v2: Start — emit agent cell with the known agent
        self._emit_msg_event("msg_start", {"messageId": request_id or ''})
        self._emit_msg_event("agent_cell", {
            "messageId": request_id or '',
            "agent": agent_name,
            "status": "loading",
            "data": {"loadingHint": "Kontext..."}
        })
        self._emit_pipeline_step("orchestrating", "active")

        try:
            # Load agent directly (no routing)
            try:
                from .agents import get_agent, get_default_agent, lazy_load_run_fn
            except ImportError:
                from agents import get_agent, get_default_agent, lazy_load_run_fn

            agent_def = get_agent(agent_name)
            if not agent_def:
                agent_def = get_default_agent()
                logger.info("Agent %s not found, using default", agent_name)

            try:
                run_fn = lazy_load_run_fn(agent_def)
            except (AttributeError, ImportError) as e:
                logger.warning("Agent %s load failed: %s, using default", agent_def.name, e)
                agent_def = get_default_agent()
                run_fn = lazy_load_run_fn(agent_def)

            # RAG analysis (only for agents that need it)
            rag_analysis = None
            if agent_def.uses_rag:
                try:
                    from .rag_analyzer import analyze_query
                except ImportError:
                    from rag_analyzer import analyze_query
                rag_analysis = analyze_query(
                    user_message, card_context=context, chat_history=history)
            logger.info("Agent: %s, uses_rag=%s, search_needed=%s",
                        agent_def.name, agent_def.uses_rag,
                        getattr(rag_analysis, 'search_needed', None))
```

- [ ] **Step 3: Update the dispatch call to pass `rag_analysis`**

Replace the `_dispatch_agent` call (lines ~686-703) — change `routing_result` to `rag_analysis`:
```python
            return self._dispatch_agent(
                agent_name=agent_def.name,
                run_fn=run_fn,
                situation=user_message,
                request_id=request_id,
                on_finished=agent_def.on_finished,
                extra_kwargs={
                    'context': context,
                    'history': history,
                    'mode': mode,
                    'insights': insights,
                    'routing_result': rag_analysis,  # Keep kwarg name for now (agents expect it)
                    'callback': callback,
                    **agent_def.extra_kwargs,
                },
                callback=callback,
                agent_def=agent_def,
            )
```

Note: We keep the kwarg name `routing_result` for now so that `tutor.py` and `research/__init__.py` don't need changes in this task. They'll be updated in Task 6/7.

- [ ] **Step 4: Update `_dispatch_agent` orchestration step**

In `_dispatch_agent` (lines ~389-406), update the orchestration data extraction. Replace:
```python
        routing_result = extra_kwargs.get('routing_result')
        method = 'default'
        response_length = 'medium'
        if routing_result:
            method = getattr(routing_result, 'method', 'default')
            response_length = getattr(routing_result, 'response_length', 'medium')
```
With:
```python
        rag_analysis = extra_kwargs.get('routing_result')  # RagAnalysis or None
        response_length = 'medium'
        if rag_analysis:
            response_length = getattr(rag_analysis, 'response_length', 'medium')
```

And update the `orch_data` dict — remove `method`, use `agent_name` directly:
```python
        orch_data = {
            'search_needed': getattr(rag_analysis, 'search_needed', False) if rag_analysis else False,
            'retrieval_mode': 'agent:%s' % agent_name,
            'method': 'channel',  # Always 'channel' now
            'scope': getattr(rag_analysis, 'search_scope', 'none') if rag_analysis else 'none',
            'scope_label': agent_name,
            'response_length': response_length,
            'has_card': has_card,
        }
```

- [ ] **Step 5: Remove the `route_message` import**

At the top of handler.py, remove:
```python
from .router import route_message
```
(or the equivalent try/except block)

- [ ] **Step 6: Run all tests**

Run: `python3 -m pytest tests/ -v --tb=short 2>&1 | tail -30`
Expected: Existing tests may need adjustments. Fix any import errors. The key change is that `route_message` is no longer called from handler — tests that mock it need updating.

- [ ] **Step 7: Commit**

```bash
git add ai/handler.py
git commit -m "refactor: handler accepts agent_name directly, uses rag_analyzer instead of router"
```

---

### Task 6: Update tutor.py — rename `routing_result` → `rag_analysis`

**Files:**
- Modify: `ai/tutor.py:75,147-160`

- [ ] **Step 1: Rename kwarg extraction**

At line 75, change:
```python
routing_result = kwargs.get('routing_result')
```
To:
```python
rag_analysis = kwargs.get('routing_result')  # RagAnalysis from rag_analyzer
```

- [ ] **Step 2: Update RAG retrieval call**

At lines 147-160, change `routing_result` references to `rag_analysis`:
```python
    if rag_analysis is not None:
        _rag_fn = rag_retrieve_fn
        if _rag_fn is None:
            _rag_fn = _make_default_rag_retrieve_fn()

        rag_result = retrieve_rag_context(
            user_message=situation,
            context=context,
            config=config,
            routing_result=rag_analysis,  # retrieve_rag_context still expects this name
            emit_step=emit_step,
            embedding_manager=embedding_manager,
            rag_retrieve_fn=_rag_fn,
        )
```

- [ ] **Step 3: Run tutor-related tests**

Run: `python3 -m pytest tests/ -k "tutor or agent_pipeline" -v`
Expected: PASS (the internal rename doesn't affect behavior)

- [ ] **Step 4: Commit**

```bash
git add ai/tutor.py
git commit -m "refactor: tutor uses rag_analysis naming (from rag_analyzer)"
```

---

### Task 7: Deprecate `run_research()` — Stapel-Pipeline IS Research

**Files:**
- Modify: `research/__init__.py`

**Key insight:** The Stapel channel already has its own complete pipeline:
`SearchCardsThread` → embedding search → SQL search → clustering → KG enrichment → Quick Answer.
This pipeline IS the Research Agent. The `run_research()` function was only used for @Research mentions in chat — which no longer exist in the channel paradigm.

- [ ] **Step 1: Add deprecation docstring to `run_research()`**

At the top of `research/__init__.py`, update the module docstring:
```python
"""Research Agent — DEPRECATED as standalone chat agent.

In the Agent-Kanal-Paradigma, the Stapel channel (SearchCardsThread + Clustering
+ KG + Canvas + Quick Answer) IS the Research Agent. This run_research() function
was used for @Research mentions in chat, which no longer exist.

The Stapel pipeline lives in:
- ui/widget.py: SearchCardsThread (graph search, clustering)
- ui/widget.py: KGDefinitionThread (term definitions)
- ui/widget.py: QuickAnswerThread (LLM text generation)
- frontend/src/hooks/useSmartSearch.js (frontend orchestration)

This file is kept for backwards compatibility only.
"""
```

- [ ] **Step 2: Remove research agent from agents.py registry (optional)**

The research agent definition in `agents.py` can be kept for registry metadata (name, color, icon — used by SearchSidebar header) but `run_module` and `run_function` are no longer the primary path. Add a comment:

```python
    # Note: run_research() is the legacy chat path. The primary Research
    # pipeline is SearchCardsThread in ui/widget.py (agent-kanal-paradigma).
    run_module='research',
    run_function='run_research',
```

- [ ] **Step 3: Run research tests**

Run: `python3 -m pytest tests/test_research.py -v`
Expected: PASS (no functional changes, just docs)

- [ ] **Step 4: Commit**

```bash
git add research/__init__.py ai/agents.py
git commit -m "docs: deprecate run_research() — Stapel pipeline IS the Research Agent"
```

---

### Task 8: Archive router agent-routing + handoff, update tests

**Files:**
- Modify: `ai/router.py` — gut agent-routing, keep backwards-compat re-exports
- Modify: `ai/handoff.py` — add deprecation note
- Modify: `tests/test_router.py` — redirect tests to `rag_analyzer`

- [ ] **Step 1: Slim down `router.py`**

Replace the entire file with a backwards-compat shim:
```python
"""Router — DEPRECATED. Agent routing removed (agent-kanal-paradigma).

RAG query analysis moved to ai/rag_analyzer.py.
This file kept for backwards compatibility only.
"""

# Re-export for any code that still imports from router
try:
    from ..ai.rag_analyzer import RagAnalysis as UnifiedRoutingResult, analyze_query
except ImportError:
    from ai.rag_analyzer import RagAnalysis as UnifiedRoutingResult, analyze_query

RoutingResult = UnifiedRoutingResult


def route_message(user_message, session_context=None, config=None,
                  card_context=None, chat_history=None):
    """DEPRECATED — calls analyze_query() and wraps result."""
    return analyze_query(
        user_message=user_message,
        card_context=card_context,
        chat_history=chat_history,
    )
```

- [ ] **Step 2: Add deprecation note to `handoff.py`**

Add at top of `ai/handoff.py`:
```python
"""Agent Handoff — DEPRECATED (agent-kanal-paradigma).

Cross-agent handoff is no longer used. Each agent has a dedicated channel.
This file is kept for reference only.
"""
```

- [ ] **Step 3: Update test_router.py**

The existing tests still import from `ai.router` which now re-exports from `rag_analyzer`. Update tests to verify the shim works:

- Keep `test_unified_routing_result_tutor_with_queries` → rename to test `RagAnalysis` fields
- Keep `test_unified_route_tutor_with_search` → now tests `analyze_query` via shim
- Remove `test_unified_route_plusi` (no agent routing anymore)
- Remove `test_route_message_heuristic_plusi` (no heuristics anymore)
- Keep error/fallback tests

- [ ] **Step 4: Run all tests**

Run: `python3 -m pytest tests/ -v --tb=short 2>&1 | tail -40`
Expected: All pass. Fix any remaining import issues.

- [ ] **Step 5: Commit**

```bash
git add ai/router.py ai/handoff.py tests/test_router.py
git commit -m "refactor: archive router agent-routing + handoff, keep rag_analyzer shim"
```

---

## Phase 3: Frontend — Views bestimmen Agent, kein Client-Routing

### Task 9: Add `agent` parameter to bridge sendMessage path

**Files:**
- Modify: `ui/widget.py:1303-1312` (`_msg_send_message`)
- Modify: `ui/widget.py:2330` (`handle_message_from_ui` signature)
- Modify: `ui/bridge.py:1392-1398` (mark `subagentDirect` deprecated)

- [ ] **Step 1: Add `agent` to `_msg_send_message`**

In `ui/widget.py`, update `_msg_send_message` (line 1303):
```python
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
                agent_name=data.get('agent'))  # NEW: agent from frontend
```

- [ ] **Step 2: Add `agent_name` to `handle_message_from_ui`**

Update signature (line 2330):
```python
    def handle_message_from_ui(self, message: str, history=None, mode='compact',
                               request_id=None, agent_name=None):
```

Then pass `agent_name` through to the AI handler call. Find where `get_response_with_rag` is called and add `agent_name=agent_name`:
```python
handler.get_response_with_rag(
    text, context, history, mode, insights, callback,
    agent_name=agent_name)
```

- [ ] **Step 3: Deprecate `subagentDirect` (don't remove yet)**

In `ui/bridge.py`, add deprecation log to `subagentDirect` (line 1393):
```python
    @pyqtSlot(str, str, str)
    def subagentDirect(self, agent_name, text, extra_json='{}'):
        """DEPRECATED: Route via sendMessage with agent param instead."""
        logger.info("subagentDirect called (deprecated) — agent=%s", agent_name)
        # ... keep existing implementation as fallback ...
```

- [ ] **Step 4: Commit**

```bash
git add ui/widget.py ui/bridge.py
git commit -m "feat: sendMessage accepts agent parameter from frontend"
```

---

### Task 10: Update useChat.js — remove @mention detection

**Files:**
- Modify: `frontend/src/hooks/useChat.js:335-384`

- [ ] **Step 1: Add `agentName` parameter to `handleSend`**

The `handleSend` function needs to accept an agent name from the parent view. Find the function definition and add the parameter:

```javascript
// Before:
const handleSend = useCallback(async (text) => {

// After:
const handleSend = useCallback(async (text, { agent } = {}) => {
```

- [ ] **Step 2: Remove @mention detection block**

Remove lines 335-366 (the `getDirectCallPattern` + `directMatch` block + `subagentDirect` call). This entire block detects @mentions and routes to `subagentDirect`. No longer needed.

- [ ] **Step 3: Pass `agent` in sendMessage data**

Update the bridge sendMessage call (lines 371-384). Change from:
```javascript
bridge.sendMessage(text, conversationHistory, mode, requestId);
```
To include agent in the message data:
```javascript
window.ankiBridge?.addMessage('sendMessage', {
  message: text,
  history: conversationHistory,
  mode,
  requestId,
  agent: agent || undefined,  // Let backend default to tutor if not specified
});
```

Note: Check how `sendMessage` is currently called — it might go through `bridge.sendMessage()` or `ankiBridge.addMessage()`. Use whichever path matches the current polling queue pattern.

- [ ] **Step 4: Remove `getDirectCallPattern` import**

Remove the import of `getDirectCallPattern` from `subagentRegistry.ts` at the top of the file.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useChat.js
git commit -m "refactor: useChat accepts agent prop, removes @mention detection"
```

---

### Task 11: Update App.jsx — views pass agent, remove stickyAgent

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Remove `stickyAgent` state**

Find and remove:
```javascript
const [stickyAgent, setStickyAgent] = useState(null);
```

And all references to `stickyAgent` in the file (the auto-prefix logic in `handleSend`, any JSX that renders sticky agent badges).

- [ ] **Step 2: Update `handleSend` to pass agent based on active view**

Replace the current `handleSend` which may auto-prefix @mentions. Instead, determine agent from `activeView`:

```javascript
const handleSend = useCallback((text) => {
  // Agent determined by active view (channel paradigm)
  const agent = activeView === 'deckBrowser' ? 'research'
              : activeView === 'review' ? 'tutor'
              : 'tutor';  // Default
  chatHook.handleSend(text, { agent });
}, [activeView, chatHook]);
```

- [ ] **Step 3: Verify useSmartSearch IS the Research channel (no changes needed)**

`useSmartSearch.js` → `SearchCardsThread` → Canvas/Sidebar IS the Research Agent's channel pipeline. It was already channel-bound before this refactoring — the Stapel search never went through the chat agent system or the router. This is the symbiosis in action: the pipeline grew organically around the Stapel view's purpose, and it IS the agent. No changes needed — just conceptual acknowledgment.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "refactor: views determine agent — remove stickyAgent, pass agent per channel"
```

---

### Task 12: Simplify subagentRegistry.ts

**Files:**
- Modify: `shared/config/subagentRegistry.ts`

- [ ] **Step 1: Remove `getDirectCallPattern`**

Delete the entire `getDirectCallPattern()` function (lines 83-90). It's no longer called from useChat.

- [ ] **Step 2: Remove `canHandoffTo` from SubagentConfig interface**

In the `SubagentConfig` interface, remove:
```typescript
canHandoffTo?: string[];
```

- [ ] **Step 3: Add `channel` to SubagentConfig interface**

Add:
```typescript
channel?: string;  // 'stapel', 'session', 'plusi', 'reviewer-inline'
```

- [ ] **Step 4: Verify no other files import `getDirectCallPattern`**

Search: `grep -r "getDirectCallPattern" frontend/ shared/`
Remove any remaining imports.

- [ ] **Step 5: Commit**

```bash
git add shared/config/subagentRegistry.ts
git commit -m "refactor: simplify registry — remove routing helpers, add channel field"
```

---

## Phase 4: Neue Kanäle (Outline — nicht Teil dieser Implementierung)

Each new channel is built symbiotically around its purpose — no generic agent interface. The channel's UI, pipeline, and "agent" are one organic unit.

### Plusi-Kanal (Speech Bubble)
The Plusi channel is a **compact speech bubble**, not a chat window. It's the only channel that's view-independent (accessible from any tab via Plusi icon).

**Pipeline (custom, nicht der Chat-Pipeline):**
- User clicks Plusi → bubble opens with text input
- Message goes to `run_plusi()` (Claude Sonnet, personality prompt)
- Help questions: Plusi has help tools (change_theme, navigate_to, explain_feature)
- Personal questions: Plusi responds with character + mood-sync
- Response renders in bubble (compact, max 3-4 Sätze)

**UI:** `PlusiChatBubble.tsx` — floating above Plusi mascot, dismissible, no scroll history (one question, one answer, like a speech bubble should be).

### Prüfungs-Kanal (Reviewer Inline)
The Prüfungs channel is **embedded in the card answer area**, not a sidebar. It's the most tightly coupled channel — the UI IS the card interaction.

**Pipeline (custom):**
- User submits answer → Prüfungs-Agent evaluates inline
- MC questions generated below card
- Feedback rendered as part of card view (not separate chat)
- Migrates Tutor workflows `quiz` and `explain`

**UI:** Inline in `ReviewerView` below the answer area. No separate component — it's part of the review flow.

### Statistik-Kanal
- Open question — to be decided during development
- Likely: Plusi commentary (proactive observations on learning stats)
- Not a separate agent — Plusi observes via existing memory/state system

---

## Verification Checklist

After completing all tasks:

- [ ] `python3 run_tests.py` — all Python tests pass
- [ ] `cd frontend && npm test` — all frontend tests pass
- [ ] `cd frontend && npm run build` — builds without errors
- [ ] Manual test in Anki: Session chat works (sends to Tutor)
- [ ] Manual test in Anki: Stapel search works (sends to Research via searchCards)
- [ ] Manual test: No @mention UI remnants visible
- [ ] `product-concept.md` Principle #4 reflects channel paradigm
- [ ] `CLAUDE.md` "Agentisches System" reflects channel paradigm
