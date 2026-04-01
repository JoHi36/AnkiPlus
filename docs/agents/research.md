# Research Agent

## Übersicht

Der Research Agent ist der primäre Wissens-Recherche-Agent in AnkiPlus. Er ist fest an den **Stapel-Kanal** gebunden — kein `@mention`, kein Routing-Entscheid, kein Agent-Wechsel. Wer den Stapel-Tab öffnet, arbeitet mit dem Research Agent.

**Modus:** State-basiert (kein Chat-Verlauf). Jede Anfrage ersetzt den gesamten Viewport-Zustand. Es gibt keine Konversationshistorie — ein Zustand = eine vollständige Ansicht. Neuer Zustand entsteht nur durch eine neue Suchanfrage.

**Primärziel:** Überblick schaffen, nicht Erklären. Der Research Agent findet relevante Karten im eigenen Deck und verknüpft sie mit Web-Wissen. Er liefert belegte Antworten mit zitierbaren Quellen. Der Tutor-Agent übernimmt, wenn es ums kartenbasierte Verstehen geht.

---

## Kanal & UI

Der Stapel-Tab ist der Kanal des Research Agents. Zwei Eingabe-Elemente koexistieren als zwei Phasen eines Flows:

1. **Suchleiste (oben)** — Freitext-Eingabe, startet Smart Search
2. **Action-Dock (unten)** — Folgeaktionen auf dem Canvas (künftig)

**Ablauf nach einer Suchanfrage:**

```
Suchleiste → Smart Search → Canvas (Karten-Cluster + Graphen)
                          → Sidebar (Research-Antwort mit Citations)
```

- **Canvas:** Zeigt gefundene Karten als visuelle Cluster (embedding-basiertes Layout). Karten-Gruppen werden durch KI-generierte Labels beschriftet.
- **Sidebar:** Enthält die Research-Antwort des Agents mit Inline-Referenzen `[1]`, `[2]` auf Karten und Web-Quellen.

**State-Modell:** Die gesamte Ansicht (Canvas + Sidebar) ist ein Zustand. Keine History-Navigation innerhalb des Stapels. Einzige Ausnahme: Der Nutzer scrollt innerhalb des Canvas oder der Sidebar.

---

## Retrieval-Pipeline

### Primärer Pfad: Stapel-Pipeline (Smart Search)

Die eigentliche Research-Pipeline läuft in `ui/widget.py` über drei Threads:

| Thread | Datei | Aufgabe |
|--------|-------|---------|
| `SearchCardsThread` | `ui/widget.py:328` | Embedding-basierte Kartensuche. Multi-Query: original + 3-4 LLM-expandierte Queries. Hybrid-Suche (Vektor + SQL). |
| `SmartSearchAgentThread` | `ui/widget.py:877` | Dispatcht Research Agent (`handler.dispatch_smart_search`) + Cluster-Labeling parallel (ThreadPoolExecutor). |
| QuickAnswer (intern) | `ui/widget.py` | Cluster-Labels via `generate_quick_answer()`, läuft parallel zum Research Agent. |

**Sequenz:**

```
SearchCardsThread läuft →
  Embeddings einbetten (original + expandierte Queries)
  Vektor-Suche + SQL-Keyword-Suche → Merge
  Clustering → Cluster-Info

→ SmartSearchAgentThread startet (pre-loaded cards)
    ├── run_research() mit smart_search_context → Research-Antwort
    └── _generate_cluster_labels() → Canvas-Labels
```

### Retrieval-Datei (geforkt)

`ai/retrieval_agents/research_retrieval.py` ist eine eigenständige Kopie der RAG-Pipeline, geforkt am **2026-04-01** aus `ai/rag_pipeline.py`. Sie kann unabhängig vom Tutor weiterentwickelt werden.

**Geplante Differenzierung gegenüber Tutor-Pipeline:**
- Web-first statt card-first (Perplexity immer aktiv, nicht nur als Fallback bei niedrigem Confidence)
- Breiterer `search_scope` (`collection` statt `current_deck`)
- Karten als Referenzmaterial, nicht als Primärquelle
- Höhere `max_sources` per default

**Aktuell:** Die Retrieval-Datei entspricht noch der Tutor-Pipeline. Die Differenzierung ist ausstehend.

### Auto-Web-Search (bestehend)

Wenn der RAG-Confidence-Score `low` ist, ruft die Pipeline automatisch Perplexity auf (`_call_perplexity()`). Web-Ergebnisse werden in den `context_string` injiziert mit dem Header `--- WEB-RECHERCHE (Perplexity) ---`.

---

## Tools

| Tool | Beschreibung | Status |
|------|-------------|--------|
| `search_perplexity` | Web-Recherche via Perplexity-Backend (`/research`-Endpoint). Standard-Tool, immer aktiv (`mode='locked'`). | Aktiv |
| `search_pubmed` | Wissenschaftliche Studien und medizinische Literatur. Nutzerkonfigurierbar (on/off). | Aktiv |
| `search_wikipedia` | Definitionen und enzyklopädischer Überblick. Nutzerkonfigurierbar (on/off). | Aktiv |

Tools sind in `ai/agents.py` als Workflow `web_research` definiert und im ResearchMenu (`frontend/src/components/ResearchMenu.jsx`) konfigurierbar.

**Workflow-Definition:**

```python
Workflow(
    name='web_research',
    mode='locked',
    tools=[
        Slot(ref='search_perplexity', mode='locked'),  # immer an
        Slot(ref='search_pubmed', mode='on'),           # user-toggle
        Slot(ref='search_wikipedia', mode='on'),        # user-toggle
    ],
)
```

