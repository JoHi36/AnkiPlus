# Unified Citation System

**Date:** 2026-04-01
**Status:** Draft
**Scope:** Einheitliches Referenzsystem für alle Agenten + Agent-spezifische RAG-Pipelines + Definition-Agent

---

## Problem

Das aktuelle Referenzsystem ist fragmentiert und instabil:

1. **Drei verschiedene Marker-Formate:** `[[CardID:N]]` (Tutor), `[[WEB:N]]` (Research), `[N]` (TermPopup) — wenn die Regex nicht greift, sieht der Nutzer rohe Marker wie `[71538271]` oder `[[web1]]`.
2. **Drei verschiedene Rendering-Pfade:** ChatMessage.jsx, ResearchMarkdown in SearchSidebar.jsx, inline `<span>` in TermPopup.jsx — jeder mit eigener Parsing-Logik.
3. **Falsches Mapping:** Angezeigte Referenz passt nicht zur Aussage. Backend vergibt Index X, Frontend baut eigene Nummerierung → Indexverschiebung.
4. **Kein einheitliches Preview:** CardPreviewModal ist kaputt, Web-Quellen haben kein Preview, TermPopup hat eigene Inline-Badges.
5. **RAG nur im Tutor:** Andere Agenten haben entweder eigene Retrieval-Logik oder gar keine.
6. **Definition-Agent nicht formalisiert:** KGDefinitionThread ist ein versteckter Mini-Agent in widget.py, nicht im Agent-Registry.

## Designziele

- **Stabilitat:** Ein Rendering-Pfad. Marker die keinen Match haben werden als normaler Text gerendert — nie kaputte Badges sichtbar.
- **Einheitlichkeit:** Alle Agenten liefern dasselbe Citation-Format. Dasselbe Preview. Dieselbe Komponente.
- **Unabhangigkeit:** Jeder Agent bekommt eigene RAG-Pipeline-Kopie. Anderung an einem Agent bricht keinen anderen.
- **Erweiterbarkeit:** Neue Agenten bekommen CitationBuilder + Pipeline automatisch.

---

## 1. Citation-Datenmodell

Ein einziges Datenmodell fur alle Agenten, alle Kontexte:

```typescript
interface Citation {
  type: 'card' | 'web';
  index: number;            // 1-basiert, pro Nachricht neu vergeben

  // Card-spezifisch (type === 'card')
  cardId?: number;
  noteId?: number;
  deckName?: string;
  front?: string;           // Gereinigter Kartentext, max 200 Zeichen
  back?: string;            // Gereinigter Ruckseitentext

  // Web-spezifisch (type === 'web')
  url?: string;
  title?: string;
  domain?: string;

  // Metadaten (optional)
  sources?: string[];       // z.B. ['keyword', 'semantic'] oder ['perplexity']
}
```

**Regeln:**
- Nummerierung pro Nachricht, startet immer bei `[1]`.
- Karten und Web-Quellen werden gemischt nummeriert in Reihenfolge der ersten Erwahnung.
- `type` bestimmt die Farbe: `card` = blau (`var(--ds-accent)`), `web` = grun (`var(--ds-green)`).
- Array statt Dict: `citations[0]` ist immer `[1]` im Text. Keine Mapping-Fehler.

**Backend-Return-Format (alle Agenten identisch):**

```python
{
  'text': "Laut [1] wird das Enzym durch [2] aktiviert...",
  'citations': [
    {'type': 'card', 'index': 1, 'cardId': 42, 'noteId': 42,
     'deckName': 'Biochemie::Enzyme', 'front': 'Was aktiviert...', 'back': '...'},
    {'type': 'web', 'index': 2, 'url': 'https://...', 'title': '...',
     'domain': 'pubmed.ncbi.nlm.nih.gov'},
  ]
}
```

---

## 2. CitationBuilder (Backend)

Einziger Mechanismus um Citations zu erzeugen. Jeder Agent bekommt eine Instanz ubergeben.

