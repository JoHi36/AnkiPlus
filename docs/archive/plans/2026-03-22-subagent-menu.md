# Sub-Agent Menu & Research Sources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified sub-agent menu system with a Research Agent detail page featuring toggleable search sources (Perplexity, PubMed, Wikipedia) and source branding in the AgenticCell header.

**Architecture:** Full-page navigation pattern (like PlusiMenu) for sub-agent detail pages. Backend routing in `research/search.py` selects source by domain keywords, respecting user toggles from config. Source branding shows in AgenticCell header via `tool_used` field.

**Tech Stack:** React (frontend), Python (research modules), MediaWiki API (Wikipedia), NCBI E-utilities (PubMed), OpenRouter/Perplexity (web search)

**Spec:** `docs/superpowers/specs/2026-03-22-subagent-menu-design.md`

---

### Task 1: Config — Add `research_sources` defaults

**Files:**
- Modify: `config.py` — add `research_sources` to DEFAULT_CONFIG

- [ ] **Step 1: Add research_sources to DEFAULT_CONFIG**

In `config.py`, add to `DEFAULT_CONFIG` dict:

```python
"research_sources": {
    "pubmed": True,
    "wikipedia": True,
},
```

Perplexity is implicit (always-on fallback), so it's not in the config.

- [ ] **Step 2: Run tests**

Run: `python3 run_tests.py -k config -v`
Expected: All config tests pass (defaults merge correctly)

- [ ] **Step 3: Commit**

```
feat(config): add research_sources defaults
```

---

### Task 2: Bridge — Add saveResearchSources / getResearchSources handlers

**Files:**
- Modify: `ui/widget.py` — add two message handlers to the dispatcher

- [ ] **Step 1: Add getResearchSources handler**

In `ui/widget.py`, add a handler method:

```python
def _msg_get_research_sources(self, data):
    """Return current research source toggles."""
    config = get_config()
    sources = config.get('research_sources', {'pubmed': True, 'wikipedia': True})
    self._send_to_frontend('researchSourcesLoaded', sources)
```

- [ ] **Step 2: Add saveResearchSources handler**

```python
def _msg_save_research_sources(self, data):
    """Save research source toggles to config."""
    try:
        if isinstance(data, dict):
            update_config(research_sources=data)
            self.config = get_config(force_reload=True)
            logger.info("Research sources updated: %s", data)
    except Exception as e:
        logger.exception("saveResearchSources error: %s", e)
```

- [ ] **Step 3: Register both in the message handler map**

Add to `_build_handler_map()` in the Utilities section:

```python
'getResearchSources': self._msg_get_research_sources,
'saveResearchSources': self._msg_save_research_sources,
```

- [ ] **Step 4: Commit**

```
feat(bridge): add research source toggle handlers
```

---

### Task 3: Backend — Wikipedia search module

**Files:**
- Create: `research/wikipedia.py`

- [ ] **Step 1: Create wikipedia.py**

```python
"""Wikipedia MediaWiki API client — free, no key needed."""
import json
import urllib.request
import urllib.error
from html import unescape
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

WIKI_API = 'https://de.wikipedia.org/w/api.php'


def _strip_html(text):
    """Remove HTML tags from MediaWiki extract."""
    return unescape(re.sub(r'<[^>]+>', '', text))


def search_wikipedia(query: str, lang: str = 'de') -> dict:
    """Search Wikipedia and return extracts + thumbnails.

    Returns dict with 'articles' list and 'error'.
    """
    api = f'https://{lang}.wikipedia.org/w/api.php'

    # Step 1: Search for matching pages
    search_params = urllib.parse.urlencode({
        'action': 'query', 'list': 'search', 'srsearch': query,
        'srlimit': 3, 'format': 'json', 'utf8': 1,
    })

    try:
        with urllib.request.urlopen(f'{api}?{search_params}', timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        results = data.get('query', {}).get('search', [])
        if not results:
            return {'articles': [], 'error': None}

        page_ids = [str(r['pageid']) for r in results]

        # Step 2: Get extracts + thumbnails for found pages
        extract_params = urllib.parse.urlencode({
            'action': 'query', 'pageids': '|'.join(page_ids),
            'prop': 'extracts|pageimages', 'exintro': True,
            'explaintext': True, 'exlimit': len(page_ids),
            'piprop': 'thumbnail', 'pithumbsize': 200,
            'format': 'json', 'utf8': 1,
        })

        with urllib.request.urlopen(f'{api}?{extract_params}', timeout=8) as resp:
            detail_data = json.loads(resp.read().decode('utf-8'))

        pages = detail_data.get('query', {}).get('pages', {})
        articles = []
        for pid in page_ids:
            page = pages.get(pid, {})
            title = page.get('title', '')
            extract = page.get('extract', '')
            thumbnail = page.get('thumbnail', {}).get('source', '')

            if not title or not extract:
                continue

            # Truncate to first 2 sentences for snippet
            sentences = extract.split('. ')
            snippet = '. '.join(sentences[:2])
            if len(sentences) > 2:
                snippet += '.'

            articles.append({
                'title': title,
                'url': f'https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}',
                'domain': f'{lang}.wikipedia.org',
                'favicon_letter': 'W',
                'snippet': snippet,
                'extract': extract,
                'thumbnail': thumbnail,
            })

        return {'articles': articles, 'error': None}

    except urllib.error.URLError as e:
        logger.warning("Wikipedia API error: %s", e)
        return {'articles': [], 'error': str(e)}
    except Exception as e:
        logger.exception("Wikipedia search error")
        return {'articles': [], 'error': str(e)}
```

