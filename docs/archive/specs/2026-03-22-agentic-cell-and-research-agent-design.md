# Agentic Cell Framework & Research Agent

**Date:** 2026-03-22
**Status:** Draft
**Scope:** Two parts — (1) unified Agentic Cell skeleton for all sub-agents, (2) Research Agent as first consumer

---

## Part 1: Agentic Cell Skeleton

### Problem

Sub-agent widgets (e.g. PlusiWidget) are currently hardcoded as isolated components with their own styling, layout, and rendering logic. Adding a new agent means building a new widget from scratch. There is no shared visual language that says "this is a sub-agent" while allowing each agent to be unique.

### Design Principles

- **No boxes, no borders, no capsules** — the cell blends into the chat flow
- **Presence through gradient glow** — a full-width ambient gradient in the agent's color creates atmosphere without boundaries
- **One fixed color per agent** — immediate recognition, no color changes based on state or mood
- **Shared skeleton, unique content** — every agent uses the same structure but fills it differently

### Skeleton Structure

```
┌─────────────────────────────────────────────────────────┐
│  GRADIENT GLOW (full-width, edge-to-edge, no radius)    │
│                                                         │
│  HEADER                                                 │
│  [Icon Slot 22×22] [Agent Name]  ·········  [Meta Slot] │
│                                                         │
│  CONTENT (agent-specific)                               │
│  Text, citations, emojis, whatever the agent produces   │
│                                                         │
│  FOOTER (optional, agent-specific)                      │
│  Source chips, friendship bar, etc.                      │
└─────────────────────────────────────────────────────────┘
```

### Gradient Glow

