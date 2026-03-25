# Agentic Cell & Research Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Agentic Cell skeleton for all sub-agents and implement the Research Agent as its first consumer.

**Architecture:** Two-layer system — AgenticCell is a shared React shell (gradient glow, header, loading state) driven by SubagentRegistry fields. Research Agent is a Python package with Perplexity Sonar + PubMed backends, registered as a standard sub-agent with a `search_web` tool.

**Tech Stack:** Python 3 (dataclasses, httpx), React 18, CSS custom properties, Perplexity Sonar API, PubMed E-utilities API

**Spec:** `docs/superpowers/specs/2026-03-22-agentic-cell-and-research-agent-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/AgenticCell.jsx` | Shared skeleton: gradient glow, header, loading, error |
| `frontend/src/components/ResearchContent.jsx` | Research-specific content: source chips, web citations |
| `frontend/src/components/WebCitationBadge.jsx` | Inline `[[WEB:N]]` badge (clickable, opens URL) |
| `research/__init__.py` | `run_research()` entry point |
| `research/types.py` | `Source`, `ResearchResult` dataclasses |
| `research/perplexity.py` | Perplexity Sonar API client |
| `research/pubmed.py` | PubMed E-utilities API client |
| `research/search.py` | Multi-tool orchestrator (selects Perplexity vs PubMed) |
| `tests/test_research.py` | Research Agent unit tests |

### Modified files
| File | Changes |
|------|---------|
| `ai/subagents.py:12-25` | Add `icon_type`, `icon_svg`, `loading_hint_template` to SubagentDefinition |
| `ai/subagents.py:77-82` | Update `get_registry_for_frontend()` to serialize new fields |
| `ai/subagents.py:85+` | Update Plusi color to `#0A84FF`, add new fields to registration |
| `ai/subagents.py` (bottom) | Add Research Agent registration |
| `ai/agent_loop.py:27-41` | Add `extra_fields` param to `_build_tool_marker()` |
| `ai/tools.py` (after L311) | Add `search_web` tool definition + `execute_search_web()` |
| `shared/config/subagentRegistry.ts:6-12` | Add optional `iconType`, `iconSvg`, `loadingHintTemplate` to interface |
| `config.py:18-46` | Add `research_enabled`, `perplexity_api_key`, `ai_tools.research` |
| `frontend/src/components/ToolWidgetRenderer.jsx:29-72` | Route `search_web` through AgenticCell |
| `frontend/src/components/ChatMessage.jsx:1537+` | Add `[[WEB:N]]` regex parser alongside existing card citations |
| `frontend/src/hooks/useChat.js:122+` | Store `webSources` in message metadata from tool results |

---

## Task 1: Extend SubagentDefinition with new fields

**Files:**
- Modify: `ai/subagents.py:12-25` (dataclass), `ai/subagents.py:77-82` (serialization)
- Test: `tests/test_subagents.py`

- [ ] **Step 1: Write failing test for new fields**

```python
# tests/test_subagents.py — add to existing tests
def test_subagent_definition_new_fields():
    """New optional fields have sensible defaults."""
    from ai.subagents import SubagentDefinition
    d = SubagentDefinition(
        name='test', label='Test', description='desc', color='#FF0000',
        enabled_key='test_enabled', pipeline_label='Test',
        run_module='test', run_function='run_test', router_hint='hint'
    )
    assert d.icon_type == 'svg'
    assert d.icon_svg == ''
    assert d.loading_hint_template == ''

def test_registry_for_frontend_includes_new_fields():
    """get_registry_for_frontend serializes new icon/loading fields."""
    from ai.subagents import SubagentDefinition, register_subagent, get_registry_for_frontend, SUBAGENT_REGISTRY
    SUBAGENT_REGISTRY.clear()
    register_subagent(SubagentDefinition(
        name='test', label='Test Agent', description='d', color='#00FF00',
        enabled_key='test_on', pipeline_label='Test',
        run_module='test', run_function='run', router_hint='h',
        icon_type='svg', icon_svg='<svg>radar</svg>',
        loading_hint_template='Searching {query}...'
    ))
    result = get_registry_for_frontend({'test_on': True})
    assert len(result) == 1
    assert result[0]['iconType'] == 'svg'
    assert result[0]['iconSvg'] == '<svg>radar</svg>'
    assert result[0]['loadingHintTemplate'] == 'Searching {query}...'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_subagent_definition_new_fields or test_registry_for_frontend_includes_new_fields" -v`