---

## Citations

Der Research Agent liefert zwei Typen von Referenzen, beide über `CitationBuilder`:

**Karten-Referenzen** — aus der lokalen Kartensuche (Smart Search oder RAG):
```python
citation_builder.add_card(
    card_id=..., note_id=..., deck_name=...,
    front=..., back=..., sources=['smart_search'],
)
```

**Web-Quellen** — von Perplexity/PubMed/Wikipedia-Tools, werden direkt als `web_sources` in `RagResult` zurückgegeben.

**Frontend-Rendering:**
- `parseCitations()` in `frontend/src/` parst `[1]`, `[2]`, `[[WEB:1]]` Inline-Referenzen
- `CitationRef` rendert klickbare Badges
- `WebCitationBadge` und `CitationBadge` für unterschiedliche Quelltypen
- Karten: navigierbar via `goToCard()` Bridge-Methode

---

## Smart Search Flow (vollständig)

```
1. Nutzer tippt Anfrage in DeckSearchBar
2. useSmartSearch.js → bridge.sendMessage('smartSearch', { query })
3. widget.py → SearchCardsThread startet
   a. LLM expandiert Query zu 3-4 Varianten
   b. Embedding aller Queries (batch)
   c. Vektor-Suche (top_k * 2 pro Query)
   d. SQL Keyword-Suche (Fallback)
   e. Merge + Dedup + Clustering
   f. result_signal → Frontend empfängt graph.searchResult

4. widget.py → SmartSearchAgentThread startet (mit cards_data)
   a. handler.dispatch_smart_search() — run_research() mit smart_search_context
      - CitationBuilder aus cards_data befüllen
      - Research-Prompt laden (_get_research_prompt())
      - Streaming via get_google_response_streaming()
      - text_chunk events → Frontend stream
   b. _generate_cluster_labels() — parallel (ThreadPoolExecutor)
      - generate_quick_answer() → Cluster-Labels + Summaries
   c. result_signal → graph.quickAnswer (Labels für Canvas)
   d. finished_signal → Frontend markiert Request als abgeschlossen

5. Frontend:
   - Canvas rendert Cluster mit Labels
   - Sidebar rendert Research-Antwort mit parseCitations()
   - CitationRef Badges klickbar → goToCard()
```

---

## Entry Point

`research/__init__.py:run_research()` ist der Legacy-Entry-Point für den Research Agent (früherer `@Research`-Chat-Pfad, der nicht mehr existiert).

> **Wichtig:** `run_research()` ist als `DEPRECATED as standalone chat agent` markiert. Im Agent-Kanal-Paradigma ist die **Stapel-Pipeline** (`SearchCardsThread` + `SmartSearchAgentThread`) der eigentliche Research-Pfad. `run_research()` wird von `SmartSearchAgentThread` über `handler.dispatch_smart_search()` intern aufgerufen, aber nicht direkt aus dem Chat heraus.

**Registrierung in `ai/agents.py`:**
```python
register_agent(AgentDefinition(
    name='research',
    channel='stapel',
    run_module='research',
    run_function='run_research',
    uses_rag=False,  # Stapel-Pipeline hat eigene Suche
    tools=['search_pubmed', 'search_wikipedia', 'search_perplexity'],
    ...
))
```

`uses_rag=False` bedeutet: Der Research Agent ruft `analyze_query()` nicht auf. Die `SearchCardsThread`-Suche ersetzt den RAG-Analyzer-Schritt.

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `research/__init__.py` | Entry Point: `run_research()` — Legacy-Chat-Pfad, intern von dispatch aufgerufen |
| `ai/agents.py` | Agent-Registry: `AgentDefinition` für Research, Tool- und Workflow-Konfiguration |
| `ai/retrieval_agents/research_retrieval.py` | Geforkte RAG-Pipeline (2026-04-01) für Research-spezifische Retrieval-Logik |
| `ui/widget.py:328` | `SearchCardsThread` — Embedding-Suche, Multi-Query-Expand, Clustering |
| `ui/widget.py:877` | `SmartSearchAgentThread` — Research-Agent-Dispatch + paralleles Cluster-Labeling |
| `ai/citation_builder.py` | `CitationBuilder` — Karten- und Web-Citations aufbauen und serialisieren |
| `frontend/src/hooks/useSmartSearch.js` | Frontend-Orchestrierung: Suchanfragen abschicken, Stream empfangen |
| `frontend/src/components/ResearchMenu.jsx` | Tool-Konfiguration (PubMed, Wikipedia on/off) |
| `frontend/src/components/ResearchContent.jsx` | Research-Antwort im Sidebar rendern |
| `frontend/src/components/WebCitationBadge.jsx` | Web-Quellen-Badges |
| `frontend/src/components/CitationBadge.jsx` | Karten-Referenz-Badges |
| `frontend/src/components/SourcesCarousel.jsx` | Web-Quellen-Karussell in der Sidebar |

---

## Benchmarks

Noch keine agent-spezifischen Metriken definiert.

**Geplant:**
- Relevanz-Score für Web-Ergebnisse (Perplexity-Treffer vs. Anfrage)
- Karten-Referenz-Qualität (werden `[N]`-Referenzen für relevante Karten vergeben?)
- Query-Expansion-Recall-Delta (wie viele zusätzliche Karten findet Multi-Query gegenüber Single-Query?)
- Latenz pro Phase (SearchCardsThread, SmartSearchAgentThread, Perplexity-Call)