```python
class CitationBuilder:
    """Einziger Weg Citations zu erzeugen. Vergibt Nummern automatisch."""

    def __init__(self):
        self._citations: list[dict] = []

    def add_card(self, card_id: int, note_id: int, deck_name: str,
                 front: str, back: str = '', sources: list[str] = None) -> int:
        """Fugt Card-Citation hinzu. Gibt Index [N] zuruck (1-basiert)."""
        index = len(self._citations) + 1
        self._citations.append({
            'type': 'card',
            'index': index,
            'cardId': card_id,
            'noteId': note_id,
            'deckName': deck_name,
            'front': front[:200],
            'back': back[:200] if back else '',
            'sources': sources or [],
        })
        return index

    def add_web(self, url: str, title: str, domain: str) -> int:
        """Fugt Web-Citation hinzu. Gibt Index [N] zuruck (1-basiert)."""
        index = len(self._citations) + 1
        self._citations.append({
            'type': 'web',
            'index': index,
            'url': url,
            'title': title,
            'domain': domain,
        })
        return index

    def build(self) -> list[dict]:
        """Gibt fertiges citations-Array zuruck."""
        return list(self._citations)
```

**Verwendung im Agent:**

```python
def run_tutor(situation, emit_step, memory, stream_callback,
              citation_builder, **kwargs):
    # Retrieval liefert Karten
    cards = tutor_retrieval.retrieve(situation, ...)
    for card in cards:
        idx = citation_builder.add_card(
            card['cardId'], card['noteId'], card['deckName'],
            card['front'], card['back'], card['sources']
        )
        # idx ist jetzt z.B. 1, 2, 3...
        # Agent schreibt [1], [2] etc. in den Text

    return {
        'text': generated_text,
        'citations': citation_builder.build(),
    }
```

**Dispatch in handler.py:**

```python
def _dispatch_agent(self, agent_name, run_fn, situation, ...):
    builder = CitationBuilder()
    result = run_fn(situation, citation_builder=builder, ...)
    citations = result.get('citations', builder.build())
    # Weiterleitung an Frontend unverandert
```

---

## 3. Frontend Rendering-Pipeline

### 3.1 Parser: `parseCitations(text, citations[])`

Eine einzige Funktion, ersetzt alle drei Regex-Pfade:

```typescript
type Segment =
  | { type: 'text'; content: string }
  | { type: 'citation'; index: number; citation: Citation };

function parseCitations(text: string, citations: Citation[]): Segment[]
```

**Regeln:**
- Erkennt `[N]` und `[N, M]` (wird zu `[N] [M]`).
- Lookup: `citations.find(c => c.index === N)`. Kein Match → Segment wird als normaler Text gerendert.
- Keine `[[CardID:N]]`, `[[WEB:N]]`, `[[N]]` Regex mehr. Nur `[N]`.
- Legacy-Formate aus gespeicherten Nachrichten: einmalige Migration oder Fallback-Regex die alte Formate zu `[N]` normalisiert bevor der Parser lauft.

**Datei:** `frontend/src/utils/parseCitations.ts`

### 3.2 Render-Komponente: `CitationRef`

Existiert bereits in `shared/components/CitationRef.jsx`. Wird zur einzigen Citation-Render-Komponente:

- `variant='card'` → blau (`var(--ds-accent)`)
- `variant='web'` → grun (`var(--ds-green)`)
- `onClick` → Karte: offnet CardPreview-Popup. Web: offnet `openUrl()` extern.
- `size='sm'` (inline im Text) oder `size='md'` (standalone)

**Verwendung uberall identisch:**

```jsx
{segments.map((seg, i) =>
  seg.type === 'citation'
    ? <CitationRef
        key={i}
        index={seg.citation.index}
        variant={seg.citation.type}
        onClick={() => handleCitationClick(seg.citation)}
        title={seg.citation.front || seg.citation.title}
      />
    : <span key={i}>{seg.content}</span>
)}
```

### 3.3 Komponenten die ersetzt werden

| Alt | Neu | Aktion |
|-----|-----|--------|
| `CitationBadge.jsx` | `CitationRef` | Loschen |
| `WebCitationBadge.jsx` | `CitationRef` mit `variant='web'` | Loschen |
| `CardPreviewModal.jsx` | `CardPreview` (neu) | Loschen |
| ChatMessage.jsx Regex-Logik (Zeilen 1542-1660) | `parseCitations()` | Ersetzen |
| ResearchMarkdown `%%CITE:N%%` Logik | `parseCitations()` | Ersetzen |
| TermPopup inline `<span>` Refs | `CitationRef` | Ersetzen |