Expected: FAIL — fields don't exist yet

- [ ] **Step 3: Add new fields to SubagentDefinition**

In `ai/subagents.py`, add after line 25 (`extra_kwargs`):

```python
    icon_type: str = 'svg'             # 'svg' or 'emote'
    icon_svg: str = ''                 # SVG markup for icon (empty = letter fallback)
    loading_hint_template: str = ''    # e.g. "Searching {query}..."
```

- [ ] **Step 4: Update get_registry_for_frontend() to include new fields**

In `ai/subagents.py`, replace lines 77-82:

```python
def get_registry_for_frontend(config: dict) -> list[dict]:
    """Return enabled subagents as dicts for JSON serialization to frontend."""
    enabled = get_enabled_subagents(config)
    return [{'name': a.name, 'label': a.label, 'color': a.color,
             'enabled': True, 'pipelineLabel': a.pipeline_label,
             'iconType': a.icon_type, 'iconSvg': a.icon_svg,
             'loadingHintTemplate': a.loading_hint_template}
            for a in enabled]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_subagent_definition_new_fields or test_registry_for_frontend_includes_new_fields" -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai/subagents.py tests/test_subagents.py
git commit -m "feat(subagents): add icon_type, icon_svg, loading_hint_template fields"
```

---

## Task 2: Update Plusi registration (color + new fields)

**Files:**
- Modify: `ai/subagents.py:85-137` (Plusi registration block)

- [ ] **Step 1: Update Plusi registration**

In the Plusi `register_subagent()` call in `ai/subagents.py`, change:
- `color` from `'#A78BFA'` to `'#0A84FF'`
- Add `icon_type='emote'` (Plusi uses the emote SVG system, not a static icon)
- Add `loading_hint_template='Plusi denkt nach...'`