- [ ] **Step 2: Commit**

```
feat(research): add Wikipedia MediaWiki API client
```

---

### Task 4: Backend — Update search router with source toggles + Wikipedia

**Files:**
- Modify: `research/search.py` — add Wikipedia routing, accept `enabled_sources`
- Modify: `research/__init__.py` — pass enabled_sources from config

- [ ] **Step 1: Add Wikipedia keywords + routing to search.py**

Add at module level:

```python
DEFINITION_KEYWORDS = {
    'was ist', 'what is', 'definition', 'bedeutung', 'meaning',
    'erkläre', 'explain', 'überblick', 'overview', 'zusammenfassung',
    'wer war', 'who was', 'geschichte von', 'history of',
}

def _is_definition_query(query: str) -> bool:
    q_lower = query.lower()
    return any(kw in q_lower for kw in DEFINITION_KEYWORDS)
```

- [ ] **Step 2: Add `_sources_from_wikipedia` helper**

```python
def _sources_from_wikipedia(articles: list) -> list:
    return [
        Source(
            title=a.get('title', ''),
            url=a.get('url', ''),
            domain=a.get('domain', 'de.wikipedia.org'),
            favicon_letter='W',
            snippet=a.get('snippet', ''),
        )
        for a in articles
    ]
```

- [ ] **Step 3: Update `search()` signature and routing**

Update the `search()` function to accept `enabled_sources` and route accordingly:

```python
def search(query: str, api_key: str = '', enabled_sources: dict = None) -> ResearchResult:
    """Run the best search tool for the given query."""
    if enabled_sources is None:
        enabled_sources = {'pubmed': True, 'wikipedia': True}

    # 1. PubMed for medical queries (if enabled)
    if enabled_sources.get('pubmed', True) and _is_medical_query(query):
        try:
            from .pubmed import search_pubmed
            pm_result = search_pubmed(query)
            if pm_result['articles']:
                snippets = [a.get('snippet', '') for a in pm_result['articles'] if a.get('snippet')]
                answer = '\n\n'.join(f'[{i+1}] {s}' for i, s in enumerate(snippets)) if snippets else ''
                answer = _convert_citations(answer) if answer else ''
                return ResearchResult(
                    sources=_sources_from_pubmed(pm_result['articles']),
                    answer=answer,
                    query=query,
                    tool_used='pubmed',
                )
        except Exception:
            logger.exception("PubMed search failed, falling back")

    # 2. Wikipedia for definition queries (if enabled)
    if enabled_sources.get('wikipedia', True) and _is_definition_query(query):
        try:
            from .wikipedia import search_wikipedia
            wiki_result = search_wikipedia(query)
            if wiki_result['articles']:
                articles = wiki_result['articles']
                # Build answer from extracts with citations
                parts = []
                for i, a in enumerate(articles):
                    extract = a.get('extract', a.get('snippet', ''))
                    if extract:
                        parts.append(f'[[WEB:{i+1}]] {extract}')
                answer = '\n\n'.join(parts)
                return ResearchResult(
                    sources=_sources_from_wikipedia(articles),
                    answer=answer,
                    query=query,
                    tool_used='wikipedia',
                )
        except Exception:
            logger.exception("Wikipedia search failed, falling back")

    # 3. Fallback: Perplexity Sonar via OpenRouter (always active)
    if not api_key:
        return ResearchResult(query=query,
                              error='Kein API-Key konfiguriert.')

    try:
        from .openrouter import search_via_openrouter
        result = search_via_openrouter(query, api_key, model='perplexity/sonar')

        if result.get('error'):
            return ResearchResult(query=query, tool_used='perplexity',
                                  error=result['error'])

        answer = _convert_citations(result.get('answer', ''))
        return ResearchResult(
            sources=_sources_from_citations(result.get('citations', [])),
            answer=answer,
            query=query,
            tool_used='perplexity',
        )
    except Exception as e:
        logger.exception("OpenRouter search failed")
        return ResearchResult(query=query, error=str(e))
```