### 3.4 Komponenten die bleiben

- `SourceCard.tsx` — fur Tooltip-Previews in SourcesCarousel
- `CardRefChip.jsx` — zeigt welche Karte die Nachricht betrifft (kein Citation)
- `SourcesCarousel.tsx` — visuelle Quellenubersicht, nutzt `CitationRef` fur Badges
- `SourceCountBadge.tsx` — aggregierte Quellenanzahl, Farben aus `type`-Feld
- `ResearchSourceBadge.jsx` — zeigt Tool-Herkunft (Perplexity/PubMed/Wikipedia)

---

## 4. CardPreview-Popup

Einfaches Popup fur Karten-Referenzen. Ersetzt das kaputte CardPreviewModal.

**Datei:** `shared/components/CardPreview.jsx`

**Props:**
```typescript
{
  front: string;       // Card front HTML
  back: string;        // Card back HTML
  deckName: string;    // Deck breadcrumb
  onClose: () => void;
}
```

**Verhalten:**
- Portal-Overlay in `document.body` (wie TermPopup — bewahrt)
- Zeigt: Deckname als Breadcrumb oben (`::` → `→`), darunter Front + Back untereinander
- Max 400px breit, max 500px hoch, scrollbar bei langem Inhalt
- Backdrop: Klick schließt, Escape schließt
- Einblendung: opacity + translateY Transition (0.15s)
- Design-System: `var(--ds-bg-deep)` Background, `var(--ds-border-subtle)` Border, `var(--ds-shadow-lg)` Shadow

**Kein Flip, keine Aktionen, kein "Im Editor offnen".**

**Web-Quellen:** Kein Popup. Klick auf grune Badge → `openUrl()` → System-Browser.

**Product-Code Wrapper:** `frontend/src/components/CitationPreview.jsx` — ladt Kartendaten via `bridge.getCardDetails(cardId)`, rendert `CardPreview`.

---

## 5. Definition-Agent

### 5.1 Registrierung

Voller Agent in `agents.py`:

```python
AgentDefinition(
    name='definition',
    label='Definition',
    description='Generiert Definitionen fur Fachbegriffe aus Karteninhalt und Web',
    channel='reviewer-term',
    uses_rag=False,           # Eigene KG-basierte Suche
    run_module='ai.definition',
    run_function='run_definition',
    tools=[],                 # Keine Tools — Retrieval + LLM intern
    context_sources=['card', 'memory'],
    is_default=False,
    enabled_key='definition_enabled',
    # ... restliche Felder analog zu anderen Agenten
)
```

### 5.2 Implementation

**Datei:** `ai/definition.py`

```python
def run_definition(situation, emit_step, memory, stream_callback,
                   citation_builder, **kwargs):
    """
    1. KG-Store: gecachte Definition prufen
    2. Embedding-Suche: Top-8 Karten zum Term finden
    3. Gemini Flash: Definition generieren mit [1], [2] Refs
    4. CitationBuilder: Karten als Citations registrieren
    5. KG-Store: Ergebnis cachen
    6. Return: {'text': definition, 'citations': [...]}
    """
```

### 5.3 Was sich andert

- `KGDefinitionThread` in `widget.py` wird durch normalen `_dispatch_agent('definition', ...)` ersetzt
- TermPopup empfangt Citations uber denselben Event-Pfad wie alle Agenten
- TermPopup rendert `CitationRef` statt eigene inline `<span>`
- Connected Terms und KG-Caching bleiben unverandert

---

## 6. Agent-spezifische RAG-Pipelines

### 6.1 Struktur

```
ai/
  retrieval/
    __init__.py
    tutor_retrieval.py       # Kopie der aktuellen Pipeline
    research_retrieval.py    # Kopie der aktuellen Pipeline
    definition_retrieval.py  # Kopie der aktuellen Pipeline
    prufer_retrieval.py      # Kopie der aktuellen Pipeline
    plusi_retrieval.py       # Kopie der aktuellen Pipeline
```