- [ ] **Step 2: Run existing subagent tests to verify nothing breaks**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_subagent" -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add ai/subagents.py
git commit -m "refactor(plusi): change color to brand blue #0A84FF, add icon_type/loading_hint"
```

---

## Task 3: Update frontend SubagentConfig interface

**Files:**
- Modify: `shared/config/subagentRegistry.ts:6-12`

- [ ] **Step 1: Add optional fields to SubagentConfig**

```typescript
export interface SubagentConfig {
  name: string;
  label: string;
  color: string;
  enabled: boolean;
  pipelineLabel: string;
  iconType?: 'svg' | 'emote';
  iconSvg?: string;
  loadingHintTemplate?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors related to SubagentConfig

- [ ] **Step 3: Commit**

```bash
git add shared/config/subagentRegistry.ts
git commit -m "feat(registry): add iconType, iconSvg, loadingHintTemplate to SubagentConfig"
```

---

## Task 4: Add `extra_fields` to `_build_tool_marker()`

**Files:**
- Modify: `ai/agent_loop.py:27-41`
- Test: `tests/test_agent_loop.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_agent_loop.py — add test
def test_build_tool_marker_extra_fields():
    """Extra fields are merged into the marker payload."""
    from ai.agent_loop import _build_tool_marker
    import json
    marker = _build_tool_marker('search_web', 'loading',
                                extra_fields={'loadingHint': 'Searching photosynthesis...'})
    # Extract JSON from [[TOOL:{...}]]
    json_str = marker[len('[[TOOL:'):-len(']]')]
    data = json.loads(json_str)
    assert data['name'] == 'search_web'
    assert data['displayType'] == 'loading'
    assert data['loadingHint'] == 'Searching photosynthesis...'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_build_tool_marker_extra_fields" -v`
Expected: FAIL — `extra_fields` parameter doesn't exist

- [ ] **Step 3: Add extra_fields parameter**

In `ai/agent_loop.py`, update `_build_tool_marker`:

```python
def _build_tool_marker(name: str, marker_type: str, result=None, error=None,
                       extra_fields: dict = None) -> str:
    """Build a [[TOOL:{...}]] marker string for the frontend."""
    payload = {"name": name, "displayType": marker_type}
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    if extra_fields:
        payload.update(extra_fields)
    return f"[[TOOL:{json.dumps(payload, ensure_ascii=False)}]]"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_build_tool_marker" -v`
Expected: PASS (both old and new tests)

- [ ] **Step 5: Commit**

```bash
git add ai/agent_loop.py tests/test_agent_loop.py
git commit -m "feat(agent-loop): add extra_fields param to _build_tool_marker"
```

---

## Task 5: Add config defaults for Research Agent

**Files:**
- Modify: `config.py:18-46`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_config.py — add test
def test_research_config_defaults():
    """Research agent has default config entries."""
    from config import DEFAULT_CONFIG
    assert DEFAULT_CONFIG.get('research_enabled') is True
    assert DEFAULT_CONFIG.get('perplexity_api_key') == ''
    assert DEFAULT_CONFIG['ai_tools'].get('research') is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_research_config_defaults" -v`
Expected: FAIL

- [ ] **Step 3: Add defaults to config.py**

In `config.py` `DEFAULT_CONFIG`, add:
- `"research_enabled": True` after `"mascot_enabled": False` (line 45)
- `"perplexity_api_key": ""` after `"api_key": ""` (line 21)
- `"research": True` inside `"ai_tools"` dict (line 34)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_research_config" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config.py tests/test_config.py
git commit -m "feat(config): add research_enabled, perplexity_api_key, ai_tools.research defaults"
```

---

## Task 6: Research Agent — types and Perplexity client

**Files:**
- Create: `research/__init__.py`, `research/types.py`, `research/perplexity.py`
- Test: `tests/test_research.py`

- [ ] **Step 1: Create `research/types.py` with dataclasses**

```python
"""Research Agent data types."""
from dataclasses import dataclass, field


@dataclass
class Source:
    title: str
    url: str
    domain: str
    favicon_letter: str  # First letter of domain
    snippet: str = ''


@dataclass
class ResearchResult:
    sources: list[Source] = field(default_factory=list)
    answer: str = ''
    query: str = ''
    tool_used: str = ''
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            'sources': [
                {'title': s.title, 'url': s.url, 'domain': s.domain,
                 'favicon_letter': s.favicon_letter, 'snippet': s.snippet}
                for s in self.sources
            ],
            'answer': self.answer,
            'query': self.query,
            'tool_used': self.tool_used,
            'error': self.error,
        }
```

- [ ] **Step 2: Write test for types**

```python
# tests/test_research.py
def test_research_result_to_dict():
    from research.types import Source, ResearchResult
    r = ResearchResult(
        sources=[Source(title='Test', url='https://example.com', domain='example.com',
                        favicon_letter='E', snippet='A test')],
        answer='Answer text', query='test query', tool_used='perplexity'
    )
    d = r.to_dict()
    assert len(d['sources']) == 1
    assert d['sources'][0]['title'] == 'Test'
    assert d['error'] is None

def test_research_result_error():
    from research.types import ResearchResult
    r = ResearchResult(error='API timeout')
    d = r.to_dict()
    assert d['error'] == 'API timeout'
    assert d['sources'] == []
```

- [ ] **Step 3: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_research_result" -v`
Expected: PASS

- [ ] **Step 4: Create `research/perplexity.py`**