- The agent color hex is converted to RGB components and set as a CSS custom property `--agent-rgb` on the cell element (following the existing pattern from PlusiWidget's `--plusi-rgb`). The gradient then uses: `linear-gradient(135deg, rgba(var(--agent-rgb), 0.07) 0%, rgba(var(--agent-rgb), 0.02) 40%, transparent 70%)`
- Absolutely positioned behind content, full width of the chat area
- No `border-radius` — extends edge-to-edge
- Subtle enough to feel ambient, strong enough to create a zone

### Header

- **Left side**: Icon/Emote slot (22×22px) + Agent name (13px, font-weight 600, color: agent.color)
- **Right side**: Optional meta slot (mood label, status indicator, etc.)
- Icon slot: agents provide either an SVG icon (inside a 22×22 rounded container with `agent.color` at 10% opacity) or a custom emote (like Plusi's SVG mascot)
- Margin-bottom: 12px to content

### Content

- Agent-specific. The skeleton provides a `cell-content` wrapper with `font-size: 15px; line-height: 1.65`
- Standard paragraph spacing: `margin-bottom: 12px`

### Footer

- Optional. Agent-specific. Wrapped in `cell-footer` with `margin-top: 12px`
- Examples: source strip (Research), friendship bar (Plusi)

### Loading State

Every agent gets a unified loading state:

1. **Same gradient glow** as loaded state (establishes agent identity immediately)
2. **Same header** with icon + name (user knows which agent is working)
3. **Loading hint**: italicized text in `agent.color` at 50% opacity (e.g. "Durchsuche Quellen zu Photosynthese...", "Plusi denkt nach..."). The hint is substituted Python-side before emitting the loading tool marker — Python replaces `{query}` in the template and sends the final string in the `[[TOOL:{...displayType:"loading", loadingHint:"..."}]]` marker. Implementation: `_build_tool_marker()` in `ai/agent_loop.py` gets an optional `extra_fields: dict = None` parameter that merges into the marker payload. The calling code looks up the agent's `loading_hint_template` from the subagent registry, substitutes `{query}` from `function_args`, and passes `extra_fields={'loadingHint': hint}`.
4. **Shimmer lines**: 2-3 rectangles (height 14px, border-radius 4px) in `agent.color` at 6% opacity, with a CSS shimmer animation sweeping left-to-right
5. **Meta slot**: can show a pulsing dot (opacity animation 0.3 ↔ 0.8) to indicate activity

### Registry Integration

The Agentic Cell skeleton is driven by the SubagentRegistry. Each agent's registration defines:

**Python (`ai/subagents.py` — SubagentDefinition):**
- `color: str` — fixed agent color hex (already exists)
- `icon_type: str` — `'svg'` or `'emote'` (new field)
- `icon_svg: str` — SVG markup for the icon, or empty if using emote system (new field)
- `loading_hint_template: str` — template for loading text, e.g. `"Durchsuche Quellen zu {query}..."` (new field)

**Frontend (`shared/config/subagentRegistry.ts` — SubagentConfig):**
- `color: string` — fixed agent color (already exists)
- `iconType?: 'svg' | 'emote'` — determines rendering approach (new, optional — defaults to `'svg'`)
- `iconSvg?: string` — SVG string for the icon (new, optional — fallback: first letter of label in colored circle)
- `loadingHintTemplate?: string` — loading text template (new, optional — fallback: `"{label} arbeitet..."`)

All new fields are optional with sensible defaults for backwards compatibility. The `get_registry_for_frontend()` function in `ai/subagents.py` must be updated to serialize these new fields.

### Rendering

A single `AgenticCell` React component replaces per-agent widget components in `ToolWidgetRenderer.jsx`:

```
AgenticCell receives:
  - agentName (lookup from registry for color, icon, etc.)
  - isLoading (boolean)
  - loadingHint (string, optional override)
  - headerMeta (ReactNode, agent-specific right-side content)
  - children (agent-specific content + footer)
```

Agents still provide their own content components (Research provides source chips, Plusi provides friendship bar), but the shell (gradient, header, loading) is shared.

**ToolWidgetRenderer integration:** The existing switch-case in `ToolWidgetRenderer.jsx` is updated to route sub-agent tools through `AgenticCell`:

```jsx
// Before: hardcoded per agent
case 'spawn_plusi': return <PlusiWidget {...tw.result} />;

// After: AgenticCell wraps agent-specific content
case 'spawn_plusi':
  return <AgenticCell agentName="plusi" isLoading={tw.displayType === 'loading'} ...>
    <PlusiContent {...tw.result} />
  </AgenticCell>;
case 'search_web':
  return <AgenticCell agentName="research" isLoading={tw.displayType === 'loading'} ...>
    <ResearchContent {...tw.result} />
  </AgenticCell>;
```

Future agents follow the same pattern — add a case that wraps agent-specific content in `AgenticCell`.

### Agent Color Assignments

| Agent | Color | Hex |
|-------|-------|-----|
| Plusi | Brand Blue | `#0A84FF` |
| Research Agent | Green | `#00D084` |
| (Future agents) | Unique per agent | TBD |

**Plusi migration:** Plusi's current purple (`#A78BFA`) changes to brand blue (`#0A84FF`). This is a deliberate simplification — the existing dynamic mood-color system (`window.getPlusiColor(mood)` returning different colors per mood) is removed. Mood is communicated exclusively through the Plusi emote (via existing `createPlusi(mood, size)` SVG system) and the mood text label in the header's right meta slot. No background color changes.

Files affected by Plusi color migration:
- `frontend/src/components/PlusiWidget.jsx` — remove dynamic `getPlusiColor()` usage, use fixed `#0A84FF`
- `shared/plusi-renderer.js` — `getPlusiColor()` still used for emote rendering (keep, but cell background uses fixed color)
- `plusi/dock.py` — dock widget color references
- `ai/subagents.py` — update Plusi registration `color` field
- `shared/config/subagentRegistry.ts` — frontend registry default

---

## Part 2: Research Agent

### Problem

When the RAG pipeline finds no relevant cards for a user's question, the tutor answers from general knowledge alone — no external sources, no citations, no way to verify. Users studying specialized topics (medicine, law, languages) get unsourced answers.

### Solution

A Research Agent sub-agent that searches the internet for high-quality, cited sources. It integrates into the existing sub-agent system (router hint, tool in hop model, direct @-call) and returns structured results that the tutor weaves into its response.

### Agent Identity

- **Name:** `research` (registry key)
- **Label:** `Research Agent`
- **Color:** `#00D084`
- **Icon:** Radar SVG (22×22), stroke-based
- **Enabled key:** `research_enabled`

### Multi-Tool Engine

The Research Agent itself has multiple search tools and selects the best one based on the query:

| Tool | Use Case | Cost |
|------|----------|------|
| **Perplexity Sonar** | Default for all queries — general, academic, factual | ~$5/1000 queries |
| **PubMed API** | Medical/scientific questions — returns real papers | Free |
| *(Future: Wikipedia API)* | Quick fact checks, definitions | Free |
| *(Future: Google Scholar)* | Academic papers beyond medicine | Free |

Tool selection logic lives in the agent's run function — it analyzes the query and deck context to pick the right source. Perplexity Sonar is the default fallback.

### Trigger Paths

All three standard sub-agent trigger paths:

1. **Router hint:** `"Use when the user's question cannot be adequately answered from deck cards alone and requires external/current information. NOT for casual conversation or card-specific questions."`
2. **Hop model tool:** `search_web` tool definition — tutor calls it mid-response when it detects knowledge gaps
3. **Direct call:** `@Research <query>` from the user

### Data Flow (Context-Injection / B-Mode)

```
1. Tutor detects: cards don't cover this topic
2. Tutor calls search_web tool (or router delegates)
3. Research Agent:
   a. Analyzes query + deck context
   b. Selects search tool (Perplexity / PubMed / etc.)
   c. Executes search
   d. Returns structured result
4. Tool result goes back to tutor as context
5. Tutor weaves findings into its response with inline citations
6. Widget renders simultaneously: source chips in footer
```

### Result Structure

The Research Agent's run function returns:

```python
{
    "sources": [
        {
            "title": "Photosynthesis — Biology Library",
            "url": "https://www.khanacademy.org/...",
            "domain": "khanacademy.org",
            "favicon_letter": "K",   # First letter of domain for fallback
            "snippet": "An overview of how plants convert light...",
        },
        # ... more sources
    ],
    "answer": "Photosynthese ist der Prozess...",  # Cited text with [1], [2] markers
    "query": "Photosynthese Lichtreaktion Calvin-Zyklus",
    "tool_used": "perplexity",  # Which search tool was used
    "error": null
}
```

### Citation System

- Inline citation badges: `[1]`, `[2]`, `[3]` rendered as small rounded badges in agent color (`#00D084`)
- Badge styling: 18×18px, 10px font, font-weight 600, border-radius 5px, background `agent.color` at 10%, color `agent.color`
- Badges are clickable — open the source URL via `bridge.openUrl()`
- Citation numbers map to the `sources` array index (1-based)
- Different from the existing card citation system (`[[NoteID]]`) — web citations use `[[WEB:1]]` markers to avoid conflicts
- Parsing: `[[WEB:N]]` markers are detected by a new regex in `ChatMessage.jsx` alongside the existing `[[CardID:N]]` parser. The existing card citation regex (`\[\[\s*(?:CardID:\s*)?(\d+)\s*\]\]`) does NOT match `[[WEB:1]]` due to the prefix, so no conflict.
- Rendered by a `WebCitationBadge` component (similar to existing `CitationBadge` but uses agent color instead of accent)
- **Source data flow for citations:** When the `search_web` tool result arrives, the sources array is stored in the message's metadata (same pattern as card `citations` — added to the message object in `useChat.js`). `ChatMessage` receives `webSources` as a prop and passes it to `WebCitationBadge` for URL resolution on click. This avoids cross-component lookups.

### Error State

When the Research Agent returns `error != null`:
- The AgenticCell still renders (gradient + header with icon and name)
- Content area shows error message in `var(--ds-text-secondary)` with a subtle red tint
- No source chips rendered
- The tutor receives the error in tool response and can tell the user: "Die Recherche hat leider nicht geklappt" and continue from general knowledge

### Source Chips (Footer Widget)

Horizontal scrollable strip of source chips:

- Each chip: `[Favicon letter] [Title] [Domain]`
- Background: `agent.color` at 6% opacity
- Border: `agent.color` at 10% opacity
- Border-radius: 9px
- Hover: background increases to 10% opacity
- Clicking opens the URL via `bridge.openUrl()`

### Loading State

Uses the Agentic Cell skeleton loading:
- Hint text: `"Durchsuche Quellen zu {extracted_topic}..."` — topic extracted from the query
- 3 shimmer lines in `#00D084` at 6%
- Header shows icon + "Research Agent" immediately

### Configuration

In the sub-agent menu (existing per-agent settings UI):
- Toggle: Research Agent on/off (default: on)
- *(Future)* Preferred sources: checkboxes for Perplexity, PubMed, etc.
- *(Future)* Custom domains: user can add preferred sites

### Registration

```python
# ai/subagents.py
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
                'current information.',
    main_model_hint='Use search_web tool when your knowledge is insufficient '
                    'or the user explicitly asks for sources/research.',
    icon_type='svg',
    icon_svg='<svg viewBox="0 0 24 24">...</svg>',  # Radar icon
    loading_hint_template='Durchsuche Quellen zu {query}...',
))
```

### File Structure

Following the existing pattern (Plusi lives in `plusi/`), the Research Agent gets its own top-level package:

```
research/
  __init__.py       # run_research() entry point
  search.py         # Multi-tool search orchestration
  perplexity.py     # Perplexity Sonar API client
  pubmed.py         # PubMed API client
  types.py          # ResearchResult, Source dataclasses
```

This mirrors `plusi/agent.py` → `research/__init__.py`. The `run_module` in registration is `'research'`, which resolves via `lazy_load_run_fn` using `importlib.import_module(f'..{agent.run_module}', package=__package__)` from `ai/subagents.py` → `AnkiPlus_main.research`.

### Tool Definition

```python
# Registered in ai/tools.py
ToolDefinition(
    name='search_web',
    schema={
        'name': 'search_web',
        'description': 'Search the internet for information not available in deck cards',
        'parameters': {
            'type': 'object',
            'properties': {
                'query': {
                    'type': 'string',
                    'description': 'The search query'
                }
            },
            'required': ['query']
        }
    },
    execute_fn=execute_search_web,
    category='content',
    config_key='research',  # checked against config['ai_tools']['research']
    agent='tutor',
    display_type='widget',
    timeout_seconds=15,
)
```

---

## Out of Scope

- Chaining multiple search tools per query (keep it simple: one tool per query for now)
- OG-image/thumbnail fetching for source cards (use favicon letter as fallback)
- Source quality ranking beyond what Perplexity/PubMed provide
- Caching search results across sessions
- User-defined custom source domains (future feature)

## Dependencies

- Perplexity API key — stored as `perplexity_api_key` in `config.json` alongside existing API keys (`google_api_key`, etc.). Added to settings UI in the API keys section.
- Default config entries in `config.py`: `'research_enabled': True` (top-level), `'research': True` (inside `ai_tools` dict)
- PubMed API (free, no key needed for basic access)
- Existing sub-agent registry system (Python + Frontend)
- Existing tool marker system (`[[TOOL:{...}]]`)