### 6.2 Vorgehen

1. Aktuelle Pipeline (`rag_pipeline.py` + `retrieval.py` + `rrf.py`) wird als eine Einheit pro Agent kopiert — jede Datei enthalt die komplette Retrieval-Logik.
2. Jede Kopie ist sofort lauffähig und identisch zum aktuellen System.
3. `rag_analyzer.py` (Router/Intent) bleibt vorerst shared — alle Agenten nutzen dieselbe `analyze_query()`. Wird spater geforkt wenn die Agenten divergieren.
4. Jeder Agent importiert seine eigene Pipeline:
   ```python
   # In tutor.py:
   from .retrieval.tutor_retrieval import retrieve

   # In definition.py:
   from .retrieval.definition_retrieval import retrieve
   ```
5. Ab diesem Zeitpunkt werden Pipelines unabhangig weiterentwickelt.

### 6.3 Spatere Differenzierung (nicht Teil dieser Implementierung)

| Agent | Richtung |
|-------|----------|
| Tutor | Karte + Kontext, enger Scope, semantische Nahe |
| Research | Breit, web-first, Karten als Referenz |
| Definition | KG-fokussiert, Term-Karten priorisiert |
| Prufer | Distraktoren, hohe Diversitat, ahnlich aber unterscheidbar |
| Plusi | Leichtgewichtig, optionale Kartensuche |

---

## 7. Alle Stellen wo Citations auftauchen

| Stelle | Komponente | Anderung |
|--------|-----------|----------|
| Tutor Chat | `ChatMessage.jsx` | Eigene Regex → `parseCitations()` + `CitationRef` |
| Research Sidebar | `SearchSidebar.jsx` | `ResearchMarkdown` → `parseCitations()` + `CitationRef` |
| Research Content | `ResearchContent.jsx` | `[[WEB:N]]`-Logik → `parseCitations()` + `CitationRef` |
| TermPopup | `TermPopup.jsx` | Inline `<span>` → `CitationRef` + `CardPreview` |
| MC Erklarungen | `MultipleChoiceCard.tsx` | Neu: Citations in Erklarungstexten (warum richtig/falsch) |
| Prufer Freitext | Prufer-Feedback-Rendering | Neu: Citations in Bewertung |
| Plusi Chat | Plusi-Chat-Rendering | Neu: Citations wenn Plusi Karten referenziert |
| SourcesCarousel | `SourcesCarousel.tsx` | Nutzt `CitationRef` fur Badges |

---

## 8. Stabilitatsgarantien

Die beiden gemeldeten Bugs und wie das Design sie verhindert:

### Bug 1: Falsche Karte angezeigt
**Ursache:** Backend vergibt Index, Frontend baut eigene Nummerierung → Indexverschiebung.
**Losung:** Backend vergibt Index via CitationBuilder. Frontend rendert nur. Keine eigene Nummerierung im Frontend. `citations[0].index === 1` — immer.

### Bug 2: Rohe Marker sichtbar (`[71538271]`, `[[web1]]`)
**Ursache:** Regex greift nicht oder kommt zu spat.
**Losung:** `parseCitations()` validiert jeden `[N]` Marker gegen das Citations-Array. Kein Match → normaler Text. Nie ein kaputter Badge. Nur noch ein Marker-Format: `[N]`.

### Zusatzliche Absicherungen
- CitationBuilder ist der einzige Weg Citations zu erzeugen — kein manuelles Dict-Building mehr.
- `parseCitations()` ist eine reine Funktion — testbar, deterministisch.
- Legacy-Formate (`[[CardID:N]]`, `[[WEB:N]]`) aus gespeicherten Nachrichten werden einmalig normalisiert.

---

## 9. Nicht im Scope

- Agent-spezifische Benchmark-Systeme (kommt nach Testnutzer-Feedback)
- RAG-Pipeline-Differenzierung pro Agent (kommt nach Fork)
- UI-Redesign des Preview-Popups (saubere Integration kommt spater)
- SourcesCarousel Redesign
- Production-Monitoring pro Agent