```python
"""Perplexity Sonar API client."""
try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

SONAR_URL = 'https://api.perplexity.ai/chat/completions'
SONAR_MODEL = 'sonar'


def search_perplexity(query: str, api_key: str) -> dict:
    """Call Perplexity Sonar API (runs in thread, so sync is fine).

    Returns dict with 'answer' (str), 'citations' (list of URL strings),
    and 'error' (str or None).
    """
    import httpx

    if not api_key:
        return {'answer': '', 'citations': [], 'error': 'No Perplexity API key configured'}

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': SONAR_MODEL,
        'messages': [
            {'role': 'system', 'content': 'Be precise and academic. Cite your sources with [1], [2] etc. Answer in the same language as the question.'},
            {'role': 'user', 'content': query},
        ],
    }

    try:
        with httpx.Client(timeout=12.0) as client:
            resp = client.post(SONAR_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        answer = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        citations = data.get('citations', [])
        return {'answer': answer, 'citations': citations, 'error': None}

    except httpx.TimeoutException:
        logger.warning("Perplexity API timeout for query: %s", query[:50])
        return {'answer': '', 'citations': [], 'error': 'Search timeout'}
    except Exception as e:
        logger.exception("Perplexity API error")
        return {'answer': '', 'citations': [], 'error': str(e)}
```

- [ ] **Step 5: Write test for perplexity client (edge case)**

```python
# tests/test_research.py — add
def test_perplexity_missing_key():
    """Returns error when no API key provided."""
    from research.perplexity import search_perplexity
    result = search_perplexity('test', '')
    assert result['error'] == 'No Perplexity API key configured'
```

- [ ] **Step 6: Create `research/__init__.py`** (empty for now)

```python
"""Research Agent — web search sub-agent."""
```

- [ ] **Step 7: Run all research tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_research" -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add research/ tests/test_research.py
git commit -m "feat(research): add types, Perplexity Sonar API client"
```

---

## Task 7: Research Agent — PubMed client

**Files:**
- Create: `research/pubmed.py`
- Test: `tests/test_research.py` (extend)

- [ ] **Step 1: Create `research/pubmed.py`**

```python
"""PubMed E-utilities API client — free, no key required."""
try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
MAX_RESULTS = 5


def search_pubmed(query: str) -> dict:
    """Search PubMed and return article summaries.

    Returns dict with 'articles' (list of dicts with title, url, etc.)
    and 'error' (str or None).
    """
    import httpx

    try:
        with httpx.Client(timeout=10.0) as client:
            # Step 1: Search for article IDs
            search_resp = client.get(ESEARCH_URL, params={
                'db': 'pubmed', 'term': query, 'retmax': MAX_RESULTS,
                'retmode': 'json', 'sort': 'relevance',
            })
            search_resp.raise_for_status()
            id_list = search_resp.json().get('esearchresult', {}).get('idlist', [])

            if not id_list:
                return {'articles': [], 'error': None}

            # Step 2: Get article summaries
            summary_resp = client.get(ESUMMARY_URL, params={
                'db': 'pubmed', 'id': ','.join(id_list), 'retmode': 'json',
            })
            summary_resp.raise_for_status()
            results = summary_resp.json().get('result', {})

            articles = []
            for pmid in id_list:
                info = results.get(pmid, {})
                if not isinstance(info, dict):
                    continue
                title = info.get('title', '')
                source = info.get('source', '')
                articles.append({
                    'title': title,
                    'url': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
                    'domain': 'pubmed.ncbi.nlm.nih.gov',
                    'favicon_letter': 'P',
                    'snippet': source or '',
                    'pmid': pmid,
                })
            return {'articles': articles, 'error': None}

    except httpx.TimeoutException:
        logger.warning("PubMed API timeout for query: %s", query[:50])
        return {'articles': [], 'error': 'PubMed timeout'}
    except Exception as e:
        logger.exception("PubMed API error")
        return {'articles': [], 'error': str(e)}
