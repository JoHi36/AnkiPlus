# Nächste Session: Research Agent → Stapel-Sidebar

## Kontext

Der Research Agent ist backend-seitig fertig (gleiche RAG-Pipeline wie Tutor, neuer Prompt, state-basiert). Aber die Stapel-Sidebar im Frontend ruft noch den Tutor auf und zeigt Raw-Daten.

## Was in dieser Session gemacht wurde (2026-03-30)

### Retrieval & Benchmarks
- **Recall@30: 81%** (von 63% @10). TOP_K auf 30 erhöht, LLM-Terme als eigene RRF-Lane.
- **Generation Benchmark**: 10 Cases, 92% Score. Deterministic + LLM Scoring. Dashboard: https://ankiplus-dashboard.vercel.app
- **Tutor Pipeline Doku**: `docs/reference/RETRIEVAL_SYSTEM.md` erweitert um Generation-Section (Response-Architektur, Quellen-System, Safety Checks)

### Reasoning Display
- AgenticCell erscheint SOFORT (vor Router, nicht danach)
- 3-Step Hints: Kontext → Quellensuche → Synthese (akkumulierend mit Daten)
- Orchestrierung ausgeblendet
- "Anki" Badge-Fallback entfernt

### Performance
- KG Term Index gecacht (spart ~2s pro Request)
- Card Embedding Index vorgeladen nach Background-Embedding

### Research Agent Backend
- `research/__init__.py`: `run_research()` nutzt RAG-Pipeline statt Web-Search
- `functions/src/prompts/research.ts`: Neuer Fachlexikon-Prompt (state-basiert, kein Smalltalk)
- Tests aktualisiert, 13/13 grün

## Was zu tun ist

### 1. Stapel-Sidebar: Tutor → Research Agent umverdrahten

**Das Hauptproblem:** Die Sidebar ruft noch den Tutor auf. Muss den Research Agent nutzen.

Relevante Frontend-Dateien:
- `frontend/src/components/SearchSidebar.jsx` — die Sidebar-Komponente im Stapel
- `frontend/src/hooks/useFreeChat.js` — Hook für kartenunabhängige Chats (wird von Sidebar genutzt)
- `frontend/src/components/SidebarShell.jsx` — Shell mit Tab-Navigation
- `frontend/src/App.jsx` — wo die Sidebar eingebunden ist

**Änderungen:**
- Sidebar soll `agent=research` an den Backend-Request senden (statt default tutor)
- Header: Kein AgenticCell-Wrapper, nur "Research" als Text, clean
- Kein Hintergrund (grün/grau), kein Agent-Icon
- "3 Schritte" Orchestrierung weg (wurde schon im Chat-View entfernt, muss auch hier raus)
- "aus 100 Karten" oben rechts → kann weg oder zeigt Quellen-Zahl nach Antwort

### 2. LERNMATERIAL-Leak fixen

Das Modell gibt die rohen Karten-Daten aus ("LERNMATERIAL: Note 1705658603681: Front: Was ist die Leber?"). Der Research-Prompt muss das explizit verbieten:

```
WICHTIG: Gib NIEMALS die LERNMATERIAL-Rohdaten aus. Nutze die Informationen daraus, aber zeige dem Nutzer nur deine aufbereitete Antwort.
```

### 3. Output-Format: Scanbar, nicht Textwand

Der Research Agent soll Antworten liefern die man schnell erfassen kann:
- Bullet-Points statt Fließtext
- Fett-Markierungen für Schlüsselterme
- Kurze Sätze
- Tabellen für Vergleiche
- Maximal 5-8 Zeilen pro Tab-Inhalt

### 4. Tabs (Definition / Perspektiven / Begriffe)

Die 3 Tabs existieren schon. Prüfen:
- Wird pro Tab ein separater Request gemacht oder einer für alle?
- Wie werden die Tab-Inhalte generiert?
- Muss der Research-Prompt tab-spezifische Anweisungen bekommen?

## Wichtige Dateien

### Frontend (Sidebar)
- `frontend/src/components/SearchSidebar.jsx` — Sidebar UI
- `frontend/src/hooks/useFreeChat.js` — Chat-Hook für Stapel
- `frontend/src/components/SidebarShell.jsx` — Shell + Tabs
- `frontend/src/components/AgenticCell.jsx` — Agent-Container (soll NICHT mehr verwendet werden)

### Backend (Research Agent)
- `research/__init__.py` — `run_research()` (RAG-Pipeline, fertig)
- `functions/src/prompts/research.ts` — Prompt (muss LERNMATERIAL-Leak + Format fixen)
- `ai/handler.py` — Dispatcher (agent_cell Event, sofortige Anzeige)
- `ai/retrieval.py` — EnrichedRetrieval (shared mit Tutor)

### Docs
- `docs/reference/RETRIEVAL_SYSTEM.md` — Pipeline-Doku (Router → Retrieval → Generation)
- `docs/prompts/next-session-retrieval.md` — Retrieval-Session Prompt (81% Recall)

## Architektur-Entscheidung

**Jeder Agent hat EINEN Ort:**
- Research Agent → Stapel-Sidebar
- Tutor → Session (Kartenreview)
- Plusi → eigener Bereich
- Help → eigener Bereich

Memory: `project_agent_location_model.md`

## Regeln

- Design System Tokens für alle UI-Änderungen
- Kein AgenticCell in der Research-Sidebar (clean, kein farbiger Hintergrund)
- LERNMATERIAL darf NIE im Output erscheinen
- Output muss scanbar sein (Bullets, Bold, Tabellen — kein Fließtext)
- VOR API-Calls die Tokens kosten IMMER fragen