- [ ] **Step 4: Update `run_research()` in `__init__.py` to pass enabled_sources**

```python
def run_research(query: str = '', **kwargs) -> dict:
    """Entry point called by the sub-agent system."""
    from .search import search

    if not query and kwargs.get('situation'):
        query = kwargs['situation']

    config = get_config()
    api_key = config.get('openrouter_api_key', '')
    enabled_sources = config.get('research_sources', {'pubmed': True, 'wikipedia': True})

    logger.info("Research Agent searching: %s", query[:80])
    result = search(query, api_key=api_key, enabled_sources=enabled_sources)

    if result.error:
        logger.warning("Research Agent error: %s", result.error)
    else:
        logger.info("Research Agent found %d sources via %s",
                     len(result.sources), result.tool_used)

    return result.to_dict()
```

- [ ] **Step 5: Run tests**

Run: `python3 run_tests.py -v`
Expected: 245 tests pass

- [ ] **Step 6: Commit**

```
feat(research): add Wikipedia routing and source toggles
```

---

### Task 5: Frontend — ResearchSourceBadge component (brand logos)

**Files:**
- Create: `frontend/src/components/ResearchSourceBadge.jsx`

- [ ] **Step 1: Create ResearchSourceBadge with SVG brand logos**

Create `frontend/src/components/ResearchSourceBadge.jsx`:

The component maps `toolUsed` ('perplexity', 'perplexity/sonar', 'pubmed', 'wikipedia') to a brand icon (16px) + label. Uses inline SVGs — no external assets.

Brand colors:
- Perplexity: `#20B8CD`
- PubMed: `#326599`
- Wikipedia: `var(--ds-text-secondary)`

Each logo is a simplified, recognizable SVG at 16px height with the brand name as text beside it.

- [ ] **Step 2: Commit**

```
feat(ui): add ResearchSourceBadge with brand logos
```

---

### Task 6: Frontend — Wire source branding into AgenticCell header

**Files:**
- Modify: `frontend/src/components/ToolWidgetRenderer.jsx`

- [ ] **Step 1: Import ResearchSourceBadge**

```javascript
import ResearchSourceBadge from './ResearchSourceBadge';
```

- [ ] **Step 2: Pass `tool_used` as headerMeta to AgenticCell for search_web**

Update the `search_web` rendering in ToolWidgetRenderer:

```jsx
if (tw.name === 'search_web') {
  if (tw.displayType === 'loading') {
    return <AgenticCell key={`loading-${i}`} agentName="research" isLoading loadingHint={tw.loadingHint} />;
  }
  const toolUsed = tw.result?.tool_used || 'perplexity';
  return (
    <AgenticCell
      key={`widget-${i}`}
      agentName="research"
      headerMeta={<ResearchSourceBadge toolUsed={toolUsed} />}
    >
      <ResearchContent
        sources={tw.result?.sources}
        answer={tw.result?.answer}
        error={tw.result?.error}
      />
    </AgenticCell>
  );
}
```

- [ ] **Step 3: Verify `tool_used` is passed through the result chain**

Check that `ResearchResult.to_dict()` includes `tool_used` and that it arrives in `tw.result.tool_used` in the frontend. Trace: `search.py` → `__init__.py` → `tools.py execute_search_web` → `agent_loop.py tool marker` → `ChatMessage.jsx toolWidgets` → `ToolWidgetRenderer`.

- [ ] **Step 4: Build and verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```
feat(ui): show source brand logo in Research Agent header
```

---

### Task 7: Frontend — ResearchMenu component

**Files:**
- Create: `frontend/src/components/ResearchMenu.jsx`

- [ ] **Step 1: Create ResearchMenu**

Full-page component with:
- Back arrow + "Research Agent" title header
- "QUELLEN (?)" section header with tooltip (reuse `SectionHeader` from AgentStudio or inline)
- Source list card with toggles (same visual pattern as AgentStudio tool rows)
- Each source: brand logo (32px) + label + description + toggle
- Perplexity toggle is always-on (disabled toggle, "Standard" badge)
- PubMed and Wikipedia toggleable

State management:
- Load sources via `bridge` message `getResearchSources` on mount
- Listen for `ankiResearchSourcesLoaded` event
- Save via `saveResearchSources` message on toggle

Style: Match AgentStudio exactly (same `styles` object pattern — `container`, `card`, `toolRow`, etc.)

- [ ] **Step 2: Commit**

```
feat(ui): add ResearchMenu full-page component
```