```

- [ ] **Step 2: Write test (mocked HTTP)**

```python
# tests/test_research.py — add
def test_pubmed_empty_results():
    """PubMed returns empty list when no results found."""
    from unittest.mock import patch, MagicMock
    mock_resp = MagicMock()
    mock_resp.json.return_value = {'esearchresult': {'idlist': []}}
    mock_resp.raise_for_status = MagicMock()

    with patch('httpx.Client') as MockClient:
        MockClient.return_value.__enter__ = MagicMock(return_value=MagicMock(
            get=MagicMock(return_value=mock_resp)
        ))
        MockClient.return_value.__exit__ = MagicMock(return_value=False)
        from research.pubmed import search_pubmed
        result = search_pubmed('nonexistent topic xyz')
    assert result['articles'] == []
    assert result['error'] is None
```

- [ ] **Step 3: Run test**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_pubmed" -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add research/pubmed.py tests/test_research.py
git commit -m "feat(research): add PubMed E-utilities API client"
```

---

## Task 8: Research Agent — search orchestrator and run_research()

**Files:**
- Create: `research/search.py`
- Modify: `research/__init__.py`
- Test: `tests/test_research.py` (extend)

- [ ] **Step 1: Create `research/search.py`**

```python
"""Multi-tool search orchestrator — selects best source for the query."""
try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

from .types import Source, ResearchResult

logger = get_logger(__name__)

# Keywords that suggest medical/scientific content
MEDICAL_KEYWORDS = {
    'pubmed', 'studie', 'study', 'clinical', 'klinisch', 'pathologie',
    'diagnose', 'therapie', 'symptom', 'medication', 'pharma', 'enzyme',
    'protein', 'genom', 'mutation', 'trial', 'meta-analysis', 'review',
    'lancet', 'nejm', 'bmj', 'jama',
}


def _is_medical_query(query: str) -> bool:
    """Check if query likely needs PubMed results."""
    q_lower = query.lower()
    return any(kw in q_lower for kw in MEDICAL_KEYWORDS)


def _sources_from_perplexity(citations: list) -> list[Source]:
    """Convert Perplexity citations (URLs) to Source objects."""
    from urllib.parse import urlparse
    sources = []
    for url in citations:
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.replace('www.', '')
            sources.append(Source(
                title=domain,
                url=url,
                domain=domain,
                favicon_letter=domain[0].upper() if domain else '?',
            ))
        except Exception:
            continue
    return sources


def _sources_from_pubmed(articles: list[dict]) -> list[Source]:
    """Convert PubMed articles to Source objects."""
    return [
        Source(
            title=a.get('title', ''),
            url=a.get('url', ''),
            domain=a.get('domain', 'pubmed.ncbi.nlm.nih.gov'),
            favicon_letter='P',
            snippet=a.get('snippet', ''),
        )
        for a in articles
    ]


def search(query: str, api_key: str = '') -> ResearchResult:
    """Run the best search tool for the given query."""
    # Try PubMed for medical queries
    if _is_medical_query(query):
        try:
            from .pubmed import search_pubmed
            pm_result = search_pubmed(query)
            if pm_result['articles']:
                return ResearchResult(
                    sources=_sources_from_pubmed(pm_result['articles']),
                    query=query,
                    tool_used='pubmed',
                )
        except Exception:
            logger.exception("PubMed search failed, falling back to Perplexity")

    # Default: Perplexity Sonar
    if not api_key:
        return ResearchResult(query=query, error='No Perplexity API key configured')

    try:
        from .perplexity import search_perplexity
        px_result = search_perplexity(query, api_key)

        if px_result.get('error'):
            return ResearchResult(query=query, tool_used='perplexity',
                                  error=px_result['error'])

        return ResearchResult(
            sources=_sources_from_perplexity(px_result.get('citations', [])),
            answer=px_result.get('answer', ''),
            query=query,
            tool_used='perplexity',
        )
    except Exception as e:
        logger.exception("Perplexity search failed")
        return ResearchResult(query=query, error=str(e))
```

- [ ] **Step 2: Implement `run_research()` in `research/__init__.py`**

