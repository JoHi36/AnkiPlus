# Sub-Agent Menu & Research Sources — Design Spec

**Date:** 2026-03-22
**Status:** Approved

## Overview

A unified sub-agent menu system where each sub-agent gets a full-screen detail page (like PlusiMenu). The first implementation is the **Research Agent Menu** with toggleable domain-specific search sources and source branding in the AgenticCell header.

## 1. Navigation System

### Pattern: Full-Page Sub-Agent Views

Each sub-agent can register a menu page. Clicking "Sub-Agent-Menü" in AgentStudio navigates to `activeView: '<agentName>Menu'` — identical to how PlusiMenu works.

**App.jsx routing:**
```
activeView === 'researchMenu' → <ResearchMenu />
activeView === 'plusiMenu'    → <PlusiMenu />
activeView === 'agentStudio'  → <AgentStudio />
```

**Navigation flow:**
```
AgentStudio → [click "Sub-Agent-Menü"] → ResearchMenu
ResearchMenu → [click back arrow] → AgentStudio
```

**Adding a new sub-agent menu later:** Add one `activeView` case in App.jsx + one `onNavigateTo*` callback in AgentStudio. No other changes needed.

### Props

```tsx
interface SubAgentMenuProps {
  bridge: any;
  onNavigateBack: () => void;  // Returns to AgentStudio
}
```

## 2. Research Agent Menu — Content

### Layout

```
┌─────────────────────────────────────────┐
│  ←  Research Agent                      │
│                                         │
│  QUELLEN  (?)                           │
│  ┌─────────────────────────────────────┐│
│  │ [Perplexity logo]  Perplexity   [✓] ││
│  │ Web-Suche — Standard für alle       ││
│  │ allgemeinen Fragen                  ││
│  ├─────────────────────────────────────┤│
│  │ [PubMed logo]  PubMed          [✓] ││
│  │ Wissenschaftliche Studien —         ││
│  │ bei medizinischen Fragen            ││
│  ├─────────────────────────────────────┤│
│  │ [Wikipedia logo]  Wikipedia    [✓] ││
│  │ Definitionen & Überblick —          ││
│  │ schnell und kostenlos               ││
│  └─────────────────────────────────────┘│
│                                         │
│  Quellen werden automatisch gewählt.    │
│  Spezifische Quellen haben Vorrang.     │
└─────────────────────────────────────────┘
```

### Source Definitions (v1)

Each source is a config entry with:

```ts
interface ResearchSource {
  key: string;           // 'perplexity', 'pubmed', 'wikipedia'
  label: string;         // Display name
  description: string;   // When this source is used
  logo: ReactNode;       // Brand logo/wordmark (SVG)
  defaultEnabled: true;
  isFallback?: boolean;  // true for Perplexity — always used as last resort
}
```

**v1 Sources:**

| Key | Label | Description | Fallback |
|-----|-------|-------------|----------|
| `perplexity` | Perplexity | Web-Suche — Standard für alle allgemeinen Fragen | Yes (always active) |
| `pubmed` | PubMed | Wissenschaftliche Studien — bei medizinischen Fragen | No |
| `wikipedia` | Wikipedia | Definitionen & Überblick — schnell und kostenlos | No |

### Toggle Behavior

- Each source can be toggled on/off
- **Perplexity is always-on as fallback** — toggle disabled, subtle "Standard" badge
- Other sources: when enabled, the router checks their domain keywords first. If no match or source is off, falls back to Perplexity
- Settings saved via bridge message `saveResearchSources` → stored in `config.json` as `research_sources: { pubmed: true, wikipedia: true }`

### Tooltip (?)

Hovering the `?` next to "QUELLEN" shows:
> "Quellen werden automatisch anhand deiner Frage gewählt. Spezifische Quellen (PubMed, Wikipedia) haben Vorrang, wenn Schlüsselwörter erkannt werden. Perplexity ist der Fallback für alle anderen Fragen."

## 3. Source Branding in AgenticCell

### HeaderMeta: Source Logo + Name

When the Research Agent returns a result, the `tool_used` field tells us which source was used. This is displayed in the AgenticCell header-right area (where Plusi shows mood):

```
┌─────────────────────────────────────────────┐
│ [radar] Research Agent        [P logo] PubMed │
│                                               │
│ Answer text with citations...                 │
└─────────────────────────────────────────────┘
```

**Implementation:**
- `ResearchResult.tool_used` already returns `'perplexity/sonar'`, `'pubmed'`, `'wikipedia'`
- New component: `ResearchSourceBadge({ toolUsed })` renders the appropriate brand logo (16px height) + name
- Passed as `headerMeta` prop to AgenticCell

### Brand Logos

SVG wordmarks/logos, rendered at 16px height, in the source's brand color:

| Source | Brand Color | Logo Style |
|--------|-------------|------------|
| Perplexity | `#20B8CD` (teal) | Perplexity icon + "Perplexity" text |
| PubMed | `#326599` (blue) | PubMed icon + "PubMed" text |
| Wikipedia | `var(--ds-text-secondary)` | Wikipedia "W" globe + "Wikipedia" text |

Logos are inline SVGs in a `ResearchSourceBadge.jsx` component — no external assets.

## 4. Backend: Source Routing

### Current Flow (search.py)

```python
def search(query, api_key, enabled_sources=None):
    # 1. Check domain-specific sources (if enabled)
    if 'pubmed' in enabled_sources and _is_medical_query(query):
        return search_pubmed(query)
    if 'wikipedia' in enabled_sources and _is_definition_query(query):
        return search_wikipedia(query)
    # 2. Fallback: Perplexity (always)
    return search_perplexity(query, api_key)
```

### New: Wikipedia Module

**File:** `research/wikipedia.py`

Uses MediaWiki API (free, no key needed):
- Search: `https://en.wikipedia.org/w/api.php?action=query&list=search`
- Extract: `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true`
- Thumbnail: `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages`

**Language:** Use German Wikipedia (`de.wikipedia.org`) by default, since the app is German-focused. Can be made configurable later.

**Wikipedia Keywords for Routing:**
```python
DEFINITION_KEYWORDS = {
    'was ist', 'what is', 'definition', 'bedeutung', 'meaning',
    'erkläre', 'explain', 'überblick', 'overview', 'zusammenfassung',
    'wer war', 'who was', 'geschichte von', 'history of',
}
```

**Returns:** Up to 3 articles with title, URL, extract (first paragraph), thumbnail URL.

### Config Persistence

```python
# config.json
{
    "research_sources": {
        "pubmed": true,
        "wikipedia": true
    }
    # perplexity is implicit — always active as fallback
}
```

Bridge message: `saveResearchSources` → saves to config.json
Bridge message: `getResearchSources` → returns current state

### Prompt Fix: Answer Language

All search backends must instruct the model to answer in the user's language. The current prompt says "Answer in the same language as the question" but PubMed returns English abstracts raw.

**Fix for PubMed:** PubMed results are raw abstracts (no LLM processing). Two options:
1. Pass PubMed abstracts through a quick Gemini call for translation/summarization
2. Show abstracts as-is but clearly labeled as English source material

**Decision:** Option 1 — pass through Gemini with prompt: "Fasse diese Studienergebnisse in 2-4 Sätzen auf Deutsch zusammen. Zitiere mit [1], [2] etc."

This keeps the UX consistent: every Research Agent response is a concise, German-language answer with citations.

## 5. File Changes

### New Files
- `frontend/src/components/ResearchMenu.jsx` — Full-page research settings
- `frontend/src/components/ResearchSourceBadge.jsx` — Brand logo + name for AgenticCell header
- `research/wikipedia.py` — Wikipedia MediaWiki API client

### Modified Files
- `frontend/src/App.jsx` — Add `researchMenu` activeView routing
- `frontend/src/components/AgentStudio.jsx` — Wire "Sub-Agent-Menü" onClick to navigate
- `frontend/src/components/ToolWidgetRenderer.jsx` — Pass `toolUsed` to AgenticCell headerMeta
- `research/search.py` — Add Wikipedia routing, accept `enabled_sources` param
- `research/__init__.py` — Pass enabled_sources from config to search()
- `research/pubmed.py` — Add Gemini summarization for German answers
- `ui/widget.py` — Add `saveResearchSources` / `getResearchSources` message handlers
- `ui/bridge.py` — Add bridge slots if needed
- `config.py` — Add `research_sources` defaults

## 6. Future Extensions

### Adding a New Source (Recipe)

1. Create `research/<source>.py` with `search_<source>(query) -> dict`
2. Add keyword set + `_is_<domain>_query()` to `search.py`
3. Add source entry to `RESEARCH_SOURCES` in `ResearchMenu.jsx` (logo, label, description)
4. Add key to `config.py` defaults

### Planned Sources (v2+)

| Source | Domain | API | Effort |
|--------|--------|-----|--------|
| Wiktionary | Sprachen | MediaWiki API (free) | Low |
| arXiv | MINT/Physik | arXiv API (free) | Low |
| PubChem | Chemie/Pharma | REST API (free) | Low |
| EUR-Lex | Jura (EU) | REST API (free) | Medium |
| Google Scholar | Alle (Papers) | SerpAPI (paid) | Medium |

### Source-Specific Enhancements (v2+)

- Wikipedia: inline thumbnail image in ResearchContent
- PubChem: inline molecule structure SVG
- Wiktionary: pronunciation audio, conjugation tables