---

### Task 8: Frontend — Wire navigation in App.jsx and AgentStudio

**Files:**
- Modify: `frontend/src/App.jsx` — add `researchMenu` view routing
- Modify: `frontend/src/components/AgentStudio.jsx` — wire onClick

- [ ] **Step 1: Add `onNavigateToResearch` prop to AgentStudio**

In `AgentStudio.jsx`, accept `onNavigateToResearch` prop and wire the Research Agent's "Sub-Agent-Menü" button:

```jsx
export default function AgentStudio({ bridge, onNavigateToPlusi, onNavigateToResearch }) {
```

On the Research Agent's sub-agent button div, add:

```jsx
onClick={onNavigateToResearch}
```

- [ ] **Step 2: Add researchMenu routing in App.jsx**

In `App.jsx`, add to the view switch (after the plusiMenu case):

```jsx
) : activeView === 'researchMenu' ? (
  <ResearchMenu
    bridge={bridge}
    onNavigateBack={() => setActiveView('agentStudio')}
  />
```

And pass the callback to AgentStudio:

```jsx
<AgentStudio
  bridge={bridge}
  onNavigateToPlusi={() => setActiveView('plusiMenu')}
  onNavigateToResearch={() => setActiveView('researchMenu')}
/>
```

- [ ] **Step 3: Build and test navigation**

Run: `cd frontend && npm run build`
Expected: Build succeeds. In browser dev mode, clicking "Sub-Agent-Menü" under Research Agent navigates to ResearchMenu, back arrow returns to AgentStudio.

- [ ] **Step 4: Commit**

```
feat(ui): wire ResearchMenu navigation in App.jsx and AgentStudio
```

---

### Task 9: Backend — PubMed German summarization via Gemini

**Files:**
- Modify: `research/search.py` — add Gemini summarization for PubMed results

- [ ] **Step 1: Add `_summarize_pubmed_de()` helper**

In `search.py`, add a function that takes PubMed abstracts and returns a German summary:

```python
def _summarize_pubmed_de(snippets: list, query: str) -> str:
    """Summarize PubMed abstracts in German via Gemini."""
    try:
        from ..ai.gemini import make_gemini_request
    except ImportError:
        from ai.gemini import make_gemini_request

    combined = '\n\n'.join(f'[{i+1}] {s}' for i, s in enumerate(snippets))
    prompt = (
        f'Frage: {query}\n\n'
        f'Studienergebnisse:\n{combined}\n\n'
        'Fasse die relevanten Ergebnisse in 2-4 Sätzen auf Deutsch zusammen. '
        'Zitiere mit [1], [2] etc. Antworte direkt ohne Einleitung.'
    )

    try:
        result = make_gemini_request(prompt, max_tokens=400, temperature=0.3)
        if result and result.get('text'):
            return _convert_citations(result['text'])
    except Exception:
        logger.exception("PubMed Gemini summarization failed")

    # Fallback: return raw snippets with citation markers
    return _convert_citations(combined)
```

- [ ] **Step 2: Use it in the PubMed branch of `search()`**

Replace the raw snippet joining with the Gemini call:

```python
if pm_result['articles']:
    snippets = [a.get('snippet', '') for a in pm_result['articles'] if a.get('snippet')]
    answer = _summarize_pubmed_de(snippets, query) if snippets else ''
    return ResearchResult(...)
```

- [ ] **Step 3: Verify make_gemini_request import works**

Check `ai/gemini.py` for `make_gemini_request` function signature. If it doesn't exist as a simple sync function, use whatever the existing pattern is for a quick Gemini call (check `ai/models.py` for `generate_section_title` as a reference pattern).

- [ ] **Step 4: Run tests**

Run: `python3 run_tests.py -v`
Expected: All tests pass

- [ ] **Step 5: Commit**

```
feat(research): summarize PubMed results in German via Gemini
```

---

### Task 10: Final build + integration test

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run all Python tests**

Run: `python3 run_tests.py -v`
Expected: 245+ tests pass

- [ ] **Step 3: Manual test checklist**

In browser (npm run dev):
1. AgentStudio → "Sub-Agent-Menü" under Research Agent → ResearchMenu opens
2. ResearchMenu shows 3 sources with toggles
3. Perplexity toggle is disabled (always on)
4. PubMed and Wikipedia can be toggled
5. Back arrow returns to AgentStudio
6. Source toggles persist after page reload

In Anki (after build):
7. Research Agent response shows source brand logo in header
8. PubMed query returns German summary
9. Wikipedia query returns German Wikipedia results
10. General query uses Perplexity as fallback

- [ ] **Step 4: Commit**

```
feat: complete sub-agent menu with research sources
```