```python
"""Research Agent — web search sub-agent."""
try:
    from ..utils.logging import get_logger
    from ..config import get_config
except ImportError:
    from utils.logging import get_logger
    from config import get_config

logger = get_logger(__name__)


def run_research(query: str = '', **kwargs) -> dict:
    """Entry point called by the sub-agent system."""
    from .search import search

    if not query and kwargs.get('situation'):
        query = kwargs['situation']

    config = get_config()
    api_key = config.get('perplexity_api_key', '')

    logger.info("Research Agent searching: %s", query[:80])
    result = search(query, api_key=api_key)

    if result.error:
        logger.warning("Research Agent error: %s", result.error)
    else:
        logger.info("Research Agent found %d sources via %s",
                     len(result.sources), result.tool_used)

    return result.to_dict()
```

- [ ] **Step 3: Write test for search orchestration**

```python
# tests/test_research.py — add
def test_search_medical_query_uses_pubmed():
    """Medical keywords trigger PubMed search."""
    from research.search import _is_medical_query
    assert _is_medical_query('clinical trial diabetes')
    assert _is_medical_query('Studie zu Enzymaktivität')
    assert not _is_medical_query('French revolution causes')

def test_search_no_api_key_returns_error():
    """search() without API key returns error for non-medical queries."""
    from research.search import search
    result = search('French revolution', api_key='')
    assert result.error == 'No Perplexity API key configured'
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "test_research" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add research/ tests/test_research.py
git commit -m "feat(research): add search orchestrator and run_research entry point"
```

---

## Task 9: Register Research Agent + search_web tool

**Files:**
- Modify: `ai/subagents.py` (add registration at bottom)
- Modify: `ai/tools.py` (add search_web tool)

- [ ] **Step 1: Add Research Agent registration to `ai/subagents.py`**

Add at the bottom of the file, after Plusi registration:

```python
# ── Research Agent Registration ──

RADAR_ICON_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                  '<circle cx="12" cy="12" r="10"/>'
                  '<line x1="12" y1="12" x2="12" y2="2"/>'
                  '<path d="M12 12 L16.24 7.76" stroke-width="2.5"/>'
                  '<circle cx="12" cy="12" r="6" opacity="0.4"/>'
                  '<circle cx="12" cy="12" r="2" fill="#00D084" stroke="none"/>'
                  '</svg>')

register_subagent(SubagentDefinition(
    name='research',
    label='Research Agent',
    description='Searches the internet for cited, high-quality sources',
    color='#00D084',
    enabled_key='research_enabled',
    pipeline_label='Research',
    run_module='research',
    run_function='run_research',
    router_hint='Use when the user asks a question that cannot be adequately '
                'answered from deck cards alone and requires external or '
                'current information. NOT for casual conversation or card-specific questions.',
    main_model_hint='Use search_web tool when your knowledge is insufficient '
                    'to answer the question or the user explicitly asks for '
                    'sources/research from the internet.',
    icon_type='svg',
    icon_svg=RADAR_ICON_SVG,
    loading_hint_template='Durchsuche Quellen zu {query}...',
))
```

- [ ] **Step 2: Add search_web tool to `ai/tools.py`**

Add after the spawn_plusi registration (after line 311):

```python
# ── Research Agent Tool ──

SEARCH_WEB_SCHEMA = {
    'name': 'search_web',
    'description': 'Search the internet for information when deck cards do not '
                   'contain the answer. Returns cited sources with URLs.',
    'parameters': {
        'type': 'object',
        'properties': {
            'query': {
                'type': 'string',
                'description': 'The search query — be specific and include key terms',
            },
        },
        'required': ['query'],
    },
}

def execute_search_web(args: dict) -> dict:
    """Execute the search_web tool."""
    query = args.get('query', '')
    if not query:
        return {'error': 'No query provided'}
    try:
        from research import run_research
        return run_research(query)
    except Exception as e:
        logger.exception("search_web tool error")
        return {'error': str(e)}

registry.register(ToolDefinition(
    name='search_web',
    schema=SEARCH_WEB_SCHEMA,
    execute_fn=execute_search_web,
    category='content',
    config_key='research',
    agent='tutor',
    display_type='widget',
    timeout_seconds=15,
))
```

- [ ] **Step 3: Run all tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add ai/subagents.py ai/tools.py
git commit -m "feat(research): register Research Agent subagent and search_web tool"
```

---

## Task 10: AgenticCell React component

**Files:**
- Create: `frontend/src/components/AgenticCell.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create AgenticCell.jsx**

The component renders the unified skeleton: gradient glow, header (icon/emote + name + meta), content/loading. Uses `--agent-rgb` CSS custom property for the gradient.

Key details:
- `agentName` is looked up in the SubagentRegistry for color, icon, label
- `iconType === 'svg'`: render the SVG string inside a 22x22 container with `agent.color` at 10% bg. The SVG comes from a trusted source (our own registry, not user input), so use a ref-based approach: create a div and set its content via a React ref to avoid raw innerHTML.
- `iconType === 'emote'`: render a placeholder div with `data-agent` attr (Plusi populates via `createPlusi()`)
- Fallback: first letter of label in colored circle
- Loading: shimmer lines + hint text + pulsing dot in meta slot
- See spec for exact CSS values

- [ ] **Step 2: Add AgenticCell CSS to `frontend/src/index.css`**

```css
/* ── Agentic Cell Skeleton ── */
.agent-cell { position: relative; padding: 18px 0; margin: 4px 0; }
.agent-cell-glow {
  position: absolute; top: 0; left: -24px; right: -24px; bottom: 0;
  background: linear-gradient(135deg,
    rgba(var(--agent-rgb), 0.07) 0%,
    rgba(var(--agent-rgb), 0.02) 40%,
    transparent 70%);
  pointer-events: none; z-index: 0;
}
.agent-cell > *:not(.agent-cell-glow) { position: relative; z-index: 1; }
.agent-cell-header { display: flex; align-items: center; margin-bottom: 12px; }
.agent-cell-header-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.agent-cell-header-right { display: flex; align-items: center; gap: 6px; }
.agent-cell-icon {
  width: 22px; height: 22px; display: flex; align-items: center;
  justify-content: center; border-radius: 6px; flex-shrink: 0;
}
.agent-cell-icon svg { width: 16px; height: 16px; }
.agent-cell-icon-letter { font-size: 11px; font-weight: 600; }
.agent-cell-emote { width: 22px; height: 22px; flex-shrink: 0; }
.agent-cell-name { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
.agent-cell-content { font-size: 15px; line-height: 1.65; }
.agent-cell-content p { margin-bottom: 12px; }
.agent-cell-loading-hint { font-size: 13px; font-style: italic; opacity: 0.5; margin-bottom: 12px; }
.agent-cell-shimmer {
  height: 14px; border-radius: 4px; margin-bottom: 10px; width: 92%;
  position: relative; overflow: hidden;
}
.agent-cell-shimmer::after {
  content: ''; position: absolute; top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: agent-shimmer 1.8s ease-in-out infinite;
}
@keyframes agent-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
.agent-cell-pulse-dot {
  width: 7px; height: 7px; border-radius: 50%;
  animation: agent-pulse 1.5s ease-in-out infinite;
}
@keyframes agent-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.8; } }
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AgenticCell.jsx frontend/src/index.css
git commit -m "feat(ui): add AgenticCell skeleton component with gradient glow and loading state"
```

---

## Task 11: ResearchContent + WebCitationBadge components

**Files:**
- Create: `frontend/src/components/ResearchContent.jsx`
- Create: `frontend/src/components/WebCitationBadge.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create WebCitationBadge.jsx**

Clickable badge for `[[WEB:N]]` citations. On click, opens URL via bridge. Styled like existing CitationBadge but in agent green color.

- [ ] **Step 2: Create ResearchContent.jsx**

Shows answer text (ReactMarkdown) + horizontal scrollable source chips in footer. Each chip: favicon letter + title + domain. Clickable → opens URL.

- [ ] **Step 3: Add CSS for research components**

```css
/* ── Web Citation Badge ── */
.web-cite-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; font-size: 10px; font-weight: 600;
  border-radius: 5px; vertical-align: super; margin: 0 1px; cursor: pointer;
}
/* ── Research Source Strip ── */
.research-source-strip {
  display: flex; gap: 8px; overflow-x: auto; padding: 10px 0;
  margin-top: 12px; scrollbar-width: none;
}
.research-source-strip::-webkit-scrollbar { display: none; }
.research-source-chip {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px 7px 9px; border-radius: 9px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0; transition: all 0.2s ease;
}
.research-source-chip:hover { filter: brightness(1.2); }
.research-source-fav {
  width: 15px; height: 15px; border-radius: 3px;
  background: var(--ds-bg-overlay);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; flex-shrink: 0; color: var(--ds-text-primary);
}
.research-source-title { font-size: 12px; font-weight: 500; color: var(--ds-text-primary); }
.research-source-domain { font-size: 10.5px; color: var(--ds-text-tertiary); }
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ResearchContent.jsx frontend/src/components/WebCitationBadge.jsx frontend/src/index.css
git commit -m "feat(ui): add ResearchContent and WebCitationBadge components"
```

---

## Task 12: Wire AgenticCell into ToolWidgetRenderer

**Files:**
- Modify: `frontend/src/components/ToolWidgetRenderer.jsx:29-72`

- [ ] **Step 1: Import AgenticCell and ResearchContent**

```jsx
import AgenticCell from './AgenticCell';
import ResearchContent from './ResearchContent';
```

- [ ] **Step 2: Add `search_web` case to switch**

```jsx
case 'search_web':
  if (tw.displayType === 'loading') {
    return <AgenticCell key={`loading-${i}`} agentName="research" isLoading loadingHint={tw.loadingHint} />;
  }
  return (
    <AgenticCell key={`widget-${i}`} agentName="research">
      <ResearchContent
        sources={tw.result?.sources}
        answer={tw.result?.answer}
        error={tw.result?.error}
      />
    </AgenticCell>
  );
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ToolWidgetRenderer.jsx
git commit -m "feat(ui): wire search_web tool through AgenticCell in ToolWidgetRenderer"
```

---

## Task 13: Add `[[WEB:N]]` citation parsing + webSources to messages

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx:1537+`
- Modify: `frontend/src/hooks/useChat.js:122+`

- [ ] **Step 1: Store webSources in message metadata**

In `useChat.js`, when processing tool results in the streaming handler, detect `search_web` tool results and store `result.sources` as `webSources` on the message object.

- [ ] **Step 2: Add `[[WEB:N]]` regex to ChatMessage.jsx**

Add regex: `/\[\[WEB:(\d+)\]\]/g` alongside the existing card citation parser. Replace matches with `<WebCitationBadge>` components. The `webSources` prop provides the URL for each 1-based index.

Import: `import WebCitationBadge from './WebCitationBadge';`

- [ ] **Step 3: Pass webSources as prop to ChatMessage**

Ensure the message's `webSources` array is passed down from the parent component.

- [ ] **Step 4: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx frontend/src/hooks/useChat.js
git commit -m "feat(citations): add [[WEB:N]] parsing and webSources message metadata"
```

---

## Task 14: Integration verification

**Files:** None new — verification only.

- [ ] **Step 1: Run all Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All PASS

- [ ] **Step 2: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Verify Research Agent registration**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "from ai.subagents import SUBAGENT_REGISTRY; print([s.name for s in SUBAGENT_REGISTRY.values()])"`
Expected: `['plusi', 'research']`

- [ ] **Step 4: Verify search_web tool is registered**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "from ai.tools import registry; print([t.name for t in registry._tools.values()])"`
Expected: List includes `'search_web'`
